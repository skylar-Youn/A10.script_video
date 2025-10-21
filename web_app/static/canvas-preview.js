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

        // 동적 효과 설정 (복수 선택 가능)
        this.animation = {
            effects: [],  // 선택된 효과 배열 (복수 가능)
            duration: 1.2,  // 효과가 더 잘 보이도록 1.2초로 증가
            delay: 0,
            loop: false  // 반복 재생 여부
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
        const currentTime = performance.now() / 1000; // 초 단위

        this.overlays.forEach(overlay => {
            let animationProgress = null;

            // 오버레이에 effects 배열이 있으면 애니메이션 적용
            if (overlay.effects && overlay.effects.length > 0) {
                // 오버레이가 처음 추가될 때 타임스탬프 기록
                if (!overlay.startTime) {
                    overlay.startTime = currentTime;
                }

                // 애니메이션 설정 (기본값: 지속 0.5초, 반복 활성화)
                const duration = this.animation.duration || 0.5;
                const delay = this.animation.delay || 0;
                const loop = this.animation.loop !== undefined ? this.animation.loop : true;

                const elapsed = currentTime - overlay.startTime - delay;

                if (elapsed >= 0) {
                    let progress = elapsed / duration;

                    if (loop) {
                        // 반복: progress를 0~1 사이로 순환
                        progress = progress % 1.0;
                    } else {
                        // 1회만: progress가 1 이상이면 애니메이션 종료
                        progress = Math.min(progress, 1.0);
                        if (progress >= 1.0) {
                            progress = null; // 애니메이션 완료
                        }
                    }

                    animationProgress = progress;
                }
            }

            this.renderText(overlay, animationProgress);
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
        // 외곽선을 FFmpeg와 동일하게 8% 두께로 통일 (선명도 향상)
        const borderWidth = overlay.borderWidth !== undefined ? overlay.borderWidth : Math.max(2, Math.floor(fontSize * 0.08));
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

        // animationProgress가 null이 아니면 애니메이션 진행 중
        if (animationProgress !== null) {
            const easeProgress = this.easeOutQuart(animationProgress);  // 부드럽지만 효과가 잘 보이는 easing
            const rawProgress = animationProgress;

            // 오버레이에 effects 배열이 있으면 사용, 없으면 전역 animation.effects 사용
            const effectsToApply = overlay.effects || this.animation.effects;

            // 복수 효과 적용: 각 효과를 순회하며 누적
            effectsToApply.forEach(effectType => {
                switch (effectType) {
                    // ========== 2025 트렌드 효과 ==========
                    case 'fire': {
                        // 불타는 효과: 색상 그라데이션 + 강력한 파티클
                        const fireProgress = this.animation.loop ? rawProgress : easeProgress;

                        // 불꽃 색상 변화 (빨강 -> 주황 -> 노랑) - 더 강렬하게
                        const firePhase = (fireProgress * 4) % 4; // 더 빠른 변화
                        if (firePhase < 1) {
                            // 뜨거운 빨강
                            const r = 255;
                            const g = Math.floor(40 + (140 - 40) * firePhase);
                            const b = 0;
                            overlay.fireColor = `rgb(${r}, ${g}, ${b})`;
                        } else if (firePhase < 2) {
                            // 밝은 주황
                            const r = 255;
                            const g = Math.floor(140 + (200 - 140) * (firePhase - 1));
                            const b = Math.floor((firePhase - 1) * 30);
                            overlay.fireColor = `rgb(${r}, ${g}, ${b})`;
                        } else if (firePhase < 3) {
                            // 밝은 노랑
                            const r = 255;
                            const g = Math.floor(200 + (255 - 200) * (firePhase - 2));
                            const b = Math.floor(30 + (firePhase - 2) * 20);
                            overlay.fireColor = `rgb(${r}, ${g}, ${b})`;
                        } else {
                            // 다시 빨강으로
                            const r = 255;
                            const g = Math.floor(255 - (255 - 40) * (firePhase - 3));
                            const b = Math.floor(50 - 50 * (firePhase - 3));
                            overlay.fireColor = `rgb(${r}, ${g}, ${b})`;
                        }

                        // 파티클 효과 정보 - 강도 증가
                        overlay.fireParticles = true;
                        overlay.fireIntensity = 1.5; // 강도 1.5배 증가

                        // 강력한 글로우 효과
                        overlay.neonGlow = Math.max(overlay.neonGlow || 0, 1.2);

                        // 불꽃 흔들림 효과
                        offsetX += (Math.random() - 0.5) * 2;
                        offsetY += (Math.random() - 0.5) * 2 - Math.random() * 1; // 위로 올라가는 느낌
                        break;
                    }

                    case 'glitch': {
                        // 글리치 효과: RGB 분리 + 지터 (눈에 띄는 효과)
                        const glitchIntensity = (1 - easeProgress) * 8;
                        offsetX += (Math.random() - 0.5) * glitchIntensity;
                        offsetY += (Math.random() - 0.5) * glitchIntensity;
                        opacity *= easeProgress;
                        // RGB 분리는 렌더링 시 별도 처리
                        overlay.glitchEffect = glitchIntensity;
                        break;
                    }

                    case 'wave': {
                        // 웨이브 효과: 사인파 움직임 (눈에 띄는 진폭)
                        const waveFrequency = 2.5;
                        const waveAmplitude = 25 * (1 - easeProgress);
                        offsetY += Math.sin(rawProgress * Math.PI * waveFrequency) * waveAmplitude;
                        opacity *= easeProgress;
                        break;
                    }

                    case 'elastic': {
                        // 탄성 바운스: 고무줄처럼 튕김 (더 자연스러운 easing)
                        const elasticScale = this.easeOutBack(easeProgress);
                        scale *= elasticScale;
                        opacity *= Math.min(easeProgress * 1.5, 1);
                        break;
                    }

                    case 'neonGlow': {
                        // 네온 글로우: 빛나는 효과
                        const glowIntensity = easeProgress;
                        overlay.neonGlow = Math.max(overlay.neonGlow || 0, glowIntensity);
                        opacity *= easeProgress;
                        break;
                    }

                    case 'split': {
                        // 스플릿: 글자가 갈라지며 등장 (눈에 띄게)
                        const splitDistance = (1 - easeProgress) * 120;
                        overlay.splitEffect = splitDistance;
                        opacity *= easeProgress;
                        break;
                    }

                    case 'rotateIn': {
                        // 회전 진입: 360도 회전하며 등장 (한 바퀴 돌며 등장)
                        const rotationAngle = (1 - easeProgress) * 360;
                        overlay.rotationAngle = rotationAngle;
                        scale *= easeProgress;
                        opacity *= easeProgress;
                        break;
                    }

                    case 'scalePulse': {
                        // 스케일 펄스: 맥박치듯 커졌다 작아짐 (뚜렷한 펄스)
                        const pulseScale = 1 + Math.sin(rawProgress * Math.PI * 3) * 0.15 * (1 - easeProgress);
                        scale *= easeProgress * pulseScale;
                        opacity *= Math.min(easeProgress * 1.5, 1);
                        break;
                    }

                    case 'blurFade': {
                        // 블러 페이드: 흐릿하게 시작해서 선명해짐 (눈에 띄는 blur)
                        const blurAmount = (1 - easeProgress) * 12;
                        overlay.blurAmount = blurAmount;
                        opacity *= easeProgress;
                        break;
                    }

                    // ========== 클래식 효과 - In (나타나기) ==========
                    case 'fadeIn': {
                        opacity *= easeProgress;
                        break;
                    }

                    case 'slideUp': {
                        offsetY += (1 - easeProgress) * 150;
                        opacity *= easeProgress;
                        break;
                    }

                    case 'zoomIn':
                    case 'zoom': {
                        // 눈에 잘 띄는 줌 (0.3부터 시작)
                        scale *= 0.3 + (easeProgress * 0.7);
                        opacity *= easeProgress;
                        break;
                    }

                    // ========== 클래식 효과 - Out (사라지기) ==========
                    case 'fadeOut': {
                        // 불투명 → 투명 (역방향)
                        opacity *= (1 - easeProgress);
                        break;
                    }

                    case 'slideDown': {
                        // 현재 위치 → 아래로 슬라이드하며 사라짐
                        offsetY -= easeProgress * 150;
                        opacity *= (1 - easeProgress);
                        break;
                    }

                    case 'zoomOut': {
                        // 정상 크기 → 작아지며 사라짐 (1.0 → 0.3)
                        scale *= 1.0 - (easeProgress * 0.7);
                        opacity *= (1 - easeProgress);
                        break;
                    }

                    // ========== 기타 슬라이드 효과 (미리보기 전용) ==========
                    case 'slideLeft': {
                        offsetX += (1 - easeProgress) * 200;
                        opacity *= easeProgress;
                        break;
                    }

                    case 'slideRight': {
                        offsetX += -(1 - easeProgress) * 200;
                        opacity *= easeProgress;
                        break;
                    }

                    case 'zoomWave': {
                        // 작게 시작 → 크게 → 정상 → 작게 끝
                        // 사인 곡선을 사용하여 부드러운 크기 변화
                        let scaleValue;
                        if (easeProgress < 0.3) {
                            // 0-30%: 작은 크기에서 빠르게 커짐
                            scaleValue = 0.2 + (easeProgress / 0.3) * 1.3; // 0.2 → 1.5
                        } else if (easeProgress < 0.6) {
                            // 30-60%: 크게 커진 후 정상 크기로
                            const t = (easeProgress - 0.3) / 0.3;
                            scaleValue = 1.5 - t * 0.5; // 1.5 → 1.0
                        } else {
                            // 60-100%: 정상에서 다시 작아짐
                            const t = (easeProgress - 0.6) / 0.4;
                            scaleValue = 1.0 - t * 0.7; // 1.0 → 0.3
                        }
                        scale *= scaleValue;
                        opacity *= Math.min(easeProgress * 2, 1.0); // 빠르게 나타남
                        break;
                    }

                    case 'breathe': {
                        // 숨쉬듯이 커졌다 작아졌다 반복
                        const breatheScale = 1 + Math.sin(rawProgress * Math.PI * 2) * 0.2;
                        scale *= breatheScale * easeProgress;
                        opacity *= easeProgress;
                        break;
                    }

                    case 'heartbeat': {
                        // 심장박동처럼 두 번 두근거림
                        let heartScale;
                        const beat = rawProgress * 4 % 1; // 4번 반복
                        if (beat < 0.15) {
                            // 첫 번째 박동
                            heartScale = 1 + Math.sin(beat / 0.15 * Math.PI) * 0.3;
                        } else if (beat < 0.35 && beat >= 0.2) {
                            // 두 번째 박동
                            heartScale = 1 + Math.sin((beat - 0.2) / 0.15 * Math.PI) * 0.25;
                        } else {
                            heartScale = 1;
                        }
                        scale *= heartScale * easeProgress;
                        opacity *= easeProgress;
                        break;
                    }

                    case 'bounce': {
                        // 눈에 띄는 바운스
                        const bounce = Math.abs(Math.sin(easeProgress * Math.PI));
                        offsetY += -bounce * 40;
                        break;
                    }

                    case 'typing': {
                        // 타이핑 효과: 글자를 점진적으로 표시
                        const visibleChars = Math.max(1, Math.floor(text.length * easeProgress));
                        text = text.substring(0, visibleChars);
                        break;
                    }
                }
            }); // forEach 종료
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

        // 네온 글로우 효과
        if (overlay.neonGlow && overlay.neonGlow > 0) {
            const glowSize = 20 * overlay.neonGlow;
            this.ctx.shadowBlur = glowSize;
            // 불꽃 효과가 있으면 불꽃 색상으로 글로우, 아니면 기본 색상
            this.ctx.shadowColor = overlay.fireColor || color;
        }

        // 블러 효과
        if (overlay.blurAmount && overlay.blurAmount > 0) {
            this.ctx.filter = `blur(${overlay.blurAmount}px)`;
        }

        // 트랜스폼 적용 (회전, 스케일)
        const needsTransform = scale !== 1.0 || overlay.rotationAngle;
        if (needsTransform) {
            this.ctx.save();
            this.ctx.translate(x, y);
            if (overlay.rotationAngle) {
                this.ctx.rotate((overlay.rotationAngle * Math.PI) / 180);
            }
            if (scale !== 1.0) {
                this.ctx.scale(scale, scale);
            }
            this.ctx.translate(-x, -y);
        }

        // 불 파티클 효과 (텍스트 뒤에 먼저 그리기)
        if (overlay.fireParticles && overlay.fireIntensity > 0) {
            // 파티클은 transform 영향을 받지 않도록 미리 그림
            const savedAlpha = this.ctx.globalAlpha;
            this.ctx.globalAlpha = opacity * 0.9; // 파티클 투명도
            this.renderFireParticles(x, y, textWidth, textHeight, overlay.fireIntensity);
            this.ctx.globalAlpha = savedAlpha;
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

        // 글리치 효과: RGB 분리
        if (overlay.glitchEffect && overlay.glitchEffect > 0) {
            const glitchOffset = overlay.glitchEffect * 2;

            // Red channel
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.fillStyle = `rgba(255, 0, 0, ${opacity * 0.5})`;
            this.ctx.fillText(text, x - glitchOffset, y);

            // Blue channel
            this.ctx.fillStyle = `rgba(0, 255, 255, ${opacity * 0.5})`;
            this.ctx.fillText(text, x + glitchOffset, y);

            this.ctx.globalCompositeOperation = 'source-over';
        }

        // 스플릿 효과: 텍스트를 두 부분으로 나눠서 렌더링
        if (overlay.splitEffect && overlay.splitEffect > 0) {
            const splitDist = overlay.splitEffect;

            // 왼쪽 반
            if (borderWidth > 0) {
                this.ctx.strokeStyle = borderColor;
                this.ctx.lineWidth = borderWidth;
                this.ctx.lineJoin = 'round';
                this.ctx.miterLimit = 2;
                this.ctx.strokeText(text, x - splitDist, y);
            }
            this.ctx.fillStyle = color;
            this.ctx.fillText(text, x - splitDist, y);

            // 오른쪽 반
            if (borderWidth > 0) {
                this.ctx.strokeText(text, x + splitDist, y);
            }
            this.ctx.fillText(text, x + splitDist, y);
        } else {
            // 일반 텍스트 렌더링
            // 텍스트 외곽선 (FFmpeg의 borderw와 동기화)
            if (borderWidth > 0) {
                this.ctx.strokeStyle = borderColor;
                // ⚠️ FFmpeg와 동기화: 외곽선 두께를 FFmpeg와 동일하게 설정
                this.ctx.lineWidth = borderWidth; // 2배 제거 → FFmpeg와 동일
                this.ctx.lineJoin = 'round'; // 모서리를 둥글게
                this.ctx.miterLimit = 2;
                this.ctx.strokeText(text, x, y);
            }

            // 텍스트 채우기 (불 효과 색상 적용)
            const finalColor = overlay.fireColor || color;
            this.ctx.fillStyle = finalColor;
            this.ctx.fillText(text, x, y);
        }

        // 트랜스폼 복원
        if (needsTransform) {
            this.ctx.restore();
        }

        // 그림자 효과 제거
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;

        // 필터 초기화
        this.ctx.filter = 'none';

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
     * InOutQuart - 매우 부드러운 시작과 끝 (권장)
     */
    easeInOutQuart(t) {
        return t < 0.5
            ? 8 * t * t * t * t
            : 1 - Math.pow(-2 * t + 2, 4) / 2;
    }

    /**
     * OutQuart - 부드러운 감속
     */
    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    /**
     * InOutQuint - 매우 부드럽고 자연스러운 (가장 부드러움)
     */
    easeInOutQuint(t) {
        return t < 0.5
            ? 16 * t * t * t * t * t
            : 1 - Math.pow(-2 * t + 2, 5) / 2;
    }

    /**
     * OutBack - 살짝 오버슈팅 후 안착 (자연스러운 물리감)
     */
    easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    /**
     * InOutBack - 시작과 끝에서 살짝 오버슈팅
     */
    easeInOutBack(t) {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;
        return t < 0.5
            ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
            : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    }

    /**
     * Elastic easing 함수 (탄성 효과)
     */
    easeElastic(t) {
        const c4 = (2 * Math.PI) / 3;
        return t === 0
            ? 0
            : t === 1
            ? 1
            : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
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
     * 불 파티클 렌더링 (실제 불꽃처럼!)
     */
    renderFireParticles(centerX, centerY, textWidth, textHeight, intensity) {
        const numParticles = Math.floor(60 * intensity); // 파티클 수 3배 증가
        const time = Date.now() / 1000; // 시간 기반 애니메이션

        for (let i = 0; i < numParticles; i++) {
            // 파티클 라이프 사이클 (각 파티클마다 다른 타이밍)
            const particleLife = (time * 3 + i * 0.05) % 1.0; // 0~1 사이 반복, 더 빠르게

            // 텍스트 하단에서 시작하여 위로 올라감
            const baseX = centerX + (Math.random() - 0.5) * textWidth * 0.8;
            const baseY = centerY + textHeight / 2;

            // 불꽃이 위로 올라가면서 좌우로 흔들림
            const wobble = Math.sin(particleLife * Math.PI * 4 + i) * 15;
            const offsetX = wobble + (Math.random() - 0.5) * 10;
            const offsetY = -particleLife * (80 + Math.random() * 40); // 위로 올라감 (더 높이)

            const particleX = baseX + offsetX;
            const particleY = baseY + offsetY;

            // 파티클 크기 (아래에서 크고 위로 갈수록 작아짐)
            const size = (1 - particleLife * 0.7) * (8 + Math.random() * 6);

            // 투명도 (위로 갈수록 사라짐)
            const alpha = (1 - particleLife) * (0.9 - Math.random() * 0.2);

            // 불꽃 색상 변화 (아래: 빨강 → 중간: 주황 → 위: 노랑 → 최상단: 연기)
            let particleColor;
            if (particleLife < 0.2) {
                // 뜨거운 빨간 불꽃 (아래)
                particleColor = `rgba(255, ${Math.floor(30 + Math.random() * 20)}, 0, ${alpha})`;
            } else if (particleLife < 0.4) {
                // 밝은 주황색 불꽃
                particleColor = `rgba(255, ${Math.floor(120 + Math.random() * 60)}, 0, ${alpha})`;
            } else if (particleLife < 0.7) {
                // 노란 불꽃
                particleColor = `rgba(255, ${Math.floor(200 + Math.random() * 55)}, ${Math.floor(Math.random() * 50)}, ${alpha})`;
            } else {
                // 연기 (회색)
                const gray = Math.floor(100 + Math.random() * 50);
                particleColor = `rgba(${gray}, ${gray}, ${gray}, ${alpha * 0.4})`;
            }

            // 글로우 효과 추가
            if (particleLife < 0.5) {
                this.ctx.shadowBlur = 15 + Math.random() * 10;
                this.ctx.shadowColor = particleColor;
            } else {
                this.ctx.shadowBlur = 0;
            }

            // 파티클 그리기 (원형)
            this.ctx.beginPath();
            this.ctx.arc(particleX, particleY, size, 0, Math.PI * 2);
            this.ctx.fillStyle = particleColor;
            this.ctx.fill();

            // 추가 내부 코어 (더 밝은 중심)
            if (particleLife < 0.4 && size > 4) {
                this.ctx.beginPath();
                this.ctx.arc(particleX, particleY, size * 0.4, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 1.2})`;
                this.ctx.fill();
            }
        }

        // 그림자 효과 리셋
        this.ctx.shadowBlur = 0;
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
     * 애니메이션 진행도 계산 (0~1, 1이면 완료, null이면 애니메이션 안 함)
     */
    getAnimationProgress(trackType, subtitle, currentTime) {
        if (this.animation.effects.length === 0) {
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

        // 현재 시간이 지연 시간 이전이면 자막을 정상적으로 표시 (애니메이션 없음)
        if (currentTime < effectiveStartTime) {
            return null; // 지연 시간 전에는 애니메이션 적용 안 함
        }

        // 애니메이션 진행도 계산
        const elapsed = currentTime - effectiveStartTime;
        let progress = elapsed / this.animation.duration;

        // 반복 모드
        if (this.animation.loop) {
            // 0~1 사이를 반복 (무한 루프)
            progress = progress % 1.0;
            return progress;
        } else {
            // 한 번만 재생
            progress = Math.min(progress, 1.0);

            // 애니메이션이 완료되면 null 반환 (더 이상 애니메이션 효과 적용 안 함)
            if (progress >= 1.0) {
                return null;
            }

            return progress;
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
     * 통일된 폰트 패밀리를 반환한다 (모든 언어 지원).
     * 언어 자동 감지를 비활성화하고 항상 동일한 폰트 스택 사용.
     */
    getFontFamilyForText(text = '') {
        // 통일된 폰트 스택: 한국어 우선, 일본어 지원, 영어 fallback, 이모지
        return '"Noto Sans CJK KR", "Noto Sans KR Local", "Noto Sans KR", "맑은 고딕", "Noto Sans JP Local", "Noto Sans JP", "Noto Sans CJK JP", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
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
     * 애니메이션 효과 설정 (복수 선택 가능)
     */
    setAnimationEffects(effects) {
        this.animation.effects = effects || [];

        // 애니메이션 상태 초기화
        Object.keys(this.subtitleAnimationStates).forEach(key => {
            this.subtitleAnimationStates[key].currentSubtitleId = null;
            this.subtitleAnimationStates[key].startTime = null;
        });

        console.log(`🎬 애니메이션 효과 설정: [${effects.join(', ')}]`);
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
        // 오버레이 애니메이션 리셋 (즉각 반영)
        this.overlays.forEach(overlay => {
            if (overlay.startTime) {
                overlay.startTime = performance.now() / 1000;
            }
        });
        // 자막 애니메이션 상태 리셋
        Object.keys(this.subtitleAnimationStates).forEach(key => {
            this.subtitleAnimationStates[key].startTime = null;
        });
        this.render();
    }

    /**
     * 애니메이션 지연 설정
     */
    setAnimationDelay(delay) {
        this.animation.delay = delay;
        // 오버레이 애니메이션 리셋 (즉각 반영)
        this.overlays.forEach(overlay => {
            if (overlay.startTime) {
                overlay.startTime = performance.now() / 1000;
            }
        });
        // 자막 애니메이션 상태 리셋
        Object.keys(this.subtitleAnimationStates).forEach(key => {
            this.subtitleAnimationStates[key].startTime = null;
        });
        this.render();
    }

    /**
     * 애니메이션 반복 설정
     */
    setAnimationLoop(loop) {
        this.animation.loop = loop;
        // 반복 모드 변경 시 애니메이션 상태 초기화
        Object.keys(this.subtitleAnimationStates).forEach(key => {
            this.subtitleAnimationStates[key].currentSubtitleId = null;
            this.subtitleAnimationStates[key].startTime = null;
        });
        this.render();
    }
}

// 전역 함수로 사용 가능하게 export
window.CanvasVideoPreview = CanvasVideoPreview;
