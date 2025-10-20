/**
 * Canvas 기반 비디오 미리보기 시스템
 * FFmpeg와 동일한 좌표계 및 렌더링 방식으로 WYSIWYG 구현
 */

class CanvasVideoPreview {
    constructor(canvasId, videoId) {
        this.canvas = document.getElementById(canvasId);
        this.video = document.getElementById(videoId);
        this.ctx = this.canvas.getContext('2d');

        this.isPlaying = false;
        this.animationId = null;

        this.overlays = [];
        this.subtitles = [];
        this.currentSubtitle = null;

        // 타임라인 자막 데이터 (메인자막, 주자막, 부자막)
        this.timelineSubtitles = {
            main: [],           // 메인 자막
            translation: [],    // 주자막
            description: []     // 부자막
        };

        // 자막 활성화 상태
        this.subtitleEnabled = {
            main: true,
            translation: true,
            description: true
        };

        // 자막 스타일 설정 (위치와 스타일을 사용자 정의 가능)
        this.subtitleStyles = {
            main: {
                yPosition: 0.85,        // 화면 높이의 85% 위치
                fontSize: 50,
                color: '#ffffff',
                borderWidth: 3,
                borderColor: '#000000'
            },
            translation: {
                yPosition: 0.15,        // 화면 높이의 15% 위치
                fontSize: 50,
                color: '#ffe14d',       // 노란색
                borderWidth: 3,
                borderColor: '#000000'
            },
            description: {
                yPosition: 0.70,        // 화면 높이의 70% 위치
                fontSize: 50,
                color: '#ffffff',
                borderWidth: 2,
                borderColor: '#000000'
            }
        };

        // 폰트 로딩 완료 여부
        this.fontsLoaded = false;
        this.initializeFonts();

        // 일본어 감지 정규식 (히라가나, 가타카나, 확장, 반각, 한자)
        this.japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uFF61-\uFF9F\u4E00-\u9FAF]/;

        // 드래그 상태
        this.isDragging = false;
        this.dragTarget = null; // 'title', 'subtitle', 'main', 'translation', 'description'
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // 정적 효과 설정
        this.effects = {
            shadow: {
                enabled: false,
                blur: 4,
                opacity: 0.5,
                color: '#000000'
            },
            background: {
                enabled: false,
                color: '#000000',
                opacity: 0.7,
                padding: 20
            },
            globalOpacity: 1.0
        };

        // 동적 효과 설정
        this.animation = {
            type: 'none', // 'none', 'fadeIn', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'zoom', 'bounce', 'typing'
            duration: 0.5,
            delay: 0
        };

        // 애니메이션 상태 추적 (각 자막의 시작 시간 기록)
        this.subtitleAnimationStates = {
            main: { startTime: null, currentSubtitleId: null },
            translation: { startTime: null, currentSubtitleId: null },
            description: { startTime: null, currentSubtitleId: null }
        };

