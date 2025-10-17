/**
 * MP4 메타데이터 분석기 (MP4Box.js 활용)
 * 비디오 파일의 코덱, 해상도, 프레임레이트, 오디오 정보 등 추출
 */

class MP4Analyzer {
    constructor() {
        this.mp4boxfile = null;
        this.videoInfo = null;
    }

    /**
     * MP4 파일 분석
     */
    async analyze(file) {
        return new Promise((resolve, reject) => {
            if (typeof MP4Box === 'undefined') {
                reject(new Error('MP4Box.js 라이브러리가 로드되지 않았습니다.'));
                return;
            }

            // MP4Box 인스턴스 생성
            this.mp4boxfile = MP4Box.createFile();

            // 메타데이터 준비 완료 시 호출
            this.mp4boxfile.onReady = (info) => {
                this.videoInfo = info;
                const analysis = this.parseInfo(info);
                resolve(analysis);
            };

            // 에러 처리
            this.mp4boxfile.onError = (error) => {
                reject(new Error(`MP4 파싱 실패: ${error}`));
            };

            // 파일 읽기
            const reader = new FileReader();
            reader.onload = (e) => {
                const arrayBuffer = e.target.result;
                arrayBuffer.fileStart = 0;
                this.mp4boxfile.appendBuffer(arrayBuffer);
                this.mp4boxfile.flush();
            };

            reader.onerror = () => {
                reject(new Error('파일 읽기 실패'));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * URL에서 비디오 분석
     */
    async analyzeFromURL(url) {
        return new Promise(async (resolve, reject) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const blob = await response.blob();
                const analysis = await this.analyze(blob);
                resolve(analysis);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * MP4Box info를 사용자 친화적 형식으로 변환
     */
    parseInfo(info) {
        const analysis = {
            duration: info.duration / info.timescale, // 초 단위
            timescale: info.timescale,
            fragment_duration: info.fragment_duration,
            isFragmented: info.isFragmented,
            isProgressive: info.isProgressive,
            hasIOD: info.hasIOD,
            brands: info.brands || [],
            created: info.created ? new Date(info.created) : null,
            modified: info.modified ? new Date(info.modified) : null,
            tracks: []
        };

        // 트랙 정보 파싱
        if (info.tracks && info.tracks.length > 0) {
            info.tracks.forEach(track => {
                const trackInfo = {
                    id: track.id,
                    type: track.type,
                    codec: track.codec,
                    language: track.language || 'und',
                    duration: track.duration / track.timescale,
                    timescale: track.timescale,
                    bitrate: track.bitrate || 0,
                    nb_samples: track.nb_samples
                };

                // 비디오 트랙 전용 정보
                if (track.type === 'video') {
                    trackInfo.width = track.track_width || track.video?.width || 0;
                    trackInfo.height = track.track_height || track.video?.height || 0;
                    trackInfo.fps = this.calculateFPS(track);
                    trackInfo.profile = track.avc?.profile_string || 'Unknown';
                    trackInfo.level = track.avc?.level_string || 'Unknown';
                }

                // 오디오 트랙 전용 정보
                if (track.type === 'audio') {
                    trackInfo.sample_rate = track.audio?.sample_rate || 0;
                    trackInfo.channel_count = track.audio?.channel_count || 0;
                    trackInfo.sample_size = track.audio?.sample_size || 0;
                }

                analysis.tracks.push(trackInfo);
            });
        }

        return analysis;
    }

    /**
     * FPS 계산
     */
    calculateFPS(track) {
        if (track.nb_samples && track.duration && track.timescale) {
            return (track.nb_samples / (track.duration / track.timescale)).toFixed(2);
        }
        return 'Unknown';
    }

    /**
     * 비디오 트랙만 추출
     */
    getVideoTracks() {
        if (!this.videoInfo) return [];
        return this.videoInfo.tracks.filter(track => track.type === 'video');
    }

    /**
     * 오디오 트랙만 추출
     */
    getAudioTracks() {
        if (!this.videoInfo) return [];
        return this.videoInfo.tracks.filter(track => track.type === 'audio');
    }

    /**
     * 메인 비디오 트랙 정보
     */
    getMainVideoTrack() {
        const videoTracks = this.getVideoTracks();
        return videoTracks.length > 0 ? videoTracks[0] : null;
    }

    /**
     * HTML 리포트 생성
     */
    generateHTMLReport(analysis) {
        const videoTrack = analysis.tracks.find(t => t.type === 'video');
        const audioTrack = analysis.tracks.find(t => t.type === 'audio');

        let html = `
            <div class="mp4-analysis-report" style="font-family: monospace; font-size: 0.9rem;">
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">📹 기본 정보</h4>
                    <div style="color: #b0c4de;">
                        <div>재생 시간: <strong style="color: #4a9eff;">${this.formatDuration(analysis.duration)}</strong></div>
                        <div>Timescale: <strong>${analysis.timescale}</strong></div>
                        <div>Fragmented: <strong>${analysis.isFragmented ? '예' : '아니오'}</strong></div>
                        <div>Progressive: <strong>${analysis.isProgressive ? '예' : '아니오'}</strong></div>
                        <div>Brands: <strong>${analysis.brands.join(', ')}</strong></div>
        `;

        if (analysis.created) {
            html += `<div>생성일: <strong>${analysis.created.toLocaleString()}</strong></div>`;
        }

        html += `
                    </div>
                </div>
        `;

        // 비디오 트랙
        if (videoTrack) {
            html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">🎬 비디오 트랙</h4>
                    <div style="color: #b0c4de;">
                        <div>코덱: <strong style="color: #00ff88;">${videoTrack.codec}</strong></div>
                        <div>해상도: <strong style="color: #00ff88;">${videoTrack.width}x${videoTrack.height}</strong></div>
                        <div>FPS: <strong style="color: #00ff88;">${videoTrack.fps}</strong></div>
                        <div>비트레이트: <strong>${this.formatBitrate(videoTrack.bitrate)}</strong></div>
                        <div>프로필: <strong>${videoTrack.profile}</strong></div>
                        <div>레벨: <strong>${videoTrack.level}</strong></div>
                        <div>샘플 수: <strong>${videoTrack.nb_samples.toLocaleString()}</strong></div>
                    </div>
                </div>
            `;
        }

        // 오디오 트랙
        if (audioTrack) {
            html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">🎵 오디오 트랙</h4>
                    <div style="color: #b0c4de;">
                        <div>코덱: <strong style="color: #ffd400;">${audioTrack.codec}</strong></div>
                        <div>샘플 레이트: <strong style="color: #ffd400;">${audioTrack.sample_rate} Hz</strong></div>
                        <div>채널: <strong style="color: #ffd400;">${audioTrack.channel_count}</strong></div>
                        <div>샘플 크기: <strong>${audioTrack.sample_size} bits</strong></div>
                        <div>비트레이트: <strong>${this.formatBitrate(audioTrack.bitrate)}</strong></div>
                        <div>샘플 수: <strong>${audioTrack.nb_samples.toLocaleString()}</strong></div>
                    </div>
                </div>
            `;
        }

        // 트랙 목록
        html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">📊 전체 트랙 (${analysis.tracks.length}개)</h4>
                    <ul style="color: #b0c4de; margin: 0; padding-left: 20px;">
        `;

        analysis.tracks.forEach((track, index) => {
            const icon = track.type === 'video' ? '🎬' : track.type === 'audio' ? '🎵' : '📄';
            html += `<li>${icon} Track #${track.id}: ${track.type} (${track.codec}) - ${this.formatDuration(track.duration)}</li>`;
        });

        html += `
                    </ul>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * 재생 시간 포맷팅
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        } else {
            return `${minutes}:${String(secs).padStart(2, '0')}`;
        }
    }

    /**
     * 비트레이트 포맷팅
     */
    formatBitrate(bps) {
        if (bps === 0) return 'Unknown';

        const kbps = bps / 1000;
        const mbps = kbps / 1000;

        if (mbps >= 1) {
            return `${mbps.toFixed(2)} Mbps`;
        } else {
            return `${kbps.toFixed(2)} Kbps`;
        }
    }

    /**
     * 콘솔에 분석 결과 출력
     */
    printAnalysis(analysis) {
        console.group('📹 MP4 분석 결과');

        console.log('기본 정보:', {
            duration: this.formatDuration(analysis.duration),
            timescale: analysis.timescale,
            fragmented: analysis.isFragmented,
            progressive: analysis.isProgressive,
            brands: analysis.brands
        });

        analysis.tracks.forEach((track, index) => {
            console.group(`Track #${track.id}: ${track.type}`);
            console.log('코덱:', track.codec);
            console.log('재생 시간:', this.formatDuration(track.duration));

            if (track.type === 'video') {
                console.log('해상도:', `${track.width}x${track.height}`);
                console.log('FPS:', track.fps);
                console.log('프로필:', track.profile);
            } else if (track.type === 'audio') {
                console.log('샘플 레이트:', `${track.sample_rate} Hz`);
                console.log('채널:', track.channel_count);
            }

            console.groupEnd();
        });

        console.groupEnd();
    }

    /**
     * 분석 결과를 JSON으로 내보내기
     */
    exportJSON(analysis) {
        return JSON.stringify(analysis, null, 2);
    }

    /**
     * WebCodecs 호환성 체크
     */
    async checkWebCodecsSupport(analysis) {
        if (!('VideoDecoder' in window)) {
            return {
                supported: false,
                reason: 'WebCodecs API를 지원하지 않는 브라우저입니다.'
            };
        }

        const videoTrack = analysis.tracks.find(t => t.type === 'video');
        if (!videoTrack) {
            return {
                supported: false,
                reason: '비디오 트랙을 찾을 수 없습니다.'
            };
        }

        try {
            const config = {
                codec: videoTrack.codec,
                codedWidth: videoTrack.width,
                codedHeight: videoTrack.height
            };

            const support = await VideoDecoder.isConfigSupported(config);

            return {
                supported: support.supported,
                codec: videoTrack.codec,
                config: support.config,
                reason: support.supported ? null : 'WebCodecs가 해당 코덱을 지원하지 않습니다.'
            };
        } catch (error) {
            return {
                supported: false,
                reason: `WebCodecs 체크 실패: ${error.message}`
            };
        }
    }
}

// 전역 인스턴스 생성
window.MP4Analyzer = MP4Analyzer;
