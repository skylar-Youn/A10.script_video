"""
분석 관련 API 라우터
"""
import os
import json
import logging
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Body

from ..config import DOWNLOAD_DIR, SAVED_RESULTS_DIR
from ..services.audio_service import (
    analyze_audio_file, extract_audio_from_video, extract_waveform_data, audio_to_srt
)
from ..services.subtitle_service import (
    parse_srt_file, analyze_subtitle_timing, calculate_quality_score
)
from ..services.speaker_recognition import SpeakerRecognition
from ..services.audio_speaker_recognition import AudioSpeakerRecognition
from ..services.simple_audio_speaker_recognition import SimpleAudioSpeakerRecognition
from ..services.ai_reinterpretation import reinterpret_subtitles as ai_reinterpret_subtitles
from ai_shorts_maker.translator import (
    list_projects as translator_list_projects,
    create_project as translator_create_project,
    TranslatorProjectCreate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["analysis"])


# 저장 결과 디렉터리 준비
SAVED_RESULTS_DIR.mkdir(parents=True, exist_ok=True)


def _sanitize_saved_result_id(result_id: str) -> str:
    """보안상의 이유로 저장 결과 ID를 정제"""
    if not isinstance(result_id, str):
        raise ValueError("유효하지 않은 저장 ID")

    sanitized = ''.join(ch for ch in result_id if ch.isalnum() or ch in {'-', '_'})
    sanitized = sanitized.strip(' .')

    if not sanitized:
        raise ValueError("유효하지 않은 저장 ID")

    return sanitized


def _saved_result_path(result_id: str) -> Path:
    """저장 결과 파일 경로 반환"""
    sanitized_id = _sanitize_saved_result_id(result_id)
    return SAVED_RESULTS_DIR / f"{sanitized_id}.json"


def _load_saved_result(path: Path) -> dict:
    """저장된 JSON 결과를 로드"""
    with path.open('r', encoding='utf-8') as file:
        data = json.load(file)

    if not isinstance(data, dict):
        raise ValueError("저장된 결과 형식이 올바르지 않습니다")

    data.setdefault('id', path.stem)
    return data


def _persist_saved_result(path: Path, payload: dict) -> dict:
    """저장 결과를 파일로 기록"""
    if not isinstance(payload, dict):
        raise ValueError("저장할 데이터 형식이 올바르지 않습니다")

    payload = dict(payload)
    payload.setdefault('id', path.stem)
    payload.setdefault('saved_at', datetime.utcnow().isoformat())

    with path.open('w', encoding='utf-8') as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)

    return payload


@router.post("/analyze-waveform")
async def analyze_audio_waveform(request: dict = Body(...)):
    """오디오 파일의 파형 데이터를 분석하여 반환"""
    try:
        audio_path = request.get("audio_path")
        width = request.get("width", 800)  # 파형 너비 (픽셀)

        if not audio_path or not os.path.exists(audio_path):
            raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다")

        # FFmpeg를 사용하여 오디오 파형 데이터 추출
        waveform_data = extract_waveform_data(audio_path, width)

        return {
            "status": "success",
            "audio_path": audio_path,
            "waveform_data": waveform_data,
            "width": width,
            "sample_count": len(waveform_data)
        }

    except Exception as e:
        logger.exception(f"파형 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/audio")
async def analyze_audio(request: dict = Body(...)):
    """음성 파일 분석 - 무음 구간, 볼륨 등"""
    try:
        file_paths = request.get("files", [])
        options = request.get("options", {})

        silence_threshold = float(options.get("silence_threshold", 0.05))
        min_gap_duration = float(options.get("min_gap", 0.15))

        results = []

        for file_path in file_paths:
            try:
                if not os.path.exists(file_path):
                    results.append({
                        "file": file_path,
                        "status": "error",
                        "error": "파일을 찾을 수 없습니다"
                    })
                    continue

                # 비디오 파일인 경우 오디오 추출
                temp_audio_path = None
                if file_path.endswith(('.mp4', '.webm', '.avi', '.mov')):
                    temp_audio_path = extract_audio_from_video(file_path)
                    audio_path = temp_audio_path
                else:
                    audio_path = file_path

                analysis_result = analyze_audio_file(audio_path, silence_threshold, min_gap_duration)

                # 임시 파일 정리
                if temp_audio_path and os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

                results.append({
                    "file": file_path,
                    "status": "success",
                    "data": analysis_result
                })

            except Exception as e:
                logger.exception(f"오디오 분석 에러 - {file_path}: {e}")
                results.append({
                    "file": file_path,
                    "status": "error",
                    "error": str(e)
                })

        return {"results": results}

    except Exception as e:
        logger.exception(f"배치 오디오 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/subtitle")
