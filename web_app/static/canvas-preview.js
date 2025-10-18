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

        // 폰트 로딩 완료 여부
        this.fontsLoaded = false;
        this.initializeFonts();

        this.setupEventListeners();
    }

    /**
     * 폰트 로딩 대기
     */
    async initializeFonts() {
        try {
            // HTML에서 정의한 폰트들이 로드될 때까지 대기
            await Promise.race([
                document.fonts.ready,
                new Promise(resolve => setTimeout(resolve, 3000)) // 3초 타임아웃
            ]);
            this.fontsLoaded = true;
            console.log('✅ 폰트 로딩 완료');

            // 폰트 로딩 후 재렌더링
            if (this.video.readyState >= 2) {
                this.render();
            }
        } catch (error) {
            console.warn('⚠️ 폰트 로딩 중 오류:', error);
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
     * 단일 텍스트 렌더링
     */
    renderText(overlay) {
        const { width, height } = this.canvas;

        // FFmpeg와 동일한 좌표계 사용
        const x = overlay.x || width / 2;
        const y = overlay.y || height / 2;
        const text = overlay.text || '';
        const fontSize = overlay.fontSize || 48;
        // HTML에서 로드된 폰트와 동일한 이름 사용
        const fontFamily = overlay.fontFamily || '"Noto Sans KR Local", "Noto Sans JP Local", "맑은 고딕", Arial, sans-serif';
        const color = overlay.color || '#ffffff';
        // 외곽선을 더 두껍게 (가독성 향상)
        const borderWidth = overlay.borderWidth !== undefined ? overlay.borderWidth : Math.max(4, Math.floor(fontSize * 0.1));
        const borderColor = overlay.borderColor || '#000000';

        // 배경 설정
        const hasBackground = overlay.backgroundColor || overlay.showBackground;
        const backgroundColor = overlay.backgroundColor || 'rgba(0, 0, 0, 0.5)';
        const padding = overlay.padding || fontSize * 0.3;

        // 폰트 설정
        this.ctx.font = `bold ${fontSize}px ${fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 텍스트 크기 측정
        const metrics = this.ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize * 1.2; // 대략적인 높이

        // 배경 박스 그리기 (필요한 경우)
        if (hasBackground) {
            const boxX = x - textWidth / 2 - padding;
            const boxY = y - textHeight / 2 - padding;
            const boxWidth = textWidth + padding * 2;
            const boxHeight = textHeight + padding * 2;

            this.ctx.fillStyle = backgroundColor;
            this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
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
    }

    /**
     * 자막 렌더링 (현재 시간에 맞는 자막 표시)
     */
    renderSubtitles() {
        const currentTime = this.video.currentTime;

        // 현재 시간에 해당하는 자막 찾기
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
                // HTML에서 로드된 폰트와 동일한 이름 사용
                fontFamily: '"Noto Sans KR Local", "Noto Sans JP Local", "맑은 고딕", Arial, sans-serif',
                color: '#ffffff',
                borderWidth: 2,
                borderColor: '#000000'
            });
        } else {
            this.currentSubtitle = null;
        }
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
     * 텍스트 오버레이 추가
     */
    addOverlay(overlay) {
        this.overlays.push(overlay);
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
}

// 전역 함수로 사용 가능하게 export
window.CanvasVideoPreview = CanvasVideoPreview;
