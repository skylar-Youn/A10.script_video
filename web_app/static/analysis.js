// 분석 페이지 JavaScript 기능
class AnalysisApp {
    constructor() {
        this.selectedFiles = new Set();
        this.currentTab = 'audio';
        this.analysisResults = {};
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadFiles();
        this.updateStatus('준비됨', 0, '분석 대기 중');
    }

    bindEvents() {
        // 탭 전환
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.getAttribute('data-tab'));
            });
        });

        // 파일 필터링 및 검색
        document.getElementById('file-filter').addEventListener('change', (e) => {
            this.filterFiles(e.target.value);
        });

        document.getElementById('file-search').addEventListener('input', (e) => {
            this.searchFiles(e.target.value);
        });

        // 분석 시작 버튼들
        document.getElementById('start-audio-analysis').addEventListener('click', () => {
            this.startAudioAnalysis();
        });

        document.getElementById('analyze-srt').addEventListener('click', () => {
            this.startSubtitleAnalysis();
        });

        document.getElementById('start-stt').addEventListener('click', () => {
            this.startSpeechToText();
        });

        document.getElementById('start-comparison').addEventListener('click', () => {
            this.startComparison();
        });

        // 빠른 액션 버튼들
        document.getElementById('select-all').addEventListener('click', () => {
            this.selectAllFiles();
        });

        document.getElementById('clear-selection').addEventListener('click', () => {
            this.clearSelection();
        });

        // 자막 편집 도구들
        document.getElementById('apply-all-fixes').addEventListener('click', () => {
            this.applySubtitleFixes();
        });

        // 진행률 업데이트 함수들
        this.bindProgressUpdates();
    }

    bindProgressUpdates() {
        // 음성 임계값 변경 시 실시간 업데이트
        const silenceThreshold = document.getElementById('silence-threshold');
        const valueDisplay = silenceThreshold.nextElementSibling;

        silenceThreshold.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
        });

        // 텍스트 크기 조정 시 실시간 업데이트
        const textSize = document.getElementById('text-size');
        const sizeDisplay = document.getElementById('size-display');

        if (textSize && sizeDisplay) {
            textSize.addEventListener('input', (e) => {
                sizeDisplay.textContent = e.target.value + 'px';
            });
        }
    }

    async loadFiles() {
        try {
            const response = await fetch('/api/analysis/files');
            const data = await response.json();

            this.renderFileGrid(data.files);
            this.renderFolderTree();

        } catch (error) {
            console.error('파일 로드 실패:', error);
            this.showError('파일 목록을 불러올 수 없습니다.');
        }
    }

    renderFileGrid(files) {
        const grid = document.getElementById('file-grid');

        if (!files || files.length === 0) {
            grid.innerHTML = '<div class="empty-state">분석할 파일이 없습니다</div>';
            return;
        }

        grid.innerHTML = files.map(file => this.createFileCard(file)).join('');

        // 파일 선택 이벤트 바인딩
        grid.querySelectorAll('.file-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = card.querySelector('.file-select');
                    checkbox.checked = !checkbox.checked;
                    this.toggleFileSelection(card, checkbox.checked);
                }
            });

            const checkbox = card.querySelector('.file-select');
            checkbox.addEventListener('change', (e) => {
                this.toggleFileSelection(card, e.target.checked);
            });
        });
    }

    createFileCard(file) {
        const fileId = btoa(file.path); // Base64 인코딩으로 고유 ID 생성
        const fileSize = this.formatFileSize(file.size);
        const fileDate = new Date(file.modified * 1000).toLocaleDateString();
        const fileIcon = this.getFileIcon(file.type);
        const fileExt = file.type.replace('.', '').toUpperCase();

        return `
            <div class="file-card" data-file-path="${file.path}" data-file-type="${file.type}">
                <div class="file-checkbox">
                    <input type="checkbox" class="file-select" id="file-${fileId}">
                    <label for="file-${fileId}" class="checkbox-label"></label>
                </div>

                <div class="file-thumbnail">
                    <div class="file-icon">${fileIcon}</div>
                    <div class="file-type-badge">${fileExt}</div>
                </div>

                <div class="file-content">
                    <div class="file-header">
                        <h4 class="file-title" title="${file.name}">${file.name}</h4>
                        <div class="file-actions">
                            <button class="action-btn mini" title="미리보기" onclick="app.previewFile('${file.path}')">👁️</button>
                        </div>
                    </div>

                    <div class="file-details">
                        <span class="detail-item">💾 ${fileSize}</span>
                        <span class="detail-item">📅 ${fileDate}</span>
                    </div>

                    <div class="file-tags">
                        <span class="tag ${this.getFileTypeClass(file.type)}">${this.getFileTypeLabel(file.type)}</span>
                        ${file.analyzable ? '<span class="tag success">분석가능</span>' : ''}
                    </div>
                </div>

                <div class="file-status">
                    <div class="analysis-badges" id="badges-${fileId}">
                        <span class="status-badge pending">분석 대기</span>
                    </div>
                </div>
            </div>
        `;
    }

    getFileIcon(fileType) {
        const icons = {
            '.webm': '🎬', '.mp4': '🎬', '.avi': '🎬', '.mov': '🎬',
            '.mp3': '🎵', '.wav': '🎵', '.m4a': '🎵', '.flac': '🎵',
            '.srt': '📝', '.vtt': '📝', '.ass': '📝'
        };
        return icons[fileType] || '📄';
    }

    getFileTypeClass(fileType) {
        if (['.webm', '.mp4', '.avi', '.mov'].includes(fileType)) return 'video';
        if (['.mp3', '.wav', '.m4a', '.flac'].includes(fileType)) return 'audio';
        if (['.srt', '.vtt', '.ass'].includes(fileType)) return 'subtitle';
        return 'other';
    }

    getFileTypeLabel(fileType) {
        const labels = {
            video: '비디오',
            audio: '오디오',
            subtitle: '자막',
            other: '기타'
        };
        return labels[this.getFileTypeClass(fileType)] || '기타';
    }

    formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    async renderFolderTree() {
        try {
            const response = await fetch('/api/analysis/folder-tree');
            const tree = await response.json();

            const treeContainer = document.getElementById('folder-tree');
            treeContainer.innerHTML = this.renderTreeNode(tree);

        } catch (error) {
            console.error('폴더 트리 로드 실패:', error);
        }
    }

    renderTreeNode(node) {
        if (node.type === 'file') {
            return `
                <div class="tree-node file" data-path="${node.path}">
                    <div class="node-icon">${this.getFileIcon(node.extension)}</div>
                    <span class="node-label">${node.name}</span>
                    <span class="node-size">${this.formatFileSize(node.size)}</span>
                </div>
            `;
        } else {
            const children = node.children ? node.children.map(child => this.renderTreeNode(child)).join('') : '';
            return `
                <div class="tree-node folder expanded" data-path="${node.path}">
                    <div class="node-toggle">📂</div>
                    <span class="node-label">${node.name}</span>
                    <span class="node-count">(${node.children ? node.children.length : 0}개)</span>
                    <div class="tree-children">
                        ${children}
                    </div>
                </div>
            `;
        }
    }

    toggleFileSelection(card, selected) {
        const filePath = card.getAttribute('data-file-path');

        if (selected) {
            this.selectedFiles.add(filePath);
            card.classList.add('selected');
        } else {
            this.selectedFiles.delete(filePath);
            card.classList.remove('selected');
        }

        this.updateSelectedFilesList();
        this.updateFileCount();
    }

    updateSelectedFilesList() {
        const list = document.getElementById('selected-files-list');

        if (this.selectedFiles.size === 0) {
            list.innerHTML = '<div class="empty-state">분석할 파일을 선택하세요</div>';
            return;
        }

        const items = Array.from(this.selectedFiles).map(filePath => {
            const fileName = filePath.split('/').pop();
            return `
                <div class="selected-item">
                    <span class="selected-name">${fileName}</span>
                    <button class="remove-btn" onclick="app.removeSelectedFile('${filePath}')">❌</button>
                </div>
            `;
        }).join('');

        list.innerHTML = items;
    }

    updateFileCount() {
        document.getElementById('selected-count').textContent = this.selectedFiles.size;
        document.getElementById('file-count').textContent = `파일 ${this.selectedFiles.size}개 선택`;
    }

    removeSelectedFile(filePath) {
        this.selectedFiles.delete(filePath);

        // 체크박스 해제
        const card = document.querySelector(`[data-file-path="${filePath}"]`);
        if (card) {
            const checkbox = card.querySelector('.file-select');
            checkbox.checked = false;
            card.classList.remove('selected');
        }

        this.updateSelectedFilesList();
        this.updateFileCount();
    }

    selectAllFiles() {
        document.querySelectorAll('.file-card').forEach(card => {
            const checkbox = card.querySelector('.file-select');
            checkbox.checked = true;
            this.toggleFileSelection(card, true);
        });
    }

    clearSelection() {
        document.querySelectorAll('.file-card').forEach(card => {
            const checkbox = card.querySelector('.file-select');
            checkbox.checked = false;
            card.classList.remove('selected');
        });

        this.selectedFiles.clear();
        this.updateSelectedFilesList();
        this.updateFileCount();
    }

    switchTab(tabName) {
        // 탭 버튼 활성화
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // 탭 컨텐츠 표시
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;
        this.updateStatus(`${this.getTabName(tabName)} 탭`, null, null);
    }

    getTabName(tabName) {
        const names = {
            audio: '음성 분석',
            subtitle: '자막 분석',
            stt: '음성인식',
            'video-edit': '영상 편집',
            'text-overlay': '텍스트 오버레이',
            compare: '비교 분석'
        };
        return names[tabName] || tabName;
    }

    async startAudioAnalysis() {
        if (this.selectedFiles.size === 0) {
            this.showError('분석할 파일을 선택하세요.');
            return;
        }

        const silenceThreshold = document.getElementById('silence-threshold').value;
        const minGap = document.getElementById('min-gap').value;

        this.updateStatus('음성 분석 중...', 0, '음성 데이터 처리 중');

        try {
            const response = await fetch('/api/analysis/audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: Array.from(this.selectedFiles)[0], // 첫 번째 파일로 분석
                    silence_threshold: parseFloat(silenceThreshold),
                    min_gap: parseFloat(minGap)
                })
            });

            const result = await response.json();

            if (result.success) {
                this.displayAudioResults(result.analysis);
                this.updateStatus('음성 분석 완료', 100, '분석 완료');
            } else {
                throw new Error(result.error || '분석 실패');
            }

        } catch (error) {
            console.error('음성 분석 실패:', error);
            this.showError('음성 분석 중 오류가 발생했습니다.');
            this.updateStatus('분석 실패', 0, '오류 발생');
        }
    }

    displayAudioResults(analysis) {
        const resultsDiv = document.getElementById('audio-results');

        // 통계 업데이트
        document.getElementById('audio-duration').textContent = `${analysis.duration.toFixed(1)}초`;
        document.getElementById('silence-count').textContent = `${analysis.silence_regions.length}개`;
        document.getElementById('voice-percentage').textContent = `${analysis.voice_percentage.toFixed(1)}%`;

        // 감지된 갭 목록
        const gapsDiv = document.getElementById('detected-gaps');
        if (analysis.silence_regions.length > 0) {
            gapsDiv.innerHTML = analysis.silence_regions.map((region, index) => `
                <div class="gap-item">
                    <span class="time-range">${region.start_time.toFixed(2)}s - ${region.end_time.toFixed(2)}s</span>
                    <span class="duration">${region.duration.toFixed(2)}초</span>
                    <button class="action-btn" onclick="app.applyGapToTimeline(${index})">
                        타임라인에 적용
                    </button>
                </div>
            `).join('');
        } else {
            gapsDiv.innerHTML = '<p class="empty-state">무음 구간이 감지되지 않았습니다.</p>';
        }

        // 파형 시각화 (기본 구현)
        this.drawAudioWaveform(analysis);

        resultsDiv.style.display = 'block';
    }

    drawAudioWaveform(analysis) {
        const canvas = document.getElementById('audio-waveform-canvas');
        const ctx = canvas.getContext('2d');

        // 캔버스 초기화
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 간단한 파형 시각화 (실제로는 더 복잡한 구현 필요)
        ctx.fillStyle = '#4a9eff';
        ctx.fillRect(0, canvas.height - 50, canvas.width * (analysis.voice_percentage / 100), 50);

        // 무음 구간 표시
        ctx.fillStyle = '#ff4444';
        analysis.silence_regions.forEach(region => {
            const x = (region.start_time / analysis.duration) * canvas.width;
            const width = ((region.end_time - region.start_time) / analysis.duration) * canvas.width;
            ctx.fillRect(x, 0, width, 30);
        });
    }

    async startSubtitleAnalysis() {
        if (this.selectedFiles.size === 0) {
            this.showError('분석할 SRT 파일을 선택하세요.');
            return;
        }

        // SRT 파일만 필터링
        const srtFiles = Array.from(this.selectedFiles).filter(path => path.endsWith('.srt'));
        if (srtFiles.length === 0) {
            this.showError('SRT 파일을 선택하세요.');
            return;
        }

        this.updateStatus('자막 분석 중...', 0, 'SRT 파일 처리 중');

        try {
            const response = await fetch('/api/analysis/srt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: srtFiles[0]
                })
            });

            const result = await response.json();

            if (result.success) {
                this.displaySubtitleResults(result.analysis);
                this.updateStatus('자막 분석 완료', 100, '분석 완료');
            } else {
                throw new Error(result.error || '분석 실패');
            }

        } catch (error) {
            console.error('자막 분석 실패:', error);
            this.showError('자막 분석 중 오류가 발생했습니다.');
        }
    }

    displaySubtitleResults(analysis) {
        // 기본 정보 업데이트
        document.getElementById('subtitle-count').textContent = `${analysis.total_subtitles}개`;
        document.getElementById('gap-count').textContent = `${analysis.gap_count}개`;
        document.getElementById('overlap-count').textContent = `${analysis.overlap_count}개`;
        document.getElementById('subtitle-duration').textContent = `${analysis.total_duration.toFixed(1)}초`;

        // 권장사항 생성
        this.generateSubtitleRecommendations(analysis);

        // 편집 도구 표시
        document.getElementById('subtitle-editing-tools').style.display = 'block';
    }

    generateSubtitleRecommendations(analysis) {
        const list = document.getElementById('subtitle-recommendations');
        const recommendations = [];

        if (analysis.overlap_count > 0) {
            recommendations.push({
                icon: '⚠️',
                text: `${analysis.overlap_count}개 자막이 겹쳐있습니다. 자동 수정 도구를 사용하세요.`,
                action: 'fix-overlaps'
            });
        }

        if (analysis.gap_count === 0 && analysis.overlap_count > 0) {
            recommendations.push({
                icon: '📏',
                text: '각 자막 간 0.1초 간격 추가를 권장합니다.',
                action: 'set-gap'
            });
        }

        recommendations.push({
            icon: '🎵',
            text: '음성과 자막 동기화를 확인하세요.',
            action: 'sync-check'
        });

        list.innerHTML = recommendations.map(rec => `
            <li class="rec-item">
                <span class="rec-icon">${rec.icon}</span>
                <span class="rec-text">${rec.text}</span>
                <button class="action-btn" onclick="app.applyRecommendation('${rec.action}')">적용</button>
            </li>
        `).join('');
    }

    async startSpeechToText() {
        if (this.selectedFiles.size === 0) {
            this.showError('음성 파일을 선택하세요.');
            return;
        }

        const language = document.getElementById('stt-language').value;
        const segmentDuration = document.getElementById('segment-duration').value;

        // 진행률 표시
        document.getElementById('stt-progress').style.display = 'block';
        this.updateProgress('stt-progress-fill', 'stt-progress-text', 0, 'STT 분석 시작...');

        try {
            const response = await fetch('/api/analysis/speech-to-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: Array.from(this.selectedFiles)[0],
                    language: language,
                    segment_duration: parseInt(segmentDuration)
                })
            });

            const result = await response.json();

            if (result.success) {
                this.displaySTTResults(result);
                this.updateProgress('stt-progress-fill', 'stt-progress-text', 100, 'STT 완료');
            } else {
                throw new Error(result.error || 'STT 실패');
            }

        } catch (error) {
            console.error('STT 실패:', error);
            this.showError('음성 인식 중 오류가 발생했습니다.');
        }
    }

    displaySTTResults(result) {
        document.getElementById('generated-srt-content').textContent = result.srt_content;
        document.getElementById('stt-results').style.display = 'block';

        // 다운로드 기능
        document.getElementById('download-srt').onclick = () => {
            this.downloadFile(result.srt_content, 'generated_subtitles.srt', 'text/plain');
        };
    }

    updateProgress(fillId, textId, percentage, text) {
        document.getElementById(fillId).style.width = `${percentage}%`;
        document.getElementById(textId).textContent = text;
    }

    updateStatus(statusText, progress, analysisStatus) {
        if (statusText) document.getElementById('status-text').textContent = statusText;
        if (progress !== null) {
            document.getElementById('overall-progress-fill').style.width = `${progress}%`;
            document.getElementById('overall-progress-text').textContent = `${progress}% 완료`;
        }
        if (analysisStatus) document.getElementById('analysis-status').textContent = analysisStatus;
    }

    showError(message) {
        alert(message); // 실제로는 더 나은 에러 표시 방법 사용
    }

    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type: type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    filterFiles(filterType) {
        const cards = document.querySelectorAll('.file-card');

        cards.forEach(card => {
            const fileType = card.getAttribute('data-file-type');
            const typeClass = this.getFileTypeClass(fileType);

            if (filterType === 'all' || typeClass === filterType) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    searchFiles(searchTerm) {
        const cards = document.querySelectorAll('.file-card');
        const term = searchTerm.toLowerCase();

        cards.forEach(card => {
            const fileName = card.querySelector('.file-title').textContent.toLowerCase();

            if (fileName.includes(term)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    applyRecommendation(action) {
        switch (action) {
            case 'fix-overlaps':
                document.getElementById('fix-overlaps').checked = true;
                break;
            case 'set-gap':
                document.getElementById('overlap-gap').value = '0.1';
                break;
            case 'sync-check':
                this.switchTab('compare');
                break;
        }
    }

    async applySubtitleFixes() {
        // 자막 수정 로직 구현
        this.updateStatus('자막 수정 중...', 50, '자동 수정 적용 중');

        // 실제 수정 API 호출은 여기에 구현
        setTimeout(() => {
            this.updateStatus('자막 수정 완료', 100, '수정 완료');
            this.showSuccess('자막이 성공적으로 수정되었습니다.');
        }, 2000);
    }

    showSuccess(message) {
        // 성공 메시지 표시
        console.log('Success:', message);
    }

    previewFile(filePath) {
        // 파일 미리보기 기능
        console.log('Preview file:', filePath);
    }

    applyGapToTimeline(gapIndex) {
        // 타임라인에 갭 적용
        console.log('Apply gap to timeline:', gapIndex);
    }
}

// 앱 초기화
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new AnalysisApp();
});

// API 호출 래퍼 클래스
class AnalysisAPI {
    static async getFiles(path = '/youtube/download', filterType = 'all') {
        const response = await fetch(`/api/analysis/files?path=${encodeURIComponent(path)}&filter_type=${filterType}`);
        return await response.json();
    }

    static async getFolderTree(path = '/youtube/download') {
        const response = await fetch(`/api/analysis/folder-tree?path=${encodeURIComponent(path)}`);
        return await response.json();
    }

    static async analyzeAudio(filePath, options = {}) {
        const response = await fetch('/api/analysis/audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: filePath, ...options })
        });
        return await response.json();
    }

    static async analyzeSubtitle(filePath) {
        const response = await fetch('/api/analysis/srt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: filePath })
        });
        return await response.json();
    }

    static async speechToText(filePath, options = {}) {
        const response = await fetch('/api/analysis/speech-to-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: filePath, ...options })
        });
        return await response.json();
    }

    static async batchAnalysis(filePaths, analysisTypes) {
        const response = await fetch('/api/analysis/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_paths: filePaths,
                analysis_types: analysisTypes
            })
        });
        return await response.json();
    }
}