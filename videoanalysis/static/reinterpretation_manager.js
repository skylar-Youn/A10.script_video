/**
 * Reinterpretation workflow manager for the video analysis dashboard.
 * Handles tone selection, API/ChatGPT flows, timeline edits, and panel updates.
 */
(function registerReinterpretationManager(global) {
    if (!global) {
        throw new Error('VideoAnalysisReinterpretationManager requires a window context');
    }

    class VideoAnalysisReinterpretationManager {
        constructor(appInstance) {
            this.app = appInstance;
        }

        /** Retrieves the tone <select> element. */
        get toneSelect() {
            return document.getElementById('reinterpret-tone');
        }

        /** Normalises tone keys for storage and comparison. */
        normalizeToneKey(tone) {
            if (tone === null || tone === undefined) {
                return 'neutral';
            }
            const key = String(tone).trim();
            if (!key) {
                return 'neutral';
            }
            return key.toLowerCase();
        }

        /** Sets the current tone both in the select element and on app state. */
        setTone(tone) {
            const resolvedTone = this.normalizeToneKey(tone);
            const select = this.toneSelect;

            let appliedTone = resolvedTone;
            if (select) {
                const match = Array.from(select.options || []).find(opt => this.normalizeToneKey(opt.value) === resolvedTone);
                if (match) {
                    select.value = match.value;
                    appliedTone = this.normalizeToneKey(match.value);
                } else {
                    select.value = resolvedTone;
                }
            }

            this.app.lastReinterpretationTone = appliedTone;
            return appliedTone;
        }

        /** Returns the current tone (falls back to last known value). */
        getTone() {
            const select = this.toneSelect;
            if (select && select.value) {
                const toneKey = this.normalizeToneKey(select.value);
                this.app.lastReinterpretationTone = toneKey;
                return toneKey;
            }
            return this.normalizeToneKey(this.app.lastReinterpretationTone);
        }

        /** Human readable tone label used in prompts. */
        describeToneLabel(tone) {
            const labels = {
                neutral: '표준',
                comic: '코믹',
                dramatic: '드라마틱',
                serious: '진중',
                thrilling: '긴장감'
            };
            const key = this.normalizeToneKey(tone);
            const select = this.toneSelect;

            if (labels[key]) {
                return labels[key];
            }

            if (select) {
                const match = Array.from(select.options || []).find(option => this.normalizeToneKey(option.value) === key);
                if (match && match.textContent) {
                    return match.textContent.trim();
                }
            }

            return key || '표준';
        }

        /** Builds the ChatGPT prompt text based on dialogue/description subtitles. */
        buildReinterpretationPrompt(dialogues, descriptions, tone = 'neutral') {
            const toneKey = this.normalizeToneKey(tone);
            const toneLabel = this.describeToneLabel(toneKey);
            const toneInstruction = toneLabel === '표준'
                ? '밸런스 있는 톤'
                : `${toneLabel} 느낌을 유지`;

            const instructions = [
                '당신은 전문 쇼츠 내레이션 작가입니다.',
                '주어진 대사와 설명 자막을 참고하여 새로운 내레이션 스크립트를 작성하세요.',
                '설명 자막(description track)을 대체할 새로운 문장을 각 자막별로 생성해야 합니다.',
                '최종 결과는 JSON 형식 {"outline": ["핵심 요약"], "script": "최종 내레이션", "replacements": [{"index": 설명자막_index, "new_text": "대체 문장", "target_length": 글자수}]} 로 작성하세요.',
                'replacements 배열은 설명 자막과 동일한 개수여야 하며, 각 new_text 길이는 target_length 이하(가능하면 ±3자 이내)로 유지해야 합니다.',
                'script 필드는 3~6문장 정도의 자연스러운 설명으로 제공해주세요.',
                `톤 가이드: ${toneLabel} (${toneInstruction}).`
            ].join('\n');

            const dialogueBlock = this.composeSubtitleBlock(dialogues, '[대사 목록]');
            const descriptionBlock = this.composeSubtitleBlock(descriptions, '[설명 자막]');

            return `${instructions}\n\n${dialogueBlock}\n\n${descriptionBlock}`;
        }

        composeSubtitleBlock(list, title) {
            if (!Array.isArray(list) || list.length === 0) {
                return `${title}: (데이터 없음)`;
            }

            const lines = [];
            const limit = 40;
            let order = 1;

            for (const item of list) {
                if (!item) continue;
                const text = (item.text || '').replace(/\s+/g, ' ').trim();
                if (!text) continue;

                const start = this.formatPromptTime(item.start_time ?? item.start);
                const end = this.formatPromptTime(item.end_time ?? item.end);
                const speaker = item.speaker_name || item.speaker || '';
                const speakerPrefix = speaker ? `[${speaker}] ` : '';

                if (title.includes('설명')) {
                    const originalIndex = Number.isInteger(item.original_index)
                        ? item.original_index
                        : (Number.isInteger(item.__source_index) ? item.__source_index : order - 1);
                    const targetLength = Number.isFinite(item.target_length) ? item.target_length : text.length;
                    lines.push(`${String(order).padStart(2, '0')}. desc_index=${originalIndex} target_length=${targetLength} ${start}-${end} ${speakerPrefix}${text}`);
                } else {
                    lines.push(`${String(order).padStart(2, '0')}. ${start}-${end} ${speakerPrefix}${text}`);
                }

                order += 1;
                if (lines.length >= limit) {
                    lines.push('... (이하 생략)');
                    break;
                }
            }

            if (!lines.length) {
                return `${title}: (데이터 없음)`;
            }

            return `${title}:\n${lines.join('\n')}`;
        }

        formatPromptTime(value) {
            if (value === null || value === undefined) {
                return '??:??';
            }
            const seconds = Number(value);
            if (!Number.isFinite(seconds)) {
                return '??:??';
            }
            const abs = Math.max(0, seconds);
            const minutes = Math.floor(abs / 60);
            const secs = Math.floor(abs % 60);
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        getSubtitlesByTrack(trackType) {
            const collected = [];
            const app = this.app;

            const pushWithIndex = (sub) => {
                if (!sub || !sub.text) return;
                const index = app.findSubtitleIndexForData(sub);
                if (index >= 0 && app.classifiedSubtitles && app.classifiedSubtitles[index]) {
                    app.classifiedSubtitles[index].__source_index = index;
                }
                const clone = { ...sub, __source_index: index };
                collected.push(clone);
            };

            if (app.timeline && app.timeline.speakerClassifiedSubtitles && Array.isArray(app.timeline.speakerClassifiedSubtitles[trackType])) {
                app.timeline.speakerClassifiedSubtitles[trackType].forEach(pushWithIndex);
            } else if (Array.isArray(app.classifiedSubtitles)) {
                app.classifiedSubtitles.forEach(sub => {
                    if (sub && sub.text && ((sub.assigned_track || sub.track || 'unassigned') === trackType)) {
                        pushWithIndex(sub);
                    }
                });
            }

            return collected;
        }

        async start() {
            const app = this.app;
            const reinterpretBtn = document.getElementById('reinterpret-results');
            if (!reinterpretBtn) {
                app.showError('재해석 기능을 사용할 수 없습니다');
                return;
            }

            if (!Array.isArray(app.classifiedSubtitles) || app.classifiedSubtitles.length === 0) {
                app.showError('재해석할 자막이 없습니다. 화자 인식 또는 자막 분석을 먼저 실행하세요.');
                return;
            }

            const dialogueSubtitles = this.getSubtitlesByTrack('main');
            const descriptionSubtitles = this.getSubtitlesByTrack('description');

            if (dialogueSubtitles.length === 0 && descriptionSubtitles.length === 0) {
                app.showError('대사(메인 자막) 또는 설명 자막이 없어 재해석을 진행할 수 없습니다.');
                return;
            }

            const modeSelect = document.getElementById('reinterpret-mode');
            const mode = modeSelect ? modeSelect.value : 'api';
            const tone = this.getTone();
            const originalLabel = reinterpretBtn.textContent;
            reinterpretBtn.disabled = true;
            reinterpretBtn.textContent = '🔄 재해석 중...';

            if (mode === 'chatgpt') {
                const promptText = this.buildReinterpretationPrompt(dialogueSubtitles, descriptionSubtitles, tone);
                const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(promptText)}`;
                try {
                    window.open(chatgptUrl, '_blank', 'width=1200,height=800');
                } catch (error) {
                    console.warn('ChatGPT 창을 여는 중 오류:', error);
                }

                reinterpretBtn.disabled = false;
                reinterpretBtn.textContent = originalLabel;

                this.prepareChatGPTReinterpretation(promptText, tone);
                app.showStatus('ChatGPT 창을 열었습니다. 결과를 붙여넣으면 적용됩니다.');
                app.lastReinterpretationPrompt = promptText;
                app.lastReinterpretationTone = tone;
                return;
            }

            app.showStatus('대사와 설명 자막을 분석하고 재해석 중입니다...');
            app.lastReinterpretationPrompt = null;
            app.lastReinterpretationTone = tone;

            const payload = {
                dialogue_subtitles: dialogueSubtitles.map(sub => app.normalizeSubtitleForPayload(sub, 'main', sub.__source_index)),
                description_subtitles: descriptionSubtitles.map(sub => app.normalizeSubtitleForPayload(sub, 'description', sub.__source_index)),
                metadata: {
                    selected_files: Array.from(app.selectedFiles || []),
                    generated_at: new Date().toISOString(),
                    analysis_method: app.currentAnalysisMethod || 'text',
                    tone
                }
            };

            try {
                const response = await fetch('/api/analysis/reinterpret', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`서버 오류 (${response.status}): ${errorText || '재해석을 완료할 수 없습니다.'}`);
                }

                const result = await response.json();
                if (result.status !== 'success' || !result.reinterpretation) {
                    throw new Error(result.error || '재해석 결과를 받을 수 없습니다.');
                }

                this.showResult(result.reinterpretation, result.outline || null);
                app.showSuccess('재해석 결과가 생성되었습니다.');
                app.showStatus('✅ 재해석 완료');

                const rawReplacements = Array.isArray(result.replacements) ? result.replacements : [];
                const sanitizedReplacements = rawReplacements.map(rep => this.normalizeReplacementPayload(rep)).filter(Boolean);
                const appliedReplacements = app.applyDescriptionReplacements(sanitizedReplacements, 'api');
                if (sanitizedReplacements.length > 0 && appliedReplacements.length === 0) {
                    app.showError('재해석 결과를 설명 자막에 적용하지 못했습니다.');
                }

                const resolvedTone = this.normalizeToneKey(result.tone || tone);
                this.setTone(resolvedTone);

                app.analysisResults.reinterpretation = {
                    script: result.reinterpretation,
                    outline: result.outline || null,
                    replacements: appliedReplacements,
                    source: 'api',
                    generated_at: new Date().toISOString(),
                    tone: resolvedTone
                };

            } catch (error) {
                console.error('재해석 실패:', error);
                app.showError(`재해석 중 오류가 발생했습니다: ${error.message}`);
                app.showStatus('⚠️ 재해석 실패');
            } finally {
                reinterpretBtn.disabled = false;
                reinterpretBtn.textContent = originalLabel;
            }
        }

        prepareChatGPTReinterpretation(promptText, tone) {
            const panel = document.getElementById('reinterpretation-panel');
            const textElement = document.getElementById('reinterpretation-text');
            if (!panel || !textElement) {
                console.warn('재해석 패널을 찾을 수 없습니다');
                return;
            }

            panel.style.display = 'flex';
            const escapedPrompt = this.app.escapeHtml(promptText);

            textElement.innerHTML = `
                <div class="chatgpt-guide">
                    <p>ChatGPT 창이 열렸습니다. 아래 프롬프트를 사용하여 JSON 형식의 재해석(설명 자막 대체 문장 포함)을 요청하고, 응답을 붙여넣어 주세요.</p>
                    <label>1. 사용 프롬프트
                        <textarea readonly id="reinterpretation-prompt" spellcheck="false">${escapedPrompt}</textarea>
                    </label>
                    <div class="guide-actions">
                        <button type="button" class="action-btn secondary" id="copy-reinterpretation-prompt">프롬프트 복사</button>
                    </div>
                    <label>2. ChatGPT 결과 붙여넣기
                        <textarea id="manual-reinterpret-result" placeholder='예시 JSON: {"outline": ["..."], "script": "...", "replacements": [{"index": 12, "new_text": "새 설명", "target_length": 18}] }'></textarea>
                    </label>
                    <div class="guide-actions">
                        <button type="button" class="action-btn secondary" id="manual-reinterpret-apply">결과 적용</button>
                    </div>
                </div>
            `;

            this.setTone(tone || this.getTone());

            const applyBtn = document.getElementById('manual-reinterpret-apply');
            if (applyBtn) {
                applyBtn.onclick = () => this.applyManualReinterpretation();
            }

            const copyPromptBtn = document.getElementById('copy-reinterpretation-prompt');
            if (copyPromptBtn) {
                copyPromptBtn.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(promptText);
                        this.app.showSuccess('프롬프트가 클립보드에 복사되었습니다');
                    } catch (error) {
                        console.error('프롬프트 복사 실패:', error);
                        this.app.showError('프롬프트를 복사하지 못했습니다. 직접 선택하여 복사해주세요.');
                    }
                };
            }
        }

        applyManualReinterpretation() {
            const textarea = document.getElementById('manual-reinterpret-result');
            if (!textarea) {
                this.app.showError('결과 입력 영역을 찾을 수 없습니다');
                return;
            }

            const rawText = textarea.value.trim();
            if (!rawText) {
                this.app.showError('ChatGPT 결과를 붙여넣어 주세요');
                return;
            }

            try {
                const parsed = this.parseManualReinterpretation(rawText);
                this.showResult(parsed.script, parsed.outline || null);
                this.app.showSuccess('재해석 결과가 적용되었습니다.');
                this.app.showStatus('✅ 수동 재해석 적용 완료');
                const appliedReplacements = this.app.applyDescriptionReplacements(parsed.replacements || [], 'chatgpt-manual');
                if (parsed.replacements && parsed.replacements.length && appliedReplacements.length === 0) {
                    this.app.showError('재해석 결과를 설명 자막에 대체하지 못했습니다. JSON 구조를 확인해주세요.');
                }
                const toneKey = this.normalizeToneKey(this.app.lastReinterpretationTone || this.getTone());
                this.setTone(toneKey);
                this.app.analysisResults.reinterpretation = {
                    script: parsed.script,
                    outline: parsed.outline || null,
                    replacements: appliedReplacements,
                    source: 'chatgpt-manual',
                    generated_at: new Date().toISOString(),
                    prompt: this.app.lastReinterpretationPrompt || null,
                    raw: rawText,
                    tone: toneKey
                };
            } catch (error) {
                console.error('수동 재해석 적용 실패:', error);
                this.app.showError(error.message || '결과를 적용할 수 없습니다');
            }
        }

        parseManualReinterpretation(rawText) {
            let outline = null;
            let script = rawText;
            let replacements = [];

            try {
                const parsed = JSON.parse(rawText);
                if (parsed && typeof parsed === 'object') {
                    const parsedOutline = parsed.outline;
                    if (Array.isArray(parsedOutline)) {
                        outline = parsedOutline.map(item => String(item).trim()).filter(Boolean);
                    }
                    if (typeof parsed.script === 'string' && parsed.script.trim()) {
                        script = parsed.script.trim();
                    }
                    if (Array.isArray(parsed.replacements)) {
                        replacements = parsed.replacements.map(rep => this.normalizeReplacementPayload(rep)).filter(Boolean);
                    }
                }
            } catch (error) {
                // JSON 파싱 실패 시 전체 텍스트를 스크립트로 사용
            }

            script = script.trim();
            if (!script) {
                throw new Error('재해석 스크립트를 확인할 수 없습니다. JSON 형식 또는 내레이션 문단을 붙여넣어 주세요.');
            }

            return { script, outline, replacements };
        }

        normalizeReplacementPayload(raw) {
            if (!raw || typeof raw !== 'object') {
                return null;
            }

            const rawIndex = raw.index ?? raw.original_index ?? raw.description_index ?? raw.target_index;
            const indexNum = Number(rawIndex);
            const resolvedIndex = Number.isFinite(indexNum) ? Math.round(indexNum) : null;
            const startNum = Number(raw.start_time ?? raw.start);
            const endNum = Number(raw.end_time ?? raw.end);
            const lengthCandidate = Number(raw.target_length ?? raw.length ?? raw.original_length);
            const targetLength = Number.isFinite(lengthCandidate) ? Math.max(0, Math.round(lengthCandidate)) : null;
            const text = (raw.new_text || raw.text || raw.replacement || '').toString().trim();
            if (!text) {
                return null;
            }
            const originalText = (raw.previous_text || raw.original_text || raw.old_text || '').toString().trim();
            const source = typeof raw.source === 'string' ? raw.source : null;
            const updatedAt = raw.updated_at || raw.updatedAt || null;
            return {
                index: resolvedIndex,
                start_time: Number.isFinite(startNum) ? startNum : null,
                end_time: Number.isFinite(endNum) ? endNum : null,
                target_length: targetLength,
                text,
                original_text: originalText,
                source,
                updated_at: updatedAt
            };
        }

        showResult(reinterpretationText, outline = null) {
            const panel = document.getElementById('reinterpretation-panel');
            const textElement = document.getElementById('reinterpretation-text');
            if (!panel || !textElement) {
                console.warn('재해석 결과 패널을 찾을 수 없습니다');
                return;
            }

            let displayText = reinterpretationText || '';
            if (Array.isArray(outline) && outline.length > 0) {
                const outlineText = outline.map((item, index) => `${index + 1}. ${item}`).join('\n');
                const reinterpretationBody = displayText ? `\n\n${displayText}` : '';
                displayText = `[개요]\n${outlineText}${reinterpretationBody}`;
            }

            textElement.textContent = displayText.trim();
            panel.style.display = 'flex';
        }

        hidePanel() {
            const panel = document.getElementById('reinterpretation-panel');
            if (panel) {
                panel.style.display = 'none';
            }
        }

        async copyResult() {
            const textElement = document.getElementById('reinterpretation-text');
            if (!textElement) {
                this.app.showError('복사할 재해석 결과가 없습니다');
                return;
            }

            const text = textElement.textContent?.trim() || '';
            if (!text) {
                this.app.showError('복사할 재해석 결과가 없습니다');
                return;
            }

            try {
                await navigator.clipboard.writeText(text);
                this.app.showSuccess('재해석 결과가 클립보드에 복사되었습니다');
            } catch (error) {
                console.error('클립보드 복사 실패:', error);
                this.app.showError('클립보드에 복사하지 못했습니다. 직접 선택해 복사해주세요.');
            }
        }

        updateComparison(index, trackType, options = {}) {
            const { forcePanel } = options;
            const panel = document.getElementById('reinterpretation-compare');
            if (!panel) {
                return;
            }

            const beforeEl = document.getElementById('reinterpretation-before-text');
            const afterInput = document.getElementById('reinterpretation-after-input');
            const metaEl = document.getElementById('reinterpretation-meta');

            if (!Number.isInteger(index) || trackType !== 'description') {
                if (!forcePanel) {
                    panel.style.display = 'none';
                }
                this.app.currentReinterpretationEditIndex = null;
                this.app.activeReinterpretationTrack = null;
                if (beforeEl) beforeEl.textContent = '';
                if (afterInput) afterInput.value = '';
                if (metaEl) metaEl.textContent = '';
                return;
            }

            const subtitle = (this.app.timeline && this.app.timeline.subtitleData && Array.isArray(this.app.timeline.subtitleData.subtitles))
                ? this.app.timeline.subtitleData.subtitles[index]
                : null;
            const history = this.app.reinterpretationHistory ? this.app.reinterpretationHistory[index] : null;

            const originalText = (history && history.original_text) || (subtitle && subtitle.__original_description_text) || '';
            const currentText = subtitle && typeof subtitle.text === 'string'
                ? subtitle.text
                : (history && history.updated_text) || '';

            if (!history && (!originalText || originalText.trim() === currentText.trim())) {
                panel.style.display = 'none';
                this.app.currentReinterpretationEditIndex = null;
                this.app.activeReinterpretationTrack = null;
                if (beforeEl) beforeEl.textContent = '';
                if (afterInput) afterInput.value = '';
                if (metaEl) metaEl.textContent = '';
                return;
            }

            if (beforeEl) {
                beforeEl.textContent = originalText ? originalText : '(원본 데이터가 없습니다)';
            }
            if (afterInput) {
                afterInput.value = currentText;
            }
            if (metaEl) {
                metaEl.textContent = this.buildReinterpretationMeta(index, history);
            }

            panel.style.display = 'flex';
            this.app.currentReinterpretationEditIndex = index;
            this.app.activeReinterpretationTrack = trackType;
        }

        refreshPanel() {
            if (!Number.isInteger(this.app.currentReinterpretationEditIndex)) {
                return;
            }
            const trackType = this.app.activeReinterpretationTrack || 'description';
            this.updateComparison(this.app.currentReinterpretationEditIndex, trackType);
        }

        applyEdit() {
            if (!Number.isInteger(this.app.currentReinterpretationEditIndex)) {
                this.app.showError('재해석 편집할 자막을 선택하세요');
                return;
            }
            const index = this.app.currentReinterpretationEditIndex;
            const textarea = document.getElementById('reinterpretation-after-input');
            if (!textarea) {
                this.app.showError('편집 영역을 찾을 수 없습니다');
                return;
            }

            const newText = textarea.value.trim();
            if (!newText) {
                this.app.showError('변경 후 내용을 입력하세요');
                return;
            }

            const subtitle = (this.app.timeline && this.app.timeline.subtitleData && Array.isArray(this.app.timeline.subtitleData.subtitles))
                ? this.app.timeline.subtitleData.subtitles[index]
                : null;
            const currentText = subtitle && typeof subtitle.text === 'string' ? subtitle.text.trim() : '';
            if (newText === currentText) {
                this.app.showInfo('변경된 내용이 없습니다');
                return;
            }

            const history = this.app.reinterpretationHistory ? this.app.reinterpretationHistory[index] : null;
            const originalText = history?.original_text || subtitle?.__original_description_text || currentText;

            this.app.updateSubtitleText(index, newText, {
                source: 'timeline-edit',
                forceHistory: Boolean(history || subtitle?.__original_description_text),
                originalText
            });

            this.app.renderHybridSubtitleTracks();
            this.updateComparison(index, 'description');
            this.app.showSuccess('재해석 결과가 타임라인에 적용되었습니다');

            Promise.resolve(this.app.refreshAllSRTSubtitlesWithUpdatedTracks())
                .catch(error => console.warn('재해석 편집 후 자막 목록 갱신 실패:', error));
        }

        revertEdit() {
            if (!Number.isInteger(this.app.currentReinterpretationEditIndex)) {
                this.app.showError('복원할 자막을 선택하세요');
                return;
            }

            const index = this.app.currentReinterpretationEditIndex;
            const history = this.app.reinterpretationHistory ? this.app.reinterpretationHistory[index] : null;
            const subtitle = (this.app.timeline && this.app.timeline.subtitleData && Array.isArray(this.app.timeline.subtitleData.subtitles))
                ? this.app.timeline.subtitleData.subtitles[index]
                : null;
            const originalText = history?.original_text || subtitle?.__original_description_text;

            if (!originalText) {
                this.app.showError('원본 자막 정보를 찾을 수 없습니다');
                return;
            }

            this.app.updateSubtitleText(index, originalText, {
                source: 'timeline-revert',
                forceHistory: true,
                originalText
            });

            const textarea = document.getElementById('reinterpretation-after-input');
            if (textarea) {
                textarea.value = originalText;
            }

            this.app.renderHybridSubtitleTracks();
            this.updateComparison(index, 'description');
            this.app.showSuccess('재해석 자막을 원본으로 되돌렸습니다');

            Promise.resolve(this.app.refreshAllSRTSubtitlesWithUpdatedTracks())
                .catch(error => console.warn('재해석 복원 후 자막 목록 갱신 실패:', error));
        }

        buildReinterpretationMeta(index, history) {
            const segments = [`자막 #${index + 1}`];
            if (history?.source) {
                segments.push(`출처: ${this.formatReinterpretationSource(history.source)}`);
            }
            if (history?.updated_at) {
                const formatted = this.formatTimestampForDisplay(history.updated_at);
                if (formatted) {
                    segments.push(`업데이트: ${formatted}`);
                }
            }
            if (history?.reverted) {
                segments.push('상태: 원본으로 복원됨');
            }
            return segments.join(' · ');
        }

        formatReinterpretationSource(source) {
            switch (source) {
                case 'api':
                    return 'API 재해석';
                case 'chatgpt-manual':
                    return 'ChatGPT 수동 적용';
                case 'chatgpt-prompt':
                    return 'ChatGPT 프롬프트';
                case 'timeline-edit':
                    return '타임라인 편집';
                case 'timeline-revert':
                    return '타임라인 복원';
                case 'speaker-change':
                    return '화자 분류 업데이트';
                default:
                    return source || '수동 편집';
            }
        }

        formatTimestampForDisplay(isoString) {
            if (!isoString) {
                return '';
            }
            const date = new Date(isoString);
            if (Number.isNaN(date.getTime())) {
                return '';
            }
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const mi = String(date.getMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
        }
    }

    global.VideoAnalysisReinterpretationManager = VideoAnalysisReinterpretationManager;
})(typeof window !== 'undefined' ? window : null);
