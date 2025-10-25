// API 기본 URL
const API_BASE = 'http://localhost:8007';

// 전역 상태
let currentVideoPath = '';
let currentSubtitlePath = '';
let subtitles = [];
let selectedIds = new Set();
let outputFilename = '';
let currentVideoFilename = '';
let currentAspectRatio = 'youtube'; // 기본값: 유튜브 비율
let currentVideoSize = 50; // 기본값: 50%

// 자막 효과 설정
let subtitleEffects = {
    fontSize: '1.5em',
    fontColor: '#ffffff',
    bgColor: '#000000',
    bgOpacity: 80,
    borderStyle: 'none',
    textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
    animation: 'none',
    animationSpeed: '0.5s',
    // 고급 텍스트 효과
    textStroke: 0,              // 텍스트 아웃라인 두께 (0-10px)
    textStrokeColor: '#000000', // 아웃라인 색상
    glowEffect: 'none',         // 글로우 효과 (none, soft, medium, strong, neon)
    gradientEnabled: false,     // 그라데이션 활성화
    gradientColor1: '#ff6b6b',  // 그라데이션 시작 색상
    gradientColor2: '#4ecdc4',  // 그라데이션 끝 색상
    gradientAngle: 90,          // 그라데이션 각도 (0-360)
    letterAnimation: 'none',    // 글자별 애니메이션 (none, wave, bounce, flip)
    textTransform: 'none',      // 텍스트 변형 (none, uppercase, lowercase, capitalize)
    letterSpacing: 0           // 자간 (-5 to 20px)
};

// 제목 설정
let videoTitleSettings = {
    text: '',
    fontSize: '2em',
    color: '#ffffff',
    bgColor: '#667eea',
    bgOpacity: 90,
    position: 'top',
    shadow: '2px 2px 4px rgba(0,0,0,0.9)',
    borderStyle: 'none',
    borderWidth: 0,
    borderColor: '#ffffff',
    borderRadius: 8,
    animation: 'none',
    animationSpeed: '0.5s'
};

// 레터박스 설정
let letterboxSettings = {
    topEnabled: false,
    topHeight: 80,
    topOpacity: 80,
    bottomEnabled: false,
    bottomHeight: 80,
    bottomOpacity: 80
};

// 글자 가림 박스 설정
let coverBoxSettings = {
    enabled: false,
    left: 10,      // %
    top: 10,       // %
    width: 20,     // %
    height: 15,    // %
    opacity: 90    // %
};

// 비디오/이미지 효과 설정
let videoEffects = {
    brightness: 100,    // 밝기 (0-200%)
    contrast: 100,      // 대비 (0-200%)
    saturate: 100,      // 채도 (0-200%)
    blur: 0,            // 블러 (0-10px)
    grayscale: 0,       // 흑백 (0-100%)
    sepia: 0,           // 세피아 (0-100%)
    hueRotate: 0,       // 색조 회전 (0-360도)
    invert: 0           // 반전 (0-100%)
};

// 이미지 오버레이 설정
let imageOverlays = []; // 여러 이미지를 관리하기 위한 배열
let currentImageId = 0; // 이미지 ID 카운터
let maintainAspectRatio = false; // 종횡비 유지 플래그
let originalAspectRatio = 1; // 원본 종횡비 (width/height)

// 이미지 오버레이 객체 구조:
// {
//     id: number,
//     filename: string,
//     src: string,
//     left: number (%),
//     top: number (%),
//     width: number (%),
//     height: number (%),
//     rotation: number (deg),
//     opacity: number (%),
//     animation: string,
//     animationSpeed: string,
//     brightness: number,
//     contrast: number,
//     saturate: number,
//     blur: number,
//     grayscale: number,
//     sepia: number,
//     hueRotate: number,
//     invert: number
// }

let selectedImageId = null; // 현재 선택된 이미지 ID

// 패널 펼침/접힘 상태
let panelStates = {
    coverBoxPanel: true,        // 글자 가림 박스 (기본: 펼침)
    letterboxPanel: true,       // 레터박스 (기본: 펼침)
    titlePanel: true,           // 제목 설정 (기본: 펼침)
    subtitleEffectsPanel: true, // 자막 효과 (기본: 펼침)
    videoEffectsPanel: true,    // 비디오 효과 (기본: 펼침)
    imagePanel: true            // 이미지 오버레이 (기본: 펼침)
};

// 비디오 플레이어 설정
let playerSettings = {
    muted: false,    // 기본값: 소리 켜짐
    volume: 1.0      // 기본값: 100%
};

// localStorage 키
const STORAGE_KEY = 'vmaker_state';

// 유틸리티 함수: 시간 포맷팅
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 현재 재생 시간에 맞는 자막 찾기
function getCurrentSubtitle(currentTime) {
    return subtitles.find(sub =>
        currentTime >= sub.start && currentTime <= sub.end
    );
}

// 커서 위치 가져오기
function getCursorPosition(element) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    return preCaretRange.toString().length;
}

