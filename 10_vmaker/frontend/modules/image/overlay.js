// 이미지 오버레이 렌더링 모듈
import * as state from '../state.js';

// 이미지 오버레이 표시 (애니메이션 버그 수정됨)
export function displayImageOverlays() {
    const container = document.getElementById('imageOverlayContainer');
    if (!container) return;

    // 기존 이미지 모두 제거
    container.innerHTML = '';

    // 모든 이미지 오버레이 생성
    state.imageOverlays.forEach(img => {
        // 래퍼 div 생성
        const wrapper = document.createElement('div');
        wrapper.className = 'image-overlay-wrapper';
        wrapper.dataset.id = img.id;
        if (img.id === state.selectedImageId) {
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

        // ⚠️ 애니메이션 버그 수정:
        // 애니메이션이 있을 경우 inline transform을 사용하지 않음
        // CSS 변수로만 회전값을 전달하고, CSS에서 transform 처리
        if (img.animation === 'none') {
            // 애니메이션이 없을 때만 inline transform 사용
            wrapper.style.transform = `translate(-50%, -50%) rotate(${img.rotation}deg)`;
        } else {
            // 애니메이션이 있을 때는 CSS 변수만 설정 (CSS 애니메이션에서 transform 사용)
            wrapper.style.transform = ''; // inline transform 제거
        }

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
            handle.addEventListener('mousedown', (e) => window.startResize(e, img.id, handlePos));
            wrapper.appendChild(handle);
        });

        // 이미지를 래퍼에 추가
        wrapper.appendChild(imgEl);

        // 드래그 이벤트 추가 (이미지 이동)
        imgEl.addEventListener('mousedown', (e) => window.startDrag(e, img.id));

        // 클릭으로 선택
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            window.selectImage(img.id);
        });

        container.appendChild(wrapper);
    });
}

// 이미지 목록 렌더링
export function renderImageList() {
    const listEl = document.getElementById('imageList');
    if (!listEl) return;

    listEl.innerHTML = '';

    state.imageOverlays.forEach(img => {
        const item = document.createElement('div');
        item.className = 'image-list-item';
        if (img.id === state.selectedImageId) {
            item.classList.add('selected');
        }

        item.innerHTML = `
            <img src="${img.src}" alt="${img.filename}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
            <span>${img.filename}</span>
            <button onclick="deleteImage(${img.id})" class="btn-delete">🗑️</button>
        `;

        item.onclick = (e) => {
            if (!e.target.classList.contains('btn-delete')) {
                window.selectImage(img.id);
            }
        };

        listEl.appendChild(item);
    });
}