async def analyze_subtitle(request: dict = Body(...)):
    """SRT 파일 분석 - 갭, 겹침, 타이밍"""
    try:
        file_paths = request.get("files", [])

        results = []

        for file_path in file_paths:
            try:
                if not os.path.exists(file_path):
                    results.append({
                        "file": file_path,
                        "status": "error",
                        "error": "파일을 찾을 수 없습니다"
                    })
                    continue

                if not file_path.endswith('.srt'):
                    results.append({
                        "file": file_path,
                        "status": "error",
                        "error": "SRT 파일이 아닙니다"
                    })
                    continue

                subtitles = parse_srt_file(file_path)
                analysis_result = analyze_subtitle_timing(subtitles)

                # 자막 구간 데이터를 data에 포함
                analysis_result["subtitles"] = subtitles

                results.append({
                    "file": file_path,
                    "status": "success",
                    "data": analysis_result
                })

            except Exception as e:
                logger.exception(f"자막 분석 에러 - {file_path}: {e}")
                results.append({
                    "file": file_path,
                    "status": "error",
                    "error": str(e)
                })

        return {"results": results}

    except Exception as e:
        logger.exception(f"배치 자막 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/stt")
async def speech_to_text(request: dict = Body(...)):
    """음성을 텍스트로 변환하여 SRT 생성"""
    try:
        file_paths = request.get("files", [])
        options = request.get("options", {})

        language = options.get("language", "ko-KR")
        segment_duration = int(options.get("segment_duration", 5))

        results = []

        for file_path in file_paths:
            try:
                if not os.path.exists(file_path):
                    results.append({
                        "file": file_path,
                        "status": "error",
                        "error": "파일을 찾을 수 없습니다"
                    })
                    continue

                # 비디오 파일인 경우 오디오 추출
                temp_audio_path = None
                if file_path.endswith(('.mp4', '.webm', '.avi', '.mov')):
                    temp_audio_path = extract_audio_from_video(file_path)
                    audio_path = temp_audio_path
                else:
                    audio_path = file_path

                srt_result = audio_to_srt(audio_path, language, segment_duration)

                # SRT 파일 저장
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                srt_path = DOWNLOAD_DIR / f"{base_name}_generated.srt"

                with open(srt_path, 'w', encoding='utf-8') as f:
                    f.write(srt_result["srt_content"])

                # 임시 파일 정리
                if temp_audio_path and os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

                results.append({
                    "file": file_path,
                    "status": "success",
                    "data": {
                        **srt_result,
                        "output_path": str(srt_path)
                    }
                })

            except Exception as e:
                logger.exception(f"STT 분석 에러 - {file_path}: {e}")
                results.append({
                    "file": file_path,
                    "status": "error",
                    "error": str(e)
                })

        return {"results": results}

    except Exception as e:
        logger.exception(f"배치 STT 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/compare")
async def compare_subtitles(request: dict = Body(...)):
    """두 SRT 파일 비교 분석"""
    try:
        original_file = request.get("original_file")
        generated_file = request.get("generated_file")

        if not original_file or not generated_file:
            raise HTTPException(status_code=400, detail="두 파일 경로가 모두 필요합니다")

        if not os.path.exists(original_file) or not os.path.exists(generated_file):
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        original_subtitles = parse_srt_file(original_file)
        generated_subtitles = parse_srt_file(generated_file)

        original_analysis = analyze_subtitle_timing(original_subtitles)
        generated_analysis = analyze_subtitle_timing(generated_subtitles)

        comparison_result = {
            "original": {
                "file": original_file,
                "analysis": original_analysis,
                "subtitles": original_subtitles[:10]
            },
            "generated": {
                "file": generated_file,
                "analysis": generated_analysis,
                "subtitles": generated_subtitles[:10]
            },
            "comparison": {
                "subtitle_count_diff": len(generated_subtitles) - len(original_subtitles),
                "duration_diff": generated_analysis["total_duration"] - original_analysis["total_duration"],
                "quality_score": calculate_quality_score(original_analysis, generated_analysis)
            }
        }

        return {
            "status": "success",
            "data": comparison_result
        }

    except Exception as e:
        logger.exception(f"자막 비교 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/speaker-recognition")