// 특정 위치에 커서 설정
function setCursorPosition(element, position) {
    const range = document.createRange();
    const sel = window.getSelection();

    let charCount = 0;
    let nodeStack = [element];
    let node, foundNode, foundOffset;

    while (nodeStack.length > 0) {
        node = nodeStack.pop();

        if (node.nodeType === Node.TEXT_NODE) {
            const nextCharCount = charCount + node.length;
            if (position <= nextCharCount) {
                foundNode = node;
                foundOffset = position - charCount;
                break;
            }
            charCount = nextCharCount;
        } else {
            for (let i = node.childNodes.length - 1; i >= 0; i--) {
                nodeStack.push(node.childNodes[i]);
            }
        }
    }

    if (foundNode) {
        range.setStart(foundNode, foundOffset);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// 자막 효과 업데이트
function updateSubtitleStyle() {
    // UI에서 값 읽기
    const fontSizeEl = document.getElementById('fontSize');
    const fontColorEl = document.getElementById('fontColor');
    const bgColorEl = document.getElementById('bgColor');
    const bgOpacityEl = document.getElementById('bgOpacity');
    const bgOpacityValueEl = document.getElementById('bgOpacityValue');
    const borderStyleEl = document.getElementById('borderStyle');
    const textShadowEl = document.getElementById('textShadow');
    const animationEl = document.getElementById('animation');
    const animationSpeedEl = document.getElementById('animationSpeed');

    // 고급 효과 요소
    const textStrokeEl = document.getElementById('textStroke');
    const textStrokeValueEl = document.getElementById('textStrokeValue');
    const textStrokeColorEl = document.getElementById('textStrokeColor');
    const glowEffectEl = document.getElementById('glowEffect');
    const gradientEnabledEl = document.getElementById('gradientEnabled');
    const gradientColor1El = document.getElementById('gradientColor1');
    const gradientColor2El = document.getElementById('gradientColor2');
    const gradientAngleEl = document.getElementById('gradientAngle');
    const gradientAngleValueEl = document.getElementById('gradientAngleValue');
    const letterAnimationEl = document.getElementById('letterAnimation');
    const textTransformEl = document.getElementById('textTransform');
    const letterSpacingEl = document.getElementById('letterSpacing');
    const letterSpacingValueEl = document.getElementById('letterSpacingValue');

    // subtitleEffects 객체 업데이트
    if (fontSizeEl) subtitleEffects.fontSize = fontSizeEl.value;
    if (fontColorEl) subtitleEffects.fontColor = fontColorEl.value;
    if (bgColorEl) subtitleEffects.bgColor = bgColorEl.value;
    if (bgOpacityEl) {
        subtitleEffects.bgOpacity = parseInt(bgOpacityEl.value);
        if (bgOpacityValueEl) {
            bgOpacityValueEl.textContent = `${bgOpacityEl.value}%`;
        }
    }
    if (borderStyleEl) subtitleEffects.borderStyle = borderStyleEl.value;
    if (textShadowEl) subtitleEffects.textShadow = textShadowEl.value;
    if (animationEl) subtitleEffects.animation = animationEl.value;
    if (animationSpeedEl) subtitleEffects.animationSpeed = animationSpeedEl.value;

    // 고급 효과 업데이트
    if (textStrokeEl) {
        subtitleEffects.textStroke = parseInt(textStrokeEl.value);
        if (textStrokeValueEl) {
            textStrokeValueEl.textContent = `${textStrokeEl.value}px`;
        }
    }
    if (textStrokeColorEl) subtitleEffects.textStrokeColor = textStrokeColorEl.value;
    if (glowEffectEl) subtitleEffects.glowEffect = glowEffectEl.value;
    if (gradientEnabledEl) subtitleEffects.gradientEnabled = gradientEnabledEl.checked;
    if (gradientColor1El) subtitleEffects.gradientColor1 = gradientColor1El.value;
    if (gradientColor2El) subtitleEffects.gradientColor2 = gradientColor2El.value;
    if (gradientAngleEl) {
        subtitleEffects.gradientAngle = parseInt(gradientAngleEl.value);
        if (gradientAngleValueEl) {
            gradientAngleValueEl.textContent = `${gradientAngleEl.value}°`;
        }
    }
    if (letterAnimationEl) subtitleEffects.letterAnimation = letterAnimationEl.value;
    if (textTransformEl) subtitleEffects.textTransform = textTransformEl.value;
    if (letterSpacingEl) {
        subtitleEffects.letterSpacing = parseInt(letterSpacingEl.value);
        if (letterSpacingValueEl) {
            letterSpacingValueEl.textContent = `${letterSpacingEl.value}px`;
        }
    }

    // 상태 저장
    saveState();

    // 현재 재생 중인 자막이 있다면 즉시 업데이트
    const player = document.getElementById('videoPlayer');
    if (player && !player.paused) {
        updateSubtitleOverlay(player.currentTime);
    }

    showStatus('자막 효과가 적용되었습니다.', 'success');
}

// 자막 효과 초기화
function resetSubtitleEffects() {
    // 기본값으로 초기화
    subtitleEffects = {
        fontSize: '1.5em',
        fontColor: '#ffffff',
        bgColor: '#000000',
        bgOpacity: 80,
        borderStyle: 'none',
        textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
        animation: 'none',
        animationSpeed: '0.5s'
    };

    // UI 컨트롤 업데이트
    const fontSizeEl = document.getElementById('fontSize');
    const fontColorEl = document.getElementById('fontColor');
    const bgColorEl = document.getElementById('bgColor');
    const bgOpacityEl = document.getElementById('bgOpacity');
    const bgOpacityValueEl = document.getElementById('bgOpacityValue');
    const borderStyleEl = document.getElementById('borderStyle');
    const textShadowEl = document.getElementById('textShadow');
    const animationEl = document.getElementById('animation');
    const animationSpeedEl = document.getElementById('animationSpeed');

    if (fontSizeEl) fontSizeEl.value = '1.5em';
    if (fontColorEl) fontColorEl.value = '#ffffff';
    if (bgColorEl) bgColorEl.value = '#000000';
    if (bgOpacityEl) {
        bgOpacityEl.value = 80;
        if (bgOpacityValueEl) {
            bgOpacityValueEl.textContent = '80%';
        }
    }
    if (borderStyleEl) borderStyleEl.value = 'none';
    if (textShadowEl) textShadowEl.value = '2px 2px 4px rgba(0,0,0,0.9)';
    if (animationEl) animationEl.value = 'none';
    if (animationSpeedEl) animationSpeedEl.value = '0.5s';

    // 상태 저장
    saveState();

    // 현재 재생 중인 자막이 있다면 즉시 업데이트
    const player = document.getElementById('videoPlayer');
    if (player && !player.paused) {
        updateSubtitleOverlay(player.currentTime);
    }

    showStatus('자막 효과가 초기화되었습니다.', 'success');
}

// 제목 업데이트
function updateTitle() {
    // UI에서 값 읽기
    const titleTextEl = document.getElementById('videoTitle');
    const titleFontSizeEl = document.getElementById('titleFontSize');
    const titleColorEl = document.getElementById('titleColor');
    const titleBgColorEl = document.getElementById('titleBgColor');
    const titleBgOpacityEl = document.getElementById('titleBgOpacity');
    const titleBgOpacityValueEl = document.getElementById('titleBgOpacityValue');
    const titlePositionEl = document.getElementById('titlePosition');
    const titleShadowEl = document.getElementById('titleShadow');

    // 새로운 정적 효과 필드
    const titleBorderStyleEl = document.getElementById('titleBorderStyle');
    const titleBorderWidthEl = document.getElementById('titleBorderWidth');
    const titleBorderWidthValueEl = document.getElementById('titleBorderWidthValue');
    const titleBorderColorEl = document.getElementById('titleBorderColor');
    const titleBorderRadiusEl = document.getElementById('titleBorderRadius');
    const titleBorderRadiusValueEl = document.getElementById('titleBorderRadiusValue');

    // 동적 효과 필드
    const titleAnimationEl = document.getElementById('titleAnimation');
    const titleAnimationSpeedEl = document.getElementById('titleAnimationSpeed');

    // videoTitleSettings 객체 업데이트
    if (titleTextEl) videoTitleSettings.text = titleTextEl.value;
    if (titleFontSizeEl) videoTitleSettings.fontSize = titleFontSizeEl.value;
    if (titleColorEl) videoTitleSettings.color = titleColorEl.value;
    if (titleBgColorEl) videoTitleSettings.bgColor = titleBgColorEl.value;
    if (titleBgOpacityEl) {
        videoTitleSettings.bgOpacity = parseInt(titleBgOpacityEl.value);
        if (titleBgOpacityValueEl) {
            titleBgOpacityValueEl.textContent = `${titleBgOpacityEl.value}%`;
        }
    }
    if (titlePositionEl) videoTitleSettings.position = titlePositionEl.value;
    if (titleShadowEl) videoTitleSettings.shadow = titleShadowEl.value;

    // 정적 효과 업데이트
    if (titleBorderStyleEl) videoTitleSettings.borderStyle = titleBorderStyleEl.value;
    if (titleBorderWidthEl) {
        videoTitleSettings.borderWidth = parseInt(titleBorderWidthEl.value);
        if (titleBorderWidthValueEl) {
            titleBorderWidthValueEl.textContent = `${titleBorderWidthEl.value}px`;
        }
    }
    if (titleBorderColorEl) videoTitleSettings.borderColor = titleBorderColorEl.value;
    if (titleBorderRadiusEl) {
        videoTitleSettings.borderRadius = parseInt(titleBorderRadiusEl.value);
        if (titleBorderRadiusValueEl) {
            titleBorderRadiusValueEl.textContent = `${titleBorderRadiusEl.value}px`;
        }
    }

    // 동적 효과 업데이트
    if (titleAnimationEl) videoTitleSettings.animation = titleAnimationEl.value;
    if (titleAnimationSpeedEl) videoTitleSettings.animationSpeed = titleAnimationSpeedEl.value;

    // 제목 오버레이 업데이트
    displayTitle();

    // 상태 저장
    saveState();
}

// 제목 표시
function displayTitle() {
    const overlay = document.getElementById('titleOverlay');
    if (!overlay) return;

    // 제목이 비어있으면 숨김
    if (!videoTitleSettings.text || videoTitleSettings.text.trim() === '') {
        overlay.innerHTML = '';
        return;
    }

    // 배경색 RGBA 생성
    const bgOpacityValue = videoTitleSettings.bgOpacity / 100;
    const bgColorRGB = hexToRgb(videoTitleSettings.bgColor);
    const bgColorRGBA = `rgba(${bgColorRGB.r}, ${bgColorRGB.g}, ${bgColorRGB.b}, ${bgOpacityValue})`;

    // 기존 요소 제거 (애니메이션 리셋을 위해)
    overlay.innerHTML = '';

    // title-text div 생성 및 스타일 적용
    const titleText = document.createElement('div');
    titleText.className = 'title-text';
    titleText.textContent = videoTitleSettings.text;

    // 기본 스타일 적용
    titleText.style.fontSize = videoTitleSettings.fontSize;
    titleText.style.color = videoTitleSettings.color;
    titleText.style.background = bgColorRGBA;
    titleText.style.textShadow = videoTitleSettings.shadow;

    // 정적 효과 - 테두리 적용
    if (videoTitleSettings.borderStyle !== 'none' && videoTitleSettings.borderWidth > 0) {
        titleText.style.border = `${videoTitleSettings.borderWidth}px ${videoTitleSettings.borderStyle} ${videoTitleSettings.borderColor}`;
    } else {
        titleText.style.border = 'none';
    }

    // 둥근 모서리 적용
    titleText.style.borderRadius = `${videoTitleSettings.borderRadius}px`;

    // 애니메이션 속도 CSS 변수 설정
    titleText.style.setProperty('--title-animation-speed', videoTitleSettings.animationSpeed);

    // 오버레이에 위치 클래스 추가
    overlay.className = 'title-overlay';
    overlay.classList.add(`position-${videoTitleSettings.position}`);

    // DOM에 추가
    overlay.appendChild(titleText);

    // 애니메이션 클래스는 DOM 추가 후 약간의 지연을 두고 추가 (애니메이션 트리거)
    if (videoTitleSettings.animation !== 'none') {
        // 브라우저가 리플로우를 하도록 강제
        void titleText.offsetWidth;

        // 애니메이션 클래스 추가
        setTimeout(() => {
            titleText.classList.add(videoTitleSettings.animation);
        }, 10);
    }
}

// 제목 지우기
function clearTitle() {
    const titleTextEl = document.getElementById('videoTitle');
    if (titleTextEl) {
        titleTextEl.value = '';
    }

    videoTitleSettings.text = '';
    displayTitle();
    saveState();

    showStatus('제목이 지워졌습니다.', 'success');
}

// 레터박스 업데이트
function updateLetterbox() {
    // UI에서 값 읽기
    const topEnabledEl = document.getElementById('topBarEnabled');
    const topHeightEl = document.getElementById('topBarHeight');
    const topHeightValueEl = document.getElementById('topBarHeightValue');
    const topOpacityEl = document.getElementById('topBarOpacity');
    const topOpacityValueEl = document.getElementById('topBarOpacityValue');

    const bottomEnabledEl = document.getElementById('bottomBarEnabled');
    const bottomHeightEl = document.getElementById('bottomBarHeight');
    const bottomHeightValueEl = document.getElementById('bottomBarHeightValue');
    const bottomOpacityEl = document.getElementById('bottomBarOpacity');
    const bottomOpacityValueEl = document.getElementById('bottomBarOpacityValue');

    // letterboxSettings 객체 업데이트
    if (topEnabledEl) letterboxSettings.topEnabled = topEnabledEl.checked;
    if (topHeightEl) {
        letterboxSettings.topHeight = parseInt(topHeightEl.value);
        if (topHeightValueEl) {
            topHeightValueEl.textContent = `${topHeightEl.value}px`;
        }
    }
    if (topOpacityEl) {
        letterboxSettings.topOpacity = parseInt(topOpacityEl.value);
        if (topOpacityValueEl) {
            topOpacityValueEl.textContent = `${topOpacityEl.value}%`;
        }
    }

    if (bottomEnabledEl) letterboxSettings.bottomEnabled = bottomEnabledEl.checked;
    if (bottomHeightEl) {
        letterboxSettings.bottomHeight = parseInt(bottomHeightEl.value);
        if (bottomHeightValueEl) {
            bottomHeightValueEl.textContent = `${bottomHeightEl.value}px`;
        }
    }
    if (bottomOpacityEl) {
        letterboxSettings.bottomOpacity = parseInt(bottomOpacityEl.value);
        if (bottomOpacityValueEl) {
            bottomOpacityValueEl.textContent = `${bottomOpacityEl.value}%`;
        }
    }

    // 레터박스 오버레이 표시
    displayLetterbox();

    // 상태 저장
    saveState();
}

// 레터박스 표시
function displayLetterbox() {
    const topBar = document.getElementById('topBar');
    const bottomBar = document.getElementById('bottomBar');

    if (!topBar || !bottomBar) return;

    // 상단 바
    if (letterboxSettings.topEnabled) {
        const topOpacityValue = letterboxSettings.topOpacity / 100;
        topBar.style.background = `rgba(0, 0, 0, ${topOpacityValue})`;
        topBar.style.height = `${letterboxSettings.topHeight}px`;
        topBar.style.display = 'block';
    } else {
        topBar.style.display = 'none';
    }

    // 하단 바
    if (letterboxSettings.bottomEnabled) {
        const bottomOpacityValue = letterboxSettings.bottomOpacity / 100;
        bottomBar.style.background = `rgba(0, 0, 0, ${bottomOpacityValue})`;
        bottomBar.style.height = `${letterboxSettings.bottomHeight}px`;
        bottomBar.style.display = 'block';
    } else {
        bottomBar.style.display = 'none';
    }
}

// 글자 가림 박스 업데이트
function updateCoverBox() {
    // UI에서 값 읽기
    const enabledEl = document.getElementById('coverBoxEnabled');
    const leftEl = document.getElementById('coverBoxLeft');
    const leftValueEl = document.getElementById('coverBoxLeftValue');
    const topEl = document.getElementById('coverBoxTop');
    const topValueEl = document.getElementById('coverBoxTopValue');
    const widthEl = document.getElementById('coverBoxWidth');
    const widthValueEl = document.getElementById('coverBoxWidthValue');
    const heightEl = document.getElementById('coverBoxHeight');
    const heightValueEl = document.getElementById('coverBoxHeightValue');
    const opacityEl = document.getElementById('coverBoxOpacity');
    const opacityValueEl = document.getElementById('coverBoxOpacityValue');

    // coverBoxSettings 객체 업데이트
    if (enabledEl) coverBoxSettings.enabled = enabledEl.checked;
    if (leftEl) {
        coverBoxSettings.left = parseInt(leftEl.value);
        if (leftValueEl) {
            leftValueEl.textContent = `${leftEl.value}%`;
        }
    }
    if (topEl) {
        coverBoxSettings.top = parseInt(topEl.value);
        if (topValueEl) {
            topValueEl.textContent = `${topEl.value}%`;
        }
    }
    if (widthEl) {
        coverBoxSettings.width = parseInt(widthEl.value);
        if (widthValueEl) {
            widthValueEl.textContent = `${widthEl.value}%`;
        }
    }
    if (heightEl) {
        coverBoxSettings.height = parseInt(heightEl.value);
        if (heightValueEl) {
            heightValueEl.textContent = `${heightEl.value}%`;
        }
    }
    if (opacityEl) {
        coverBoxSettings.opacity = parseInt(opacityEl.value);
        if (opacityValueEl) {
            opacityValueEl.textContent = `${opacityEl.value}%`;
        }
    }

    // 글자 가림 박스 표시
    displayCoverBox();

    // 상태 저장
    saveState();
}

// 글자 가림 박스 표시
function displayCoverBox() {
    const coverBox = document.getElementById('coverBox');
    if (!coverBox) return;

    if (coverBoxSettings.enabled) {
        const opacityValue = coverBoxSettings.opacity / 100;
        coverBox.style.background = `rgba(0, 0, 0, ${opacityValue})`;
        coverBox.style.left = `${coverBoxSettings.left}%`;
        coverBox.style.top = `${coverBoxSettings.top}%`;
        coverBox.style.width = `${coverBoxSettings.width}%`;
        coverBox.style.height = `${coverBoxSettings.height}%`;
        coverBox.style.display = 'block';
    } else {
        coverBox.style.display = 'none';
    }
}

// 비디오 효과 업데이트
function updateVideoEffects() {
    // UI에서 값 읽기
    const brightnessEl = document.getElementById('videoBrightness');
    const brightnessValueEl = document.getElementById('videoBrightnessValue');
    const contrastEl = document.getElementById('videoContrast');
    const contrastValueEl = document.getElementById('videoContrastValue');
    const saturateEl = document.getElementById('videoSaturate');
    const saturateValueEl = document.getElementById('videoSaturateValue');
    const blurEl = document.getElementById('videoBlur');
    const blurValueEl = document.getElementById('videoBlurValue');
    const grayscaleEl = document.getElementById('videoGrayscale');
    const grayscaleValueEl = document.getElementById('videoGrayscaleValue');
    const sepiaEl = document.getElementById('videoSepia');
    const sepiaValueEl = document.getElementById('videoSepiaValue');
    const hueRotateEl = document.getElementById('videoHueRotate');
    const hueRotateValueEl = document.getElementById('videoHueRotateValue');
    const invertEl = document.getElementById('videoInvert');
    const invertValueEl = document.getElementById('videoInvertValue');

    // videoEffects 객체 업데이트
    if (brightnessEl) {
        videoEffects.brightness = parseInt(brightnessEl.value);
        if (brightnessValueEl) brightnessValueEl.textContent = `${brightnessEl.value}%`;
    }
    if (contrastEl) {
        videoEffects.contrast = parseInt(contrastEl.value);
        if (contrastValueEl) contrastValueEl.textContent = `${contrastEl.value}%`;
    }
    if (saturateEl) {
        videoEffects.saturate = parseInt(saturateEl.value);
        if (saturateValueEl) saturateValueEl.textContent = `${saturateEl.value}%`;
    }
    if (blurEl) {
        videoEffects.blur = parseInt(blurEl.value);
        if (blurValueEl) blurValueEl.textContent = `${blurEl.value}px`;
    }
    if (grayscaleEl) {
        videoEffects.grayscale = parseInt(grayscaleEl.value);
        if (grayscaleValueEl) grayscaleValueEl.textContent = `${grayscaleEl.value}%`;
    }
    if (sepiaEl) {
        videoEffects.sepia = parseInt(sepiaEl.value);
        if (sepiaValueEl) sepiaValueEl.textContent = `${sepiaEl.value}%`;
    }
    if (hueRotateEl) {
        videoEffects.hueRotate = parseInt(hueRotateEl.value);
        if (hueRotateValueEl) hueRotateValueEl.textContent = `${hueRotateEl.value}°`;
    }
    if (invertEl) {
        videoEffects.invert = parseInt(invertEl.value);
        if (invertValueEl) invertValueEl.textContent = `${invertEl.value}%`;
    }

    // 비디오에 필터 적용
    applyVideoFilters();

    // 상태 저장
    saveState();

    showStatus('비디오 효과가 적용되었습니다.', 'success');
}

// 비디오에 필터 적용
function applyVideoFilters() {
    const player = document.getElementById('videoPlayer');
    if (!player) return;

    const filterString = `
        brightness(${videoEffects.brightness}%)
        contrast(${videoEffects.contrast}%)
        saturate(${videoEffects.saturate}%)
        blur(${videoEffects.blur}px)
        grayscale(${videoEffects.grayscale}%)
        sepia(${videoEffects.sepia}%)
        hue-rotate(${videoEffects.hueRotate}deg)
        invert(${videoEffects.invert}%)
    `.trim().replace(/\s+/g, ' ');

    player.style.filter = filterString;
}

// 비디오 효과 초기화
function resetVideoEffects() {
    // 기본값으로 초기화
    videoEffects = {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        blur: 0,
        grayscale: 0,
        sepia: 0,
        hueRotate: 0,
        invert: 0
    };

    // UI 컨트롤 업데이트
    const brightnessEl = document.getElementById('videoBrightness');
    const brightnessValueEl = document.getElementById('videoBrightnessValue');
    const contrastEl = document.getElementById('videoContrast');
    const contrastValueEl = document.getElementById('videoContrastValue');
    const saturateEl = document.getElementById('videoSaturate');
    const saturateValueEl = document.getElementById('videoSaturateValue');
    const blurEl = document.getElementById('videoBlur');
    const blurValueEl = document.getElementById('videoBlurValue');
    const grayscaleEl = document.getElementById('videoGrayscale');
    const grayscaleValueEl = document.getElementById('videoGrayscaleValue');
    const sepiaEl = document.getElementById('videoSepia');
    const sepiaValueEl = document.getElementById('videoSepiaValue');
    const hueRotateEl = document.getElementById('videoHueRotate');
    const hueRotateValueEl = document.getElementById('videoHueRotateValue');
    const invertEl = document.getElementById('videoInvert');
    const invertValueEl = document.getElementById('videoInvertValue');

    if (brightnessEl) {
        brightnessEl.value = 100;
        if (brightnessValueEl) brightnessValueEl.textContent = '100%';
    }
    if (contrastEl) {
        contrastEl.value = 100;
        if (contrastValueEl) contrastValueEl.textContent = '100%';
    }
    if (saturateEl) {
        saturateEl.value = 100;
        if (saturateValueEl) saturateValueEl.textContent = '100%';
    }
    if (blurEl) {
        blurEl.value = 0;
        if (blurValueEl) blurValueEl.textContent = '0px';
    }
    if (grayscaleEl) {
        grayscaleEl.value = 0;
        if (grayscaleValueEl) grayscaleValueEl.textContent = '0%';
    }
    if (sepiaEl) {
        sepiaEl.value = 0;
        if (sepiaValueEl) sepiaValueEl.textContent = '0%';
    }
    if (hueRotateEl) {
        hueRotateEl.value = 0;
        if (hueRotateValueEl) hueRotateValueEl.textContent = '0°';
    }
    if (invertEl) {
        invertEl.value = 0;
        if (invertValueEl) invertValueEl.textContent = '0%';
    }

    // 비디오에 필터 적용
    applyVideoFilters();

    // 상태 저장
    saveState();

    showStatus('비디오 효과가 초기화되었습니다.', 'success');
}

// 이미지 업로드
async function uploadImage() {
    const fileInput = document.getElementById('imageFile');
    const file = fileInput.files[0];

    if (!file) {
        showStatus('이미지 파일을 선택해주세요.', 'error');
        return;
    }

    showStatus('이미지 업로드 중...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/api/editor/upload-video`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            // 새 이미지 오버레이 객체 생성
            const newImage = {
                id: ++currentImageId,
                filename: data.filename,
                src: `${API_BASE}/uploads/${data.filename}`,
                left: 50,
                top: 50,
                width: 30,
                height: 30,
                rotation: 0,
                opacity: 100,
                animation: 'none',
                animationSpeed: '0.5s',
                brightness: 100,
                contrast: 100,
                saturate: 100,
                blur: 0,
                grayscale: 0,
                sepia: 0,
                hueRotate: 0,
                invert: 0
            };

            imageOverlays.push(newImage);
            selectedImageId = newImage.id;

            showStatus(`이미지 업로드 완료: ${file.name}`, 'success');

            // 이미지 목록 렌더링
            renderImageList();

            // 이미지 오버레이 표시
            displayImageOverlays();

            // UI 업데이트
            updateImageControls();

            // 상태 저장
            saveState();
        } else {
            showStatus('이미지 업로드 실패', 'error');
        }
    } catch (error) {
        showStatus(`업로드 오류: ${error.message}`, 'error');
    }
}

// 이미지 목록 렌더링
function renderImageList() {
    const listEl = document.getElementById('imageList');
    if (!listEl) return;

    listEl.innerHTML = '';

    imageOverlays.forEach(img => {
        const item = document.createElement('div');
        item.className = 'image-list-item';
        if (img.id === selectedImageId) {
            item.classList.add('selected');
        }

        item.innerHTML = `
            <img src="${img.src}" alt="${img.filename}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
            <span>${img.filename}</span>
            <button onclick="deleteImage(${img.id})" class="btn-delete">🗑️</button>
        `;

        item.onclick = (e) => {
            if (!e.target.classList.contains('btn-delete')) {
                selectImage(img.id);
            }
        };

        listEl.appendChild(item);
    });
}

// 이미지 선택
function selectImage(id) {
    selectedImageId = id;
    renderImageList();
    updateImageControls();
}

// 이미지 삭제
function deleteImage(id) {
    const index = imageOverlays.findIndex(img => img.id === id);
    if (index !== -1) {
        imageOverlays.splice(index, 1);

        if (selectedImageId === id) {
            selectedImageId = imageOverlays.length > 0 ? imageOverlays[0].id : null;
        }

        renderImageList();
        displayImageOverlays();
        updateImageControls();
        saveState();

        showStatus('이미지가 삭제되었습니다.', 'success');
    }
}

// 이미지 컨트롤 UI 업데이트
function updateImageControls() {
    const img = imageOverlays.find(i => i.id === selectedImageId);
    if (!img) {
        // 선택된 이미지가 없으면 컨트롤 비활성화
        return;
    }

    // 위치 및 크기
    const leftEl = document.getElementById('imageLeft');
    const leftValueEl = document.getElementById('imageLeftValue');
    const topEl = document.getElementById('imageTop');
    const topValueEl = document.getElementById('imageTopValue');
    const widthEl = document.getElementById('imageWidth');
    const widthValueEl = document.getElementById('imageWidthValue');
    const heightEl = document.getElementById('imageHeight');
    const heightValueEl = document.getElementById('imageHeightValue');
    const rotationEl = document.getElementById('imageRotation');
    const rotationValueEl = document.getElementById('imageRotationValue');
    const opacityEl = document.getElementById('imageOpacity');
    const opacityValueEl = document.getElementById('imageOpacityValue');

    if (leftEl) {
        leftEl.value = img.left;
        if (leftValueEl) leftValueEl.textContent = `${img.left}%`;
    }
    if (topEl) {
        topEl.value = img.top;
        if (topValueEl) topValueEl.textContent = `${img.top}%`;
    }
    if (widthEl) {
        widthEl.value = img.width;
        if (widthValueEl) widthValueEl.textContent = `${img.width}%`;
    }
    if (heightEl) {
        heightEl.value = img.height;
        if (heightValueEl) heightValueEl.textContent = `${img.height}%`;
    }
    if (rotationEl) {
        rotationEl.value = img.rotation;
        if (rotationValueEl) rotationValueEl.textContent = `${img.rotation}°`;
    }
    if (opacityEl) {
        opacityEl.value = img.opacity;
        if (opacityValueEl) opacityValueEl.textContent = `${img.opacity}%`;
    }

    // 애니메이션
    const animationEl = document.getElementById('imageAnimation');
    const animationSpeedEl = document.getElementById('imageAnimationSpeed');
    if (animationEl) animationEl.value = img.animation;
    if (animationSpeedEl) animationSpeedEl.value = img.animationSpeed;

    // 필터 효과
    const brightnessEl = document.getElementById('imageBrightness');
    const brightnessValueEl = document.getElementById('imageBrightnessValue');
    const contrastEl = document.getElementById('imageContrast');
    const contrastValueEl = document.getElementById('imageContrastValue');
    const saturateEl = document.getElementById('imageSaturate');
    const saturateValueEl = document.getElementById('imageSaturateValue');
    const blurEl = document.getElementById('imageBlur');
    const blurValueEl = document.getElementById('imageBlurValue');
    const grayscaleEl = document.getElementById('imageGrayscale');
    const grayscaleValueEl = document.getElementById('imageGrayscaleValue');
    const sepiaEl = document.getElementById('imageSepia');
    const sepiaValueEl = document.getElementById('imageSepiaValue');
    const hueRotateEl = document.getElementById('imageHueRotate');
    const hueRotateValueEl = document.getElementById('imageHueRotateValue');
    const invertEl = document.getElementById('imageInvert');
    const invertValueEl = document.getElementById('imageInvertValue');

    if (brightnessEl) {
        brightnessEl.value = img.brightness;
        if (brightnessValueEl) brightnessValueEl.textContent = `${img.brightness}%`;
    }
    if (contrastEl) {
        contrastEl.value = img.contrast;
        if (contrastValueEl) contrastValueEl.textContent = `${img.contrast}%`;
    }
    if (saturateEl) {
        saturateEl.value = img.saturate;
        if (saturateValueEl) saturateValueEl.textContent = `${img.saturate}%`;
    }
    if (blurEl) {
        blurEl.value = img.blur;
        if (blurValueEl) blurValueEl.textContent = `${img.blur}px`;
    }
    if (grayscaleEl) {
        grayscaleEl.value = img.grayscale;
        if (grayscaleValueEl) grayscaleValueEl.textContent = `${img.grayscale}%`;
    }
    if (sepiaEl) {
        sepiaEl.value = img.sepia;
        if (sepiaValueEl) sepiaValueEl.textContent = `${img.sepia}%`;
    }
    if (hueRotateEl) {
        hueRotateEl.value = img.hueRotate;
        if (hueRotateValueEl) hueRotateValueEl.textContent = `${img.hueRotate}°`;
    }
    if (invertEl) {
        invertEl.value = img.invert;
        if (invertValueEl) invertValueEl.textContent = `${img.invert}%`;
    }
}

// 이미지 설정 업데이트
function updateImageSettings() {
    const img = imageOverlays.find(i => i.id === selectedImageId);
    if (!img) return;

    // UI에서 값 읽기
    const leftEl = document.getElementById('imageLeft');
    const leftValueEl = document.getElementById('imageLeftValue');
    const topEl = document.getElementById('imageTop');
    const topValueEl = document.getElementById('imageTopValue');
    const widthEl = document.getElementById('imageWidth');
    const widthValueEl = document.getElementById('imageWidthValue');
    const heightEl = document.getElementById('imageHeight');
    const heightValueEl = document.getElementById('imageHeightValue');
    const rotationEl = document.getElementById('imageRotation');
    const rotationValueEl = document.getElementById('imageRotationValue');
    const opacityEl = document.getElementById('imageOpacity');
    const opacityValueEl = document.getElementById('imageOpacityValue');
    const animationEl = document.getElementById('imageAnimation');
    const animationSpeedEl = document.getElementById('imageAnimationSpeed');

    // 이미지 객체 업데이트
    if (leftEl) {
        img.left = parseInt(leftEl.value);
        if (leftValueEl) leftValueEl.textContent = `${leftEl.value}%`;
    }
    if (topEl) {
        img.top = parseInt(topEl.value);
        if (topValueEl) topValueEl.textContent = `${topEl.value}%`;
    }
    if (widthEl) {
        const newWidth = parseInt(widthEl.value);
        img.width = newWidth;
        if (widthValueEl) widthValueEl.textContent = `${widthEl.value}%`;

        // 종횡비 유지 모드일 경우 높이도 자동 조정
        if (maintainAspectRatio && originalAspectRatio > 0 && heightEl) {
            const newHeight = Math.round(newWidth / originalAspectRatio);
            img.height = newHeight;
            heightEl.value = newHeight;
            if (heightValueEl) heightValueEl.textContent = `${newHeight}%`;
        }
    }
    if (heightEl && !maintainAspectRatio) {
        // 종횡비 유지 모드가 아닐 때만 높이를 독립적으로 조정
        img.height = parseInt(heightEl.value);
        if (heightValueEl) heightValueEl.textContent = `${heightEl.value}%`;
    }
    if (rotationEl) {
        img.rotation = parseInt(rotationEl.value);
        if (rotationValueEl) rotationValueEl.textContent = `${rotationEl.value}°`;
    }
    if (opacityEl) {
        img.opacity = parseInt(opacityEl.value);
        if (opacityValueEl) opacityValueEl.textContent = `${opacityEl.value}%`;
    }
    if (animationEl) img.animation = animationEl.value;
    if (animationSpeedEl) img.animationSpeed = animationSpeedEl.value;

    // 이미지 오버레이 표시 업데이트
    displayImageOverlays();

    // 상태 저장
    saveState();
}

// 이미지 필터 효과 업데이트
function updateImageEffects() {
    const img = imageOverlays.find(i => i.id === selectedImageId);
    if (!img) return;

    // UI에서 값 읽기
    const brightnessEl = document.getElementById('imageBrightness');
    const brightnessValueEl = document.getElementById('imageBrightnessValue');
    const contrastEl = document.getElementById('imageContrast');
    const contrastValueEl = document.getElementById('imageContrastValue');
    const saturateEl = document.getElementById('imageSaturate');
    const saturateValueEl = document.getElementById('imageSaturateValue');
    const blurEl = document.getElementById('imageBlur');
    const blurValueEl = document.getElementById('imageBlurValue');
    const grayscaleEl = document.getElementById('imageGrayscale');
    const grayscaleValueEl = document.getElementById('imageGrayscaleValue');
    const sepiaEl = document.getElementById('imageSepia');
    const sepiaValueEl = document.getElementById('imageSepiaValue');
    const hueRotateEl = document.getElementById('imageHueRotate');
    const hueRotateValueEl = document.getElementById('imageHueRotateValue');
    const invertEl = document.getElementById('imageInvert');
    const invertValueEl = document.getElementById('imageInvertValue');

    // 이미지 객체 업데이트
    if (brightnessEl) {
        img.brightness = parseInt(brightnessEl.value);
        if (brightnessValueEl) brightnessValueEl.textContent = `${brightnessEl.value}%`;
    }
    if (contrastEl) {
        img.contrast = parseInt(contrastEl.value);
        if (contrastValueEl) contrastValueEl.textContent = `${contrastEl.value}%`;
    }
    if (saturateEl) {
        img.saturate = parseInt(saturateEl.value);
        if (saturateValueEl) saturateValueEl.textContent = `${saturateEl.value}%`;
    }
    if (blurEl) {
        img.blur = parseInt(blurEl.value);
        if (blurValueEl) blurValueEl.textContent = `${blurEl.value}px`;
    }
    if (grayscaleEl) {
        img.grayscale = parseInt(grayscaleEl.value);
        if (grayscaleValueEl) grayscaleValueEl.textContent = `${grayscaleEl.value}%`;
    }
    if (sepiaEl) {
        img.sepia = parseInt(sepiaEl.value);
        if (sepiaValueEl) sepiaValueEl.textContent = `${sepiaEl.value}%`;
    }
    if (hueRotateEl) {
        img.hueRotate = parseInt(hueRotateEl.value);
        if (hueRotateValueEl) hueRotateValueEl.textContent = `${hueRotateEl.value}°`;
    }
    if (invertEl) {
        img.invert = parseInt(invertEl.value);
        if (invertValueEl) invertValueEl.textContent = `${invertEl.value}%`;
    }

    // 이미지 오버레이 표시 업데이트
    displayImageOverlays();

    // 상태 저장
    saveState();

    showStatus('이미지 효과가 적용되었습니다.', 'success');
}

// 이미지 프리셋 적용
function setImagePreset(preset) {
    const img = imageOverlays.find(i => i.id === selectedImageId);
    if (!img) {
        showStatus('이미지를 먼저 선택해주세요.', 'warning');
        return;
    }

    const leftEl = document.getElementById('imageLeft');
    const topEl = document.getElementById('imageTop');
    const widthEl = document.getElementById('imageWidth');
    const heightEl = document.getElementById('imageHeight');

    if (!leftEl || !topEl || !widthEl || !heightEl) return;

    switch(preset) {
        case 'fill':
            // 화면 전체 채우기
            leftEl.value = 0;
            topEl.value = 0;
            widthEl.value = 100;
            heightEl.value = 100;
            showStatus('화면 전체로 이미지를 확대했습니다.', 'success');
            break;

        case 'center':
            // 중앙 정렬 (크기는 유지)
            const currentWidth = parseInt(widthEl.value);
            const currentHeight = parseInt(heightEl.value);
            leftEl.value = Math.round((100 - currentWidth) / 2);
            topEl.value = Math.round((100 - currentHeight) / 2);
            showStatus('이미지를 중앙에 배치했습니다.', 'success');
            break;

        case 'half':
            // 절반 크기로 중앙 배치
            leftEl.value = 25;
            topEl.value = 25;
            widthEl.value = 50;
            heightEl.value = 50;
            showStatus('이미지를 절반 크기로 조정했습니다.', 'success');
            break;

        case 'quarter':
            // 1/4 크기로 중앙 배치
            leftEl.value = 37.5;
            topEl.value = 37.5;
            widthEl.value = 25;
            heightEl.value = 25;
            showStatus('이미지를 1/4 크기로 조정했습니다.', 'success');
            break;

        case 'top-left':
            // 좌상단 (30% 크기)
            leftEl.value = 5;
            topEl.value = 5;
            widthEl.value = 30;
            heightEl.value = 30;
            showStatus('이미지를 좌상단에 배치했습니다.', 'success');
            break;

        case 'top-right':
            // 우상단 (30% 크기)
            leftEl.value = 65;
            topEl.value = 5;
            widthEl.value = 30;
            heightEl.value = 30;
            showStatus('이미지를 우상단에 배치했습니다.', 'success');
            break;

        case 'bottom-left':
            // 좌하단 (30% 크기)
            leftEl.value = 5;
            topEl.value = 65;
            widthEl.value = 30;
            heightEl.value = 30;
            showStatus('이미지를 좌하단에 배치했습니다.', 'success');
            break;

        case 'bottom-right':
            // 우하단 (30% 크기)
            leftEl.value = 65;
            topEl.value = 65;
            widthEl.value = 30;
            heightEl.value = 30;
            showStatus('이미지를 우하단에 배치했습니다.', 'success');
            break;
    }

    // UI 업데이트 및 저장
    updateImageSettings();
}

// 종횡비 유지 토글
function toggleAspectRatio() {
    const checkbox = document.getElementById('maintainAspectRatio');
    if (!checkbox) return;

    maintainAspectRatio = checkbox.checked;

    if (maintainAspectRatio) {
        // 현재 너비/높이 비율을 저장
        const img = imageOverlays.find(i => i.id === selectedImageId);
        if (img) {
            originalAspectRatio = img.width / img.height;
            showStatus('종횡비 유지 모드가 활성화되었습니다.', 'info');
        }
    } else {
        showStatus('종횡비 유지 모드가 비활성화되었습니다.', 'info');
    }
}

// 드래그 시작 (이미지 이동)
let dragState = null;

function startDrag(e, imageId) {
    e.preventDefault();
    e.stopPropagation();

    const img = imageOverlays.find(i => i.id === imageId);
    if (!img) return;

    // 이미지 선택
    selectImage(imageId);

    // 비디오 컨테이너 크기 가져오기
    const videoContainer = document.getElementById('videoContainer');
    if (!videoContainer) return;

    const rect = videoContainer.getBoundingClientRect();

    dragState = {
        type: 'move',
        imageId: imageId,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: img.left,
        startTop: img.top,
        containerWidth: rect.width,
        containerHeight: rect.height
    };

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
}

function onDrag(e) {
    if (!dragState) return;

    const img = imageOverlays.find(i => i.id === dragState.imageId);
    if (!img) return;

    if (dragState.type === 'move') {
        // 이동 처리
        const deltaX = e.clientX - dragState.startX;
        const deltaY = e.clientY - dragState.startY;

        const deltaXPercent = (deltaX / dragState.containerWidth) * 100;
        const deltaYPercent = (deltaY / dragState.containerHeight) * 100;

        img.left = Math.max(0, Math.min(100, dragState.startLeft + deltaXPercent));
        img.top = Math.max(0, Math.min(100, dragState.startTop + deltaYPercent));

        // UI 업데이트
        const leftEl = document.getElementById('imageLeft');
        const topEl = document.getElementById('imageTop');
        if (leftEl) {
            leftEl.value = Math.round(img.left);
            document.getElementById('imageLeftValue').textContent = `${Math.round(img.left)}%`;
        }
        if (topEl) {
            topEl.value = Math.round(img.top);
            document.getElementById('imageTopValue').textContent = `${Math.round(img.top)}%`;
        }

        displayImageOverlays();
    }
}

function stopDrag() {
    if (dragState) {
        saveState();
        dragState = null;
    }
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
}

// 리사이즈 시작
let resizeState = null;

function startResize(e, imageId, handlePos) {
    e.preventDefault();
    e.stopPropagation();

    const img = imageOverlays.find(i => i.id === imageId);
    if (!img) return;

    // 이미지 선택
    selectImage(imageId);

    // 비디오 컨테이너 크기 가져오기
    const videoContainer = document.getElementById('videoContainer');
    if (!videoContainer) return;

    const rect = videoContainer.getBoundingClientRect();

    resizeState = {
        imageId: imageId,
        handle: handlePos,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: img.left,
        startTop: img.top,
        startWidth: img.width,
        startHeight: img.height,
        containerWidth: rect.width,
        containerHeight: rect.height,
        aspectRatio: img.width / img.height
    };

    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
}

function onResize(e) {
    if (!resizeState) return;

    const img = imageOverlays.find(i => i.id === resizeState.imageId);
    if (!img) return;

    const deltaX = e.clientX - resizeState.startX;
    const deltaY = e.clientY - resizeState.startY;

    const deltaXPercent = (deltaX / resizeState.containerWidth) * 100;
    const deltaYPercent = (deltaY / resizeState.containerHeight) * 100;

    const handle = resizeState.handle;

    // 새로운 크기 계산
    let newWidth = resizeState.startWidth;
    let newHeight = resizeState.startHeight;
    let newLeft = resizeState.startLeft;
    let newTop = resizeState.startTop;

    // 동서 방향 조정
    if (handle.includes('e')) {
        newWidth = Math.max(5, Math.min(100, resizeState.startWidth + deltaXPercent));
    } else if (handle.includes('w')) {
        newWidth = Math.max(5, Math.min(100, resizeState.startWidth - deltaXPercent));
        newLeft = resizeState.startLeft + (resizeState.startWidth - newWidth) / 2;
    }

    // 남북 방향 조정
    if (handle.includes('s')) {
        newHeight = Math.max(5, Math.min(100, resizeState.startHeight + deltaYPercent));
    } else if (handle.includes('n')) {
        newHeight = Math.max(5, Math.min(100, resizeState.startHeight - deltaYPercent));
        newTop = resizeState.startTop + (resizeState.startHeight - newHeight) / 2;
    }

    // 종횡비 유지 모드
    if (maintainAspectRatio && resizeState.aspectRatio > 0) {
        // 너비 기준으로 높이 조정 (동서 핸들 또는 모서리 핸들)
        if (handle.includes('e') || handle.includes('w')) {
            newHeight = newWidth / resizeState.aspectRatio;
            // 위치도 조정 (중앙 유지)
            if (handle.includes('n') || handle.includes('s')) {
                newTop = resizeState.startTop + (resizeState.startHeight - newHeight) / 2;
            }
        }
    }

    // 값 적용
    img.width = Math.round(newWidth);
    img.height = Math.round(newHeight);
    img.left = Math.round(newLeft);
    img.top = Math.round(newTop);

    // UI 업데이트
    updateImageControlsFromData();
    displayImageOverlays();
}

function stopResize() {
    if (resizeState) {
        saveState();
        resizeState = null;
    }
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
}

// 데이터에서 UI 컨트롤 업데이트
function updateImageControlsFromData() {
    const img = imageOverlays.find(i => i.id === selectedImageId);
    if (!img) return;

    const leftEl = document.getElementById('imageLeft');
    const topEl = document.getElementById('imageTop');
    const widthEl = document.getElementById('imageWidth');
    const heightEl = document.getElementById('imageHeight');

    if (leftEl) {
        leftEl.value = Math.round(img.left);
        document.getElementById('imageLeftValue').textContent = `${Math.round(img.left)}%`;
    }
    if (topEl) {
        topEl.value = Math.round(img.top);
        document.getElementById('imageTopValue').textContent = `${Math.round(img.top)}%`;
    }
    if (widthEl) {
        widthEl.value = Math.round(img.width);
        document.getElementById('imageWidthValue').textContent = `${Math.round(img.width)}%`;
    }
    if (heightEl) {
        heightEl.value = Math.round(img.height);
        document.getElementById('imageHeightValue').textContent = `${Math.round(img.height)}%`;
    }
}

// 이미지 오버레이 표시
function displayImageOverlays() {
    const container = document.getElementById('imageOverlayContainer');
    if (!container) return;

    // 기존 이미지 모두 제거
    container.innerHTML = '';

    // 모든 이미지 오버레이 생성
    imageOverlays.forEach(img => {
        // 래퍼 div 생성
        const wrapper = document.createElement('div');
        wrapper.className = 'image-overlay-wrapper';
        wrapper.dataset.id = img.id;
        if (img.id === selectedImageId) {
            wrapper.classList.add('selected');
        }

        // 이미지 엘리먼트 생성
        const imgEl = document.createElement('img');
        imgEl.className = 'image-overlay';
        imgEl.src = img.src;
        imgEl.style.width = '100%';
        imgEl.style.height = '100%';
        imgEl.style.opacity = img.opacity / 100;

        // 필터 적용
        const filterString = `
            brightness(${img.brightness}%)
            contrast(${img.contrast}%)
            saturate(${img.saturate}%)
            blur(${img.blur}px)
            grayscale(${img.grayscale}%)
            sepia(${img.sepia}%)
            hue-rotate(${img.hueRotate}deg)
            invert(${img.invert}%)
        `.trim().replace(/\s+/g, ' ');
        imgEl.style.filter = filterString;

        // 래퍼 스타일 적용
        wrapper.style.left = `${img.left}%`;
        wrapper.style.top = `${img.top}%`;
        wrapper.style.width = `${img.width}%`;
        wrapper.style.height = `${img.height}%`;
        wrapper.style.transform = `translate(-50%, -50%) rotate(${img.rotation}deg)`;

        // CSS 변수 설정 (애니메이션 속도 및 회전)
        wrapper.style.setProperty('--image-animation-speed', img.animationSpeed);
        wrapper.style.setProperty('--image-rotation', `${img.rotation}deg`);

        // 애니메이션 클래스 추가 (wrapper에 적용)
        if (img.animation !== 'none') {
            wrapper.classList.add(`img-${img.animation}`);
        }

        // 리사이즈 핸들 추가
        const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        handles.forEach(handlePos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${handlePos}`;
            handle.dataset.handle = handlePos;
            handle.addEventListener('mousedown', (e) => startResize(e, img.id, handlePos));
            wrapper.appendChild(handle);
        });

        // 이미지를 래퍼에 추가
        wrapper.appendChild(imgEl);

        // 드래그 이벤트 추가 (이미지 이동)
        imgEl.addEventListener('mousedown', (e) => startDrag(e, img.id));

        // 클릭으로 선택
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            selectImage(img.id);
        });

        container.appendChild(wrapper);
    });
}

// 패널 토글 (숨기기/펼치기)
function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    // 패널 상태 토글
    const isCollapsed = panel.classList.contains('collapsed');

    if (isCollapsed) {
        // 펼치기
        panel.classList.remove('collapsed');
        panelStates[panelId] = true;
    } else {
        // 접기
        panel.classList.add('collapsed');
        panelStates[panelId] = false;
    }

    // 버튼 ID 매핑
    const buttonIdMap = {
        'coverBoxPanel': 'coverBoxToggle',
        'letterboxPanel': 'letterboxToggle',
        'titlePanel': 'titleToggle',
        'subtitleEffectsPanel': 'subtitleEffectsToggle',
        'videoEffectsPanel': 'videoEffectsToggle',
        'imagePanel': 'imageToggle'
    };

    const buttonId = buttonIdMap[panelId];
    const button = document.getElementById(buttonId);

    if (button) {
        button.textContent = isCollapsed ? '▼ 숨기기' : '▶ 펼치기';
    }

    // 상태 저장
    saveState();
}

// 자막 분할 (Shift+Enter)
function splitSubtitle(id, cursorPosition) {
    const subtitleIndex = subtitles.findIndex(s => s.id === id);
    if (subtitleIndex === -1) return;

    const subtitle = subtitles[subtitleIndex];
    const fullText = subtitle.text;

    // 텍스트 분할
    const beforeText = fullText.substring(0, cursorPosition).trim();
    const afterText = fullText.substring(cursorPosition).trim();

    // 둘 다 비어있지 않은 경우만 분할
    if (!beforeText || !afterText) {
        showStatus('분할할 위치에 텍스트가 있어야 합니다.', 'error');
        return;
    }

    // 시간 분할 (중간 시점으로)
    const duration = subtitle.end - subtitle.start;
    const midPoint = subtitle.start + (duration / 2);
    const originalEnd = subtitle.end; // 원래 끝 시간 보존

    // 새 ID 생성 (기존 최대 ID + 1)
    const maxId = Math.max(...subtitles.map(s => s.id));
    const newId = maxId + 1;

    // 첫 번째 자막 업데이트
    subtitle.text = beforeText;
    subtitle.end = midPoint;

    // 두 번째 자막 생성
    const newSubtitle = {
        id: newId,
        start: midPoint,
        end: originalEnd, // 원래 끝 시간 사용
        text: afterText
    };

    // 배열에 삽입
    subtitles.splice(subtitleIndex + 1, 0, newSubtitle);

    // 선택 상태 처리 (원본이 선택되어 있었다면 둘 다 선택)
    if (selectedIds.has(id)) {
        selectedIds.add(newId);
    }

    // 타임라인 재렌더링
    renderTimeline();

    // 상태 저장
    saveState();

    showStatus('자막이 분할되었습니다.', 'success');
}

// 자막 오버레이 업데이트
function updateSubtitleOverlay(currentTime) {
    const overlay = document.getElementById('subtitleOverlay');
    if (!overlay) return;

    const currentSub = getCurrentSubtitle(currentTime);

    if (currentSub) {
        // 배경색 RGBA 생성
        const bgOpacityValue = subtitleEffects.bgOpacity / 100;
        const bgColorRGB = hexToRgb(subtitleEffects.bgColor);
        const bgColorRGBA = `rgba(${bgColorRGB.r}, ${bgColorRGB.g}, ${bgColorRGB.b}, ${bgOpacityValue})`;

        // subtitle-line div 생성 및 스타일 적용
        const subtitleLine = document.createElement('div');
        subtitleLine.className = 'subtitle-line';

        // 텍스트 변형 적용
        let displayText = currentSub.text;
        if (subtitleEffects.textTransform === 'uppercase') {
            displayText = displayText.toUpperCase();
        } else if (subtitleEffects.textTransform === 'lowercase') {
            displayText = displayText.toLowerCase();
        } else if (subtitleEffects.textTransform === 'capitalize') {
            displayText = displayText.replace(/\b\w/g, l => l.toUpperCase());
        }

        // 글자별 애니메이션이 있는 경우 각 글자를 span으로 감싸기
        if (subtitleEffects.letterAnimation !== 'none') {
            displayText.split('').forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.style.animationDelay = `${index * 0.05}s`;
                span.classList.add(`letter-${subtitleEffects.letterAnimation}`);
                subtitleLine.appendChild(span);
            });
        } else {
            subtitleLine.textContent = displayText;
        }

        // 애니메이션 클래스 추가
        if (subtitleEffects.animation !== 'none') {
            subtitleLine.classList.add(subtitleEffects.animation);
        }

        // 기본 스타일 적용
        subtitleLine.style.fontSize = subtitleEffects.fontSize;
        subtitleLine.style.background = bgColorRGBA;
        subtitleLine.style.border = subtitleEffects.borderStyle;
        subtitleLine.style.letterSpacing = `${subtitleEffects.letterSpacing}px`;
        subtitleLine.style.setProperty('--animation-speed', subtitleEffects.animationSpeed);

        // 텍스트 색상 또는 그라데이션 적용
        if (subtitleEffects.gradientEnabled) {
            const gradient = `linear-gradient(${subtitleEffects.gradientAngle}deg, ${subtitleEffects.gradientColor1}, ${subtitleEffects.gradientColor2})`;
            subtitleLine.style.background = gradient;
            subtitleLine.style.webkitBackgroundClip = 'text';
            subtitleLine.style.webkitTextFillColor = 'transparent';
            subtitleLine.style.backgroundClip = 'text';
            // 배경색은 무시하고 그라데이션만 적용
        } else {
            subtitleLine.style.color = subtitleEffects.fontColor;
        }

        // 텍스트 스트로크 적용
        if (subtitleEffects.textStroke > 0) {
            subtitleLine.style.webkitTextStroke = `${subtitleEffects.textStroke}px ${subtitleEffects.textStrokeColor}`;
        }

        // 글로우 효과 적용
        let shadowEffect = subtitleEffects.textShadow;
        if (subtitleEffects.glowEffect !== 'none') {
            const glowShadows = {
                'soft': `0 0 10px ${subtitleEffects.fontColor}, 0 0 20px ${subtitleEffects.fontColor}`,
                'medium': `0 0 10px ${subtitleEffects.fontColor}, 0 0 20px ${subtitleEffects.fontColor}, 0 0 30px ${subtitleEffects.fontColor}`,
                'strong': `0 0 10px ${subtitleEffects.fontColor}, 0 0 20px ${subtitleEffects.fontColor}, 0 0 40px ${subtitleEffects.fontColor}, 0 0 60px ${subtitleEffects.fontColor}`,
                'neon': `0 0 5px #fff, 0 0 10px #fff, 0 0 15px ${subtitleEffects.fontColor}, 0 0 20px ${subtitleEffects.fontColor}, 0 0 35px ${subtitleEffects.fontColor}, 0 0 40px ${subtitleEffects.fontColor}`
            };
            shadowEffect = glowShadows[subtitleEffects.glowEffect] || shadowEffect;
        }
        subtitleLine.style.textShadow = shadowEffect;

        overlay.innerHTML = '';
        overlay.appendChild(subtitleLine);
    } else {
        overlay.innerHTML = '';
    }
}

// HEX 색상을 RGB로 변환하는 헬퍼 함수
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

// 비디오 화면 비율 변경
function setAspectRatio(ratio) {
    const container = document.getElementById('videoContainer');
    const btnYoutube = document.getElementById('btnYoutube');
    const btnShorts = document.getElementById('btnShorts');

    if (!container) return;

    // 비율 설정
    container.setAttribute('data-aspect', ratio);
    currentAspectRatio = ratio;

    // 버튼 활성화 상태 변경
    if (ratio === 'youtube') {
        btnYoutube.classList.add('active');
        btnShorts.classList.remove('active');
        showStatus('유튜브 비율(16:9)로 변경되었습니다.', 'success');
    } else {
        btnShorts.classList.add('active');
        btnYoutube.classList.remove('active');
        showStatus('쇼츠 비율(9:16)로 변경되었습니다.', 'success');
    }

    // 현재 슬라이더 값에 따라 크기 재적용
    setVideoSizeSlider(currentVideoSize);

    // 상태 저장
    saveState();
}

// 슬라이더 배경 업데이트
function updateSliderBackground(slider, value) {
    const min = slider.min || 25;
    const max = slider.max || 100;
    const percentage = ((value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, #667eea ${percentage}%, #dee2e6 ${percentage}%)`;
}

// 비디오 크기 변경 (슬라이더)
function setVideoSizeSlider(value) {
    const container = document.getElementById('videoContainer');
    const sizeValueEl = document.getElementById('sizeValue');
    const slider = document.getElementById('sizeSlider');

    if (!container) return;

    // 크기 설정 (퍼센트 값 직접 적용)
    currentVideoSize = parseInt(value);

    // 유튜브 비율
    if (currentAspectRatio === 'youtube') {
        container.style.maxWidth = `${value}%`;
    } else {
        // 쇼츠 비율 (절반 크기)
        container.style.maxWidth = `${value / 2}%`;
    }

    // 값 표시 업데이트
    if (sizeValueEl) {
        sizeValueEl.textContent = value;
    }

    // 슬라이더 배경 업데이트
    if (slider) {
        updateSliderBackground(slider, value);
    }

    // 상태 저장
    saveState();
}

// localStorage에 상태 저장
function saveState() {
    const state = {
        currentVideoPath,
        currentVideoFilename,
        currentSubtitlePath,
        subtitles,
        selectedIds: Array.from(selectedIds),
        currentAspectRatio,
        currentVideoSize,
        subtitleEffects,
        videoTitleSettings,
        letterboxSettings,
        coverBoxSettings,
        panelStates,
        playerSettings,
        videoEffects,
        imageOverlays,
        selectedImageId,
        currentImageId,
        timestamp: Date.now()
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        console.log('State saved to localStorage');
    } catch (error) {
        console.error('Failed to save state:', error);
    }
}

// localStorage에서 상태 복원
function loadState() {
    try {
        const savedState = localStorage.getItem(STORAGE_KEY);
        if (!savedState) {
            console.log('No saved state found');
            return false;
        }

        const state = JSON.parse(savedState);

        // 상태 복원
        currentVideoPath = state.currentVideoPath || '';
        currentVideoFilename = state.currentVideoFilename || '';
        currentSubtitlePath = state.currentSubtitlePath || '';
        subtitles = state.subtitles || [];
        selectedIds = new Set(state.selectedIds || []);
        currentAspectRatio = state.currentAspectRatio || 'youtube';
        currentVideoSize = state.currentVideoSize || 50;

        // 자막 효과 복원
        if (state.subtitleEffects) {
            subtitleEffects = state.subtitleEffects;
        }

        // 제목 설정 복원
        if (state.videoTitleSettings) {
            videoTitleSettings = state.videoTitleSettings;
        }

        // 레터박스 설정 복원
        if (state.letterboxSettings) {
            letterboxSettings = state.letterboxSettings;
        }

        // 글자 가림 박스 설정 복원
        if (state.coverBoxSettings) {
            coverBoxSettings = state.coverBoxSettings;
        }

        // 패널 상태 복원
        if (state.panelStates) {
            panelStates = state.panelStates;
        }

        // 플레이어 설정 복원
        if (state.playerSettings) {
            playerSettings = state.playerSettings;
        }

        // 비디오 효과 복원
        if (state.videoEffects) {
            videoEffects = state.videoEffects;
        }

        // 이미지 오버레이 복원
        if (state.imageOverlays) {
            imageOverlays = state.imageOverlays;
        }
        if (state.selectedImageId !== undefined) {
            selectedImageId = state.selectedImageId;
        }
        if (state.currentImageId !== undefined) {
            currentImageId = state.currentImageId;
        }

        // UI 복원
        if (currentVideoFilename) {
            const player = document.getElementById('videoPlayer');
            player.src = `${API_BASE}/uploads/${currentVideoFilename}`;
            document.getElementById('playerSection').style.display = 'block';

            // 비디오 메타데이터 업데이트
            player.onloadedmetadata = () => {
                document.getElementById('duration').textContent = formatTime(player.duration);
            };

            // 비디오 재생 시 제목 애니메이션 다시 실행
            player.onplay = () => {
                displayTitle();
            };

            player.ontimeupdate = () => {
                document.getElementById('currentTime').textContent = formatTime(player.currentTime);
                // 자막 오버레이 업데이트
                updateSubtitleOverlay(player.currentTime);
            };

            // 음소거 상태 변경 시 저장
            player.onvolumechange = () => {
                playerSettings.muted = player.muted;
                playerSettings.volume = player.volume;
                saveState();
            };

            // 플레이어 설정 적용 (음소거, 볼륨)
            player.muted = playerSettings.muted || false;
            player.volume = playerSettings.volume || 1.0;

            showStatus(`비디오 복원됨: ${currentVideoFilename}`, 'success');
        }

        if (subtitles.length > 0) {
            renderTimeline();
            document.getElementById('timelineSection').style.display = 'block';
            showStatus(`자막 복원됨: ${subtitles.length}개 구간, ${selectedIds.size}개 선택됨`, 'success');
        }

        // 비율 및 크기 복원
        const container = document.getElementById('videoContainer');
        const btnYoutube = document.getElementById('btnYoutube');
        const btnShorts = document.getElementById('btnShorts');
        const slider = document.getElementById('sizeSlider');
        const sizeValueEl = document.getElementById('sizeValue');

        if (container) {
            // 비율 복원
            container.setAttribute('data-aspect', currentAspectRatio);
            if (currentAspectRatio === 'youtube') {
                btnYoutube.classList.add('active');
                btnShorts.classList.remove('active');
            } else {
                btnShorts.classList.add('active');
                btnYoutube.classList.remove('active');
            }

            // 슬라이더 값 복원
            if (slider) {
                slider.value = currentVideoSize;
                updateSliderBackground(slider, currentVideoSize);
            }

            if (sizeValueEl) {
                sizeValueEl.textContent = currentVideoSize;
            }

            // 크기 적용
            if (currentAspectRatio === 'youtube') {
                container.style.maxWidth = `${currentVideoSize}%`;
            } else {
                container.style.maxWidth = `${currentVideoSize / 2}%`;
            }
        }

        // 자막 효과 UI 복원
        const fontSizeEl = document.getElementById('fontSize');
        const fontColorEl = document.getElementById('fontColor');
        const bgColorEl = document.getElementById('bgColor');
        const bgOpacityEl = document.getElementById('bgOpacity');
        const bgOpacityValueEl = document.getElementById('bgOpacityValue');
        const borderStyleEl = document.getElementById('borderStyle');
        const textShadowEl = document.getElementById('textShadow');
        const animationEl = document.getElementById('animation');
        const animationSpeedEl = document.getElementById('animationSpeed');

        if (fontSizeEl) fontSizeEl.value = subtitleEffects.fontSize;
        if (fontColorEl) fontColorEl.value = subtitleEffects.fontColor;
        if (bgColorEl) bgColorEl.value = subtitleEffects.bgColor;
        if (bgOpacityEl) {
            bgOpacityEl.value = subtitleEffects.bgOpacity;
            if (bgOpacityValueEl) {
                bgOpacityValueEl.textContent = `${subtitleEffects.bgOpacity}%`;
            }
        }
        if (borderStyleEl) borderStyleEl.value = subtitleEffects.borderStyle;
        if (textShadowEl) textShadowEl.value = subtitleEffects.textShadow;
        if (animationEl) animationEl.value = subtitleEffects.animation;
        if (animationSpeedEl) animationSpeedEl.value = subtitleEffects.animationSpeed;

        // 제목 UI 복원
        const videoTitleEl = document.getElementById('videoTitle');
        const titleFontSizeEl = document.getElementById('titleFontSize');
        const titleColorEl = document.getElementById('titleColor');
        const titleBgColorEl = document.getElementById('titleBgColor');
        const titleBgOpacityEl = document.getElementById('titleBgOpacity');
        const titleBgOpacityValueEl = document.getElementById('titleBgOpacityValue');
        const titlePositionEl = document.getElementById('titlePosition');
        const titleShadowEl = document.getElementById('titleShadow');

        // 정적 효과 UI 요소
        const titleBorderStyleEl = document.getElementById('titleBorderStyle');
        const titleBorderWidthEl = document.getElementById('titleBorderWidth');
        const titleBorderWidthValueEl = document.getElementById('titleBorderWidthValue');
        const titleBorderColorEl = document.getElementById('titleBorderColor');
        const titleBorderRadiusEl = document.getElementById('titleBorderRadius');
        const titleBorderRadiusValueEl = document.getElementById('titleBorderRadiusValue');

        // 동적 효과 UI 요소
        const titleAnimationEl = document.getElementById('titleAnimation');
        const titleAnimationSpeedEl = document.getElementById('titleAnimationSpeed');

        if (videoTitleEl) videoTitleEl.value = videoTitleSettings.text;
        if (titleFontSizeEl) titleFontSizeEl.value = videoTitleSettings.fontSize;
        if (titleColorEl) titleColorEl.value = videoTitleSettings.color;
        if (titleBgColorEl) titleBgColorEl.value = videoTitleSettings.bgColor;
        if (titleBgOpacityEl) {
            titleBgOpacityEl.value = videoTitleSettings.bgOpacity;
            if (titleBgOpacityValueEl) {
                titleBgOpacityValueEl.textContent = `${videoTitleSettings.bgOpacity}%`;
            }
        }
        if (titlePositionEl) titlePositionEl.value = videoTitleSettings.position;
        if (titleShadowEl) titleShadowEl.value = videoTitleSettings.shadow;

        // 정적 효과 복원
        if (titleBorderStyleEl) titleBorderStyleEl.value = videoTitleSettings.borderStyle || 'none';
        if (titleBorderWidthEl) {
            titleBorderWidthEl.value = videoTitleSettings.borderWidth || 0;
            if (titleBorderWidthValueEl) {
                titleBorderWidthValueEl.textContent = `${videoTitleSettings.borderWidth || 0}px`;
            }
        }
        if (titleBorderColorEl) titleBorderColorEl.value = videoTitleSettings.borderColor || '#ffffff';
        if (titleBorderRadiusEl) {
            titleBorderRadiusEl.value = videoTitleSettings.borderRadius || 8;
            if (titleBorderRadiusValueEl) {
                titleBorderRadiusValueEl.textContent = `${videoTitleSettings.borderRadius || 8}px`;
            }
        }

        // 동적 효과 복원
        if (titleAnimationEl) titleAnimationEl.value = videoTitleSettings.animation || 'none';
        if (titleAnimationSpeedEl) titleAnimationSpeedEl.value = videoTitleSettings.animationSpeed || '0.5s';

        // 제목 표시
        displayTitle();

        // 레터박스 UI 복원
        const topEnabledEl = document.getElementById('topBarEnabled');
        const topHeightEl = document.getElementById('topBarHeight');
        const topHeightValueEl = document.getElementById('topBarHeightValue');
        const topOpacityEl = document.getElementById('topBarOpacity');
        const topOpacityValueEl = document.getElementById('topBarOpacityValue');

        const bottomEnabledEl = document.getElementById('bottomBarEnabled');
        const bottomHeightEl = document.getElementById('bottomBarHeight');
        const bottomHeightValueEl = document.getElementById('bottomBarHeightValue');
        const bottomOpacityEl = document.getElementById('bottomBarOpacity');
        const bottomOpacityValueEl = document.getElementById('bottomBarOpacityValue');

        if (topEnabledEl) topEnabledEl.checked = letterboxSettings.topEnabled;
        if (topHeightEl) {
            topHeightEl.value = letterboxSettings.topHeight;
            if (topHeightValueEl) {
                topHeightValueEl.textContent = `${letterboxSettings.topHeight}px`;
            }
        }
        if (topOpacityEl) {
            topOpacityEl.value = letterboxSettings.topOpacity;
            if (topOpacityValueEl) {
                topOpacityValueEl.textContent = `${letterboxSettings.topOpacity}%`;
            }
        }

        if (bottomEnabledEl) bottomEnabledEl.checked = letterboxSettings.bottomEnabled;
        if (bottomHeightEl) {
            bottomHeightEl.value = letterboxSettings.bottomHeight;
            if (bottomHeightValueEl) {
                bottomHeightValueEl.textContent = `${letterboxSettings.bottomHeight}px`;
            }
        }
        if (bottomOpacityEl) {
            bottomOpacityEl.value = letterboxSettings.bottomOpacity;
            if (bottomOpacityValueEl) {
                bottomOpacityValueEl.textContent = `${letterboxSettings.bottomOpacity}%`;
            }
        }

        // 레터박스 표시
        displayLetterbox();

        // 글자 가림 박스 UI 복원
        const coverEnabledEl = document.getElementById('coverBoxEnabled');
        const coverLeftEl = document.getElementById('coverBoxLeft');
        const coverLeftValueEl = document.getElementById('coverBoxLeftValue');
        const coverTopEl = document.getElementById('coverBoxTop');
        const coverTopValueEl = document.getElementById('coverBoxTopValue');
        const coverWidthEl = document.getElementById('coverBoxWidth');
        const coverWidthValueEl = document.getElementById('coverBoxWidthValue');
        const coverHeightEl = document.getElementById('coverBoxHeight');
        const coverHeightValueEl = document.getElementById('coverBoxHeightValue');
        const coverOpacityEl = document.getElementById('coverBoxOpacity');
        const coverOpacityValueEl = document.getElementById('coverBoxOpacityValue');

        if (coverEnabledEl) coverEnabledEl.checked = coverBoxSettings.enabled;
        if (coverLeftEl) {
            coverLeftEl.value = coverBoxSettings.left;
            if (coverLeftValueEl) {
                coverLeftValueEl.textContent = `${coverBoxSettings.left}%`;
            }
        }
        if (coverTopEl) {
            coverTopEl.value = coverBoxSettings.top;
            if (coverTopValueEl) {
                coverTopValueEl.textContent = `${coverBoxSettings.top}%`;
            }
        }
        if (coverWidthEl) {
            coverWidthEl.value = coverBoxSettings.width;
            if (coverWidthValueEl) {
                coverWidthValueEl.textContent = `${coverBoxSettings.width}%`;
            }
        }
        if (coverHeightEl) {
            coverHeightEl.value = coverBoxSettings.height;
            if (coverHeightValueEl) {
                coverHeightValueEl.textContent = `${coverBoxSettings.height}%`;
            }
        }
        if (coverOpacityEl) {
            coverOpacityEl.value = coverBoxSettings.opacity;
            if (coverOpacityValueEl) {
                coverOpacityValueEl.textContent = `${coverBoxSettings.opacity}%`;
            }
        }

        // 글자 가림 박스 표시
        displayCoverBox();

        // 비디오 효과 UI 복원
        const videoBrightnessEl = document.getElementById('videoBrightness');
        const videoBrightnessValueEl = document.getElementById('videoBrightnessValue');
        const videoContrastEl = document.getElementById('videoContrast');
        const videoContrastValueEl = document.getElementById('videoContrastValue');
        const videoSaturateEl = document.getElementById('videoSaturate');
        const videoSaturateValueEl = document.getElementById('videoSaturateValue');
        const videoBlurEl = document.getElementById('videoBlur');
        const videoBlurValueEl = document.getElementById('videoBlurValue');
        const videoGrayscaleEl = document.getElementById('videoGrayscale');
        const videoGrayscaleValueEl = document.getElementById('videoGrayscaleValue');
        const videoSepiaEl = document.getElementById('videoSepia');
        const videoSepiaValueEl = document.getElementById('videoSepiaValue');
        const videoHueRotateEl = document.getElementById('videoHueRotate');
        const videoHueRotateValueEl = document.getElementById('videoHueRotateValue');
        const videoInvertEl = document.getElementById('videoInvert');
        const videoInvertValueEl = document.getElementById('videoInvertValue');

        if (videoBrightnessEl) {
            videoBrightnessEl.value = videoEffects.brightness;
            if (videoBrightnessValueEl) videoBrightnessValueEl.textContent = `${videoEffects.brightness}%`;
        }
        if (videoContrastEl) {
            videoContrastEl.value = videoEffects.contrast;
            if (videoContrastValueEl) videoContrastValueEl.textContent = `${videoEffects.contrast}%`;
        }
        if (videoSaturateEl) {
            videoSaturateEl.value = videoEffects.saturate;
            if (videoSaturateValueEl) videoSaturateValueEl.textContent = `${videoEffects.saturate}%`;
        }
        if (videoBlurEl) {
            videoBlurEl.value = videoEffects.blur;
            if (videoBlurValueEl) videoBlurValueEl.textContent = `${videoEffects.blur}px`;
        }
        if (videoGrayscaleEl) {
            videoGrayscaleEl.value = videoEffects.grayscale;
            if (videoGrayscaleValueEl) videoGrayscaleValueEl.textContent = `${videoEffects.grayscale}%`;
        }
        if (videoSepiaEl) {
            videoSepiaEl.value = videoEffects.sepia;
            if (videoSepiaValueEl) videoSepiaValueEl.textContent = `${videoEffects.sepia}%`;
        }
        if (videoHueRotateEl) {
            videoHueRotateEl.value = videoEffects.hueRotate;
            if (videoHueRotateValueEl) videoHueRotateValueEl.textContent = `${videoEffects.hueRotate}°`;
        }
        if (videoInvertEl) {
            videoInvertEl.value = videoEffects.invert;
            if (videoInvertValueEl) videoInvertValueEl.textContent = `${videoEffects.invert}%`;
        }

        // 비디오 필터 적용
        applyVideoFilters();

        // 이미지 오버레이 표시 및 UI 복원
        if (imageOverlays.length > 0) {
            renderImageList();
            displayImageOverlays();
            updateImageControls();
            showStatus(`이미지 복원됨: ${imageOverlays.length}개`, 'success');
        }

        // 패널 상태 복원 (펼침/접힘)
        const buttonIdMap = {
            'coverBoxPanel': 'coverBoxToggle',
            'letterboxPanel': 'letterboxToggle',
            'titlePanel': 'titleToggle',
            'subtitleEffectsPanel': 'subtitleEffectsToggle',
            'videoEffectsPanel': 'videoEffectsToggle',
            'imagePanel': 'imageToggle'
        };

        Object.keys(panelStates).forEach(panelId => {
            const panel = document.getElementById(panelId);
            const isExpanded = panelStates[panelId];

            if (panel) {
                if (!isExpanded) {
                    panel.classList.add('collapsed');
                } else {
                    panel.classList.remove('collapsed');
                }

                // 버튼 텍스트 업데이트
                const buttonId = buttonIdMap[panelId];
                const button = document.getElementById(buttonId);

                if (button) {
                    button.textContent = isExpanded ? '▼ 숨기기' : '▶ 펼치기';
                }
            }
        });

        console.log('State restored from localStorage');
        return true;
    } catch (error) {
        console.error('Failed to load state:', error);
        return false;
    }
}

// 상태 초기화 (필요시)
function clearState() {
    localStorage.removeItem(STORAGE_KEY);
    currentVideoPath = '';
    currentVideoFilename = '';
    currentSubtitlePath = '';
    subtitles = [];
    selectedIds.clear();
    console.log('State cleared');
}

// 상태 메시지 표시
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;

    if (type === 'error') {
        console.error(message);
    }
}

// 비디오 업로드
async function uploadVideo() {
    const fileInput = document.getElementById('videoFile');
    const file = fileInput.files[0];

    if (!file) {
        showStatus('비디오 파일을 선택해주세요.', 'error');
        return;
    }

    showStatus('비디오 업로드 중...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/api/editor/upload-video`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            currentVideoPath = data.path;
            currentVideoFilename = data.filename;
            showStatus(`비디오 업로드 완료: ${file.name}`, 'success');

            // 플레이어에 비디오 로드
            const player = document.getElementById('videoPlayer');
            player.src = `${API_BASE}/uploads/${data.filename}`;
            document.getElementById('playerSection').style.display = 'block';

            // 비디오 메타데이터 업데이트
            player.onloadedmetadata = () => {
                document.getElementById('duration').textContent = formatTime(player.duration);
            };

            // 비디오 재생 시 제목 애니메이션 다시 실행
            player.onplay = () => {
                displayTitle();
            };

            player.ontimeupdate = () => {
                document.getElementById('currentTime').textContent = formatTime(player.currentTime);
                // 자막 오버레이 업데이트
                updateSubtitleOverlay(player.currentTime);
            };

            // 음소거 상태 변경 시 저장
            player.onvolumechange = () => {
                playerSettings.muted = player.muted;
                playerSettings.volume = player.volume;
                saveState();
            };

            // 상태 저장
            saveState();
        } else {
            showStatus('비디오 업로드 실패', 'error');
        }
    } catch (error) {
        showStatus(`업로드 오류: ${error.message}`, 'error');
    }
}

// 자막 업로드
async function uploadSubtitle() {
    const fileInput = document.getElementById('subtitleFile');
    const file = fileInput.files[0];

    if (!file) {
        showStatus('자막 파일을 선택해주세요.', 'error');
        return;
    }

    showStatus('자막 업로드 및 파싱 중...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/api/editor/upload-subtitle`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            currentSubtitlePath = data.path;
            subtitles = data.subtitles;
            showStatus(`자막 파싱 완료: ${data.count}개 구간`, 'success');

            // 타임라인 렌더링
            renderTimeline();
            document.getElementById('timelineSection').style.display = 'block';

            // 상태 저장
            saveState();
        } else {
            showStatus('자막 업로드 실패', 'error');
        }
    } catch (error) {
        showStatus(`업로드 오류: ${error.message}`, 'error');
    }
}