        this.setupEventListeners();
        this.setupDragListeners();
    }

    /**
     * 폰트 로딩 대기 (개선된 버전)
     */
    async initializeFonts() {
        try {
            console.log('🔄 폰트 로딩 시작...');

            // 1. 먼저 document.fonts.ready를 기다림 (타임아웃 없이)
            await document.fonts.ready;
            console.log('✅ document.fonts.ready 완료');

            // 2. 특정 폰트가 실제로 로드되었는지 확인
            const fontsToCheck = [
                { family: 'Noto Sans KR Local', weight: '400' },
                { family: 'Noto Sans JP Local', weight: '400' }
            ];

            const fontCheckPromises = fontsToCheck.map(({ family, weight }) => {
                return document.fonts.load(`${weight} 16px "${family}"`).then(() => {
                    console.log(`✅ ${family} 폰트 로드 확인됨`);
                    return true;
                }).catch(err => {
                    console.warn(`⚠️ ${family} 폰트 로드 실패:`, err);
                    return false;
                });
            });

            await Promise.all(fontCheckPromises);

            // 3. 로드된 폰트 목록 출력 (디버깅용)
            const loadedFonts = [];
            for (const font of document.fonts.values()) {
                loadedFonts.push(`${font.family} (${font.weight})`);
            }
            console.log('📋 로드된 폰트:', loadedFonts);

            this.fontsLoaded = true;
            console.log('✅ 모든 폰트 로딩 완료');

            // 폰트 로딩 후 재렌더링
            if (this.video.readyState >= 2) {
                this.render();
            }
        } catch (error) {
            console.error('❌ 폰트 로딩 중 오류:', error);
            this.fontsLoaded = true; // 오류가 있어도 계속 진행
        }
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 비디오 메타데이터 로드 시 캔버스 크기 설정
        this.video.addEventListener('loadedmetadata', () => {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            console.log(`📐 Canvas 크기 설정: ${this.canvas.width}x${this.canvas.height}`);
        });

        // 비디오 재생 시 캔버스 업데이트
        this.video.addEventListener('play', () => {
            this.startRendering();
        });

        this.video.addEventListener('pause', () => {
            this.stopRendering();
        });

        this.video.addEventListener('seeked', () => {
            this.render();
        });
    }

    /**
     * 렌더링 시작
     */
    startRendering() {
        this.isPlaying = true;
        this.renderLoop();
    }

    /**
     * 렌더링 중지
     */
    stopRendering() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * 렌더링 루프
     */
    renderLoop() {
        if (!this.isPlaying) return;

        this.render();
        this.animationId = requestAnimationFrame(() => this.renderLoop());
    }

    /**
     * 한 프레임 렌더링
     */
    render() {
        const { width, height } = this.canvas;

        // 1. 비디오 프레임 그리기
        this.ctx.drawImage(this.video, 0, 0, width, height);

        // 2. 검정 배경 오버레이 (상단/하단)
        this.renderBlackBars();

        // 3. 텍스트 오버레이 (제목, 부제목 등)
        this.renderTextOverlays();

        // 4. 자막 렌더링 (현재 시간 기준)
        this.renderSubtitles();
    }

    /**
     * 검정 배경 렌더링
     */
    renderBlackBars() {
        const { width, height } = this.canvas;

        // 상단 검정 배경
        if (this.topBlackBar && this.topBlackBar.enabled) {
            const barHeight = height * (this.topBlackBar.height / 100);
            this.ctx.fillStyle = `rgba(0, 0, 0, ${this.topBlackBar.opacity})`;
            this.ctx.fillRect(0, 0, width, barHeight);
        }

        // 하단 검정 배경
        if (this.bottomBlackBar && this.bottomBlackBar.enabled) {
            const barHeight = height * (this.bottomBlackBar.height / 100);
            const y = height - barHeight;
            this.ctx.fillStyle = `rgba(0, 0, 0, ${this.bottomBlackBar.opacity})`;
            this.ctx.fillRect(0, y, width, barHeight);
        }

        // ⬛ 검정 박스 가리기 (사용자 지정 영역)
        const blackBoxEnable = document.getElementById('black-box-enable');
        if (blackBoxEnable && blackBoxEnable.checked) {
            const x1Percent = parseFloat(document.getElementById('black-box-x1')?.value || 0);
            const y1Percent = parseFloat(document.getElementById('black-box-y1')?.value || 0);
            const x2Percent = parseFloat(document.getElementById('black-box-x2')?.value || 100);
            const y2Percent = parseFloat(document.getElementById('black-box-y2')?.value || 20);
            const opacity = parseFloat(document.getElementById('black-box-opacity')?.value || 100) / 100;

            const x1 = width * (x1Percent / 100);
            const y1 = height * (y1Percent / 100);
            const x2 = width * (x2Percent / 100);
            const y2 = height * (y2Percent / 100);

            const boxWidth = x2 - x1;
            const boxHeight = y2 - y1;

            this.ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
            this.ctx.fillRect(x1, y1, boxWidth, boxHeight);
        }
    }

    /**
     * 텍스트 오버레이 렌더링 (FFmpeg drawtext와 동일한 방식)
     */
    renderTextOverlays() {
        this.overlays.forEach(overlay => {
            this.renderText(overlay);
        });
    }

    /**
     * 단일 텍스트 렌더링 (효과 적용)
     */
    renderText(overlay, animationProgress = null) {
        const { width, height } = this.canvas;

        // FFmpeg와 동일한 좌표계 사용
        let x = overlay.x || width / 2;
        let y = overlay.y || height / 2;
        let text = overlay.text || '';
        const fontSize = overlay.fontSize || 48;

        // 텍스트 언어 감지 후 폰트 선택 (일본어 우선 처리)
        const fontFamily = overlay.fontFamily || this.getFontFamilyForText(text);

        const color = overlay.color || '#ffffff';
        // 외곽선을 더 두껍게 (가독성 향상)
        const borderWidth = overlay.borderWidth !== undefined ? overlay.borderWidth : Math.max(4, Math.floor(fontSize * 0.1));
        const borderColor = overlay.borderColor || '#000000';

        // 배경 설정 (overlay 자체 배경 또는 전역 효과 배경)
        const hasOverlayBackground = overlay.backgroundColor || overlay.showBackground;
        const hasEffectBackground = this.effects.background.enabled && overlay.isSubtitle;
        const hasBackground = hasOverlayBackground || hasEffectBackground;

        const backgroundColor = hasEffectBackground
            ? this.hexToRgba(this.effects.background.color, this.effects.background.opacity)
            : (overlay.backgroundColor || 'rgba(0, 0, 0, 0.5)');

        const padding = hasEffectBackground
            ? this.effects.background.padding
            : (overlay.padding || fontSize * 0.3);

        // 폰트 설정
        this.ctx.font = `bold ${fontSize}px ${fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 텍스트 크기 측정
        const metrics = this.ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize * 1.2; // 대략적인 높이

        // 애니메이션 효과 적용
        let opacity = this.effects.globalOpacity;
        let scale = 1.0;
        let offsetX = 0;
        let offsetY = 0;

        if (animationProgress !== null && animationProgress < 1.0) {
            const easeProgress = this.easeOutCubic(animationProgress);

            switch (this.animation.type) {
                case 'fadeIn':
                    opacity *= easeProgress;
                    break;
                case 'slideUp':
                    offsetY = (1 - easeProgress) * 100;
                    opacity *= easeProgress;
                    break;
                case 'slideDown':
                    offsetY = -(1 - easeProgress) * 100;
                    opacity *= easeProgress;
                    break;
                case 'slideLeft':
                    offsetX = (1 - easeProgress) * 200;
                    opacity *= easeProgress;
                    break;
                case 'slideRight':
                    offsetX = -(1 - easeProgress) * 200;
                    opacity *= easeProgress;
                    break;
                case 'zoom':
                    scale = 0.5 + (easeProgress * 0.5);
                    opacity *= easeProgress;
                    break;
                case 'bounce':
                    const bounce = Math.abs(Math.sin(easeProgress * Math.PI));
                    offsetY = -bounce * 30;
                    break;
                case 'typing':
                    // 타이핑 효과: 글자를 점진적으로 표시
                    const visibleChars = Math.floor(text.length * easeProgress);
                    text = text.substring(0, visibleChars);
                    break;
            }
        }

        // 위치 조정
        x += offsetX;
        y += offsetY;

        // 전역 투명도와 애니메이션 투명도 적용
        this.ctx.globalAlpha = opacity;

        // 그림자 효과
        if (this.effects.shadow.enabled && overlay.isSubtitle) {
            this.ctx.shadowBlur = this.effects.shadow.blur;
            this.ctx.shadowColor = this.hexToRgba(this.effects.shadow.color, this.effects.shadow.opacity);
            this.ctx.shadowOffsetX = 2;
            this.ctx.shadowOffsetY = 2;
        }

        // 스케일 적용 (zoom 효과)
        if (scale !== 1.0) {
            this.ctx.save();
            this.ctx.translate(x, y);
            this.ctx.scale(scale, scale);
            this.ctx.translate(-x, -y);
        }

        // 배경 박스 그리기 (필요한 경우)
        if (hasBackground && text.length > 0) {
            const boxX = x - textWidth / 2 - padding;
            const boxY = y - textHeight / 2 - padding;
            const boxWidth = textWidth + padding * 2;
            const boxHeight = textHeight + padding * 2;

            this.ctx.fillStyle = backgroundColor;
            this.ctx.shadowBlur = 0; // 배경에는 그림자 제거
            this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

            // 그림자 복원
            if (this.effects.shadow.enabled && overlay.isSubtitle) {
                this.ctx.shadowBlur = this.effects.shadow.blur;
            }
        }

        // 텍스트 외곽선 (FFmpeg의 borderw와 동기화)
        if (borderWidth > 0) {
            this.ctx.strokeStyle = borderColor;
            // ⚠️ FFmpeg와 동기화: 외곽선 두께를 FFmpeg와 동일하게 설정
            this.ctx.lineWidth = borderWidth; // 2배 제거 → FFmpeg와 동일
            this.ctx.lineJoin = 'round'; // 모서리를 둥글게
            this.ctx.miterLimit = 2;
            this.ctx.strokeText(text, x, y);
        }

        // 텍스트 채우기
        this.ctx.fillStyle = color;
        this.ctx.fillText(text, x, y);

        // 스케일 복원
        if (scale !== 1.0) {
            this.ctx.restore();
        }

        // 그림자 효과 제거
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;

        // 투명도 복원
        this.ctx.globalAlpha = 1.0;
    }

    /**
     * Ease out cubic 함수 (부드러운 애니메이션)
     */
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    /**
     * Hex 색상을 RGBA로 변환
     */
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * 자막 렌더링 (현재 시간에 맞는 자막 표시, 애니메이션 적용)
     */
    renderSubtitles() {
        const currentTime = this.video.currentTime;
        const { width, height } = this.canvas;

        // 1. 메인 자막 렌더링 (하단 중앙)
        if (this.subtitleEnabled.main && this.timelineSubtitles.main.length > 0) {
            const mainSubtitle = this.findSubtitleAtTime(this.timelineSubtitles.main, currentTime);
            if (mainSubtitle) {
                const animProgress = this.getAnimationProgress('main', mainSubtitle, currentTime);
                const style = this.subtitleStyles.main;
                this.renderText({
                    x: width / 2,
                    y: height * style.yPosition,
                    text: mainSubtitle.text,
                    fontSize: style.fontSize,
                    // fontFamily는 renderText에서 자동 감지되도록 생략
                    color: style.color,
                    borderWidth: style.borderWidth,
                    borderColor: style.borderColor,
                    isSubtitle: true
                }, animProgress);
            } else {
                // 자막이 없으면 애니메이션 상태 초기화
                this.subtitleAnimationStates.main.currentSubtitleId = null;
            }
        }

        // 2. 주자막 렌더링 (상단 중앙)
        if (this.subtitleEnabled.translation && this.timelineSubtitles.translation.length > 0) {
            const translationSubtitle = this.findSubtitleAtTime(this.timelineSubtitles.translation, currentTime);
            if (translationSubtitle) {
                const animProgress = this.getAnimationProgress('translation', translationSubtitle, currentTime);
                const style = this.subtitleStyles.translation;
                this.renderText({
                    x: width / 2,
                    y: height * style.yPosition,
                    text: translationSubtitle.text,
                    fontSize: style.fontSize,
                    // fontFamily는 renderText에서 자동 감지되도록 생략
                    color: style.color,
                    borderWidth: style.borderWidth,
                    borderColor: style.borderColor,
                    isSubtitle: true
                }, animProgress);
            } else {
                this.subtitleAnimationStates.translation.currentSubtitleId = null;
            }
        }

        // 3. 부자막 렌더링 (중앙 하단)
        if (this.subtitleEnabled.description && this.timelineSubtitles.description.length > 0) {
            const descriptionSubtitle = this.findSubtitleAtTime(this.timelineSubtitles.description, currentTime);
            if (descriptionSubtitle) {
                const animProgress = this.getAnimationProgress('description', descriptionSubtitle, currentTime);
                const style = this.subtitleStyles.description;
                this.renderText({
                    x: width / 2,
                    y: height * style.yPosition,
                    text: descriptionSubtitle.text,
                    fontSize: style.fontSize,
                    // fontFamily는 renderText에서 자동 감지되도록 생략
                    color: style.color,
                    borderWidth: style.borderWidth,
                    borderColor: style.borderColor,
                    isSubtitle: true
                }, animProgress);
            } else {
                this.subtitleAnimationStates.description.currentSubtitleId = null;
            }
        }

        // 4. 기존 자막 렌더링 (하위 호환성 유지)
        const activeSubtitle = this.subtitles.find(sub => {
            return currentTime >= sub.startTime && currentTime <= sub.endTime;
        });

        if (activeSubtitle) {
            this.currentSubtitle = activeSubtitle;
            this.renderText({
                x: this.canvas.width / 2,
                y: this.canvas.height * 0.9, // 하단 90% 위치
                text: activeSubtitle.text,
                fontSize: activeSubtitle.fontSize || 32,
                // fontFamily는 renderText에서 자동 감지되도록 생략
                color: '#ffffff',
                borderWidth: 2,
                borderColor: '#000000'
            });
        } else {
            this.currentSubtitle = null;
        }
    }

    /**
     * 현재 시간에 해당하는 자막 찾기
     */
    findSubtitleAtTime(subtitles, currentTime) {
        return subtitles.find(sub => {
            return currentTime >= sub.startTime && currentTime <= sub.endTime;
        });
    }

    /**
     * 애니메이션 진행도 계산 (0~1, 1이면 완료)
     */
    getAnimationProgress(trackType, subtitle, currentTime) {
        if (this.animation.type === 'none') {
            return null; // 애니메이션 없음
        }

        const state = this.subtitleAnimationStates[trackType];
        const subtitleId = `${subtitle.startTime}-${subtitle.text}`;

        // 새로운 자막인 경우 시작 시간 기록
        if (state.currentSubtitleId !== subtitleId) {
            state.currentSubtitleId = subtitleId;
            state.startTime = subtitle.startTime;
        }

        // 애니메이션 지연 적용
        const effectiveStartTime = state.startTime + this.animation.delay;

        // 현재 시간이 지연 시간 이전이면 애니메이션 안 함
        if (currentTime < effectiveStartTime) {
            return 0;
        }

        // 애니메이션 진행도 계산
        const elapsed = currentTime - effectiveStartTime;
        const progress = Math.min(elapsed / this.animation.duration, 1.0);

        return progress;
    }

    /**
     * 검정 배경 설정
     */
    setBlackBars(topBar, bottomBar) {
        this.topBlackBar = topBar;
        this.bottomBlackBar = bottomBar;
        this.render();
    }

    /**
     * 텍스트 내용에 맞춰 폰트 패밀리를 반환한다.
     */
    getFontFamilyForText(text = '') {
        if (this.japaneseRegex.test(text)) {
            return '"Noto Sans JP Local", "Noto Sans CJK JP", "Noto Sans KR Local", "맑은 고딕", Arial, sans-serif';
        }
        return '"Noto Sans KR Local", "Noto Sans JP Local", "맑은 고딕", Arial, sans-serif';
    }

    /**
     * 텍스트 오버레이 추가
     */
    addOverlay(overlay) {
        const resolvedOverlay = {
            ...overlay,
            fontFamily: overlay.fontFamily || this.getFontFamilyForText(overlay.text)
        };
        this.overlays.push(resolvedOverlay);
        this.render();
    }

    /**
     * 모든 오버레이 제거
     */
    clearOverlays() {
        this.overlays = [];
        this.render();
    }

    /**
     * 자막 로드 (SRT 파싱)
     */
    async loadSubtitles(srtFile) {
        const text = await srtFile.text();
        this.subtitles = this.parseSRT(text);
        console.log(`📝 자막 로드 완료: ${this.subtitles.length}개`);
    }

    /**
     * SRT 파싱
     */
    parseSRT(srtText) {
        const subtitles = [];
        const blocks = srtText.trim().split(/\n\s*\n/);

        blocks.forEach(block => {
            const lines = block.split('\n');
            if (lines.length < 3) return;

            const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
            if (!timeMatch) return;

            const startTime = this.timeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
            const endTime = this.timeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
            const text = lines.slice(2).join('\n');

            subtitles.push({ startTime, endTime, text });
        });

        return subtitles;
    }

    /**
     * 시간 문자열을 초로 변환
     */
    timeToSeconds(hours, minutes, seconds, milliseconds) {
        return parseInt(hours) * 3600 +
               parseInt(minutes) * 60 +
               parseInt(seconds) +
               parseInt(milliseconds) / 1000;
    }

    /**
     * 비디오 소스 변경
     */
    async loadVideo(videoSrc) {
        return new Promise((resolve, reject) => {
            this.video.src = videoSrc;
            this.video.addEventListener('loadeddata', () => {
                this.render();
                resolve();
            }, { once: true });
            this.video.addEventListener('error', reject, { once: true });
        });
    }

    /**
     * 특정 프레임으로 이동 (초 단위)
     */
    seekToTime(time) {
        this.video.currentTime = time;
    }

    /**
     * 프레임 캡처 (Blob 반환)
     */
    captureFrame() {
        return new Promise((resolve) => {
            this.canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    }

    /**
     * 프레임 캡처 (Data URL 반환)
     */
    captureFrameAsDataURL() {
        return this.canvas.toDataURL('image/png');
    }

    /**
     * 캔버스 내보내기 (다운로드)
     */
    downloadFrame(filename = 'frame.png') {
        const dataURL = this.captureFrameAsDataURL();
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataURL;
        link.click();
    }

    /**
     * 타임라인 자막 설정 (메인자막, 주자막, 부자막)
     */
    setTimelineSubtitles(trackType, subtitles) {
        if (this.timelineSubtitles.hasOwnProperty(trackType)) {
            this.timelineSubtitles[trackType] = subtitles;
            console.log(`📝 ${trackType} 자막이 Canvas에 로드되었습니다: ${subtitles.length}개`);
            this.render();
        } else {
            console.error(`❌ 알 수 없는 트랙 타입: ${trackType}`);
        }
    }

    /**
     * 자막 활성화/비활성화
     */
    setSubtitleEnabled(trackType, enabled) {
        if (this.subtitleEnabled.hasOwnProperty(trackType)) {
            this.subtitleEnabled[trackType] = enabled;
            console.log(`${enabled ? '✅' : '❌'} ${trackType} 자막 ${enabled ? '활성화' : '비활성화'}`);
            this.render();
        }
    }

    /**
     * 모든 타임라인 자막 업데이트 (한 번에)
     */
    updateAllTimelineSubtitles(loadedSubtitles) {
        if (loadedSubtitles.main) {
            this.timelineSubtitles.main = loadedSubtitles.main;
        }
        if (loadedSubtitles.translation) {
            this.timelineSubtitles.translation = loadedSubtitles.translation;
        }
        if (loadedSubtitles.description) {
            this.timelineSubtitles.description = loadedSubtitles.description;
        }
        console.log('✅ 모든 타임라인 자막이 Canvas에 업데이트되었습니다');
        this.render();
    }

    /**
     * 타임라인 자막 체크박스 상태와 동기화
     */
    syncWithTimelineCheckboxes() {
        const mainEnabled = document.getElementById('track-main-subtitle-enable')?.checked ?? true;
        const translationEnabled = document.getElementById('track-translation-subtitle-enable')?.checked ?? true;
        const descriptionEnabled = document.getElementById('track-description-subtitle-enable')?.checked ?? true;

        this.subtitleEnabled.main = mainEnabled;
        this.subtitleEnabled.translation = translationEnabled;
        this.subtitleEnabled.description = descriptionEnabled;

        this.render();
    }

    /**
     * 자막 스타일 업데이트
     */
    updateSubtitleStyle(trackType, styleOptions) {
        if (this.subtitleStyles.hasOwnProperty(trackType)) {
            this.subtitleStyles[trackType] = {
                ...this.subtitleStyles[trackType],
                ...styleOptions
            };
            console.log(`✅ ${trackType} 자막 스타일이 업데이트되었습니다:`, styleOptions);
            this.render();
        } else {
            console.error(`❌ 알 수 없는 트랙 타입: ${trackType}`);
        }
    }

    /**
     * 자막 위치만 업데이트 (Y 위치를 0~1 사이 비율로)
     */
    updateSubtitlePosition(trackType, yPosition) {
        if (this.subtitleStyles.hasOwnProperty(trackType)) {
            this.subtitleStyles[trackType].yPosition = yPosition;
            console.log(`✅ ${trackType} 자막 위치가 ${(yPosition * 100).toFixed(0)}%로 변경되었습니다`);
            this.render();
        }
    }

    /**
     * 드래그 이벤트 리스너 설정
     */
    setupDragListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));

        // 커서 스타일 변경
        this.canvas.style.cursor = 'default';
    }

    /**
     * 마우스 다운 이벤트 (드래그 시작)
     */
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // 현재 시간의 자막 찾기
        const currentTime = this.video.currentTime;

        // 자막 영역 충돌 검사 (역순으로 - 위에 있는 것부터)
        const hitTargets = [];

        // 타임라인 자막 체크
        if (this.subtitleEnabled.translation && this.timelineSubtitles.translation.length > 0) {
            const subtitle = this.findSubtitleAtTime(this.timelineSubtitles.translation, currentTime);
            if (subtitle) {
                const style = this.subtitleStyles.translation;
                const targetY = this.canvas.height * style.yPosition;
                if (this.isPointInTextArea(x, y, subtitle.text, this.canvas.width / 2, targetY, style.fontSize)) {
                    hitTargets.push({ type: 'translation', y: targetY });
                }
            }
        }

        if (this.subtitleEnabled.description && this.timelineSubtitles.description.length > 0) {
            const subtitle = this.findSubtitleAtTime(this.timelineSubtitles.description, currentTime);
            if (subtitle) {
                const style = this.subtitleStyles.description;
                const targetY = this.canvas.height * style.yPosition;
                if (this.isPointInTextArea(x, y, subtitle.text, this.canvas.width / 2, targetY, style.fontSize)) {
                    hitTargets.push({ type: 'description', y: targetY });
                }
            }
        }

        if (this.subtitleEnabled.main && this.timelineSubtitles.main.length > 0) {
            const subtitle = this.findSubtitleAtTime(this.timelineSubtitles.main, currentTime);
            if (subtitle) {
                const style = this.subtitleStyles.main;
                const targetY = this.canvas.height * style.yPosition;
                if (this.isPointInTextArea(x, y, subtitle.text, this.canvas.width / 2, targetY, style.fontSize)) {
                    hitTargets.push({ type: 'main', y: targetY });
                }
            }
        }

        // 텍스트 오버레이 체크
        this.overlays.forEach((overlay, index) => {
            const overlayX = overlay.x || this.canvas.width / 2;
            const overlayY = overlay.y || this.canvas.height / 2;
            const fontSize = overlay.fontSize || 48;
            if (this.isPointInTextArea(x, y, overlay.text, overlayX, overlayY, fontSize)) {
                hitTargets.push({ type: 'overlay', index: index, y: overlayY });
            }
        });

        // 가장 위에 있는 요소 선택
        if (hitTargets.length > 0) {
            const target = hitTargets[0];
            this.isDragging = true;
            this.dragTarget = target;
            this.dragStartX = x;
            this.dragStartY = y;
            this.dragOffsetY = y - target.y;
            this.canvas.style.cursor = 'grabbing';
            console.log(`🖱️ 드래그 시작: ${target.type}`);
        }
    }

    /**
     * 마우스 이동 이벤트 (드래그 중)
     */
    handleMouseMove(e) {
        if (!this.isDragging) {
            // 호버 감지 - 커서 변경
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            const currentTime = this.video.currentTime;
            let isOverText = false;

            // 자막 영역 체크
            ['translation', 'description', 'main'].forEach(type => {
                if (this.subtitleEnabled[type] && this.timelineSubtitles[type].length > 0) {
                    const subtitle = this.findSubtitleAtTime(this.timelineSubtitles[type], currentTime);
                    if (subtitle) {
                        const style = this.subtitleStyles[type];
                        const targetY = this.canvas.height * style.yPosition;
                        if (this.isPointInTextArea(x, y, subtitle.text, this.canvas.width / 2, targetY, style.fontSize)) {
                            isOverText = true;
                        }
                    }
                }
            });

            // 오버레이 체크
            this.overlays.forEach(overlay => {
                const overlayX = overlay.x || this.canvas.width / 2;
                const overlayY = overlay.y || this.canvas.height / 2;
                const fontSize = overlay.fontSize || 48;
                if (this.isPointInTextArea(x, y, overlay.text, overlayX, overlayY, fontSize)) {
                    isOverText = true;
                }
            });

            this.canvas.style.cursor = isOverText ? 'grab' : 'default';
            return;
        }

        // 드래그 중
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const newY = y - this.dragOffsetY;
        const yPosition = newY / this.canvas.height;

        // 0~1 사이로 제한
        const clampedY = Math.max(0, Math.min(1, yPosition));

        // 위치 업데이트
        if (this.dragTarget.type === 'overlay') {
            this.overlays[this.dragTarget.index].y = newY;
        } else if (['main', 'translation', 'description'].includes(this.dragTarget.type)) {
            this.subtitleStyles[this.dragTarget.type].yPosition = clampedY;
        }

        this.render();
    }

    /**
     * 마우스 업 이벤트 (드래그 종료)
     */
    handleMouseUp(e) {
        if (this.isDragging) {
            console.log(`✅ 드래그 완료: ${this.dragTarget.type}`);

            // 위치 및 크기 정보 출력
            if (['main', 'translation', 'description'].includes(this.dragTarget.type)) {
                const style = this.subtitleStyles[this.dragTarget.type];
                const yPos = style.yPosition;
                const fontSize = style.fontSize || '?';
                console.log(`📍 ${this.dragTarget.type} 자막 - 위치: ${(yPos * 100).toFixed(1)}%, 크기: ${fontSize}px`);
            }
        }

        this.isDragging = false;
        this.dragTarget = null;
        this.canvas.style.cursor = 'default';
    }

    /**
     * 점이 텍스트 영역 안에 있는지 확인
     */
    isPointInTextArea(pointX, pointY, text, textX, textY, fontSize) {
        // 언어별 폰트 자동 선택
        this.ctx.font = `bold ${fontSize}px ${this.getFontFamilyForText(text)}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const metrics = this.ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize * 1.2;

        const left = textX - textWidth / 2;
        const right = textX + textWidth / 2;
        const top = textY - textHeight / 2;
        const bottom = textY + textHeight / 2;

        return pointX >= left && pointX <= right && pointY >= top && pointY <= bottom;
    }

    // ==================== 효과 설정 메서드 ====================

    /**
     * 효과 활성화/비활성화
     */
    setEffectEnabled(effectType, enabled) {
        if (effectType === 'shadow') {
            this.effects.shadow.enabled = enabled;
        } else if (effectType === 'background') {
            this.effects.background.enabled = enabled;
        }
        this.render();
    }

    /**
     * 그림자 효과 업데이트
     */
    updateShadowEffect(property, value) {
        if (this.effects.shadow.hasOwnProperty(property)) {
            this.effects.shadow[property] = value;
            this.render();
        }
    }

    /**
     * 배경 효과 업데이트
     */
    updateBackgroundEffect(property, value) {
        if (this.effects.background.hasOwnProperty(property)) {
            this.effects.background[property] = value;
            this.render();
        }
    }

    /**
     * 전역 투명도 설정
     */
    setGlobalOpacity(opacity) {
        this.effects.globalOpacity = opacity;
        this.render();
    }

    /**
     * 애니메이션 타입 설정
     */
    setAnimationType(type) {
        this.animation.type = type;
        // 애니메이션 타입이 변경되면 모든 자막의 애니메이션 상태 초기화
        Object.keys(this.subtitleAnimationStates).forEach(key => {
            this.subtitleAnimationStates[key].currentSubtitleId = null;
            this.subtitleAnimationStates[key].startTime = null;
        });
        this.render();
    }

    /**
     * 애니메이션 속도 설정
     */
    setAnimationDuration(duration) {
        this.animation.duration = duration;
        this.render();
    }

    /**
     * 애니메이션 지연 설정
     */
    setAnimationDelay(delay) {
        this.animation.delay = delay;
        this.render();
    }
}

// 전역 함수로 사용 가능하게 export
window.CanvasVideoPreview = CanvasVideoPreview;