async def analyze_speakers(request: dict = Body(...)):
    """자막에서 화자 인식 및 분류"""
    try:
        file_path = request.get("file_path")

        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="SRT 파일을 찾을 수 없습니다")

        if not file_path.endswith('.srt'):
            raise HTTPException(status_code=400, detail="SRT 파일이 아닙니다")

        # SRT 파일 파싱
        subtitles = parse_srt_file(file_path)

        # 화자 인식 시스템 초기화
        speaker_recognition = SpeakerRecognition()

        # 화자 감지
        detection_result = speaker_recognition.detect_speakers_from_subtitles(subtitles)

        return {
            "status": "success",
            "file": file_path,
            "speakers": detection_result["speakers"],
            "total_speakers": detection_result["total_speakers"],
            "patterns": detection_result["patterns"]
        }

    except Exception as e:
        logger.exception(f"화자 인식 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/assign-speakers-to-tracks")
async def assign_speakers_to_tracks(request: dict = Body(...)):
    """선택된 인물의 대사를 특정 트랙에 자동 배치"""
    try:
        file_path = request.get("file_path")
        speaker_track_mapping = request.get("speaker_track_mapping", {})
        existing_speakers = request.get("existing_speakers")
        existing_subtitles = request.get("existing_subtitles")
        track_assignments = request.get("track_assignments", {})

        logger.info(f"🎭 트랙 배치 요청 받음")
        logger.info(f"  - file_path: {file_path}")
        logger.info(f"  - speaker_track_mapping: {speaker_track_mapping}")
        logger.info(f"  - track_assignments: {track_assignments}")
        logger.info(f"  - 기존 화자: {bool(existing_speakers)}")
        logger.info(f"  - 기존 자막: {bool(existing_subtitles) and len(existing_subtitles) if existing_subtitles else 0}")

        # 기존 화자 인식 결과 사용
        if existing_speakers and existing_subtitles:
            logger.info("🎭 기존 음성 기반 화자 인식 결과 사용")
            speakers = existing_speakers
            subtitles = existing_subtitles
        elif file_path and os.path.exists(file_path):
            logger.info("🎭 새로운 텍스트 기반 화자 인식 수행")
            # SRT 파일 파싱
            subtitles = parse_srt_file(file_path)

            # 화자 인식 시스템 초기화
            speaker_recognition = SpeakerRecognition()

            # 화자 감지
            detection_result = speaker_recognition.detect_speakers_from_subtitles(subtitles)
            speakers = detection_result["speakers"]
        else:
            raise HTTPException(status_code=400, detail="기존 화자/자막 데이터 또는 SRT 파일 경로가 필요합니다")

        # 사용자 지정 화자(화자4)는 자동 분류 대상에서 제외하기 위한 준비
        if speakers and '화자4' in speakers:
            logger.info('🎯 화자4는 사용자 지정용으로 통계만 초기화')
            speaker4_info = speakers['화자4']
            speaker4_info['subtitle_count'] = 0
            speaker4_info['subtitle_indices'] = []
            speaker4_info['total_duration'] = 0
            speaker4_info['total_chars'] = 0
            speaker4_info['avg_duration'] = 0
            speaker4_info['avg_chars'] = 0
            speaker4_info['sample_texts'] = []

        # 자막을 트랙별로 분류
        classified_subtitles = {
            "main": [],
            "translation": [],
            "description": [],
            "unassigned": []
        }

        # track_assignments가 있으면 인덱스 기반으로 분류
        if track_assignments:
            logger.info(f"🎯 인덱스 기반 트랙 할당 처리: {track_assignments}")

            # 모든 자막을 먼저 unassigned로 초기화
            for i, subtitle in enumerate(subtitles):
                subtitle['assigned_track'] = 'unassigned'
                subtitle['global_index'] = i
                classified_subtitles['unassigned'].append(subtitle)

            # track_assignments에 따라 자막을 해당 트랙으로 이동
            for track, indices in track_assignments.items():
                if track in classified_subtitles:
                    for idx in indices:
                        # unassigned에서 해당 자막 찾아서 이동
                        for i, subtitle in enumerate(classified_subtitles['unassigned']):
                            if subtitle.get('global_index') == idx:
                                # unassigned에서 제거하고 해당 트랙에 추가
                                subtitle['assigned_track'] = track
                                classified_subtitles['unassigned'].pop(i)
                                classified_subtitles[track].append(subtitle)
                                break
        else:
            # 기존 speaker_track_mapping 방식 사용
            if not speaker_track_mapping:
                # 기본 트랙 할당 (화자1 -> main, 화자2 -> translation, 화자3 -> description)
                # 화자4는 사용자용으로 자동 배치에서 제외하여 미분류로 유지
                speaker_track_mapping = {}
                speaker_names = list(speakers.keys())
                for i, speaker in enumerate(speaker_names):
                    if speaker == '화자4':
                        speaker_track_mapping[speaker] = "unassigned"
                        continue
                    elif i == 0:
                        speaker_track_mapping[speaker] = "main"
                    elif i == 1:
                        speaker_track_mapping[speaker] = "translation"
                    else:
                        speaker_track_mapping[speaker] = "description"

                # 미분류와 화자3도 설명 트랙으로 기본 설정
                speaker_track_mapping['미분류'] = "description"
                speaker_track_mapping['화자3'] = "description"

            # 사용자 설정 매핑에도 공통 규칙 적용
            if '미분류' not in speaker_track_mapping:
                speaker_track_mapping['미분류'] = "description"
            if '화자3' not in speaker_track_mapping:
                speaker_track_mapping['화자3'] = "description"
            # 화자4는 항상 사용자 지정용으로 유지
            speaker_track_mapping['화자4'] = "unassigned"

            logger.info(f"🎭 화자-트랙 매핑: {speaker_track_mapping}")

            # 자막을 화자별로 분류 - 기존 speaker_id 사용
            speaker_name_counts = {}
            for subtitle in subtitles:
                speaker_name = subtitle.get('speaker_name', '미분류')

                # 빈 문자열이나 None인 경우 미분류로 처리
                if not speaker_name or speaker_name.strip() == '':
                    speaker_name = '미분류'

                # 화자4는 사용자 지정용으로 자동 분류에서 제외
                if speaker_name == '화자4':
                    subtitle['original_speaker_name'] = '화자4'
                    subtitle['speaker_name'] = '미분류'
                    subtitle['assigned_track'] = 'unassigned'
                    classified_subtitles['unassigned'].append(subtitle)
                    speaker_name_counts['미분류'] = speaker_name_counts.get('미분류', 0) + 1
                    continue

                assigned_track = speaker_track_mapping.get(speaker_name, 'description')  # default를 description으로 변경
                subtitle['assigned_track'] = assigned_track
                subtitle['speaker_name'] = speaker_name  # 정규화된 speaker_name 다시 저장
                classified_subtitles[assigned_track].append(subtitle)

                # 화자 이름 통계
                speaker_name_counts[speaker_name] = speaker_name_counts.get(speaker_name, 0) + 1

            # 화자 이름 분포 로깅
            logger.info(f"🎭 화자 이름 분포:")
            for speaker, count in speaker_name_counts.items():
                mapped_track = speaker_track_mapping.get(speaker, 'unassigned')
                logger.info(f"  {speaker}: {count}개 → {mapped_track} 트랙")

        # Convert numpy types to native Python types for JSON serialization
        def convert_numpy_types(obj):
            """Convert numpy types to native Python types recursively"""
            if hasattr(obj, 'item'):  # numpy scalar
                return obj.item()
            elif hasattr(obj, 'tolist'):  # numpy array
                return obj.tolist()
            elif isinstance(obj, dict):
                return {k: convert_numpy_types(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_numpy_types(item) for item in obj]
            else:
                return obj

        # Convert all data to be JSON serializable
        speakers_serializable = convert_numpy_types(speakers)
        classified_subtitles_serializable = convert_numpy_types(classified_subtitles)

        # 자세한 track_counts 로깅
        track_counts = {}
        total_subtitles = 0
        for track, subs in classified_subtitles.items():
            count = len(subs)
            track_counts[track] = count
            total_subtitles += count
            logger.info(f"  {track} 트랙: {count}개 자막")

        logger.info(f"🎯 총 자막 수: {total_subtitles}개")
        logger.info(f"🎯 입력 자막 수: {len(subtitles)}개")

        return {
            "status": "success",
            "file": file_path,
            "speakers": speakers_serializable,
            "speaker_track_mapping": speaker_track_mapping,
            "classified_subtitles": classified_subtitles_serializable,
            "track_counts": track_counts
        }

    except Exception as e:
        logger.exception(f"화자 트랙 할당 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/audio-speaker-recognition")
async def analyze_audio_speakers(request: dict = Body(...)):
    """음성 파일에서 화자 인식 및 분류"""
    audio_path = None
    srt_path = None

    try:
        logger.info(f"🎵 음성 기반 화자 인식 API 호출 - 요청: {request}")

        audio_path = request.get("audio_path")
        srt_path = request.get("srt_path")  # 선택적
        n_speakers = request.get("n_speakers")  # 선택적

        logger.info(f"🎵 파일 경로 - 오디오: {audio_path}, SRT: {srt_path}")

        if not audio_path or not os.path.exists(audio_path):
            logger.error(f"❌ 오디오 파일을 찾을 수 없음: {audio_path}")
            return {
                "status": "error",
                "audio_file": audio_path,
                "srt_file": srt_path,
                "error": "오디오 파일을 찾을 수 없습니다",
                "speakers": {},
                "total_speakers": 0
            }

        # 자막 파일이 있으면 로드
        subtitles = None
        if srt_path and os.path.exists(srt_path) and srt_path.endswith('.srt'):
            logger.info(f"🎵 SRT 파일 로드 중: {srt_path}")
            subtitles = parse_srt_file(srt_path)
            logger.info(f"🎵 SRT 자막 개수: {len(subtitles) if subtitles else 0}")

        # 고급 음성 기반 화자 인식 시스템 초기화 (scikit-learn 사용)
        logger.info("🎵 AudioSpeakerRecognition 초기화 중...")
        audio_recognition = AudioSpeakerRecognition()

        # 화자 인식 수행
        logger.info("🎵 고급 화자 인식 수행 시작...")
        result = audio_recognition.recognize_speakers_from_audio(
            audio_path=audio_path,
            subtitles=subtitles,
            n_speakers=n_speakers
        )

        logger.info(f"🎵 화자 인식 결과: {result}")

        # Convert numpy types to native Python types for JSON serialization
        def convert_numpy_types(obj):
            """Convert numpy types to native Python types recursively"""
            if hasattr(obj, 'item'):  # numpy scalar
                return obj.item()
            elif hasattr(obj, 'tolist'):  # numpy array
                return obj.tolist()
            elif isinstance(obj, dict):
                return {k: convert_numpy_types(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_numpy_types(item) for item in obj]
            else:
                return obj

        # Convert result to be JSON serializable
        result_serializable = convert_numpy_types(result)

        return {
            "status": "success",
            "audio_file": audio_path,
            "srt_file": srt_path,
            **result_serializable
        }

    except Exception as e:
        logger.exception(f"❌ 음성 기반 화자 인식 치명적 에러: {e}")
        return {
            "status": "error",
            "audio_file": audio_path or "unknown",
            "srt_file": srt_path or "unknown",
            "error": str(e),
            "speakers": {},
            "total_speakers": 0
        }


@router.post("/analysis/extract-speaker-audio")
async def extract_speaker_audio_segments(request: dict = Body(...)):
    """화자별로 오디오 세그먼트 분리"""
    try:
        audio_path = request.get("audio_path")
        srt_path = request.get("srt_path")
        output_dir = request.get("output_dir")

        if not audio_path or not os.path.exists(audio_path):
            raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다")

        # 음성 기반 화자 인식 수행
        audio_recognition = AudioSpeakerRecognition()

        # 자막이 있으면 로드
        subtitles = None
        if srt_path and os.path.exists(srt_path):
            subtitles = parse_srt_file(srt_path)

        # 화자 인식
        recognition_result = audio_recognition.recognize_speakers_from_audio(
            audio_path=audio_path,
            subtitles=subtitles
        )

        if "error" in recognition_result:
            raise HTTPException(status_code=500, detail=recognition_result["error"])

        # 필요한 특성과 라벨 재추출 (실제 구현에서는 캐시 사용 권장)
        features = audio_recognition.extract_audio_features(audio_path)
        speaker_labels = audio_recognition.cluster_speakers(features)

        # 화자별 오디오 분리
        speaker_files = audio_recognition.extract_speaker_segments(
            audio_path=audio_path,
            speaker_labels=speaker_labels,
            features=features,
            output_dir=output_dir
        )

        return {
            "status": "success",
            "audio_file": audio_path,
            "speaker_files": speaker_files,
            "speakers": recognition_result.get("speakers", {}),
            "total_speakers": recognition_result.get("total_speakers", 0)
        }

    except Exception as e:
        logger.exception(f"화자별 오디오 분리 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/reinterpret")
async def reinterpret_subtitles(request: dict = Body(...)):
    """대사 및 설명 자막을 기반으로 새로운 내레이션 재해석 생성"""
    try:
        dialogues = request.get("dialogue_subtitles") or []
        descriptions = request.get("description_subtitles") or []

        if not dialogues and not descriptions:
            raise HTTPException(status_code=400, detail="재해석할 자막 데이터가 없습니다")

        metadata = request.get("metadata") or {}
        tone = metadata.get("tone")

        reinterpretation_result = ai_reinterpret_subtitles(dialogues, descriptions, tone=tone)

        response = {"status": "success", **reinterpretation_result}
        logger.info(
            "재해석 완료 - 대사 %d개, 설명 %d개",
            len(dialogues),
            len(descriptions),
        )
        return response

    except HTTPException:
        raise
    except ValueError as exc:
        logger.warning("재해석 입력 오류: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("재해석 처리 실패: %s", exc)
        detail_message = str(exc).strip() or "재해석 중 오류가 발생했습니다"
        raise HTTPException(status_code=500, detail=detail_message)


@router.get("/analysis/translator-projects")
def list_translator_projects():
    """번역 프로젝트 목록을 반환"""
    try:
        projects = translator_list_projects()
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("번역 프로젝트 목록 조회 실패: %s", exc)
        raise HTTPException(status_code=500, detail="번역 프로젝트 목록을 불러오지 못했습니다") from exc

    payload = []
    for project in projects:
        try:
            payload.append({
                "id": project.id,
                "base_name": project.base_name,
                "source_video": project.source_video,
                "source_subtitle": project.source_subtitle,
                "status": project.status,
                "target_lang": project.target_lang,
                "translation_mode": project.translation_mode,
                "tone_hint": project.tone_hint,
                "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            })
        except Exception as exc:  # pylint: disable=broad-except
            logger.warning("번역 프로젝트 직렬화 실패 (%s): %s", getattr(project, 'id', 'unknown'), exc)

    return {"projects": payload}


@router.post("/analysis/translator-projects", status_code=201)
def create_translator_project(payload: dict = Body(...)):
    """선택한 영상/자막으로 번역 프로젝트 생성"""
    source_video = payload.get("source_video")
    source_subtitle = payload.get("source_subtitle")
    target_lang = payload.get("target_lang") or "ja"
    translation_mode = payload.get("translation_mode") or "reinterpret"
    tone_hint = payload.get("tone_hint")

    if not source_video:
        raise HTTPException(status_code=400, detail="source_video 값이 필요합니다")

    try:
        request_model = TranslatorProjectCreate(
            source_video=source_video,
            source_subtitle=source_subtitle,
            target_lang=target_lang,
            translation_mode=translation_mode,
            tone_hint=tone_hint,
        )

        project = translator_create_project(request_model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("번역 프로젝트 생성 실패: %s", exc)
        raise HTTPException(status_code=500, detail="번역 프로젝트를 생성하지 못했습니다") from exc

    return {"project": project.model_dump(mode='json', exclude_none=False)}


@router.get("/analysis/saved-results")
async def list_saved_analysis_results():
    """저장된 분석 결과 목록 반환"""
    try:
        entries = []
        for path in sorted(SAVED_RESULTS_DIR.glob("*.json")):
            try:
                entry = _load_saved_result(path)
                entries.append(entry)
            except Exception as exc:  # pylint: disable=broad-except
                logger.warning("저장 결과 파일을 읽지 못했습니다: %s", path, exc_info=exc)

        entries.sort(key=lambda item: item.get("saved_at") or "", reverse=True)
        return {"results": entries}
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("저장 결과 목록 조회 실패: %s", exc)
        raise HTTPException(status_code=500, detail="저장된 결과를 불러오지 못했습니다") from exc


@router.get("/analysis/saved-results/{result_id}")
async def get_saved_analysis_result(result_id: str):
    """특정 ID의 저장된 분석 결과 반환"""
    try:
        path = _saved_result_path(result_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not path.exists():
        raise HTTPException(status_code=404, detail="저장된 결과를 찾을 수 없습니다")

    try:
        entry = _load_saved_result(path)
        return {"result": entry}
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("저장 결과 로드 실패 (%s): %s", result_id, exc)
        raise HTTPException(status_code=500, detail="저장된 결과를 불러오지 못했습니다") from exc


@router.post("/analysis/saved-results")
async def save_analysis_result(entry: dict = Body(...)):
    """분석 결과 저장(업데이트 포함)"""
    try:
        payload = dict(entry or {})
    except TypeError as exc:
        raise HTTPException(status_code=400, detail="저장할 데이터 형식이 올바르지 않습니다") from exc

    try:
        result_id = payload.get("id") or uuid4().hex
        path = _saved_result_path(result_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload["id"] = path.stem
    payload.setdefault("saved_at", datetime.utcnow().isoformat())

    try:
        persisted = _persist_saved_result(path, payload)
        return {"result": persisted}
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("저장 결과 기록 실패 (%s): %s", path, exc)
        raise HTTPException(status_code=500, detail="저장 결과를 기록하지 못했습니다") from exc


@router.put("/analysis/saved-results/{result_id}")
async def update_saved_analysis_result(result_id: str, updates: dict = Body(...)):
    """저장된 분석 결과 업데이트 (주로 이름 변경)"""
    try:
        path = _saved_result_path(result_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not path.exists():
        raise HTTPException(status_code=404, detail="저장된 결과를 찾을 수 없습니다")

    try:
        current = _load_saved_result(path)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("저장 결과 읽기 실패 (%s): %s", result_id, exc)
        raise HTTPException(status_code=500, detail="저장된 결과를 불러오지 못했습니다") from exc

    if not isinstance(updates, dict):
        raise HTTPException(status_code=400, detail="업데이트 형식이 올바르지 않습니다")

    allowed_fields = {
        "name",
        "analysisResults",
        "selectedFiles",
        "reinterpretationHistory",
        "metadata",
        "saved_at",
    }

    for key, value in updates.items():
        if key in allowed_fields:
            current[key] = value

    try:
        persisted = _persist_saved_result(path, current)
        return {"result": persisted}
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("저장 결과 업데이트 실패 (%s): %s", result_id, exc)
        raise HTTPException(status_code=500, detail="저장 결과를 업데이트하지 못했습니다") from exc


@router.delete("/analysis/saved-results/{result_id}")
async def delete_saved_analysis_result(result_id: str):
    """저장된 분석 결과 삭제"""
    try:
        path = _saved_result_path(result_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not path.exists():
        raise HTTPException(status_code=404, detail="저장된 결과를 찾을 수 없습니다")

    try:
        path.unlink()
        return {"status": "deleted", "id": path.stem}
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("저장 결과 삭제 실패 (%s): %s", result_id, exc)
        raise HTTPException(status_code=500, detail="저장 결과를 삭제하지 못했습니다") from exc


@router.delete("/analysis/saved-results")
async def clear_saved_analysis_results():
    """모든 저장된 분석 결과 삭제"""
    deleted = 0
    errors = []

    for path in SAVED_RESULTS_DIR.glob("*.json"):
        try:
            path.unlink()
            deleted += 1
        except Exception as exc:  # pylint: disable=broad-except
            logger.error("저장 결과 삭제 실패 (%s): %s", path, exc)
            errors.append(str(exc))

    if errors:
        raise HTTPException(status_code=500, detail="일부 저장 결과를 삭제하지 못했습니다")

    return {"status": "cleared", "deleted": deleted}
