// 이미지 효과 모듈
import * as state from '../state.js';
import { showStatus } from '../utils.js';
import { displayImageOverlays } from './overlay.js';

// 이미지 설정 업데이트
export function updateImageSettings() {
    const img = state.getImageOverlay(state.selectedImageId);
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
        if (state.maintainAspectRatio && state.originalAspectRatio > 0 && heightEl) {
            const newHeight = Math.round(newWidth / state.originalAspectRatio);
            img.height = newHeight;
            heightEl.value = newHeight;
            if (heightValueEl) heightValueEl.textContent = `${newHeight}%`;
        }
    }
    if (heightEl && !state.maintainAspectRatio) {
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
    if (window.saveState) {
        window.saveState();
    }
}

// 이미지 필터 효과 업데이트
export function updateImageEffects() {
    const img = state.getImageOverlay(state.selectedImageId);
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
    if (window.saveState) {
        window.saveState();
    }

    showStatus('이미지 효과가 적용되었습니다.', 'success');
}

// 이미지 컨트롤 UI 업데이트
export function updateImageControls() {
    const img = state.getImageOverlay(state.selectedImageId);
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

    // 필터 효과 (생략 - 위와 동일 패턴)
}