// 타임라인 렌더링
function renderTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    subtitles.forEach(sub => {
        const block = document.createElement('div');
        block.className = 'subtitle-block';
        block.dataset.id = sub.id;

        const duration = sub.end - sub.start;

        block.innerHTML = `
            <input type="checkbox" class="subtitle-checkbox" ${selectedIds.has(sub.id) ? 'checked' : ''}>
            <div class="subtitle-info">
                <div class="subtitle-time">${formatTime(sub.start)} - ${formatTime(sub.end)}</div>
                <div class="subtitle-text-container">
                    <div class="subtitle-text" data-id="${sub.id}">${sub.text}</div>
                    <button class="edit-btn" onclick="editSubtitleText(${sub.id}, event)" title="자막 수정 (Enter:줄바꿈, Backspace:줄 합치기, Shift+Enter:분할)">✏️</button>
                </div>
            </div>
            <div class="subtitle-duration">${duration.toFixed(1)}s</div>
        `;

        // 클릭 이벤트 (편집 버튼과 체크박스 제외)
        block.onclick = (e) => {
            if (e.target.type !== 'checkbox' && !e.target.classList.contains('edit-btn')) {
                toggleSubtitle(sub.id);
            }
        };

        // 체크박스 이벤트
        const checkbox = block.querySelector('.subtitle-checkbox');
        checkbox.onchange = () => {
            toggleSubtitle(sub.id);
        };

        // 더블 클릭으로 해당 시간으로 이동
        block.ondblclick = (e) => {
            if (!e.target.classList.contains('edit-btn')) {
                const player = document.getElementById('videoPlayer');
                player.currentTime = sub.start;
                player.play();
            }
        };

        timeline.appendChild(block);
    });

    updateTimelineInfo();
}

