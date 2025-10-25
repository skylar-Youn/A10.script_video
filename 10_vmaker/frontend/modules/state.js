// 전역 상태 관리
import { DEFAULT_VIDEO_SIZE, DEFAULT_ASPECT_RATIO } from './config.js';

// 비디오 상태
export let currentVideoPath = '';
export let currentVideoFilename = '';
export let currentSubtitlePath = '';
export let currentAspectRatio = DEFAULT_ASPECT_RATIO;
export let currentVideoSize = DEFAULT_VIDEO_SIZE;
export let outputFilename = '';

// 자막 상태
export let subtitles = [];
export let selectedIds = new Set();

// 자막 효과 설정
export let subtitleEffects = {
    fontSize: '1.5em',
    fontColor: '#ffffff',
    bgColor: '#000000',
    bgOpacity: 80,
    borderStyle: 'none',
    textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
    animation: 'none',
    animationSpeed: '0.5s',
    // 고급 텍스트 효과
    textStroke: 0,
    textStrokeColor: '#000000',
    glowEffect: 'none',
    gradientEnabled: false,
    gradientColor1: '#ff6b6b',
    gradientColor2: '#4ecdc4',
    gradientAngle: 90,
    letterAnimation: 'none',
    textTransform: 'none',
    letterSpacing: 0
};

// 제목 설정
export let videoTitleSettings = {
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
export let letterboxSettings = {
    topEnabled: false,
    topHeight: 80,
    topOpacity: 80,
    bottomEnabled: false,
    bottomHeight: 80,
    bottomOpacity: 80
};

// 글자 가림 박스 설정
export let coverBoxSettings = {
    enabled: false,
    left: 10,
    top: 10,
    width: 20,
    height: 15,
    opacity: 90
};

// 비디오/이미지 효과 설정
export let videoEffects = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    blur: 0,
    grayscale: 0,
    sepia: 0,
    hueRotate: 0,
    invert: 0
};

// 이미지 오버레이 설정
export let imageOverlays = [];
export let currentImageId = 0;
export let selectedImageId = null;
export let maintainAspectRatio = false;
export let originalAspectRatio = 1;

// 패널 펼침/접힘 상태
export let panelStates = {
    coverBoxPanel: true,
    letterboxPanel: true,
    titlePanel: true,
    subtitleEffectsPanel: true,
    videoEffectsPanel: true,
    imagePanel: true
};

// 비디오 플레이어 설정
export let playerSettings = {
    muted: false,
    volume: 1.0
};

// 상태 업데이트 함수들
export function setCurrentVideoPath(path) {
    currentVideoPath = path;
}

export function setCurrentVideoFilename(filename) {
    currentVideoFilename = filename;
}

export function setCurrentSubtitlePath(path) {
    currentSubtitlePath = path;
}

export function setCurrentAspectRatio(ratio) {
    currentAspectRatio = ratio;
}

export function setCurrentVideoSize(size) {
    currentVideoSize = size;
}

export function setOutputFilename(filename) {
    outputFilename = filename;
}

export function setSubtitles(subs) {
    subtitles = subs;
}

export function addSelectedId(id) {
    selectedIds.add(id);
}

export function removeSelectedId(id) {
    selectedIds.delete(id);
}

export function clearSelectedIds() {
    selectedIds.clear();
}

export function setSelectedImageId(id) {
    selectedImageId = id;
}

export function addImageOverlay(image) {
    imageOverlays.push(image);
    currentImageId = image.id;
}

export function removeImageOverlay(id) {
    const index = imageOverlays.findIndex(img => img.id === id);
    if (index !== -1) {
        imageOverlays.splice(index, 1);
    }
}

export function getImageOverlay(id) {
    return imageOverlays.find(img => img.id === id);
}

export function setMaintainAspectRatio(value) {
    maintainAspectRatio = value;
}

export function setOriginalAspectRatio(value) {
    originalAspectRatio = value;
}
