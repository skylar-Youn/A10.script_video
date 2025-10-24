// API 기본 URL
const API_BASE = 'http://localhost:8007';

// 전역 상태
let currentVideoPath = '';
let currentSubtitlePath = '';
let subtitles = [];
let selectedIds = new Set();
let outputFilename = '';

// 유틸리티 함수: 시간 포맷팅
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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
            };
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
                <div class="subtitle-text">${sub.text}</div>
            </div>
            <div class="subtitle-duration">${duration.toFixed(1)}s</div>
        `;

        // 클릭 이벤트
        block.onclick = (e) => {
            if (e.target.type !== 'checkbox') {
                toggleSubtitle(sub.id);
            }
        };

        // 체크박스 이벤트
        const checkbox = block.querySelector('.subtitle-checkbox');
        checkbox.onchange = () => {
            toggleSubtitle(sub.id);
        };

        // 더블 클릭으로 해당 시간으로 이동
        block.ondblclick = () => {
            const player = document.getElementById('videoPlayer');
            player.currentTime = sub.start;
            player.play();
        };

        timeline.appendChild(block);
    });

    updateTimelineInfo();
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
}

// 전체 선택
function selectAll() {
    selectedIds = new Set(subtitles.map(s => s.id));
    renderTimeline();
}

// 전체 해제
function deselectAll() {
    selectedIds.clear();
    renderTimeline();
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

// 페이지 로드 시
document.addEventListener('DOMContentLoaded', () => {
    console.log('VMaker initialized');
    showStatus('비디오와 자막 파일을 업로드하여 시작하세요.', 'info');
});