// 자막 텍스트 편집
function editSubtitleText(id, event) {
    event.stopPropagation(); // 이벤트 전파 중지

    const subtitle = subtitles.find(s => s.id === id);
    if (!subtitle) return;

    const textEl = document.querySelector(`.subtitle-text[data-id="${id}"]`);
    const originalText = subtitle.text;

    // 편집 모드로 전환
    textEl.contentEditable = true;
    textEl.classList.add('editing');
    textEl.focus();

    // 편집 안내 표시
    showStatus('편집 중: Enter로 줄바꿈, Backspace로 줄 합치기, Shift+Enter로 분할, Ctrl+Enter로 저장, ESC로 취소', 'info');

    // 텍스트 전체 선택
    const range = document.createRange();
    range.selectNodeContents(textEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // 키보드 이벤트 처리
    textEl.onkeydown = (e) => {
        if (e.key === 'Escape') {
            // ESC 키로 취소
            e.preventDefault();
            textEl.textContent = originalText;
            cancelSubtitleEdit(textEl);
        } else if (e.key === 'Backspace') {
            // 백스페이스로 줄 합치기
            // 브라우저의 기본 백스페이스 동작을 먼저 실행하고, 그 결과를 확인
            setTimeout(() => {
                const currentText = textEl.textContent;

                // 여러 공백이나 줄바꿈을 하나의 공백으로 정리
                // 사용자가 백스페이스를 누르면 브라우저가 알아서 처리함
                // 우리는 결과만 저장하면 됨

                console.log('After backspace:', JSON.stringify(currentText));
            }, 0);
            // 기본 동작 허용 (preventDefault하지 않음)
        } else if (e.key === 'Enter' && e.shiftKey) {
            // Shift+Enter로 자막 분할
            e.preventDefault();
            const cursorPos = getCursorPosition(textEl);
            saveSubtitleEdit(id, textEl);  // 현재 편집 내용 저장
            splitSubtitle(id, cursorPos);  // 자막 분할
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            // Ctrl+Enter 또는 Cmd+Enter로 저장
            e.preventDefault();
            saveSubtitleEdit(id, textEl);
        }
        // 일반 Enter는 줄바꿈 허용 (기본 동작)
    };

    // 포커스 아웃 시 저장
    textEl.onblur = () => {
        setTimeout(() => {
            if (textEl.contentEditable === 'true') {
                saveSubtitleEdit(id, textEl);
            }
        }, 100);
    };
}

// 자막 편집 저장
function saveSubtitleEdit(id, textEl) {
    const newText = textEl.textContent.trim();

    if (!newText) {
        showStatus('자막 텍스트는 비어있을 수 없습니다.', 'error');
        renderTimeline(); // 원래대로 복원
        return;
    }

    // 자막 데이터 업데이트
    const subtitle = subtitles.find(s => s.id === id);
    if (subtitle) {
        subtitle.text = newText;
        showStatus('자막이 수정되었습니다.', 'success');
        // 상태 저장
        saveState();
    }

    cancelSubtitleEdit(textEl);
}

// 자막 편집 취소
function cancelSubtitleEdit(textEl) {
    textEl.contentEditable = false;
    textEl.classList.remove('editing');
    textEl.onkeydown = null;
    textEl.onblur = null;
}

// 자막 선택/해제 토글
function toggleSubtitle(id) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
    } else {
        selectedIds.add(id);
    }

    // UI 업데이트
    const block = document.querySelector(`[data-id="${id}"]`);
    const checkbox = block.querySelector('.subtitle-checkbox');

    if (selectedIds.has(id)) {
        block.classList.add('selected');
        checkbox.checked = true;
    } else {
        block.classList.remove('selected');
        checkbox.checked = false;
    }

    updateTimelineInfo();

    // 상태 저장
    saveState();
}

