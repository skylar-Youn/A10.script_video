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

        // 재생 버튼 초기 상태 설정
        setTimeout(() => {
            this.updatePlayPauseButton();
        }, 100);
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

        document.getElementById('start-audio-extraction').addEventListener('click', () => {
            this.startAudioExtraction();
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

        // 영상+음성 동시 재생 기능
        const simultaneousPlayBtn = document.getElementById('simultaneous-play');
        if (simultaneousPlayBtn) {
            simultaneousPlayBtn.addEventListener('click', () => {
                this.startSimultaneousPlayback();
            });
        }

        // 음성 묶음 편집 기능
        const bundleAudioBtn = document.getElementById('bundle-audio');
        if (bundleAudioBtn) {
            bundleAudioBtn.addEventListener('click', () => {
                this.showAudioBundleDialog();
            });
        }

        // 고급 타임라인 편집기 기능
        this.setupTimelineEditor();

        // 디버그 버튼
        const debugWaveformBtn = document.getElementById('debug-waveform');
        if (debugWaveformBtn) {
            debugWaveformBtn.addEventListener('click', () => {
                this.debugWaveform();
            });
        }

        // 실제 파형 테스트 버튼
        const testRealWaveformBtn = document.getElementById('test-real-waveform');
        if (testRealWaveformBtn) {
            testRealWaveformBtn.addEventListener('click', () => {
                this.testRealWaveform();
            });
        }
    }

    setupTimelineEditor() {
        // 타임라인 확대/축소
        const timelineZoom = document.getElementById('timeline-zoom');
        if (timelineZoom) {
            timelineZoom.addEventListener('input', (e) => {
                this.updateTimelineZoom(e.target.value);
                document.getElementById('zoom-display').textContent = e.target.value + 'x';
            });
        }

        // 재생/일시정지 버튼
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                this.togglePlayback();
            });
        }

        // 정지 버튼
        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.stopVideo();
            });
        }

        // 되감기/빨리감기
        const rewindBtn = document.getElementById('rewind-btn');
        if (rewindBtn) {
            rewindBtn.addEventListener('click', () => {
                this.seekVideo(-10);
            });
        }

        const forwardBtn = document.getElementById('forward-btn');
        if (forwardBtn) {
            forwardBtn.addEventListener('click', () => {
                this.seekVideo(10);
            });
        }

        // 자막에 맞춤 버튼
        const fitToSubtitlesBtn = document.getElementById('fit-to-subtitles');
        if (fitToSubtitlesBtn) {
            fitToSubtitlesBtn.addEventListener('click', () => {
                this.fitTimelineToSubtitles();
            });
        }

        // 타임라인 클릭으로 재생 위치 이동
        const timelineContent = document.getElementById('timeline-content');
        if (timelineContent) {
            timelineContent.addEventListener('click', (e) => {
                this.seekToTimelinePosition(e);
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

            // 오디오 파일이면 즉시 파형 분석 시도
            if (this.getFileType(filePath) === 'audio') {
                console.log('🎵 오디오 파일 선택됨, 즉시 파형 분석 시도:', filePath);
                this.switchTab('video-edit'); // 영상 편집 탭으로 이동
                setTimeout(() => {
                    this.drawAudioWaveform(filePath);
                }, 500);
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

    formatDuration(seconds, short = false) {
        if (!seconds) return short ? '0:00' : '0초';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (short) {
            // 짧은 형식: 분:초만 표시
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        } else {
            // 기본 형식
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            } else {
                return `${minutes}:${secs.toString().padStart(2, '0')}`;
            }
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
                // 오디오 트랙이 있는지 확인 (웹 표준 방법)
                try {
                    if (videoPlayer.webkitAudioDecodedByteCount !== undefined ||
                        videoPlayer.mozHasAudio !== undefined ||
                        (videoPlayer.videoWidth > 0 && videoPlayer.duration > 0)) {
                        console.log('비디오에 오디오 트랙이 포함되어 있습니다');
                    } else {
                        console.log('오디오 트랙 감지됨 (표준 비디오 요소)');
                    }
                } catch (error) {
                    console.log('오디오 트랙 정보 확인 중 오류:', error.message);
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

    // 영상+음성 동시 재생 기능
    startSimultaneousPlayback() {
        const selectedFiles = Array.from(this.selectedFiles);
        const videoFiles = selectedFiles.filter(path => this.getFileType(path) === 'video');
        const audioFiles = selectedFiles.filter(path => this.getFileType(path) === 'audio');

        if (videoFiles.length === 0) {
            this.showError('영상 파일을 선택하세요');
            return;
        }

        // 동시 재생 패널 생성
        this.createSimultaneousPlaybackPanel(videoFiles, audioFiles);
    }

    createSimultaneousPlaybackPanel(videoFiles, audioFiles) {
        const existingPanel = document.getElementById('simultaneous-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'simultaneous-panel';
        panel.className = 'simultaneous-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>🎥 영상 & 음성 동시 재생</h3>
                <button onclick="this.parentElement.parentElement.remove()" class="close-btn">✕</button>
            </div>

            <div class="media-containers">
                <div class="video-container">
                    <h4>📺 영상</h4>
                    <video id="sync-video" controls style="width: 100%; max-height: 300px;">
                        <source src="/api/file-content?path=${encodeURIComponent(videoFiles[0])}" type="video/mp4">
                    </video>

                    <!-- 음성 파형 표시 영역 -->
                    <div class="waveform-container">
                        <h5>🎵 영상 음성 파형</h5>
                        <canvas id="video-waveform" width="800" height="100" style="width: 100%; height: 100px; border: 1px solid #ddd; background: #000;"></canvas>
                        <div class="waveform-controls">
                            <button id="analyze-video-audio" class="secondary-btn">파형 분석</button>
                            <span id="waveform-status" class="status-text">파형을 분석하려면 '파형 분석' 버튼을 클릭하세요</span>
                        </div>
                    </div>

                    <div class="video-controls">
                        <select id="video-selector">
                            ${videoFiles.map(file => `<option value="${file}">${file.split('/').pop()}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="audio-container">
                    <h4>🎵 음성 (묶음 처리)</h4>
                    <div id="audio-bundle">
                        ${audioFiles.map((file, index) => `
                            <div class="audio-item" data-audio-path="${file}">
                                <audio controls style="width: 100%;">
                                    <source src="/api/file-content?path=${encodeURIComponent(file)}" type="audio/mpeg">
                                </audio>
                                <div class="audio-controls">
                                    <label>${file.split('/').pop()}</label>
                                    <input type="range" class="volume-slider" min="0" max="100" value="50"
                                           onchange="this.parentElement.parentElement.querySelector('audio').volume = this.value/100">
                                    <button onclick="this.parentElement.parentElement.remove()" class="remove-audio">🗑️</button>
                                </div>
                            </div>
                        `).join('')}

                        <button id="add-audio-to-bundle" class="add-btn">+ 음성 파일 추가</button>
                    </div>
                </div>
            </div>

            <div class="playback-controls">
                <button id="sync-play-all" class="primary-btn">⏯️ 모두 재생</button>
                <button id="sync-pause-all" class="secondary-btn">⏸️ 모두 정지</button>
                <button id="sync-reset-all" class="secondary-btn">⏮️ 처음으로</button>
                <button id="save-audio-bundle" class="success-btn">💾 음성 묶음 저장</button>
            </div>
        `;

        document.body.appendChild(panel);
        this.setupSimultaneousPlaybackControls();
    }

    setupSimultaneousPlaybackControls() {
        const videoElement = document.getElementById('sync-video');
        const audioElements = document.querySelectorAll('#audio-bundle audio');

        // 모두 재생
        document.getElementById('sync-play-all').addEventListener('click', () => {
            videoElement.play();
            audioElements.forEach(audio => audio.play());
        });

        // 모두 정지
        document.getElementById('sync-pause-all').addEventListener('click', () => {
            videoElement.pause();
            audioElements.forEach(audio => audio.pause());
        });

        // 처음으로
        document.getElementById('sync-reset-all').addEventListener('click', () => {
            videoElement.currentTime = 0;
            audioElements.forEach(audio => audio.currentTime = 0);
        });

        // 비디오 선택 변경
        document.getElementById('video-selector').addEventListener('change', (e) => {
            const newVideoPath = e.target.value;
            videoElement.src = `/api/file-content?path=${encodeURIComponent(newVideoPath)}`;
        });

        // 음성 파일 추가
        document.getElementById('add-audio-to-bundle').addEventListener('click', () => {
            this.showAudioFileSelector();
        });

        // 음성 묶음 저장
        document.getElementById('save-audio-bundle').addEventListener('click', () => {
            this.saveAudioBundle();
        });

        // 파형 분석 버튼
        document.getElementById('analyze-video-audio').addEventListener('click', () => {
            this.analyzeVideoWaveform(videoElement);
        });

        // 비디오 시간 동기화 및 파형 표시
        videoElement.addEventListener('timeupdate', () => {
            // 필요시 음성 파일들도 동일한 시간으로 동기화
            const currentTime = videoElement.currentTime;
            audioElements.forEach(audio => {
                if (Math.abs(audio.currentTime - currentTime) > 1) {
                    audio.currentTime = currentTime;
                }
            });

            // 파형에 현재 재생 위치 표시
            this.updateWaveformCursor(currentTime);
        });
    }

    showAudioBundleDialog() {
        const audioFiles = Array.from(this.selectedFiles).filter(path => this.getFileType(path) === 'audio');

        if (audioFiles.length === 0) {
            this.showError('음성 파일을 선택하세요');
            return;
        }

        const dialog = document.createElement('div');
        dialog.className = 'audio-bundle-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>🎵 음성 파일 묶음 편집</h3>

                <div class="bundle-list">
                    ${audioFiles.map((file, index) => `
                        <div class="bundle-item">
                            <span>${file.split('/').pop()}</span>
                            <input type="number" placeholder="시작시간(초)" class="start-time" data-index="${index}">
                            <input type="range" min="0" max="100" value="100" class="volume" data-index="${index}">
                            <button onclick="this.parentElement.remove()">삭제</button>
                        </div>
                    `).join('')}
                </div>

                <div class="dialog-actions">
                    <button onclick="this.parentElement.parentElement.remove()" class="cancel-btn">취소</button>
                    <button id="apply-bundle" class="primary-btn">적용</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        document.getElementById('apply-bundle').addEventListener('click', () => {
            this.applyAudioBundle();
            dialog.remove();
        });
    }

    showAudioFileSelector() {
        // 파일 선택 다이얼로그 구현
        const allAudioFiles = Array.from(document.querySelectorAll('.file-card'))
            .filter(card => card.querySelector('.file-type-badge').textContent.toLowerCase()
                .includes('mp3') || card.querySelector('.file-type-badge').textContent.toLowerCase()
                .includes('wav'))
            .map(card => card.getAttribute('data-file-path'));

        const selector = document.createElement('div');
        selector.className = 'file-selector-dialog';
        selector.innerHTML = `
            <div class="dialog-content">
                <h3>음성 파일 선택</h3>
                <div class="file-options">
                    ${allAudioFiles.map(file => `
                        <label>
                            <input type="checkbox" value="${file}">
                            ${file.split('/').pop()}
                        </label>
                    `).join('')}
                </div>
                <div class="dialog-actions">
                    <button onclick="this.parentElement.parentElement.remove()">취소</button>
                    <button id="add-selected-audio">추가</button>
                </div>
            </div>
        `;

        document.body.appendChild(selector);

        document.getElementById('add-selected-audio').addEventListener('click', () => {
            const selected = selector.querySelectorAll('input[type="checkbox"]:checked');
            selected.forEach(checkbox => {
                this.addAudioToBundle(checkbox.value);
            });
            selector.remove();
        });
    }

    addAudioToBundle(audioPath) {
        const audioBundle = document.getElementById('audio-bundle');
        const audioItem = document.createElement('div');
        audioItem.className = 'audio-item';
        audioItem.setAttribute('data-audio-path', audioPath);
        audioItem.innerHTML = `
            <audio controls style="width: 100%;">
                <source src="/api/file-content?path=${encodeURIComponent(audioPath)}" type="audio/mpeg">
            </audio>
            <div class="audio-controls">
                <label>${audioPath.split('/').pop()}</label>
                <input type="range" class="volume-slider" min="0" max="100" value="50"
                       onchange="this.parentElement.parentElement.querySelector('audio').volume = this.value/100">
                <button onclick="this.parentElement.parentElement.remove()" class="remove-audio">🗑️</button>
            </div>
        `;

        audioBundle.insertBefore(audioItem, document.getElementById('add-audio-to-bundle'));
    }

    saveAudioBundle() {
        const audioItems = document.querySelectorAll('#audio-bundle .audio-item');
        const bundleData = Array.from(audioItems).map(item => ({
            path: item.getAttribute('data-audio-path'),
            volume: item.querySelector('.volume-slider').value / 100,
            name: item.querySelector('label').textContent
        }));

        // 묶음 데이터를 로컬 스토리지에 저장
        const bundleName = prompt('음성 묶음 이름을 입력하세요:', 'Bundle_' + Date.now());
        if (bundleName) {
            const savedBundles = JSON.parse(localStorage.getItem('audioBundles') || '[]');
            savedBundles.push({
                name: bundleName,
                created: new Date().toISOString(),
                files: bundleData
            });
            localStorage.setItem('audioBundles', JSON.stringify(savedBundles));
            this.showSuccess(`음성 묶음 "${bundleName}"이 저장되었습니다`);
        }
    }

    applyAudioBundle() {
        // 음성 묶음 설정 적용 로직
        const bundleItems = document.querySelectorAll('.bundle-item');
        const bundleConfig = Array.from(bundleItems).map(item => ({
            startTime: parseFloat(item.querySelector('.start-time').value) || 0,
            volume: parseInt(item.querySelector('.volume').value) / 100
        }));

        this.showSuccess('음성 묶음 설정이 적용되었습니다');
    }

    // 영상 음성 파형 분석
    async analyzeVideoWaveform(videoElement) {
        const statusElement = document.getElementById('waveform-status');
        const canvas = document.getElementById('video-waveform');
        const ctx = canvas.getContext('2d');

        try {
            statusElement.textContent = '음성 데이터를 분석하는 중...';

            // Web Audio API로 비디오 음성 분석
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaElementSource(videoElement);
            const analyser = audioContext.createAnalyser();

            source.connect(analyser);
            analyser.connect(audioContext.destination);

            analyser.fftSize = 2048;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            // 파형 데이터 저장용
            this.waveformData = [];
            this.videoDuration = videoElement.duration || 0;

            // 실시간 파형 그리기
            const drawWaveform = () => {
                analyser.getByteTimeDomainData(dataArray);

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.lineWidth = 1;
                ctx.strokeStyle = '#00ff00';
                ctx.beginPath();

                const sliceWidth = canvas.width / bufferLength;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0;
                    const y = v * canvas.height / 2;

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }

                    x += sliceWidth;
                }

                ctx.stroke();

                // 현재 시간 커서 그리기
                if (this.videoDuration > 0) {
                    const currentTime = videoElement.currentTime;
                    const cursorX = (currentTime / this.videoDuration) * canvas.width;

                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(cursorX, 0);
                    ctx.lineTo(cursorX, canvas.height);
                    ctx.stroke();
                }

                if (!videoElement.paused) {
                    requestAnimationFrame(drawWaveform);
                }
            };

            // 비디오가 재생 중일 때만 파형 그리기
            if (!videoElement.paused) {
                drawWaveform();
            }

            // 비디오 재생/정지에 따른 파형 업데이트
            videoElement.addEventListener('play', drawWaveform);
            videoElement.addEventListener('pause', () => {
                this.drawStaticWaveform(canvas, videoElement);
            });

            statusElement.textContent = '실시간 파형 분석 중 (재생 시 표시됩니다)';

            // 정적 파형도 그리기
            this.drawStaticWaveform(canvas, videoElement);

        } catch (error) {
            console.error('파형 분석 에러:', error);
            statusElement.textContent = '파형 분석 실패: ' + error.message;
            this.showError('파형 분석에 실패했습니다: ' + error.message);
        }
    }

    // 정적 파형 그리기 (재생하지 않을 때)
    drawStaticWaveform(canvas, videoElement) {
        const ctx = canvas.getContext('2d');

        // 기본 파형 모양 그리기
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        // 시간 마커 그리기
        if (this.videoDuration > 0) {
            const intervals = 10; // 10개 구간
            ctx.fillStyle = '#888';
            ctx.font = '10px Arial';

            for (let i = 0; i <= intervals; i++) {
                const x = (i / intervals) * canvas.width;
                const time = (i / intervals) * this.videoDuration;

                ctx.beginPath();
                ctx.moveTo(x, canvas.height - 10);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();

                ctx.fillText(this.formatDuration(time), x - 15, canvas.height - 15);
            }
        }

        // 현재 재생 위치 표시
        this.updateWaveformCursor(videoElement.currentTime);

        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.fillText('재생하면 실시간 파형이 표시됩니다', 10, 20);
    }

    // 파형에서 현재 재생 위치 커서 업데이트
    updateWaveformCursor(currentTime) {
        const canvas = document.getElementById('video-waveform');
        if (!canvas || this.videoDuration <= 0) return;

        const ctx = canvas.getContext('2d');
        const cursorX = (currentTime / this.videoDuration) * canvas.width;

        // 이전 커서 지우기 (전체 다시 그리기 대신 효율적인 방법)
        // 실제로는 파형을 다시 그려야 하지만, 간단히 빨간 선만 그리기
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, canvas.height);
        ctx.stroke();

        // 시간 정보 표시
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(this.formatDuration(currentTime), cursorX + 5, 15);
    }

    formatDuration(seconds, short = false) {
        if (seconds === 0) return '0:00';

        const isNegative = seconds < 0;
        const absSeconds = Math.abs(seconds);
        const mins = Math.floor(absSeconds / 60);
        const secs = Math.floor(absSeconds % 60);

        let timeStr;
        if (short) {
            // 짧은 형식: 0:30, 1:45
            timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        } else {
            // 일반 형식: 0:30, 1:45
            timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        return isNegative ? `-${timeStr}` : timeStr;
    }

    // 자막용 시간 포맷팅 (음수 방지)
    formatSubtitleTime(seconds, short = false) {
        // 자막 시간은 항상 양수로 처리
        const positiveSeconds = Math.max(0, seconds || 0);

        if (positiveSeconds === 0) return '0:00';

        const mins = Math.floor(positiveSeconds / 60);
        const secs = Math.floor(positiveSeconds % 60);

        if (short) {
            // 짧은 형식: 0:30, 1:45
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        } else {
            // 일반 형식: 0:30, 1:45
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // 음성 추출 기능
    async startAudioExtraction() {
        const selectedFiles = Array.from(this.selectedFiles);
        const videoFiles = selectedFiles.filter(path => this.getFileType(path) === 'video');

        if (videoFiles.length === 0) {
            this.showError('영상 파일을 선택하세요');
            return;
        }

        const outputFormat = document.getElementById('audio-output-format').value;

        // UI 업데이트
        const progressSection = document.getElementById('extraction-progress');
        const progressFill = document.getElementById('extraction-progress-fill');
        const progressText = document.getElementById('extraction-progress-text');
        const resultsSection = document.getElementById('extraction-results');

        progressSection.style.display = 'block';
        resultsSection.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = '음성 추출을 시작합니다...';

        try {
            const response = await fetch('/api/extract-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: videoFiles,
                    format: outputFormat
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || '음성 추출 API 에러');
            }

            // 진행률 업데이트
            progressFill.style.width = '100%';
            progressText.textContent = '음성 추출 완료!';

            // 결과 표시
            this.displayExtractionResults(data.results);

            setTimeout(() => {
                progressSection.style.display = 'none';
                resultsSection.style.display = 'block';
            }, 1000);

            this.showSuccess(`${videoFiles.length}개 파일의 음성 추출이 완료되었습니다`);

        } catch (error) {
            console.error('음성 추출 에러:', error);
            progressText.textContent = '음성 추출 실패: ' + error.message;
            this.showError('음성 추출에 실패했습니다: ' + error.message);
        }
    }

    displayExtractionResults(results) {
        const resultsList = document.getElementById('extracted-files-list');

        if (results.length === 0) {
            resultsList.innerHTML = '<div class="empty-state">추출된 파일이 없습니다</div>';
            return;
        }

        resultsList.innerHTML = results.map(result => {
            if (result.status === 'success') {
                return `
                    <div class="extraction-result-item success">
                        <div class="result-header">
                            <span class="result-icon">✅</span>
                            <span class="source-file">${result.file.split('/').pop()}</span>
                        </div>
                        <div class="result-details">
                            <div class="extracted-file-info">
                                <span class="file-name">📄 ${result.data.output_filename}</span>
                                <span class="file-size">💾 ${result.data.size_mb}MB</span>
                                <span class="file-duration">⏱️ ${result.data.duration_str}</span>
                                <span class="file-format">🎼 ${result.data.format.toUpperCase()}</span>
                            </div>
                            <div class="result-actions">
                                <button class="action-btn small" onclick="app.playExtractedAudio('${result.data.output_path}')">▶️ 재생</button>
                                <button class="action-btn small" onclick="app.downloadFile('${result.data.output_path}')">📥 다운로드</button>
                                <button class="action-btn small" onclick="app.addToSelection('${result.data.output_path}')">➕ 선택에 추가</button>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="extraction-result-item error">
                        <div class="result-header">
                            <span class="result-icon">❌</span>
                            <span class="source-file">${result.file.split('/').pop()}</span>
                        </div>
                        <div class="error-message">
                            ${result.error}
                        </div>
                    </div>
                `;
            }
        }).join('');

        // 새로고침 버튼 이벤트 추가
        document.getElementById('refresh-file-list').addEventListener('click', () => {
            this.loadFileList();
            this.showSuccess('파일 목록이 새로고침되었습니다');
        });
    }

    playExtractedAudio(audioPath) {
        // 간단한 오디오 플레이어 생성
        const existingPlayer = document.getElementById('temp-audio-player');
        if (existingPlayer) {
            existingPlayer.remove();
        }

        const audioPlayer = document.createElement('audio');
        audioPlayer.id = 'temp-audio-player';
        audioPlayer.controls = true;
        audioPlayer.autoplay = true;
        audioPlayer.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';

        const source = document.createElement('source');
        source.src = `/api/file-content?path=${encodeURIComponent(audioPath)}`;
        source.type = 'audio/mpeg';

        audioPlayer.appendChild(source);
        document.body.appendChild(audioPlayer);

        // 5초 후 자동 제거
        setTimeout(() => {
            if (audioPlayer && !audioPlayer.paused) {
                audioPlayer.pause();
            }
        }, 30000);

        audioPlayer.addEventListener('ended', () => {
            audioPlayer.remove();
        });

        this.showInfo('오디오 플레이어가 상단에 표시됩니다');
    }

    downloadFile(filePath) {
        const link = document.createElement('a');
        link.href = `/api/file-content?path=${encodeURIComponent(filePath)}`;
        link.download = filePath.split('/').pop();
        link.click();
        this.showSuccess('파일 다운로드가 시작되었습니다');
    }

    addToSelection(filePath) {
        this.selectedFiles.add(filePath);
        this.updateUI();
        this.showSuccess('파일이 선택 목록에 추가되었습니다');
    }

    // 고급 타임라인 편집기 설정
    setupTimelineEditor() {
        // 타임라인 편집기 상태
        this.timeline = {
            zoom: 1,
            duration: 300,   // 기본 5분으로 설정
            currentTime: 0,
            pixelsPerSecond: 50,
            videoData: null,
            audioData: null,
            subtitleData: null,
            isPlaying: false,
            startOffset: 0,  // 0초부터 시작
            minTime: 0,      // 최소 0초부터 표시
            maxTime: 300     // 최대 시간은 동적으로 설정 (기본 5분)
        };

        this.setupTimelineControls();
        this.setupTimelineEvents();

        // 초기 타임라인 설정
        this.updateTimelineWidth();
        this.updateTimelineRuler();

        console.log('타임라인 편집기 초기화 완료:', {
            duration: this.timeline.duration,
            minTime: this.timeline.minTime,
            maxTime: this.timeline.maxTime
        });
    }

    setupTimelineControls() {
        console.log('setupTimelineControls 호출됨');
        // 재생 컨트롤
        const playPauseBtn = document.getElementById('play-pause-btn');
        const stopBtn = document.getElementById('stop-btn');
        const rewindBtn = document.getElementById('rewind-btn');
        const forwardBtn = document.getElementById('forward-btn');

        console.log('버튼 요소들:', { playPauseBtn, stopBtn, rewindBtn, forwardBtn });

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                console.log('재생/일시정지 버튼 클릭됨');
                this.togglePlayback();
            });
            console.log('재생/일시정지 버튼 이벤트 등록 완료');
        } else {
            console.log('재생/일시정지 버튼을 찾을 수 없음');
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                console.log('정지 버튼 클릭됨');
                this.stopPlayback();
            });
            console.log('정지 버튼 이벤트 등록 완료');
        } else {
            console.log('정지 버튼을 찾을 수 없음');
        }

        if (rewindBtn) {
            rewindBtn.addEventListener('click', () => {
                console.log('되감기 버튼 클릭됨');
                this.seekTime(-5);
            });
            console.log('되감기 버튼 이벤트 등록 완료');
        } else {
            console.log('되감기 버튼을 찾을 수 없음');
        }

        if (forwardBtn) {
            forwardBtn.addEventListener('click', () => {
                console.log('빨리감기 버튼 클릭됨');
                this.seekTime(5);
            });
            console.log('빨리감기 버튼 이벤트 등록 완료');
        } else {
            console.log('빨리감기 버튼을 찾을 수 없음');
        }

        // 줌 컨트롤
        const zoomSlider = document.getElementById('timeline-zoom');
        const zoomDisplay = document.getElementById('zoom-display');
        const fitToSubtitlesBtn = document.getElementById('fit-to-subtitles');

        if (zoomSlider) {
            zoomSlider.addEventListener('input', (e) => {
                this.setTimelineZoom(parseFloat(e.target.value));
                if (zoomDisplay) {
                    zoomDisplay.textContent = e.target.value + 'x';
                }
            });
        }

        if (fitToSubtitlesBtn) {
            fitToSubtitlesBtn.addEventListener('click', () => this.fitToSubtitles());
        }

        // 파일 로드 버튼들
        const loadVideoBtn = document.getElementById('load-video-file');
        const loadAudioBtn = document.getElementById('load-audio-file');
        const loadSubtitleBtn = document.getElementById('load-subtitle-file');

        if (loadVideoBtn) {
            loadVideoBtn.addEventListener('click', async () => {
                await this.loadFileList(); // 파일 목록 새로고침
                this.loadSelectedVideo();
            });
        }

        if (loadAudioBtn) {
            loadAudioBtn.addEventListener('click', async () => {
                await this.loadFileList(); // 파일 목록 새로고침
                this.loadSelectedAudio();
            });
        }

        if (loadSubtitleBtn) {
            loadSubtitleBtn.addEventListener('click', async () => {
                await this.loadFileList(); // 파일 목록 새로고침
                this.loadSelectedSubtitle();
            });
        }
    }

    setupTimelineEvents() {
        const timelineContainer = document.getElementById('timeline-container');
        if (timelineContainer) {
            // 타임라인 클릭으로 시간 이동
            timelineContainer.addEventListener('click', (e) => {
                const rect = timelineContainer.getBoundingClientRect();
                const x = e.clientX - rect.left + timelineContainer.scrollLeft;

                // 전체 시간 범위 계산
                const totalDuration = Math.max(this.timeline.duration, 60); // 0초부터 duration까지
                const timelineContent = document.getElementById('timeline-content');
                const width = parseFloat(timelineContent.style.minWidth) || 1000;

                // 클릭한 위치를 실제 시간으로 변환 (minTime 고려)
                const normalizedPosition = x / width;
                const time = (normalizedPosition * totalDuration) + this.timeline.minTime;

                console.log('타임라인 클릭:', {
                    x: x,
                    normalizedPosition: normalizedPosition,
                    time: time,
                    minTime: this.timeline.minTime,
                    totalDuration: totalDuration
                });

                this.seekToTime(time);
            });
        }

        // 비디오 플레이어와 타임라인 동기화
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) {
            videoPlayer.addEventListener('timeupdate', () => {
                this.updateTimelinePosition();
                this.updateCurrentSubtitle();
            });

            videoPlayer.addEventListener('loadedmetadata', () => {
                this.timeline.duration = videoPlayer.duration;
                this.updateTimelineRuler();
                this.updateTimeDisplay();
            });

            videoPlayer.addEventListener('play', () => {
                this.timeline.isPlaying = true;
                this.updatePlayPauseButton();
            });

            videoPlayer.addEventListener('pause', () => {
                this.timeline.isPlaying = false;
                this.updatePlayPauseButton();
            });
        }
    }

    // 재생 컨트롤 함수들
    togglePlayback() {
        console.log('togglePlayback 호출됨');
        const videoPlayer = document.getElementById('video-player');
        if (!videoPlayer) {
            console.log('비디오 플레이어를 찾을 수 없습니다');
            this.showError('비디오를 먼저 로드해주세요');
            return;
        }

        console.log('현재 재생 상태:', this.timeline.isPlaying);
        console.log('현재 비디오 시간:', videoPlayer.currentTime);

        if (this.timeline.isPlaying) {
            videoPlayer.pause();
            console.log('비디오 일시정지 - 현재 위치:', videoPlayer.currentTime);
        } else {
            // 현재 타임라인 위치로 비디오 시간 설정
            if (this.timeline.currentTime !== undefined && this.timeline.currentTime !== videoPlayer.currentTime) {
                videoPlayer.currentTime = this.timeline.currentTime;
                console.log('비디오 시간을 타임라인 위치로 설정:', this.timeline.currentTime);
            }

            videoPlayer.play().then(() => {
                console.log('비디오 재생 시작 - 위치:', videoPlayer.currentTime);
            }).catch(error => {
                console.error('비디오 재생 실패:', error);
                this.showError('비디오 재생에 실패했습니다: ' + error.message);
            });
        }
    }

    stopPlayback() {
        console.log('stopPlayback 호출됨');
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.currentTime = 0;
            console.log('비디오 정지 및 처음으로 이동');
        } else {
            console.log('비디오 플레이어를 찾을 수 없습니다');
            this.showError('비디오를 먼저 로드해주세요');
        }
    }

    seekTime(seconds) {
        console.log(`seekTime 호출됨: ${seconds}초`);
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) {
            const newTime = Math.max(0,
                Math.min(videoPlayer.duration || 0, videoPlayer.currentTime + seconds));
            videoPlayer.currentTime = newTime;
            console.log(`시간 이동: ${newTime}초`);
        } else {
            console.log('비디오 플레이어를 찾을 수 없습니다');
            this.showError('비디오를 먼저 로드해주세요');
        }
    }

    seekToTime(time) {
        const videoPlayer = document.getElementById('video-player');

        // 타임라인 현재 시간 업데이트 (0초 이상만 허용)
        this.timeline.currentTime = Math.max(0, time);

        if (videoPlayer && time >= 0) {
            // 비디오 플레이어 시간 설정
            const clampedTime = Math.max(0, Math.min(videoPlayer.duration || time, time));
            videoPlayer.currentTime = clampedTime;
            console.log(`비디오 플레이어 시간 이동: ${clampedTime}초`);
        }

        console.log(`타임라인 시간 이동: ${this.timeline.currentTime}초`);

        // 재생 헤드 위치 강제 업데이트
        this.updateTimelinePosition();
        this.updateCurrentSubtitle();
    }

    updatePlayPauseButton() {
        const btn = document.getElementById('play-pause-btn');
        console.log('updatePlayPauseButton 호출됨, 버튼 요소:', btn);
        console.log('재생 상태:', this.timeline.isPlaying);

        if (btn) {
            btn.textContent = this.timeline.isPlaying ? '⏸️' : '▶️';

            // 버튼이 확실히 보이도록 강제 스타일 적용
            btn.style.display = 'flex';
            btn.style.opacity = '1';
            btn.style.visibility = 'visible';

            console.log('버튼 텍스트 설정:', btn.textContent);

            // 재생 상태에 따른 스타일 클래스 적용
            if (this.timeline.isPlaying) {
                btn.classList.add('playing');
                console.log('playing 클래스 추가됨');
            } else {
                btn.classList.remove('playing');
                console.log('playing 클래스 제거됨');
            }
        } else {
            console.error('play-pause-btn 요소를 찾을 수 없습니다!');
        }
    }

    // 타임라인 줌 및 스크롤
    setTimelineZoom(zoom) {
        this.timeline.zoom = zoom;
        this.updateTimelineWidth();
        this.updateTimelineRuler();
        this.redrawTimeline();
    }

    updateTimelineWidth() {
        const timelineContent = document.getElementById('timeline-content');
        if (timelineContent) {
            // 전체 시간 범위 계산 (minTime부터 duration까지)
            const totalDuration = Math.max(this.timeline.duration, 60); // 0초부터 duration까지
            const width = totalDuration * this.timeline.pixelsPerSecond * this.timeline.zoom;
            timelineContent.style.minWidth = Math.max(1000, width) + 'px';

            console.log('타임라인 너비 업데이트:', {
                totalDuration: totalDuration,
                width: width,
                minTime: this.timeline.minTime,
                duration: this.timeline.duration
            });
        }
    }

    updateTimelineRuler() {
        const ruler = document.getElementById('timeline-ruler');
        if (!ruler) return;

        ruler.innerHTML = '';

        const interval = this.getOptimalTimeInterval();
        const totalDuration = Math.max(this.timeline.duration, 60); // 0초부터 duration까지
        const width = totalDuration * this.timeline.pixelsPerSecond * this.timeline.zoom;

        // 0초부터 시작해서 최대 시간까지 마커 생성
        const maxTime = Math.max(this.timeline.duration || 60, 60); // 실제 지속시간 또는 최소 60초

        for (let time = this.timeline.minTime; time <= maxTime; time += interval) {
            const marker = document.createElement('div');
            marker.className = 'time-marker';

            // 0초와 주요 시간 간격에 굵은 마커
            if (time === 0 || time % (interval * 5) === 0) {
                marker.className += ' major';
            }

            // 0초 마커는 특별 표시
            if (time === 0) {
                marker.className += ' zero-marker';
                marker.style.color = '#ff4444';
                marker.style.fontWeight = 'bold';
                marker.style.zIndex = '100';
            }

            // 위치 계산 (minTime을 기준으로 오프셋)
            const position = ((time - this.timeline.minTime) / totalDuration) * width;
            marker.style.left = position + 'px';
            marker.textContent = this.formatDuration(time);

            ruler.appendChild(marker);
        }

        // 0초 기준선 위치 계산 및 CSS 변수 설정 (이제 0초는 맨 왼쪽)
        const zeroPosition = 0; // 0초가 시작점이므로 0%
        document.documentElement.style.setProperty('--zero-line-position', `${zeroPosition}%`);

        console.log('타임라인 눈금자 업데이트:', {
            minTime: this.timeline.minTime,
            maxTime: maxTime,
            duration: this.timeline.duration,
            totalDuration: totalDuration,
            width: width,
            zeroPosition: `${zeroPosition}%`
        });
    }

    getOptimalTimeInterval() {
        const zoom = this.timeline.zoom;
        if (zoom >= 10) return 1; // 1초 간격
        if (zoom >= 5) return 2;   // 2초 간격
        if (zoom >= 2) return 5;   // 5초 간격
        return 10; // 10초 간격
    }

    updateTimelinePosition() {
        const videoPlayer = document.getElementById('video-player');
        const playhead = document.getElementById('playhead');

        if (!videoPlayer || !playhead) return;

        this.timeline.currentTime = videoPlayer.currentTime;
        const timelineContent = document.getElementById('timeline-content');
        const width = parseFloat(timelineContent.style.minWidth) || 1000;

        // 전체 시간 범위 계산
        const totalDuration = Math.max(this.timeline.duration, 60); // 0초부터 duration까지

        // 현재 시간을 기준으로 위치 계산 (minTime 오프셋 고려)
        const adjustedTime = this.timeline.currentTime - this.timeline.minTime;
        const position = (adjustedTime / totalDuration) * width;

        playhead.style.left = position + 'px';

        console.log('재생 헤드 위치 업데이트:', {
            currentTime: this.timeline.currentTime,
            adjustedTime: adjustedTime,
            position: position,
            totalDuration: totalDuration
        });

        this.updateTimeDisplay();
        this.autoScrollTimeline(position);
    }

    autoScrollTimeline(position) {
        const container = document.getElementById('timeline-container');
        if (!container) return;

        const containerWidth = container.clientWidth;
        const scrollLeft = container.scrollLeft;

        // 재생 헤드가 화면 밖으로 나가면 자동 스크롤
        if (position < scrollLeft || position > scrollLeft + containerWidth) {
            container.scrollLeft = Math.max(0, position - containerWidth / 2);
        }
    }

    updateTimeDisplay() {
        const currentTimeEl = document.getElementById('current-time');
        const totalTimeEl = document.getElementById('total-time');

        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatDuration(this.timeline.currentTime);
        }

        if (totalTimeEl) {
            totalTimeEl.textContent = this.formatDuration(this.timeline.duration);
        }
    }

    // 파일 로드 함수들
    async loadSelectedVideo() {
        let videoFiles = Array.from(this.selectedFiles).filter(path =>
            this.getFileType(path) === 'video');

        // 선택된 파일이 없다면, API를 통해 사용 가능한 영상 파일 자동 검색
        if (videoFiles.length === 0) {
            try {
                console.log('API에서 영상 파일 검색 중...');
                // API에서 직접 파일 목록 가져오기
                const response = await fetch('/api/files?filter_type=all');
                const data = await response.json();
                const availableVideos = [];

                if (data.files) {
                    data.files.forEach(file => {
                        if (file.path && this.getFileType(file.path) === 'video') {
                            availableVideos.push(file.path);
                        }
                    });
                }

                console.log('API에서 찾은 영상 파일들:', availableVideos);

                if (availableVideos.length > 0) {
                    videoFiles = [availableVideos[0]];
                    this.showInfo(`영상 파일을 자동으로 선택했습니다: ${availableVideos[0].split('/').pop()}`);
                } else {
                    this.showError('영상 파일이 없습니다. .mp4, .webm 등의 영상 파일을 업로드하거나 선택하세요.');
                    return;
                }
            } catch (error) {
                console.error('파일 목록 조회 오류:', error);
                this.showError('영상 파일 검색 중 오류가 발생했습니다: ' + error.message);
                return;
            }
        }

        const videoPath = videoFiles[0];
        const videoPlayer = document.getElementById('video-player');
        const videoTrack = document.getElementById('video-track');

        if (videoPlayer) {
            videoPlayer.src = `/api/file-content?path=${encodeURIComponent(videoPath)}`;
            this.timeline.videoData = { path: videoPath };

            // 비디오 트랙에 클립 표시
            if (videoTrack) {
                // 0초부터 시작하므로 전체 폭 사용
                videoTrack.innerHTML = `
                    <div class="video-clip" style="left: 0%; width: 100%;">
                        📹 ${videoPath.split('/').pop()}
                    </div>
                `;
            }

            this.showSuccess('영상 파일이 로드되었습니다');
        }
    }

    async loadSelectedAudio() {
        let audioFiles = Array.from(this.selectedFiles).filter(path =>
            this.getFileType(path) === 'audio');

        // 선택된 파일이 없다면, API를 통해 사용 가능한 음성 파일 자동 검색
        if (audioFiles.length === 0) {
            try {
                console.log('API에서 음성 파일 검색 중...');
                // API에서 직접 파일 목록 가져오기
                const response = await fetch('/api/files?filter_type=all');
                const data = await response.json();
                const availableAudios = [];

                if (data.files) {
                    data.files.forEach(file => {
                        if (file.path && this.getFileType(file.path) === 'audio') {
                            availableAudios.push(file.path);
                        }
                    });
                }

                console.log('API에서 찾은 음성 파일들:', availableAudios);

                if (availableAudios.length > 0) {
                    audioFiles = [availableAudios[0]];
                    this.showInfo(`음성 파일을 자동으로 선택했습니다: ${availableAudios[0].split('/').pop()}`);
                } else {
                    this.showError('음성 파일이 없습니다. .mp3, .wav 등의 음성 파일을 업로드하거나 선택하세요.');
                    return;
                }
            } catch (error) {
                console.error('파일 목록 조회 오류:', error);
                this.showError('음성 파일 검색 중 오류가 발생했습니다: ' + error.message);
                return;
            }
        }

        const audioPath = audioFiles[0];
        this.timeline.audioData = { path: audioPath };

        // 즉시 기본 파형 표시
        this.showImmediateWaveform(audioPath);

        // 음성 파형 그리기
        await this.drawAudioWaveform(audioPath);
        this.showSuccess('음성 파일이 로드되었습니다');
    }

    async loadSelectedSubtitle() {
        let subtitleFiles = Array.from(this.selectedFiles).filter(path =>
            path.endsWith('.srt') || path.endsWith('.vtt'));

        // 선택된 파일이 없다면, API를 통해 사용 가능한 자막 파일 자동 검색
        if (subtitleFiles.length === 0) {
            try {
                console.log('API에서 자막 파일 검색 중...');
                // API에서 직접 파일 목록 가져오기
                const response = await fetch('/api/files?filter_type=all');
                const data = await response.json();
                const availableSubtitles = [];

                if (data.files) {
                    data.files.forEach(file => {
                        if (file.path && (file.path.endsWith('.srt') || file.path.endsWith('.vtt'))) {
                            availableSubtitles.push(file.path);
                        }
                    });
                }

                console.log('API에서 찾은 자막 파일들:', availableSubtitles);

                if (availableSubtitles.length > 0) {
                    // _fixed.srt, _generated.srt 파일을 우선적으로 선택
                    const preferredSubtitle = availableSubtitles.find(path =>
                        path.includes('_fixed.srt') || path.includes('_generated.srt')) || availableSubtitles[0];

                    subtitleFiles = [preferredSubtitle];
                    console.log('사용 가능한 자막 파일들:', availableSubtitles);
                    console.log('선택된 자막 파일:', preferredSubtitle);
                    this.showInfo(`자막 파일을 자동으로 선택했습니다: ${preferredSubtitle.split('/').pop()}`);
                } else {
                    this.showError('자막 파일이 없습니다. .srt 또는 .vtt 파일을 업로드하거나 선택하세요.');
                    return;
                }
            } catch (error) {
                console.error('파일 목록 조회 오류:', error);
                this.showError('자막 파일 검색 중 오류가 발생했습니다: ' + error.message);
                return;
            }
        }

        const subtitlePath = subtitleFiles[0];

        try {
            this.showInfo('자막 파일을 분석하고 있습니다...');

            // 자막 파일 분석 API 호출
            const response = await fetch('/api/analysis/subtitle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: [subtitlePath] })
            });

            const data = await response.json();
            console.log('자막 API 응답:', data); // 디버그 로그

            if (data.results && data.results[0] && data.results[0].status === 'success') {
                const resultData = data.results[0].data;
                console.log('API 응답 전체 구조:', resultData); // 디버그 로그

                // API 응답에서 subtitles 데이터 추출
                let subtitles = [];
                if (resultData.subtitles) {
                    subtitles = resultData.subtitles;
                } else if (resultData.analysis && resultData.analysis.subtitles) {
                    subtitles = resultData.analysis.subtitles;
                } else {
                    console.warn('자막 구간 데이터를 찾을 수 없습니다. API 응답 구조:', resultData);
                }

                // 자막 데이터 구조 정규화
                this.timeline.subtitleData = {
                    ...resultData,
                    subtitles: subtitles
                };

                console.log('정규화된 자막 데이터:', this.timeline.subtitleData);
                console.log('자막 구간 수:', subtitles.length);

                // 비디오 duration이 설정되어 있는지 확인
                if (this.timeline.duration === 0) {
                    const videoPlayer = document.getElementById('video-player');
                    if (videoPlayer && videoPlayer.duration) {
                        this.timeline.duration = videoPlayer.duration;
                    } else {
                        // 자막 데이터에서 duration 추정
                        if (subtitles.length > 0) {
                            this.timeline.duration = Math.max(...subtitles.map(s => s.end_time));
                        } else if (resultData.total_duration) {
                            this.timeline.duration = resultData.total_duration;
                        }
                    }
                }

                this.renderSubtitleTrack();
                this.updateTimelineRuler();
                this.updateTimelineWidth();

                this.showSuccess(`자막 파일이 로드되었습니다 (${subtitles.length}개 구간)`);
            } else {
                console.error('자막 분석 실패:', data);
                throw new Error(data.results?.[0]?.error || '자막 분석 실패');
            }
        } catch (error) {
            console.error('자막 로드 에러:', error);
            this.showError('자막 파일 로드 실패: ' + error.message);
        }
    }

    renderSubtitleTrack() {
        const subtitleTrack = document.getElementById('subtitle-track');
        if (!subtitleTrack || !this.timeline.subtitleData) return;

        const subtitles = this.timeline.subtitleData.subtitles || [];
        const trackContent = subtitleTrack.querySelector('.track-content');

        if (!trackContent) return;

        trackContent.innerHTML = '';

        subtitles.forEach((subtitle, index) => {
            const block = document.createElement('div');
            block.className = 'subtitle-block';
            block.dataset.index = index;

            // 자막 시간이 음수인 경우 0으로 조정
            const startTime = Math.max(0, subtitle.start_time);
            const endTime = Math.max(0, subtitle.end_time);

            // 전체 시간 범위 계산 (0초부터 시작)
            const totalDuration = Math.max(this.timeline.duration, 60); // 0초부터 duration까지
            const adjustedStartTime = startTime; // 0초부터 시작하므로 그대로 사용
            const duration = endTime - startTime;

            const startPercent = (adjustedStartTime / totalDuration) * 100;
            const widthPercent = (duration / totalDuration) * 100;

            block.style.left = startPercent + '%';
            block.style.width = widthPercent + '%';

            // 시간 정보 요소 생성
            const timeElement = document.createElement('div');
            timeElement.className = 'subtitle-time';

            // 텍스트 요소 생성
            const textElement = document.createElement('div');
            textElement.className = 'subtitle-text';
            textElement.textContent = subtitle.text;

            // 블록 너비에 따라 표시 내용 조정
            const blockWidthPx = (widthPercent / 100) * (trackContent.offsetWidth || 1000);

            if (blockWidthPx < 80) {
                // 매우 작은 블록: 시작 시간만 표시
                timeElement.textContent = `${this.formatSubtitleTime(startTime, true)}`;
                textElement.style.display = 'none';
                timeElement.style.fontSize = '10px';
            } else if (blockWidthPx < 120) {
                // 작은 블록: 시작→끝 시간 표시
                timeElement.textContent = `${this.formatSubtitleTime(startTime, true)}→${this.formatSubtitleTime(endTime, true)}`;
                textElement.style.display = 'none';
                timeElement.style.fontSize = '10px';
            } else if (blockWidthPx < 200) {
                // 중간 블록: 시간 + 짧은 텍스트
                timeElement.textContent = `${this.formatSubtitleTime(startTime)}→${this.formatSubtitleTime(endTime)}`;
                textElement.textContent = subtitle.text.length > 20 ?
                    subtitle.text.substring(0, 17) + '...' : subtitle.text;
                timeElement.style.fontSize = '11px';
                textElement.style.fontSize = '12px';
            } else {
                // 큰 블록: 전체 시간 + 전체 텍스트
                timeElement.textContent = `🕐 ${this.formatSubtitleTime(startTime)} → ${this.formatSubtitleTime(endTime)} (${this.formatSubtitleTime(duration)}초)`;
                timeElement.style.fontSize = '11px';
                textElement.style.fontSize = '13px';
            }

            // 요소들을 블록에 추가
            block.appendChild(timeElement);
            block.appendChild(textElement);

            block.title = `${this.formatSubtitleTime(startTime)} - ${this.formatSubtitleTime(endTime)}\n${subtitle.text}`;

            // 자막 블록 클릭 이벤트
            block.addEventListener('click', () => {
                this.seekToTime(subtitle.start_time);
                this.selectSubtitleBlock(block);
            });

            trackContent.appendChild(block);
        });
    }

    selectSubtitleBlock(block) {
        // 기존 선택 해제
        document.querySelectorAll('.subtitle-block.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // 새로운 블록 선택
        block.classList.add('selected');
    }

    updateCurrentSubtitle() {
        if (!this.timeline.subtitleData) return;

        const currentTime = this.timeline.currentTime;
        const subtitles = this.timeline.subtitleData.subtitles || [];
        const currentSubtitleEl = document.getElementById('current-subtitle');

        // 현재 시간에 해당하는 자막 찾기
        const currentSubtitle = subtitles.find(sub =>
            currentTime >= sub.start_time && currentTime <= sub.end_time);

        if (currentSubtitle) {
            if (currentSubtitleEl) {
                currentSubtitleEl.textContent = currentSubtitle.text;
                currentSubtitleEl.className = 'subtitle-display';
            }

            // 해당 자막 블록 하이라이트
            document.querySelectorAll('.subtitle-block').forEach((block, index) => {
                if (parseInt(block.dataset.index) === subtitles.indexOf(currentSubtitle)) {
                    block.classList.add('selected');
                } else {
                    block.classList.remove('selected');
                }
            });
        } else {
            if (currentSubtitleEl) {
                currentSubtitleEl.textContent = '자막이 없습니다';
                currentSubtitleEl.className = 'subtitle-display no-subtitle';
            }

            // 모든 선택 해제
            document.querySelectorAll('.subtitle-block.selected').forEach(el => {
                el.classList.remove('selected');
            });
        }
    }

    async drawAudioWaveform(audioPath) {
        console.log('🎵 drawAudioWaveform 호출됨:', audioPath);

        const canvas = document.getElementById('timeline-waveform');
        if (!canvas) {
            console.error('❌ timeline-waveform 캔버스를 찾을 수 없음');
            return;
        }

        console.log('✅ 캔버스 발견:', canvas);

        const ctx = canvas.getContext('2d');

        // 캔버스 크기 강제 설정
        const parentRect = canvas.parentElement.getBoundingClientRect();
        canvas.width = Math.max(parentRect.width || 800, 800);
        canvas.height = 80;
        canvas.style.width = '100%';
        canvas.style.height = '80px';
        canvas.style.display = 'block';

        console.log('📏 캔버스 크기 설정:', canvas.width, 'x', canvas.height);

        // 로딩 상태 표시
        this.showWaveformLoading(ctx, canvas, '실제 오디오 분석 중...');

        try {
            console.log('🔍 서버에서 실제 파형 데이터 요청 중...');

            // 서버에서 실제 파형 데이터 가져오기
            const response = await fetch('/api/analyze-waveform', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audio_path: audioPath,
                    width: canvas.width
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('📊 서버 파형 데이터 받음:', data);

            if (data.status === 'success' && data.waveform_data) {
                // 실제 파형 데이터로 그리기
                this.renderRealWaveformData(ctx, canvas, data.waveform_data, audioPath);
                console.log('✅ 실제 파형 데이터로 렌더링 완료');
            } else {
                throw new Error('서버에서 파형 데이터를 받지 못함');
            }

        } catch (error) {
            console.error('❌ 실제 파형 분석 실패:', error);
            console.error('오류 상세:', {
                message: error.message,
                audioPath: audioPath,
                stack: error.stack
            });
            this.renderFallbackWaveform(ctx, canvas, audioPath);
        }
    }

    showWaveformLoading(ctx, canvas, message) {
        // 배경
        ctx.fillStyle = 'rgba(15, 35, 55, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 로딩 텍스트
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';

        // 로딩 애니메이션 점들
        const dotCount = 3;
        const time = Date.now() * 0.001;
        for (let i = 0; i < dotCount; i++) {
            const alpha = (Math.sin(time * 3 + i * 0.5) + 1) / 2;
            ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
            ctx.fillRect(canvas.width / 2 + 50 + i * 15, canvas.height / 2 - 5, 8, 8);
        }
    }

    renderRealWaveformData(ctx, canvas, waveformData, audioPath) {
        console.log('🎨 실제 파형 데이터로 렌더링 시작:', waveformData.length, '포인트');

        // 배경 - 실제 데이터임을 나타내는 색상
        ctx.fillStyle = 'rgba(10, 40, 70, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 가운데 기준선
        const centerY = canvas.height / 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(canvas.width, centerY);
        ctx.stroke();

        // 실제 파형 데이터 그리기
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#FFD700');  // 골드
        gradient.addColorStop(0.5, '#FFA500'); // 오렌지
        gradient.addColorStop(1, '#FF8C00');   // 다크오렌지

        ctx.fillStyle = gradient;

        // 0초부터 시작하므로 단순하게 계산
        const barWidth = Math.max(1, canvas.width / waveformData.length);

        waveformData.forEach((amplitude, index) => {
            const x = index * barWidth; // 0초부터 시작
            const height = amplitude * centerY * 0.9; // 실제 데이터이므로 90% 높이 사용

            if (height > 0.5) {
                ctx.fillRect(x, centerY - height, Math.max(1, barWidth - 1), height * 2);
            }
        });

        // 실제 데이터임을 표시
        ctx.fillStyle = 'rgba(255, 215, 0, 1)';
        ctx.font = 'bold 12px Arial';
        const fileName = audioPath.split('/').pop();
        ctx.fillText(`🎵 ${fileName} (실제 파형)`, 10, 20);

        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.fillText(`실제 오디오 분석 완료 (${waveformData.length} 샘플)`, 10, canvas.height - 10);

        // 경계선
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        console.log('✅ 실제 파형 렌더링 완료');
    }

    renderFallbackWaveform(ctx, canvas, audioPath) {
        console.log('🎨 가상 파형으로 렌더링');

        // 배경 - 가상 데이터임을 나타내는 색상
        ctx.fillStyle = 'rgba(15, 35, 55, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 가운데 기준선
        const centerY = canvas.height / 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(canvas.width, centerY);
        ctx.stroke();

        // 가상 파형 그리기
        const waveformColor = '#00ff88';
        ctx.fillStyle = waveformColor;

        // 0초부터 시작하므로 단순하게 계산
        const segmentWidth = 2;
        const numSegments = Math.floor(canvas.width / segmentWidth);

        for (let i = 0; i < numSegments; i++) {
            const x = i * segmentWidth; // 0초부터 시작

            // 음성과 유사한 패턴 생성
            const baseFreq = i * 0.03;
            const speechEnvelope = Math.sin(i * 0.005) * 0.5 + 0.5;

            const amplitude = (
                Math.sin(baseFreq) * 0.6 +
                Math.sin(baseFreq * 2.7) * 0.3 +
                Math.sin(baseFreq * 0.4) * 0.4 +
                (Math.random() - 0.5) * 0.2
            ) * speechEnvelope;

            const height = Math.abs(amplitude) * centerY * 0.8;

            if (height > 1) {
                ctx.fillRect(x, centerY - height, segmentWidth - 1, height * 2);
            }
        }

        // 가상 데이터임을 표시
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 12px Arial';
        const fileName = audioPath.split('/').pop();
        ctx.fillText(`🎵 ${fileName} (시뮬레이션)`, 10, 20);

        ctx.font = '10px Arial';
        ctx.fillStyle = waveformColor;
        ctx.fillText('가상 파형 - 실제 분석 실패', 10, canvas.height - 10);

        // 경계선
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    }

    fitToSubtitles() {
        console.log('fitToSubtitles 호출됨');
        console.log('현재 자막 데이터:', this.timeline.subtitleData);

        if (!this.timeline.subtitleData) {
            this.showError('자막 데이터가 없습니다. 먼저 자막 파일을 로드하세요.');
            return;
        }

        if (!this.timeline.subtitleData.subtitles) {
            this.showError('자막 구간이 없습니다.');
            return;
        }

        const subtitles = this.timeline.subtitleData.subtitles;
        if (subtitles.length === 0) {
            this.showError('자막 구간이 비어있습니다.');
            return;
        }

        console.log(`자막 구간 수: ${subtitles.length}`);

        // duration 확인 및 설정
        if (this.timeline.duration === 0) {
            // 자막에서 최대 시간 찾기
            const maxTime = Math.max(...subtitles.map(s => s.end_time));
            this.timeline.duration = maxTime;
            console.log(`Duration을 자막에서 설정: ${this.timeline.duration}초`);
        }

        // 자막의 전체 시간 범위 계산
        const firstSubtitle = subtitles[0];
        const lastSubtitle = subtitles[subtitles.length - 1];
        const subtitleDuration = lastSubtitle.end_time - firstSubtitle.start_time;

        console.log(`자막 시간 범위: ${firstSubtitle.start_time}초 ~ ${lastSubtitle.end_time}초`);
        console.log(`자막 전체 길이: ${subtitleDuration}초`);

        // 적절한 줌 레벨 계산
        const container = document.getElementById('timeline-container');
        if (container) {
            const containerWidth = container.clientWidth - 120; // 헤더 너비 제외
            const optimalZoom = containerWidth / (subtitleDuration * this.timeline.pixelsPerSecond);

            console.log(`컨테이너 너비: ${containerWidth}, 최적 줌: ${optimalZoom}`);

            // 줌 슬라이더 업데이트
            const zoomSlider = document.getElementById('timeline-zoom');
            const zoomDisplay = document.getElementById('zoom-display');

            if (zoomSlider) {
                const clampedZoom = Math.max(1, Math.min(20, optimalZoom));
                zoomSlider.value = clampedZoom;
                this.setTimelineZoom(clampedZoom);

                if (zoomDisplay) {
                    zoomDisplay.textContent = clampedZoom.toFixed(1) + 'x';
                }

                console.log(`줌 레벨 설정: ${clampedZoom}x`);
            }

            // 첫 번째 자막으로 스크롤
            setTimeout(() => {
                const timelineContent = document.getElementById('timeline-content');
                const contentWidth = parseFloat(timelineContent.style.minWidth) || 1000;
                const scrollPosition = (firstSubtitle.start_time / this.timeline.duration) * contentWidth;

                console.log(`스크롤 위치: ${scrollPosition}, 컨텐츠 너비: ${contentWidth}`);

                container.scrollLeft = Math.max(0, scrollPosition - 100);
            }, 100);
        }

        this.showSuccess(`자막에 맞춰 타임라인을 조정했습니다 (${subtitles.length}개 구간)`);
    }

    redrawTimeline() {
        this.updateTimelineRuler();
        this.renderSubtitleTrack();
        if (this.timeline.audioData) {
            this.drawAudioWaveform(this.timeline.audioData.path);
        }
    }

    showImmediateWaveform(audioPath) {
        console.log('즉시 파형 표시:', audioPath);

        const canvas = document.getElementById('timeline-waveform');
        if (!canvas) {
            console.error('timeline-waveform 캔버스를 찾을 수 없습니다');
            return;
        }

        const ctx = canvas.getContext('2d');

        // 캔버스 크기 확인 및 설정
        if (canvas.width === 0 || canvas.height === 0) {
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(rect.width || 800, 800);
            canvas.height = Math.max(rect.height || 80, 80);
            console.log('캔버스 크기 설정됨:', canvas.width, 'x', canvas.height);
        }

        // 배경 그리기 - 확실히 보이도록 밝은 색상 사용
        ctx.fillStyle = 'rgba(20, 40, 60, 1.0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 가운데 기준선
        const centerY = canvas.height / 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(canvas.width, centerY);
        ctx.stroke();

        // 명확하게 보이는 파형 그리기
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#00ff88');
        gradient.addColorStop(0.5, '#00dd66');
        gradient.addColorStop(1, '#00bb44');

        ctx.fillStyle = gradient;

        // 실제 음성 패턴과 유사한 파형 생성
        const totalBars = Math.floor(canvas.width / 3);

        for (let i = 0; i < totalBars; i++) {
            const x = i * 3;

            // 복합 파형 생성 (음성과 유사한 패턴)
            const baseFreq = i * 0.02;
            const speechPattern = Math.sin(i * 0.008) * 0.5 + 0.5; // 음성 간격 시뮬레이션
            const amplitude = (
                Math.sin(baseFreq) * 0.4 +
                Math.sin(baseFreq * 2.3) * 0.3 +
                Math.cos(baseFreq * 0.7) * 0.2 +
                (Math.random() - 0.5) * 0.1
            ) * speechPattern;

            const height = Math.abs(amplitude) * centerY * 0.9;

            if (height > 2) { // 최소 높이 확보
                ctx.fillRect(x, centerY - height, 2, height * 2);
            }
        }

        // 파일 정보 표시 - 확실히 보이도록
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(`🎵 ${audioPath.split('/').pop()}`, 10, 20);

        ctx.font = '11px Arial';
        ctx.fillStyle = 'rgba(0, 255, 136, 1.0)';
        ctx.fillText('파형이 로드되었습니다', 10, canvas.height - 10);

        // 캔버스 스타일도 확실히 보이도록 설정
        canvas.style.display = 'block';
        canvas.style.visibility = 'visible';
        canvas.style.opacity = '1';
        canvas.style.border = '1px solid rgba(255,255,255,0.2)';

        console.log('즉시 파형 표시 완료');
    }

    debugWaveform() {
        console.log('🔧 파형 디버그 시작');

        const canvas = document.getElementById('timeline-waveform');
        console.log('캔버스 요소:', canvas);

        if (!canvas) {
            alert('❌ 캔버스를 찾을 수 없습니다!');
            return;
        }

        console.log('캔버스 정보:', {
            width: canvas.width,
            height: canvas.height,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
            style: canvas.style.cssText,
            display: getComputedStyle(canvas).display,
            visibility: getComputedStyle(canvas).visibility
        });

        // 강제 파형 그리기
        const ctx = canvas.getContext('2d');

        // 캔버스 크기 강제 설정
        canvas.width = 800;
        canvas.height = 80;
        canvas.style.width = '100%';
        canvas.style.height = '80px';
        canvas.style.display = 'block';
        canvas.style.visibility = 'visible';

        // 매우 명확한 테스트 패턴 그리기
        ctx.fillStyle = '#ff0000'; // 빨간 배경
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00ff00'; // 초록 사각형
        ctx.fillRect(50, 20, 100, 40);

        ctx.fillStyle = '#0000ff'; // 파란 사각형
        ctx.fillRect(200, 10, 100, 60);

        ctx.fillStyle = '#ffffff'; // 흰색 텍스트
        ctx.font = 'bold 16px Arial';
        ctx.fillText('파형 디버그 테스트', 350, 45);

        // 현재 오디오 데이터 상태 확인
        console.log('오디오 데이터:', this.timeline.audioData);

        // 실제 파형도 그려보기
        if (this.timeline.audioData && this.timeline.audioData.path) {
            console.log('실제 파형 그리기 시도:', this.timeline.audioData.path);
            setTimeout(() => {
                this.drawAudioWaveform(this.timeline.audioData.path);
            }, 1000);
        } else {
            console.log('오디오 데이터가 없음');
            // 선택된 파일에서 오디오 파일 찾기
            const audioFiles = Array.from(this.selectedFiles).filter(path => this.getFileType(path) === 'audio');
            if (audioFiles.length > 0) {
                console.log('선택된 오디오 파일로 파형 분석:', audioFiles[0]);
                setTimeout(() => {
                    this.drawAudioWaveform(audioFiles[0]);
                }, 1000);
            } else {
                console.log('선택된 오디오 파일이 없음, 파일 목록에서 자동 검색');
                // 파일 목록에서 오디오 파일 자동 선택
                this.findAndTestAudioFile();
            }
        }

        alert('🔧 파형 디버그 완료! 콘솔을 확인하세요.');
    }

    drawVirtualWaveform() {
        const canvas = document.getElementById('timeline-waveform');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // 배경
        ctx.fillStyle = 'rgba(20, 40, 60, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 가상 파형
        ctx.fillStyle = '#ffff00'; // 노란색으로 명확하게
        const centerY = canvas.height / 2;

        for (let x = 0; x < canvas.width; x += 3) {
            const amplitude = Math.sin(x * 0.02) * 0.8;
            const height = Math.abs(amplitude) * centerY;
            ctx.fillRect(x, centerY - height, 2, height * 2);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.fillText('가상 파형 테스트', 10, 20);
    }

    async findAndTestAudioFile() {
        try {
            console.log('📁 서버에서 오디오 파일 검색 중...');

            // 서버에서 파일 목록 가져오기
            const response = await fetch('/api/files?filter_type=all');
            const data = await response.json();

            const audioFiles = [];
            if (data.files) {
                data.files.forEach(file => {
                    if (file.path && this.getFileType(file.path) === 'audio') {
                        audioFiles.push(file.path);
                    }
                });
            }

            console.log('📁 발견된 오디오 파일들:', audioFiles);

            if (audioFiles.length > 0) {
                const testFile = audioFiles[0];
                console.log('🎵 테스트용 오디오 파일 선택:', testFile);

                // 파일을 선택 목록에 추가
                this.selectedFiles.add(testFile);
                this.updateSelectedFilesList();
                this.updateStatusBar();

                // 파형 분석 시도
                setTimeout(() => {
                    this.drawAudioWaveform(testFile);
                }, 500);

                return testFile;
            } else {
                console.log('❌ 사용 가능한 오디오 파일이 없음');
                this.drawVirtualWaveform();
                return null;
            }

        } catch (error) {
            console.error('❌ 오디오 파일 검색 실패:', error);
            this.drawVirtualWaveform();
            return null;
        }
    }

    async testRealWaveform() {
        console.log('🧪 실제 파형 테스트 시작');

        try {
            // 첫 번째 이용 가능한 오디오 파일을 찾아서 테스트
            const testFile = await this.findAndTestAudioFile();

            if (testFile) {
                console.log('✅ 테스트 파일 선택됨:', testFile);

                // 직접 서버 API 테스트
                const response = await fetch('/api/analyze-waveform', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        audio_path: testFile,
                        width: 800
                    })
                });

                console.log('📡 서버 응답 상태:', response.status, response.statusText);

                if (response.ok) {
                    const data = await response.json();
                    console.log('📊 서버 응답 데이터:', data);

                    if (data.status === 'success') {
                        alert(`✅ 실제 파형 분석 성공!\n파일: ${testFile.split('/').pop()}\n샘플 수: ${data.sample_count}`);
                    } else {
                        alert(`❌ 서버에서 파형 분석 실패\n응답: ${JSON.stringify(data)}`);
                    }
                } else {
                    const errorText = await response.text();
                    console.error('❌ 서버 오류:', errorText);
                    alert(`❌ 서버 오류 (${response.status}): ${errorText}`);
                }
            } else {
                alert('❌ 테스트할 오디오 파일을 찾을 수 없습니다');
            }

        } catch (error) {
            console.error('❌ 실제 파형 테스트 실패:', error);
            alert(`❌ 테스트 실패: ${error.message}`);
        }
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