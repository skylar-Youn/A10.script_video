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
    animationSpeed: '0.5s'
};

// 제목 설정
let videoTitleSettings = {
    text: '',
    fontSize: '2em',
    color: '#ffffff',
    bgColor: '#667eea',
    bgOpacity: 90,
    position: 'top',
    shadow: '2px 2px 4px rgba(0,0,0,0.9)'
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

    // title-text div 생성 및 스타일 적용
    const titleText = document.createElement('div');
    titleText.className = 'title-text';
    titleText.textContent = videoTitleSettings.text;

    // 인라인 스타일 적용
    titleText.style.fontSize = videoTitleSettings.fontSize;
    titleText.style.color = videoTitleSettings.color;
    titleText.style.background = bgColorRGBA;
    titleText.style.textShadow = videoTitleSettings.shadow;

    // 오버레이에 위치 클래스 추가
    overlay.className = 'title-overlay';
    overlay.classList.add(`position-${videoTitleSettings.position}`);

    overlay.innerHTML = '';
    overlay.appendChild(titleText);
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
        subtitleLine.textContent = currentSub.text;

        // 애니메이션 클래스 추가
        if (subtitleEffects.animation !== 'none') {
            subtitleLine.classList.add(subtitleEffects.animation);
        }

        // 인라인 스타일 적용
        subtitleLine.style.fontSize = subtitleEffects.fontSize;
        subtitleLine.style.color = subtitleEffects.fontColor;
        subtitleLine.style.background = bgColorRGBA;
        subtitleLine.style.border = subtitleEffects.borderStyle;
        subtitleLine.style.textShadow = subtitleEffects.textShadow;
        subtitleLine.style.setProperty('--animation-speed', subtitleEffects.animationSpeed);

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

        // UI 복원
        if (currentVideoFilename) {
            const player = document.getElementById('videoPlayer');
            player.src = `${API_BASE}/uploads/${currentVideoFilename}`;
            document.getElementById('playerSection').style.display = 'block';

            // 비디오 메타데이터 업데이트
            player.onloadedmetadata = () => {
                document.getElementById('duration').textContent = formatTime(player.duration);
            };

            player.ontimeupdate = () => {
                document.getElementById('currentTime').textContent = formatTime(player.currentTime);
                // 자막 오버레이 업데이트
                updateSubtitleOverlay(player.currentTime);
            };

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

            player.ontimeupdate = () => {
                document.getElementById('currentTime').textContent = formatTime(player.currentTime);
                // 자막 오버레이 업데이트
                updateSubtitleOverlay(player.currentTime);
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
});