// 전체 선택
function selectAll() {
    selectedIds = new Set(subtitles.map(s => s.id));
    renderTimeline();
    saveState();
}

// 전체 해제
function deselectAll() {
    selectedIds.clear();
    renderTimeline();
    saveState();
}

// 선택 반전
function invertSelection() {
    const allIds = new Set(subtitles.map(s => s.id));
    const newSelected = new Set();

    allIds.forEach(id => {
        if (!selectedIds.has(id)) {
            newSelected.add(id);
        }
    });

    selectedIds = newSelected;
    renderTimeline();
    saveState();
}

// 선택된 자막들 합치기
function mergeSelectedSubtitles() {
    // 선택된 자막 개수 확인
    if (selectedIds.size < 2) {
        showStatus('2개 이상의 자막을 선택해주세요.', 'error');
        return;
    }

    // 선택된 자막들을 ID 순서대로 정렬
    const selectedSubtitles = subtitles
        .filter(sub => selectedIds.has(sub.id))
        .sort((a, b) => a.id - b.id);

    // 인접한 자막들인지 확인
    const selectedIndices = selectedSubtitles.map(sub =>
        subtitles.findIndex(s => s.id === sub.id)
    );

    for (let i = 1; i < selectedIndices.length; i++) {
        if (selectedIndices[i] !== selectedIndices[i-1] + 1) {
            showStatus('인접한 자막들만 합칠 수 있습니다.', 'error');
            return;
        }
    }

    // 첫 번째와 마지막 자막 정보
    const firstSub = selectedSubtitles[0];
    const lastSub = selectedSubtitles[selectedSubtitles.length - 1];

    // 텍스트 합치기 (줄바꿈으로 연결)
    const mergedText = selectedSubtitles.map(sub => sub.text).join('\n');

    // 첫 번째 자막 업데이트
    firstSub.text = mergedText;
    firstSub.end = lastSub.end;

    // 나머지 선택된 자막들 제거
    for (let i = 1; i < selectedSubtitles.length; i++) {
        const index = subtitles.findIndex(s => s.id === selectedSubtitles[i].id);
        if (index !== -1) {
            subtitles.splice(index, 1);
        }
    }

    // 선택 상태 업데이트 (첫 번째만 선택 유지)
    selectedIds.clear();
    selectedIds.add(firstSub.id);

    // 타임라인 재렌더링
    renderTimeline();

    // 상태 저장
    saveState();

    showStatus(`${selectedSubtitles.length}개의 자막이 합쳐졌습니다.`, 'success');
}

