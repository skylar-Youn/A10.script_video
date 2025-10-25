// 유틸리티 함수 모음

// 시간 포맷팅 (초 → MM:SS)
export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 현재 재생 시간에 맞는 자막 찾기
export function getCurrentSubtitle(subtitles, currentTime) {
    return subtitles.find(sub =>
        currentTime >= sub.start && currentTime <= sub.end
    );
}

// 커서 위치 가져오기
export function getCursorPosition(element) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    return preCaretRange.toString().length;
}

// 특정 위치에 커서 설정
export function setCursorPosition(element, position) {
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

// HEX 색상을 RGB로 변환
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// 시간을 SRT 포맷으로 변환 (초 → HH:MM:SS,mmm)
export function formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

// 상태 메시지 표시
export function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';

    // 성공/에러 메시지는 5초 후 자동 숨김
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}
