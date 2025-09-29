/**
 * Saved results manager for the video analysis dashboard.
 * Handles persistence operations and UI updates around stored analysis snapshots.
 */
(function registerSavedResultsManager(global) {
    if (!global) {
        throw new Error('SavedResultsManager requires a global window object');
    }

    class SavedResultsManager {
        constructor(appInstance) {
            this.app = appInstance;
            this.cachedResults = [];
        }

        get panel() {
            return document.getElementById('saved-results-panel');
        }

        get listElement() {
            return document.getElementById('saved-results-list');
        }

        get nameInput() {
            return document.getElementById('save-results-name');
        }

        get importInput() {
            return document.getElementById('import-results-input');
        }

        getCachedResults() {
            return Array.isArray(this.cachedResults) ? this.cachedResults : [];
        }

        setCachedResults(results) {
            this.cachedResults = Array.isArray(results) ? results : [];
        }

        async refreshList(options = {}) {
            const { notifyOnError = false } = options;

            try {
                const response = await fetch('/api/analysis/saved-results');
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || `HTTP ${response.status}`);
                }

                const data = await response.json();
                const results = Array.isArray(data?.results) ? data.results : [];
                this.setCachedResults(results);
                this.renderList(results);
                return results;
            } catch (error) {
                console.error('저장된 결과 목록을 불러오지 못했습니다:', error);
                this.setCachedResults([]);
                this.renderList([]);

                if (notifyOnError) {
                    this.app.showError('저장된 결과 목록을 불러오지 못했습니다');
                }
                return [];
            }
        }

        renderList(results) {
            const list = this.listElement;
            if (!list) {
                return;
            }

            if (!Array.isArray(results) || results.length === 0) {
                list.innerHTML = '<div class="empty-state">저장된 결과가 없습니다.</div>';
                return;
            }

            const itemsHtml = results
                .slice()
                .sort((a, b) => new Date(b?.saved_at || 0) - new Date(a?.saved_at || 0))
                .map(result => {
                    const savedAt = this.app.formatTimestampForDisplay(result?.saved_at) || '알 수 없음';
                    const summaryParts = [];

                    if (result?.analysisResults) {
                        const audioCount = Array.isArray(result.analysisResults.audio)
                            ? result.analysisResults.audio.length
                            : 0;
                        const subtitleCount = Array.isArray(result.analysisResults.subtitle)
                            ? result.analysisResults.subtitle.length
                            : 0;

                        if (audioCount) {
                            summaryParts.push(`음성 ${audioCount}개`);
                        }
                        if (subtitleCount) {
                            summaryParts.push(`자막 ${subtitleCount}개`);
                        }
                    }

                    if (Array.isArray(result?.selectedFiles)) {
                        summaryParts.push(`선택 파일 ${result.selectedFiles.length}개`);
                    }

                    const summary = summaryParts.length ? summaryParts.join(' · ') : '요약 정보 없음';
                    const escapedName = this.app.escapeHtml(result?.name || '이름 없는 저장');
                    const escapedSummary = this.app.escapeHtml(summary);

                    return `
                        <div class="saved-result-item" data-result-id="${result?.id || ''}">
                            <div class="saved-result-info">
                                <span class="saved-result-name">${escapedName}</span>
                                <span class="saved-result-meta">저장: ${savedAt}</span>
                                <span class="saved-result-meta">${escapedSummary}</span>
                            </div>
                            <div class="saved-result-actions">
                                <button class="action-btn secondary" data-action="load" data-result-id="${result?.id || ''}">불러오기</button>
                                <button class="action-btn outline" data-action="rename" data-result-id="${result?.id || ''}">이름 변경</button>
                                <button class="action-btn outline" data-action="delete" data-result-id="${result?.id || ''}">삭제</button>
                            </div>
                        </div>
                    `;
                })
                .join('');

            list.innerHTML = itemsHtml;

            list.querySelectorAll('[data-action="load"]').forEach(btn => {
                btn.addEventListener('click', event => {
                    const id = event.currentTarget.getAttribute('data-result-id');
                    this.loadResult(id);
                });
            });

            list.querySelectorAll('[data-action="rename"]').forEach(btn => {
                btn.addEventListener('click', event => {
                    const id = event.currentTarget.getAttribute('data-result-id');
                    this.renameResult(id);
                });
            });

            list.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', event => {
                    const id = event.currentTarget.getAttribute('data-result-id');
                    this.deleteResult(id);
                });
            });
        }

        togglePanel(forceOpen = null) {
            const panel = this.panel;
            if (!panel) {
                return;
            }

            const shouldOpen = forceOpen !== null ? forceOpen : panel.style.display === 'none';
            if (shouldOpen) {
                panel.style.display = 'flex';
                this.refreshList({ notifyOnError: true }).catch(error => {
                    console.error('저장 결과 패널 갱신 실패:', error);
                });
            } else {
                panel.style.display = 'none';
            }
        }

        async saveCurrentResults() {
            const { analysisResults, reinterpretationHistory, selectedFiles, currentAnalysisMethod } = this.app;

            if (!analysisResults || Object.keys(analysisResults).length === 0) {
                this.app.showError('저장할 분석 결과가 없습니다');
                return;
            }

            const nameInput = this.nameInput;
            const saveName = nameInput ? nameInput.value.trim() : '';

            if (!saveName) {
                this.app.showError('저장할 이름을 입력하세요');
                if (nameInput) {
                    nameInput.focus();
                }
                return;
            }

            let existingResults = this.getCachedResults();
            if (!Array.isArray(existingResults) || existingResults.length === 0) {
                existingResults = await this.refreshList();
            }

            const duplicate = Array.isArray(existingResults)
                ? existingResults.find(item => item?.name === saveName)
                : null;

            if (duplicate && !window.confirm(`"${saveName}" 이름이 이미 존재합니다. 덮어쓸까요?`)) {
                return;
            }

            const payload = {
                id: duplicate ? duplicate.id : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
                name: saveName,
                saved_at: new Date().toISOString(),
                analysisResults: JSON.parse(JSON.stringify(analysisResults)),
                selectedFiles: Array.from(selectedFiles || []),
                reinterpretationHistory: JSON.parse(JSON.stringify(reinterpretationHistory || {})),
                metadata: {
                    analysis_method: currentAnalysisMethod,
                    selected_count: selectedFiles ? selectedFiles.size : 0
                }
            };

            if (payload.analysisResults?.reinterpretation && !payload.analysisResults.reinterpretation.tone) {
                payload.analysisResults.reinterpretation.tone = this.app.getReinterpretationTone();
            }

            try {
                const response = await fetch('/api/analysis/saved-results', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || '저장 결과를 기록하지 못했습니다');
                }

                await this.refreshList({ notifyOnError: true });
                this.togglePanel(true);
                this.app.showSuccess(`"${saveName}" 이름으로 저장했습니다`);
            } catch (error) {
                console.error('저장 결과 기록 실패:', error);
                this.app.showError(error.message || '저장 결과를 기록하지 못했습니다');
            }
        }

        async loadResult(id) {
            if (!id) {
                this.app.showError('불러올 결과를 찾을 수 없습니다');
                return;
            }

            let results = this.getCachedResults();
            let entry = Array.isArray(results) ? results.find(item => item?.id === id) : null;

            if (!entry) {
                try {
                    const response = await fetch(`/api/analysis/saved-results/${encodeURIComponent(id)}`);
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(errorText || '저장된 결과를 찾지 못했습니다');
                    }

                    const data = await response.json();
                    entry = data?.result || null;

                    if (entry) {
                        results = Array.isArray(results) ? results.filter(item => item?.id !== entry.id) : [];
                        results.push(entry);
                        this.setCachedResults(results);
                    }
                } catch (error) {
                    console.error('저장된 결과를 불러오지 못했습니다:', error);
                    this.app.showError(error.message || '저장된 결과를 불러오지 못했습니다');
                    return;
                }
            }

            if (!entry) {
                this.app.showError('저장된 결과를 찾지 못했습니다');
                return;
            }

            const clonedResults = JSON.parse(JSON.stringify(entry.analysisResults || {}));
            const clonedHistory = JSON.parse(JSON.stringify(entry.reinterpretationHistory || {}));

            const restored = this.app.populateAnalysisResultsFromImport(clonedResults, {
                reinterpretationHistory: clonedHistory,
                timelineSnapshot: entry.timelineSnapshot || entry.timeline_snapshot || null
            });

            if (!restored) {
                this.app.showError('저장된 분석 결과를 적용할 수 없습니다');
                return;
            }

            if (Array.isArray(entry.selectedFiles)) {
                this.app.selectedFiles = new Set(entry.selectedFiles);
                this.app.updateSelectedFilesList();
                this.app.updateStatusBar();
            }

            const nameInput = this.nameInput;
            if (nameInput) {
                nameInput.value = entry.name || '';
            }

            this.togglePanel(false);
            this.app.renderHybridSubtitleTracks();
            this.app.showSuccess(`"${entry.name}" 저장 결과를 불러왔습니다`);
        }

        async renameResult(id) {
            let results = this.getCachedResults();
            if (!Array.isArray(results) || results.length === 0) {
                results = await this.refreshList();
            }

            const index = Array.isArray(results) ? results.findIndex(item => item?.id === id) : -1;
            if (index === -1) {
                this.app.showError('저장된 결과를 찾을 수 없습니다');
                return;
            }

            const currentName = results[index]?.name || '';
            const newName = window.prompt('새로운 이름을 입력하세요', currentName)?.trim();
            if (!newName) {
                return;
            }

            if (results.some((item, idx) => idx !== index && item?.name === newName)) {
                this.app.showError('같은 이름이 이미 존재합니다. 다른 이름을 입력하세요.');
                return;
            }

            try {
                const response = await fetch(`/api/analysis/saved-results/${encodeURIComponent(id)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name: newName })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || '이름을 변경하지 못했습니다');
                }

                await this.refreshList({ notifyOnError: true });
                this.app.showSuccess('이름을 변경했습니다');
            } catch (error) {
                console.error('저장 결과 이름 변경 실패:', error);
                this.app.showError(error.message || '이름을 변경하지 못했습니다');
            }
        }

        async deleteResult(id) {
            let results = this.getCachedResults();
            if (!Array.isArray(results) || results.length === 0) {
                results = await this.refreshList();
            }

            const entry = Array.isArray(results) ? results.find(item => item?.id === id) : null;
            if (!entry) {
                return;
            }

            const name = entry?.name || '저장된 결과';
            if (!window.confirm(`"${name}"을(를) 삭제할까요?`)) {
                return;
            }

            try {
                const response = await fetch(`/api/analysis/saved-results/${encodeURIComponent(id)}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || '저장된 결과를 삭제하지 못했습니다');
                }

                await this.refreshList({ notifyOnError: true });
                this.app.showSuccess('저장된 결과를 삭제했습니다');
            } catch (error) {
                console.error('저장 결과 삭제 실패:', error);
                this.app.showError(error.message || '저장된 결과를 삭제하지 못했습니다');
            }
        }

        async clearAllResults() {
            let results = this.getCachedResults();
            if (!Array.isArray(results) || results.length === 0) {
                results = await this.refreshList();
            }

            if (!Array.isArray(results) || results.length === 0) {
                this.app.showInfo('삭제할 저장 결과가 없습니다');
                return;
            }

            if (!window.confirm('모든 저장된 결과를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) {
                return;
            }

            try {
                const response = await fetch('/api/analysis/saved-results', {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || '모든 저장 결과를 삭제하지 못했습니다');
                }

                this.setCachedResults([]);
                this.renderList([]);
                this.app.showSuccess('모든 저장 결과를 삭제했습니다');
            } catch (error) {
                console.error('저장 결과 전체 삭제 실패:', error);
                this.app.showError(error.message || '모든 저장 결과를 삭제하지 못했습니다');
            }
        }
    }

    global.VideoAnalysisSavedResultsManager = SavedResultsManager;
})(typeof window !== 'undefined' ? window : null);