// 타임라인 정보 업데이트
function updateTimelineInfo() {
    document.getElementById('totalSubtitles').textContent = subtitles.length;
    document.getElementById('selectedCount').textContent = selectedIds.size;

    // 예상 길이 계산
    let totalDuration = 0;
    subtitles.forEach(sub => {
        if (selectedIds.has(sub.id)) {
            totalDuration += (sub.end - sub.start);
        }
    });

    document.getElementById('estimatedDuration').textContent = formatTime(totalDuration);
}

// 비디오 렌더링
async function renderVideo() {
    if (selectedIds.size === 0) {
        showStatus('최소 1개 이상의 자막 구간을 선택해주세요.', 'error');
        return;
    }

    if (!currentVideoPath) {
        showStatus('먼저 비디오를 업로드해주세요.', 'error');
        return;
    }

    // 렌더링 섹션 표시
    document.getElementById('renderSection').style.display = 'block';
    document.getElementById('downloadSection').style.display = 'none';

    showStatus(`${selectedIds.size}개 구간 렌더링 시작...`, 'info');

    // 진행바 애니메이션
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = '30%';

    try {
        const response = await fetch(`${API_BASE}/api/editor/render`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_path: currentVideoPath,
                selected_ids: Array.from(selectedIds).sort((a, b) => a - b),
                output_path: 'output.mp4'
            })
        });

        progressBar.style.width = '80%';

        const data = await response.json();

        if (data.success) {
            progressBar.style.width = '100%';
            outputFilename = data.filename;

            setTimeout(() => {
                document.getElementById('renderSection').style.display = 'none';
                document.getElementById('downloadSection').style.display = 'block';

                // 결과 비디오 미리보기
                const resultPlayer = document.getElementById('resultPlayer');
                resultPlayer.src = `${API_BASE}/api/editor/download/${data.filename}`;

                showStatus('렌더링 완료!', 'success');
            }, 500);
        } else {
            showStatus('렌더링 실패', 'error');
            document.getElementById('renderSection').style.display = 'none';
        }
    } catch (error) {
        showStatus(`렌더링 오류: ${error.message}`, 'error');
        document.getElementById('renderSection').style.display = 'none';
    }
}

