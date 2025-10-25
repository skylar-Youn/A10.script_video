// 이미지 업로드 모듈
import { API_BASE } from '../config.js';
import * as state from '../state.js';
import { showStatus } from '../utils.js';
import { renderImageList, displayImageOverlays } from './overlay.js';

export async function uploadImage() {
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
                id: ++state.currentImageId,
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

            state.addImageOverlay(newImage);
            state.setSelectedImageId(newImage.id);

            showStatus(`이미지 업로드 완료: ${file.name}`, 'success');

            // 이미지 목록 렌더링
            renderImageList();

            // 이미지 오버레이 표시
            displayImageOverlays();

            // UI 업데이트
            if (window.updateImageControls) {
                window.updateImageControls();
            }

            // 상태 저장
            if (window.saveState) {
                window.saveState();
            }
        } else {
            showStatus('이미지 업로드 실패', 'error');
        }
    } catch (error) {
        showStatus(`업로드 오류: ${error.message}`, 'error');
    }
}

// 이미지 선택
export function selectImage(id) {
    state.setSelectedImageId(id);
    renderImageList();
    if (window.updateImageControls) {
        window.updateImageControls();
    }
}

// 이미지 삭제
export function deleteImage(id) {
    state.removeImageOverlay(id);

    if (state.selectedImageId === id) {
        const newSelectedId = state.imageOverlays.length > 0 ? state.imageOverlays[0].id : null;
        state.setSelectedImageId(newSelectedId);
    }

    renderImageList();
    displayImageOverlays();

    if (window.updateImageControls) {
        window.updateImageControls();
    }

    if (window.saveState) {
        window.saveState();
    }

    showStatus('이미지가 삭제되었습니다.', 'success');
}

// 이미지 업로드 이벤트 초기화
export function initImageUpload() {
    const imageFileInput = document.getElementById('imageFile');
    if (imageFileInput) {
        imageFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                console.log('이미지 파일 선택됨:', e.target.files[0].name);
                uploadImage();
            }
        });
    }
}
