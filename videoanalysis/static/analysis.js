/**
 * 유튜브 콘텐츠 분석 도구 - JavaScript 기능
 * 설계도에 따른 완전한 구현
 */

class VideoAnalysisApp {
    constructor() {
        this.selectedFiles = new Set();
        this.currentTab = 'audio';
        this.analysisResults = {};
        this.charts = {};

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadFileList();
        this.loadFolderTree();
        this.updateUI();
    }

    setupEventListeners() {
        // 탭 전환
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.getAttribute('data-tab'));
            });
        });

        // 파일 필터링 및 검색
        document.getElementById('file-search').addEventListener('input', (e) => {
            this.filterFiles(e.target.value);
        });

        document.getElementById('file-filter').addEventListener('change', (e) => {
            this.loadFileList(e.target.value);
        });

        document.getElementById('refresh-files').addEventListener('click', () => {
            this.loadFileList();
        });

        // 파일 선택 관련
        document.getElementById('select-all').addEventListener('click', () => {
            this.selectAllFiles();
        });

        document.getElementById('clear-selection').addEventListener('click', () => {
            this.clearSelection();
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

        // 슬라이더 값 업데이트
        document.getElementById('silence-threshold').addEventListener('input', (e) => {
            document.querySelector('.value-display').textContent = e.target.value;
        });

        // 범위 선택기 값 업데이트
        document.getElementById('text-size').addEventListener('input', (e) => {
            document.getElementById('size-display').textContent = e.target.value + 'px';
        });

        // 결과 액션 버튼들
        document.getElementById('export-results').addEventListener('click', () => {
            this.exportResults();
        });

        document.getElementById('clear-results').addEventListener('click', () => {
            this.clearResults();
        });

        // 동기화 기능 버튼들
        const syncVideoSrtBtn = document.getElementById('sync-video-srt');
        if (syncVideoSrtBtn) {
            syncVideoSrtBtn.addEventListener('click', () => {
                this.synchronizeVideoWithSubtitle();
            });
        }

        const syncVideoAudioBtn = document.getElementById('sync-video-audio');
        if (syncVideoAudioBtn) {
            syncVideoAudioBtn.addEventListener('click', () => {
                this.synchronizeVideoWithAudio();
            });
        }
    }

    async loadFileList(filterType = 'all') {
        try {
            this.showLoadingState('file-grid', '📄 파일 목록을 불러오는 중...');

            const response = await fetch(`/api/files?filter_type=${filterType}`);
            const data = await response.json();

            if (data.error) {
                this.showError('파일 목록 로드 실패: ' + data.error);
                return;
            }

            this.renderFileGrid(data.files);
            this.updateStatusBar();

        } catch (error) {
            console.error('파일 목록 로드 에러:', error);
            this.showError('파일 목록을 불러올 수 없습니다: ' + error.message);
        }
    }

    async loadFolderTree() {
        try {
            this.showLoadingState('folder-tree', '📁 폴더 구조를 불러오는 중...');

            const response = await fetch('/api/folder-tree');
            const data = await response.json();

            this.renderFolderTree(data);

        } catch (error) {
            console.error('폴더 트리 로드 에러:', error);
            this.showError('폴더 구조를 불러올 수 없습니다: ' + error.message);
        }
    }

    renderFileGrid(files) {
        const grid = document.getElementById('file-grid');

        if (files.length === 0) {
            grid.innerHTML = '<div class="empty-state">📭 분석 가능한 파일이 없습니다</div>';
            return;
        }

        grid.innerHTML = files.map(file => this.createFileCard(file)).join('');

        // 파일 카드 클릭 이벤트 추가
        grid.querySelectorAll('.file-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = card.querySelector('input[type="checkbox"]');
                    checkbox.checked = !checkbox.checked;
                    this.toggleFileSelection(card, checkbox.checked);
                }
            });

            const checkbox = card.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                this.toggleFileSelection(card, e.target.checked);
            });
        });
    }

    createFileCard(file) {
        const typeIcon = this.getFileTypeIcon(file.type);
        const typeClass = file.type;
        const isSelected = this.selectedFiles.has(file.path);

        return `
            <div class="file-card ${isSelected ? 'selected' : ''}" data-file-path="${file.path}">
                <div class="file-header">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''}>
                        <span class="file-icon">${typeIcon}</span>
                    </div>
                    <span class="file-type-badge ${typeClass}">${file.extension.toUpperCase()}</span>
                </div>

                <h4 class="file-title" title="${file.name}">${this.truncateText(file.name, 30)}</h4>

                <div class="file-details">
                    ${file.duration ? `<span>📏 ${this.formatDuration(file.duration)}</span>` : ''}
                    <span>💾 ${file.size_mb}MB</span>
                    <span>📅 ${file.modified_str}</span>
                </div>

                <div class="file-tags">
                    <span class="tag ${typeClass}">${this.getTypeLabel(file.type)}</span>
                    ${file.analyzable ? '<span class="tag success">분석가능</span>' : ''}
                </div>

                ${file.related_files.length > 0 ? `
                    <div class="related-files">
                        <span class="related-label">관련 파일:</span>
                        <div class="related-list">
                            ${file.related_files.slice(0, 3).map(rf =>
                                `<span class="related-file">${this.getFileTypeIcon(this.getFileTypeFromPath(rf))} ${this.getExtension(rf)}</span>`
                            ).join('')}
                            ${file.related_files.length > 3 ? '<span class="related-file">...</span>' : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderFolderTree(tree) {
        const container = document.getElementById('folder-tree');
        container.innerHTML = this.createTreeNode(tree);

        // 트리 노드 클릭 이벤트 추가
        container.querySelectorAll('.tree-node').forEach(node => {
            node.addEventListener('click', (e) => {
                e.stopPropagation();
                if (node.classList.contains('folder')) {
                    node.classList.toggle('expanded');
                    const children = node.querySelector('.tree-children');
                    if (children) {
                        children.style.display = node.classList.contains('expanded') ? 'block' : 'none';
                    }
                }
            });
        });
    }

    createTreeNode(node, level = 0) {
        const indent = '  '.repeat(level);
        const isFolder = node.type === 'folder';
        const icon = isFolder ? '📁' : this.getFileTypeIcon(node.file_type || 'other');

        let html = `
            <div class="tree-node ${isFolder ? 'folder' : 'file'}" data-path="${node.path}">
                ${indent}
                ${isFolder ? '<span class="node-toggle">▶</span>' : ''}
                <span class="node-icon">${icon}</span>
                <span class="node-label">${node.name}</span>
                ${isFolder ? `<span class="node-count">(${node.file_count} files)</span>` :
                           `<span class="node-size">${this.formatFileSize(node.size)}</span>`}
            </div>
        `;

        if (isFolder && node.children && node.children.length > 0) {
            html += `<div class="tree-children" style="display: none;">`;
            for (const child of node.children) {
                html += this.createTreeNode(child, level + 1);
            }
            html += `</div>`;
        }

        return html;
    }

    toggleFileSelection(card, isSelected) {
        const filePath = card.getAttribute('data-file-path');

        if (isSelected) {
            this.selectedFiles.add(filePath);
            card.classList.add('selected');

            // 비디오 파일이면 플레이어에 로드하고 영상 편집 탭으로 전환
            if (this.getFileType(filePath) === 'video') {
                this.loadVideoToPlayer(filePath);
                this.switchTab('video-edit');
            }
        } else {
            this.selectedFiles.delete(filePath);
            card.classList.remove('selected');
        }

        this.updateSelectedFilesList();
        this.updateStatusBar();
    }

    updateSelectedFilesList() {
        const container = document.getElementById('selected-files-list');
        const count = document.getElementById('selected-count');

        count.textContent = this.selectedFiles.size;

        if (this.selectedFiles.size === 0) {
            container.innerHTML = '<div class="empty-state">📋 분석할 파일을 선택하세요</div>';
            return;
        }

        container.innerHTML = Array.from(this.selectedFiles).map(filePath => {
            const fileName = filePath.split('/').pop();
            return `
                <div class="selected-item">
                    <span>${this.truncateText(fileName, 40)}</span>
                    <button class="remove-selected" onclick="app.removeSelectedFile('${filePath}')">
                        ❌
                    </button>
                </div>
            `;
        }).join('');
    }

    removeSelectedFile(filePath) {
        this.selectedFiles.delete(filePath);

        // 파일 카드에서 선택 해제
        const card = document.querySelector(`[data-file-path="${filePath}"]`);
        if (card) {
            card.classList.remove('selected');
            const checkbox = card.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = false;
        }

        this.updateSelectedFilesList();
        this.updateStatusBar();
    }

    selectAllFiles() {
        document.querySelectorAll('.file-card').forEach(card => {
            const checkbox = card.querySelector('input[type="checkbox"]');
            checkbox.checked = true;
            this.toggleFileSelection(card, true);
        });
    }

    clearSelection() {
        this.selectedFiles.clear();
        document.querySelectorAll('.file-card').forEach(card => {
            card.classList.remove('selected');
            const checkbox = card.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = false;
        });
        this.updateSelectedFilesList();
        this.updateStatusBar();
    }

    filterFiles(searchTerm) {
        const cards = document.querySelectorAll('.file-card');
        const term = searchTerm.toLowerCase();

        cards.forEach(card => {
            const title = card.querySelector('.file-title').textContent.toLowerCase();
            const visible = title.includes(term);
            card.style.display = visible ? 'block' : 'none';
        });
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
        this.updateStatusBar();
    }

    async startAudioAnalysis() {
        if (this.selectedFiles.size === 0) {
            this.showError('분석할 파일을 선택하세요');
            return;
        }

        const options = {
            silence_threshold: document.getElementById('silence-threshold').value,
            min_gap: document.getElementById('min-gap').value
        };

        try {
            this.showProgress('음성 분석을 시작합니다...', 0);

            const response = await fetch('/api/analysis/audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    files: Array.from(this.selectedFiles),
                    options: options
                })
            });

            const data = await response.json();
            this.handleAnalysisResults('audio', data.results);

        } catch (error) {
            console.error('음성 분석 에러:', error);
            this.showError('음성 분석 중 오류가 발생했습니다: ' + error.message);
        }
    }

    async startSubtitleAnalysis() {
        const srtFiles = Array.from(this.selectedFiles).filter(path => path.endsWith('.srt'));

        if (srtFiles.length === 0) {
            this.showError('SRT 파일을 선택하세요');
            return;
        }

        try {
            this.showProgress('자막 분석을 시작합니다...', 0);

            const response = await fetch('/api/analysis/subtitle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    files: srtFiles
                })
            });

            const data = await response.json();
            this.handleAnalysisResults('subtitle', data.results);

        } catch (error) {
            console.error('자막 분석 에러:', error);
            this.showError('자막 분석 중 오류가 발생했습니다: ' + error.message);
        }
    }

    async startSpeechToText() {
        const audioFiles = Array.from(this.selectedFiles).filter(path =>
            path.match(/\.(mp4|webm|avi|mov|mp3|wav|m4a|flac)$/i)
        );

        if (audioFiles.length === 0) {
            this.showError('오디오/비디오 파일을 선택하세요');
            return;
        }

        const options = {
            language: document.getElementById('stt-language').value,
            segment_duration: document.getElementById('segment-duration').value
        };

        try {
            document.getElementById('stt-progress').style.display = 'block';
            this.showProgress('음성 인식을 시작합니다...', 0);

            const response = await fetch('/api/analysis/stt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    files: audioFiles,
                    options: options
                })
            });

            const data = await response.json();
            this.handleSTTResults(data.results);

        } catch (error) {
            console.error('STT 분석 에러:', error);
            this.showError('음성 인식 중 오류가 발생했습니다: ' + error.message);
        }
    }

    async startComparison() {
        const originalFile = document.getElementById('original-srt').value;
        const generatedFile = document.getElementById('generated-srt').value;

        if (!originalFile || !generatedFile) {
            this.showError('두 개의 SRT 파일을 모두 선택하세요');
            return;
        }

        try {
            this.showProgress('비교 분석을 시작합니다...', 0);

            const response = await fetch('/api/analysis/compare', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    original_file: originalFile,
                    generated_file: generatedFile
                })
            });

            const data = await response.json();
            this.handleComparisonResults(data.data);

        } catch (error) {
            console.error('비교 분석 에러:', error);
            this.showError('비교 분석 중 오류가 발생했습니다: ' + error.message);
        }
    }

    handleAnalysisResults(type, results) {
        this.analysisResults[type] = results;

        if (type === 'audio') {
            this.displayAudioResults(results);
        } else if (type === 'subtitle') {
            this.displaySubtitleResults(results);
        }

        this.showProgress('분석 완료!', 100);
        setTimeout(() => this.hideProgress(), 2000);
    }

    displayAudioResults(results) {
        const successResults = results.filter(r => r.status === 'success');

        if (successResults.length === 0) {
            this.showError('분석 가능한 파일이 없습니다');
            return;
        }

        // 첫 번째 성공 결과 표시
        const firstResult = successResults[0];
        const data = firstResult.data;

        document.getElementById('audio-duration').textContent = this.formatDuration(data.duration);
        document.getElementById('silence-count').textContent = data.silence_regions.length + '개';
        document.getElementById('voice-percentage').textContent = (data.voice_percentage || 0).toFixed(1) + '%';

        // 갭 목록 표시
        const gapsContainer = document.getElementById('detected-gaps');
        gapsContainer.innerHTML = data.silence_regions.map(gap => `
            <div class="gap-item">
                <span class="time-range">${(gap.start || 0).toFixed(2)}s - ${(gap.end || 0).toFixed(2)}s</span>
                <span class="duration">${(gap.duration || 0).toFixed(2)}초</span>
                <button class="action-btn" onclick="app.applyToTimeline('${gap.start || 0}', '${gap.end || 0}')">
                    🎬 타임라인에 적용
                </button>
            </div>
        `).join('');

        // 오디오 시각화 (간단한 막대 그래프)
        this.drawAudioVisualization(data);

        document.getElementById('audio-results').style.display = 'block';
    }

    displaySubtitleResults(results) {
        const successResults = results.filter(r => r.status === 'success');

        if (successResults.length === 0) {
            this.showError('분석 가능한 SRT 파일이 없습니다');
            return;
        }

        // 첫 번째 성공 결과 표시
        const firstResult = successResults[0];
        const data = firstResult.data;

        document.getElementById('subtitle-count').textContent = data.total_subtitles;
        document.getElementById('gap-count').textContent = data.gap_count;
        document.getElementById('overlap-count').textContent = data.overlap_count;
        document.getElementById('subtitle-duration').textContent = this.formatDuration(data.total_duration);

        // 권장사항 표시
        if (data.recommendations) {
            this.displayRecommendations(data.recommendations);
        }

        // 편집 도구 표시
        document.getElementById('subtitle-editing-tools').style.display = 'block';
    }

    handleSTTResults(results) {
        const successResults = results.filter(r => r.status === 'success');

        if (successResults.length === 0) {
            this.showError('음성 인식에 실패했습니다');
            return;
        }

        // 첫 번째 성공 결과 표시
        const firstResult = successResults[0];
        const data = firstResult.data;

        document.getElementById('generated-srt-content').textContent = data.srt_content;
        document.getElementById('recognition-accuracy').textContent = `🎯 인식률: ${(data.accuracy || 0).toFixed(1)}%`;
        document.getElementById('recognition-segments').textContent = `📊 ${data.successful_segments}/${data.total_segments} 구간 성공`;

        document.getElementById('stt-results').style.display = 'block';
        document.getElementById('stt-progress').style.display = 'none';

        // SRT 다운로드 버튼 이벤트
        document.getElementById('download-srt').onclick = () => {
            this.downloadSRT(data.srt_content, 'generated_subtitles.srt');
        };
    }

    handleComparisonResults(data) {
        document.getElementById('original-subtitle-count').textContent = `${data.original.analysis.total_subtitles}개 자막`;
        document.getElementById('original-details').textContent = `${data.original.analysis.total_duration.toFixed(1)}초, ${data.original.analysis.overlap_count}개 겹침`;

        document.getElementById('generated-subtitle-count').textContent = `${data.generated.analysis.total_subtitles}개 자막`;
        document.getElementById('generated-details').textContent = `${data.generated.analysis.total_duration.toFixed(1)}초, ${data.generated.analysis.gap_count}개 갭`;

        // 자막 목록 표시
        this.displaySubtitleList('original-subtitle-list', data.original.subtitles);
        this.displaySubtitleList('generated-subtitle-list', data.generated.subtitles);

        document.getElementById('comparison-results').style.display = 'block';
    }

    displaySubtitleList(containerId, subtitles) {
        const container = document.getElementById(containerId);
        container.innerHTML = subtitles.map(sub => `
            <div class="subtitle-item">
                <div class="subtitle-timing">${this.formatDuration(sub.start_time)} → ${this.formatDuration(sub.end_time)}</div>
                <div class="subtitle-text">${sub.text}</div>
            </div>
        `).join('');
    }

    displayRecommendations(recommendations) {
        const container = document.getElementById('subtitle-recommendations');
        container.innerHTML = recommendations.map(rec => `
            <li class="rec-item">
                <span class="rec-icon">${rec.icon}</span>
                <span class="rec-text">${rec.message}</span>
                ${rec.action ? `<button class="rec-action" onclick="app.executeRecommendation('${rec.action}')">${rec.action}</button>` : ''}
            </li>
        `).join('');
    }

    drawAudioVisualization(data) {
        const canvas = document.getElementById('audio-waveform-canvas');
        const ctx = canvas.getContext('2d');

        // 캔버스 클리어
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 간단한 오디오 시각화 (무음 구간 표시)
        const width = canvas.width;
        const height = canvas.height;

        // 배경
        ctx.fillStyle = 'rgba(74, 158, 255, 0.1)';
        ctx.fillRect(0, 0, width, height);

        // 무음 구간 표시
        if (data.silence_regions && data.silence_regions.length > 0) {
            ctx.fillStyle = 'rgba(255, 68, 68, 0.5)';

            data.silence_regions.forEach(region => {
                const startX = (region.start_time / data.duration) * width;
                const endX = (region.end_time / data.duration) * width;
                ctx.fillRect(startX, 0, endX - startX, height);
            });
        }

        // 시간 마커
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;

        const timeInterval = Math.ceil(data.duration / 10);
        for (let i = 0; i <= data.duration; i += timeInterval) {
            const x = (i / data.duration) * width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    showProgress(message, percent) {
        document.getElementById('overall-progress-text').textContent = message;
        document.getElementById('overall-progress-fill').style.width = percent + '%';

        // STT 전용 진행률
        if (document.getElementById('stt-progress-fill')) {
            document.getElementById('stt-progress-text').textContent = message;
            document.getElementById('stt-progress-fill').style.width = percent + '%';
        }
    }

    hideProgress() {
        document.getElementById('overall-progress-text').textContent = '대기 중...';
        document.getElementById('overall-progress-fill').style.width = '0%';
    }

    showLoadingState(elementId, message) {
        const element = document.getElementById(elementId);
        element.innerHTML = `<div class="loading">${message}</div>`;
    }

    showError(message) {
        // 간단한 에러 표시 (실제로는 토스트 메시지나 모달 사용 권장)
        alert('❌ ' + message);
        console.error(message);
    }

    updateStatusBar() {
        document.getElementById('file-count').textContent = `📄 파일 ${this.selectedFiles.size}개 선택`;
        document.getElementById('analysis-status').textContent = `📊 ${this.getTabLabel(this.currentTab)} 탭`;

        if (this.selectedFiles.size > 0) {
            document.getElementById('status-text').textContent = '✅ 분석 준비됨';
        } else {
            document.getElementById('status-text').textContent = '⏳ 파일 선택 대기';
        }
    }

    updateUI() {
        this.updateStatusBar();
        this.updateSelectedFilesList();
    }

    // 유틸리티 함수들
    getFileTypeIcon(type) {
        const icons = {
            video: '🎬',
            audio: '🎵',
            subtitle: '📝',
            other: '📄'
        };
        return icons[type] || icons.other;
    }

    getTypeLabel(type) {
        const labels = {
            video: '비디오',
            audio: '오디오',
            subtitle: '자막',
            other: '기타'
        };
        return labels[type] || labels.other;
    }

    getTabLabel(tab) {
        const labels = {
            audio: '음성 분석',
            subtitle: '자막 분석',
            stt: '음성→자막',
            'video-edit': '영상 편집',
            'text-overlay': '텍스트 오버레이',
            compare: '비교 분석'
        };
        return labels[tab] || tab;
    }

    getFileTypeFromPath(path) {
        const ext = path.split('.').pop().toLowerCase();
        if (['.mp4', '.webm', '.avi', '.mov', '.mkv'].includes('.' + ext)) return 'video';
        if (['.mp3', '.wav', '.m4a', '.flac', '.aac'].includes('.' + ext)) return 'audio';
        if (['.srt', '.vtt', '.ass'].includes('.' + ext)) return 'subtitle';
        return 'other';
    }

    getExtension(path) {
        return path.split('.').pop().toUpperCase();
    }

    formatDuration(seconds) {
        if (!seconds) return '0초';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    formatFileSize(bytes) {
        if (!bytes) return '0B';

        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)}${units[unitIndex]}`;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    downloadSRT(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    exportResults() {
        if (Object.keys(this.analysisResults).length === 0) {
            this.showError('내보낼 분석 결과가 없습니다');
            return;
        }

        const results = {
            timestamp: new Date().toISOString(),
            selectedFiles: Array.from(this.selectedFiles),
            analysisResults: this.analysisResults
        };

        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analysis_results_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    clearResults() {
        this.analysisResults = {};
        document.getElementById('audio-results').style.display = 'none';
        document.getElementById('stt-results').style.display = 'none';
        document.getElementById('comparison-results').style.display = 'none';
        document.getElementById('subtitle-editing-tools').style.display = 'none';
        this.hideProgress();
    }

    applyToTimeline(startTime, endTime) {
        // 타임라인 편집기에 적용하는 로직
        console.log(`타임라인에 적용: ${startTime}s - ${endTime}s`);
        this.showError('타임라인 편집기 기능은 아직 구현 중입니다');
    }

    executeRecommendation(action) {
        // 권장사항 실행 로직
        console.log(`권장사항 실행: ${action}`);
        this.showError('자동 수정 기능은 아직 구현 중입니다');
    }

    loadVideoToPlayer(filePath) {
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) {
            // 파일 경로를 서버에서 제공하는 정적 파일 경로로 변환
            const videoUrl = `/api/file-content?path=${encodeURIComponent(filePath)}`;

            // 기존 이벤트 리스너 제거
            videoPlayer.removeEventListener('loadedmetadata', this.onVideoLoadedMetadata);
            videoPlayer.removeEventListener('timeupdate', this.onVideoTimeUpdate);
            videoPlayer.removeEventListener('canplay', this.onVideoCanPlay);

            videoPlayer.src = videoUrl;

            // 이벤트 리스너를 인스턴스 메서드로 바인딩
            this.onVideoLoadedMetadata = () => {
                const totalTime = document.getElementById('total-time');
                if (totalTime) {
                    totalTime.textContent = this.formatTime(videoPlayer.duration);
                }

                const timeline = document.getElementById('video-timeline');
                if (timeline) {
                    timeline.max = videoPlayer.duration;
                    timeline.addEventListener('input', () => {
                        videoPlayer.currentTime = timeline.value;
                    });
                }

                // 오디오 시각화 초기화
                this.initializeVideoAudioVisualization();
                console.log(`비디오 메타데이터 로드 완료: 길이 ${videoPlayer.duration}초`);
            };

            this.onVideoTimeUpdate = () => {
                const currentTime = document.getElementById('current-time');
                if (currentTime) {
                    currentTime.textContent = this.formatTime(videoPlayer.currentTime);
                }

                const timeline = document.getElementById('video-timeline');
                if (timeline && !timeline.dataset.userSeeking) {
                    timeline.value = videoPlayer.currentTime;
                }

                // 실시간 오디오 시각화 업데이트
                this.updateVideoAudioVisualization(videoPlayer.currentTime);
            };

            this.onVideoCanPlay = () => {
                console.log('비디오 재생 준비 완료');
                // 오디오 트랙이 있는지 확인
                if (videoPlayer.audioTracks && videoPlayer.audioTracks.length > 0) {
                    console.log(`오디오 트랙 감지: ${videoPlayer.audioTracks.length}개`);
                } else {
                    console.log('오디오 트랙 정보를 가져올 수 없음');
                }
            };

            // 이벤트 리스너 등록
            videoPlayer.addEventListener('loadedmetadata', this.onVideoLoadedMetadata);
            videoPlayer.addEventListener('timeupdate', this.onVideoTimeUpdate);
            videoPlayer.addEventListener('canplay', this.onVideoCanPlay);

            // 음성과 비디오가 함께 재생되도록 설정
            videoPlayer.muted = false;
            videoPlayer.controls = true;
            videoPlayer.preload = 'metadata';
            videoPlayer.volume = 1.0;

            // 동적으로 소스 타입 설정
            if (filePath.toLowerCase().includes('.mp4')) {
                videoPlayer.querySelector('source[type="video/mp4"]').src = videoUrl;
            } else if (filePath.toLowerCase().includes('.webm')) {
                videoPlayer.querySelector('source[type="video/webm"]').src = videoUrl;
            }

            console.log(`비디오 로드 시작: ${filePath}`);
        }
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    initializeVideoAudioVisualization() {
        const canvas = document.getElementById('video-audio-waveform');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        this.videoAudioCanvas = canvas;
        this.videoAudioCtx = ctx;

        // 캔버스 초기화
        ctx.fillStyle = 'rgba(74, 158, 255, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 시간 그리드 그리기
        this.drawTimeGrid();

        console.log('비디오 오디오 시각화 초기화 완료');
    }

    updateVideoAudioVisualization(currentTime) {
        if (!this.videoAudioCanvas || !this.videoAudioCtx) return;

        const canvas = this.videoAudioCanvas;
        const ctx = this.videoAudioCtx;
        const videoPlayer = document.getElementById('video-player');

        if (!videoPlayer || !videoPlayer.duration) return;

        // 재생 위치 표시
        const progress = currentTime / videoPlayer.duration;
        const x = progress * canvas.width;

        // 캔버스 지우고 다시 그리기
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 배경
        ctx.fillStyle = 'rgba(74, 158, 255, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 시간 그리드
        this.drawTimeGrid();

        // 재생 위치 선
        ctx.strokeStyle = 'rgba(255, 68, 68, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();

        // 무음 구간이 있으면 표시
        if (this.analysisResults.audio && this.analysisResults.audio.length > 0) {
            const audioResult = this.analysisResults.audio.find(r => r.status === 'success');
            if (audioResult && audioResult.data.silence_regions) {
                this.drawSilenceRegions(audioResult.data.silence_regions, videoPlayer.duration);
            }
        }
    }

    drawTimeGrid() {
        if (!this.videoAudioCanvas || !this.videoAudioCtx) return;

        const canvas = this.videoAudioCanvas;
        const ctx = this.videoAudioCtx;
        const videoPlayer = document.getElementById('video-player');

        if (!videoPlayer || !videoPlayer.duration) return;

        // 시간 마커
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

        const timeInterval = Math.max(1, Math.ceil(videoPlayer.duration / 20));
        for (let i = 0; i <= videoPlayer.duration; i += timeInterval) {
            const x = (i / videoPlayer.duration) * canvas.width;

            // 세로선
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();

            // 시간 텍스트
            ctx.fillText(this.formatTime(i), x + 2, 12);
        }
    }

    drawSilenceRegions(silenceRegions, duration) {
        if (!this.videoAudioCanvas || !this.videoAudioCtx) return;

        const canvas = this.videoAudioCanvas;
        const ctx = this.videoAudioCtx;

        ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';

        silenceRegions.forEach(region => {
            const startX = (region.start / duration) * canvas.width;
            const endX = (region.end / duration) * canvas.width;
            ctx.fillRect(startX, 0, endX - startX, canvas.height);
        });
    }

    synchronizeVideoWithSubtitle() {
        const videoPlayer = document.getElementById('video-player');
        if (!videoPlayer || !videoPlayer.src) {
            this.showError('먼저 비디오를 로드하세요');
            return;
        }

        // 선택된 파일 중 SRT 파일 찾기
        const srtFiles = Array.from(this.selectedFiles).filter(path => path.endsWith('.srt'));
        if (srtFiles.length === 0) {
            this.showError('SRT 파일을 선택하세요');
            return;
        }

        // 자막 분석 결과가 있으면 시각화에 반영
        if (this.analysisResults.subtitle && this.analysisResults.subtitle.length > 0) {
            console.log('자막 데이터를 비디오와 동기화 중...');
            this.showSuccess('자막과 비디오가 동기화되었습니다');
        } else {
            // 자막 분석이 안 되어 있으면 자동으로 분석 시작
            this.startSubtitleAnalysis();
        }
    }

    synchronizeVideoWithAudio() {
        const videoPlayer = document.getElementById('video-player');
        if (!videoPlayer || !videoPlayer.src) {
            this.showError('먼저 비디오를 로드하세요');
            return;
        }

        // 현재 비디오의 음성 분석 시작
        if (this.analysisResults.audio && this.analysisResults.audio.length > 0) {
            console.log('음성 분석 데이터를 비디오와 동기화 중...');
            // 기존 분석 결과를 시각화에 반영
            this.updateVideoAudioVisualization(videoPlayer.currentTime);
            this.showSuccess('음성 분석 결과가 비디오와 동기화되었습니다');
        } else {
            // 음성 분석이 안 되어 있으면 자동으로 분석 시작
            this.showInfo('비디오의 음성을 분석합니다...');
            this.startAudioAnalysis();
        }
    }

    showSuccess(message) {
        console.log('✅ ' + message);
        // 실제 구현에서는 토스트 메시지나 알림을 표시
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = '✅ ' + message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    showInfo(message) {
        console.log('ℹ️ ' + message);
        // 실제 구현에서는 토스트 메시지나 알림을 표시
        const notification = document.createElement('div');
        notification.className = 'notification info';
        notification.textContent = 'ℹ️ ' + message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    getFileType(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        if (['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext)) return 'video';
        if (['mp3', 'wav', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
        if (['srt', 'vtt', 'ass'].includes(ext)) return 'subtitle';
        return 'other';
    }
}

// 앱 초기화
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new VideoAnalysisApp();
});

// 전역 함수 (HTML에서 호출)
function removeSelectedFile(filePath) {
    app.removeSelectedFile(filePath);
}

function applyToTimeline(startTime, endTime) {
    app.applyToTimeline(startTime, endTime);
}

function executeRecommendation(action) {
    app.executeRecommendation(action);
}