// 비디오 다운로드
function downloadVideo() {
    if (!outputFilename) {
        showStatus('다운로드할 파일이 없습니다.', 'error');
        return;
    }

    window.location.href = `${API_BASE}/api/editor/download/${outputFilename}`;
    showStatus('다운로드 시작...', 'success');
}

// 시간을 SRT 포맷으로 변환
function toSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// 수정된 자막을 SRT 파일로 다운로드
function downloadEditedSubtitles() {
    if (subtitles.length === 0) {
        showStatus('다운로드할 자막이 없습니다.', 'error');
        return;
    }

    // SRT 포맷으로 변환
    let srtContent = '';
    subtitles.forEach((sub, index) => {
        srtContent += `${index + 1}\n`;
        srtContent += `${toSRTTime(sub.start)} --> ${toSRTTime(sub.end)}\n`;
        srtContent += `${sub.text}\n\n`;
    });

    // Blob 생성 및 다운로드
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited_subtitles.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('수정된 자막 파일이 다운로드되었습니다.', 'success');
}

// 페이지 로드 시
document.addEventListener('DOMContentLoaded', () => {
    console.log('VMaker initialized');

    // localStorage에서 상태 복원 시도
    const restored = loadState();

    if (!restored) {
        showStatus('비디오와 자막 파일을 업로드하여 시작하세요.', 'info');
    }

    // 파일 input에 자동 업로드 기능 추가
    const videoFileInput = document.getElementById('videoFile');
    const subtitleFileInput = document.getElementById('subtitleFile');
    const imageFileInput = document.getElementById('imageFile');

    if (videoFileInput) {
        videoFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                console.log('비디오 파일 선택됨:', e.target.files[0].name);
                uploadVideo();
            }
        });
    }

    if (subtitleFileInput) {
        subtitleFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                console.log('자막 파일 선택됨:', e.target.files[0].name);
                uploadSubtitle();
            }
        });
    }

    if (imageFileInput) {
        imageFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                console.log('이미지 파일 선택됨:', e.target.files[0].name);
                uploadImage();
            }
        });
    }
});
