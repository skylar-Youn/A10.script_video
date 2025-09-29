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

        // 하이브리드 자막 트랙 시스템 설정
        this.trackStates = {
            main: { visible: true, locked: false },
            translation: { visible: true, locked: false },
            description: { visible: true, locked: false }
        };

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

        // 하이브리드 자막 트랙 제어 버튼들
        this.setupTrackControls();

        // 화자 인식 기능 설정
        this.setupSpeakerRecognition();
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
                this.stopPlayback();
            });

            // 더블클릭으로 0초로 리셋
            stopBtn.addEventListener('dblclick', () => {
                this.resetToStart();
            });

            // 툴팁 업데이트
            stopBtn.title = '클릭: 현재 위치에서 정지 | 더블클릭: 처음(0초)으로 이동';
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

        // 맨 처음으로/맨 끝으로 가기
        const skipToStartBtn = document.getElementById('skip-to-start-btn');
        if (skipToStartBtn) {
            skipToStartBtn.addEventListener('click', () => {
                this.skipToStart();
            });
        }

        const skipToEndBtn = document.getElementById('skip-to-end-btn');
        if (skipToEndBtn) {
            skipToEndBtn.addEventListener('click', () => {
                this.skipToEnd();
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
                        <input type="checkbox" class="file-checkbox" value="${file.path}" ${isSelected ? 'checked' : ''}>
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

    // 하이브리드 자막 트랙 제어 시스템
    setupTrackControls() {
        console.log('🎛️ 하이브리드 트랙 제어 시스템 초기화');

        // 각 트랙의 제어 버튼에 이벤트 리스너 추가
        ['main', 'translation', 'description'].forEach(trackType => {
            // 가시성 토글 버튼
            const toggleBtn = document.querySelector(`.track-toggle[data-track="${trackType}"]`);
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    this.toggleTrackVisibility(trackType);
                });
            }

            // 잠금 토글 버튼
            const lockBtn = document.querySelector(`.track-lock[data-track="${trackType}"]`);
            if (lockBtn) {
                lockBtn.addEventListener('click', () => {
                    this.toggleTrackLock(trackType);
                });
            }

            // 설정 버튼
            const settingsBtn = document.querySelector(`.track-settings[data-track="${trackType}"]`);
            if (settingsBtn) {
                settingsBtn.addEventListener('click', () => {
                    this.showTrackSettings(trackType);
                });
            }

            // 축소된 트랙 헤더 클릭 시 펼치기
            const trackHeader = document.querySelector(`#${trackType}-subtitle-track .track-header`);
            if (trackHeader) {
                trackHeader.addEventListener('click', (e) => {
                    // 버튼 클릭이 아닌 헤더 영역 클릭만 처리
                    if (!e.target.classList.contains('track-toggle') &&
                        !e.target.classList.contains('track-lock') &&
                        !e.target.classList.contains('track-settings')) {

                        const track = document.getElementById(`${trackType}-subtitle-track`);
                        if (track && track.classList.contains('collapsed')) {
                            this.toggleTrackVisibility(trackType);
                        }
                    }
                });
            }
        });
    }

    toggleTrackVisibility(trackType) {
        console.log(`👁️ 트랙 가시성 토글: ${trackType}`);

        this.trackStates[trackType].visible = !this.trackStates[trackType].visible;

        // UI 업데이트
        const toggleBtn = document.querySelector(`.track-toggle[data-track="${trackType}"]`);
        const track = document.getElementById(`${trackType}-subtitle-track`);
        const trackContent = track ? track.querySelector('.track-content') : null;

        if (this.trackStates[trackType].visible) {
            // 트랙 보이기
            toggleBtn.textContent = '👁️';
            toggleBtn.title = '트랙 숨기기';
            if (track) {
                track.classList.remove('collapsed');
                track.style.height = '80px'; // 원래 높이로 복원
            }
        } else {
            // 트랙 숨기기 (축소 상태로)
            toggleBtn.textContent = '👁️‍🗨️';
            toggleBtn.title = '트랙 보이기';
            if (track) {
                track.classList.add('collapsed');
                track.style.height = '35px'; // 헤더만 보이는 높이로 축소
            }
        }

        // 자막 다시 렌더링
        this.renderHybridSubtitleTracks();
    }

    toggleTrackLock(trackType) {
        console.log(`🔒 트랙 잠금 토글: ${trackType}`);

        this.trackStates[trackType].locked = !this.trackStates[trackType].locked;

        // UI 업데이트
        const lockBtn = document.querySelector(`.track-lock[data-track="${trackType}"]`);
        const track = document.getElementById(`${trackType}-subtitle-track`);

        if (this.trackStates[trackType].locked) {
            lockBtn.textContent = '🔒';
            lockBtn.title = '트랙 잠금 해제';
            if (track) track.classList.add('locked');
        } else {
            lockBtn.textContent = '🔓';
            lockBtn.title = '트랙 잠금';
            if (track) track.classList.remove('locked');
        }
    }

    showTrackSettings(trackType) {
        console.log(`⚙️ 트랙 설정 표시: ${trackType}`);

        const trackNames = {
            main: '메인 자막',
            translation: '번역 자막',
            description: '설명 자막'
        };

        alert(`${trackNames[trackType]} 설정\n\n향후 업데이트에서 제공될 예정입니다:\n- 트랙 색상 변경\n- 폰트 크기 조절\n- 자막 스타일 설정`);
    }

    // 자막을 트랙별로 분류하는 함수
    classifySubtitlesByType(subtitles) {
        console.log('🏷️ 자막 분류 시작:', subtitles.length);

        const classified = {
            main: [],
            translation: [],
            description: []
        };

        subtitles.forEach((subtitle, index) => {
            const text = subtitle.text.toLowerCase();

            // 간단한 분류 로직 (향후 AI 기반으로 개선 가능)
            if (text.includes('[') && text.includes(']')) {
                // [효과음], [음악] 등은 설명 자막으로 분류
                classified.description.push({...subtitle, originalIndex: index});
            } else if (text.match(/^[a-zA-Z\s\.,!?]+$/)) {
                // 영어만 포함된 경우 번역 자막으로 분류
                classified.translation.push({...subtitle, originalIndex: index});
            } else {
                // 나머지는 메인 자막으로 분류
                classified.main.push({...subtitle, originalIndex: index});
            }
        });

        console.log('📊 자막 분류 결과:', {
            메인: classified.main.length,
            번역: classified.translation.length,
            설명: classified.description.length
        });

        return classified;
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
            maxTime: 300,    // 최대 시간은 동적으로 설정 (기본 5분)
            realWaveformDrawn: false  // 실제 파형이 그려졌는지 플래그
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

        // 자막 번호 테스트 버튼
        const testSubtitleBtn = document.getElementById('test-subtitle-numbers');
        if (testSubtitleBtn) {
            testSubtitleBtn.addEventListener('click', () => {
                this.testSubtitleNumberDisplay();
            });
        }

        // 강제 자막 표시 버튼
        const forceTestBtn = document.getElementById('force-test-subtitles');
        if (forceTestBtn) {
            forceTestBtn.addEventListener('click', () => {
                this.forceDisplayTestSubtitles();
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
            // 실시간 동기화 중지
            this.stopRealtimeWaveformSync();
            console.log('비디오 일시정지 - 현재 위치:', videoPlayer.currentTime);
        } else {
            // 현재 타임라인 위치로 비디오 시간 설정
            if (this.timeline.currentTime !== undefined && this.timeline.currentTime !== videoPlayer.currentTime) {
                videoPlayer.currentTime = this.timeline.currentTime;
                console.log('비디오 시간을 타임라인 위치로 설정:', this.timeline.currentTime);
            }

            videoPlayer.play().then(() => {
                console.log('비디오 재생 시작 - 위치:', videoPlayer.currentTime);
                // 실시간 파형-자막 동기화 시작
                this.startRealtimeWaveformSync();
            }).catch(error => {
                console.error('비디오 재생 실패:', error);
                this.showError('비디오 재생에 실패했습니다: ' + error.message);
            });
        }
    }

    stopPlayback() {
        console.log('stopPlayback 호출됨');
        const videoPlayer = document.getElementById('video-player');
        const audioPlayer = document.getElementById('audio-player');
        let currentPos = 0;

        // 비디오와 오디오 플레이어 정지
        if (videoPlayer) {
            currentPos = videoPlayer.currentTime;
            videoPlayer.pause();
            console.log(`비디오 정지 - 현재 위치 유지: ${currentPos}초`);
        }

        if (audioPlayer) {
            if (!videoPlayer) {
                currentPos = audioPlayer.currentTime;
            }
            audioPlayer.pause();
            console.log(`오디오 정지 - 현재 위치 유지: ${currentPos}초`);
        }

        if (!videoPlayer && !audioPlayer) {
            console.log('비디오 또는 오디오 플레이어를 찾을 수 없습니다');
            this.showError('미디어를 먼저 로드해주세요');
            return;
        }

        // 타임라인 상태도 정지로 업데이트
        this.timeline.isPlaying = false;
        this.timeline.currentTime = currentPos;

        // UI 업데이트
        this.updatePlayPauseButton();

        // 실시간 동기화 중지
        this.stopRealtimeWaveformSync();
    }

    // 🔄 처음으로 돌아가기 (0초로 리셋)
    resetToStart() {
        console.log('resetToStart 호출됨 - 0초로 이동');
        const videoPlayer = document.getElementById('video-player');
        const audioPlayer = document.getElementById('audio-player');

        // 비디오와 오디오를 0초로 이동
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.currentTime = 0;
            console.log('비디오를 0초로 리셋');
        }

        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            console.log('오디오를 0초로 리셋');
        }

        // 타임라인 상태 리셋
        this.timeline.isPlaying = false;
        this.timeline.currentTime = 0;

        // UI 업데이트
        this.updatePlayPauseButton();

        // 실시간 동기화 중지
        this.stopRealtimeWaveformSync();
    }

    // ⏮️ 맨 처음으로 가기 (0초)
    skipToStart() {
        console.log('skipToStart 호출됨 - 0초로 이동');
        const videoPlayer = document.getElementById('video-player');
        const audioPlayer = document.getElementById('audio-player');

        // 비디오와 오디오를 0초로 이동 (재생 상태 유지)
        if (videoPlayer) {
            videoPlayer.currentTime = 0;
            console.log('비디오를 0초로 이동');
        }

        if (audioPlayer) {
            audioPlayer.currentTime = 0;
            console.log('오디오를 0초로 이동');
        }

        // 타임라인 시간 업데이트
        this.timeline.currentTime = 0;

        // UI 업데이트
        this.updateTimelinePosition();
    }

    // ⏭️ 맨 끝으로 가기
    skipToEnd() {
        console.log('skipToEnd 호출됨 - 끝으로 이동');
        const videoPlayer = document.getElementById('video-player');
        const audioPlayer = document.getElementById('audio-player');

        let endTime = 0;

        // 재생 시간의 끝을 찾기
        if (videoPlayer && videoPlayer.duration) {
            endTime = videoPlayer.duration;
        } else if (audioPlayer && audioPlayer.duration) {
            endTime = audioPlayer.duration;
        } else if (this.timeline.duration) {
            endTime = this.timeline.duration;
        } else {
            console.log('끝 시간을 찾을 수 없습니다');
            this.showError('미디어의 끝 시간을 확인할 수 없습니다');
            return;
        }

        // 비디오와 오디오를 끝으로 이동
        if (videoPlayer) {
            videoPlayer.currentTime = Math.max(0, endTime - 0.1); // 0.1초 전으로 (완전히 끝나지 않도록)
            console.log(`비디오를 ${endTime}초로 이동`);
        }

        if (audioPlayer) {
            audioPlayer.currentTime = Math.max(0, endTime - 0.1);
            console.log(`오디오를 ${endTime}초로 이동`);
        }

        // 타임라인 시간 업데이트
        this.timeline.currentTime = endTime;

        // UI 업데이트
        this.updateTimelinePosition();
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

        console.log('🎵 음성 파일 로드 시작:', audioPath);

        // 실제 음성 파형 그리기만 시도 (즉시 파형은 제거)
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

                console.log('📝 자막 데이터 로드 완료, 렌더링 시작...');
                console.log('자막 데이터:', this.timeline.subtitleData);

                try {
                    // 하이브리드 시스템 사용
                    this.renderHybridSubtitleTracks();
                    console.log('✅ renderHybridSubtitleTracks 완료');
                } catch (error) {
                    console.error('❌ renderHybridSubtitleTracks 에러:', error);
                }

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
        console.log('🎬 renderSubtitleTrack 호출됨');

        const subtitleTrack = document.getElementById('subtitle-track');
        if (!subtitleTrack) {
            console.error('❌ subtitle-track 요소를 찾을 수 없습니다');
            return;
        }

        if (!this.timeline.subtitleData) {
            console.error('❌ timeline.subtitleData가 없습니다');
            return;
        }

        const subtitles = this.timeline.subtitleData.subtitles || [];
        console.log(`📝 자막 수: ${subtitles.length}`);

        const trackContent = subtitleTrack.querySelector('.track-content');
        if (!trackContent) {
            console.error('❌ track-content 요소를 찾을 수 없습니다');
            return;
        }

        console.log('🧹 기존 내용 지우기');
        trackContent.innerHTML = '';

        if (subtitles.length === 0) {
            console.error('❌ 자막 데이터가 비어있습니다');
            // 테스트 자막 생성
            this.createTestSubtitle(trackContent);
            return;
        }

        // 자막 겹침 방지를 위한 레이어 계산
        const layers = this.calculateSubtitleLayers(subtitles);
        console.log('📚 자막 레이어 계산 완료:', layers);

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

            // 레이어에 따른 위치 조정 (3줄까지 허용)
            const layer = Math.min(layers[index] || 0, 2); // 최대 3줄 (0, 1, 2)
            const layerHeight = 32; // 각 레이어의 높이를 3줄에 맞게 조정
            const topPosition = 5 + (layer * layerHeight);

            block.style.left = startPercent + '%';
            block.style.width = Math.max(widthPercent, 4) + '%'; // 최소 너비 보장
            block.style.top = topPosition + 'px';
            block.style.height = '30px'; // 3줄 레이어에 맞게 조정

            // 레이어별 색상 및 스타일 적용
            const layerColors = [
                'rgba(0, 123, 255, 0.9)', // 레이어 0: 파란색
                'rgba(40, 167, 69, 0.9)', // 레이어 1: 초록색
                'rgba(255, 193, 7, 0.9)', // 레이어 2: 노란색
                'rgba(220, 53, 69, 0.9)', // 레이어 3: 빨간색
                'rgba(102, 16, 242, 0.9)', // 레이어 4: 보라색
                'rgba(255, 133, 27, 0.9)'  // 레이어 5: 주황색
            ];

            const layerColor = layerColors[layer % layerColors.length];
            block.style.background = `linear-gradient(135deg, ${layerColor}, ${layerColor.replace('0.9', '0.7')})`;

            // 레이어 정보를 블록에 저장
            block.dataset.layer = layer;
            block.title = `#${index + 1} (Layer ${layer}): ${this.formatSubtitleTime(startTime)} - ${this.formatSubtitleTime(endTime)}\n${subtitle.text}`;

            console.log(`자막 #${index + 1} 배치: layer=${layer}, top=${topPosition}px, color=${layerColor}`);

            // 번호 표시 요소 생성 - 더 강력한 스타일링
            const numberElement = document.createElement('div');
            numberElement.className = 'subtitle-number';
            numberElement.textContent = `#${index + 1}`;
            numberElement.setAttribute('data-number', index + 1);

            // 모든 브라우저에서 확실히 보이도록 강력한 인라인 스타일
            const numberStyles = {
                'display': 'block',
                'visibility': 'visible',
                'opacity': '1',
                'position': 'absolute',
                'top': '0px',
                'left': '0px',
                'z-index': '999',
                'background-color': numberBgColor, // 레이어별 색상
                'color': 'white',
                'font-weight': '900',
                'font-size': '12px', // 더 큰 폰트
                'padding': '2px 6px',
                'border-radius': '50%', // 원형으로
                'text-align': 'center',
                'min-width': '20px',
                'min-height': '20px',
                'border': '2px solid white',
                'box-sizing': 'border-box',
                'line-height': '16px',
                'white-space': 'nowrap',
                'box-shadow': '0 2px 6px rgba(0,0,0,0.8)' // 강한 그림자
            };

            // 스타일 직접 적용
            Object.keys(numberStyles).forEach(property => {
                numberElement.style.setProperty(property, numberStyles[property], 'important');
            });

            console.log(`🏷️ 번호 요소 #${index + 1} 생성:`, {
                텍스트: numberElement.textContent,
                클래스: numberElement.className,
                스타일: numberElement.style.cssText
            });

            // 시간 정보 요소 생성
            const timeElement = document.createElement('div');
            timeElement.className = 'subtitle-time';

            // 텍스트 요소 생성
            const textElement = document.createElement('div');
            textElement.className = 'subtitle-text';
            textElement.textContent = subtitle.text;

            // 블록 너비에 따라 표시 내용 조정
            const blockWidthPx = (widthPercent / 100) * (trackContent.offsetWidth || 1000);

            // 번호는 항상 표시, 레이어 정보도 포함
            numberElement.textContent = layer > 0 ? `${index + 1}` : `${index + 1}`;

            // 레이어별로 번호 색상 다르게
            const numberBgColors = [
                'rgb(255, 60, 60)',    // 레이어 0: 빨간색
                'rgb(34, 139, 34)',    // 레이어 1: 진한 초록색
                'rgb(255, 140, 0)',    // 레이어 2: 진한 주황색
                'rgb(128, 0, 128)',    // 레이어 3: 보라색
                'rgb(0, 100, 200)',    // 레이어 4: 진한 파란색
                'rgb(220, 20, 60)'     // 레이어 5: 크림슨
            ];

            const numberBgColor = numberBgColors[layer % numberBgColors.length];

            // 텍스트 컨테이너 생성 (번호 옆에 표시)
            const textContainer = document.createElement('div');
            textContainer.style.marginLeft = '25px'; // 번호 공간 확보
            textContainer.style.display = 'flex';
            textContainer.style.flexDirection = 'column';
            textContainer.style.justifyContent = 'center';
            textContainer.style.overflow = 'hidden';

            if (blockWidthPx < 40) {
                // 극소 블록: 번호만
                timeElement.style.display = 'none';
                textElement.style.display = 'none';
            } else if (blockWidthPx < 80) {
                // 작은 블록: 번호 + 시간
                timeElement.textContent = `${this.formatSubtitleTime(startTime, true)}`;
                timeElement.style.fontSize = '9px';
                textElement.style.display = 'none';
                textContainer.appendChild(timeElement);
            } else if (blockWidthPx < 150) {
                // 중간 블록: 번호 + 시간 + 짧은 텍스트
                timeElement.textContent = `${this.formatSubtitleTime(startTime, true)}`;
                timeElement.style.fontSize = '8px';
                textElement.textContent = subtitle.text.length > 8 ?
                    subtitle.text.substring(0, 6) + '...' : subtitle.text;
                textElement.style.fontSize = '8px';
                textContainer.appendChild(timeElement);
                textContainer.appendChild(textElement);
            } else {
                // 큰 블록: 번호 + 전체 정보
                timeElement.textContent = `${this.formatSubtitleTime(startTime)} → ${this.formatSubtitleTime(endTime)}`;
                timeElement.style.fontSize = '9px';
                textElement.style.fontSize = '9px';
                textContainer.appendChild(timeElement);
                textContainer.appendChild(textElement);
            }

            // 요소들을 블록에 추가 (번호 + 텍스트 컨테이너)
            block.appendChild(numberElement);
            if (blockWidthPx >= 40) {
                block.appendChild(textContainer);
            }

            console.log(`🔍 자막 블록 #${index + 1} 디버깅:`, {
                번호요소텍스트: numberElement.textContent,
                번호요소클래스: numberElement.className,
                블록너비: blockWidthPx + 'px',
                번호표시여부: numberElement.style.display,
                번호가시성: numberElement.style.visibility,
                번호투명도: numberElement.style.opacity,
                번호배경색: numberElement.style.backgroundColor,
                부모블록: block,
                자식요소수: block.children.length
            });

            // DOM에 실제로 추가되었는지 확인
            setTimeout(() => {
                const addedElement = block.querySelector('.subtitle-number');
                console.log(`✅ DOM 추가 확인 #${index + 1}:`, {
                    찾은요소: addedElement,
                    표시여부: addedElement ? addedElement.style.display : 'null',
                    실제텍스트: addedElement ? addedElement.textContent : 'null'
                });
            }, 100);

            block.title = `#${index + 1}: ${this.formatSubtitleTime(startTime)} - ${this.formatSubtitleTime(endTime)}\n${subtitle.text}`;

            // 자막 블록 클릭 이벤트 (구간 편집 기능 포함)
            block.addEventListener('click', (e) => {
                // 단일 클릭: 재생 위치 이동 및 선택
                this.seekToTime(subtitle.start_time);
                this.selectSubtitleBlock(block);

                // 편집 정보 표시
                this.showSubtitleEditInfo(subtitle, index);
            });

            // 자막 블록 더블클릭 이벤트 (구간 편집)
            block.addEventListener('dblclick', (e) => {
                e.preventDefault();
                this.editSubtitleSegment(subtitle, index);
            });

            // 자막 블록 우클릭 이벤트 (컨텍스트 메뉴)
            block.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showSubtitleContextMenu(e, subtitle, index);
            });

            trackContent.appendChild(block);
        });

        // 레이어 범례 추가
        this.addLayerLegend(layers);

        // 렌더링 완료 후 전체 확인
        console.log('🎯 자막 트랙 렌더링 완료');
        console.log(`📊 생성된 블록 수: ${trackContent.children.length}`);

        // 각 블록의 번호 요소 확인
        setTimeout(() => {
            const blocks = trackContent.querySelectorAll('.subtitle-block');
            console.log(`🔍 DOM 확인 - 총 블록 수: ${blocks.length}`);

            blocks.forEach((block, index) => {
                const numberEl = block.querySelector('.subtitle-number');
                console.log(`Block #${index + 1}:`, {
                    번호요소: numberEl,
                    표시여부: numberEl ? numberEl.style.display : 'none',
                    텍스트: numberEl ? numberEl.textContent : 'empty'
                });
            });
        }, 200);
    }

    // 하이브리드 자막 트랙 렌더링 메인 함수
    renderHybridSubtitleTracks() {
        console.log('🎬 하이브리드 자막 트랙 렌더링 시작');

        if (!this.timeline.subtitleData) {
            console.error('❌ timeline.subtitleData가 없습니다');
            return;
        }

        const subtitles = this.timeline.subtitleData.subtitles || [];
        console.log(`📝 총 자막 수: ${subtitles.length}`);

        if (subtitles.length === 0) {
            console.error('❌ 자막 데이터가 비어있습니다');
            return;
        }

        // 자막을 트랙별로 분류 (화자 기반 분류가 있으면 우선 사용)
        let classifiedSubtitles;
        if (this.timeline.speakerClassifiedSubtitles) {
            console.log('🎭 화자 기반 분류된 자막 사용');
            classifiedSubtitles = this.timeline.speakerClassifiedSubtitles;
        } else {
            console.log('📝 기본 타입별 분류 사용');
            classifiedSubtitles = this.classifySubtitlesByType(subtitles);
        }

        // 각 트랙에 자막 렌더링
        ['main', 'translation', 'description'].forEach(trackType => {
            if (this.trackStates[trackType].visible) {
                this.renderTrackSubtitles(trackType, classifiedSubtitles[trackType]);
            } else {
                // 축소된 트랙은 내용 비우기 (헤더는 유지)
                this.clearTrackContent(trackType);
            }
        });

        // 오디오 데이터가 있으면 파형 강도 기반 시각화 적용
        setTimeout(() => {
            this.updateSubtitleAppearanceByAudio();
        }, 500);

        console.log('✅ 하이브리드 자막 트랙 렌더링 완료');
    }

    // 특정 트랙의 자막들을 렌더링
    renderTrackSubtitles(trackType, subtitles) {
        console.log(`🎯 ${trackType} 트랙 렌더링: ${subtitles.length}개 자막`);

        // 트랙 헤더에 자막 개수 업데이트
        this.updateTrackSubtitleCount(trackType, subtitles.length);

        const track = document.getElementById(`${trackType}-subtitle-track`);
        if (!track) {
            console.error(`❌ ${trackType}-subtitle-track 요소를 찾을 수 없습니다`);
            return;
        }

        const trackContent = track.querySelector('.track-content');
        if (!trackContent) {
            console.error(`❌ ${trackType} 트랙의 .track-content 요소를 찾을 수 없습니다`);
            return;
        }

        // 기존 내용 지우기
        trackContent.innerHTML = '';

        if (subtitles.length === 0) {
            console.log(`📝 ${trackType} 트랙에 자막이 없습니다`);
            return;
        }

        // 트랙 내에서 레이어 계산 (같은 트랙 내 겹침 방지)
        const layers = this.calculateSubtitleLayers(subtitles);
        console.log(`📚 ${trackType} 트랙 레이어 계산 완료:`, layers);

        // 트랙별 색상 테마
        const trackThemes = {
            main: {
                bgColor: 'rgba(74, 158, 255, 0.9)',
                numberBg: 'rgb(255, 60, 60)',
                name: '메인'
            },
            translation: {
                bgColor: 'rgba(40, 167, 69, 0.9)',
                numberBg: 'rgb(34, 139, 34)',
                name: '번역'
            },
            description: {
                bgColor: 'rgba(255, 193, 7, 0.9)',
                numberBg: 'rgb(255, 140, 0)',
                name: '설명'
            }
        };

        const theme = trackThemes[trackType];

        subtitles.forEach((subtitle, index) => {
            const block = document.createElement('div');
            block.className = 'subtitle-block hybrid-subtitle';
            block.dataset.index = subtitle.originalIndex || index;
            block.dataset.trackType = trackType;

            // 자막 시간이 음수인 경우 0으로 조정
            const startTime = Math.max(0, subtitle.start_time);
            const endTime = Math.max(0, subtitle.end_time);

            // 전체 시간 범위 계산
            const totalDuration = Math.max(this.timeline.duration, 60);
            const duration = endTime - startTime;

            const startPercent = (startTime / totalDuration) * 100;
            const widthPercent = (duration / totalDuration) * 100;

            // 레이어에 따른 위치 조정 (3줄까지 허용)
            const layer = Math.min(layers[index] || 0, 2); // 최대 3줄 (0, 1, 2)
            const layerHeight = 32; // 3줄에 맞게 높이 조정
            const topPosition = 5 + (layer * layerHeight);

            block.style.left = startPercent + '%';
            block.style.width = Math.max(widthPercent, 3) + '%';
            block.style.top = topPosition + 'px';
            block.style.height = '30px';

            // 트랙별 색상 적용
            block.style.background = `linear-gradient(135deg, ${theme.bgColor}, ${theme.bgColor.replace('0.9', '0.7')})`;
            block.style.border = `1px solid ${theme.bgColor.replace('0.9', '1')}`;

            // 레이어 정보를 블록에 저장
            block.dataset.layer = layer;
            block.title = `${theme.name} #${subtitle.originalIndex + 1 || index + 1} (Layer ${layer}): ${this.formatSubtitleTime(startTime)} - ${this.formatSubtitleTime(endTime)}\n${subtitle.text}`;

            // 번호 표시 요소 생성
            const numberElement = document.createElement('div');
            numberElement.className = 'subtitle-number hybrid-number';
            numberElement.textContent = `${subtitle.originalIndex + 1 || index + 1}`;

            // 강력한 인라인 스타일
            Object.assign(numberElement.style, {
                'display': 'block',
                'visibility': 'visible',
                'opacity': '1',
                'backgroundColor': theme.numberBg,
                'color': 'white',
                'fontWeight': '900',
                'fontSize': '9px',
                'padding': '1px 3px',
                'borderRadius': '3px',
                'position': 'absolute',
                'left': '2px',
                'top': '2px',
                'zIndex': '25',
                'minWidth': '15px',
                'textAlign': 'center',
                'lineHeight': '1.2'
            });

            // 텍스트 표시 요소 생성 (크기별 다르게)
            const textElement = document.createElement('div');
            textElement.className = 'subtitle-text-display';

            // 블록 너비에 따른 텍스트 길이 조정
            const blockWidthPx = (widthPercent / 100) * (trackContent.offsetWidth || 1000);
            let displayText = subtitle.text;
            let fontSize = '8px';

            if (blockWidthPx < 40) {
                // 매우 작은 블록: 텍스트 숨김
                displayText = '';
            } else if (blockWidthPx < 80) {
                // 작은 블록: 매우 짧게
                displayText = subtitle.text.substring(0, 8) + (subtitle.text.length > 8 ? '…' : '');
                fontSize = '7px';
            } else if (blockWidthPx < 120) {
                // 중간 블록: 적당히
                displayText = subtitle.text.substring(0, 15) + (subtitle.text.length > 15 ? '…' : '');
                fontSize = '8px';
            } else if (blockWidthPx < 200) {
                // 큰 블록: 대부분
                displayText = subtitle.text.substring(0, 25) + (subtitle.text.length > 25 ? '…' : '');
                fontSize = '9px';
            } else {
                // 매우 큰 블록: 전체 또는 많이
                displayText = subtitle.text.substring(0, 40) + (subtitle.text.length > 40 ? '…' : '');
                fontSize = '10px';
            }

            textElement.textContent = displayText;

            Object.assign(textElement.style, {
                'position': 'absolute',
                'left': '20px',
                'top': '2px',
                'right': '2px',
                'bottom': '2px',
                'fontSize': fontSize,
                'color': 'white',
                'fontWeight': '500',
                'overflow': 'hidden',
                'textOverflow': 'ellipsis',
                'whiteSpace': 'nowrap',
                'backgroundColor': 'rgba(0, 0, 0, 0.4)',
                'padding': '1px 3px',
                'borderRadius': '2px',
                'zIndex': '24',
                'display': displayText ? 'flex' : 'none',
                'alignItems': 'center'
            });

            // 블록에 번호와 텍스트 추가
            block.appendChild(numberElement);
            block.appendChild(textElement);

            // 이벤트 리스너 추가 (편집 기능 + 드래그)
            this.addSubtitleBlockEvents(block, subtitle, subtitle.originalIndex || index);
            this.addDragFunctionality(block, subtitle, subtitle.originalIndex || index);

            // 트랙에 블록 추가
            trackContent.appendChild(block);

            console.log(`${theme.name} #${subtitle.originalIndex + 1 || index + 1} 배치: layer=${layer}, top=${topPosition}px`);
        });
    }

    // 트랙 내용 비우기
    clearTrackContent(trackType) {
        const track = document.getElementById(`${trackType}-subtitle-track`);
        if (track) {
            const trackContent = track.querySelector('.track-content');
            if (trackContent) {
                trackContent.innerHTML = '';
            }
        }

        // 자막 개수도 0으로 업데이트
        this.updateTrackSubtitleCount(trackType, 0);
    }

    // 트랙 헤더에 자막 개수 표시 업데이트
    updateTrackSubtitleCount(trackType, count) {
        const track = document.getElementById(`${trackType}-subtitle-track`);
        if (!track) return;

        const trackTitle = track.querySelector('.track-title');
        if (!trackTitle) return;

        // 기존 개수 표시 제거
        trackTitle.textContent = trackTitle.textContent.replace(/\s*\(\d+\)$/, '');

        // 새로운 개수 표시 추가
        if (count > 0) {
            trackTitle.textContent += ` (${count})`;
        }
    }

    // 자막 블록에 이벤트 리스너 추가
    addSubtitleBlockEvents(block, subtitle, index) {
        // 클릭 시 재생 위치 이동
        block.addEventListener('click', (e) => {
            e.stopPropagation();

            // 기존 활성화된 자막 블록 비활성화
            document.querySelectorAll('.hybrid-subtitle.active').forEach(activeBlock => {
                activeBlock.classList.remove('active');
            });

            // 현재 블록 활성화
            block.classList.add('active');

            this.seekToTime(subtitle.start_time);
            this.showSubtitleEditInfo(subtitle, index);
            // 파형과 자막 매칭 하이라이트
            this.highlightWaveformForSubtitle(subtitle);

            // 오디오 분석 정보 표시
            this.showAudioAnalysisInfo(subtitle, block);
        });

        // 더블클릭 시 편집
        block.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!this.trackStates[block.dataset.trackType]?.locked) {
                this.editSubtitleSegment(index);
            }
        });

        // 우클릭 컨텍스트 메뉴
        block.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.trackStates[block.dataset.trackType]?.locked) {
                this.showSubtitleContextMenu(e, index);
            }
        });

        // 마우스 호버 시 파형 연결 표시
        block.addEventListener('mouseenter', () => {
            this.showWaveformConnection(subtitle);
        });

        block.addEventListener('mouseleave', () => {
            this.hideWaveformConnection();
        });
    }

    // 🖱️ 자막 블록 드래그 기능 추가
    addDragFunctionality(block, subtitle, subtitleIndex) {
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0; // 세로 드래그를 위한 Y 좌표
        let dragStartTime = 0;
        let originalLeft = 0;
        let originalTop = 0; // 원래 레이어 위치

        // 드래그 핸들러 - 번호 부분을 드래그 핸들로 사용
        const numberElement = block.querySelector('.subtitle-number');
        if (numberElement) {
            numberElement.style.cursor = 'grab';

            // 마우스 다운 - 드래그 시작
            numberElement.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // 트랙이 잠겨있으면 드래그 불가
                if (this.trackStates[block.dataset.trackType]?.locked) {
                    return;
                }

                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY; // 세로 드래그를 위한 Y 좌표 추가
                dragStartTime = subtitle.start_time;
                originalLeft = parseFloat(block.style.left);
                originalTop = parseFloat(block.style.top); // 원래 레이어 위치 저장

                numberElement.style.cursor = 'grabbing';
                block.classList.add('dragging');

                // 드래그 시작 시각적 피드백
                this.showDragFeedback(block, true);

                console.log(`🖱️ 자막 #${subtitleIndex + 1} 드래그 시작`);
            });
        }

        // 전역 마우스 이벤트 - 드래그 중
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            e.preventDefault();

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY; // 세로 이동량
            const trackContent = block.parentElement;
            const trackWidth = trackContent.offsetWidth;
            const totalDuration = Math.max(this.timeline.duration, 60);

            // 픽셀 이동을 시간으로 변환 (가로 방향)
            const timePerPixel = totalDuration / trackWidth;
            const deltaTime = deltaX * timePerPixel;
            let newStartTime = Math.max(0, dragStartTime + deltaTime);

            // 스냅핑 기능: 다른 자막과 자동 정렬
            newStartTime = this.snapToNearbySubtitles(newStartTime, subtitleIndex);

            // 새로운 위치 계산 (가로)
            const newLeft = (newStartTime / totalDuration) * 100;

            // 레이어 계산 (세로 방향)
            const layerHeight = 32; // 레이어당 높이
            const newLayer = Math.max(0, Math.min(2, Math.round((originalTop + deltaY - 5) / layerHeight))); // 0-2 레이어
            const newTop = 5 + (newLayer * layerHeight);

            // 블록 위치 업데이트 (가로 + 세로)
            block.style.left = newLeft + '%';
            block.style.top = newTop + 'px';

            // 레이어 변경 시 색상도 업데이트
            this.updateBlockLayerColor(block, newLayer);

            // 실시간 시간 표시 업데이트 (레이어 정보 포함)
            this.updateDragTimeDisplay(block, newStartTime, newLayer);

            // 드래그 가이드라인 표시
            this.showDragGuidelines(newStartTime);

            // 충돌 감지 및 경고
            this.checkCollisionWarning(newStartTime, subtitleIndex, block);
        });

        // 전역 마우스 업 - 드래그 종료
        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;

            isDragging = false;

            if (numberElement) {
                numberElement.style.cursor = 'grab';
            }

            block.classList.remove('dragging');

            // 드래그 피드백 제거
            this.showDragFeedback(block, false);
            this.hideDragGuidelines();

            // 최종 위치에서 시간 계산 및 업데이트
            const finalTime = this.calculateTimeFromPosition(block);
            this.updateSubtitleTime(subtitleIndex, finalTime);

            console.log(`🖱️ 자막 #${subtitleIndex + 1} 드래그 완료: ${this.formatSubtitleTime(finalTime)}`);
        });
    }

    // 드래그 시각적 피드백
    showDragFeedback(block, show) {
        if (show) {
            block.style.boxShadow = '0 4px 20px rgba(255, 215, 0, 0.8)';
            block.style.transform = 'scale(1.05) translateY(-3px)';
            block.style.zIndex = '50';
            block.style.border = '2px solid rgba(255, 215, 0, 1)';
        } else {
            block.style.boxShadow = '';
            block.style.transform = '';
            block.style.zIndex = '';
            block.style.border = '';
        }
    }

    // 드래그 중 시간 표시 업데이트 (레이어 정보 포함)
    updateDragTimeDisplay(block, newStartTime, newLayer = null) {
        let timeDisplay = block.querySelector('.drag-time-display');
        if (!timeDisplay) {
            timeDisplay = document.createElement('div');
            timeDisplay.className = 'drag-time-display';
            timeDisplay.style.cssText = `
                position: absolute;
                top: -25px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 215, 0, 0.95);
                color: black;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: bold;
                z-index: 60;
                white-space: nowrap;
                pointer-events: none;
            `;
            block.appendChild(timeDisplay);
        }

        const timeText = this.formatSubtitleTime(newStartTime);
        const layerText = newLayer !== null ? ` [레이어 ${newLayer}]` : '';
        timeDisplay.textContent = `${timeText}${layerText}`;
    }

    // 블록의 레이어 색상 업데이트
    updateBlockLayerColor(block, newLayer) {
        const layerColors = [
            'rgba(0, 123, 255, 0.9)', // 레이어 0: 파란색
            'rgba(40, 167, 69, 0.9)', // 레이어 1: 초록색
            'rgba(255, 193, 7, 0.9)', // 레이어 2: 노란색
        ];

        const layerColor = layerColors[newLayer % layerColors.length];
        block.style.background = `linear-gradient(135deg, ${layerColor}, ${layerColor.replace('0.9', '0.7')})`;

        // 데이터셋 업데이트
        block.dataset.layer = newLayer;

        // 툴팁 업데이트
        const currentTitle = block.title || '';
        const titleParts = currentTitle.split(' (Layer ');
        if (titleParts.length > 1) {
            const afterLayer = titleParts[1].split('): ');
            if (afterLayer.length > 1) {
                block.title = `${titleParts[0]} (Layer ${newLayer}): ${afterLayer[1]}`;
            }
        }
    }

    // 드래그 가이드라인 표시
    showDragGuidelines(currentTime) {
        // 기존 가이드라인 제거
        this.hideDragGuidelines();

        const audioTrack = document.getElementById('audio-track');
        if (!audioTrack) return;

        const totalDuration = Math.max(this.timeline.duration, 60);
        const currentPercent = (currentTime / totalDuration) * 100;

        // 현재 위치 가이드라인
        const guideline = document.createElement('div');
        guideline.className = 'drag-guideline';
        guideline.style.cssText = `
            position: absolute;
            left: ${currentPercent}%;
            top: 0;
            bottom: 0;
            width: 2px;
            background: rgba(255, 215, 0, 0.8);
            z-index: 30;
            pointer-events: none;
            box-shadow: 0 0 6px rgba(255, 215, 0, 0.6);
        `;

        // 시간 라벨
        const timeLabel = document.createElement('div');
        timeLabel.className = 'drag-time-label';
        timeLabel.textContent = this.formatSubtitleTime(currentTime);
        timeLabel.style.cssText = `
            position: absolute;
            top: -20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 215, 0, 0.9);
            color: black;
            padding: 1px 4px;
            border-radius: 2px;
            font-size: 9px;
            font-weight: bold;
            white-space: nowrap;
        `;

        guideline.appendChild(timeLabel);
        audioTrack.appendChild(guideline);
    }

    hideDragGuidelines() {
        document.querySelectorAll('.drag-guideline').forEach(el => el.remove());
        document.querySelectorAll('.drag-time-display').forEach(el => el.remove());
    }

    // 위치에서 시간 계산
    calculateTimeFromPosition(block) {
        const leftPercent = parseFloat(block.style.left);
        const totalDuration = Math.max(this.timeline.duration, 60);
        return (leftPercent / 100) * totalDuration;
    }

    // 자막 시간 업데이트
    updateSubtitleTime(subtitleIndex, newStartTime) {
        if (!this.timeline.subtitleData || !this.timeline.subtitleData.subtitles[subtitleIndex]) {
            return;
        }

        const subtitle = this.timeline.subtitleData.subtitles[subtitleIndex];
        const duration = subtitle.end_time - subtitle.start_time;

        // 시작 시간과 종료 시간 업데이트
        subtitle.start_time = newStartTime;
        subtitle.end_time = newStartTime + duration;

        console.log(`⏰ 자막 #${subtitleIndex + 1} 시간 업데이트: ${this.formatSubtitleTime(newStartTime)} - ${this.formatSubtitleTime(subtitle.end_time)}`);

        // 블록 툴팁 업데이트
        const blocks = document.querySelectorAll(`[data-index="${subtitleIndex}"]`);
        blocks.forEach(block => {
            block.title = `#${subtitleIndex + 1}: ${this.formatSubtitleTime(newStartTime)} - ${this.formatSubtitleTime(subtitle.end_time)}\n${subtitle.text}`;
        });

        // 파형 매칭도 업데이트
        setTimeout(() => {
            this.updateSubtitleAppearanceByAudio();
        }, 100);
    }

    // 🧲 스냅핑 기능: 다른 자막과 자동 정렬
    snapToNearbySubtitles(targetTime, currentIndex) {
        if (!this.timeline.subtitleData) return targetTime;

        const subtitles = this.timeline.subtitleData.subtitles;
        const snapThreshold = 0.5; // 0.5초 이내면 스냅

        let bestSnapTime = targetTime;
        let minDistance = snapThreshold;

        // 다른 자막들과 비교
        subtitles.forEach((subtitle, index) => {
            if (index === currentIndex) return;

            // 시작 시간과의 거리
            const startDistance = Math.abs(targetTime - subtitle.start_time);
            if (startDistance < minDistance) {
                minDistance = startDistance;
                bestSnapTime = subtitle.start_time;
            }

            // 종료 시간과의 거리
            const endDistance = Math.abs(targetTime - subtitle.end_time);
            if (endDistance < minDistance) {
                minDistance = endDistance;
                bestSnapTime = subtitle.end_time;
            }
        });

        // 정수 초와의 스냅핑 (1초, 2초, 3초 등)
        const roundedTime = Math.round(targetTime);
        const roundDistance = Math.abs(targetTime - roundedTime);
        if (roundDistance < 0.3 && roundDistance < minDistance) {
            bestSnapTime = roundedTime;
        }

        return bestSnapTime;
    }

    // ⚠️ 충돌 감지 및 경고
    checkCollisionWarning(newStartTime, currentIndex, dragBlock) {
        if (!this.timeline.subtitleData) return;

        const currentSubtitle = this.timeline.subtitleData.subtitles[currentIndex];
        if (!currentSubtitle) return;

        const newEndTime = newStartTime + (currentSubtitle.end_time - currentSubtitle.start_time);
        let hasCollision = false;

        // 다른 자막과 겹침 확인
        this.timeline.subtitleData.subtitles.forEach((subtitle, index) => {
            if (index === currentIndex) return;

            const overlap = !(newEndTime <= subtitle.start_time || newStartTime >= subtitle.end_time);
            if (overlap) {
                hasCollision = true;
            }
        });

        // 충돌 시각적 표시
        if (hasCollision) {
            dragBlock.style.borderColor = 'rgba(255, 0, 0, 1)';
            dragBlock.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        } else {
            dragBlock.style.borderColor = 'rgba(255, 215, 0, 1)';
            dragBlock.style.backgroundColor = '';
        }
    }

    // 🎵 자막과 파형 매칭 시스템
    highlightWaveformForSubtitle(subtitle) {
        console.log('🎵 자막-파형 매칭 하이라이트:', subtitle.text);

        const audioTrack = document.getElementById('audio-track');
        if (!audioTrack) {
            console.log('❌ 오디오 트랙을 찾을 수 없습니다');
            return;
        }

        // 기존 하이라이트 제거
        this.clearWaveformHighlight();

        // 자막 시간 범위 계산
        const startTime = Math.max(0, subtitle.start_time);
        const endTime = Math.max(0, subtitle.end_time);
        const totalDuration = Math.max(this.timeline.duration, 60);

        // 파형에서 해당 구간 하이라이트
        const startPercent = (startTime / totalDuration) * 100;
        const widthPercent = ((endTime - startTime) / totalDuration) * 100;

        // 하이라이트 오버레이 생성
        const highlight = document.createElement('div');
        highlight.className = 'waveform-subtitle-highlight';
        highlight.style.cssText = `
            position: absolute;
            left: ${startPercent}%;
            width: ${Math.max(widthPercent, 1)}%;
            top: 0;
            bottom: 0;
            background: rgba(255, 215, 0, 0.4);
            border: 2px solid rgba(255, 215, 0, 0.8);
            border-radius: 3px;
            z-index: 15;
            pointer-events: none;
            box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
            animation: pulseHighlight 1.5s ease-in-out infinite;
        `;

        // 시간 정보 표시
        const timeLabel = document.createElement('div');
        timeLabel.className = 'waveform-time-label';
        timeLabel.textContent = `${this.formatSubtitleTime(startTime)} - ${this.formatSubtitleTime(endTime)}`;
        timeLabel.style.cssText = `
            position: absolute;
            top: -25px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 215, 0, 0.9);
            color: black;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
            white-space: nowrap;
            z-index: 20;
        `;

        highlight.appendChild(timeLabel);
        audioTrack.appendChild(highlight);

        // 자막 텍스트도 하이라이트
        this.highlightSubtitleText(subtitle.text);

        // 3초 후 자동 제거
        setTimeout(() => {
            this.clearWaveformHighlight();
        }, 3000);
    }

    showWaveformConnection(subtitle) {
        console.log('🔗 파형 연결선 표시:', subtitle.text);

        const audioTrack = document.getElementById('audio-track');
        if (!audioTrack) return;

        // 기존 연결선 제거
        this.hideWaveformConnection();

        const startTime = Math.max(0, subtitle.start_time);
        const endTime = Math.max(0, subtitle.end_time);
        const totalDuration = Math.max(this.timeline.duration, 60);

        const startPercent = (startTime / totalDuration) * 100;
        const widthPercent = ((endTime - startTime) / totalDuration) * 100;

        // 부드러운 연결선 오버레이
        const connection = document.createElement('div');
        connection.className = 'waveform-connection';
        connection.style.cssText = `
            position: absolute;
            left: ${startPercent}%;
            width: ${Math.max(widthPercent, 0.5)}%;
            top: 0;
            bottom: 0;
            background: linear-gradient(45deg,
                rgba(74, 158, 255, 0.3) 0%,
                rgba(74, 158, 255, 0.6) 50%,
                rgba(74, 158, 255, 0.3) 100%);
            border-left: 2px solid rgba(74, 158, 255, 0.8);
            border-right: 2px solid rgba(74, 158, 255, 0.8);
            z-index: 12;
            pointer-events: none;
            transition: all 0.3s ease;
        `;

        audioTrack.appendChild(connection);
    }

    hideWaveformConnection() {
        const connections = document.querySelectorAll('.waveform-connection');
        connections.forEach(conn => conn.remove());
    }

    clearWaveformHighlight() {
        const highlights = document.querySelectorAll('.waveform-subtitle-highlight');
        highlights.forEach(highlight => highlight.remove());

        // 자막 텍스트 하이라이트도 제거
        this.clearSubtitleTextHighlight();
    }

    highlightSubtitleText(text) {
        // 화면 상단에 현재 자막 텍스트 표시
        let textDisplay = document.getElementById('current-subtitle-display');
        if (!textDisplay) {
            textDisplay = document.createElement('div');
            textDisplay.id = 'current-subtitle-display';
            textDisplay.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                z-index: 1000;
                max-width: 80%;
                text-align: center;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                animation: fadeInScale 0.3s ease-out;
            `;
            document.body.appendChild(textDisplay);
        }

        textDisplay.textContent = text;
        textDisplay.style.display = 'block';
    }

    clearSubtitleTextHighlight() {
        const textDisplay = document.getElementById('current-subtitle-display');
        if (textDisplay) {
            textDisplay.style.display = 'none';
        }
    }

    // 📊 자막 구간별 오디오 분석
    analyzeAudioForSubtitle(subtitle) {
        console.log('📊 자막 구간 오디오 분석:', subtitle.text);

        if (!this.timeline.audioData) {
            console.log('❌ 오디오 데이터가 없습니다');
            return null;
        }

        const startTime = Math.max(0, subtitle.start_time);
        const endTime = Math.max(0, subtitle.end_time);
        const duration = endTime - startTime;

        // 해당 구간의 오디오 데이터 추출
        const sampleRate = this.timeline.audioData.sampleRate || 44100;
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.floor(endTime * sampleRate);

        if (this.timeline.audioData.channelData) {
            const segmentData = this.timeline.audioData.channelData.slice(startSample, endSample);

            // 오디오 특성 분석
            const analysis = this.computeAudioFeatures(segmentData, sampleRate);

            return {
                duration: duration,
                averageAmplitude: analysis.avgAmplitude,
                peakAmplitude: analysis.peakAmplitude,
                zeroCrossings: analysis.zeroCrossings,
                spectralCentroid: analysis.spectralCentroid,
                energy: analysis.energy,
                silenceRatio: analysis.silenceRatio
            };
        }

        return null;
    }

    computeAudioFeatures(audioData, sampleRate) {
        if (!audioData || audioData.length === 0) {
            return {
                avgAmplitude: 0,
                peakAmplitude: 0,
                zeroCrossings: 0,
                spectralCentroid: 0,
                energy: 0,
                silenceRatio: 1
            };
        }

        // 평균 진폭
        const avgAmplitude = audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length;

        // 최대 진폭
        const peakAmplitude = Math.max(...audioData.map(Math.abs));

        // 제로 크로싱 (음성 특성 분석)
        let zeroCrossings = 0;
        for (let i = 1; i < audioData.length; i++) {
            if ((audioData[i] >= 0) !== (audioData[i-1] >= 0)) {
                zeroCrossings++;
            }
        }

        // 에너지
        const energy = audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length;

        // 무음 비율 (임계값 이하)
        const silenceThreshold = peakAmplitude * 0.1;
        const silentSamples = audioData.filter(val => Math.abs(val) < silenceThreshold).length;
        const silenceRatio = silentSamples / audioData.length;

        return {
            avgAmplitude,
            peakAmplitude,
            zeroCrossings: zeroCrossings / audioData.length * sampleRate, // Hz 단위
            spectralCentroid: 0, // 추후 FFT 구현 시 추가
            energy,
            silenceRatio
        };
    }

    // 📊 오디오 분석 정보 표시
    showAudioAnalysisInfo(subtitle, blockElement) {
        // 기존 분석 정보 제거
        document.querySelectorAll('.audio-analysis-info').forEach(info => info.remove());

        const audioAnalysis = this.analyzeAudioForSubtitle(subtitle);
        if (!audioAnalysis) {
            console.log('📊 오디오 분석 데이터 없음');
            return;
        }

        const infoPanel = document.createElement('div');
        infoPanel.className = 'audio-analysis-info';

        // 분석 결과를 사용자 친화적으로 표시
        const volumeLevel = this.getVolumeLevel(audioAnalysis.averageAmplitude);
        const speechQuality = this.getSpeechQuality(audioAnalysis);

        infoPanel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px;">🎵 오디오 분석</div>
            <div>📢 음량: ${volumeLevel}</div>
            <div>🎤 음성 품질: ${speechQuality}</div>
            <div>⏱️ 구간: ${audioAnalysis.duration.toFixed(1)}초</div>
            <div>🔇 무음 비율: ${(audioAnalysis.silenceRatio * 100).toFixed(0)}%</div>
            <div>⚡ 에너지: ${(audioAnalysis.energy * 1000).toFixed(1)}</div>
        `;

        // 위치 계산 (자막 블록 위에 표시)
        const blockRect = blockElement.getBoundingClientRect();
        const timelineContainer = document.querySelector('.timeline-container');
        const containerRect = timelineContainer.getBoundingClientRect();

        infoPanel.style.top = (blockRect.top - containerRect.top - 80) + 'px';
        infoPanel.style.left = (blockRect.left - containerRect.left) + 'px';

        timelineContainer.appendChild(infoPanel);

        // 5초 후 자동 제거
        setTimeout(() => {
            infoPanel.remove();
        }, 5000);
    }

    getVolumeLevel(amplitude) {
        if (amplitude < 0.1) return '🔇 매우 낮음';
        if (amplitude < 0.3) return '🔉 낮음';
        if (amplitude < 0.6) return '🔊 보통';
        if (amplitude < 0.8) return '📢 높음';
        return '📯 매우 높음';
    }

    getSpeechQuality(analysis) {
        const { zeroCrossings, silenceRatio, energy } = analysis;

        // 음성 특성 분석
        if (silenceRatio > 0.7) return '🤐 거의 무음';
        if (zeroCrossings > 3000) return '📢 선명한 음성';
        if (zeroCrossings > 1500) return '🎤 일반 음성';
        if (zeroCrossings > 500) return '🔈 저음질';
        return '📻 배경음/음악';
    }

    // 🎨 파형 강도 기반 자막 시각화
    updateSubtitleAppearanceByAudio() {
        console.log('🎨 파형 강도 기반 자막 시각화 업데이트');

        if (!this.timeline.subtitleData) return;

        const subtitles = this.timeline.subtitleData.subtitles || [];

        subtitles.forEach((subtitle, index) => {
            const audioAnalysis = this.analyzeAudioForSubtitle(subtitle);
            if (!audioAnalysis) return;

            // 모든 트랙에서 해당 자막 블록 찾기
            const subtitleBlocks = document.querySelectorAll(`[data-index="${index}"]`);

            subtitleBlocks.forEach(block => {
                if (block.classList.contains('hybrid-subtitle')) {
                    this.applyAudioBasedStyling(block, audioAnalysis);
                }
            });
        });
    }

    applyAudioBasedStyling(block, analysis) {
        const { averageAmplitude, energy, silenceRatio } = analysis;

        // 음량에 따른 투명도 조정
        const opacity = Math.max(0.4, Math.min(1, averageAmplitude * 2));

        // 에너지에 따른 테두리 두께
        const borderWidth = Math.max(1, Math.min(4, energy * 10)) + 'px';

        // 무음 비율에 따른 시각적 처리
        if (silenceRatio > 0.8) {
            // 거의 무음인 경우 점선 테두리
            block.style.borderStyle = 'dashed';
            block.style.opacity = '0.6';
        } else {
            block.style.borderStyle = 'solid';
            block.style.opacity = opacity;
        }

        block.style.borderWidth = borderWidth;

        // 음량에 따른 그림자 효과
        const shadowIntensity = averageAmplitude * 10;
        block.style.boxShadow = `0 2px ${shadowIntensity}px rgba(0, 0, 0, 0.4)`;
    }

    // 🔄 실시간 파형-자막 동기화 시스템
    startRealtimeWaveformSync() {
        console.log('🔄 실시간 파형-자막 동기화 시작');

        // 기존 동기화 중지
        this.stopRealtimeWaveformSync();

        this.realtimeSyncInterval = setInterval(() => {
            this.updateCurrentSubtitleHighlight();
        }, 100); // 100ms마다 업데이트

        console.log('✅ 실시간 동기화 활성화');
    }

    stopRealtimeWaveformSync() {
        if (this.realtimeSyncInterval) {
            clearInterval(this.realtimeSyncInterval);
            this.realtimeSyncInterval = null;
        }

        // 현재 하이라이트 제거
        this.clearCurrentPlaybackHighlight();
        console.log('⏹️ 실시간 동기화 중지');
    }

    updateCurrentSubtitleHighlight() {
        if (!this.timeline.subtitleData) return;

        const currentTime = this.getCurrentPlaybackTime();
        if (currentTime === null) return;

        const subtitles = this.timeline.subtitleData.subtitles || [];

        // 현재 시간에 해당하는 자막 찾기
        const currentSubtitles = subtitles.filter(subtitle => {
            const startTime = Math.max(0, subtitle.start_time);
            const endTime = Math.max(0, subtitle.end_time);
            return currentTime >= startTime && currentTime <= endTime;
        });

        // 기존 실시간 하이라이트 제거
        this.clearCurrentPlaybackHighlight();

        currentSubtitles.forEach((subtitle, index) => {
            // 파형에서 현재 구간 하이라이트
            this.highlightCurrentWaveformSection(subtitle, currentTime);

            // 자막 블록에서 현재 자막 하이라이트
            this.highlightCurrentSubtitleBlock(subtitle);
        });

        // 현재 자막 텍스트 실시간 표시
        if (currentSubtitles.length > 0) {
            const mainSubtitle = currentSubtitles.find(s => !s.text.includes('[')) || currentSubtitles[0];
            this.showCurrentSubtitleText(mainSubtitle.text);
        } else {
            this.hideCurrentSubtitleText();
        }
    }

    getCurrentPlaybackTime() {
        // 비디오 플레이어에서 현재 시간 가져오기
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer && !videoPlayer.paused) {
            return videoPlayer.currentTime;
        }

        // 오디오 플레이어에서 현재 시간 가져오기
        const audioPlayer = document.getElementById('audio-player');
        if (audioPlayer && !audioPlayer.paused) {
            return audioPlayer.currentTime;
        }

        return null;
    }

    highlightCurrentWaveformSection(subtitle, currentTime) {
        const audioTrack = document.getElementById('audio-track');
        if (!audioTrack) return;

        const startTime = Math.max(0, subtitle.start_time);
        const endTime = Math.max(0, subtitle.end_time);
        const totalDuration = Math.max(this.timeline.duration, 60);

        // 현재 재생 위치 표시
        const currentPercent = (currentTime / totalDuration) * 100;
        const startPercent = (startTime / totalDuration) * 100;
        const endPercent = (endTime / totalDuration) * 100;

        // 현재 재생 구간 하이라이트
        const playbackHighlight = document.createElement('div');
        playbackHighlight.className = 'realtime-waveform-highlight';
        playbackHighlight.style.cssText = `
            position: absolute;
            left: ${startPercent}%;
            width: ${endPercent - startPercent}%;
            top: 0;
            bottom: 0;
            background: linear-gradient(90deg,
                rgba(255, 100, 100, 0.4) 0%,
                rgba(255, 150, 150, 0.6) 50%,
                rgba(255, 100, 100, 0.4) 100%);
            border: 2px solid rgba(255, 100, 100, 0.8);
            z-index: 18;
            pointer-events: none;
            animation: realtimePulse 1s ease-in-out infinite;
        `;

        // 현재 재생 위치 마커
        const playheadMarker = document.createElement('div');
        playheadMarker.className = 'realtime-playhead-marker';
        playheadMarker.style.cssText = `
            position: absolute;
            left: ${currentPercent}%;
            top: -5px;
            bottom: -5px;
            width: 3px;
            background: #ff3333;
            z-index: 20;
            pointer-events: none;
            box-shadow: 0 0 10px rgba(255, 51, 51, 0.8);
        `;

        audioTrack.appendChild(playbackHighlight);
        audioTrack.appendChild(playheadMarker);
    }

    highlightCurrentSubtitleBlock(subtitle) {
        const subtitleBlocks = document.querySelectorAll('.hybrid-subtitle');

        subtitleBlocks.forEach(block => {
            const blockIndex = parseInt(block.dataset.index);
            const blockSubtitle = this.timeline.subtitleData.subtitles[blockIndex];

            if (blockSubtitle &&
                blockSubtitle.start_time === subtitle.start_time &&
                blockSubtitle.end_time === subtitle.end_time &&
                blockSubtitle.text === subtitle.text) {

                block.classList.add('realtime-active');
            }
        });
    }

    showCurrentSubtitleText(text) {
        let realtimeDisplay = document.getElementById('realtime-subtitle-display');
        if (!realtimeDisplay) {
            realtimeDisplay = document.createElement('div');
            realtimeDisplay.id = 'realtime-subtitle-display';
            realtimeDisplay.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 18px;
                font-weight: bold;
                z-index: 1001;
                max-width: 90%;
                text-align: center;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
                border: 2px solid rgba(255, 100, 100, 0.8);
                backdrop-filter: blur(10px);
            `;
            document.body.appendChild(realtimeDisplay);
        }

        realtimeDisplay.textContent = text;
        realtimeDisplay.style.display = 'block';
    }

    hideCurrentSubtitleText() {
        const realtimeDisplay = document.getElementById('realtime-subtitle-display');
        if (realtimeDisplay) {
            realtimeDisplay.style.display = 'none';
        }
    }

    clearCurrentPlaybackHighlight() {
        // 실시간 하이라이트 제거
        document.querySelectorAll('.realtime-waveform-highlight').forEach(el => el.remove());
        document.querySelectorAll('.realtime-playhead-marker').forEach(el => el.remove());

        // 자막 블록 실시간 하이라이트 제거
        document.querySelectorAll('.hybrid-subtitle.realtime-active').forEach(block => {
            block.classList.remove('realtime-active');
        });
    }

    calculateSubtitleLayers(subtitles) {
        console.log('🧮 자막 레이어 계산 시작');
        const layers = new Array(subtitles.length).fill(0);
        const layerEndTimes = []; // 각 레이어의 마지막 종료 시간

        subtitles.forEach((subtitle, index) => {
            const startTime = Math.max(0, subtitle.start_time);
            const endTime = Math.max(0, subtitle.end_time);

            // 강제 지정된 레이어가 있는지 확인
            if (subtitle.forcedLayer !== undefined && subtitle.forcedLayer >= 0 && subtitle.forcedLayer <= 2) {
                layers[index] = subtitle.forcedLayer;
                // 강제 레이어의 종료 시간 업데이트
                if (!layerEndTimes[subtitle.forcedLayer]) {
                    layerEndTimes[subtitle.forcedLayer] = 0;
                }
                layerEndTimes[subtitle.forcedLayer] = Math.max(layerEndTimes[subtitle.forcedLayer], endTime);
                console.log(`자막 #${index + 1}: 강제 지정 레이어 ${subtitle.forcedLayer} 사용`);
                return;
            }

            // 적절한 레이어 찾기
            let assignedLayer = -1;

            // 기존 레이어에서 사용 가능한 것 찾기 (최대 3줄까지)
            for (let layer = 0; layer < Math.min(layerEndTimes.length, 3); layer++) {
                // 이 레이어의 마지막 자막이 현재 자막 시작 전에 끝나면 사용 가능
                if (layerEndTimes[layer] <= startTime) {
                    assignedLayer = layer;
                    layerEndTimes[layer] = endTime; // 레이어 종료 시간 업데이트
                    break;
                }
            }

            // 사용 가능한 레이어가 없고 3줄 미만이면 새 레이어 생성
            if (assignedLayer === -1 && layerEndTimes.length < 3) {
                assignedLayer = layerEndTimes.length;
                layerEndTimes.push(endTime);
            }

            // 3줄이 모두 차있으면 가장 빨리 끝나는 레이어에 강제 배치
            if (assignedLayer === -1) {
                let earliestEndTime = Math.min(...layerEndTimes);
                assignedLayer = layerEndTimes.indexOf(earliestEndTime);
                layerEndTimes[assignedLayer] = endTime;
            }

            layers[index] = assignedLayer;

            console.log(`자막 #${index + 1}: ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s → 레이어 ${assignedLayer}`);
        });

        const totalLayers = Math.min(Math.max(...layers) + 1, 3);
        console.log(`총 ${totalLayers}개 레이어 사용 (최대 3줄)`);
        return layers;
    }

    addLayerLegend(layers) {
        // 기존 범례 제거
        const existingLegend = document.querySelector('.layer-legend');
        if (existingLegend) {
            existingLegend.remove();
        }

        const maxLayer = Math.min(Math.max(...layers), 2); // 최대 3줄까지만 표시
        if (maxLayer === 0) return; // 레이어가 1개면 범례 불필요

        // 범례 컨테이너 생성
        const legend = document.createElement('div');
        legend.className = 'layer-legend';
        legend.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px;
            border-radius: 8px;
            font-size: 12px;
            z-index: 1000;
            border: 1px solid rgba(255, 255, 255, 0.3);
        `;

        const title = document.createElement('div');
        title.textContent = '📚 자막 레이어';
        title.style.cssText = `
            font-weight: bold;
            margin-bottom: 8px;
            color: #4CAF50;
        `;
        legend.appendChild(title);

        // 레이어별 색상 정의 (블록과 동일)
        const layerColors = [
            'rgba(0, 123, 255, 0.9)', // 레이어 0: 파란색
            'rgba(40, 167, 69, 0.9)', // 레이어 1: 초록색
            'rgba(255, 193, 7, 0.9)', // 레이어 2: 노란색
            'rgba(220, 53, 69, 0.9)', // 레이어 3: 빨간색
            'rgba(102, 16, 242, 0.9)', // 레이어 4: 보라색
            'rgba(255, 133, 27, 0.9)'  // 레이어 5: 주황색
        ];

        // 각 레이어에 대한 범례 항목 생성
        for (let i = 0; i <= maxLayer; i++) {
            const layerCount = layers.filter(l => l === i).length;
            const layerItem = document.createElement('div');
            layerItem.style.cssText = `
                display: flex;
                align-items: center;
                margin-bottom: 4px;
            `;

            const colorBox = document.createElement('div');
            colorBox.style.cssText = `
                width: 16px;
                height: 16px;
                background: ${layerColors[i % layerColors.length]};
                border: 1px solid white;
                border-radius: 3px;
                margin-right: 8px;
            `;

            const label = document.createElement('span');
            label.textContent = `레이어 ${i}: ${layerCount}개`;
            label.style.fontSize = '11px';

            layerItem.appendChild(colorBox);
            layerItem.appendChild(label);
            legend.appendChild(layerItem);
        }

        // 설명 추가
        const explanation = document.createElement('div');
        explanation.textContent = '겹치는 자막들을 층별로 표시';
        explanation.style.cssText = `
            font-size: 10px;
            color: rgba(255, 255, 255, 0.7);
            margin-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
            padding-top: 6px;
        `;
        legend.appendChild(explanation);

        // 타임라인 컨테이너에 추가
        const timelineContainer = document.getElementById('timeline-container');
        if (timelineContainer) {
            timelineContainer.appendChild(legend);
        }

        console.log(`📚 레이어 범례 생성됨: ${maxLayer + 1}개 레이어`);
    }

    createTestSubtitle(trackContent) {
        console.log('🧪 테스트 자막 생성 중...');

        // 테스트 자막 데이터
        const testSubtitles = [
            { start_time: 0, end_time: 3, text: "테스트 자막 1" },
            { start_time: 2.5, end_time: 5.5, text: "테스트 자막 2 (겹침)" },
            { start_time: 5, end_time: 8, text: "테스트 자막 3" }
        ];

        const layers = this.calculateSubtitleLayers(testSubtitles);

        testSubtitles.forEach((subtitle, index) => {
            const block = document.createElement('div');
            block.className = 'subtitle-block';

            const layer = Math.min(layers[index] || 0, 2); // 최대 3줄 (0, 1, 2)
            const layerHeight = 32;
            const topPosition = 5 + (layer * layerHeight);

            const startPercent = (subtitle.start_time / 10) * 100; // 10초 기준
            const widthPercent = ((subtitle.end_time - subtitle.start_time) / 10) * 100;

            // 기본 스타일 강제 적용
            block.style.cssText = `
                position: absolute;
                left: ${startPercent}%;
                width: ${Math.max(widthPercent, 15)}%;
                top: ${topPosition}px;
                height: 28px;
                background: linear-gradient(135deg, rgb(255, 100, 100), rgb(200, 50, 50));
                border: 2px solid white;
                border-radius: 8px;
                display: flex !important;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 12px;
                z-index: 10;
                box-shadow: 0 3px 10px rgba(0,0,0,0.5);
            `;

            block.textContent = `TEST ${index + 1}`;
            block.title = `테스트 자막 #${index + 1}: ${subtitle.text}`;

            trackContent.appendChild(block);
            console.log(`✅ 테스트 자막 ${index + 1} 생성됨`);
        });

        console.log('🎯 테스트 자막 생성 완료');
    }

    forceDisplayTestSubtitles() {
        console.log('🎯 강제 자막 표시 실행');

        const subtitleTrack = document.getElementById('subtitle-track');
        const trackContent = subtitleTrack ? subtitleTrack.querySelector('.track-content') : null;

        if (!trackContent) {
            console.error('❌ 자막 트랙을 찾을 수 없습니다');
            return;
        }

        // 기존 내용 제거
        trackContent.innerHTML = '';

        // 테스트 자막 강제 생성
        this.createTestSubtitle(trackContent);

        // DOM 검증
        setTimeout(() => {
            this.validateSubtitleDOM(trackContent);
        }, 100);

        this.showSuccess('강제 테스트 자막이 표시되었습니다');
    }

    validateSubtitleDOM(trackContent) {
        console.log('🔍 DOM 검증 시작');

        const subtitleTrack = document.getElementById('subtitle-track');
        const blocks = trackContent.querySelectorAll('.subtitle-block');

        console.log('DOM 상태:', {
            subtitleTrack: subtitleTrack,
            trackContent: trackContent,
            blocks: blocks,
            blocksCount: blocks.length,
            trackContentParent: trackContent.parentElement,
            trackVisible: subtitleTrack ? getComputedStyle(subtitleTrack).display : 'null',
            trackContentVisible: getComputedStyle(trackContent).display,
            trackContentSize: {
                width: trackContent.offsetWidth,
                height: trackContent.offsetHeight,
                scrollWidth: trackContent.scrollWidth,
                scrollHeight: trackContent.scrollHeight
            }
        });

        // 각 블록의 상태 확인
        blocks.forEach((block, index) => {
            const rect = block.getBoundingClientRect();
            const computed = getComputedStyle(block);

            console.log(`블록 #${index + 1} 상태:`, {
                element: block,
                position: {
                    left: block.style.left,
                    top: block.style.top,
                    width: block.style.width,
                    height: block.style.height
                },
                computed: {
                    position: computed.position,
                    display: computed.display,
                    visibility: computed.visibility,
                    opacity: computed.opacity,
                    zIndex: computed.zIndex
                },
                boundingRect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    visible: rect.width > 0 && rect.height > 0
                },
                inViewport: rect.top >= 0 && rect.left >= 0 &&
                           rect.bottom <= window.innerHeight &&
                           rect.right <= window.innerWidth
            });
        });

        // 자막 트랙 컨테이너의 스크롤 상태
        const timelineContainer = document.getElementById('timeline-container');
        if (timelineContainer) {
            console.log('타임라인 컨테이너 스크롤:', {
                scrollLeft: timelineContainer.scrollLeft,
                scrollTop: timelineContainer.scrollTop,
                scrollWidth: timelineContainer.scrollWidth,
                scrollHeight: timelineContainer.scrollHeight,
                clientWidth: timelineContainer.clientWidth,
                clientHeight: timelineContainer.clientHeight
            });
        }
    }

    selectSubtitleBlock(block) {
        // 기존 선택 해제
        document.querySelectorAll('.subtitle-block.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // 새로운 블록 선택
        block.classList.add('selected');
    }

    showSubtitleEditInfo(subtitle, index) {
        // 선택된 자막의 편집 정보를 표시
        const infoText = `선택된 자막 #${index + 1}: ${this.formatSubtitleTime(subtitle.start_time)} → ${this.formatSubtitleTime(subtitle.end_time)}`;
        this.showInfo(infoText);

        // 콘솔에 상세 정보 출력
        console.log('선택된 자막 구간:', {
            번호: index + 1,
            시작시간: subtitle.start_time,
            종료시간: subtitle.end_time,
            텍스트: subtitle.text,
            길이: subtitle.end_time - subtitle.start_time
        });
    }

    editSubtitleSegment(subtitle, index) {
        // 매개변수가 잘못 전달된 경우 처리
        if (typeof subtitle === 'number') {
            // subtitle이 실제로는 index인 경우
            index = subtitle;
            subtitle = this.timeline.subtitleData.subtitles[index];
        }

        if (!subtitle) {
            console.error('자막 데이터를 찾을 수 없습니다:', index);
            return;
        }

        // 자막 구간 편집 다이얼로그 표시
        const currentStart = subtitle.start_time || 0;
        const currentEnd = subtitle.end_time || 0;

        const newStartTime = prompt(
            `자막 #${index + 1} 시작 시간을 입력하세요 (초):`,
            currentStart.toFixed(2)
        );

        if (newStartTime === null) return; // 취소

        const newEndTime = prompt(
            `자막 #${index + 1} 종료 시간을 입력하세요 (초):`,
            currentEnd.toFixed(2)
        );

        if (newEndTime === null) return; // 취소

        const startTime = parseFloat(newStartTime);
        const endTime = parseFloat(newEndTime);

        // 유효성 검사
        if (isNaN(startTime) || isNaN(endTime)) {
            this.showError('올바른 숫자를 입력하세요.');
            return;
        }

        if (startTime >= endTime) {
            this.showError('시작 시간은 종료 시간보다 작아야 합니다.');
            return;
        }

        if (startTime < 0) {
            this.showError('시작 시간은 0 이상이어야 합니다.');
            return;
        }

        // 자막 시간 업데이트
        subtitle.start_time = startTime;
        subtitle.end_time = endTime;

        // 타임라인 다시 그리기
        this.renderHybridSubtitleTracks();

        this.showSuccess(`자막 #${index + 1} 구간이 수정되었습니다: ${this.formatSubtitleTime(startTime)} → ${this.formatSubtitleTime(endTime)}`);
    }

    showSubtitleContextMenu(event, subtitle, index) {
        // 매개변수가 2개만 전달된 경우 처리 (하이브리드 자막에서 호출)
        if (typeof subtitle === 'number' && index === undefined) {
            index = subtitle;
            subtitle = this.timeline.subtitleData.subtitles[index];
        }

        if (!subtitle || index === undefined) {
            console.error('자막 데이터 또는 인덱스가 없습니다:', { subtitle, index });
            return;
        }

        // 기존 컨텍스트 메뉴 제거
        const existingMenu = document.querySelector('.subtitle-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // 컨텍스트 메뉴 생성
        const menu = document.createElement('div');
        menu.className = 'subtitle-context-menu';
        menu.style.position = 'absolute';
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        menu.style.background = 'rgba(20, 30, 50, 0.95)';
        menu.style.border = '1px solid #4a9eff';
        menu.style.borderRadius = '8px';
        menu.style.padding = '8px';
        menu.style.zIndex = '1000';
        menu.style.minWidth = '180px';
        menu.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';

        const menuItems = [
            { text: '🎯 이 구간으로 이동', action: () => this.seekToTime(subtitle.start_time) },
            { text: '✏️ 구간 시간 편집', action: () => this.editSubtitleSegment(subtitle, index) },
            { text: '1️⃣ 메인트랙 1줄로 이동', action: () => this.moveSubtitleToLayer(index, 0) },
            { text: '2️⃣ 메인트랙 2줄로 이동', action: () => this.moveSubtitleToLayer(index, 1) },
            { text: '3️⃣ 메인트랙 3줄로 이동', action: () => this.moveSubtitleToLayer(index, 2) },
            { text: '🔄 메인 트랙으로 이동', action: () => { this.moveSubtitleToTrack(index, 'main'); } },
            { text: '🌍 번역 트랙으로 이동', action: () => { this.moveSubtitleToTrack(index, 'translation'); } },
            { text: '📝 설명 트랙으로 이동', action: () => { this.moveSubtitleToTrack(index, 'description'); } },
            { text: '➕ 앞에 구간 추가', action: () => this.addSubtitleBefore(index) },
            { text: '➕ 뒤에 구간 추가', action: () => this.addSubtitleAfter(index) },
            { text: '✂️ 구간 분할', action: () => this.splitSubtitle(subtitle, index) },
            { text: '🗑️ 구간 삭제', action: () => this.deleteSubtitle(index) }
        ];

        menuItems.forEach((item, i) => {
            const menuItem = document.createElement('div');
            menuItem.textContent = item.text;
            menuItem.style.padding = '6px 10px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.color = '#ffffff';
            menuItem.style.borderRadius = '4px';
            menuItem.style.fontSize = '13px';

            if (i > 0) {
                menuItem.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
            }

            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = 'rgba(74, 158, 255, 0.3)';
            });

            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'transparent';
            });

            menuItem.addEventListener('click', () => {
                item.action();
                menu.remove();
            });

            menu.appendChild(menuItem);
        });

        document.body.appendChild(menu);

        // 메뉴 외부 클릭 시 닫기
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    }

    // 자막을 다른 트랙으로 이동
    moveSubtitleToTrack(index, targetTrack) {
        if (!this.timeline.subtitleData || !this.timeline.subtitleData.subtitles) {
            console.error('자막 데이터가 없습니다');
            return;
        }

        const subtitle = this.timeline.subtitleData.subtitles[index];
        if (!subtitle) {
            console.error('해당 인덱스의 자막을 찾을 수 없습니다:', index);
            return;
        }

        // 현재 트랙에서 자막 제거
        const currentTrackType = this.getCurrentTrackType(index);
        this.removeSubtitleFromTrack(index, currentTrackType);

        // 목표 트랙으로 이동
        this.addSubtitleToTrack(subtitle, targetTrack);

        // 트랙 재렌더링
        this.renderHybridSubtitles();

        console.log(`자막 #${index + 1}을(를) ${currentTrackType}에서 ${targetTrack} 트랙으로 이동했습니다`);

        // 성공 메시지 표시
        this.showInfo(`자막 #${index + 1}이(가) ${this.getTrackDisplayName(targetTrack)} 트랙으로 이동되었습니다`);
    }

    // 현재 자막이 속한 트랙 찾기
    getCurrentTrackType(index) {
        // DOM에서 해당 자막 블록을 찾아서 트랙 타입 확인
        const blocks = document.querySelectorAll(`[data-index="${index}"]`);
        for (let block of blocks) {
            if (block.dataset.trackType) {
                return block.dataset.trackType;
            }
        }
        return 'main'; // 기본값
    }

    // 트랙에서 자막 제거
    removeSubtitleFromTrack(index, trackType) {
        const blocks = document.querySelectorAll(`[data-index="${index}"][data-track-type="${trackType}"]`);
        blocks.forEach(block => block.remove());
    }

    // 트랙에 자막 추가
    addSubtitleToTrack(subtitle, trackType) {
        // 자막 데이터에 트랙 정보 추가
        subtitle.trackType = trackType;
    }

    // 트랙 표시 이름 반환
    getTrackDisplayName(trackType) {
        const trackNames = {
            'main': '메인',
            'translation': '번역',
            'description': '설명'
        };
        return trackNames[trackType] || trackType;
    }

    // 자막을 특정 레이어로 이동
    moveSubtitleToLayer(index, targetLayer) {
        if (!this.timeline.subtitleData || !this.timeline.subtitleData.subtitles) {
            console.error('자막 데이터가 없습니다');
            return;
        }

        const subtitle = this.timeline.subtitleData.subtitles[index];
        if (!subtitle) {
            console.error('해당 인덱스의 자막을 찾을 수 없습니다:', index);
            return;
        }

        // 현재 자막 블록 찾기
        const currentBlock = document.querySelector(`[data-index="${index}"]`);
        if (!currentBlock) {
            console.error('자막 블록을 찾을 수 없습니다:', index);
            return;
        }

        // 새로운 레이어 위치 계산
        const layerHeight = 32;
        const newTop = 5 + (targetLayer * layerHeight);

        // 블록 위치 업데이트
        currentBlock.style.top = newTop + 'px';

        // 레이어 색상 업데이트
        this.updateBlockLayerColor(currentBlock, targetLayer);

        // 데이터 업데이트
        currentBlock.dataset.layer = targetLayer;

        // 자막 데이터에도 레이어 정보 저장
        subtitle.forcedLayer = targetLayer;

        console.log(`자막 #${index + 1}을(를) 레이어 ${targetLayer} (${targetLayer + 1}줄)로 이동했습니다`);

        // 성공 메시지 표시
        this.showInfo(`자막 #${index + 1}이(가) ${targetLayer + 1}줄로 이동되었습니다`);

        // 충돌 검사 및 경고
        this.checkLayerCollisions(index, targetLayer);
    }

    // 레이어 충돌 검사
    checkLayerCollisions(index, layer) {
        const subtitle = this.timeline.subtitleData.subtitles[index];
        const startTime = subtitle.start_time;
        const endTime = subtitle.end_time;

        // 같은 레이어의 다른 자막들과 시간 겹침 확인
        const overlappingSubtitles = [];

        document.querySelectorAll(`[data-layer="${layer}"]`).forEach(block => {
            const blockIndex = parseInt(block.dataset.index);
            if (blockIndex !== index) {
                const blockSubtitle = this.timeline.subtitleData.subtitles[blockIndex];
                if (blockSubtitle &&
                    ((startTime >= blockSubtitle.start_time && startTime < blockSubtitle.end_time) ||
                     (endTime > blockSubtitle.start_time && endTime <= blockSubtitle.end_time) ||
                     (startTime <= blockSubtitle.start_time && endTime >= blockSubtitle.end_time))) {
                    overlappingSubtitles.push(blockIndex + 1);
                }
            }
        });

        if (overlappingSubtitles.length > 0) {
            this.showWarning(`⚠️ 자막 #${overlappingSubtitles.join(', #')}와 시간이 겹칩니다`);
        }
    }

    addSubtitleBefore(index) {
        if (!this.timeline.subtitleData || !this.timeline.subtitleData.subtitles) return;

        const subtitles = this.timeline.subtitleData.subtitles;
        const prevEndTime = index > 0 ? subtitles[index - 1].end_time : 0;
        const currentStartTime = subtitles[index].start_time;

        const newStartTime = prevEndTime;
        const newEndTime = Math.min(currentStartTime, prevEndTime + 2); // 기본 2초 길이

        const newSubtitle = {
            start_time: newStartTime,
            end_time: newEndTime,
            text: '새 자막'
        };

        subtitles.splice(index, 0, newSubtitle);
        this.renderHybridSubtitleTracks();
        this.showSuccess(`자막 #${index + 1} 앞에 새 구간이 추가되었습니다.`);
    }

    addSubtitleAfter(index) {
        if (!this.timeline.subtitleData || !this.timeline.subtitleData.subtitles) return;

        const subtitles = this.timeline.subtitleData.subtitles;
        const currentEndTime = subtitles[index].end_time;
        const nextStartTime = index < subtitles.length - 1 ? subtitles[index + 1].start_time : currentEndTime + 5;

        const newStartTime = currentEndTime;
        const newEndTime = Math.min(nextStartTime, currentEndTime + 2); // 기본 2초 길이

        const newSubtitle = {
            start_time: newStartTime,
            end_time: newEndTime,
            text: '새 자막'
        };

        subtitles.splice(index + 1, 0, newSubtitle);
        this.renderHybridSubtitleTracks();
        this.showSuccess(`자막 #${index + 1} 뒤에 새 구간이 추가되었습니다.`);
    }

    splitSubtitle(subtitle, index) {
        if (!this.timeline.subtitleData || !this.timeline.subtitleData.subtitles) return;

        const splitTime = prompt(
            `자막 #${index + 1}을 분할할 시간을 입력하세요 (초):`,
            ((subtitle.start_time + subtitle.end_time) / 2).toFixed(2)
        );

        if (splitTime === null) return;

        const splitTimeNum = parseFloat(splitTime);
        if (isNaN(splitTimeNum) || splitTimeNum <= subtitle.start_time || splitTimeNum >= subtitle.end_time) {
            this.showError('분할 시간은 자막 구간 내에 있어야 합니다.');
            return;
        }

        const subtitles = this.timeline.subtitleData.subtitles;

        // 원본 자막 시간 단축
        subtitle.end_time = splitTimeNum;

        // 새 자막 생성
        const newSubtitle = {
            start_time: splitTimeNum,
            end_time: subtitles[index].end_time, // 원래 종료 시간 사용
            text: subtitle.text + ' (분할됨)'
        };

        subtitles.splice(index + 1, 0, newSubtitle);
        this.renderHybridSubtitleTracks();
        this.showSuccess(`자막 #${index + 1}이 ${this.formatSubtitleTime(splitTimeNum)}에서 분할되었습니다.`);
    }

    deleteSubtitle(index) {
        if (!this.timeline.subtitleData || !this.timeline.subtitleData.subtitles) return;

        const subtitles = this.timeline.subtitleData.subtitles;
        if (index < 0 || index >= subtitles.length) return;

        const confirmed = confirm(`자막 #${index + 1}을 삭제하시겠습니까?\n"${subtitles[index].text}"`);
        if (!confirmed) return;

        subtitles.splice(index, 1);
        this.renderHybridSubtitleTracks();
        this.showSuccess(`자막 #${index + 1}이 삭제되었습니다.`);
    }

    // 디버깅을 위한 테스트 함수
    testSubtitleNumberDisplay() {
        console.log('🧪 자막 번호 표시 테스트 시작');

        const subtitleTrack = document.getElementById('subtitle-track');
        const trackContent = subtitleTrack ? subtitleTrack.querySelector('.track-content') : null;

        console.log('자막 트랙 요소:', subtitleTrack);
        console.log('트랙 콘텐츠:', trackContent);

        if (!trackContent) {
            console.error('❌ track-content를 찾을 수 없음');
            console.log('사용 가능한 요소들:');
            console.log('- subtitle-track:', document.getElementById('subtitle-track'));
            console.log('- .timeline-track:', document.querySelectorAll('.timeline-track'));
            return;
        }

        // 테스트용 자막 블록 생성
        const testBlock = document.createElement('div');
        testBlock.className = 'subtitle-block';
        testBlock.style.left = '10%';
        testBlock.style.width = '20%';
        testBlock.style.position = 'absolute';
        testBlock.style.top = '5px';
        testBlock.style.height = '50px';

        // 테스트 번호 요소
        const testNumber = document.createElement('div');
        testNumber.className = 'subtitle-number';
        testNumber.textContent = '#TEST';
        testNumber.style.setProperty('display', 'block', 'important');
        testNumber.style.setProperty('background-color', 'rgb(255, 0, 0)', 'important');
        testNumber.style.setProperty('color', 'white', 'important');
        testNumber.style.setProperty('font-size', '12px', 'important');
        testNumber.style.setProperty('padding', '5px', 'important');
        testNumber.style.setProperty('z-index', '1000', 'important');

        testBlock.appendChild(testNumber);
        trackContent.appendChild(testBlock);

        console.log('✅ 테스트 블록 추가됨');

        // 3초 후 제거
        setTimeout(() => {
            testBlock.remove();
            console.log('🗑️ 테스트 블록 제거됨');
        }, 3000);
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
            console.log('📁 요청할 오디오 파일 경로:', audioPath);

            // 파일 경로 검증
            if (!audioPath || audioPath.trim() === '') {
                throw new Error('오디오 파일 경로가 비어있습니다');
            }

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
                const errorText = await response.text();
                console.error('HTTP 에러 응답:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            console.log('📊 서버 파형 데이터 받음:', data);

            if (data.status === 'success' && data.waveform_data) {
                // 실제 파형 데이터로 그리기
                this.renderRealWaveformData(ctx, canvas, data.waveform_data, audioPath);
                console.log('✅ 실제 파형 데이터로 렌더링 완료');

                // 성공 시 즉시 return하여 fallback이 호출되지 않도록
                return;
            } else {
                console.error('서버 응답 문제:', data);
                throw new Error(`서버에서 파형 데이터를 받지 못함: ${JSON.stringify(data)}`);
            }

        } catch (error) {
            console.error('❌ 실제 파형 분석 실패:', error);
            console.error('오류 상세:', {
                message: error.message,
                audioPath: audioPath,
                stack: error.stack
            });

            // 에러를 사용자에게도 표시
            this.showError(`음성 파형 분석 실패: ${error.message}`);
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
        console.log('🖼️ 실제 파형 텍스트 표시됨:', fileName);

        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.fillText(`실제 오디오 분석 완료 (${waveformData.length} 샘플)`, 10, canvas.height - 10);

        // 경계선
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        console.log('✅ 실제 파형 렌더링 완료');

        // 실제 파형이 성공적으로 그려졌음을 표시
        console.log('🎯 황금색 실제 파형 표시 완료:', fileName);
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
        ctx.fillText(`🎵 ${fileName} (데모 파형)`, 10, 20);
        console.log('🖼️ 데모 파형 텍스트 표시됨:', fileName);

        ctx.font = '10px Arial';
        ctx.fillStyle = waveformColor;
        ctx.fillText('⚠️ 실제 파형 분석 실패 - 콘솔 확인 필요', 10, canvas.height - 10);

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
        this.renderHybridSubtitleTracks();
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

    // 화자 인식 관련 메서드들
    setupSpeakerRecognition() {
        console.log('🎭 화자 인식 시스템 설정');

        // 화자 인식 시작 버튼
        const startBtn = document.getElementById('start-speaker-recognition');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startSpeakerRecognition();
            });
        }

        // 트랙 배치 적용 버튼
        const applyBtn = document.getElementById('apply-speaker-mapping');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applySpeakerMapping();
            });
        }
    }

    async startSpeakerRecognition() {
        console.log('🎭 화자 인식 시작');

        // 인식 방법 확인
        const methodRadio = document.querySelector('input[name="recognition-method"]:checked');
        const method = methodRadio ? methodRadio.value : 'text';

        console.log(`🔍 선택된 인식 방법: ${method}`);

        if (method === 'text') {
            await this.startTextBasedRecognition();
        } else if (method === 'audio') {
            await this.startAudioBasedRecognition();
        }
    }

    async startTextBasedRecognition() {
        console.log('📝 텍스트 기반 화자 인식 시작');

        // 선택된 SRT 파일 확인
        const selectedFiles = this.getSelectedSrtFiles();
        if (selectedFiles.length === 0) {
            alert('🎭 SRT 파일을 먼저 선택해주세요');
            return;
        }

        const srtFile = selectedFiles[0];

        try {
            // 화자 인식 API 호출
            const response = await fetch('/api/analysis/speaker-recognition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: srtFile
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayDetectedSpeakers(result.speakers);
                this.currentSpeakers = result.speakers;
            } else {
                throw new Error('화자 인식 실패');
            }

        } catch (error) {
            console.error('화자 인식 에러:', error);
            alert('❌ 화자 인식 중 오류가 발생했습니다');
        }
    }

    async startAudioBasedRecognition() {
        console.log('🎵 음성 기반 화자 인식 시작');

        // 선택된 파일들 확인
        const selectedFiles = this.getSelectedFiles(); // 모든 파일 타입
        const audioFiles = selectedFiles.filter(f =>
            f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.webm') || f.endsWith('.mp4')
        );
        const srtFiles = this.getSelectedSrtFiles();

        if (audioFiles.length === 0) {
            alert('🎵 음성 파일(.wav, .mp3, .webm, .mp4)을 먼저 선택해주세요');
            return;
        }

        const audioFile = audioFiles[0];
        const srtFile = srtFiles.length > 0 ? srtFiles[0] : null;

        try {
            // 진행 상황 표시
            const startBtn = document.getElementById('start-speaker-recognition');
            const originalText = startBtn.textContent;
            startBtn.textContent = '🎵 음성 분석 중...';
            startBtn.disabled = true;

            // 음성 기반 화자 인식 API 호출
            const response = await fetch('/api/analysis/audio-speaker-recognition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    audio_path: audioFile,
                    srt_path: srtFile,
                    n_speakers: null // 자동 감지
                })
            });

            // 응답 상태 확인
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`서버 오류 (${response.status}): ${errorText.substring(0, 100)}...`);
            }

            const result = await response.json();

            if (result.status === 'success') {
                // SRT 파일 경로 저장
                this.currentSrtFile = srtFile;

                this.displayAudioBasedSpeakers(result.speakers, result.analysis_method);
                this.currentSpeakers = result.speakers;

                // 자막이 함께 분석된 경우 분류된 자막 정보도 저장
                if (result.classified_subtitles) {
                    this.classifiedSubtitles = result.classified_subtitles;
                }
            } else {
                throw new Error(result.error || '음성 기반 화자 인식 실패');
            }

            // 버튼 복원
            startBtn.textContent = originalText;
            startBtn.disabled = false;

        } catch (error) {
            console.error('음성 기반 화자 인식 에러:', error);
            alert('❌ 음성 기반 화자 인식 중 오류가 발생했습니다: ' + error.message);

            // 버튼 복원
            const startBtn = document.getElementById('start-speaker-recognition');
            startBtn.textContent = '🎭 화자 인식 시작';
            startBtn.disabled = false;
        }
    }

    displayAudioBasedSpeakers(speakers, analysisMethod) {
        console.log('🎵 음성 기반 화자 표시:', speakers);

        const speakersSection = document.getElementById('detected-speakers');
        const speakersGrid = document.getElementById('speakers-grid');

        speakersGrid.innerHTML = '';

        // 화자별 색상 매핑 생성
        const speakerColors = this.generateSpeakerColors(Object.keys(speakers));

        // 화자별 카드 생성
        Object.entries(speakers).forEach(([speakerName, speakerData]) => {
            const speakerColor = speakerColors[speakerName];
            const speakerCard = document.createElement('div');
            speakerCard.className = 'speaker-card audio-based';
            speakerCard.style.borderLeft = `4px solid ${speakerColor}`;

            speakerCard.innerHTML = `
                <div class="speaker-header">
                    <h5 style="color: ${speakerColor}">🎵 ${speakerName}</h5>
                    <span class="speaker-count">${speakerData.subtitle_count || speakerData.window_count}개 구간</span>
                </div>
                <div class="speaker-stats">
                    <div class="stat-item">
                        <span class="stat-label">평균 피치:</span>
                        <span class="stat-value">${speakerData.avg_pitch ? speakerData.avg_pitch.toFixed(1) + 'Hz' : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">음성 에너지:</span>
                        <span class="stat-value">${speakerData.avg_energy ? speakerData.avg_energy.toFixed(3) : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">총 시간:</span>
                        <span class="stat-value">${speakerData.total_duration ? speakerData.total_duration.toFixed(1) + '초' : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">스펙트럼:</span>
                        <span class="stat-value">${speakerData.avg_spectral_centroid ? speakerData.avg_spectral_centroid.toFixed(0) + 'Hz' : 'N/A'}</span>
                    </div>
                </div>
                <div class="speaker-subtitles" id="speaker-subtitles-${speakerName}">
                    <div class="subtitle-header">
                        <strong>📝 실제 대사 (시간순):</strong>
                        <button class="toggle-all-btn" onclick="app.toggleAllSubtitles('${speakerName}')" style="background: ${speakerColor}">
                            모두 선택/해제
                        </button>
                    </div>
                    <div class="subtitle-list" style="max-height: 200px; overflow-y: auto;">
                        <!-- 실제 자막들이 여기에 추가됩니다 -->
                    </div>
                </div>
                <div class="analysis-badge">
                    <span class="badge audio-badge">🎵 음성 분석</span>
                </div>
            `;

            speakersGrid.appendChild(speakerCard);

            // 해당 화자의 자막들을 시간순으로 정렬해서 추가
            this.addSpeakerSubtitlesFromSRT(speakerName, speakerData, speakerColor);
        });

        // 실제 SRT 파일 내용을 시간순으로 표시
        this.displayAllSRTSubtitlesWithSpeakers(speakers);

        // 자막별 상세 분석 결과 추가
        if (this.classifiedSubtitles && Array.isArray(this.classifiedSubtitles)) {
            this.displaySubtitleDetailsWithTrackSelection(this.classifiedSubtitles);
        }

        speakersSection.style.display = 'block';
        this.setupSpeakerTrackMapping(speakers);
    }

    displaySubtitleDetailsWithTrackSelection(subtitles) {
        console.log('📝 자막별 상세 분석 표시:', subtitles);

        const speakersSection = document.getElementById('detected-speakers');

        // 자막 상세 분석 섹션 추가
        const detailsSection = document.createElement('div');
        detailsSection.className = 'subtitle-details-section';
        detailsSection.innerHTML = `
            <div class="section-header">
                <h4>📝 자막별 분석 결과 및 트랙 선택</h4>
                <p>각 자막의 화자 인식 결과를 확인하고 필요시 수동으로 트랙을 변경할 수 있습니다.</p>
            </div>
            <div class="subtitle-details-container" id="subtitle-details-container">
                <!-- 자막 상세 내용이 여기에 추가됩니다 -->
            </div>
        `;

        speakersSection.appendChild(detailsSection);

        const container = document.getElementById('subtitle-details-container');

        subtitles.forEach((subtitle, index) => {
            const detailCard = document.createElement('div');
            detailCard.className = 'subtitle-detail-card';

            const formatTime = (seconds) => {
                const minutes = Math.floor(seconds / 60);
                const secs = (seconds % 60).toFixed(1);
                return `${minutes}:${secs.padStart(4, '0')}`;
            };

            detailCard.innerHTML = `
                <div class="subtitle-detail-header">
                    <span class="subtitle-number">#${index + 1}</span>
                    <span class="subtitle-time">${formatTime(subtitle.start_time)} → ${formatTime(subtitle.end_time)}</span>
                    <span class="subtitle-duration">(${(subtitle.end_time - subtitle.start_time).toFixed(1)}초)</span>
                </div>
                <div class="subtitle-content">
                    <div class="subtitle-text">"${subtitle.text}"</div>
                </div>
                <div class="subtitle-analysis">
                    <div class="analysis-before">
                        <strong>🔍 분석 결과:</strong>
                        <span class="detected-speaker">${subtitle.speaker_name || '미분류'}</span>
                        ${subtitle.speaker_id !== undefined ? `<span class="speaker-confidence">(ID: ${subtitle.speaker_id})</span>` : ''}
                    </div>
                    <div class="track-selection">
                        <label for="track-select-${index}">🎯 트랙 배치:</label>
                        <select id="track-select-${index}" class="subtitle-track-select" data-subtitle-index="${index}">
                            <option value="main" ${this.getSubtitleAutoAssignedTrack(subtitle) === 'main' ? 'selected' : ''}>📝 메인 자막</option>
                            <option value="translation" ${this.getSubtitleAutoAssignedTrack(subtitle) === 'translation' ? 'selected' : ''}>🌐 번역 자막</option>
                            <option value="description" ${this.getSubtitleAutoAssignedTrack(subtitle) === 'description' ? 'selected' : ''}>🔊 설명 자막</option>
                            <option value="unassigned" ${this.getSubtitleAutoAssignedTrack(subtitle) === 'unassigned' ? 'selected' : ''}>❓ 미분류</option>
                        </select>
                        <button class="apply-track-btn" onclick="app.applySingleSubtitleTrack(${index})" title="이 자막만 변경 적용">
                            ✅ 적용
                        </button>
                    </div>
                </div>
            `;

            container.appendChild(detailCard);
        });

        // 일괄 적용 버튼 추가
        const batchActions = document.createElement('div');
        batchActions.className = 'batch-actions';
        batchActions.innerHTML = `
            <button class="btn btn-primary" onclick="app.applyAllSubtitleTracks()">
                🎯 모든 변경사항 일괄 적용
            </button>
            <button class="btn btn-secondary" onclick="app.resetAllSubtitleTracks()">
                🔄 모든 선택 초기화
            </button>
        `;

        container.appendChild(batchActions);
    }

    getSubtitleCurrentTrack(subtitle) {
        // 현재 자막이 어느 트랙에 배치되어 있는지 확인
        if (!this.timeline.speakerClassifiedSubtitles) return 'unassigned';

        for (const [track, trackSubtitles] of Object.entries(this.timeline.speakerClassifiedSubtitles)) {
            if (trackSubtitles.some(s => s.start_time === subtitle.start_time && s.text === subtitle.text)) {
                return track;
            }
        }
        return 'unassigned';
    }

    getSubtitleAutoAssignedTrack(subtitle) {
        // 화자 기반 자동 배치와 현재 트랙 상태를 모두 고려하여 트랙 결정

        // 1. 현재 명시적으로 배치된 트랙이 있으면 우선 사용
        const currentTrack = this.getSubtitleCurrentTrack(subtitle);
        if (currentTrack && currentTrack !== 'unassigned') {
            return currentTrack;
        }

        // 2. 화자 기반 자동 배치 확인
        if (this.currentSpeakers && subtitle.speaker_name) {
            const speakerData = this.currentSpeakers[subtitle.speaker_name];
            if (speakerData && speakerData.assigned_track && speakerData.assigned_track !== 'unassigned') {
                return speakerData.assigned_track;
            }
        }

        // 3. 화자별 기본 트랙 규칙 적용
        if (subtitle.speaker_name) {
            switch (subtitle.speaker_name) {
                case '화자1':
                    return 'main';      // 화자1은 메인 자막
                case '화자2':
                    return 'translation'; // 화자2는 번역 자막
                case '화자3':
                    return 'description'; // 화자3은 설명 자막
                default:
                    return 'unassigned';  // 기타는 미분류
            }
        }

        return 'unassigned';
    }

    getSelectedFiles() {
        // 모든 선택된 파일들 반환 (SRT 뿐만 아니라 모든 타입)
        const checkboxes = document.querySelectorAll('.file-checkbox:checked');
        const files = [];

        checkboxes.forEach(checkbox => {
            files.push(checkbox.value);
        });

        return files;
    }

    displayDetectedSpeakers(speakers) {
        console.log('🎯 감지된 화자 표시:', speakers);

        const speakersSection = document.getElementById('detected-speakers');
        const speakersGrid = document.getElementById('speakers-grid');

        speakersGrid.innerHTML = '';

        Object.entries(speakers).forEach(([speakerName, speakerData]) => {
            const speakerCard = document.createElement('div');
            speakerCard.className = 'speaker-card';
            speakerCard.innerHTML = `
                <div class="speaker-header">
                    <h5>${speakerName}</h5>
                    <span class="speaker-count">${speakerData.subtitle_count}개 대사</span>
                </div>
                <div class="speaker-stats">
                    <div class="stat-item">
                        <span class="stat-label">평균 길이:</span>
                        <span class="stat-value">${speakerData.avg_chars.toFixed(0)}자</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">말투:</span>
                        <span class="stat-value">${speakerData.characteristics.politeness_level}</span>
                    </div>
                </div>
                <div class="speaker-samples">
                    <strong>샘플 대사:</strong>
                    ${speakerData.sample_texts.map(text => `<div class="sample-text">"${text}"</div>`).join('')}
                </div>
            `;

            speakersGrid.appendChild(speakerCard);
        });

        speakersSection.style.display = 'block';
        this.setupSpeakerTrackMapping(speakers);
    }

    setupSpeakerTrackMapping(speakers) {
        console.log('🎚️ 트랙 매핑 설정');

        const mappingSection = document.getElementById('speaker-track-mapping');
        const mappingGrid = document.getElementById('mapping-grid');

        mappingGrid.innerHTML = '';

        const tracks = [
            { value: 'main', label: '📝 메인 자막', color: '#007bff' },
            { value: 'translation', label: '🌐 번역 자막', color: '#28a745' },
            { value: 'description', label: '🔊 설명 자막', color: '#ffc107' }
        ];

        Object.entries(speakers).forEach(([speakerName, speakerData], index) => {
            const mappingRow = document.createElement('div');
            mappingRow.className = 'mapping-row';

            const defaultTrack = index < tracks.length ? tracks[index].value : 'main';

            mappingRow.innerHTML = `
                <div class="speaker-info">
                    <strong>${speakerName}</strong>
                    <span class="subtitle-count">(${speakerData.subtitle_count}개 대사)</span>
                </div>
                <div class="track-selector">
                    <label>트랙 선택:</label>
                    <select class="track-select" data-speaker="${speakerName}">
                        ${tracks.map(track =>
                            `<option value="${track.value}" ${track.value === defaultTrack ? 'selected' : ''}>
                                ${track.label}
                            </option>`
                        ).join('')}
                    </select>
                </div>
            `;

            mappingGrid.appendChild(mappingRow);
        });

        mappingSection.style.display = 'block';
    }

    async applySpeakerMapping() {
        console.log('✅ 화자 트랙 매핑 적용');

        // 사용자가 설정한 매핑 수집
        const speakerTrackMapping = {};
        document.querySelectorAll('.track-select').forEach(select => {
            const speaker = select.dataset.speaker;
            const track = select.value;
            speakerTrackMapping[speaker] = track;
        });

        // 선택된 SRT 파일 확인
        const selectedFiles = this.getSelectedSrtFiles();
        if (selectedFiles.length === 0) {
            alert('SRT 파일을 먼저 선택해주세요');
            return;
        }

        const srtFile = selectedFiles[0];

        try {
            // 트랙 배치 API 호출
            const response = await fetch('/api/analysis/assign-speakers-to-tracks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: srtFile,
                    speaker_track_mapping: speakerTrackMapping,
                    existing_speakers: this.currentSpeakers || {},
                    existing_subtitles: this.classifiedSubtitles || null
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayTrackingResults(result);
                this.updateHybridTracksWithSpeakers(result.classified_subtitles);
            } else {
                throw new Error('트랙 배치 실패');
            }

        } catch (error) {
            console.error('트랙 배치 에러:', error);
            alert('❌ 트랙 배치 중 오류가 발생했습니다');
        }
    }

    displayTrackingResults(result) {
        console.log('📊 배치 결과 표시');

        const resultsSection = document.getElementById('mapping-results');
        const trackSummary = document.getElementById('track-summary');

        trackSummary.innerHTML = '';

        const trackLabels = {
            main: '📝 메인 자막',
            translation: '🌐 번역 자막',
            description: '🔊 설명 자막',
            unassigned: '❓ 미분류'
        };

        Object.entries(result.track_counts).forEach(([track, count]) => {
            const summaryCard = document.createElement('div');
            summaryCard.className = 'track-summary-card';
            summaryCard.innerHTML = `
                <div class="track-label">${trackLabels[track] || track}</div>
                <div class="track-count">${count}개 자막</div>
            `;
            trackSummary.appendChild(summaryCard);
        });

        resultsSection.style.display = 'block';
    }

    updateHybridTracksWithSpeakers(classifiedSubtitles) {
        console.log('🎬 하이브리드 트랙에 화자별 자막 업데이트');

        // 각 트랙별로 자막 데이터 업데이트
        this.timeline.speakerClassifiedSubtitles = classifiedSubtitles;

        // timeline.subtitleData가 없으면 초기화
        if (!this.timeline.subtitleData) {
            console.log('🔧 timeline.subtitleData 초기화');
            // 모든 분류된 자막을 하나로 합침
            const allSubtitles = [];
            Object.values(classifiedSubtitles).forEach(trackSubtitles => {
                if (Array.isArray(trackSubtitles)) {
                    allSubtitles.push(...trackSubtitles);
                }
            });

            // 시간 순으로 정렬
            allSubtitles.sort((a, b) => a.start_time - b.start_time);

            this.timeline.subtitleData = {
                subtitles: allSubtitles,
                file_path: "speaker_classified",
                total_duration: allSubtitles.length > 0 ? Math.max(...allSubtitles.map(s => s.end_time)) : 0
            };

            console.log(`📝 timeline.subtitleData 초기화 완료: ${allSubtitles.length}개 자막`);
        }

        // 하이브리드 트랙 다시 렌더링
        this.renderHybridSubtitleTracks();
    }

    applySingleSubtitleTrack(subtitleIndex) {
        console.log(`✅ 자막 #${subtitleIndex + 1} 트랙 변경 적용`);

        const selectElement = document.getElementById(`track-select-${subtitleIndex}`);
        if (!selectElement) {
            console.error(`❌ 트랙 선택 요소를 찾을 수 없습니다: track-select-${subtitleIndex}`);
            return;
        }

        const newTrack = selectElement.value;
        const subtitle = this.classifiedSubtitles[subtitleIndex];

        if (!subtitle) {
            console.error(`❌ 자막 데이터를 찾을 수 없습니다: ${subtitleIndex}`);
            return;
        }

        // 기존 트랙에서 자막 제거
        this.removeSubtitleFromAllTracks(subtitle);

        // 새 트랙에 자막 추가
        if (!this.timeline.speakerClassifiedSubtitles) {
            this.timeline.speakerClassifiedSubtitles = {
                main: [],
                translation: [],
                description: [],
                unassigned: []
            };
        }

        if (!this.timeline.speakerClassifiedSubtitles[newTrack]) {
            this.timeline.speakerClassifiedSubtitles[newTrack] = [];
        }

        this.timeline.speakerClassifiedSubtitles[newTrack].push(subtitle);

        // 편집 탭 업데이트
        this.renderHybridSubtitleTracks();

        this.showSuccess(`자막 #${subtitleIndex + 1}을 ${this.getTrackDisplayName(newTrack)}로 이동했습니다`);
    }

    applyAllSubtitleTracks() {
        console.log('🎯 모든 자막 트랙 변경사항 일괄 적용');

        if (!this.classifiedSubtitles) {
            this.showError('적용할 자막 데이터가 없습니다');
            return;
        }

        // 새로운 트랙 분류 생성
        const newClassification = {
            main: [],
            translation: [],
            description: [],
            unassigned: []
        };

        // 각 자막의 선택된 트랙으로 분류
        this.classifiedSubtitles.forEach((subtitle, index) => {
            const selectElement = document.getElementById(`track-select-${index}`);
            if (selectElement) {
                const selectedTrack = selectElement.value;
                newClassification[selectedTrack].push(subtitle);
            } else {
                newClassification.unassigned.push(subtitle);
            }
        });

        // 분류 결과 적용
        this.timeline.speakerClassifiedSubtitles = newClassification;

        // 편집 탭 업데이트
        this.renderHybridSubtitleTracks();

        const totalMoved = newClassification.main.length + newClassification.translation.length + newClassification.description.length;
        this.showSuccess(`모든 변경사항을 적용했습니다 (${totalMoved}개 자막 배치, ${newClassification.unassigned.length}개 미분류)`);
    }

    resetAllSubtitleTracks() {
        console.log('🔄 모든 자막 트랙 선택 초기화');

        if (!this.classifiedSubtitles) {
            this.showError('초기화할 자막 데이터가 없습니다');
            return;
        }

        // 모든 select 요소를 '미분류'로 초기화
        this.classifiedSubtitles.forEach((subtitle, index) => {
            const selectElement = document.getElementById(`track-select-${index}`);
            if (selectElement) {
                selectElement.value = 'unassigned';
            }
        });

        this.showSuccess('모든 트랙 선택이 초기화되었습니다');
    }

    removeSubtitleFromAllTracks(targetSubtitle) {
        if (!this.timeline.speakerClassifiedSubtitles) return;

        Object.keys(this.timeline.speakerClassifiedSubtitles).forEach(track => {
            this.timeline.speakerClassifiedSubtitles[track] = this.timeline.speakerClassifiedSubtitles[track].filter(
                subtitle => !(subtitle.start_time === targetSubtitle.start_time && subtitle.text === targetSubtitle.text)
            );
        });
    }

    getTrackDisplayName(track) {
        const displayNames = {
            main: '📝 메인 자막',
            translation: '🌐 번역 자막',
            description: '🔊 설명 자막',
            unassigned: '❓ 미분류'
        };
        return displayNames[track] || track;
    }

    seekToSubtitle(startTime) {
        console.log(`⏯️ 자막 구간으로 이동: ${startTime}초`);

        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) {
            videoPlayer.currentTime = startTime;
            this.showSuccess(`${this.formatTime(startTime)}로 이동했습니다`);
        } else {
            this.showError('비디오 플레이어를 찾을 수 없습니다');
        }
    }

    generateSpeakerColors(speakerNames) {
        const colors = [
            '#3498db', // 파란색 (화자1)
            '#e74c3c', // 빨간색 (화자2)
            '#2ecc71', // 초록색 (화자3)
            '#f39c12', // 주황색
            '#9b59b6', // 보라색
            '#1abc9c', // 청록색
            '#34495e', // 진회색
            '#e67e22', // 당근색
            '#95a5a6', // 회색
            '#85C1E9'  // 하늘색
        ];

        const speakerColors = {};
        speakerNames.forEach((speaker, index) => {
            speakerColors[speaker] = colors[index % colors.length];
        });

        return speakerColors;
    }

    addSpeakerSubtitles(speakerName, speakerData, speakerColor) {
        console.log(`📝 ${speakerName} 자막 추가`);

        const subtitleList = document.querySelector(`#speaker-subtitles-${speakerName} .subtitle-list`);
        if (!subtitleList) {
            console.error(`자막 리스트 컨테이너를 찾을 수 없습니다: ${speakerName}`);
            return;
        }

        // 해당 화자의 자막들 찾기
        const speakerSubtitles = this.classifiedSubtitles ?
            this.classifiedSubtitles.filter(sub => sub.speaker_name === speakerName) : [];

        // 시간순으로 정렬
        speakerSubtitles.sort((a, b) => a.start_time - b.start_time);

        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const secs = (seconds % 60).toFixed(1);
            return `${minutes}:${secs.padStart(4, '0')}`;
        };

        speakerSubtitles.forEach((subtitle, index) => {
            const subtitleItem = document.createElement('div');
            subtitleItem.className = 'subtitle-item';

            const globalIndex = this.classifiedSubtitles.findIndex(s =>
                s.start_time === subtitle.start_time && s.text === subtitle.text
            );

            subtitleItem.innerHTML = `
                <div class="subtitle-checkbox-container">
                    <input type="checkbox"
                           id="subtitle-check-${globalIndex}"
                           class="subtitle-checkbox"
                           data-speaker="${speakerName}"
                           data-subtitle-index="${globalIndex}"
                           onchange="app.onSubtitleCheckboxChange(${globalIndex}, '${speakerName}')">
                    <label for="subtitle-check-${globalIndex}" class="checkbox-label"></label>
                </div>
                <div class="subtitle-content" style="border-left: 3px solid ${speakerColor}">
                    <div class="subtitle-time-info">
                        <span class="subtitle-time">${formatTime(subtitle.start_time)} → ${formatTime(subtitle.end_time)}</span>
                        <span class="subtitle-duration">(${(subtitle.end_time - subtitle.start_time).toFixed(1)}초)</span>
                        <button class="play-subtitle-btn" onclick="app.seekToSubtitle(${subtitle.start_time})" title="재생">▶️</button>
                    </div>
                    <div class="subtitle-text-content">"${subtitle.text}"</div>
                </div>
            `;

            subtitleList.appendChild(subtitleItem);
        });

        // 선택된 자막 개수 업데이트
        this.updateSelectedCount(speakerName);
    }

    async addSpeakerSubtitlesFromSRT(speakerName, speakerData, speakerColor) {
        console.log(`📝 ${speakerName} SRT 파일에서 자막 로드`);

        const subtitleList = document.querySelector(`#speaker-subtitles-${speakerName} .subtitle-list`);
        if (!subtitleList) {
            console.error(`자막 리스트 컨테이너를 찾을 수 없습니다: ${speakerName}`);
            return;
        }

        try {
            // 실제 SRT 파일 경로 설정
            const srtFilePath = '/home/sk/ws/youtubeanalysis/youtube/download/시어머니 머리꼭대기에 앉은 전지현의 미친 필살기🔥북극성 4,5화 [vTMssu3XB7g].ko.srt';

            // 실제 SRT 파일 내용 로드
            const allSrtSubtitles = await this.loadSRTFile(srtFilePath);

            // 모든 SRT 자막을 표시 (화자별로 색상 구분)
            const speakerSubtitles = allSrtSubtitles.map((srtSub, index) => {
                // 화자 인식 결과와 매칭하여 화자 정보 추가
                let assignedSpeaker = '미분류';
                let speakerId = -1;

                if (this.classifiedSubtitles) {
                    const matchingClassified = this.classifiedSubtitles.find(classifiedSub =>
                        Math.abs(srtSub.start_time - classifiedSub.start_time) < 0.5 &&
                        Math.abs(srtSub.end_time - classifiedSub.end_time) < 0.5
                    );

                    if (matchingClassified) {
                        assignedSpeaker = matchingClassified.speaker_name;
                        speakerId = matchingClassified.speaker_id;
                    }
                }

                return {
                    ...srtSub,
                    speaker_name: assignedSpeaker,
                    speaker_id: speakerId,
                    globalIndex: index + 1
                };
            });

            // 시간순으로 정렬
            speakerSubtitles.sort((a, b) => a.start_time - b.start_time);

            const formatSRTTime = (seconds) => {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = (seconds % 60).toFixed(3);
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
            };

            speakerSubtitles.forEach((subtitle, index) => {
                const subtitleItem = document.createElement('div');
                subtitleItem.className = 'subtitle-item';

                // 화자별 색상 설정
                const getSpeakerColor = (speaker) => {
                    if (speaker === '화자1') return '#3498db';  // 파란색
                    if (speaker === '화자2') return '#e74c3c';  // 빨간색
                    if (speaker === '화자3') return '#2ecc71';  // 초록색
                    return '#95a5a6';  // 회색 (미분류)
                };

                const currentSpeakerColor = getSpeakerColor(subtitle.speaker_name);
                const isCurrentSpeaker = subtitle.speaker_name === speakerName;

                subtitleItem.innerHTML = `
                    <div class="subtitle-checkbox-container">
                        <input type="checkbox"
                               id="subtitle-check-${subtitle.globalIndex}"
                               class="subtitle-checkbox"
                               data-speaker="${subtitle.speaker_name}"
                               data-subtitle-index="${subtitle.globalIndex}"
                               ${isCurrentSpeaker ? 'checked' : ''}
                               onchange="app.onSubtitleCheckboxChange(${subtitle.globalIndex}, '${subtitle.speaker_name}')">
                        <label for="subtitle-check-${subtitle.globalIndex}" class="checkbox-label"></label>
                    </div>
                    <div class="subtitle-content" style="border-left: 3px solid ${currentSpeakerColor}; ${isCurrentSpeaker ? 'background-color: rgba(' + hexToRgb(currentSpeakerColor) + ', 0.1)' : ''}">
                        <div class="subtitle-time-info">
                            <span class="subtitle-number">#${subtitle.number || subtitle.globalIndex}</span>
                            <span class="subtitle-time">${formatSRTTime(subtitle.start_time)} → ${formatSRTTime(subtitle.end_time)}</span>
                            <span class="speaker-label" style="color: ${currentSpeakerColor}; font-weight: bold;">${subtitle.speaker_name}</span>
                            <button class="play-subtitle-btn" onclick="app.seekToSubtitle(${subtitle.start_time})" title="재생">▶️</button>
                        </div>
                        <div class="subtitle-text-content">${subtitle.text}</div>
                    </div>
                `;

                subtitleList.appendChild(subtitleItem);
            });

            // 헥스 색상을 RGB로 변환하는 헬퍼 함수
            function hexToRgb(hex) {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ?
                    parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) :
                    '0,0,0';
            }

            // 선택된 자막 개수 업데이트
            this.updateSelectedCount(speakerName);

        } catch (error) {
            console.error(`❌ SRT 파일 로드 실패: ${error}`);
            subtitleList.innerHTML = `<div class="error-message">❌ SRT 파일을 로드할 수 없습니다: ${error.message}</div>`;
        }
    }

    async loadSRTFile(filePath) {
        console.log(`📁 SRT 파일 로드: ${filePath}`);

        const response = await fetch('/api/analysis/subtitle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                files: [filePath]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.results && result.results[0] && result.results[0].status === 'success') {
            return result.results[0].data.subtitles;
        } else {
            throw new Error('SRT 파일 분석 실패');
        }
    }

    async displayAllSRTSubtitlesWithSpeakers(speakers) {
        console.log('🎬 전체 SRT 자막을 화자별 색상으로 표시');

        try {
            // SRT 파일 경로
            const srtFilePath = '/home/sk/ws/youtubeanalysis/youtube/download/시어머니 머리꼭대기에 앉은 전지현의 미친 필살기🔥북극성 4,5화 [vTMssu3XB7g].ko.srt';

            // SRT 파일 로드
            const allSrtSubtitles = await this.loadSRTFile(srtFilePath);

            // 화자별 색상 매핑
            const getSpeakerColor = (speaker) => {
                if (speaker === '화자1') return '#3498db';  // 파란색
                if (speaker === '화자2') return '#e74c3c';  // 빨간색
                if (speaker === '화자3') return '#2ecc71';  // 초록색
                return '#95a5a6';  // 회색 (미분류)
            };

            const hexToRgb = (hex) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ?
                    parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) :
                    '0,0,0';
            };

            const formatSRTTime = (seconds) => {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = (seconds % 60).toFixed(3);
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
            };

            // 전체 자막을 화자 정보와 함께 매핑
            const enrichedSubtitles = allSrtSubtitles.map((srtSub, index) => {
                let assignedSpeaker = '미분류';
                let speakerId = -1;

                if (this.classifiedSubtitles) {
                    const matchingClassified = this.classifiedSubtitles.find(classifiedSub =>
                        Math.abs(srtSub.start_time - classifiedSub.start_time) < 0.5 &&
                        Math.abs(srtSub.end_time - classifiedSub.end_time) < 0.5
                    );

                    if (matchingClassified) {
                        assignedSpeaker = matchingClassified.speaker_name;
                        speakerId = matchingClassified.speaker_id;
                    }
                }

                return {
                    ...srtSub,
                    speaker_name: assignedSpeaker,
                    speaker_id: speakerId,
                    globalIndex: index + 1
                };
            });

            // 기존 전체 자막 섹션 제거
            const existingSection = document.getElementById('all-subtitles-section');
            if (existingSection) {
                existingSection.remove();
            }

            // 새로운 전체 자막 섹션 생성
            const allSubtitlesSection = document.createElement('div');
            allSubtitlesSection.id = 'all-subtitles-section';
            allSubtitlesSection.className = 'analysis-section';
            allSubtitlesSection.innerHTML = `
                <h3>🎬 전체 자막 (시간순)</h3>
                <div class="subtitle-controls">
                    <div class="control-row">
                        <button onclick="app.selectAllSubtitles()" class="action-btn">전체 선택</button>
                        <button onclick="app.deselectAllSubtitles()" class="action-btn">전체 해제</button>
                        <span class="selected-count">선택된 자막: <span id="total-selected-count">0</span>개</span>
                    </div>
                    <div class="control-row">
                        <div class="speaker-bulk-controls">
                            <label>화자별 일괄 선택:</label>
                            <button onclick="app.selectBySpeaker('화자1')" class="speaker-btn speaker1">화자1</button>
                            <button onclick="app.selectBySpeaker('화자2')" class="speaker-btn speaker2">화자2</button>
                            <button onclick="app.selectBySpeaker('화자3')" class="speaker-btn speaker3">화자3</button>
                            <button onclick="app.selectBySpeaker('미분류')" class="speaker-btn unclassified">미분류</button>
                        </div>
                    </div>
                    <div class="control-row">
                        <div class="track-assignment-controls">
                            <label>선택된 자막을 트랙에 일괄 적용:</label>
                            <button onclick="app.assignSelectedToTrack('main')" class="track-btn main-track">📝 메인 자막</button>
                            <button onclick="app.assignSelectedToTrack('translation')" class="track-btn translation-track">🌐 번역 자막</button>
                            <button onclick="app.assignSelectedToTrack('description')" class="track-btn description-track">🔊 설명 자막</button>
                        </div>
                    </div>
                    <div class="control-row">
                        <div class="speaker-change-controls">
                            <label>선택된 자막의 화자 변경:</label>
                            <select id="target-speaker-select" class="speaker-select">
                                <option value="화자1">화자1</option>
                                <option value="화자2">화자2</option>
                                <option value="화자3">화자3</option>
                                <option value="미분류">미분류</option>
                            </select>
                            <button onclick="app.changeSpeakerForSelected()" class="action-btn">화자 변경</button>
                        </div>
                    </div>
                </div>
                <div class="all-subtitles-list"></div>
            `;

            // speakers 섹션 다음에 추가
            const speakersSection = document.getElementById('speakers-section');
            speakersSection.insertAdjacentElement('afterend', allSubtitlesSection);

            // 자막 리스트 컨테이너
            const subtitleList = allSubtitlesSection.querySelector('.all-subtitles-list');

            // 모든 자막 표시
            enrichedSubtitles.forEach((subtitle) => {
                const currentSpeakerColor = getSpeakerColor(subtitle.speaker_name);

                const subtitleItem = document.createElement('div');
                subtitleItem.className = 'subtitle-item';
                subtitleItem.innerHTML = `
                    <div class="subtitle-checkbox-container">
                        <input type="checkbox"
                               id="subtitle-check-${subtitle.globalIndex}"
                               class="subtitle-checkbox"
                               data-speaker="${subtitle.speaker_name}"
                               data-subtitle-index="${subtitle.globalIndex}"
                               onchange="app.onSubtitleCheckboxChange(${subtitle.globalIndex}, '${subtitle.speaker_name}')">
                        <label for="subtitle-check-${subtitle.globalIndex}" class="checkbox-label"></label>
                    </div>
                    <div class="subtitle-content" style="border-left: 3px solid ${currentSpeakerColor}; background-color: rgba(${hexToRgb(currentSpeakerColor)}, 0.05);">
                        <div class="subtitle-time-info">
                            <span class="subtitle-number">#${subtitle.number || subtitle.globalIndex}</span>
                            <span class="subtitle-time">${formatSRTTime(subtitle.start_time)} → ${formatSRTTime(subtitle.end_time)}</span>
                            <span class="speaker-label" style="color: ${currentSpeakerColor}; font-weight: bold;">${subtitle.speaker_name}</span>
                            <button class="play-subtitle-btn" onclick="app.seekToSubtitle(${subtitle.start_time})" title="재생">▶️</button>
                        </div>
                        <div class="subtitle-text-content">${subtitle.text}</div>
                    </div>
                `;

                subtitleList.appendChild(subtitleItem);
            });

            // 전체 선택된 자막 개수 업데이트
            this.updateTotalSelectedCount();

            console.log(`✅ 전체 SRT 자막 표시 완료: ${enrichedSubtitles.length}개`);

        } catch (error) {
            console.error(`❌ 전체 SRT 자막 표시 실패: ${error}`);
        }
    }

    selectAllSubtitles() {
        const checkboxes = document.querySelectorAll('.subtitle-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        this.updateTotalSelectedCount();
    }

    deselectAllSubtitles() {
        const checkboxes = document.querySelectorAll('.subtitle-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.updateTotalSelectedCount();
    }

    updateTotalSelectedCount() {
        const selectedCheckboxes = document.querySelectorAll('.subtitle-checkbox:checked');
        const countElement = document.getElementById('total-selected-count');
        if (countElement) {
            countElement.textContent = selectedCheckboxes.length;
        }
    }

    onSubtitleCheckboxChange(subtitleIndex, speakerName) {
        console.log(`✅ 자막 #${subtitleIndex} 선택 상태 변경: ${speakerName}`);
        this.updateTotalSelectedCount();
    }

    selectBySpeaker(speakerName) {
        console.log(`🎭 ${speakerName} 화자의 모든 자막 선택`);

        // 먼저 모든 체크박스 해제
        this.deselectAllSubtitles();

        // 해당 화자의 자막만 선택
        const speakerCheckboxes = document.querySelectorAll(`input[data-speaker="${speakerName}"]`);
        speakerCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
        });

        this.updateTotalSelectedCount();
        console.log(`✅ ${speakerName} 자막 ${speakerCheckboxes.length}개 선택 완료`);
    }

    async assignSelectedToTrack(trackType) {
        const selectedCheckboxes = document.querySelectorAll('.subtitle-checkbox:checked');
        const selectedIndices = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.subtitleIndex));

        if (selectedIndices.length === 0) {
            alert('선택된 자막이 없습니다.');
            return;
        }

        const trackNames = {
            'main': '메인 자막',
            'translation': '번역 자막',
            'description': '설명 자막'
        };

        console.log(`📝 선택된 ${selectedIndices.length}개 자막을 ${trackNames[trackType]}에 일괄 적용`);

        try {
            // 현재 화자 데이터 준비
            const speakersForAPI = {};
            if (this.currentSpeakers) {
                Object.keys(this.currentSpeakers).forEach(speakerName => {
                    speakersForAPI[speakerName] = {
                        ...this.currentSpeakers[speakerName],
                        assigned_track: selectedIndices.some(idx => {
                            const checkbox = document.querySelector(`input[data-subtitle-index="${idx}"]`);
                            return checkbox && checkbox.dataset.speaker === speakerName;
                        }) ? trackType : (this.currentSpeakers[speakerName].assigned_track || 'unassigned')
                    };
                });
            }

            const response = await fetch('/api/analysis/assign-speakers-to-tracks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    existing_speakers: speakersForAPI,
                    existing_subtitles: this.classifiedSubtitles || [],
                    track_assignments: {
                        [trackType]: selectedIndices
                    }
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ 트랙 일괄 적용 성공:', result);

                // UI 업데이트
                this.updateHybridTracksWithSpeakers(result.classified_subtitles);

                // 자막별 분석 결과의 드롭다운도 업데이트
                this.updateSubtitleTrackSelections(selectedIndices, trackType);

                alert(`✅ ${selectedIndices.length}개 자막이 ${trackNames[trackType]}에 적용되었습니다.`);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('❌ 트랙 일괄 적용 실패:', error);
            alert(`❌ 트랙 적용 중 오류가 발생했습니다: ${error.message}`);
        }
    }

    changeSpeakerForSelected() {
        const selectedCheckboxes = document.querySelectorAll('.subtitle-checkbox:checked');
        const targetSpeaker = document.getElementById('target-speaker-select').value;

        if (selectedCheckboxes.length === 0) {
            alert('선택된 자막이 없습니다.');
            return;
        }

        console.log(`🔄 선택된 ${selectedCheckboxes.length}개 자막의 화자를 ${targetSpeaker}로 변경`);

        // 화자별 색상 매핑
        const getSpeakerColor = (speaker) => {
            if (speaker === '화자1') return '#3498db';
            if (speaker === '화자2') return '#e74c3c';
            if (speaker === '화자3') return '#2ecc71';
            return '#95a5a6';
        };

        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ?
                parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) :
                '0,0,0';
        };

        const newColor = getSpeakerColor(targetSpeaker);

        selectedCheckboxes.forEach(checkbox => {
            const subtitleIndex = checkbox.dataset.subtitleIndex;
            const subtitleItem = checkbox.closest('.subtitle-item');

            // 체크박스 데이터 업데이트
            checkbox.dataset.speaker = targetSpeaker;

            // 시각적 업데이트
            const subtitleContent = subtitleItem.querySelector('.subtitle-content');
            const speakerLabel = subtitleItem.querySelector('.speaker-label');

            // 색상 업데이트
            subtitleContent.style.borderLeft = `3px solid ${newColor}`;
            subtitleContent.style.backgroundColor = `rgba(${hexToRgb(newColor)}, 0.05)`;

            // 화자 라벨 업데이트
            speakerLabel.textContent = targetSpeaker;
            speakerLabel.style.color = newColor;

            // 분류된 자막 데이터 업데이트
            if (this.classifiedSubtitles) {
                const classifiedIndex = parseInt(subtitleIndex) - 1;
                if (this.classifiedSubtitles[classifiedIndex]) {
                    this.classifiedSubtitles[classifiedIndex].speaker_name = targetSpeaker;
                    this.classifiedSubtitles[classifiedIndex].speaker_id = targetSpeaker === '화자1' ? 0 :
                                                                             targetSpeaker === '화자2' ? 1 :
                                                                             targetSpeaker === '화자3' ? 2 : -1;
                }
            }
        });

        // 선택 해제
        this.deselectAllSubtitles();

        console.log(`✅ ${selectedCheckboxes.length}개 자막의 화자를 ${targetSpeaker}로 변경 완료`);
        alert(`✅ ${selectedCheckboxes.length}개 자막의 화자가 ${targetSpeaker}로 변경되었습니다.`);
    }

    updateSubtitleTrackSelections(subtitleIndices, trackType) {
        console.log(`🔄 자막별 분석 결과 드롭다운 업데이트: ${subtitleIndices.length}개 → ${trackType}`);

        subtitleIndices.forEach(subtitleIndex => {
            // 드롭다운이 있는 자막 찾기 (0-based 인덱스로 변환)
            const selectElement = document.getElementById(`track-select-${subtitleIndex - 1}`);
            if (selectElement) {
                selectElement.value = trackType;
                console.log(`✅ 자막 #${subtitleIndex} 드롭다운을 ${trackType}로 업데이트`);
            }
        });
    }

    toggleAllSubtitles(speakerName) {
        console.log(`🔄 ${speakerName} 모든 자막 토글`);

        const checkboxes = document.querySelectorAll(`input[data-speaker="${speakerName}"]`);
        const checkedCount = document.querySelectorAll(`input[data-speaker="${speakerName}"]:checked`).length;
        const newState = checkedCount === 0; // 모두 체크 해제된 상태면 모두 체크

        checkboxes.forEach(checkbox => {
            checkbox.checked = newState;
        });

        this.updateSelectedCount(speakerName);
        this.showSuccess(`${speakerName}의 모든 자막을 ${newState ? '선택' : '해제'}했습니다`);
    }

    onSubtitleCheckboxChange(subtitleIndex, speakerName) {
        console.log(`☑️ 자막 #${subtitleIndex + 1} 체크박스 변경`);
        this.updateSelectedCount(speakerName);
    }

    updateSelectedCount(speakerName) {
        const checkboxes = document.querySelectorAll(`input[data-speaker="${speakerName}"]`);
        const checkedCount = document.querySelectorAll(`input[data-speaker="${speakerName}"]:checked`).length;
        const totalCount = checkboxes.length;

        // 화자 카드의 제목 업데이트
        const speakerHeader = document.querySelector(`#speaker-subtitles-${speakerName} .subtitle-header strong`);
        if (speakerHeader) {
            speakerHeader.innerHTML = `📝 실제 대사 (시간순): <span style="color: var(--success-color)">${checkedCount}/${totalCount} 선택됨</span>`;
        }
    }

    applySelectedSubtitles() {
        console.log('✅ 선택된 자막들 적용');

        const allCheckboxes = document.querySelectorAll('.subtitle-checkbox:checked');
        const selectedIndices = Array.from(allCheckboxes).map(cb => parseInt(cb.dataset.subtitleIndex));

        if (selectedIndices.length === 0) {
            this.showError('선택된 자막이 없습니다');
            return;
        }

        // 선택된 자막들의 트랙 배치를 새로운 설정으로 업데이트
        const newClassification = {
            main: [],
            translation: [],
            description: [],
            unassigned: []
        };

        this.classifiedSubtitles.forEach((subtitle, index) => {
            if (selectedIndices.includes(index)) {
                // 선택된 자막은 사용자가 지정한 트랙으로
                const trackSelect = document.getElementById(`track-select-${index}`);
                const selectedTrack = trackSelect ? trackSelect.value : 'unassigned';
                newClassification[selectedTrack].push(subtitle);
            } else {
                // 선택되지 않은 자막은 기존 분류 유지 또는 미분류로
                newClassification.unassigned.push(subtitle);
            }
        });

        // 분류 결과 적용
        this.timeline.speakerClassifiedSubtitles = newClassification;
        this.renderHybridSubtitleTracks();

        const totalSelected = selectedIndices.length;
        this.showSuccess(`선택된 ${totalSelected}개 자막이 트랙에 배치되었습니다`);
    }

    getSelectedSrtFiles() {
        // 선택된 SRT 파일들 반환
        const checkboxes = document.querySelectorAll('.file-checkbox:checked');
        const srtFiles = [];

        checkboxes.forEach(checkbox => {
            const filePath = checkbox.value;
            if (filePath.endsWith('.srt')) {
                srtFiles.push(filePath);
            }
        });

        return srtFiles;
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

// 전역 디버깅 함수들
window.debugSubtitleTrack = function() {
    console.log('🔍 자막 트랙 디버깅 시작');
    const subtitleTrack = document.getElementById('subtitle-track');
    const trackContent = subtitleTrack ? subtitleTrack.querySelector('.track-content') : null;

    console.log('자막 트랙 요소:', subtitleTrack);
    console.log('트랙 콘텐츠:', trackContent);
    console.log('전체 타임라인 트랙들:', document.querySelectorAll('.timeline-track'));

    if (trackContent) {
        const blocks = trackContent.querySelectorAll('.subtitle-block');
        console.log(`생성된 블록 수: ${blocks.length}`);

        blocks.forEach((block, index) => {
            const numberEl = block.querySelector('.subtitle-number');
            console.log(`블록 #${index + 1}:`, {
                블록: block,
                번호요소: numberEl,
                번호텍스트: numberEl ? numberEl.textContent : 'null',
                번호표시: numberEl ? getComputedStyle(numberEl).display : 'null',
                번호가시성: numberEl ? getComputedStyle(numberEl).visibility : 'null',
                번호스타일: numberEl ? numberEl.style.cssText : 'null'
            });
        });
    }
}

window.forceRenderSubtitles = function() {
    console.log('🔄 강제 자막 렌더링 실행');
    if (window.app && window.app.timeline && window.app.timeline.subtitleData) {
        window.app.renderHybridSubtitleTracks();
    } else {
        console.error('자막 데이터가 없습니다');
        console.log('앱 상태:', {
            app: window.app,
            timeline: window.app ? window.app.timeline : null,
            subtitleData: window.app && window.app.timeline ? window.app.timeline.subtitleData : null
        });
    }
};

