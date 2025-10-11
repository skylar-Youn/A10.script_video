/**
 * 유튜브 콘텐츠 분석 도구 - JavaScript 기능
 * 설계도에 따른 완전한 구현
 */

class VideoAnalysisApp {
    constructor() {
        this.staticEffectClasses = [
            'static-none',
            'static-outline',
            'static-shadow',
            'static-glow',
            'static-gradient',
            'static-neon'
        ];
        this.dynamicEffectClasses = [
            'dynamic-none',
            'dynamic-typewriter',
            'dynamic-wave',
            'dynamic-pulse',
            'dynamic-shake',
            'dynamic-fade',
            'dynamic-bounce',
            'dynamic-flip',
            'dynamic-slide',
            'dynamic-zoom',
            'dynamic-rotate',
            'dynamic-glitch',
            'dynamic-matrix',
            'dynamic-fire',
            'dynamic-rainbow'
        ];
        this.textMotionClasses = [
            'motion-none',
            'motion-fade',
            'motion-slide-up',
            'motion-slide-down',
            'motion-slide-left',
            'motion-slide-right',
            'motion-zoom-in',
            'motion-zoom-out',
            'motion-bounce',
            'motion-rotate',
            'motion-pulse'
        ];
        this.selectedFiles = new Set();
        this.selectedFilesOrder = []; // 파일 순서를 관리하는 배열
        this.hiddenFiles = new Set();
        this.lastHiddenFiles = new Set(); // 전체보기 전 숨긴 파일 백업
        this.fileMetadata = new Map();
        this.currentTab = 'audio';
        this.analysisResults = {};
        this.charts = {};
        this.speakerClassificationStorageKey = 'videoanalysis_saved_speaker_classification';
        this.speakerClassificationListKey = 'videoanalysis_saved_speaker_classifications';
        this.lastReinterpretationPrompt = null;
        this.lastReinterpretationTone = 'neutral';
        this.lastSelectedSavedSpeakerName = null;
        this.currentAnalysisMethod = null;
        this.reinterpretationHistory = {};
        this.currentReinterpretationEditIndex = null;
        this.activeReinterpretationTrack = null;
        this.cachedSavedResults = [];
        this.lastTranslatorProjectId = null;
        this.translatorApiBase = null;
        this.creatingTranslatorProject = false;
        this.commentaryAudioObjectUrl = null;
        this.commentaryAudioLocalFile = null;
        this.videoMuteState = false;
        this.requestedFolderPath = null;
        this.textStylePresetStorageKey = 'videoanalysis_text_style_presets';
        this.textStylePresetSelectedName = null;
        this.textStylePresetElements = null;
        this.realtimeStyleConfigs = {
            main: {
                overlayId: 'overlay-main-subtitle',
                fallbackId: 'current-subtitle',
                sizeInputId: 'realtime-main-size',
                sizeDisplayId: 'realtime-main-size-display',
                colorInputId: 'realtime-main-color',
                staticSelectId: 'realtime-main-static-effect',
                dynamicSelectId: 'realtime-main-dynamic-effect',
                outlineCheckboxId: 'realtime-main-outline',
                dynamicCheckboxId: 'realtime-main-dynamic',
                manualAttr: 'manualMainRealtimePosition'
            },
            description: {
                overlayId: 'overlay-description-subtitle',
                fallbackId: 'description-subtitle',
                sizeInputId: 'realtime-description-size',
                sizeDisplayId: 'realtime-description-size-display',
                colorInputId: 'realtime-description-color',
                staticSelectId: 'realtime-description-static-effect',
                dynamicSelectId: 'realtime-description-dynamic-effect',
                outlineCheckboxId: 'realtime-description-outline',
                dynamicCheckboxId: 'realtime-description-dynamic',
                manualAttr: 'manualDescriptionRealtimePosition'
            }
        };

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
        this.setupTitleOverlay();
        this.setupSubtitleOverlay();
        this.setupRealtimeSubtitleOverlays();
        this.setupGlobalTextEffects();
        this.setupTextStylePresetControls();
        this.setupRealtimeSubtitleStyleControls();
        this.loadFileList();
        this.loadFolderTree();
        this.updateUI();
        this.refreshSavedResultsList();

        try {
            const storedTranslatorId = window.localStorage.getItem('videoanalysis_last_translator_project_id');
            if (storedTranslatorId) {
                this.lastTranslatorProjectId = storedTranslatorId;
            }
        } catch (error) {
            console.warn('translator project id storage unavailable:', error);
        }

        // 숨긴 파일 목록 불러오기
        try {
            const storedHiddenFiles = window.localStorage.getItem('videoanalysis_hidden_files');
            if (storedHiddenFiles) {
                this.hiddenFiles = new Set(JSON.parse(storedHiddenFiles));
            }
        } catch (error) {
            console.warn('hidden files storage unavailable:', error);
        }

        // 영상 음소거 상태 복원
        try {
            const storedVideoMuteState = window.localStorage.getItem('videoanalysis_video_muted');
            if (storedVideoMuteState !== null) {
                this.videoMuteState = storedVideoMuteState === 'true';
                this.applyVideoMuteState();
            }
        } catch (error) {
            console.warn('video mute storage unavailable:', error);
        }

        // 재생 버튼 초기 상태 설정
        setTimeout(() => {
            this.updatePlayPauseButton();
        }, 100);
    }

    getTextOverlays() {
        const overlays = [];
        const titleOverlay = document.getElementById('video-title-overlay');
        if (titleOverlay) overlays.push(titleOverlay);
        const subtitleOverlay = document.getElementById('video-subtitle-overlay');
        if (subtitleOverlay) overlays.push(subtitleOverlay);
        const mainRealtimeOverlay = document.getElementById('overlay-main-subtitle');
        if (mainRealtimeOverlay) overlays.push(mainRealtimeOverlay);
        const descriptionRealtimeOverlay = document.getElementById('overlay-description-subtitle');
        if (descriptionRealtimeOverlay) overlays.push(descriptionRealtimeOverlay);
        return overlays;
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

        // 파일 숨기기/보이기
        document.getElementById('show-all-files').addEventListener('click', () => {
            this.showAllFiles();
        });

        document.getElementById('restore-hidden-files').addEventListener('click', () => {
            this.restoreHiddenFiles();
        });

        document.getElementById('delete-hidden-files').addEventListener('click', () => {
            this.deleteHiddenFiles();
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

        const importResultsBtn = document.getElementById('import-results');
        if (importResultsBtn) {
            importResultsBtn.addEventListener('click', () => {
                this.toggleSavedResultsPanel(true);
            });
        }

        const importResultsInput = document.getElementById('import-results-input');
        if (importResultsInput) {
            importResultsInput.addEventListener('change', (event) => {
                const file = event.target?.files?.[0];
                if (!file) return;
                this.importResultsFromFile(file);
            });
        }

        const uploadResultButton = document.getElementById('upload-result-button');
        if (uploadResultButton) {
            uploadResultButton.addEventListener('click', () => {
                const input = document.getElementById('import-results-input');
                if (input) {
                    input.value = '';
                    input.click();
                }
            });
        }

        const closeSavedButton = document.getElementById('close-saved-results');
        if (closeSavedButton) {
            closeSavedButton.addEventListener('click', () => this.toggleSavedResultsPanel(false));
        }

        const clearSavedButton = document.getElementById('clear-saved-results');
        if (clearSavedButton) {
            clearSavedButton.addEventListener('click', () => this.clearAllSavedResults());
        }

        const saveReportBtn = document.getElementById('save-report');
        if (saveReportBtn) {
            saveReportBtn.addEventListener('click', () => this.saveResultsToStorage());
        }

        this.setupReinterpretationEditingPanel();

        const reinterpretBtn = document.getElementById('reinterpret-results');
        if (reinterpretBtn) {
            reinterpretBtn.addEventListener('click', () => {
                this.startReinterpretation();
            });
        }

        const toneSelect = document.getElementById('reinterpret-tone');
        if (toneSelect) {
            toneSelect.addEventListener('change', () => {
                const toneKey = this.setReinterpretationTone(toneSelect.value);
                if (this.analysisResults && this.analysisResults.reinterpretation) {
                    this.analysisResults.reinterpretation.tone = toneKey;
                }
            });
        }

        const copyReinterpretBtn = document.getElementById('copy-reinterpretation');
        if (copyReinterpretBtn) {
            copyReinterpretBtn.addEventListener('click', () => {
                this.copyReinterpretationResult();
            });
        }

        const hideReinterpretBtn = document.getElementById('hide-reinterpretation');
        if (hideReinterpretBtn) {
            hideReinterpretBtn.addEventListener('click', () => {
                this.hideReinterpretationPanel();
            });
        }

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

        const openTimelineTranslationBtn = document.getElementById('open-timeline-translation');
        if (openTimelineTranslationBtn) {
            openTimelineTranslationBtn.addEventListener('click', () => {
                this.handleOpenTranslatorTimeline().catch(error => {
                    console.error('번역 타임라인 열기 실패:', error);
                    this.showError('번역 타임라인 편집기를 여는 중 오류가 발생했습니다.');
                });
            });
        }

        const openTimelineBtn = document.getElementById('open-timeline');
        if (openTimelineBtn) {
            openTimelineBtn.addEventListener('click', () => {
                this.openTimelineEditor();
            });
        }

        const openInTimelineBtn = document.getElementById('open-in-timeline');
        if (openInTimelineBtn) {
            openInTimelineBtn.addEventListener('click', () => {
                this.openTimelineEditor();
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

        // 음성 분리 기능 설정
        this.setupVocalSeparation();
    }

    makeOverlayDraggable(element, options = {}) {
        if (!element) {
            return;
        }

        const wrapper = options.wrapper || element.closest('.video-subtitle-wrapper');
        if (!wrapper) {
            return;
        }

        const manualAttr = options.manualAttr || 'manualPosition';
        const autoHookName = options.autoHookName || '__applyAutoPosition';
        const ensureHookName = options.ensureHookName || '__ensureWithinBounds';
        element.__manualAttrKey = manualAttr;
        const positionMode = options.positionMode || 'top-left';

        if (element.dataset[manualAttr] === undefined) {
            element.dataset[manualAttr] = 'false';
        }

        let manualPosition = element.dataset[manualAttr] === 'true';
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        const ensureAbsolutePosition = () => {
            if (element.style.position !== 'absolute') {
                element.style.position = 'absolute';
            }
        };

        const clampPosition = (left, top) => {
            if (typeof options.clampPosition === 'function') {
                return options.clampPosition({ left, top, wrapper, element });
            }

            const wrapperWidth = wrapper.clientWidth || 0;
            const wrapperHeight = wrapper.clientHeight || 0;
            const elementWidth = element.offsetWidth || 0;
            const elementHeight = element.offsetHeight || 0;

            let minLeft = 0;
            let maxLeft = Math.max(wrapperWidth - elementWidth, 0);

            if (positionMode === 'center-x') {
                const halfWidth = elementWidth / 2;
                minLeft = halfWidth;
                maxLeft = Math.max(wrapperWidth - halfWidth, halfWidth);
            }

            if (typeof options.horizontalBounds === 'function') {
                const hb = options.horizontalBounds({ wrapper, element }) || {};
                if (Number.isFinite(hb.min)) {
                    minLeft = hb.min;
                }
                if (Number.isFinite(hb.max)) {
                    maxLeft = hb.max;
                }
            }

            const clampedLeft = Math.min(Math.max(left, minLeft), maxLeft);

            let minTop = 0;
            let maxTop = Math.max(wrapperHeight - elementHeight, 0);
            if (typeof options.verticalBounds === 'function') {
                const vb = options.verticalBounds({ wrapper, element }) || {};
                if (Number.isFinite(vb.min)) {
                    minTop = vb.min;
                }
                if (Number.isFinite(vb.max)) {
                    maxTop = vb.max;
                }
            }

            const clampedTop = Math.min(Math.max(top, minTop), maxTop);
            return { left: clampedLeft, top: clampedTop };
        };

        const ensureWithinBounds = () => {
            ensureAbsolutePosition();
            const currentLeft = parseFloat(element.style.left) || 0;
            const currentTop = parseFloat(element.style.top) || 0;
            const clamped = clampPosition(currentLeft, currentTop);
            element.style.left = `${clamped.left}px`;
            element.style.top = `${clamped.top}px`;
        };

        const applyAutoPosition = (ignoreManual = false) => {
            manualPosition = element.dataset[manualAttr] === 'true';
            if (manualPosition && !ignoreManual) {
                ensureWithinBounds();
                return;
            }

            ensureAbsolutePosition();

            const context = {
                wrapper,
                element,
                manual: manualPosition
            };

            let targetLeft = parseFloat(element.style.left) || 0;
            let targetTop = parseFloat(element.style.top) || 0;

            if (typeof options.autoPosition === 'function') {
                const result = options.autoPosition(context) || {};
                if (Number.isFinite(result.left)) {
                    targetLeft = result.left;
                }
                if (Number.isFinite(result.top)) {
                    targetTop = result.top;
                }
            }

            const { left, top } = clampPosition(targetLeft, targetTop);
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        };

        const finishDrag = (event) => {
            if (!dragging) {
                return;
            }

            dragging = false;
            element.classList.remove('dragging');

            if (
                event &&
                event.pointerId !== undefined &&
                typeof element.hasPointerCapture === 'function' &&
                element.hasPointerCapture(event.pointerId) &&
                typeof element.releasePointerCapture === 'function'
            ) {
                element.releasePointerCapture(event.pointerId);
            }

            ensureWithinBounds();
        };

        element.addEventListener('pointerdown', (event) => {
            ensureAbsolutePosition();

            manualPosition = true;
            element.dataset[manualAttr] = 'true';
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = parseFloat(element.style.left) || 0;
            startTop = parseFloat(element.style.top) || 0;

            element.classList.add('dragging');

            if (typeof element.setPointerCapture === 'function' && event.pointerId !== undefined) {
                element.setPointerCapture(event.pointerId);
            }

            event.preventDefault();
        });

        element.addEventListener('pointermove', (event) => {
            if (!dragging) {
                return;
            }

            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;

            let targetLeft = startLeft + deltaX;
            let targetTop = startTop + deltaY;

            if (typeof options.onDrag === 'function') {
                const result = options.onDrag({
                    left: targetLeft,
                    top: targetTop,
                    wrapper,
                    element
                }) || {};
                if (Number.isFinite(result.left)) {
                    targetLeft = result.left;
                }
                if (Number.isFinite(result.top)) {
                    targetTop = result.top;
                }
            }

            const { left, top } = clampPosition(targetLeft, targetTop);
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        });

        element.addEventListener('pointerup', finishDrag);
        element.addEventListener('pointercancel', finishDrag);

        const handleResize = () => {
            if (!element.isConnected) {
                window.removeEventListener('resize', handleResize);
                return;
            }

            manualPosition = element.dataset[manualAttr] === 'true';
            if (manualPosition) {
                ensureWithinBounds();
            } else {
                applyAutoPosition(true);
            }
        };

        window.addEventListener('resize', handleResize);

        element[autoHookName] = (ignoreManual = false) => {
            applyAutoPosition(ignoreManual);
        };
        element[ensureHookName] = () => {
            ensureWithinBounds();
        };
        element.__autoPositionHook = element[autoHookName];
        element.__ensureWithinBoundsHook = element[ensureHookName];

        requestAnimationFrame(() => {
            applyAutoPosition(true);
        });
    }

    refreshOverlayAnimation(overlay) {
        if (!overlay) return;
        overlay.style.animation = 'none';
        void overlay.offsetWidth; // reflow to restart animation
        overlay.style.animation = '';
    }

    applyOverlayMotion(overlay, motionValue) {
        if (!overlay) return;
        const target = motionValue || 'none';
        const normalized = `motion-${target}`;
        this.textMotionClasses.forEach(cls => overlay.classList.remove(cls));
        const appliedClass = this.textMotionClasses.includes(normalized) ? normalized : 'motion-none';
        overlay.classList.add(appliedClass);
        overlay.dataset.motion = target;
        this.refreshOverlayAnimation(overlay);
    }

    applyOverlayStaticEffect(overlay, effectValue) {
        if (!overlay) return;
        const effect = effectValue || 'none';
        const normalized = `static-${effect}`;
        this.staticEffectClasses.forEach(cls => overlay.classList.remove(cls));
        const appliedClass = this.staticEffectClasses.includes(normalized) ? normalized : 'static-none';
        overlay.classList.add(appliedClass);
        overlay.dataset.staticEffect = effect;
        this.refreshOverlayAnimation(overlay);
    }

    applyOverlayDynamicEffect(overlay, effectValue) {
        if (!overlay) return;
        const effect = effectValue || 'none';
        const normalized = `dynamic-${effect}`;
        this.dynamicEffectClasses.forEach(cls => overlay.classList.remove(cls));
        const appliedClass = this.dynamicEffectClasses.includes(normalized) ? normalized : 'dynamic-none';
        overlay.classList.add(appliedClass);
        overlay.dataset.dynamicEffect = effect;
        this.refreshOverlayAnimation(overlay);
    }

    setupTitleOverlay() {
        const overlay = document.getElementById('video-title-overlay');
        if (!overlay) {
            return;
        }

        this.makeOverlayDraggable(overlay, {
            manualAttr: 'manualTitlePosition',
            autoHookName: '__autoPlaceTitleOverlay',
            ensureHookName: '__ensureTitleWithinBounds',
            positionMode: 'top-left',
            autoPosition: ({ wrapper, element }) => {
                const videoContainer = wrapper.querySelector('.video-player-container');
                const containerTop = videoContainer ? videoContainer.offsetTop : 0;
                const containerHeight = videoContainer ? videoContainer.offsetHeight : 0;
                const baseTop = containerTop + Math.max(containerHeight * 0.15, 24);
                const centeredLeft = Math.max((wrapper.clientWidth - element.offsetWidth) / 2, 0);
                return {
                    left: centeredLeft,
                    top: Math.max(baseTop, 12)
                };
            }
        });

        const videoEl = document.getElementById('video-player');
        if (videoEl) {
            videoEl.addEventListener('loadedmetadata', () => {
                if (overlay.dataset.manualTitlePosition !== 'true' && typeof overlay.__autoPlaceTitleOverlay === 'function') {
                    overlay.__autoPlaceTitleOverlay();
                } else if (typeof overlay.__ensureTitleWithinBounds === 'function') {
                    overlay.__ensureTitleWithinBounds();
                }
            });
        }

        overlay.classList.add('motion-none', 'static-none', 'dynamic-none');

        const titleInput = document.getElementById('video-title-input');
        const sizeInput = document.getElementById('video-title-size');
        const sizeDisplay = document.getElementById('video-title-size-display');
        const colorInput = document.getElementById('video-title-color');
        const motionSelect = document.getElementById('video-title-motion');
        const outlineCheckbox = document.getElementById('video-title-outline');
        const dynamicCheckbox = document.getElementById('video-title-dynamic');
        const globalStaticSelect = document.getElementById('static-effect');
        const globalDynamicSelect = document.getElementById('dynamic-effect');

        const updatePositionIfAuto = () => {
            if (overlay.dataset.manualTitlePosition !== 'true' && typeof overlay.__autoPlaceTitleOverlay === 'function') {
                requestAnimationFrame(() => overlay.__autoPlaceTitleOverlay());
            } else if (typeof overlay.__ensureTitleWithinBounds === 'function') {
                overlay.__ensureTitleWithinBounds();
            }
        };

        const updateText = () => {
            const raw = titleInput ? titleInput.value : '';
            const text = raw.trim();
            overlay.textContent = text || '영상 제목';
            overlay.classList.toggle('empty', text.length === 0);
            requestAnimationFrame(updatePositionIfAuto);
            this.refreshOverlayAnimation(overlay);
        };

        if (titleInput) {
            titleInput.addEventListener('input', updateText);
        }

        const updateSize = () => {
            const value = sizeInput ? parseInt(sizeInput.value, 10) : 48;
            const fontSize = Number.isFinite(value) ? value : 48;
            overlay.style.fontSize = `${fontSize}px`;
            if (sizeDisplay) {
                sizeDisplay.textContent = `${fontSize}px`;
            }
            requestAnimationFrame(updatePositionIfAuto);
            this.refreshOverlayAnimation(overlay);
        };

        if (sizeInput) {
            sizeInput.addEventListener('input', updateSize);
        }

        const updateColor = () => {
            if (!colorInput) return;
            const value = colorInput.value || '#ffffff';
            overlay.style.color = value;
        };

        if (colorInput) {
            colorInput.addEventListener('input', () => {
                updateColor();
                requestAnimationFrame(updatePositionIfAuto);
            });
        }

        const updateMotion = () => {
            const value = motionSelect ? motionSelect.value : 'none';
            this.applyOverlayMotion(overlay, value);
        };

        if (motionSelect) {
            motionSelect.addEventListener('change', () => {
                updateMotion();
                requestAnimationFrame(updatePositionIfAuto);
            });
        }

        const applyEffects = () => {
            if (outlineCheckbox) {
                overlay.classList.toggle('outline-effect', outlineCheckbox.checked);
            }
            if (dynamicCheckbox) {
                overlay.classList.toggle('dynamic-effect', dynamicCheckbox.checked);
            }
            requestAnimationFrame(updatePositionIfAuto);
            this.refreshOverlayAnimation(overlay);
        };

        if (outlineCheckbox) {
            outlineCheckbox.addEventListener('change', applyEffects);
        }
        if (dynamicCheckbox) {
            dynamicCheckbox.addEventListener('change', applyEffects);
        }

        updateText();
        updateSize();
        updateColor();
        updateMotion();
        this.applyOverlayStaticEffect(overlay, globalStaticSelect ? globalStaticSelect.value : 'none');
        this.applyOverlayDynamicEffect(overlay, globalDynamicSelect ? globalDynamicSelect.value : 'none');
        applyEffects();
    }

    setupGlobalTextEffects() {
        const staticSelect = document.getElementById('static-effect');
        const dynamicSelect = document.getElementById('dynamic-effect');

        const applyStatic = () => {
            const value = staticSelect ? staticSelect.value : 'none';
            this.getTextOverlays().forEach(overlay => this.applyOverlayStaticEffect(overlay, value));
        };

        const applyDynamic = () => {
            const value = dynamicSelect ? dynamicSelect.value : 'none';
            this.getTextOverlays().forEach(overlay => this.applyOverlayDynamicEffect(overlay, value));
        };

        if (staticSelect) {
            staticSelect.addEventListener('change', () => {
                applyStatic();
            });
        }

        if (dynamicSelect) {
            dynamicSelect.addEventListener('change', () => {
                applyDynamic();
            });
        }

        applyStatic();
        applyDynamic();
    }

    setupTextStylePresetControls() {
        const nameInput = document.getElementById('text-style-preset-name');
        const saveBtn = document.getElementById('save-text-style-preset');
        const select = document.getElementById('text-style-preset-select');
        const applyBtn = document.getElementById('apply-text-style-preset');
        const deleteBtn = document.getElementById('delete-text-style-preset');

        if (!nameInput || !saveBtn || !select || !applyBtn || !deleteBtn) {
            return;
        }

        this.textStylePresetElements = {
            nameInput,
            saveBtn,
            select,
            applyBtn,
            deleteBtn
        };

        saveBtn.addEventListener('click', () => this.handleSaveTextStylePreset());

        select.addEventListener('change', () => {
            const value = select.value;
            this.textStylePresetSelectedName = value || null;
            applyBtn.disabled = !value;
            deleteBtn.disabled = !value;
        });

        applyBtn.addEventListener('click', () => {
            const value = select.value;
            if (value) {
                this.applyTextStylePresetByName(value);
            }
        });

        deleteBtn.addEventListener('click', () => {
            const value = select.value;
            if (value) {
                this.deleteTextStylePreset(value);
            }
        });

        this.refreshTextStylePresetOptions();
    }

    setupRealtimeSubtitleStyleControls() {
        if (!this.realtimeStyleConfigs) {
            return;
        }

        Object.entries(this.realtimeStyleConfigs).forEach(([key, config]) => {
            this.initializeRealtimeStyleControl(key, config);
        });
    }

    initializeRealtimeStyleControl(key, config) {
        const overlay = document.getElementById(config.overlayId);
        if (!overlay) {
            return;
        }

        const fallback = document.getElementById(config.fallbackId);
        const sizeInput = document.getElementById(config.sizeInputId);
        const sizeDisplay = document.getElementById(config.sizeDisplayId);
        const colorInput = document.getElementById(config.colorInputId);
        const staticSelect = document.getElementById(config.staticSelectId);
        const dynamicSelect = document.getElementById(config.dynamicSelectId);
        const outlineCheckbox = document.getElementById(config.outlineCheckboxId);
        const dynamicCheckbox = document.getElementById(config.dynamicCheckboxId);

        const computedStyle = window.getComputedStyle(overlay);
        const initialFontSize = Math.round(parseFloat(computedStyle.fontSize) || 32);
        const initialColorHex = this.rgbToHex(computedStyle.color) || '#ffffff';
        const initialStaticEffect = overlay.dataset.staticEffect || 'none';
        const initialDynamicEffect = overlay.dataset.dynamicEffect || 'none';

        const applyFontSize = (value) => {
            if (!Number.isFinite(value)) {
                return;
            }
            overlay.style.fontSize = `${value}px`;
            if (fallback) {
                fallback.style.fontSize = `${value}px`;
            }
            this.refreshOverlayAnimation(overlay);
            if (fallback) {
                this.refreshOverlayAnimation(fallback);
            }
        };

        const applyColor = (value) => {
            if (!value) {
                return;
            }
            overlay.style.color = value;
            if (fallback) {
                fallback.style.color = value;
            }
        };

        const applyOutline = (enabled) => {
            overlay.classList.toggle('outline-effect', enabled);
            if (fallback) {
                fallback.classList.toggle('outline-effect', enabled);
            }
        };

        const applyDynamic = (enabled) => {
            overlay.classList.toggle('dynamic-effect', enabled);
            if (fallback) {
                fallback.classList.toggle('dynamic-effect', enabled);
            }
            this.refreshOverlayAnimation(overlay);
            if (fallback) {
                this.refreshOverlayAnimation(fallback);
            }
        };

        const applyStaticEffect = (effectValue) => {
            const value = effectValue || 'none';
            this.applyOverlayStaticEffect(overlay, value);
            if (fallback) {
                this.applyOverlayStaticEffect(fallback, value);
            }
        };

        const applyDynamicEffectSelect = (effectValue) => {
            const value = effectValue || 'none';
            this.applyOverlayDynamicEffect(overlay, value);
            if (fallback) {
                this.applyOverlayDynamicEffect(fallback, value);
            }
        };

        if (sizeInput) {
            sizeInput.value = initialFontSize;
            sizeInput.addEventListener('input', (event) => {
                const value = parseInt(event.target.value, 10);
                const fontSize = Number.isFinite(value) ? value : initialFontSize;
                if (sizeDisplay) {
                    sizeDisplay.textContent = `${fontSize}px`;
                }
                applyFontSize(fontSize);
            });
        }

        if (sizeDisplay) {
            sizeDisplay.textContent = `${initialFontSize}px`;
        }

        if (colorInput) {
            colorInput.value = initialColorHex;
            colorInput.addEventListener('input', (event) => {
                const value = event.target.value || '#ffffff';
                applyColor(value);
            });
        }

        if (staticSelect) {
            staticSelect.value = initialStaticEffect;
            staticSelect.addEventListener('change', (event) => {
                applyStaticEffect(event.target.value);
            });
        }

        if (outlineCheckbox) {
            outlineCheckbox.checked = overlay.classList.contains('outline-effect');
            outlineCheckbox.addEventListener('change', (event) => {
                applyOutline(event.target.checked);
            });
        }

        if (dynamicCheckbox) {
            dynamicCheckbox.checked = overlay.classList.contains('dynamic-effect');
            dynamicCheckbox.addEventListener('change', (event) => {
                applyDynamic(event.target.checked);
            });
        }

        if (dynamicSelect) {
            dynamicSelect.value = initialDynamicEffect;
            dynamicSelect.addEventListener('change', (event) => {
                applyDynamicEffectSelect(event.target.value);
            });
        }

        // 초기 적용
        applyFontSize(initialFontSize);
        applyColor(initialColorHex);
        applyStaticEffect(initialStaticEffect);
        if (outlineCheckbox) {
            applyOutline(outlineCheckbox.checked);
        }
        if (dynamicCheckbox) {
            applyDynamic(dynamicCheckbox.checked);
        }
        if (dynamicSelect) {
            applyDynamicEffectSelect(dynamicSelect.value);
        }
    }

    getTextStylePresets() {
        try {
            const stored = window.localStorage.getItem(this.textStylePresetStorageKey);
            if (!stored) {
                return [];
            }
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('text style preset storage unavailable:', error);
            return [];
        }
    }

    setTextStylePresets(presets) {
        try {
            window.localStorage.setItem(this.textStylePresetStorageKey, JSON.stringify(presets));
        } catch (error) {
            console.error('Failed to persist text style presets:', error);
            if (typeof this.showError === 'function') {
                this.showError('스타일 프리셋을 저장할 수 없습니다: ' + error.message);
            }
        }
    }

    rgbToHex(color) {
        if (!color) {
            return null;
        }

        if (color.startsWith('#')) {
            return color;
        }

        const rgbaMatch = color.match(/rgba?\s*\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!rgbaMatch) {
            return null;
        }

        const toHex = (value) => {
            const intVal = Math.max(0, Math.min(255, parseInt(value, 10)));
            return intVal.toString(16).padStart(2, '0');
        };

        const r = toHex(rgbaMatch[1]);
        const g = toHex(rgbaMatch[2]);
        const b = toHex(rgbaMatch[3]);
        return `#${r}${g}${b}`;
    }

    refreshTextStylePresetOptions() {
        const elements = this.textStylePresetElements;
        if (!elements) {
            return;
        }

        const { select, applyBtn, deleteBtn } = elements;
        const presets = this.getTextStylePresets()
            .map(preset => ({
                ...preset,
                savedAt: preset.savedAt || preset.saved_at || null
            }))
            .sort((a, b) => {
                const aTime = a.savedAt ? new Date(a.savedAt).getTime() : 0;
                const bTime = b.savedAt ? new Date(b.savedAt).getTime() : 0;
                return bTime - aTime;
            });

        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '저장된 프리셋 선택';
        select.appendChild(placeholder);

        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.name;
            const timestamp = this.formatTimestampForDisplay ? this.formatTimestampForDisplay(preset.savedAt) : '';
            option.textContent = timestamp ? `${preset.name} (${timestamp})` : preset.name;
            select.appendChild(option);
        });

        if (this.textStylePresetSelectedName) {
            select.value = this.textStylePresetSelectedName;
        }

        const hasSelection = !!select.value;
        applyBtn.disabled = !hasSelection;
        deleteBtn.disabled = !hasSelection;
    }

    collectCurrentTextStylePreset() {
        const normalizePosition = (value) => {
            if (typeof value !== 'string') {
                return null;
            }
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        };

        const titleOverlay = document.getElementById('video-title-overlay');
        const subtitleOverlay = document.getElementById('video-subtitle-overlay');
        const titleInput = document.getElementById('video-title-input');
        const titleSizeInput = document.getElementById('video-title-size');
        const titleColorInput = document.getElementById('video-title-color');
        const titleMotionSelect = document.getElementById('video-title-motion');
        const titleOutlineCheckbox = document.getElementById('video-title-outline');
        const titleDynamicCheckbox = document.getElementById('video-title-dynamic');

        const subtitleInput = document.getElementById('video-subtitle-input');
        const subtitleSizeInput = document.getElementById('video-subtitle-size');
        const subtitleColorInput = document.getElementById('video-subtitle-color');
        const subtitleMotionSelect = document.getElementById('video-subtitle-motion');
        const subtitleOutlineCheckbox = document.getElementById('video-subtitle-outline');
        const subtitleDynamicCheckbox = document.getElementById('video-subtitle-dynamic');

        const staticSelect = document.getElementById('static-effect');
        const dynamicSelect = document.getElementById('dynamic-effect');

        const titleFontSize = titleSizeInput ? parseInt(titleSizeInput.value, 10) : null;
        const subtitleFontSize = subtitleSizeInput ? parseInt(subtitleSizeInput.value, 10) : null;

        const collectRealtimeStyle = (key) => {
            const config = this.realtimeStyleConfigs?.[key];
            if (!config) {
                return null;
            }

            const overlay = document.getElementById(config.overlayId);
            const sizeInput = document.getElementById(config.sizeInputId);
            const colorInput = document.getElementById(config.colorInputId);
            const staticSelect = document.getElementById(config.staticSelectId);
            const dynamicSelect = document.getElementById(config.dynamicSelectId);
            const outlineCheckbox = document.getElementById(config.outlineCheckboxId);
            const dynamicCheckbox = document.getElementById(config.dynamicCheckboxId);

            const fontSizeRaw = sizeInput ? parseInt(sizeInput.value, 10) : null;
            const fontSize = Number.isFinite(fontSizeRaw) ? fontSizeRaw : null;

            return {
                fontSize,
                color: colorInput ? colorInput.value : null,
                outline: outlineCheckbox ? !!outlineCheckbox.checked : false,
                dynamic: dynamicCheckbox ? !!dynamicCheckbox.checked : false,
                manualPosition: overlay ? overlay.dataset[config.manualAttr] === 'true' : false,
                left: overlay && overlay.dataset[config.manualAttr] === 'true' ? (overlay.style.left || null) : null,
                top: overlay && overlay.dataset[config.manualAttr] === 'true' ? (overlay.style.top || null) : null,
                staticEffect: staticSelect ? staticSelect.value : (overlay ? overlay.dataset.staticEffect || 'none' : 'none'),
                dynamicEffect: dynamicSelect ? dynamicSelect.value : (overlay ? overlay.dataset.dynamicEffect || 'none' : 'none')
            };
        };

        return {
            title: {
                text: titleInput ? titleInput.value : '',
                fontSize: Number.isFinite(titleFontSize) ? titleFontSize : null,
                color: titleColorInput ? titleColorInput.value : null,
                motion: titleMotionSelect ? titleMotionSelect.value : null,
                outline: titleOutlineCheckbox ? !!titleOutlineCheckbox.checked : false,
                dynamic: titleDynamicCheckbox ? !!titleDynamicCheckbox.checked : false,
                manualPosition: titleOverlay ? titleOverlay.dataset.manualTitlePosition === 'true' : false,
                left: titleOverlay ? normalizePosition(titleOverlay.style.left) : null,
                top: titleOverlay ? normalizePosition(titleOverlay.style.top) : null
            },
            subtitle: {
                text: subtitleInput ? subtitleInput.value : '',
                fontSize: Number.isFinite(subtitleFontSize) ? subtitleFontSize : null,
                color: subtitleColorInput ? subtitleColorInput.value : null,
                motion: subtitleMotionSelect ? subtitleMotionSelect.value : null,
                outline: subtitleOutlineCheckbox ? !!subtitleOutlineCheckbox.checked : false,
                dynamic: subtitleDynamicCheckbox ? !!subtitleDynamicCheckbox.checked : false,
                manualPosition: subtitleOverlay ? subtitleOverlay.dataset.manualSubtitlePosition === 'true' : false,
                left: subtitleOverlay ? normalizePosition(subtitleOverlay.style.left) : null,
                top: subtitleOverlay ? normalizePosition(subtitleOverlay.style.top) : null
            },
            global: {
                staticEffect: staticSelect ? staticSelect.value : 'none',
                dynamicEffect: dynamicSelect ? dynamicSelect.value : 'none'
            },
            realtime: {
                main: collectRealtimeStyle('main'),
                description: collectRealtimeStyle('description')
            }
        };
    }

    applyTextStylePresetByName(name) {
        if (!name) {
            return;
        }

        const preset = this.getTextStylePresets().find(item => item.name === name);
        if (!preset) {
            if (typeof this.showError === 'function') {
                this.showError(`"${name}" 프리셋을 찾을 수 없습니다.`);
            }
            return;
        }

        this.applyTextStylePreset(preset);
        if (typeof this.showSuccess === 'function') {
            this.showSuccess(`"${preset.name}" 스타일 프리셋을 적용했습니다.`);
        }
    }

    applyTextStylePreset(preset) {
        if (!preset) {
            return;
        }

        const titleInput = document.getElementById('video-title-input');
        const titleSizeInput = document.getElementById('video-title-size');
        const titleColorInput = document.getElementById('video-title-color');
        const titleMotionSelect = document.getElementById('video-title-motion');
        const titleOutlineCheckbox = document.getElementById('video-title-outline');
        const titleDynamicCheckbox = document.getElementById('video-title-dynamic');

        const subtitleInput = document.getElementById('video-subtitle-input');
        const subtitleSizeInput = document.getElementById('video-subtitle-size');
        const subtitleColorInput = document.getElementById('video-subtitle-color');
        const subtitleMotionSelect = document.getElementById('video-subtitle-motion');
        const subtitleOutlineCheckbox = document.getElementById('video-subtitle-outline');
        const subtitleDynamicCheckbox = document.getElementById('video-subtitle-dynamic');

        const staticSelect = document.getElementById('static-effect');
        const dynamicSelect = document.getElementById('dynamic-effect');

        const dispatchValue = (element, value, eventType = 'input') => {
            if (!element || value === undefined || value === null) {
                return;
            }
            element.value = `${value}`;
            element.dispatchEvent(new Event(eventType, { bubbles: true }));
        };

        const dispatchCheckbox = (element, checked) => {
            if (element === null || element === undefined || checked === undefined || checked === null) {
                return;
            }
            element.checked = !!checked;
            element.dispatchEvent(new Event('change', { bubbles: true }));
        };

        if (preset.title) {
            dispatchValue(titleInput, preset.title.text ?? '', 'input');
            if (Number.isFinite(preset.title.fontSize) && titleSizeInput) {
                dispatchValue(titleSizeInput, preset.title.fontSize, 'input');
            }
            if (preset.title.color && titleColorInput) {
                dispatchValue(titleColorInput, preset.title.color, 'input');
            }
            if (preset.title.motion && titleMotionSelect) {
                dispatchValue(titleMotionSelect, preset.title.motion, 'change');
            }
            dispatchCheckbox(titleOutlineCheckbox, preset.title.outline);
            dispatchCheckbox(titleDynamicCheckbox, preset.title.dynamic);
        }

        if (preset.subtitle) {
            dispatchValue(subtitleInput, preset.subtitle.text ?? '', 'input');
            if (Number.isFinite(preset.subtitle.fontSize) && subtitleSizeInput) {
                dispatchValue(subtitleSizeInput, preset.subtitle.fontSize, 'input');
            }
            if (preset.subtitle.color && subtitleColorInput) {
                dispatchValue(subtitleColorInput, preset.subtitle.color, 'input');
            }
            if (preset.subtitle.motion && subtitleMotionSelect) {
                dispatchValue(subtitleMotionSelect, preset.subtitle.motion, 'change');
            }
            dispatchCheckbox(subtitleOutlineCheckbox, preset.subtitle.outline);
            dispatchCheckbox(subtitleDynamicCheckbox, preset.subtitle.dynamic);
        }

        if (preset.global) {
            if (staticSelect && preset.global.staticEffect) {
                dispatchValue(staticSelect, preset.global.staticEffect, 'change');
            }
            if (dynamicSelect && preset.global.dynamicEffect) {
                dispatchValue(dynamicSelect, preset.global.dynamicEffect, 'change');
            }
        }

        const applyRealtimeFromPreset = (key, data) => {
            if (!data || !this.realtimeStyleConfigs) {
                return;
            }

            const config = this.realtimeStyleConfigs[key];
            if (!config) {
                return;
            }

            const sizeInput = document.getElementById(config.sizeInputId);
            const colorInput = document.getElementById(config.colorInputId);
            const staticSelect = document.getElementById(config.staticSelectId);
            const dynamicSelect = document.getElementById(config.dynamicSelectId);
            const outlineCheckbox = document.getElementById(config.outlineCheckboxId);
            const dynamicCheckbox = document.getElementById(config.dynamicCheckboxId);
            const overlay = document.getElementById(config.overlayId);

            if (sizeInput && Number.isFinite(data.fontSize)) {
                dispatchValue(sizeInput, data.fontSize, 'input');
            }

            if (colorInput && data.color) {
                dispatchValue(colorInput, data.color, 'input');
            }

            if (staticSelect && data.staticEffect) {
                dispatchValue(staticSelect, data.staticEffect, 'change');
            }

            dispatchCheckbox(outlineCheckbox, data.outline);
            dispatchCheckbox(dynamicCheckbox, data.dynamic);

            if (dynamicSelect && data.dynamicEffect) {
                dispatchValue(dynamicSelect, data.dynamicEffect, 'change');
            }

            if (overlay) {
                applyManualPosition(overlay, config.manualAttr, data);
            }
        };

        const applyManualPosition = (overlay, manualAttr, data) => {
            if (!overlay || !data) {
                return;
            }

            const manual = !!data.manualPosition;
            overlay.dataset[manualAttr] = manual ? 'true' : 'false';

            if (manual) {
                if (data.left !== undefined && data.left !== null) {
                    overlay.style.left = data.left;
                }
                if (data.top !== undefined && data.top !== null) {
                    overlay.style.top = data.top;
                }
                if (typeof overlay.__ensureWithinBoundsHook === 'function') {
                    overlay.__ensureWithinBoundsHook();
                }
            } else {
                if (data.left !== undefined) {
                    overlay.style.left = '';
                }
                if (data.top !== undefined) {
                    overlay.style.top = '';
                }
                if (typeof overlay.__autoPositionHook === 'function') {
                    overlay.__autoPositionHook(true);
                }
            }
        };

        const titleOverlay = document.getElementById('video-title-overlay');
        const subtitleOverlay = document.getElementById('video-subtitle-overlay');

        if (preset.title && titleOverlay) {
            applyManualPosition(titleOverlay, 'manualTitlePosition', preset.title);
        }

        if (preset.subtitle && subtitleOverlay) {
            applyManualPosition(subtitleOverlay, 'manualSubtitlePosition', preset.subtitle);
        }

        if (preset.realtime) {
            applyRealtimeFromPreset('main', preset.realtime.main);
            applyRealtimeFromPreset('description', preset.realtime.description);
        }

        if (this.textStylePresetElements) {
            this.textStylePresetElements.nameInput.value = preset.name || '';
        }

        this.textStylePresetSelectedName = preset.name || null;
        this.refreshTextStylePresetOptions();
    }

    handleSaveTextStylePreset() {
        if (!this.textStylePresetElements) {
            return;
        }

        const { nameInput } = this.textStylePresetElements;
        const rawName = (nameInput.value || '').trim();
        const fallbackName = `스타일 프리셋 ${this.formatTimestampForDisplay(new Date().toISOString())}`;
        const name = rawName || fallbackName;

        if (!name) {
            if (typeof this.showError === 'function') {
                this.showError('프리셋 이름을 입력해 주세요.');
            }
            return;
        }

        const presetData = this.collectCurrentTextStylePreset();
        presetData.name = name;
        presetData.savedAt = new Date().toISOString();

        const presets = this.getTextStylePresets();
        const existingIndex = presets.findIndex(item => item.name === name);

        if (existingIndex >= 0) {
            const overwrite = window.confirm(`"${name}" 프리셋이 이미 존재합니다. 덮어쓰시겠습니까?`);
            if (!overwrite) {
                return;
            }
            presets[existingIndex] = presetData;
        } else {
            presets.push(presetData);
        }

        this.setTextStylePresets(presets);
        this.textStylePresetSelectedName = name;
        this.textStylePresetElements.nameInput.value = name;
        this.refreshTextStylePresetOptions();

        if (typeof this.showSuccess === 'function') {
            this.showSuccess(`"${name}" 스타일 프리셋을 저장했습니다.`);
        }
    }

    deleteTextStylePreset(name) {
        const presets = this.getTextStylePresets();
        const index = presets.findIndex(item => item.name === name);

        if (index === -1) {
            if (typeof this.showError === 'function') {
                this.showError(`"${name}" 프리셋을 찾을 수 없습니다.`);
            }
            return;
        }

        const confirmed = window.confirm(`"${name}" 프리셋을 삭제하시겠습니까?`);
        if (!confirmed) {
            return;
        }

        presets.splice(index, 1);
        this.setTextStylePresets(presets);
        this.textStylePresetSelectedName = null;
        if (this.textStylePresetElements) {
            this.textStylePresetElements.select.value = '';
            this.textStylePresetElements.applyBtn.disabled = true;
            this.textStylePresetElements.deleteBtn.disabled = true;
        }
        this.refreshTextStylePresetOptions();

        if (typeof this.showSuccess === 'function') {
            this.showSuccess(`"${name}" 프리셋을 삭제했습니다.`);
        }
    }

    setupSubtitleOverlay() {
        const overlay = document.getElementById('video-subtitle-overlay');
        if (!overlay) {
            return;
        }

        this.makeOverlayDraggable(overlay, {
            manualAttr: 'manualSubtitlePosition',
            autoHookName: '__autoPlaceSubtitleOverlay',
            ensureHookName: '__ensureSubtitleOverlayWithinBounds',
            positionMode: 'top-left',
            autoPosition: ({ wrapper, element }) => {
                const videoContainer = wrapper.querySelector('.video-player-container');
                const containerTop = videoContainer ? videoContainer.offsetTop : 0;
                const containerHeight = videoContainer ? videoContainer.offsetHeight : 0;
                const baseTop = containerTop + Math.max(containerHeight * 0.35, 64);
                const centeredLeft = Math.max((wrapper.clientWidth - element.offsetWidth) / 2, 0);
                return {
                    left: centeredLeft,
                    top: Math.max(baseTop, 36)
                };
            }
        });

        const subtitleInput = document.getElementById('video-subtitle-input');
        const sizeInput = document.getElementById('video-subtitle-size');
        const sizeDisplay = document.getElementById('video-subtitle-size-display');
        const colorInput = document.getElementById('video-subtitle-color');
        const motionSelect = document.getElementById('video-subtitle-motion');
        const outlineCheckbox = document.getElementById('video-subtitle-outline');
        const dynamicCheckbox = document.getElementById('video-subtitle-dynamic');
        const globalStaticSelect = document.getElementById('static-effect');
        const globalDynamicSelect = document.getElementById('dynamic-effect');

        overlay.classList.add('motion-none', 'static-none', 'dynamic-none');

        const updatePositionIfAuto = () => {
            if (overlay.dataset.manualSubtitlePosition !== 'true' && typeof overlay.__autoPlaceSubtitleOverlay === 'function') {
                requestAnimationFrame(() => overlay.__autoPlaceSubtitleOverlay());
            } else if (typeof overlay.__ensureSubtitleOverlayWithinBounds === 'function') {
                overlay.__ensureSubtitleOverlayWithinBounds();
            }
        };

        const updateText = () => {
            const raw = subtitleInput ? subtitleInput.value : '';
            const text = raw.trim();
            overlay.textContent = text || '영상 부제목';
            overlay.classList.toggle('empty', text.length === 0);
            requestAnimationFrame(updatePositionIfAuto);
            this.refreshOverlayAnimation(overlay);
        };

        if (subtitleInput) {
            subtitleInput.addEventListener('input', updateText);
        }

        const updateSize = () => {
            const value = sizeInput ? parseInt(sizeInput.value, 10) : 32;
            const fontSize = Number.isFinite(value) ? value : 32;
            overlay.style.fontSize = `${fontSize}px`;
            if (sizeDisplay) {
                sizeDisplay.textContent = `${fontSize}px`;
            }
            requestAnimationFrame(updatePositionIfAuto);
            this.refreshOverlayAnimation(overlay);
        };

        if (sizeInput) {
            sizeInput.addEventListener('input', updateSize);
        }

        const updateColor = () => {
            if (!colorInput) return;
            const value = colorInput.value || '#ffe14d';
            overlay.style.color = value;
        };

        if (colorInput) {
            colorInput.addEventListener('input', () => {
                updateColor();
                requestAnimationFrame(updatePositionIfAuto);
            });
        }

        const updateMotion = () => {
            const value = motionSelect ? motionSelect.value : 'none';
            this.applyOverlayMotion(overlay, value);
        };

        if (motionSelect) {
            motionSelect.addEventListener('change', () => {
                updateMotion();
                requestAnimationFrame(updatePositionIfAuto);
            });
        }

        const applyEffects = () => {
            if (outlineCheckbox) {
                overlay.classList.toggle('outline-effect', outlineCheckbox.checked);
            }
            if (dynamicCheckbox) {
                overlay.classList.toggle('dynamic-effect', dynamicCheckbox.checked);
            }
            requestAnimationFrame(updatePositionIfAuto);
            this.refreshOverlayAnimation(overlay);
        };

        if (outlineCheckbox) {
            outlineCheckbox.addEventListener('change', applyEffects);
        }
        if (dynamicCheckbox) {
            dynamicCheckbox.addEventListener('change', applyEffects);
        }

        const videoEl = document.getElementById('video-player');
        if (videoEl) {
            videoEl.addEventListener('loadedmetadata', () => {
                if (overlay.dataset.manualSubtitlePosition !== 'true' && typeof overlay.__autoPlaceSubtitleOverlay === 'function') {
                    overlay.__autoPlaceSubtitleOverlay();
                } else if (typeof overlay.__ensureSubtitleOverlayWithinBounds === 'function') {
                    overlay.__ensureSubtitleOverlayWithinBounds();
                }
            });
        }
        updateText();
        updateSize();
        updateColor();
        updateMotion();
        this.applyOverlayStaticEffect(overlay, globalStaticSelect ? globalStaticSelect.value : 'none');
        this.applyOverlayDynamicEffect(overlay, globalDynamicSelect ? globalDynamicSelect.value : 'none');
        applyEffects();
    }

    setupRealtimeSubtitleOverlays() {
        const mainOverlay = document.getElementById('overlay-main-subtitle');
        const descriptionOverlay = document.getElementById('overlay-description-subtitle');
        const staticSelect = document.getElementById('static-effect');
        const dynamicSelect = document.getElementById('dynamic-effect');

        const applyInitialEffects = (overlay) => {
            if (!overlay) return;
            overlay.classList.add('motion-none', 'static-none', 'dynamic-none', 'empty');
            overlay.style.display = 'none';
            this.applyOverlayStaticEffect(overlay, staticSelect ? staticSelect.value : 'none');
            this.applyOverlayDynamicEffect(overlay, dynamicSelect ? dynamicSelect.value : 'none');
        };

        if (mainOverlay) {
            this.makeOverlayDraggable(mainOverlay, {
                manualAttr: 'manualMainRealtimePosition',
                autoHookName: '__autoPlaceMainRealtimeOverlay',
                ensureHookName: '__ensureMainRealtimeWithinBounds',
                positionMode: 'center-x',
                autoPosition: ({ wrapper }) => {
                    const videoContainer = wrapper.querySelector('.video-player-container');
                    const containerBottom = videoContainer
                        ? videoContainer.offsetTop + videoContainer.offsetHeight
                        : wrapper.clientHeight * 0.75;
                    return {
                        left: wrapper.clientWidth / 2,
                        top: containerBottom + 16
                    };
                }
            });
            applyInitialEffects(mainOverlay);
            if (typeof mainOverlay.__autoPositionHook === 'function') {
                mainOverlay.__autoPositionHook(true);
            }
        }

        if (descriptionOverlay) {
            this.makeOverlayDraggable(descriptionOverlay, {
                manualAttr: 'manualDescriptionRealtimePosition',
                autoHookName: '__autoPlaceDescriptionRealtimeOverlay',
                ensureHookName: '__ensureDescriptionRealtimeWithinBounds',
                positionMode: 'center-x',
                autoPosition: ({ wrapper }) => {
                    const videoContainer = wrapper.querySelector('.video-player-container');
                    const containerBottom = videoContainer
                        ? videoContainer.offsetTop + videoContainer.offsetHeight
                        : wrapper.clientHeight * 0.75;
                    return {
                        left: wrapper.clientWidth / 2,
                        top: containerBottom + 70
                    };
                }
            });
            applyInitialEffects(descriptionOverlay);
            if (typeof descriptionOverlay.__autoPositionHook === 'function') {
                descriptionOverlay.__autoPositionHook(true);
            }
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
                this.seekTime(-10);
            });
        }

        const forwardBtn = document.getElementById('forward-btn');
        if (forwardBtn) {
            forwardBtn.addEventListener('click', () => {
                this.seekTime(10);
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

            // URL에서 path 파라미터 읽기
            const urlParams = new URLSearchParams(window.location.search);
            const pathParam = urlParams.get('path');

            let url = `/api/files?filter_type=${filterType}`;
            if (pathParam) {
                const sanitizedParam = pathParam.replace(/^\/+/g, '').replace(/\.\./g, '');
                if (sanitizedParam) {
                    const fullPath = `/home/sk/ws/youtubeanalysis/${sanitizedParam}`;
                    url += `&path=${encodeURIComponent(fullPath)}`;
                }
            }

            const response = await fetch(url);
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

            const urlParams = new URLSearchParams(window.location.search);
            const pathParam = urlParams.get('path');
            const params = new URLSearchParams();

            if (pathParam) {
                const sanitizedParam = pathParam.replace(/^\/+/g, '').replace(/\.\./g, '');
                if (sanitizedParam) {
                    const fullPath = `/home/sk/ws/youtubeanalysis/${sanitizedParam}`;
                    params.set('path', fullPath);
                    params.set('depth', '6');
                    this.requestedFolderPath = fullPath;
                } else {
                    this.requestedFolderPath = null;
                }
            } else {
                this.requestedFolderPath = null;
            }

            if (!params.has('depth')) {
                params.set('depth', '3');
            }

            const queryString = params.toString();
            const url = queryString ? `/api/folder-tree?${queryString}` : '/api/folder-tree';

            const response = await fetch(url);
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

        // 최신 파일 메타정보 저장 (0바이트 파일 감지 등에서 활용)
        this.fileMetadata.clear();
        files.forEach((file) => {
            if (file && file.path) {
                this.fileMetadata.set(file.path, file);
            }
        });

        // 숨겨진 파일 제외하고 렌더링
        const visibleFiles = files.filter(file => !this.hiddenFiles.has(file.path));

        if (visibleFiles.length === 0) {
            grid.innerHTML = '<div class="empty-state">📭 모든 파일이 숨겨져 있습니다. 전체 보이기 버튼을 클릭하세요.</div>';
            return;
        }

        grid.innerHTML = visibleFiles.map(file => this.createFileCard(file)).join('');

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
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="file-type-badge ${typeClass}">${file.extension.toUpperCase()}</span>
                        <button class="hide-file-btn" onclick="window.app.hideFile('${file.path.replace(/'/g, "\\'")}'); event.stopPropagation();" title="파일 숨기기" style="background: #FF9800; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 12px;">👁️</button>
                        <button class="delete-file-btn" onclick="window.app.deleteFile('${file.path.replace(/'/g, "\\'")}'); event.stopPropagation();" title="파일 삭제" style="background: #f44336; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 12px;">🗑️</button>
                    </div>
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
        if (!container) {
            return;
        }

        container.innerHTML = this.createTreeNode(tree);

        if (this.requestedFolderPath) {
            this.expandFolderTreeToPath(this.requestedFolderPath);
        }

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

    expandFolderTreeToPath(targetPath) {
        const container = document.getElementById('folder-tree');
        if (!container || !targetPath) {
            return;
        }

        container.querySelectorAll('.tree-node.active').forEach(node => {
            node.classList.remove('active');
        });

        const nodes = Array.from(container.querySelectorAll('.tree-node'));
        const targetNode = nodes.find((node) => node.dataset.path === targetPath);

        if (!targetNode) {
            return;
        }

        targetNode.classList.add('active');

        let currentNode = targetNode;
        while (currentNode) {
            const children = currentNode.nextElementSibling;
            if (children && children.classList.contains('tree-children')) {
                children.style.display = 'block';
                currentNode.classList.add('expanded');
            }

            const parentChildren = currentNode.parentElement;
            if (parentChildren && parentChildren.classList.contains('tree-children')) {
                parentChildren.style.display = 'block';
                const parentNode = parentChildren.previousElementSibling;
                if (parentNode && parentNode.classList.contains('tree-node')) {
                    parentNode.classList.add('expanded');
                    currentNode = parentNode;
                    continue;
                }
            }
            break;
        }

        setTimeout(() => {
            try {
                targetNode.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } catch (error) {
                // scrollIntoView가 실패해도 동작에 영향을 주지 않음
            }
        }, 200);
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
            const meta = this.fileMetadata.get(filePath);
            if (meta && (!meta.size || meta.size <= 0)) {
                this.showError('선택한 파일의 크기가 0바이트라 재생할 수 없습니다. 다운로드 상태를 확인하세요.');
                card.classList.remove('selected');
                const checkbox = card.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.checked = false;
                this.selectedFiles.delete(filePath);
                this.selectedFilesOrder = this.selectedFilesOrder.filter(f => f !== filePath);
                return;
            }

            this.selectedFiles.add(filePath);
            // 순서 배열에 추가 (중복 방지)
            if (!this.selectedFilesOrder.includes(filePath)) {
                this.selectedFilesOrder.push(filePath);
            }
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
            this.selectedFilesOrder = this.selectedFilesOrder.filter(f => f !== filePath);
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

        // selectedFilesOrder를 사용하여 순서대로 렌더링
        container.innerHTML = this.selectedFilesOrder.map((filePath, index) => {
            const fileName = filePath.split('/').pop();
            const isFirst = index === 0;
            const isLast = index === this.selectedFilesOrder.length - 1;

            return `
                <div class="selected-item"
                     draggable="true"
                     data-index="${index}"
                     data-file-path="${filePath}">
                    <div class="drag-handle" title="드래그하여 순서 변경">⋮⋮</div>
                    <div class="file-order-controls">
                        <button class="order-btn move-up"
                                onclick="app.moveFileUp(${index})"
                                ${isFirst ? 'disabled' : ''}
                                title="위로 이동">
                            ⬆️
                        </button>
                        <button class="order-btn move-down"
                                onclick="app.moveFileDown(${index})"
                                ${isLast ? 'disabled' : ''}
                                title="아래로 이동">
                            ⬇️
                        </button>
                    </div>
                    <span class="file-order-number">${index + 1}.</span>
                    <span class="file-name">${this.truncateText(fileName, 35)}</span>
                    <button class="remove-selected" onclick="app.removeSelectedFile('${filePath}')">
                        ❌
                    </button>
                </div>
            `;
        }).join('');

        // 드래그 앤 드롭 이벤트 리스너 추가
        this.setupDragAndDrop();
    }

    moveFileUp(index) {
        if (index > 0 && index < this.selectedFilesOrder.length) {
            // 배열에서 요소 교환
            const temp = this.selectedFilesOrder[index];
            this.selectedFilesOrder[index] = this.selectedFilesOrder[index - 1];
            this.selectedFilesOrder[index - 1] = temp;

            // UI 업데이트
            this.updateSelectedFilesList();
        }
    }

    moveFileDown(index) {
        if (index >= 0 && index < this.selectedFilesOrder.length - 1) {
            // 배열에서 요소 교환
            const temp = this.selectedFilesOrder[index];
            this.selectedFilesOrder[index] = this.selectedFilesOrder[index + 1];
            this.selectedFilesOrder[index + 1] = temp;

            // UI 업데이트
            this.updateSelectedFilesList();
        }
    }

    removeSelectedFile(filePath) {
        this.selectedFiles.delete(filePath);
        this.selectedFilesOrder = this.selectedFilesOrder.filter(f => f !== filePath);

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

    setupDragAndDrop() {
        const items = document.querySelectorAll('#selected-files-container .selected-item');

        items.forEach(item => {
            item.addEventListener('dragstart', this.handleDragStart.bind(this));
            item.addEventListener('dragover', this.handleDragOver.bind(this));
            item.addEventListener('drop', this.handleDrop.bind(this));
            item.addEventListener('dragenter', this.handleDragEnter.bind(this));
            item.addEventListener('dragleave', this.handleDragLeave.bind(this));
            item.addEventListener('dragend', this.handleDragEnd.bind(this));
        });
    }

    handleDragStart(e) {
        this.draggedElement = e.currentTarget;
        this.draggedIndex = parseInt(e.currentTarget.dataset.index);

        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);

        // 드래그 이미지 투명도 설정
        if (e.dataTransfer.setDragImage) {
            e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
        }
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleDragEnter(e) {
        if (e.currentTarget !== this.draggedElement) {
            e.currentTarget.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        e.currentTarget.classList.remove('drag-over');

        const dropIndex = parseInt(e.currentTarget.dataset.index);

        if (this.draggedIndex !== dropIndex && this.draggedIndex !== undefined) {
            // 배열에서 요소 이동
            const movedItem = this.selectedFilesOrder[this.draggedIndex];
            this.selectedFilesOrder.splice(this.draggedIndex, 1);
            this.selectedFilesOrder.splice(dropIndex, 0, movedItem);

            // UI 업데이트
            this.updateSelectedFilesList();
        }

        return false;
    }

    handleDragEnd(e) {
        e.currentTarget.classList.remove('dragging');

        // 모든 drag-over 클래스 제거
        document.querySelectorAll('#selected-files-container .selected-item').forEach(item => {
            item.classList.remove('drag-over');
        });

        this.draggedElement = null;
        this.draggedIndex = undefined;
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
        this.selectedFilesOrder = [];
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

    openTimelineEditor({ focusTrack = 'description' } = {}) {
        this.switchTab('video-edit');

        const videoEditTab = document.getElementById('video-edit-tab');
        if (videoEditTab) {
            videoEditTab.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (this.timeline && this.timeline.subtitleData) {
            try {
                this.renderHybridSubtitleTracks();
            } catch (error) {
                console.warn('타임라인 렌더링 실패:', error);
            }
        }

        const fallbackTrack = document.getElementById('description-subtitle-track');
        const targetTrackId = focusTrack ? `${focusTrack}-subtitle-track` : null;
        const targetTrack = targetTrackId ? document.getElementById(targetTrackId) : null;
        const highlightTarget = targetTrack || fallbackTrack;

        if (highlightTarget) {
            highlightTarget.classList.add('highlight-focus');
            setTimeout(() => highlightTarget.classList.remove('highlight-focus'), 1500);
        }
    }

    async handleOpenTranslatorTimeline() {
        const { project, projects } = await this.resolveTranslatorProject();
        if (project && project.id) {
            this.openTranslatorTimeline(project.id);
            return;
        }

        const manualId = this.promptTranslatorProjectId(projects);
        if (manualId) {
            this.openTranslatorTimeline(manualId);
            return;
        }

        this.showError('연결된 번역 프로젝트를 찾지 못했습니다. /translator에서 먼저 프로젝트를 생성하거나 선택해주세요.');
    }

    openTranslatorTimeline(projectId) {
        if (!projectId) {
            return;
        }

        const base = this.getTranslatorPageBase();
        const url = `${base}/translator?id=${encodeURIComponent(projectId)}&view=timeline`;
        try {
            window.open(url, '_blank');
        } catch (error) {
            console.warn('새 창 열기 실패, 현재 창에서 이동합니다:', error);
            window.location.href = url;
        }

        this.showStatus('번역 타임라인 편집기를 새 창에서 열었습니다.');
        this.lastTranslatorProjectId = projectId;

        try {
            window.localStorage.setItem('videoanalysis_last_translator_project_id', projectId);
        } catch (error) {
            console.warn('translator project id 저장 실패:', error);
        }
    }

    async resolveTranslatorProject() {
        const projects = await this.fetchTranslatorProjects();
        if (!Array.isArray(projects) || projects.length === 0) {
            return { project: null, projects: [] };
        }

        const hints = this.getTranslatorNameHints();
        const normalizedHints = hints
            .map(hint => this.normalizeForMatch(hint))
            .filter(Boolean);

        let bestProject = null;
        let bestScore = 0;

        for (const project of projects) {
            const searchFields = this.buildTranslatorProjectSearchFields(project);
            let score = 0;

            for (const hint of normalizedHints) {
                if (searchFields.some(field => field.includes(hint))) {
                    score += 1;
                }
            }

            if (project.id === this.lastTranslatorProjectId) {
                score += 0.5;
            }

            if (score > bestScore) {
                bestScore = score;
                bestProject = project;
            }
        }

        if (bestScore > 0 && bestProject) {
            return { project: bestProject, projects };
        }

        const createdProject = await this.createTranslatorProjectFromSelection(projects);
        if (createdProject) {
            projects.push(createdProject);
            return { project: createdProject, projects };
        }

        if (this.lastTranslatorProjectId) {
            const fallback = projects.find(item => item.id === this.lastTranslatorProjectId) || null;
            if (fallback) {
                return { project: fallback, projects };
            }
        }

        return { project: null, projects };
    }

    async fetchTranslatorProjects() {
        const endpoints = this.buildTranslatorApiEndpoints();
        let lastError = null;

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, { credentials: 'include' });
                if (!response.ok) {
                    lastError = new Error(`HTTP ${response.status}`);
                    continue;
                }

                const data = await response.json();
                const projects = Array.isArray(data)
                    ? data
                    : Array.isArray(data?.projects)
                        ? data.projects
                        : [];

                if (projects.length > 0 || !lastError) {
                    const resolvedBase = this.resolveTranslatorBaseFromEndpoint(endpoint);
                    if (resolvedBase) {
                        this.translatorApiBase = resolvedBase;
                    }
                    return projects;
                }

                lastError = new Error('Empty translator project list');
            } catch (error) {
                lastError = error;
            }
        }

        console.error('번역 프로젝트 목록을 불러오지 못했습니다:', lastError);
        throw lastError || new Error('translator projects unavailable');
    }

    buildTranslatorApiEndpoints() {
        const endpoints = [];

        if (this.translatorApiBase) {
            endpoints.push(`${this.translatorApiBase}/api/translator/projects`);
        }

        endpoints.push('/api/analysis/translator-projects');
        endpoints.push('/api/translator/projects');

        try {
            const current = new URL(window.location.href);
            if (current.port) {
                const altPort = current.port === '8002' ? '8001' : current.port;
                const altOrigin = `${current.protocol}//${current.hostname}:${altPort}`;
                endpoints.push(`${altOrigin}/api/translator/projects`);
            } else {
                endpoints.push(`${current.protocol}//${current.hostname}:8001/api/translator/projects`);
            }
        } catch (error) {
            console.warn('translator endpoint detection failed:', error);
        }

        endpoints.push('/api/translator/projects');

        const unique = [];
        const seen = new Set();
        endpoints.forEach(endpoint => {
            if (!endpoint) return;
            if (seen.has(endpoint)) return;
            seen.add(endpoint);
            unique.push(endpoint);
        });

        return unique;
    }

    resolveTranslatorBaseFromEndpoint(endpoint) {
        try {
            const url = new URL(endpoint, window.location.origin);
            if (url.pathname.includes('/analysis/translator-projects')) {
                return null;
            }
            return `${url.protocol}//${url.host}`;
        } catch (error) {
            return null;
        }
    }

    getTranslatorPageBase() {
        if (this.translatorApiBase) {
            try {
                const url = new URL(this.translatorApiBase, window.location.origin);
                if (url.port === '8002') {
                    url.port = '8001';
                } else if (!url.port) {
                    url.port = '8001';
                }
                return `${url.protocol}//${url.host}`;
            } catch (error) {
                console.warn('translator base parsing 실패:', error);
            }
        }

        try {
            const current = new URL(window.location.href);
            const guessedPort = current.port === '8002' ? '8001' : (current.port || '8001');
            return `${current.protocol}//${current.hostname}:${guessedPort}`;
        } catch (error) {
            return 'http://127.0.0.1:8001';
        }
    }

    getTranslatorNameHints() {
        const hints = new Set();
        const selectedList = Array.from(this.selectedFiles || []);

        selectedList.forEach(path => {
            const base = this.extractFileName(path, true);
            if (base) {
                hints.add(base);
            }
            const parent = this.extractParentFolder(path);
            if (parent) {
                hints.add(parent);
            }
        });

        const nameInput = document.getElementById('save-results-name');
        if (nameInput && nameInput.value) {
            hints.add(nameInput.value);
        }

        return Array.from(hints).filter(Boolean);
    }

    buildTranslatorProjectSearchFields(project) {
        const fields = [];
        if (project && project.id) {
            fields.push(project.id);
        }
        if (project && project.base_name) {
            fields.push(project.base_name);
        }
        if (project && project.source_video) {
            fields.push(this.extractFileName(project.source_video, true));
        }
        if (project && project.source_subtitle) {
            fields.push(this.extractFileName(project.source_subtitle, true));
        }

        return fields
            .map(value => this.normalizeForMatch(value))
            .filter(Boolean);
    }

    normalizeForMatch(value) {
        if (!value) {
            return '';
        }
        return value
            .toString()
            .toLowerCase()
            .normalize('NFKC')
            .replace(/[\s\-_/\\()\[\]{}<>]/g, '')
            .replace(/[!@#$%^&*+,.'"|~`]/g, '');
    }

    extractFileName(path, withoutExtension = false) {
        if (!path) {
            return '';
        }
        const parts = path.split(/[\\/]/).filter(Boolean);
        if (parts.length === 0) {
            return '';
        }
        const fileName = parts[parts.length - 1];
        if (!withoutExtension) {
            return fileName;
        }
        const dotIndex = fileName.lastIndexOf('.');
        return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    }

    extractParentFolder(path) {
        if (!path) {
            return '';
        }
        const parts = path.split(/[\\/]/).filter(Boolean);
        if (parts.length < 2) {
            return '';
        }
        return parts[parts.length - 2];
    }

    promptTranslatorProjectId(projects) {
        if (!Array.isArray(projects) || projects.length === 0) {
            this.showError('번역 프로젝트가 없습니다. /translator에서 프로젝트를 생성해주세요.');
            return null;
        }

        const preview = projects
            .slice(0, 8)
            .map(item => `${item.id}${item.base_name ? ` · ${item.base_name}` : ''}`)
            .join('\n');

        const defaultValue = this.lastTranslatorProjectId || '';
        const message = preview
            ? `연결할 번역 프로젝트 ID를 입력하세요:\n${preview}`
            : '연결할 번역 프로젝트 ID를 입력하세요:';

        const answer = window.prompt(message, defaultValue);
        const trimmed = answer ? answer.trim() : '';
        return trimmed || null;
    }

    async createTranslatorProjectFromSelection(existingProjects = []) {
        if (this.creatingTranslatorProject) {
            return null;
        }

        const { video, subtitle } = this.getSelectedMediaCandidates();
        if (!video) {
            return null;
        }

        const videoBase = this.normalizeForMatch(this.extractFileName(video, true));
        if (existingProjects.some(project => {
            if (!project || !project.source_video) return false;
            const existingBase = this.normalizeForMatch(this.extractFileName(project.source_video, true));
            if (!existingBase) return false;
            return existingBase === videoBase || existingBase.endsWith(videoBase);
        })) {
            return null;
        }

        this.creatingTranslatorProject = true;

        const payload = {
            source_video: video,
            source_subtitle: subtitle || null,
            target_lang: 'ja',
            translation_mode: 'reinterpret',
            tone_hint: this.getReinterpretationTone(),
        };

        try {
            this.showStatus('번역 프로젝트가 없어 새로 생성합니다...');
            const response = await fetch('/api/analysis/translator-projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const project = data?.project || data;
            if (!project || !project.id) {
                throw new Error('생성된 번역 프로젝트 정보를 확인할 수 없습니다.');
            }

            this.lastTranslatorProjectId = project.id;
            try {
                window.localStorage.setItem('videoanalysis_last_translator_project_id', project.id);
            } catch (error) {
                console.warn('translator project id 저장 실패:', error);
            }

            this.showSuccess('번역 프로젝트를 자동으로 생성했습니다.');
            this.showStatus('✅ 번역 프로젝트 생성 완료');
            return project;
        } catch (error) {
            console.error('번역 프로젝트 자동 생성 실패:', error);
            this.showError(`번역 프로젝트를 자동 생성하지 못했습니다: ${error.message}`);
            return null;
        } finally {
            this.creatingTranslatorProject = false;
        }
    }

    getSelectedMediaCandidates() {
        const selectedList = Array.from(this.selectedFiles || []);
        const videoExtensions = ['.mp4', '.webm', '.mov', '.mkv', '.avi'];
        const subtitleExtensions = ['.srt', '.vtt', '.ass', '.ssa'];

        let video = null;
        let subtitle = null;

        selectedList.forEach(path => {
            const ext = (this.getExtension(path) || '').toLowerCase();
            if (!video && videoExtensions.includes(ext)) {
                video = path;
            }
            if (!subtitle && subtitleExtensions.includes(ext)) {
                subtitle = path;
            }
        });

        if (!video && this.timeline && this.timeline.subtitleData && Array.isArray(this.timeline.subtitleData.sources)) {
            const videoSource = this.timeline.subtitleData.sources.find(src => src && src.type === 'video' && src.path);
            if (videoSource) {
                video = videoSource.path;
            }
        }

        return { video, subtitle };
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

    showStatus(message) {
        const statusEl = document.getElementById('analysis-status');
        if (statusEl) {
            statusEl.textContent = message;
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
            analysisResults: this.analysisResults,
            timelineSnapshot: this.buildTimelineSnapshotForSave('export')
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

    importResultsFromFile(file) {
        if (!file) {
            this.showError('불러올 파일을 찾을 수 없습니다');
            return;
        }

        const fileName = (file.name || '').toLowerCase();
        if (!fileName.endsWith('.json')) {
            this.showError('JSON 형식의 분석 결과 파일을 선택해 주세요');
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
            const text = event?.target?.result;
            const resetInput = () => {
                const input = document.getElementById('import-results-input');
                if (input) input.value = '';
            };

            try {
                if (typeof text !== 'string') {
                    throw new Error('파일 내용을 읽을 수 없습니다');
                }

                const parsed = JSON.parse(text);
                let payload = parsed;
                if (parsed && typeof parsed === 'object' && parsed.analysisResults && typeof parsed.analysisResults === 'object') {
                    payload = parsed.analysisResults;
                }

                if (!payload || typeof payload !== 'object') {
                    throw new Error('분석 결과 형식이 올바르지 않습니다');
                }

                const timelineSnapshot = parsed?.timelineSnapshot || parsed?.timeline_snapshot || payload?.timelineSnapshot || payload?.timeline_snapshot || null;

                const restored = this.populateAnalysisResultsFromImport(payload, {
                    reinterpretationHistory: parsed && parsed.reinterpretationHistory,
                    timelineSnapshot
                });
                if (!restored) {
                    throw new Error('파일에서 불러올 분석 결과를 찾지 못했습니다');
                }

                if (parsed && Array.isArray(parsed.selectedFiles)) {
                    this.selectedFiles = new Set(parsed.selectedFiles);
                    this.updateSelectedFilesList();
                    this.updateStatusBar();
                }

                this.showSuccess('저장된 분석 결과를 불러왔습니다');
                this.showStatus('✅ 저장 결과 불러오기 완료');
            } catch (error) {
                console.error('결과 불러오기 실패:', error);
                this.showError(error.message || '결과를 불러오는 중 오류가 발생했습니다');
            } finally {
                resetInput();
            }
        };

        reader.onerror = () => {
            console.error('파일 읽기 실패:', reader.error);
            this.showError('파일을 읽는 중 오류가 발생했습니다');
            const input = document.getElementById('import-results-input');
            if (input) input.value = '';
        };

        reader.readAsText(file, 'utf-8');
    }

    populateAnalysisResultsFromImport(payload, options = {}) {
        const reinterpretationHistoryOption = options.reinterpretationHistory;
        const timelineSnapshotOption = options.timelineSnapshot;
        const hasAudio = Array.isArray(payload.audio);
        const hasSubtitle = Array.isArray(payload.subtitle);
        const hasStt = Array.isArray(payload.stt);
        const hasComparison = payload.comparison && typeof payload.comparison === 'object';
        const hasReinterpretation = payload.reinterpretation && typeof payload.reinterpretation === 'object';

        if (!hasAudio && !hasSubtitle && !hasStt && !hasComparison && !hasReinterpretation) {
            return false;
        }

        this.clearResults();

        const restored = {};
        this.analysisResults = restored;

        if (hasAudio) {
            restored.audio = payload.audio;
            try {
                this.displayAudioResults(payload.audio);
            } catch (error) {
                console.error('저장된 음성 분석 결과 표시 실패:', error);
                this.showError('저장된 음성 분석 결과를 표시하지 못했습니다');
            }
        }

        if (hasSubtitle) {
            restored.subtitle = payload.subtitle;
            try {
                this.displaySubtitleResults(payload.subtitle);
            } catch (error) {
                console.error('저장된 자막 분석 결과 표시 실패:', error);
                this.showError('저장된 자막 분석 결과를 표시하지 못했습니다');
            }

            const subtitleEntry = Array.isArray(payload.subtitle)
                ? payload.subtitle.find(item => item && item.status === 'success' && item.data)
                : null;
            if (subtitleEntry && subtitleEntry.data) {
                const subtitleData = subtitleEntry.data;
                const subtitleListRaw = subtitleData.subtitles
                    || (subtitleData.analysis && subtitleData.analysis.subtitles)
                    || [];
                const normalizedSubtitles = Array.isArray(subtitleListRaw)
                    ? subtitleListRaw.map((sub, index) => ({ ...sub, __source_index: index }))
                    : [];

                if (this.timeline) {
                    this.timeline.subtitleData = {
                        ...subtitleData,
                        subtitles: normalizedSubtitles.map(sub => ({ ...sub }))
                    };
                }

                if (!Array.isArray(this.classifiedSubtitles) || this.classifiedSubtitles.length === 0) {
                    this.classifiedSubtitles = normalizedSubtitles.map(sub => ({ ...sub }));
                }

                try {
                    this.renderHybridSubtitleTracks();
                } catch (error) {
                    console.error('자막 트랙 렌더링 실패:', error);
                }
            }
        }

        if (hasStt) {
            restored.stt = payload.stt;
            try {
                this.handleSTTResults(payload.stt);
            } catch (error) {
                console.error('저장된 음성 인식 결과 표시 실패:', error);
                this.showError('저장된 음성 인식 결과를 표시하지 못했습니다');
            }
        }

        if (hasComparison) {
            restored.comparison = payload.comparison;
            try {
                this.handleComparisonResults(payload.comparison);
            } catch (error) {
                console.error('저장된 비교 결과 표시 실패:', error);
                this.showError('저장된 비교 결과를 표시하지 못했습니다');
            }
        }

        let fallbackReinterpretationHistory = null;

        if (hasReinterpretation) {
            const reinterpretationPayload = payload.reinterpretation || {};
            const reinterpretationScript = reinterpretationPayload.script || '';
            const reinterpretationOutline = reinterpretationPayload.outline || null;
            const toneValue = reinterpretationPayload.tone || (reinterpretationPayload.metadata && reinterpretationPayload.metadata.tone) || null;
            const reinterpretationSource = reinterpretationPayload.source || 'imported';

            restored.reinterpretation = {
                ...reinterpretationPayload,
                script: reinterpretationScript,
                outline: reinterpretationOutline
            };
            if (toneValue) {
                restored.reinterpretation.tone = toneValue;
            }

            if (reinterpretationScript) {
                this.showReinterpretationResult(reinterpretationScript, reinterpretationOutline);
            }

            const rawReplacements = Array.isArray(reinterpretationPayload.replacements)
                ? reinterpretationPayload.replacements
                : [];
            const sanitizedReplacements = rawReplacements
                .map(rep => this.normalizeReplacementPayload(rep))
                .filter(Boolean);

            let appliedReplacements = [];
            if (sanitizedReplacements.length > 0) {
                appliedReplacements = this.applyDescriptionReplacements(sanitizedReplacements, reinterpretationSource);
            }

            if (appliedReplacements.length > 0) {
                restored.reinterpretation.replacements = appliedReplacements;
            } else if (rawReplacements.length > 0) {
                restored.reinterpretation.replacements = rawReplacements;
                fallbackReinterpretationHistory = rawReplacements.reduce((acc, rep) => {
                    const idx = Number(rep.index);
                    if (!Number.isInteger(idx) || idx < 0) {
                        return acc;
                    }
                    const originalText = (rep.previous_text || rep.original_text || '').toString().trim();
                    const updatedText = (rep.text || rep.new_text || '').toString().trim();
                    if (!originalText && !updatedText) {
                        return acc;
                    }
                    acc[idx] = {
                        original_text: originalText,
                        updated_text: updatedText,
                        source: rep.source || reinterpretationSource,
                        updated_at: rep.updated_at || reinterpretationPayload.generated_at || new Date().toISOString(),
                        reverted: originalText === updatedText
                    };
                    return acc;
                }, {});
            }
        }

        if (restored.reinterpretation && restored.reinterpretation.tone) {
            const normalizedTone = this.setReinterpretationTone(restored.reinterpretation.tone);
            restored.reinterpretation.tone = normalizedTone;
        }

        const timelineSnapshotFromPayload = payload.timelineSnapshot || payload.timeline_snapshot || null;
        const timelineSnapshot = timelineSnapshotOption || timelineSnapshotFromPayload;

        if (timelineSnapshot) {
            this.restoreTimelineSnapshot(timelineSnapshot, {
                preserveExistingSubtitles: hasSubtitle
            });
        }

        if (reinterpretationHistoryOption && typeof reinterpretationHistoryOption === 'object') {
            this.rehydrateReinterpretationState(
                JSON.parse(JSON.stringify(reinterpretationHistoryOption)),
                {
                    defaultSource: (payload.reinterpretation && payload.reinterpretation.source) || 'imported',
                    forceTextUpdate: true
                }
            );
        } else if (fallbackReinterpretationHistory && Object.keys(fallbackReinterpretationHistory).length > 0) {
            this.rehydrateReinterpretationState(fallbackReinterpretationHistory, {
                defaultSource: (payload.reinterpretation && payload.reinterpretation.source) || 'imported',
                forceTextUpdate: true
            });
        } else if (!this.reinterpretationHistory) {
            this.reinterpretationHistory = {};
        }

        return true;
    }

    async startReinterpretation() {
        const reinterpretBtn = document.getElementById('reinterpret-results');
        if (!reinterpretBtn) {
            this.showError('재해석 기능을 사용할 수 없습니다');
            return;
        }

        if (!Array.isArray(this.classifiedSubtitles) || this.classifiedSubtitles.length === 0) {
            this.showError('재해석할 자막이 없습니다. 화자 인식 또는 자막 분석을 먼저 실행하세요.');
            return;
        }

        const dialogueSubtitles = this.getSubtitlesByTrack('main');
        const descriptionSubtitles = this.getSubtitlesByTrack('description');

        if (dialogueSubtitles.length === 0 && descriptionSubtitles.length === 0) {
            this.showError('대사(메인 자막) 또는 설명 자막이 없어 재해석을 진행할 수 없습니다.');
            return;
        }

        const modeSelect = document.getElementById('reinterpret-mode');
        const mode = modeSelect ? modeSelect.value : 'api';
        const tone = this.getReinterpretationTone();
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
            this.showStatus('ChatGPT 창을 열었습니다. 결과를 붙여넣으면 적용됩니다.');
            this.lastReinterpretationPrompt = promptText;
            this.lastReinterpretationTone = tone;
            return;
        }

        this.showStatus('대사와 설명 자막을 분석하고 재해석 중입니다...');
        this.lastReinterpretationPrompt = null;
        this.lastReinterpretationTone = tone;

        const payload = {
            dialogue_subtitles: dialogueSubtitles.map(sub => this.normalizeSubtitleForPayload(sub, 'main', sub.__source_index)),
            description_subtitles: descriptionSubtitles.map(sub => this.normalizeSubtitleForPayload(sub, 'description', sub.__source_index)),
            metadata: {
                selected_files: Array.from(this.selectedFiles || []),
                generated_at: new Date().toISOString(),
                analysis_method: this.currentAnalysisMethod || 'text',
                tone: tone
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

            this.showReinterpretationResult(result.reinterpretation, result.outline || null);
            this.showSuccess('재해석 결과가 생성되었습니다.');
            this.showStatus('✅ 재해석 완료');
            const rawReplacements = Array.isArray(result.replacements) ? result.replacements : [];
            const sanitizedReplacements = rawReplacements.map(rep => this.normalizeReplacementPayload(rep)).filter(Boolean);
            const appliedReplacements = this.applyDescriptionReplacements(sanitizedReplacements, 'api');
            if (sanitizedReplacements.length > 0 && appliedReplacements.length === 0) {
                this.showError('재해석 결과를 설명 자막에 적용하지 못했습니다.');
            }
            const resolvedTone = this.normalizeToneKey(result.tone || tone);
            this.setReinterpretationTone(resolvedTone);

            this.analysisResults.reinterpretation = {
                script: result.reinterpretation,
                outline: result.outline || null,
                replacements: appliedReplacements,
                source: 'api',
                generated_at: new Date().toISOString(),
                tone: resolvedTone
            };

        } catch (error) {
            console.error('재해석 실패:', error);
            this.showError(`재해석 중 오류가 발생했습니다: ${error.message}`);
            this.showStatus('⚠️ 재해석 실패');
        } finally {
            reinterpretBtn.disabled = false;
            reinterpretBtn.textContent = originalLabel;
        }
    }

    getSubtitlesByTrack(trackType) {
        const collected = [];

        const pushWithIndex = (sub) => {
            if (!sub || !sub.text) return;
            const index = this.findSubtitleIndexForData(sub);
            if (index >= 0 && this.classifiedSubtitles && this.classifiedSubtitles[index]) {
                this.classifiedSubtitles[index].__source_index = index;
            }
            const clone = { ...sub, __source_index: index };
            collected.push(clone);
        };

        if (this.timeline && this.timeline.speakerClassifiedSubtitles && Array.isArray(this.timeline.speakerClassifiedSubtitles[trackType])) {
            this.timeline.speakerClassifiedSubtitles[trackType].forEach(pushWithIndex);
        } else if (Array.isArray(this.classifiedSubtitles)) {
            this.classifiedSubtitles.forEach(sub => {
                if (sub && sub.text && ((sub.assigned_track || sub.track || 'unassigned') === trackType)) {
                    pushWithIndex(sub);
                }
            });
        }

        return collected;
    }

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

    getReinterpretationTone() {
        const toneSelect = document.getElementById('reinterpret-tone');
        if (toneSelect && toneSelect.value) {
            const toneKey = this.normalizeToneKey(toneSelect.value);
            this.lastReinterpretationTone = toneKey;
            return toneKey;
        }
        return this.normalizeToneKey(this.lastReinterpretationTone);
    }

    setReinterpretationTone(tone) {
        const toneKey = this.normalizeToneKey(tone);
        const toneSelect = document.getElementById('reinterpret-tone');
        let resolvedValue = toneKey;
        if (toneSelect) {
            const match = Array.from(toneSelect.options).find(opt => this.normalizeToneKey(opt.value) === toneKey);
            if (match) {
                toneSelect.value = match.value;
                resolvedValue = this.normalizeToneKey(match.value);
            } else {
                toneSelect.value = toneKey;
            }
        }
        this.lastReinterpretationTone = resolvedValue;
        return resolvedValue;
    }

    describeToneLabel(tone) {
        const map = {
            neutral: '표준',
            comic: '코믹',
            dramatic: '드라마틱',
            serious: '진중',
            thrilling: '긴장감'
        };
        const key = this.normalizeToneKey(tone);
        if (map[key]) {
            return map[key];
        }
        const toneSelect = document.getElementById('reinterpret-tone');
        if (toneSelect) {
            const match = Array.from(toneSelect.options).find(opt => this.normalizeToneKey(opt.value) === key);
            if (match) {
                return match.textContent.trim() || match.value;
            }
        }
        return key;
    }

    describeToneInstruction(tone) {
        const map = {
            neutral: 'balanced and natural',
            comic: 'light-hearted, witty, and humorous',
            dramatic: 'emotional, cinematic, and evocative',
            serious: 'calm, respectful, and sincere',
            thrilling: 'tense, urgent, and suspenseful'
        };
        const key = this.normalizeToneKey(tone);
        if (map[key]) {
            return map[key];
        }
        return `adhere to the '${key}' tone style provided by the user`;
    }

    normalizeSubtitleForPayload(subtitle, fallbackTrack = 'unassigned', overrideIndex = undefined) {
        const start = Number(subtitle.start_time ?? subtitle.start ?? subtitle.startTime ?? 0);
        const end = Number(subtitle.end_time ?? subtitle.end ?? subtitle.endTime ?? start);
        const text = (subtitle.text || '').trim();
        const speaker = subtitle.speaker_name || subtitle.speaker || null;
        const track = subtitle.assigned_track || subtitle.track || fallbackTrack;
        const duration = Number(subtitle.duration ?? (end > start ? end - start : 0));
        const index = overrideIndex !== undefined ? overrideIndex : this.findSubtitleIndexForData(subtitle);
        const originalLength = text.length;

        return {
            start_time: Number.isFinite(start) ? start : null,
            end_time: Number.isFinite(end) ? end : null,
            duration: Number.isFinite(duration) ? duration : null,
            text,
            speaker,
            track,
            original_index: Number.isInteger(index) ? index : null,
            target_length: originalLength,
            original_length: originalLength
        };
    }

    buildReinterpretationPrompt(dialogues, descriptions, tone = 'neutral') {
        const toneKey = this.normalizeToneKey(tone);
        const toneInstruction = this.describeToneInstruction(toneKey);
        const toneLabel = this.describeToneLabel(toneKey);

        const instructions = [
            '당신은 한국어 내레이션 작가입니다.',
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

        const limit = 40;
        const lines = [];
        let index = 1;

        for (const item of list) {
            if (!item) continue;
            const text = (item.text || '').replace(/\s+/g, ' ').trim();
            if (!text) continue;

            const start = this.formatPromptTime(item.start_time ?? item.start);
            const end = this.formatPromptTime(item.end_time ?? item.end);
            const speaker = item.speaker_name || item.speaker || '';
            const speakerPrefix = speaker ? `[${speaker}] ` : '';
            if (title.includes('설명')) {
                const originalIndex = Number.isInteger(item.original_index) ? item.original_index : (Number.isInteger(item.__source_index) ? item.__source_index : index - 1);
                const targetLength = Number.isFinite(item.target_length) ? item.target_length : text.length;
                lines.push(`${String(index).padStart(2, '0')}. desc_index=${originalIndex} target_length=${targetLength} ${start}-${end} ${speakerPrefix}${text}`);
            } else {
                lines.push(`${String(index).padStart(2, '0')}. ${start}-${end} ${speakerPrefix}${text}`);
            }
            index += 1;
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

    prepareChatGPTReinterpretation(promptText) {
        const panel = document.getElementById('reinterpretation-panel');
        const textElement = document.getElementById('reinterpretation-text');
        if (!panel || !textElement) {
            console.warn('재해석 패널을 찾을 수 없습니다');
            return;
        }

        panel.style.display = 'flex';
        const escapedPrompt = this.escapeHtml(promptText);

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

        const toneKey = this.getReinterpretationTone();

        this.analysisResults.reinterpretation = {
            source: 'chatgpt-prompt',
            prompt: promptText,
            generated_at: new Date().toISOString(),
            tone: toneKey
        };

        this.setReinterpretationTone(toneKey);

        const applyBtn = document.getElementById('manual-reinterpret-apply');
        if (applyBtn) {
            applyBtn.onclick = () => this.applyManualReinterpretation();
        }

        const copyPromptBtn = document.getElementById('copy-reinterpretation-prompt');
        if (copyPromptBtn) {
            copyPromptBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(promptText);
                    this.showSuccess('프롬프트가 클립보드에 복사되었습니다');
                } catch (error) {
                    console.error('프롬프트 복사 실패:', error);
                    this.showError('프롬프트를 복사하지 못했습니다. 직접 선택하여 복사해주세요.');
                }
            };
        }
    }

    applyManualReinterpretation() {
        const textarea = document.getElementById('manual-reinterpret-result');
        if (!textarea) {
            this.showError('결과 입력 영역을 찾을 수 없습니다');
            return;
        }

        const rawText = textarea.value.trim();
        if (!rawText) {
            this.showError('ChatGPT 결과를 붙여넣어 주세요');
            return;
        }

        try {
            const parsed = this.parseManualReinterpretation(rawText);
            this.showReinterpretationResult(parsed.script, parsed.outline || null);
            this.showSuccess('재해석 결과가 적용되었습니다.');
            this.showStatus('✅ 수동 재해석 적용 완료');
            const appliedReplacements = this.applyDescriptionReplacements(parsed.replacements || [], 'chatgpt-manual');
            if (parsed.replacements && parsed.replacements.length && appliedReplacements.length === 0) {
                this.showError('재해석 결과를 설명 자막에 대체하지 못했습니다. JSON 구조를 확인해주세요.');
            }
            const toneKey = this.normalizeToneKey(this.lastReinterpretationTone || this.getReinterpretationTone());
            this.setReinterpretationTone(toneKey);
            this.analysisResults.reinterpretation = {
                script: parsed.script,
                outline: parsed.outline || null,
                replacements: appliedReplacements,
                source: 'chatgpt-manual',
                generated_at: new Date().toISOString(),
                prompt: this.lastReinterpretationPrompt || null,
                raw: rawText,
                tone: toneKey
            };
        } catch (error) {
            console.error('수동 재해석 적용 실패:', error);
            this.showError(error.message || '결과를 적용할 수 없습니다');
        }
    }

    getSavedResults() {
        return Array.isArray(this.cachedSavedResults) ? this.cachedSavedResults : [];
    }

    setSavedResults(results) {
        this.cachedSavedResults = Array.isArray(results) ? results : [];
    }

    async fetchSavedResultsList() {
        try {
            const response = await fetch('/api/analysis/saved-results');
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const results = Array.isArray(data.results) ? data.results : [];
            this.setSavedResults(results);
            return results;
        } catch (error) {
            console.error('저장된 결과 목록을 불러오지 못했습니다:', error);
            this.setSavedResults([]);

            const panel = document.getElementById('saved-results-panel');
            if (panel && panel.style.display !== 'none') {
                this.showError('저장된 결과 목록을 불러오지 못했습니다');
            }

            return [];
        }
    }

    refreshSavedResultsList() {
        return this.fetchSavedResultsList()
            .then(results => {
                this.renderSavedResultsList(results);
                return results;
            })
            .catch(error => {
                console.error('저장된 결과 목록 렌더링 실패:', error);
                this.renderSavedResultsList([]);
                return [];
            });
    }

    renderSavedResultsList(results) {
        const listEl = document.getElementById('saved-results-list');
        if (!listEl) {
            return;
        }

        if (!Array.isArray(results) || results.length === 0) {
            listEl.innerHTML = '<div class="empty-state">저장된 결과가 없습니다.</div>';
            return;
        }

        const itemsHtml = results
            .sort((a, b) => new Date(b.saved_at || 0) - new Date(a.saved_at || 0))
            .map(result => {
                const savedAt = this.formatTimestampForDisplay(result.saved_at) || '알 수 없음';
                const summaryParts = [];
                if (result.analysisResults) {
                    const audioCount = Array.isArray(result.analysisResults.audio)
                        ? result.analysisResults.audio.length : 0;
                    const subtitleCount = Array.isArray(result.analysisResults.subtitle)
                        ? result.analysisResults.subtitle.length : 0;
                    if (audioCount) summaryParts.push(`음성 ${audioCount}개`);
                    if (subtitleCount) summaryParts.push(`자막 ${subtitleCount}개`);
                }
                if (Array.isArray(result.selectedFiles)) {
                    summaryParts.push(`선택 파일 ${result.selectedFiles.length}개`);
                }
                const summary = summaryParts.length ? summaryParts.join(' · ') : '요약 정보 없음';
                return `
                    <div class="saved-result-item" data-result-id="${result.id}">
                        <div class="saved-result-info">
                            <span class="saved-result-name">${this.escapeHtml(result.name || '이름 없는 저장')}</span>
                            <span class="saved-result-meta">저장: ${savedAt}</span>
                            <span class="saved-result-meta">${summary}</span>
                        </div>
                        <div class="saved-result-actions">
                            <button class="action-btn secondary" data-action="load" data-result-id="${result.id}">불러오기</button>
                            <button class="action-btn outline" data-action="rename" data-result-id="${result.id}">이름 변경</button>
                            <button class="action-btn outline" data-action="delete" data-result-id="${result.id}">삭제</button>
                        </div>
                    </div>
                `;
            })
            .join('');

        listEl.innerHTML = itemsHtml;

        listEl.querySelectorAll('[data-action="load"]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const id = event.currentTarget.getAttribute('data-result-id');
                this.loadSavedResult(id);
            });
        });

        listEl.querySelectorAll('[data-action="rename"]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const id = event.currentTarget.getAttribute('data-result-id');
                this.renameSavedResult(id);
            });
        });

        listEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const id = event.currentTarget.getAttribute('data-result-id');
                this.deleteSavedResult(id);
            });
        });
    }

    toggleSavedResultsPanel(forceOpen = null) {
        const panel = document.getElementById('saved-results-panel');
        if (!panel) {
            return;
        }

        const shouldOpen = forceOpen !== null ? forceOpen : panel.style.display === 'none';
        if (shouldOpen) {
            panel.style.display = 'flex';
            this.refreshSavedResultsList();
        } else {
            panel.style.display = 'none';
        }
    }

    async saveResultsToStorage() {
        if (!this.analysisResults || Object.keys(this.analysisResults).length === 0) {
            this.showError('저장할 분석 결과가 없습니다');
            return;
        }

        const nameInput = document.getElementById('save-results-name');
        const saveName = nameInput ? nameInput.value.trim() : '';

        if (!saveName) {
            this.showError('저장할 이름을 입력하세요');
            if (nameInput) {
                nameInput.focus();
            }
            return;
        }

        const timestamp = new Date().toISOString();

        let savedResults = this.getSavedResults();
        if (!Array.isArray(savedResults) || savedResults.length === 0) {
            savedResults = await this.fetchSavedResultsList();
        }

        const existingEntry = Array.isArray(savedResults)
            ? savedResults.find(item => item.name === saveName)
            : null;

        if (this.analysisResults && this.analysisResults.reinterpretation && !this.analysisResults.reinterpretation.tone) {
            this.analysisResults.reinterpretation.tone = this.getReinterpretationTone();
        }

        if (existingEntry && !window.confirm(`"${saveName}" 이름이 이미 존재합니다. 덮어쓸까요?`)) {
            return;
        }

        const payload = {
            id: existingEntry ? existingEntry.id : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            name: saveName,
            saved_at: timestamp,
            analysisResults: JSON.parse(JSON.stringify(this.analysisResults)),
            selectedFiles: Array.from(this.selectedFiles || []),
            reinterpretationHistory: JSON.parse(JSON.stringify(this.reinterpretationHistory || {})),
            timelineSnapshot: this.buildTimelineSnapshotForSave('analysis-save'),
            metadata: {
                analysis_method: this.currentAnalysisMethod,
                selected_count: this.selectedFiles ? this.selectedFiles.size : 0
            }
        };

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

            await this.refreshSavedResultsList();
            this.toggleSavedResultsPanel(true);
            this.showSuccess(`"${saveName}" 이름으로 저장했습니다`);
        } catch (error) {
            console.error('저장 결과 기록 실패:', error);
            this.showError(error.message || '저장 결과를 기록하지 못했습니다');
        }
    }

    async loadSavedResult(id) {
        if (!id) {
            this.showError('불러올 결과를 찾을 수 없습니다');
            return;
        }

        let savedResults = this.getSavedResults();
        let entry = Array.isArray(savedResults) ? savedResults.find(item => item.id === id) : null;

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
                    savedResults = Array.isArray(savedResults) ? savedResults.filter(item => item.id !== entry.id) : [];
                    savedResults.push(entry);
                    this.setSavedResults(savedResults);
                }
            } catch (error) {
                console.error('저장된 결과를 불러오지 못했습니다:', error);
                this.showError(error.message || '저장된 결과를 불러오지 못했습니다');
                return;
            }
        }

        if (!entry) {
            this.showError('저장된 결과를 찾지 못했습니다');
            return;
        }

        const clonedResults = JSON.parse(JSON.stringify(entry.analysisResults || {}));
        const clonedHistory = JSON.parse(JSON.stringify(entry.reinterpretationHistory || {}));

        const restored = this.populateAnalysisResultsFromImport(clonedResults, {
            reinterpretationHistory: clonedHistory,
            timelineSnapshot: entry.timelineSnapshot || entry.timeline_snapshot || null
        });

        if (!restored) {
            this.showError('저장된 분석 결과를 적용할 수 없습니다');
            return;
        }

        if (Array.isArray(entry.selectedFiles)) {
            this.selectedFiles = new Set(entry.selectedFiles);
            this.updateSelectedFilesList();
            this.updateStatusBar();
        }

        const nameInput = document.getElementById('save-results-name');
        if (nameInput) {
            nameInput.value = entry.name || '';
        }

        this.toggleSavedResultsPanel(false);
        this.renderHybridSubtitleTracks();
        this.showSuccess(`"${entry.name}" 저장 결과를 불러왔습니다`);
    }

    async renameSavedResult(id) {
        let savedResults = this.getSavedResults();
        if (!Array.isArray(savedResults) || savedResults.length === 0) {
            savedResults = await this.fetchSavedResultsList();
        }

        const entryIndex = Array.isArray(savedResults)
            ? savedResults.findIndex(item => item.id === id)
            : -1;

        if (entryIndex === -1) {
            this.showError('저장된 결과를 찾을 수 없습니다');
            return;
        }

        const currentName = savedResults[entryIndex].name || '';
        const newName = window.prompt('새로운 이름을 입력하세요', currentName)?.trim();
        if (!newName) {
            return;
        }

        if (savedResults.some((item, idx) => idx !== entryIndex && item.name === newName)) {
            this.showError('같은 이름이 이미 존재합니다. 다른 이름을 입력하세요.');
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

            await this.refreshSavedResultsList();
            this.showSuccess('이름을 변경했습니다');
        } catch (error) {
            console.error('저장 결과 이름 변경 실패:', error);
            this.showError(error.message || '이름을 변경하지 못했습니다');
        }
    }

    async deleteSavedResult(id) {
        let savedResults = this.getSavedResults();
        if (!Array.isArray(savedResults) || savedResults.length === 0) {
            savedResults = await this.fetchSavedResultsList();
        }

        const entry = Array.isArray(savedResults) ? savedResults.find(item => item.id === id) : null;
        if (!entry) {
            return;
        }

        const name = entry.name || '저장된 결과';
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

            await this.refreshSavedResultsList();
            this.showSuccess('저장된 결과를 삭제했습니다');
        } catch (error) {
            console.error('저장 결과 삭제 실패:', error);
            this.showError(error.message || '저장된 결과를 삭제하지 못했습니다');
        }
    }

    async clearAllSavedResults() {
        let savedResults = this.getSavedResults();
        if (!Array.isArray(savedResults) || savedResults.length === 0) {
            savedResults = await this.fetchSavedResultsList();
        }

        if (!Array.isArray(savedResults) || savedResults.length === 0) {
            this.showInfo('삭제할 저장 결과가 없습니다');
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

            this.setSavedResults([]);
            this.renderSavedResultsList([]);
            this.showSuccess('모든 저장 결과를 삭제했습니다');
        } catch (error) {
            console.error('저장 결과 전체 삭제 실패:', error);
            this.showError(error.message || '모든 저장 결과를 삭제하지 못했습니다');
        }
    }

    setupReinterpretationEditingPanel() {
        const panel = document.getElementById('reinterpretation-compare');
        if (!panel) {
            return;
        }

        const applyBtn = document.getElementById('reinterpretation-apply-button');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyReinterpretationEdit());
        }

        const revertBtn = document.getElementById('reinterpretation-revert-button');
        if (revertBtn) {
            revertBtn.addEventListener('click', () => this.revertReinterpretationEdit());
        }

        const textarea = document.getElementById('reinterpretation-after-input');
        if (textarea) {
            textarea.addEventListener('keydown', (event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    this.applyReinterpretationEdit();
                }
            });
        }
    }

    updateReinterpretationComparison(index, trackType, options = {}) {
        const panel = document.getElementById('reinterpretation-compare');
        if (!panel) {
            return;
        }

        const beforeEl = document.getElementById('reinterpretation-before-text');
        const afterInput = document.getElementById('reinterpretation-after-input');
        const metaEl = document.getElementById('reinterpretation-meta');

        if (!Number.isInteger(index) || trackType !== 'description') {
            panel.style.display = 'none';
            this.currentReinterpretationEditIndex = null;
            this.activeReinterpretationTrack = null;
            if (beforeEl) beforeEl.textContent = '';
            if (afterInput) afterInput.value = '';
            if (metaEl) metaEl.textContent = '';
            return;
        }

        const subtitle = (this.timeline && this.timeline.subtitleData && Array.isArray(this.timeline.subtitleData.subtitles))
            ? this.timeline.subtitleData.subtitles[index]
            : null;
        const history = this.reinterpretationHistory ? this.reinterpretationHistory[index] : null;

        const originalText = (history && history.original_text) || (subtitle && subtitle.__original_description_text) || '';
        const currentText = subtitle && typeof subtitle.text === 'string'
            ? subtitle.text
            : (history && history.updated_text) || '';

        if (!history && (!originalText || originalText.trim() === currentText.trim())) {
            panel.style.display = 'none';
            this.currentReinterpretationEditIndex = null;
            this.activeReinterpretationTrack = null;
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
        this.currentReinterpretationEditIndex = index;
        this.activeReinterpretationTrack = trackType;
    }

    refreshReinterpretationPanel() {
        if (!Number.isInteger(this.currentReinterpretationEditIndex)) {
            return;
        }
        const trackType = this.activeReinterpretationTrack || 'description';
        this.updateReinterpretationComparison(this.currentReinterpretationEditIndex, trackType);
    }

    applyReinterpretationEdit() {
        if (!Number.isInteger(this.currentReinterpretationEditIndex)) {
            this.showError('재해석 편집할 자막을 선택하세요');
            return;
        }
        const index = this.currentReinterpretationEditIndex;
        const textarea = document.getElementById('reinterpretation-after-input');
        if (!textarea) {
            this.showError('편집 영역을 찾을 수 없습니다');
            return;
        }

        const newText = textarea.value.trim();
        if (!newText) {
            this.showError('변경 후 내용을 입력하세요');
            return;
        }

        const subtitle = (this.timeline && this.timeline.subtitleData && Array.isArray(this.timeline.subtitleData.subtitles))
            ? this.timeline.subtitleData.subtitles[index]
            : null;
        const currentText = subtitle && typeof subtitle.text === 'string' ? subtitle.text.trim() : '';
        if (newText === currentText) {
            this.showInfo('변경된 내용이 없습니다');
            return;
        }

        const history = this.reinterpretationHistory ? this.reinterpretationHistory[index] : null;
        const originalText = history?.original_text || subtitle?.__original_description_text || currentText;

        this.updateSubtitleText(index, newText, {
            source: 'timeline-edit',
            forceHistory: Boolean(history || subtitle?.__original_description_text),
            originalText
        });

        this.renderHybridSubtitleTracks();
        this.updateReinterpretationComparison(index, 'description');
        this.showSuccess('재해석 결과가 타임라인에 적용되었습니다');

        Promise.resolve(this.refreshAllSRTSubtitlesWithUpdatedTracks())
            .catch(error => console.warn('재해석 편집 후 자막 목록 갱신 실패:', error));
    }

    revertReinterpretationEdit() {
        if (!Number.isInteger(this.currentReinterpretationEditIndex)) {
            this.showError('복원할 자막을 선택하세요');
            return;
        }

        const index = this.currentReinterpretationEditIndex;
        const history = this.reinterpretationHistory ? this.reinterpretationHistory[index] : null;
        const subtitle = (this.timeline && this.timeline.subtitleData && Array.isArray(this.timeline.subtitleData.subtitles))
            ? this.timeline.subtitleData.subtitles[index]
            : null;
        const originalText = history?.original_text || subtitle?.__original_description_text;

        if (!originalText) {
            this.showError('원본 자막 정보를 찾을 수 없습니다');
            return;
        }

        this.updateSubtitleText(index, originalText, {
            source: 'timeline-revert',
            forceHistory: true,
            originalText
        });

        const textarea = document.getElementById('reinterpretation-after-input');
        if (textarea) {
            textarea.value = originalText;
        }

        this.renderHybridSubtitleTracks();
        this.updateReinterpretationComparison(index, 'description');
        this.showSuccess('재해석 자막을 원본으로 되돌렸습니다');

        Promise.resolve(this.refreshAllSRTSubtitlesWithUpdatedTracks())
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
            // JSON parse 실패 시 전체 텍스트를 스크립트로 사용
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
            previous_text: originalText,
            source,
            updated_at: updatedAt
        };
    }

    applyDescriptionReplacements(replacements, source = 'api') {
        if (!Array.isArray(replacements) || replacements.length === 0) {
            return [];
        }

        const applied = [];
        const usedIndices = new Set();
        const descriptionIndices = Array.isArray(this.classifiedSubtitles)
            ? this.classifiedSubtitles.reduce((acc, sub, idx) => {
                const track = sub?.assigned_track || sub?.track || sub?.detected_track || 'unassigned';
                if (track === 'description') {
                    acc.push(idx);
                }
                return acc;
            }, [])
            : [];

        replacements.forEach(rep => {
            if (!rep) return;
            let resolvedIndex = this.resolveReplacementIndex(rep);
            if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0 || !this.classifiedSubtitles || !this.classifiedSubtitles[resolvedIndex]) {
                resolvedIndex = null;
            }

            if (resolvedIndex === null) {
                const fallbackIndex = descriptionIndices.find(idx => !usedIndices.has(idx) && this.classifiedSubtitles && this.classifiedSubtitles[idx]);
                if (Number.isInteger(fallbackIndex) && fallbackIndex >= 0) {
                    resolvedIndex = fallbackIndex;
                }
            }

            if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0 || !this.classifiedSubtitles || !this.classifiedSubtitles[resolvedIndex]) {
                return;
            }

            usedIndices.add(resolvedIndex);
            rep.index = resolvedIndex;

            const originalSubtitle = this.classifiedSubtitles[resolvedIndex];
            const savedOriginalTextCandidate = typeof rep.original_text === 'string' && rep.original_text.trim().length > 0
                ? rep.original_text.trim()
                : (typeof rep.previous_text === 'string' && rep.previous_text.trim().length > 0
                    ? rep.previous_text.trim()
                    : null);
            const savedOriginalText = savedOriginalTextCandidate;
            const originalText = savedOriginalText !== null
                ? savedOriginalText
                : (originalSubtitle.text || '').trim();
            const originalLength = originalText.length;
            const desiredLength = Number.isFinite(rep.target_length) ? rep.target_length : originalLength;

            let newText = (rep.text || '').trim();
            if (!newText) {
                return;
            }

            if (Number.isFinite(desiredLength) && desiredLength > 0 && newText.length > desiredLength) {
                newText = newText.slice(0, desiredLength).trim();
            }

            if (newText.length === 0) {
                return;
            }

            const timestamp = new Date().toISOString();
            if (!this.reinterpretationHistory) {
                this.reinterpretationHistory = {};
            }

            const existingHistory = this.reinterpretationHistory[resolvedIndex];
            if (existingHistory) {
                if (!existingHistory.original_text) {
                    existingHistory.original_text = originalText;
                }
                if (existingHistory.updated_text && existingHistory.updated_text !== newText) {
                    if (!Array.isArray(existingHistory.changes)) {
                        existingHistory.changes = [];
                    }
                    existingHistory.changes.push({
                        text: existingHistory.updated_text,
                        source: existingHistory.source,
                        updated_at: existingHistory.updated_at
                    });
                }
                existingHistory.updated_text = newText;
                existingHistory.source = rep.source || source;
                existingHistory.updated_at = rep.updated_at || timestamp;
                existingHistory.reverted = existingHistory.original_text?.trim() === newText.trim();
            } else {
                this.reinterpretationHistory[resolvedIndex] = {
                    original_text: originalText,
                    updated_text: newText,
                    source: rep.source || source,
                    updated_at: rep.updated_at || timestamp,
                    reverted: originalText.trim() === newText.trim()
                };
            }

            const historyEntry = this.reinterpretationHistory[resolvedIndex];

            this.classifiedSubtitles[resolvedIndex].text = newText;
            this.classifiedSubtitles[resolvedIndex].updated_by = rep.source || source;
            this.classifiedSubtitles[resolvedIndex].__source_index = resolvedIndex;
            this.classifiedSubtitles[resolvedIndex].__original_description_text = historyEntry?.original_text || originalText;
            this.classifiedSubtitles[resolvedIndex].reinterpretation = historyEntry ? { ...historyEntry } : undefined;
            this.updateTrackSubtitleText('description', resolvedIndex, newText);
            if (this.timeline && this.timeline.subtitleData && Array.isArray(this.timeline.subtitleData.subtitles)) {
                const timelineSub = this.timeline.subtitleData.subtitles[resolvedIndex];
                if (timelineSub) {
                    this.timeline.subtitleData.subtitles[resolvedIndex] = {
                        ...timelineSub,
                        text: newText,
                        __original_description_text: historyEntry?.original_text || timelineSub.__original_description_text || originalText,
                        reinterpretation: historyEntry ? { ...historyEntry } : undefined
                    };
                }
            }

            applied.push({
                index: resolvedIndex,
                text: newText,
                original_length: originalLength,
                target_length: Number.isFinite(desiredLength) ? desiredLength : originalLength,
                source: rep.source || source,
                previous_text: originalText,
                original_text: originalText,
                updated_at: rep.updated_at || timestamp
            });
        });

        if (applied.length > 0) {
            this.refreshAllSRTSubtitlesWithUpdatedTracks();
            this.updateSpeakerStatisticsFromSubtitles();
            this.storeSpeakerClassification(source || 'reinterpretation');
        }

        return applied;
    }

    rehydrateReinterpretationState(history, options = {}) {
        if (!history || typeof history !== 'object') {
            return;
        }

        const defaultSource = options.defaultSource || 'imported';
        const forceTextUpdate = options.forceTextUpdate !== false;

        if (!this.reinterpretationHistory || typeof this.reinterpretationHistory !== 'object') {
            this.reinterpretationHistory = {};
        }

        Object.entries(history).forEach(([key, value]) => {
            const index = Number(key);
            if (!Number.isInteger(index) || index < 0) {
                return;
            }

            const entry = value && typeof value === 'object' ? { ...value } : {};
            const originalTextRaw = entry.original_text || entry.previous_text || '';
            const updatedTextRaw = entry.updated_text || entry.text || '';
            const originalText = typeof originalTextRaw === 'string' ? originalTextRaw : String(originalTextRaw || '');
            const updatedText = typeof updatedTextRaw === 'string' ? updatedTextRaw : String(updatedTextRaw || '');
            const source = entry.source || defaultSource;
            const updatedAt = entry.updated_at || entry.updatedAt || new Date().toISOString();
            const reverted = typeof entry.reverted === 'boolean'
                ? entry.reverted
                : originalText.trim() === updatedText.trim();

            const normalizedEntry = {
                original_text: originalText,
                updated_text: updatedText,
                source,
                updated_at: updatedAt,
                reverted
            };

            if (Array.isArray(entry.changes)) {
                normalizedEntry.changes = entry.changes.map(change => ({ ...change }));
            }

            this.reinterpretationHistory[index] = normalizedEntry;

            if (Array.isArray(this.classifiedSubtitles) && this.classifiedSubtitles[index]) {
                const classified = this.classifiedSubtitles[index];
                if (originalText) {
                    classified.__original_description_text = originalText;
                }
                if (forceTextUpdate && updatedText) {
                    classified.text = updatedText;
                }
                classified.reinterpretation = { ...normalizedEntry };
            }

            if (this.timeline && this.timeline.subtitleData && Array.isArray(this.timeline.subtitleData.subtitles) && this.timeline.subtitleData.subtitles[index]) {
                const subtitle = this.timeline.subtitleData.subtitles[index];
                if (originalText) {
                    subtitle.__original_description_text = originalText;
                }
                if (forceTextUpdate && updatedText) {
                    subtitle.text = updatedText;
                }
                subtitle.reinterpretation = { ...normalizedEntry };
            }
        });
    }

    resolveReplacementIndex(replacement) {
        if (!replacement) return null;

        const candidateKeys = ['index', 'original_index', 'description_index', 'target_index'];
        for (const key of candidateKeys) {
            const value = replacement[key];
            if (Number.isInteger(value) && value >= 0) {
                return value;
            }
        }

        const { start, end } = this.getSubtitleTimes(replacement);

        if (Number.isFinite(start) || Number.isFinite(end)) {
            if (Array.isArray(this.classifiedSubtitles)) {
                for (let idx = 0; idx < this.classifiedSubtitles.length; idx += 1) {
                    if (this.matchesSubtitleData(this.classifiedSubtitles[idx], start, end, '')) {
                        return idx;
                    }
                }
            }
        }

        return null;
    }

    showReinterpretationResult(reinterpretationText, outline = null) {
        console.log('📋 showReinterpretationResult 호출됨', { textLength: reinterpretationText?.length, hasOutline: !!outline });

        const panel = document.getElementById('reinterpretation-panel');
        const textElement = document.getElementById('reinterpretation-text');

        if (!panel || !textElement) {
            console.warn('❌ 재해석 결과 패널을 찾을 수 없습니다', { panel: !!panel, textElement: !!textElement });
            return;
        }

        let displayText = reinterpretationText;
        if (outline && Array.isArray(outline) && outline.length > 0) {
            const outlineText = outline.map((item, index) => `${index + 1}. ${item}`).join('\n');
            displayText = `${outlineText}\n\n${reinterpretationText}`;
        }

        textElement.textContent = displayText.trim();
        panel.style.display = 'flex';

        // 패널이 화면에 보이도록 스크롤
        setTimeout(() => {
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            console.log('✅ 재해석 패널 표시됨', { displayText: displayText.substring(0, 100) + '...' });
        }, 100);
    }

    hideReinterpretationPanel() {
        const panel = document.getElementById('reinterpretation-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    async copyReinterpretationResult() {
        const textElement = document.getElementById('reinterpretation-text');
        if (!textElement) {
            this.showError('복사할 재해석 결과가 없습니다');
            return;
        }

        const text = textElement.textContent?.trim() || '';
        if (!text) {
            this.showError('복사할 재해석 결과가 없습니다');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showSuccess('재해석 결과가 클립보드에 복사되었습니다');
        } catch (error) {
            console.error('클립보드 복사 실패:', error);
            this.showError('클립보드에 복사하지 못했습니다. 직접 선택해 복사해주세요.');
        }
    }

    clearResults() {
        this.analysisResults = {};
        document.getElementById('audio-results').style.display = 'none';
        document.getElementById('stt-results').style.display = 'none';
        document.getElementById('comparison-results').style.display = 'none';
        document.getElementById('subtitle-editing-tools').style.display = 'none';
        this.reinterpretationHistory = {};
        this.currentReinterpretationEditIndex = null;
        this.activeReinterpretationTrack = null;
        const reinterpretPanel = document.getElementById('reinterpretation-panel');
        if (reinterpretPanel) {
            reinterpretPanel.style.display = 'none';
        }
        const reinterpretText = document.getElementById('reinterpretation-text');
        if (reinterpretText) {
            reinterpretText.textContent = '재해석 결과가 여기에 표시됩니다.';
        }
        const comparePanel = document.getElementById('reinterpretation-compare');
        if (comparePanel) {
            comparePanel.style.display = 'none';
        }
        const compareBefore = document.getElementById('reinterpretation-before-text');
        if (compareBefore) {
            compareBefore.textContent = '';
        }
        const compareAfter = document.getElementById('reinterpretation-after-input');
        if (compareAfter) {
            compareAfter.value = '';
        }
        const compareMeta = document.getElementById('reinterpretation-meta');
        if (compareMeta) {
            compareMeta.textContent = '';
        }
        const saveNameInput = document.getElementById('save-results-name');
        if (saveNameInput) {
            saveNameInput.value = '';
        }
        this.toggleSavedResultsPanel(false);
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

            const meta = this.fileMetadata.get(filePath);
            if (meta && (!meta.size || meta.size <= 0)) {
                console.warn('비디오 로드 건너뜀 - 0바이트 파일', meta);
                this.showError('이 영상 파일은 비어 있어 재생할 수 없습니다. 다시 다운로드해 주세요.');
                return;
            }

            // 기존 이벤트 리스너 제거 (초기 호출 시 undefined로 인한 예외 방지)
            if (this.onVideoLoadedMetadata) {
                videoPlayer.removeEventListener('loadedmetadata', this.onVideoLoadedMetadata);
            }
            if (this.onVideoTimeUpdate) {
                videoPlayer.removeEventListener('timeupdate', this.onVideoTimeUpdate);
            }
            if (this.onVideoCanPlay) {
                videoPlayer.removeEventListener('canplay', this.onVideoCanPlay);
            }

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
            videoPlayer.controls = true;
            videoPlayer.preload = 'metadata';
            videoPlayer.volume = 1.0;

            // 동적으로 소스 타입 설정
            const mp4Source = videoPlayer.querySelector('source[type="video/mp4"]');
            const webmSource = videoPlayer.querySelector('source[type="video/webm"]');
            if (mp4Source) mp4Source.removeAttribute('src');
            if (webmSource) webmSource.removeAttribute('src');
            videoPlayer.removeAttribute('src');

            const lowerPath = filePath.toLowerCase();
            if (lowerPath.endsWith('.mp4') && mp4Source) {
                mp4Source.src = videoUrl;
            } else if (lowerPath.endsWith('.webm') && webmSource) {
                webmSource.src = videoUrl;
            } else {
                videoPlayer.src = videoUrl;
            }

            // 새로운 소스를 강제로 로드해 즉시 반영
            videoPlayer.load();
            this.applyVideoMuteState();

            console.log('비디오 로드 시도', { filePath, videoUrl, meta });

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
        const skipToStartBtn = document.getElementById('skip-to-start-btn');
        const skipToEndBtn = document.getElementById('skip-to-end-btn');

        console.log('버튼 요소들:', { playPauseBtn, stopBtn, rewindBtn, forwardBtn, skipToStartBtn, skipToEndBtn });

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

        if (skipToStartBtn) {
            skipToStartBtn.addEventListener('click', () => {
                console.log('맨 처음으로 버튼 클릭됨');
                this.skipToStart();
            });
            console.log('맨 처음으로 버튼 이벤트 등록 완료');
        } else {
            console.log('맨 처음으로 버튼을 찾을 수 없음');
        }

        if (skipToEndBtn) {
            skipToEndBtn.addEventListener('click', () => {
                console.log('맨 끝으로 버튼 클릭됨');
                this.skipToEnd();
            });
            console.log('맨 끝으로 버튼 이벤트 등록 완료');
        } else {
            console.log('맨 끝으로 버튼을 찾을 수 없음');
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
                await this.loadFileList('audio'); // 파일 목록 새로고침
                await this.promptAudioSelection('audio');
            });
        }

        // 배경음악 로드 버튼
        const loadBGMBtn = document.getElementById('load-bgm-file');
        if (loadBGMBtn) {
            loadBGMBtn.addEventListener('click', async () => {
                await this.loadFileList('audio'); // 파일 목록 새로고침
                await this.promptAudioSelection('bgm');
            });
        }

        if (loadSubtitleBtn) {
            loadSubtitleBtn.addEventListener('click', async () => {
                await this.loadFileList(); // 파일 목록 새로고침
                this.loadSelectedSubtitle();
            });
        }

        // 번역기 자막 로드 버튼
        const loadTranslatorBtn = document.getElementById('load-translator-subtitles');
        if (loadTranslatorBtn) {
            loadTranslatorBtn.addEventListener('click', async () => {
                await this.loadTranslatorSubtitles();
            });
        }

        // 번역기 음성 로드 버튼
        const loadTranslatorAudioBtn = document.getElementById('load-translator-audio');
        console.log('번역기 음성 로드 버튼:', loadTranslatorAudioBtn);
        if (loadTranslatorAudioBtn) {
            console.log('번역기 음성 로드 버튼 이벤트 리스너 등록');
            loadTranslatorAudioBtn.addEventListener('click', async () => {
                console.log('번역기 음성 로드 버튼 클릭됨!');
                await this.loadTranslatorAudio();
            });
        } else {
            console.error('번역기 음성 로드 버튼을 찾을 수 없습니다!');
        }

        // 파일 목록의 자막 불러오기 버튼
        const loadSubtitleFromFilelist = document.getElementById('load-subtitle-from-filelist');
        if (loadSubtitleFromFilelist) {
            loadSubtitleFromFilelist.addEventListener('click', async () => {
                await this.loadFileList();
                this.loadSelectedSubtitle();
            });
        }

        // 파일 목록의 번역기 자막 불러오기 버튼
        const loadTranslatorFromFilelist = document.getElementById('load-translator-from-filelist');
        if (loadTranslatorFromFilelist) {
            loadTranslatorFromFilelist.addEventListener('click', async () => {
                await this.loadTranslatorSubtitles();
            });
        }

        // 번역 결과의 자막 불러오기 버튼
        const loadSubtitleFromResults = document.getElementById('load-subtitle-from-results');
        if (loadSubtitleFromResults) {
            loadSubtitleFromResults.addEventListener('click', async () => {
                await this.loadFileList();
                this.loadSelectedSubtitle();
            });
        }

        // 번역 결과의 번역기 자막 불러오기 버튼
        const loadTranslatorFromResults = document.getElementById('load-translator-from-results');
        if (loadTranslatorFromResults) {
            loadTranslatorFromResults.addEventListener('click', async () => {
                await this.loadTranslatorSubtitles();
            });
        }

        // 분석 대상의 자막 불러오기 버튼 (번역 결과에 추가)
        const loadSubtitleToResults = document.getElementById('load-subtitle-to-results');
        if (loadSubtitleToResults) {
            loadSubtitleToResults.addEventListener('click', async () => {
                await this.loadSubtitleToResults();
            });
        }

        // 설명자막 음성 자르기 버튼
        const cutTranslationAudioBtn = document.getElementById('cut-translation-audio');
        if (cutTranslationAudioBtn) {
            cutTranslationAudioBtn.addEventListener('click', async () => {
                await this.cutTranslationAudio();
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

        // 자막 지우기 버튼
        const clearSubtitlesBtn = document.getElementById('clear-subtitles');
        if (clearSubtitlesBtn) {
            clearSubtitlesBtn.addEventListener('click', () => {
                this.clearAllSubtitles();
            });
        }

        // 트랙 지우기 버튼
        const clearTracksBtn = document.getElementById('clear-tracks');
        if (clearTracksBtn) {
            clearTracksBtn.addEventListener('click', () => {
                this.clearAllTracks();
            });
        }

        // 영상 출력 파일 만들기 버튼
        const createOutputVideoBtn = document.getElementById('create-output-video');
        if (createOutputVideoBtn) {
            createOutputVideoBtn.addEventListener('click', async () => {
                await this.createOutputVideo();
            });
        }

        const saveTrackProjectBtn = document.getElementById('save-track-project');
        if (saveTrackProjectBtn) {
            saveTrackProjectBtn.addEventListener('click', async () => {
                await this.saveTrackProject();
            });
        }

        const loadTrackProjectBtn = document.getElementById('load-track-project');
        if (loadTrackProjectBtn) {
            loadTrackProjectBtn.addEventListener('click', async () => {
                await this.loadTrackProject();
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

        // 오디오 플레이어와 타임라인 동기화
        const audioPlayer = document.getElementById('audio-player');
        if (audioPlayer) {
            audioPlayer.addEventListener('timeupdate', () => {
                this.updateTimelinePosition();
                this.updateCurrentSubtitle();
            });

            audioPlayer.addEventListener('loadedmetadata', () => {
                this.timeline.duration = audioPlayer.duration;
                this.updateTimelineRuler();
                this.updateTimeDisplay();
            });

            audioPlayer.addEventListener('play', () => {
                this.timeline.isPlaying = true;
                this.updatePlayPauseButton();
            });

            audioPlayer.addEventListener('pause', () => {
                this.timeline.isPlaying = false;
                this.updatePlayPauseButton();
            });
        }

        // 트랙 체크박스 이벤트 리스너 추가
        const trackVideoEnable = document.getElementById('track-video-enable');
        if (trackVideoEnable) {
            trackVideoEnable.addEventListener('change', () => {
                this.applyVideoMuteState();
            });
        }

        const trackAudioEnable = document.getElementById('track-audio-enable');
        if (trackAudioEnable) {
            trackAudioEnable.addEventListener('change', (e) => {
                const audioPlayer = document.getElementById('audio-player');
                if (audioPlayer && this.timeline.isPlaying) {
                    if (e.target.checked) {
                        audioPlayer.play().catch(console.error);
                        console.log('✅ 오디오 트랙 켜짐');
                    } else {
                        audioPlayer.pause();
                        console.log('⏸️ 오디오 트랙 꺼짐');
                    }
                }
            });
        }

        const trackCommentaryEnable = document.getElementById('track-commentary-enable');
        if (trackCommentaryEnable) {
            trackCommentaryEnable.addEventListener('change', (e) => {
                if (this.commentaryAudio && this.timeline.isPlaying) {
                    if (e.target.checked) {
                        this.commentaryAudio.play().catch(console.error);
                        console.log('✅ 해설 음성 트랙 켜짐');
                    } else {
                        this.commentaryAudio.pause();
                        console.log('⏸️ 해설 음성 트랙 꺼짐');
                    }
                }
            });
        }

        // 영상 음소거 버튼
        const videoMuteBtn = document.getElementById('video-mute-btn');
        if (videoMuteBtn) {
            videoMuteBtn.addEventListener('click', () => {
                const videoPlayer = document.getElementById('video-player');
                if (videoPlayer) {
                    const videoTrackEnabled = document.getElementById('track-video-enable')?.checked ?? true;
                    const newMutedState = videoTrackEnabled ? !videoPlayer.muted : !this.videoMuteState;
                    this.setVideoMuteState(newMutedState);
                    this.applyVideoMuteState();
                }
            });
        }
    }

    setVideoMuteState(isMuted) {
        this.videoMuteState = !!isMuted;
        try {
            window.localStorage.setItem('videoanalysis_video_muted', this.videoMuteState ? 'true' : 'false');
        } catch (error) {
            console.warn('video mute storage unavailable:', error);
        }
    }

    applyVideoMuteState() {
        const videoPlayer = document.getElementById('video-player');
        const videoMuteBtn = document.getElementById('video-mute-btn');
        const videoTrackEnabled = document.getElementById('track-video-enable')?.checked ?? true;
        const shouldMute = !videoTrackEnabled || this.videoMuteState;

        if (videoPlayer) {
            videoPlayer.muted = shouldMute;
            console.log(`비디오 음소거: ${videoPlayer.muted}`);
        }

        if (videoMuteBtn) {
            const isMuted = videoPlayer ? videoPlayer.muted : shouldMute;
            videoMuteBtn.textContent = isMuted ? '🔇' : '🔊';
            videoMuteBtn.title = isMuted ? '영상 음소거 해제' : '영상 음소거';
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

        const audioPlayer = document.getElementById('audio-player');

        if (this.timeline.isPlaying) {
            // 일시정지
            videoPlayer.pause();
            if (audioPlayer) audioPlayer.pause();
            if (this.commentaryAudio) this.commentaryAudio.pause();

            // 실시간 동기화 중지
            this.stopRealtimeWaveformSync();
            console.log('재생 일시정지 - 현재 위치:', videoPlayer.currentTime);
        } else {
            // 재생
            // 비디오가 로드되어 있는지 확인
            const hasVideo = videoPlayer.src && videoPlayer.readyState >= 2;
            const hasAudio = audioPlayer && audioPlayer.src && audioPlayer.readyState >= 2;
            const hasCommentary = this.commentaryAudio && this.commentaryAudio.src && this.commentaryAudio.readyState >= 2;

            console.log('재생 모드:', { hasVideo, hasAudio, hasCommentary });

            if (!hasVideo && !hasAudio) {
                this.showError('재생할 비디오 또는 음성 파일이 없습니다.');
                return;
            }

            // 트랙 체크박스 상태 확인
            const audioTrackEnabled = document.getElementById('track-audio-enable')?.checked ?? true;
            const commentaryTrackEnabled = document.getElementById('track-commentary-enable')?.checked ?? true;

            // 비디오 소리 음소거 설정 (비디오 트랙 상태 및 사용자 음소거 상태 반영)
            if (hasVideo) {
                this.applyVideoMuteState();
            }

            // 현재 타임라인 위치로 시간 설정
            if (this.timeline.currentTime !== undefined) {
                if (hasVideo) {
                    videoPlayer.currentTime = this.timeline.currentTime;
                }
                if (hasAudio) {
                    audioPlayer.currentTime = this.timeline.currentTime;
                }
                if (hasCommentary) {
                    this.commentaryAudio.currentTime = this.timeline.currentTime;
                }
                console.log('재생 시간 설정:', this.timeline.currentTime);
            }

            // 재생 시작
            const playPromises = [];

            if (hasVideo) {
                playPromises.push(
                    videoPlayer.play().then(() => {
                        console.log('✅ 비디오 재생 시작');
                    }).catch(error => {
                        console.error('비디오 재생 실패:', error);
                    })
                );
            }

            // 오디오는 체크박스가 켜져있을 때만 재생
            if (hasAudio && audioTrackEnabled) {
                playPromises.push(
                    audioPlayer.play().then(() => {
                        console.log('✅ 오디오 재생 시작');
                    }).catch(error => {
                        console.error('오디오 재생 실패:', error);
                    })
                );
            } else if (hasAudio && !audioTrackEnabled) {
                audioPlayer.pause();
                console.log('⏸️ 오디오 트랙 꺼짐 - 재생 안 함');
            }

            // 해설 음성은 체크박스가 켜져있을 때만 재생
            console.log(`해설음성 상태 체크: hasCommentary=${hasCommentary}, commentaryTrackEnabled=${commentaryTrackEnabled}`);
            if (hasCommentary && commentaryTrackEnabled) {
                console.log(`해설음성 재생 시도 - volume: ${this.commentaryAudio.volume}, readyState: ${this.commentaryAudio.readyState}`);
                playPromises.push(
                    this.commentaryAudio.play().then(() => {
                        console.log(`✅ 해설 음성 재생 시작 - 볼륨: ${this.commentaryAudio.volume}`);
                    }).catch(error => {
                        console.error('해설 음성 재생 실패:', error);
                    })
                );
            } else if (hasCommentary && !commentaryTrackEnabled) {
                this.commentaryAudio.pause();
                console.log('⏸️ 해설 음성 트랙 꺼짐 - 재생 안 함');
            } else {
                console.log('❌ 해설 음성 없음 또는 로드되지 않음');
            }

            Promise.all(playPromises).finally(() => {
                // 실시간 파형-자막 동기화 시작
                this.startRealtimeWaveformSync();
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

        // 해설 음성 정지
        if (this.commentaryAudio) {
            this.commentaryAudio.pause();
            console.log(`해설 음성 정지 - 현재 위치 유지: ${this.commentaryAudio.currentTime}초`);
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
        if (this.timeline) {
            this.timeline.currentTime = 0;
        }

        // UI 업데이트
        if (this.updateTimelinePosition) {
            this.updateTimelinePosition();
        }
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
        } else if (this.timeline && this.timeline.duration) {
            endTime = this.timeline.duration;
        } else {
            console.log('끝 시간을 찾을 수 없습니다');
            if (this.showError) {
                this.showError('미디어의 끝 시간을 확인할 수 없습니다');
            }
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
        if (this.timeline) {
            this.timeline.currentTime = endTime;
        }

        // UI 업데이트
        if (this.updateTimelinePosition) {
            this.updateTimelinePosition();
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
        const audioPlayer = document.getElementById('audio-player');

        // 타임라인 현재 시간 업데이트 (0초 이상만 허용)
        this.timeline.currentTime = Math.max(0, time);

        if (videoPlayer && time >= 0) {
            // 비디오 플레이어 시간 설정
            const clampedTime = Math.max(0, Math.min(videoPlayer.duration || time, time));
            videoPlayer.currentTime = clampedTime;
            console.log(`비디오 플레이어 시간 이동: ${clampedTime}초`);
        }

        // 오디오 플레이어 시간 설정
        if (audioPlayer && audioPlayer.src && time >= 0) {
            const clampedTime = Math.max(0, Math.min(audioPlayer.duration || time, time));
            audioPlayer.currentTime = clampedTime;
            console.log(`오디오 플레이어 시간 이동: ${clampedTime}초`);
        }

        // 해설 음성 시간 설정
        if (this.commentaryAudio && this.commentaryAudio.src && time >= 0) {
            const clampedTime = Math.max(0, Math.min(this.commentaryAudio.duration || time, time));
            this.commentaryAudio.currentTime = clampedTime;
            console.log(`해설 음성 시간 이동: ${clampedTime}초`);
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
        const audioPlayer = document.getElementById('audio-player');
        const playhead = document.getElementById('playhead');

        if (!playhead) return;

        // 비디오 또는 오디오 중 재생 중인 것의 시간 사용
        let currentTime = 0;

        if (videoPlayer && videoPlayer.src && !videoPlayer.paused) {
            currentTime = videoPlayer.currentTime;
        } else if (audioPlayer && audioPlayer.src && !audioPlayer.paused) {
            currentTime = audioPlayer.currentTime;
        } else if (videoPlayer && videoPlayer.src) {
            currentTime = videoPlayer.currentTime;
        } else if (audioPlayer && audioPlayer.src) {
            currentTime = audioPlayer.currentTime;
        }

        this.timeline.currentTime = currentTime;
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
            this.videoPath = videoPath; // videoPath도 저장

            // 비디오 트랙에 클립 표시
            if (videoTrack) {
                // 0초부터 시작하므로 전체 폭 사용
                videoTrack.innerHTML = `
                    <div class="video-clip" style="left: 0%; width: 100%;">
                        📹 ${videoPath.split('/').pop()}
                    </div>
                `;
            }

            console.log('✅ 영상 파일 로드 완료:', {
                videoPath: this.videoPath,
                timelineVideoData: this.timeline.videoData
            });

            this.showSuccess('영상 파일이 로드되었습니다');
        }
    }

    async promptAudioSelection(mode = 'audio') {
        try {
            const response = await fetch('/api/files?filter_type=all');
            if (!response.ok) {
                throw new Error('파일 목록을 불러올 수 없습니다.');
            }

            const data = await response.json();
            const audioFiles = Array.isArray(data.files)
                ? data.files.filter(file => file && (
                    file.type === 'audio' || this.getFileType(file.path) === 'audio'
                ))
                : [];

            if (!audioFiles.length) {
                this.showError('사용 가능한 오디오 파일이 없습니다. 먼저 음성 파일을 추가하세요.');
                return;
            }

            const accentColor = mode === 'bgm' ? '#2196F3' : '#4CAF50';
            const highlightIcon = mode === 'bgm' ? '🎹' : '🎵';
            const title = mode === 'bgm' ? '배경음악 파일 선택' : '음성 파일 선택';
            const description = mode === 'bgm'
                ? '타임라인에 사용할 배경음악 파일을 선택하세요.'
                : '주 음성 트랙으로 사용할 파일을 선택하세요.';

            this.showFileSelectionModal({
                modalId: mode === 'bgm' ? 'bgm-picker-modal' : 'audio-picker-modal',
                title,
                description,
                accentColor,
                highlightIcon,
                files: audioFiles,
                selectedPath: mode === 'bgm' ? this.bgmFilePath : this.audioFilePath,
                emptyMessage: '사용 가능한 오디오 파일이 없습니다. 먼저 파일을 추가하세요.',
                onSelect: async (file) => {
                    if (mode === 'bgm') {
                        await this.loadSelectedBGM(file.path);
                    } else {
                        await this.loadSelectedAudio(file.path);
                    }
                }
            });
        } catch (error) {
            console.error('오디오 파일 선택 준비 실패:', error);
            this.showError('오디오 파일 목록을 불러오지 못했습니다: ' + error.message);
        }
    }

    showFileSelectionModal(options) {
        const {
            modalId = 'file-picker-modal',
            title = '파일 선택',
            description = '',
            accentColor = '#4CAF50',
            highlightIcon = '📄',
            files = [],
            emptyMessage = '선택할 수 있는 파일이 없습니다.',
            selectedPath = null,
            onSelect = null
        } = options || {};

        if (typeof document === 'undefined') {
            return;
        }

        const existingModal = document.getElementById(modalId);
        if (existingModal) {
            existingModal.remove();
        }

        const listHtml = files.length
            ? files.map((file, index) => {
                const displayName = file.name || (file.path ? file.path.split('/').pop() : '오디오 파일');
                const isSelected = selectedPath && file.path === selectedPath;
                const detailParts = [];
                if (file.size_mb) {
                    detailParts.push(`${file.size_mb}MB`);
                }
                if (file.modified_str) {
                    detailParts.push(file.modified_str);
                }
                const detailText = detailParts.join(' · ');

                return `
                    <div class="modal-file-item" data-file-index="${index}" style="padding: 12px; margin: 8px 0; background: ${isSelected ? '#3f4b3f' : '#3a3a3a'}; border-radius: 6px; cursor: pointer; border: 2px solid ${isSelected ? accentColor : 'transparent'}; transition: all 0.2s;">
                        <div style=\"color: ${accentColor}; font-weight: bold; margin-bottom: 4px;\">${highlightIcon} ${displayName}</div>
                        <div style=\"color: #b0c4d0; font-size: 12px;\">${detailText}</div>
                        <div style=\"color: #8899a6; font-size: 12px; word-break: break-all;\">${file.path || ''}</div>
                    </div>
                `;
            }).join('')
            : `<div style="padding: 16px; background: #3a3a3a; border-radius: 6px; text-align: center; color: #b0c4d0;">${emptyMessage}</div>`;

        const modalHtml = `
            <div id="${modalId}" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                <div style="background: #2a2a2a; padding: 28px; border-radius: 12px; width: min(90%, 560px); max-height: 80vh; overflow-y: auto; box-shadow: 0 12px 32px rgba(0,0,0,0.45);">
                    <h3 style="margin: 0 0 10px 0; color: ${accentColor};">${title}</h3>
                    ${description ? `<p style="margin: 0 0 16px 0; color: #cfd8dc; font-size: 14px; line-height: 1.5;">${description}</p>` : ''}
                    <div style="margin-bottom: 20px;">${listHtml}</div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button data-action="cancel" style="padding: 10px 18px; background: #616161; color: white; border: none; border-radius: 6px; cursor: pointer;">취소</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modalElement = document.getElementById(modalId);
        if (!modalElement) {
            return;
        }

        const closeModal = () => {
            modalElement.remove();
        };

        modalElement.addEventListener('click', (event) => {
            if (event.target === modalElement) {
                closeModal();
            }
        });

        const cancelButton = modalElement.querySelector('[data-action="cancel"]');
        if (cancelButton) {
            cancelButton.addEventListener('click', closeModal);
        }

        modalElement.querySelectorAll('[data-file-index]').forEach((item) => {
            item.addEventListener('click', async () => {
                const index = Number(item.getAttribute('data-file-index'));
                const file = files[index];
                if (!file) {
                    return;
                }

                closeModal();

                if (typeof onSelect === 'function') {
                    try {
                        await onSelect(file);
                    } catch (error) {
                        console.error('파일 선택 처리 실패:', error);
                        this.showError('파일을 로드하는 중 오류가 발생했습니다: ' + error.message);
                    }
                }
            });
        });
    }

    async loadSelectedAudio(manualPath = null) {
        let audioPath = manualPath;

        if (!audioPath) {
            const selectedAudios = Array.from(this.selectedFiles).filter(path =>
                this.getFileType(path) === 'audio');

            if (selectedAudios.length === 0) {
                try {
                    console.log('API에서 음성 파일 검색 중...');
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
                        audioPath = availableAudios[0];
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
            } else {
                audioPath = selectedAudios[0];
            }
        }

        if (!audioPath) {
            this.showError('로드할 음성 파일을 찾을 수 없습니다.');
            return;
        }

        this.timeline.audioData = { path: audioPath };
        this.audioFilePath = audioPath; // 음성 파일 경로 저장
        this.audioPath = audioPath; // audioPath도 저장

        console.log('🎵 음성 파일 로드 시작:', audioPath);

        // 오디오 플레이어에 로드
        const audioPlayer = document.getElementById('audio-player');
        const audioPlayerContainer = document.querySelector('.audio-player-container');

        if (audioPlayer && audioPlayerContainer) {
            // 오디오 소스 설정
            const audioUrl = `/api/file-content?path=${encodeURIComponent(audioPath)}`;
            console.log('🎵 오디오 URL 설정:', audioUrl);

            audioPlayer.src = audioUrl;

            // 오디오 플레이어 표시
            audioPlayerContainer.style.display = 'block';

            // 오디오 이벤트 리스너 추가
            audioPlayer.onloadedmetadata = () => {
                console.log('✅ 오디오 메타데이터 로드 완료');
                console.log('오디오 길이:', audioPlayer.duration, '초');
            };

            audioPlayer.onerror = (e) => {
                console.error('❌ 오디오 로드 실패:', e);
                console.error('오디오 에러 코드:', audioPlayer.error?.code);
                console.error('오디오 에러 메시지:', audioPlayer.error?.message);
                this.showError('오디오 파일을 로드할 수 없습니다: ' + audioPlayer.error?.message);
            };

            audioPlayer.oncanplay = () => {
                console.log('✅ 오디오 재생 준비 완료');
            };

            // 오디오 로드
            audioPlayer.load();

            // 볼륨 확인 및 설정
            audioPlayer.volume = 1.0; // 최대 볼륨
            audioPlayer.muted = false; // 음소거 해제

            console.log('✅ 오디오 플레이어에 로드 시작:', audioPath);
            console.log('볼륨:', audioPlayer.volume, '음소거:', audioPlayer.muted);
        } else {
            console.error('❌ 오디오 플레이어 요소를 찾을 수 없음');
        }

        // 실제 음성 파형 그리기만 시도 (즉시 파형은 제거)
        await this.drawAudioWaveform(audioPath);

        console.log('✅ 음성 파일 로드 완료:', {
            audioPath: this.audioPath,
            audioFilePath: this.audioFilePath,
            timelineAudioData: this.timeline.audioData
        });

        const audioFileName = audioPath.split('/').pop();
        this.showSuccess(`음성 파일이 로드되었습니다: ${audioFileName}`);
    }

    async loadSelectedBGM(manualPath = null) {
        let bgmPath = manualPath;

        if (!bgmPath) {
            const selectedAudios = Array.from(this.selectedFiles).filter(path =>
                this.getFileType(path) === 'audio');

            if (selectedAudios.length === 0) {
                try {
                    console.log('API에서 배경음악 파일 검색 중...');
                    const response = await fetch('/api/files?filter_type=all');
                    const data = await response.json();
                    const availableBGMs = [];

                    if (data.files) {
                        data.files.forEach(file => {
                            if (file.path && this.getFileType(file.path) === 'audio') {
                                availableBGMs.push(file.path);
                            }
                        });
                    }

                    console.log('API에서 찾은 배경음악 파일들:', availableBGMs);

                    if (availableBGMs.length > 0) {
                        bgmPath = availableBGMs[0];
                        this.showInfo(`배경음악 파일을 자동으로 선택했습니다: ${availableBGMs[0].split('/').pop()}`);
                    } else {
                        this.showError('배경음악 파일이 없습니다. .mp3, .wav 등의 음성 파일을 업로드하거나 선택하세요.');
                        return;
                    }
                } catch (error) {
                    console.error('파일 목록 조회 오류:', error);
                    this.showError('배경음악 파일 검색 중 오류가 발생했습니다: ' + error.message);
                    return;
                }
            } else {
                bgmPath = selectedAudios[0];
            }
        }

        if (!bgmPath) {
            this.showError('로드할 배경음악 파일을 찾을 수 없습니다.');
            return;
        }

        this.timeline.bgmData = { path: bgmPath };
        this.bgmFilePath = bgmPath; // 배경음악 파일 경로 저장

        console.log('🎵 배경음악 파일 로드 시작:', bgmPath);

        // 배경음악 파형 그리기
        await this.drawBGMWaveform(bgmPath);

        const bgmFileName = bgmPath.split('/').pop();
        this.showSuccess(`배경음악 파일이 로드되었습니다: ${bgmFileName}`);
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

    async loadSubtitleToResults() {
        try {
            // 자막 파일 자동 검색
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

            if (availableSubtitles.length === 0) {
                this.showError('자막 파일이 없습니다. .srt 또는 .vtt 파일을 업로드하거나 선택하세요.');
                return;
            }

            // _fixed.srt, _generated.srt 파일을 우선적으로 선택
            const preferredSubtitle = availableSubtitles.find(path =>
                path.includes('_fixed.srt') || path.includes('_generated.srt')) || availableSubtitles[0];

            this.showInfo(`자막 파일을 분석하고 있습니다: ${preferredSubtitle.split('/').pop()}`);

            // 자막 파일 분석 API 호출
            const analysisResponse = await fetch('/api/analysis/subtitle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: [preferredSubtitle] })
            });

            const analysisData = await analysisResponse.json();

            if (analysisData.results && analysisData.results[0] && analysisData.results[0].status === 'success') {
                const resultData = analysisData.results[0].data;

                // 자막 데이터 추출
                let subtitles = [];
                if (resultData.subtitles) {
                    subtitles = resultData.subtitles;
                } else if (resultData.analysis && resultData.analysis.subtitles) {
                    subtitles = resultData.analysis.subtitles;
                }

                console.log('📋 전체 자막 개수:', subtitles.length);

                // 화자 정보 추출
                const speakers = new Set();
                subtitles.forEach(sub => {
                    if (sub.speaker) {
                        speakers.add(sub.speaker);
                    }
                });

                console.log('🎤 감지된 화자:', Array.from(speakers));

                // 화자가 있으면 선택 다이얼로그 표시
                let selectedSpeaker = null;
                if (speakers.size > 0) {
                    selectedSpeaker = await this.showSpeakerSelectionDialog(Array.from(speakers), subtitles);
                    if (selectedSpeaker === null) {
                        // 사용자가 취소한 경우
                        return;
                    }
                }

                // 선택한 화자의 자막만 필터링
                let filteredSubtitles = subtitles;
                if (selectedSpeaker !== null && selectedSpeaker !== 'all') {
                    filteredSubtitles = subtitles.filter(sub => sub.speaker === selectedSpeaker);
                    console.log(`🎯 화자 "${selectedSpeaker}" 자막 필터링: ${filteredSubtitles.length}개`);
                }

                // 자막 텍스트를 재해석 형식으로 변환
                let reinterpretationText = '';
                if (filteredSubtitles.length > 0) {
                    reinterpretationText = filteredSubtitles.map((sub, index) => {
                        const timeStr = `[${this.formatDuration(sub.start_time)} → ${this.formatDuration(sub.end_time)}]`;
                        return `${index + 1}. ${timeStr}\n${sub.text}`;
                    }).join('\n\n');
                }

                // 재해석 패널에 표시
                if (reinterpretationText) {
                    this.showReinterpretationResult(reinterpretationText);
                    const speakerInfo = selectedSpeaker && selectedSpeaker !== 'all' ? ` (화자: ${selectedSpeaker})` : '';
                    this.showSuccess(`자막이 재해석 자막 (한국어)에 추가되었습니다: ${preferredSubtitle.split('/').pop()}${speakerInfo} (${filteredSubtitles.length}개 구간)`);
                } else {
                    this.showError('자막 내용을 추출할 수 없습니다.');
                }
            } else {
                throw new Error(analysisData.results?.[0]?.error || '자막 분석 실패');
            }
        } catch (error) {
            console.error('자막 불러오기 에러:', error);
            this.showError('자막 불러오기 실패: ' + error.message);
        }
    }

    async showSpeakerSelectionDialog(speakers, subtitles) {
        return new Promise((resolve) => {
            // 다이얼로그 HTML 생성
            const dialogHTML = `
                <div id="speaker-selection-dialog" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                ">
                    <div style="
                        background: white;
                        padding: 30px;
                        border-radius: 12px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        max-width: 500px;
                        width: 90%;
                    ">
                        <h3 style="margin-top: 0; margin-bottom: 20px; color: #333;">🎤 화자 선택</h3>
                        <p style="margin-bottom: 20px; color: #666;">불러올 자막의 화자를 선택하세요:</p>
                        <div id="speaker-options" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 12px; cursor: pointer; padding: 10px; border: 2px solid #ddd; border-radius: 6px; transition: all 0.2s;">
                                <input type="radio" name="speaker" value="all" checked style="margin-right: 8px;">
                                <strong>전체 (${subtitles.length}개)</strong>
                            </label>
                            ${speakers.map(speaker => {
                                const count = subtitles.filter(sub => sub.speaker === speaker).length;
                                return `
                                    <label style="display: block; margin-bottom: 12px; cursor: pointer; padding: 10px; border: 2px solid #ddd; border-radius: 6px; transition: all 0.2s;">
                                        <input type="radio" name="speaker" value="${speaker}" style="margin-right: 8px;">
                                        <strong>${speaker}</strong> (${count}개)
                                    </label>
                                `;
                            }).join('')}
                        </div>
                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                            <button id="speaker-cancel-btn" style="
                                padding: 10px 20px;
                                background-color: #ccc;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                            ">취소</button>
                            <button id="speaker-ok-btn" style="
                                padding: 10px 20px;
                                background-color: #4CAF50;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                            ">확인</button>
                        </div>
                    </div>
                </div>
            `;

            // 다이얼로그를 body에 추가
            document.body.insertAdjacentHTML('beforeend', dialogHTML);

            const dialog = document.getElementById('speaker-selection-dialog');
            const okBtn = document.getElementById('speaker-ok-btn');
            const cancelBtn = document.getElementById('speaker-cancel-btn');

            // 라디오 버튼 hover 효과
            const labels = dialog.querySelectorAll('label');
            labels.forEach(label => {
                label.addEventListener('mouseenter', () => {
                    label.style.backgroundColor = '#f0f0f0';
                    label.style.borderColor = '#4CAF50';
                });
                label.addEventListener('mouseleave', () => {
                    label.style.backgroundColor = 'white';
                    if (!label.querySelector('input').checked) {
                        label.style.borderColor = '#ddd';
                    }
                });
                label.querySelector('input').addEventListener('change', () => {
                    labels.forEach(l => l.style.borderColor = '#ddd');
                    if (label.querySelector('input').checked) {
                        label.style.borderColor = '#4CAF50';
                    }
                });
            });

            // 확인 버튼
            okBtn.addEventListener('click', () => {
                const selected = dialog.querySelector('input[name="speaker"]:checked');
                const value = selected ? selected.value : 'all';
                dialog.remove();
                resolve(value);
            });

            // 취소 버튼
            cancelBtn.addEventListener('click', () => {
                dialog.remove();
                resolve(null);
            });

            // ESC 키로 닫기
            const handleKeyPress = (e) => {
                if (e.key === 'Escape') {
                    dialog.remove();
                    resolve(null);
                    document.removeEventListener('keydown', handleKeyPress);
                }
            };
            document.addEventListener('keydown', handleKeyPress);
        });
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
            const globalIndexGuess = this.findSubtitleIndexForData(subtitle);
            const resolvedIndex = Number.isInteger(globalIndexGuess) && globalIndexGuess >= 0
                ? globalIndexGuess
                : (typeof subtitle.globalIndex === 'number'
                    ? subtitle.globalIndex
                    : (typeof subtitle.originalIndex === 'number'
                        ? subtitle.originalIndex
                        : index));

            block.dataset.index = resolvedIndex;
            block.dataset.globalIndex = resolvedIndex;
            block.dataset.trackType = trackType;

            subtitle.globalIndex = resolvedIndex;
            if (typeof subtitle.originalIndex !== 'number') {
                subtitle.originalIndex = resolvedIndex;
            }

            const historyEntry = this.reinterpretationHistory ? this.reinterpretationHistory[resolvedIndex] : null;
            if (historyEntry && trackType === 'description') {
                block.classList.add('has-reinterpretation');
                block.dataset.originalText = historyEntry.original_text || '';
                block.dataset.updatedText = subtitle.text || '';
            }

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

            const tooltipOriginal = historyEntry?.original_text || subtitle.__original_description_text;
            if (trackType === 'description' && tooltipOriginal && tooltipOriginal.trim() && tooltipOriginal.trim() !== (subtitle.text || '').trim()) {
                block.title = `#${resolvedIndex + 1}: ${this.formatSubtitleTime(subtitle.start_time)} - ${this.formatSubtitleTime(subtitle.end_time)}\n[변경 전]\n${tooltipOriginal}\n\n[변경 후]\n${subtitle.text}`;
            } else {
                block.title = `#${resolvedIndex + 1}: ${this.formatSubtitleTime(subtitle.start_time)} - ${this.formatSubtitleTime(subtitle.end_time)}\n${subtitle.text}`;
            }

            // 이벤트 리스너 추가 (편집 기능 + 드래그)
            this.addSubtitleBlockEvents(block, subtitle, resolvedIndex);
            this.addDragFunctionality(block, subtitle, resolvedIndex);

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

        // track-title 내의 label 요소만 찾아서 수정 (체크박스는 유지)
        const trackLabel = trackTitle.querySelector('label');
        if (!trackLabel) {
            // label이 없으면 기존 방식대로 (하위 호환성)
            trackTitle.textContent = trackTitle.textContent.replace(/\s*\(\d+\)$/, '');
            if (count > 0) {
                trackTitle.textContent += ` (${count})`;
            }
            return;
        }

        // label의 텍스트만 업데이트
        let labelText = trackLabel.textContent.replace(/\s*\(\d+\)$/, '');
        if (count > 0) {
            labelText += ` (${count})`;
        }
        trackLabel.textContent = labelText;
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
            const datasetTrackType = block.dataset.trackType || subtitle.assigned_track || subtitle.track || 'main';
            this.updateReinterpretationComparison(index, datasetTrackType);
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
            const subtitleLines = this.buildRealtimeSubtitleLines(currentSubtitles);
            if (subtitleLines.length > 0) {
                this.showCurrentSubtitleText(subtitleLines);
            } else {
                const fallbackText = currentSubtitles[0]?.text || '';
                if (fallbackText.trim()) {
                    this.showCurrentSubtitleText(fallbackText);
                } else {
                    this.hideCurrentSubtitleText();
                }
            }
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

    showCurrentSubtitleText(content) {
        const lines = [];

        const appendLine = (track, text) => {
            if (!text) return;
            const trimmed = String(text).trim();
            if (!trimmed) return;
            const normalizedTrack = this.normalizeTrackKey(track) || 'main';
            lines.push({
                track: normalizedTrack,
                text: trimmed
            });
        };

        if (Array.isArray(content)) {
            content.forEach(item => {
                if (!item) return;
                if (typeof item === 'string') {
                    appendLine('main', item);
                } else if (typeof item === 'object') {
                    appendLine(item.track || item.track_type || item.trackType || 'main', item.text || item.value || '');
                }
            });
        } else if (typeof content === 'string') {
            appendLine('main', content);
        } else if (content && typeof content === 'object') {
            appendLine(content.track || content.track_type || content.trackType || 'main', content.text || content.value || '');
        }

        if (lines.length === 0) {
            this.hideCurrentSubtitleText();
            return;
        }

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

        realtimeDisplay.innerHTML = '';

        lines.forEach(line => {
            const lineElement = document.createElement('div');
            lineElement.className = 'realtime-subtitle-line';
            if (line.track) {
                lineElement.classList.add(`realtime-subtitle-${line.track}`);
            }
            lineElement.dataset.track = line.track;
            lineElement.textContent = line.text;
            realtimeDisplay.appendChild(lineElement);
        });

        realtimeDisplay.style.display = 'block';
    }

    hideCurrentSubtitleText() {
        const realtimeDisplay = document.getElementById('realtime-subtitle-display');
        if (realtimeDisplay) {
            realtimeDisplay.style.display = 'none';
        }
    }

    normalizeTrackKey(track) {
        if (track === null || track === undefined) {
            return null;
        }
        const key = String(track).trim().toLowerCase();
        const mapping = {
            main: 'main',
            original: 'main',
            primary: 'main',
            source: 'main',
            translation: 'translation',
            translated: 'translation',
            trans: 'translation',
            dub: 'translation',
            explanation: 'description',
            explanatory: 'description',
            explain: 'description',
            description: 'description',
            desc: 'description',
            narration: 'description',
            sfx: 'description',
            effect: 'description',
            caption: 'description'
        };

        if (mapping[key]) {
            return mapping[key];
        }

        if (key.includes('description') || key.includes('desc') || key.includes('sfx') || key.includes('effect') || key.includes('explan')) {
            return 'description';
        }

        if (key.includes('trans')) {
            return 'translation';
        }

        return key;
    }

    getSubtitleTrackType(subtitle) {
        if (!subtitle) {
            return 'main';
        }

        const candidates = [
            subtitle.trackType,
            subtitle.track_type,
            subtitle.assigned_track,
            subtitle.track,
            subtitle.detected_track,
            subtitle.tracktype
        ];

        for (const candidate of candidates) {
            const normalized = this.normalizeTrackKey(candidate);
            if (normalized) {
                if (normalized === 'description' || normalized === 'translation' || normalized === 'main') {
                    return normalized;
                }
                return normalized;
            }
        }

        if (Array.isArray(subtitle.tags)) {
            if (subtitle.tags.some(tag => this.normalizeTrackKey(tag) === 'description')) {
                return 'description';
            }
            if (subtitle.tags.some(tag => this.normalizeTrackKey(tag) === 'translation')) {
                return 'translation';
            }
        }

        const text = typeof subtitle.text === 'string' ? subtitle.text.trim() : '';
        if (!text) {
            return 'main';
        }
        if (text.startsWith('[') && text.endsWith(']')) {
            return 'description';
        }

        return 'main';
    }

    isSubtitleTrackEnabled(trackType) {
        const normalized = this.normalizeTrackKey(trackType) || 'main';
        const checkboxMap = {
            main: 'track-main-subtitle-enable',
            translation: 'track-translation-subtitle-enable',
            description: 'track-description-subtitle-enable'
        };

        const checkboxId = checkboxMap[normalized];
        if (checkboxId) {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox && !checkbox.checked) {
                return false;
            }
        }

        if (this.trackStates && this.trackStates[normalized] && this.trackStates[normalized].visible === false) {
            return false;
        }

        return true;
    }

    buildRealtimeSubtitleLines(currentSubtitles) {
        if (!Array.isArray(currentSubtitles) || currentSubtitles.length === 0) {
            return [];
        }

        const trackOrder = ['main', 'description', 'translation'];
        const trackTexts = {};

        currentSubtitles.forEach(subtitle => {
            if (!subtitle || typeof subtitle.text !== 'string') {
                return;
            }
            const text = subtitle.text.trim();
            if (!text) {
                return;
            }
            const track = this.getSubtitleTrackType(subtitle);
            const normalizedTrack = trackOrder.includes(track) ? track : 'main';
            if (!trackTexts[normalizedTrack]) {
                trackTexts[normalizedTrack] = text;
            }
        });

        const lines = [];
        trackOrder.forEach(track => {
            if (!this.isSubtitleTrackEnabled(track)) {
                return;
            }
            const text = trackTexts[track];
            if (text) {
                lines.push({ track, text });
            }
        });

        return lines;
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

    clearAllSubtitles() {
        console.log('🗑️ 자막 지우기 실행');

        // 모든 자막 트랙 찾기
        const mainSubtitleTrack = document.getElementById('main-subtitle-content');
        const translationSubtitleTrack = document.getElementById('translation-subtitle-content');
        const descriptionSubtitleTrack = document.getElementById('description-subtitle-content');
        const subtitleTrack = document.getElementById('subtitle-track');

        // 메인 자막 트랙 지우기
        if (mainSubtitleTrack) {
            mainSubtitleTrack.innerHTML = '';
            console.log('✅ 메인 자막 트랙 지워짐');
        }

        // 번역 자막 트랙 지우기
        if (translationSubtitleTrack) {
            translationSubtitleTrack.innerHTML = '';
            console.log('✅ 번역 자막 트랙 지워짐');
        }

        // 설명 자막 트랙 지우기
        if (descriptionSubtitleTrack) {
            descriptionSubtitleTrack.innerHTML = '';
            console.log('✅ 설명 자막 트랙 지워짐');
        }

        // 기본 자막 트랙 지우기
        if (subtitleTrack) {
            const trackContent = subtitleTrack.querySelector('.track-content');
            if (trackContent) {
                trackContent.innerHTML = '';
                console.log('✅ 기본 자막 트랙 지워짐');
            }
        }

        // 자막 데이터 초기화
        this.subtitleData = [];
        this.subtitleBlocks = new Map();

        this.showSuccess('모든 자막이 지워졌습니다');
    }

    clearAllTracks() {
        console.log('🧹 트랙 지우기 실행');

        // 0. 재생 중이면 먼저 정지
        this.stopPlayback();

        // 1. 모든 자막 지우기
        this.clearAllSubtitles();

        // 2. 영상 플레이어 정리
        const videoPlayer = document.getElementById('video-player');
        const videoWaveform = document.getElementById('video-waveform');
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.src = '';
            videoPlayer.load();
            console.log('✅ 영상 플레이어 정리됨');
        }
        if (videoWaveform) {
            const ctx = videoWaveform.getContext('2d');
            ctx.clearRect(0, 0, videoWaveform.width, videoWaveform.height);
            console.log('✅ 영상 트랙 지워짐');
        }

        // 3. 메인 음성 플레이어 정리
        const audioPlayer = document.getElementById('audio-player');
        const audioWaveform = document.getElementById('audio-waveform');
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = '';
            audioPlayer.load();
            console.log('✅ 메인 음성 플레이어 정리됨');
        }
        if (audioWaveform) {
            const ctx = audioWaveform.getContext('2d');
            ctx.clearRect(0, 0, audioWaveform.width, audioWaveform.height);
            console.log('✅ 메인 음성 트랙 지워짐');
        }

        // 4. 해설 음성 정리
        const commentaryWaveform = document.getElementById('commentary-waveform');
        if (this.commentaryAudio) {
            this.commentaryAudio.pause();
            this.commentaryAudio.src = '';
            this.commentaryAudio = null;
            console.log('✅ 해설 음성 정리됨');
        }
        if (commentaryWaveform) {
            const ctx = commentaryWaveform.getContext('2d');
            ctx.clearRect(0, 0, commentaryWaveform.width, commentaryWaveform.height);
            console.log('✅ 해설 음성 트랙 지워짐');
        }

        // 5. 배경 음악 트랙 지우기
        const bgmWaveform = document.getElementById('bgm-waveform');
        if (bgmWaveform) {
            const ctx = bgmWaveform.getContext('2d');
            ctx.clearRect(0, 0, bgmWaveform.width, bgmWaveform.height);
            console.log('✅ 배경 음악 트랙 지워짐');
        }

        // 6. 타임라인 비디오 정리
        const timelineVideo = document.getElementById('timeline-video');
        if (timelineVideo) {
            timelineVideo.pause();
            timelineVideo.src = '';
            timelineVideo.load();
            console.log('✅ 타임라인 비디오 정리됨');
        }

        // 7. 데이터 초기화
        this.videoPath = null;
        this.audioPath = null;
        this.loadedVideoPath = null;
        this.loadedAudioPath = null;
        this.loadedCommentaryPath = null;

        if (this.timeline) {
            this.timeline.videoData = null;
            this.timeline.audioData = null;
            this.timeline.commentaryAudioData = null;
            this.timeline.bgmAudioData = null;
            this.timeline.currentTime = 0;
            this.timeline.isPlaying = false;
        }

        console.log('✅ 트랙 데이터 초기화 완료');
        this.showSuccess('모든 트랙이 지워졌습니다');
    }

    // 영상 출력 파일 만들기
    async createOutputVideo() {
        console.log('🎬 영상 출력 파일 만들기 시작');

        // 체크된 트랙 확인
        const videoEnabled = document.getElementById('track-video-enable')?.checked ?? false;
        const audioEnabled = document.getElementById('track-audio-enable')?.checked ?? false;
        const commentaryEnabled = document.getElementById('track-commentary-enable')?.checked ?? false;
        const mainSubtitleEnabled = document.getElementById('track-main-subtitle-enable')?.checked ?? false;
        const translationSubtitleEnabled = document.getElementById('track-translation-subtitle-enable')?.checked ?? false;
        const descriptionSubtitleEnabled = document.getElementById('track-description-subtitle-enable')?.checked ?? false;

        console.log('체크된 트랙:', {
            video: videoEnabled,
            audio: audioEnabled,
            commentary: commentaryEnabled,
            mainSubtitle: mainSubtitleEnabled,
            translationSubtitle: translationSubtitleEnabled,
            descriptionSubtitle: descriptionSubtitleEnabled
        });

        // 영상이나 음성이 하나도 체크되지 않으면 경고
        if (!videoEnabled && !audioEnabled && !commentaryEnabled) {
            alert('최소한 하나의 영상/음성 트랙을 선택해주세요.');
            return;
        }

        // 로드된 파일 확인
        const videoFiles = this.getSelectedVideoFiles();
        const audioFiles = this.getSelectedAudioFiles();

        console.log('📁 파일 확인:', {
            videoPath: this.videoPath,
            timelineVideoData: this.timeline?.videoData,
            audioPath: this.audioPath,
            audioFilePath: this.audioFilePath,
            timelineAudioData: this.timeline?.audioData,
            videoFiles: videoFiles,
            audioFiles: audioFiles
        });

        if (videoEnabled && videoFiles.length === 0) {
            alert('영상 파일이 로드되지 않았습니다.\n\n먼저 "📹 영상 파일 로드" 버튼을 클릭하여 영상을 로드해주세요.');
            return;
        }

        if (audioEnabled && audioFiles.length === 0) {
            alert('음성 파일이 로드되지 않았습니다.\n\n먼저 "🎵 음성 파일 로드" 버튼을 클릭하여 음성을 로드해주세요.');
            return;
        }

        // 자막 데이터 수집
        const subtitleData = this.collectSubtitleData(mainSubtitleEnabled, translationSubtitleEnabled, descriptionSubtitleEnabled);

        // 진행률 표시 시작
        this.showOutputProgress(0, '파일 준비 중...');

        // 로드된 파일 표시
        const videoFileName = videoFiles.length > 0 ? videoFiles[0].split('/').pop() : 'N/A';
        const audioFileName = audioFiles.length > 0 && audioFiles[0].path ? audioFiles[0].path.split('/').pop() : 'N/A';

        this.updateOutputProgress(5, `영상: ${videoFileName}`);
        await new Promise(resolve => setTimeout(resolve, 300));

        this.updateOutputProgress(10, `음성: ${audioFileName}`);
        await new Promise(resolve => setTimeout(resolve, 300));

        // 서버에 영상 합성 요청
        try {
            this.updateOutputProgress(20, '서버에 요청 전송 중...');

            // 진행률 업데이트 시뮬레이션 (실제 처리는 서버에서)
            const progressInterval = setInterval(() => {
                const currentBar = document.getElementById('output-progress-bar');
                if (currentBar) {
                    const currentWidth = parseFloat(currentBar.style.width) || 20;
                    if (currentWidth < 80) {
                        this.updateOutputProgress(
                            currentWidth + 2,
                            `영상 처리 중... (최대 10분 소요 가능)`
                        );
                    }
                }
            }, 2000); // 2초마다 진행률 증가

            const response = await fetch('/api/create-output-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_enabled: videoEnabled,
                    audio_enabled: audioEnabled,
                    commentary_enabled: commentaryEnabled,
                    main_subtitle_enabled: mainSubtitleEnabled,
                    translation_subtitle_enabled: translationSubtitleEnabled,
                    description_subtitle_enabled: descriptionSubtitleEnabled,
                    video_files: videoFiles,
                    audio_files: audioFiles,
                    subtitle_data: subtitleData
                })
            });

            // 진행률 업데이트 중지
            clearInterval(progressInterval);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '영상 합성 실패');
            }

            this.updateOutputProgress(90, '최종 처리 중...');

            const result = await response.json();

            this.updateOutputProgress(100, '✅ 영상 출력 완료!');

            setTimeout(() => {
                this.hideOutputProgress();
                alert(`영상 출력 완료!\n파일: ${result.output_path}`);
            }, 1000);

        } catch (error) {
            console.error('영상 출력 실패:', error);

            // 에러 발생 시 진행률 바를 빨간색으로 변경
            const progressBar = document.getElementById('output-progress-bar');
            if (progressBar) {
                progressBar.style.background = 'linear-gradient(90deg, #f44336, #d32f2f)';
            }

            this.updateOutputProgress(100, '❌ 영상 출력 실패');

            setTimeout(() => {
                this.hideOutputProgress();
                alert(`영상 출력 실패: ${error.message}\n\n영상이 너무 길면 시간이 더 걸릴 수 있습니다.\n콘솔을 확인하여 자세한 오류를 확인하세요.`);
            }, 2000);
        }
    }

    // 영상 출력 진행률 표시
    showOutputProgress(percent, message) {
        const progressContainer = document.getElementById('output-video-progress');
        const progressBar = document.getElementById('output-progress-bar');
        const progressPercent = document.getElementById('output-progress-percent');
        const progressMessage = document.getElementById('output-progress-message');

        if (progressContainer) {
            progressContainer.style.display = 'block';
        }
        if (progressBar) {
            progressBar.style.width = percent + '%';
        }
        if (progressPercent) {
            progressPercent.textContent = Math.round(percent) + '%';
        }
        if (progressMessage) {
            progressMessage.textContent = message;
        }
    }

    // 영상 출력 진행률 업데이트
    updateOutputProgress(percent, message) {
        this.showOutputProgress(percent, message);
    }

    async saveTrackProject() {
        try {
            const hasVideo = Boolean(this.videoPath || this.timeline?.videoData?.path);
            const hasAudio = Boolean(this.audioPath || this.audioFilePath || this.timeline?.audioData?.path);
            const hasBgm = Boolean(this.bgmFilePath || this.timeline?.bgmData?.path || this.timeline?.bgmAudioData?.path);
            const hasSubtitles = Boolean(this.timeline?.subtitleData?.subtitles && this.timeline.subtitleData.subtitles.length);

            if (!hasVideo && !hasAudio && !hasBgm && !hasSubtitles) {
                this.showError('저장할 트랙 데이터가 없습니다. 먼저 영상/음성/자막을 로드해주세요.');
                return;
            }

            const timestampLabel = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
            const defaultName = `트랙프로젝트_${timestampLabel}`;
            const nameInput = window.prompt('저장할 프로젝트 이름을 입력하세요.', defaultName);

            if (!nameInput || !nameInput.trim()) {
                this.showInfo('트랙 프로젝트 저장을 취소했습니다.');
                return;
            }

            const trimmedName = nameInput.trim();

            let commentaryPath = null;
            if (this.commentaryAudio && this.commentaryAudio.src) {
                const src = this.commentaryAudio.src;
                if (src.startsWith('blob:') || src.startsWith('data:')) {
                    const proceed = window.confirm('로컬에서 불러온 해설 음성은 다시 불러올 수 없습니다. 해당 음성 없이 저장할까요?');
                    if (!proceed) {
                        this.showInfo('트랙 프로젝트 저장을 취소했습니다.');
                        return;
                    }
                } else {
                    commentaryPath = src;
                }
            }

            const timelineSnapshot = this.buildTimelineSnapshotForSave('track-project-save');

            const payload = {
                name: trimmedName,
                created_at: new Date().toISOString(),
                video_path: this.videoPath || this.timeline?.videoData?.path || null,
                audio_path: this.audioPath || this.audioFilePath || this.timeline?.audioData?.path || null,
                bgm_path: this.bgmFilePath || this.timeline?.bgmData?.path || this.timeline?.bgmAudioData?.path || null,
                commentary_audio_path: commentaryPath,
                translator_project_id: this.lastTranslatorProjectId || null,
                translator_project_title: this.currentProject?.title || null,
                selected_files: Array.from(this.selectedFiles || []),
                track_states: this.trackStates ? JSON.parse(JSON.stringify(this.trackStates)) : {},
                snapshot: timelineSnapshot ? JSON.parse(JSON.stringify(timelineSnapshot)) : null,
                notes: {
                    source: 'videoanalysis-track-editor',
                    saved_by: 'analysis-ui',
                    version: '2024-10-02'
                }
            };

            if (timelineSnapshot && timelineSnapshot.subtitle_data && Array.isArray(timelineSnapshot.subtitle_data.subtitles)) {
                payload.subtitle_count = timelineSnapshot.subtitle_data.subtitles.length;
            }

            this.showStatus('💾 트랙 프로젝트 저장 중...');

            const response = await fetch('/api/track-projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errorDetail = '트랙 프로젝트를 저장하지 못했습니다.';
                try {
                    const errorPayload = await response.json();
                    if (errorPayload && errorPayload.detail) {
                        errorDetail = errorPayload.detail;
                    }
                } catch (parseError) {
                    console.error('에러 응답 파싱 실패:', parseError);
                }
                throw new Error(errorDetail);
            }

            const result = await response.json();

            this.showSuccess(`트랙 프로젝트가 저장되었습니다: ${result.base_name || trimmedName}`);
            this.showStatus('✅ 트랙 프로젝트 저장 완료');

        } catch (error) {
            console.error('트랙 프로젝트 저장 실패:', error);
            this.showError(error.message || '트랙 프로젝트 저장 중 오류가 발생했습니다.');
            this.showStatus('⚠️ 트랙 프로젝트 저장 실패');
        }
    }

    async loadTrackProject() {
        try {
            this.showStatus('📂 트랙 프로젝트 목록을 불러오는 중...');
            const listResponse = await fetch('/api/track-projects');
            if (!listResponse.ok) {
                throw new Error('저장된 트랙 프로젝트 목록을 불러오지 못했습니다.');
            }

            const entries = await listResponse.json();

            if (!Array.isArray(entries) || entries.length === 0) {
                this.showInfo('불러올 트랙 프로젝트가 없습니다. 먼저 저장해주세요.');
                this.showStatus('ℹ️ 저장된 트랙 프로젝트가 없습니다');
                return;
            }

            const modalId = 'track-project-loader';
            const existingModal = document.getElementById(modalId);
            if (existingModal) {
                existingModal.remove();
            }

            const listHtml = entries.map((entry, index) => {
                const baseName = entry.base_name || `project_${index + 1}`;
                const createdAt = entry.created_at || entry.saved_at || '알 수 없음';
                const videoLabel = entry.video_path ? entry.video_path.split('/').pop() : '영상 없음';
                const audioLabel = entry.audio_path ? entry.audio_path.split('/').pop() : '음성 없음';
                const subtitleCount = entry.subtitle_count ?? (entry.snapshot?.subtitle_data?.subtitles?.length ?? 0);

                return `
                    <div class="track-project-item" data-project-name="${baseName}">
                        <div class="track-project-title">${entry.name || baseName}</div>
                        <div class="track-project-meta">저장일: ${createdAt}</div>
                        <div class="track-project-files">📹 ${videoLabel} | 🎵 ${audioLabel} | 📝 ${subtitleCount} 자막</div>
                    </div>
                `;
            }).join('');

            const modalHtml = `
                <div id="${modalId}" class="track-project-modal">
                    <div class="track-project-dialog">
                        <div class="track-project-header">
                            <h3>📂 저장된 트랙 프로젝트</h3>
                            <button class="track-project-close" data-action="close">×</button>
                        </div>
                        <div class="track-project-list">
                            ${listHtml}
                        </div>
                        <div class="track-project-footer">
                            <button class="track-project-cancel" data-action="close">취소</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            const modalElement = document.getElementById(modalId);
            if (!modalElement) {
                return;
            }

            const closeModal = () => {
                modalElement.remove();
                this.showStatus('준비 완료');
            };

            modalElement.addEventListener('click', (event) => {
                if (event.target.dataset?.action === 'close' || event.target === modalElement) {
                    closeModal();
                }
            });

            this.showStatus('📂 불러올 트랙 프로젝트를 선택하세요.');

            modalElement.querySelectorAll('.track-project-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const baseName = item.getAttribute('data-project-name');
                    const selectedEntry = entries.find(entry => entry.base_name === baseName);
                    if (!selectedEntry) {
                        this.showError('선택한 프로젝트를 찾을 수 없습니다.');
                        return;
                    }

                    closeModal();
                    this.showStatus('📥 트랙 프로젝트 적용 중...');
                    await this.applyTrackProject(selectedEntry);
                });
            });

        } catch (error) {
            console.error('트랙 프로젝트 목록 로드 실패:', error);
            this.showError(error.message || '트랙 프로젝트를 불러오는 중 오류가 발생했습니다.');
            this.showStatus('⚠️ 트랙 프로젝트 불러오기 실패');
        }
    }

    async applyTrackProject(entry) {
        try {
            const snapshot = entry.snapshot;

            if (snapshot) {
                this.restoreTimelineSnapshot(snapshot, { preserveExistingSubtitles: false });
            }

            if (entry.video_path) {
                await this.loadFileToTrack(entry.video_path, 'video');
                this.videoPath = entry.video_path;
                if (this.timeline) {
                    this.timeline.videoData = { path: entry.video_path };
                }
            }

            if (entry.audio_path) {
                await this.loadFileToTrack(entry.audio_path, 'audio');
                this.audioPath = entry.audio_path;
                if (this.timeline) {
                    this.timeline.audioData = { path: entry.audio_path };
                }
            }

            if (entry.commentary_audio_path) {
                await this.loadCommentaryAudioFromUrl(entry.commentary_audio_path, entry.commentary_audio_path.split('/').pop());
            }

            if (entry.bgm_path) {
                this.bgmFilePath = entry.bgm_path;
                if (this.timeline) {
                    this.timeline.bgmData = { path: entry.bgm_path };
                }
                await this.drawBGMWaveform(entry.bgm_path);
            }

            if (Array.isArray(entry.selected_files)) {
                this.selectedFiles = new Set(entry.selected_files);
            }

            if (entry.track_states) {
                this.trackStates = JSON.parse(JSON.stringify(entry.track_states));
            }

            this.lastTranslatorProjectId = entry.translator_project_id || this.lastTranslatorProjectId;

            this.updateUI();
            try {
                this.renderHybridSubtitleTracks();
            } catch (renderError) {
                console.error('트랙 자막 렌더링 실패:', renderError);
            }

            this.showSuccess(`트랙 프로젝트를 불러왔습니다: ${entry.name || entry.base_name}`);
            this.showStatus('✅ 트랙 프로젝트 불러오기 완료');

        } catch (error) {
            console.error('트랙 프로젝트 적용 실패:', error);
            this.showError(error.message || '트랙 프로젝트를 불러오는 중 오류가 발생했습니다.');
        }
    }

    // 영상 출력 진행률 숨기기
    hideOutputProgress() {
        const progressContainer = document.getElementById('output-video-progress');
        const progressBar = document.getElementById('output-progress-bar');

        if (progressContainer) {
            progressContainer.style.display = 'none';
        }

        // 진행률 바 색상 초기화
        if (progressBar) {
            progressBar.style.background = 'linear-gradient(90deg, #FF6F00, #FF8F00)';
            progressBar.style.width = '0%';
        }
    }

    // 선택된 영상 파일 목록 가져오기
    getSelectedVideoFiles() {
        const files = [];
        // this.videoPath 또는 this.timeline.videoData.path 확인
        if (this.videoPath) {
            files.push(this.videoPath);
        } else if (this.timeline?.videoData?.path) {
            files.push(this.timeline.videoData.path);
        }
        return files;
    }

    // 선택된 음성 파일 목록 가져오기
    getSelectedAudioFiles() {
        const files = [];
        // this.audioPath, this.audioFilePath, 또는 this.timeline.audioData.path 확인
        const mainAudioPath = this.audioPath || this.audioFilePath || this.timeline?.audioData?.path;
        if (mainAudioPath) {
            files.push({
                type: 'main',
                path: mainAudioPath
            });
        }
        if (this.commentaryAudio && this.commentaryAudio.src) {
            files.push({
                type: 'commentary',
                path: this.commentaryAudio.src
            });
        }
        return files;
    }

    // 자막 데이터 수집
    collectSubtitleData(mainEnabled, translationEnabled, descriptionEnabled) {
        const subtitles = [];

        if (mainEnabled && this.subtitleData) {
            subtitles.push({
                type: 'main',
                data: this.subtitleData
            });
        }

        if (translationEnabled && this.translationSubtitleData) {
            subtitles.push({
                type: 'translation',
                data: this.translationSubtitleData
            });
        }

        if (descriptionEnabled && this.descriptionSubtitleData) {
            subtitles.push({
                type: 'description',
                data: this.descriptionSubtitleData
            });
        }

        return subtitles;
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
        const mainRealtimeOverlay = document.getElementById('overlay-main-subtitle');
        const descriptionRealtimeOverlay = document.getElementById('overlay-description-subtitle');
        const staticSelect = document.getElementById('static-effect');
        const dynamicSelect = document.getElementById('dynamic-effect');

        // 현재 시간에 해당하는 자막 찾기
        const fallbackMainEl = document.getElementById('current-subtitle');
        const fallbackDescriptionEl = document.getElementById('description-subtitle');

        const prepareFallbackElement = (el) => {
            if (!el) {
                return;
            }
            if (!el.dataset.emptyText) {
                el.dataset.emptyText = (el.textContent || '').trim();
            }
        };

        prepareFallbackElement(fallbackMainEl);
        prepareFallbackElement(fallbackDescriptionEl);

        const currentSubtitles = subtitles.filter(sub =>
            currentTime >= sub.start_time && currentTime <= sub.end_time);

        const activeIndices = new Set();
        currentSubtitles.forEach(sub => {
            const idx = subtitles.indexOf(sub);
            if (idx >= 0) {
                activeIndices.add(idx);
            }
        });

        const trackOrder = ['main', 'description'];
        const lines = [];

        let mainLine = null;
        let descriptionLine = null;

        trackOrder.forEach(track => {
            const trackEnabled = typeof this.isSubtitleTrackEnabled === 'function'
                ? this.isSubtitleTrackEnabled(track)
                : true;
            if (!trackEnabled) {
                return;
            }

            const candidate = currentSubtitles.find(sub => {
                const normalized = this.getSubtitleTrackType
                    ? this.getSubtitleTrackType(sub)
                    : (sub.assigned_track || sub.track || 'main');
                return (normalized || 'main') === track;
            });

            const text = candidate && typeof candidate.text === 'string'
                ? candidate.text.trim()
                : '';

            if (candidate && text) {
                const line = { track, text };
                lines.push(line);
                if (track === 'description') {
                    descriptionLine = descriptionLine || line;
                } else {
                    mainLine = mainLine || line;
                }
            }
        });

        const tryAppendTrackFromClassification = (track) => {
            if (lines.some(line => line.track === track)) {
                return;
            }

            const trackEnabled = typeof this.isSubtitleTrackEnabled === 'function'
                ? this.isSubtitleTrackEnabled(track)
                : true;
            if (!trackEnabled) {
                return;
            }

            const fromMap = this.timeline && this.timeline.speakerClassifiedSubtitles
                ? this.timeline.speakerClassifiedSubtitles[track]
                : null;

            const candidateFromMap = Array.isArray(fromMap)
                ? fromMap.find(sub => currentTime >= sub.start_time && currentTime <= sub.end_time)
                : null;

            const candidateFromClassified = !candidateFromMap && Array.isArray(this.classifiedSubtitles)
                ? this.classifiedSubtitles.find(sub => {
                    const normalized = this.getSubtitleTrackType
                        ? this.getSubtitleTrackType(sub)
                        : (sub.assigned_track || sub.track || 'main');
                    return (normalized || 'main') === track && currentTime >= sub.start_time && currentTime <= sub.end_time;
                })
                : null;

            const candidate = candidateFromMap || candidateFromClassified;

            const text = candidate && typeof candidate.text === 'string'
                ? candidate.text.trim()
                : '';

            if (candidate && text) {
                if (track === 'description') {
                    descriptionLine = descriptionLine || { track, text };
                } else {
                    mainLine = mainLine || { track, text };
                }
            }
        };

        if (!mainLine && currentSubtitles.length > 0) {
            tryAppendTrackFromClassification('main');
        }

        const addLineIfMissing = (line) => {
            if (!line) return;
            if (!lines.some(existing => existing.track === line.track && existing.text === line.text)) {
                lines.push(line);
            }
        };

        if (mainLine) {
            addLineIfMissing(mainLine);
        }

        tryAppendTrackFromClassification('description');

        if (descriptionLine) {
            addLineIfMissing(descriptionLine);
        }

        if (lines.length === 0 && currentSubtitles.length > 0) {
            const fallback = currentSubtitles[0];
            const fallbackText = typeof fallback.text === 'string' ? fallback.text.trim() : '';
            if (fallbackText) {
                lines.push({
                    track: this.getSubtitleTrackType ? this.getSubtitleTrackType(fallback) : 'main',
                    text: fallbackText
                });
            }
        }

        const staticEffectValue = staticSelect ? staticSelect.value : 'none';
        const dynamicEffectValue = dynamicSelect ? dynamicSelect.value : 'none';

        const updateOverlayForTrack = (overlay, line, track) => {
            if (!overlay) return;

            const manualAttr = overlay.__manualAttrKey || 'manualPosition';
            const trackEnabled = typeof this.isSubtitleTrackEnabled === 'function'
                ? this.isSubtitleTrackEnabled(track)
                : true;
            const text = line && typeof line.text === 'string' ? line.text.trim() : '';

            if (!trackEnabled || !text) {
                overlay.classList.add('empty');
                overlay.style.display = 'none';
                overlay.textContent = '';
                return;
            }

            overlay.textContent = text;
            overlay.dataset.track = track;
            overlay.classList.remove('empty');
            overlay.style.display = 'flex';

            if (overlay.dataset[manualAttr] !== 'true') {
                if (typeof overlay.__autoPositionHook === 'function') {
                    overlay.__autoPositionHook();
                }
            } else if (typeof overlay.__ensureWithinBoundsHook === 'function') {
                overlay.__ensureWithinBoundsHook();
            }

            this.applyOverlayStaticEffect(overlay, staticEffectValue);
            this.applyOverlayDynamicEffect(overlay, dynamicEffectValue);
        };

        const findLineForTrack = (track) => lines.find(line => line.track === track) || null;
        const mainTrackLine = mainLine || findLineForTrack('main');
        const descriptionTrackLine = descriptionLine || findLineForTrack('description');

        updateOverlayForTrack(mainRealtimeOverlay, mainTrackLine, 'main');
        updateOverlayForTrack(descriptionRealtimeOverlay, descriptionTrackLine, 'description');

        const updateFallbackLine = (el, line, track) => {
            if (!el) {
                return;
            }

            const resolvedTrack = (line && line.track) || track || 'main';
            const trackEnabled = typeof this.isSubtitleTrackEnabled === 'function'
                ? this.isSubtitleTrackEnabled(resolvedTrack)
                : true;

            if (!trackEnabled) {
                el.textContent = el.dataset.emptyText || '';
                el.style.display = 'none';
                el.classList.add('no-subtitle', 'empty');
                return;
            }

            const text = line && typeof line.text === 'string' ? line.text.trim() : '';
            if (text) {
                el.textContent = text;
                el.style.display = 'flex';
                el.classList.remove('no-subtitle');
                el.classList.remove('empty');
            } else {
                const fallback = el.dataset.emptyText || '';
                el.textContent = fallback;
                el.style.display = fallback ? 'flex' : 'none';
                el.classList.add('no-subtitle');
                if (fallback) {
                    el.classList.remove('empty');
                } else {
                    el.classList.add('empty');
                }
            }

            this.applyOverlayStaticEffect(el, staticEffectValue);
            this.applyOverlayDynamicEffect(el, dynamicEffectValue);
            el.dataset.track = resolvedTrack;
        };

        const fallbackMainLine = mainTrackLine || lines[0] || null;
        updateFallbackLine(fallbackMainEl, fallbackMainLine, 'main');
        updateFallbackLine(fallbackDescriptionEl, descriptionTrackLine || null, 'description');

        if (lines.length === 0) {
            document.querySelectorAll('.subtitle-block.selected').forEach(el => {
                el.classList.remove('selected');
            });
            return;
        }

        // 자막 블록 하이라이트 업데이트
        document.querySelectorAll('.subtitle-block').forEach(block => {
            const blockIndex = parseInt(block.dataset.index, 10);
            if (activeIndices.has(blockIndex)) {
                block.classList.add('selected');
            } else {
                block.classList.remove('selected');
            }
        });
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

    async drawBGMWaveform(bgmPath) {
        console.log('🎵 drawBGMWaveform 호출됨:', bgmPath);

        const canvas = document.getElementById('bgm-waveform');
        if (!canvas) {
            console.error('❌ bgm-waveform 캔버스를 찾을 수 없음');
            return;
        }

        console.log('✅ 배경음악 캔버스 발견:', canvas);

        const ctx = canvas.getContext('2d');

        // 캔버스 크기 강제 설정
        const parentRect = canvas.parentElement.getBoundingClientRect();
        canvas.width = Math.max(parentRect.width || 800, 800);
        canvas.height = 80;
        canvas.style.width = '100%';
        canvas.style.height = '80px';
        canvas.style.display = 'block';

        console.log('📏 배경음악 캔버스 크기 설정:', canvas.width, 'x', canvas.height);

        // 로딩 상태 표시
        this.showWaveformLoading(ctx, canvas, '배경음악 분석 중...');

        try {
            console.log('🔍 서버에서 배경음악 파형 데이터 요청 중...');
            console.log('📁 요청할 배경음악 파일 경로:', bgmPath);

            // 파일 경로 검증
            if (!bgmPath || bgmPath.trim() === '') {
                throw new Error('배경음악 파일 경로가 비어있습니다');
            }

            // 서버에서 실제 파형 데이터 가져오기
            const response = await fetch('/api/analyze-waveform', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audio_path: bgmPath,
                    width: canvas.width
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('HTTP 에러 응답:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            console.log('📊 배경음악 파형 데이터 받음:', data);

            if (data.status === 'success' && data.waveform_data) {
                // 실제 파형 데이터로 그리기
                this.renderBGMWaveformData(ctx, canvas, data.waveform_data, bgmPath);
                console.log('✅ 배경음악 파형 렌더링 완료');

                // 성공 시 즉시 return하여 fallback이 호출되지 않도록
                return;
            } else {
                console.error('서버 응답 문제:', data);
                throw new Error(`서버에서 파형 데이터를 받지 못함: ${JSON.stringify(data)}`);
            }

        } catch (error) {
            console.error('❌ 배경음악 파형 분석 실패:', error);
            console.error('오류 상세:', {
                message: error.message,
                bgmPath: bgmPath,
                stack: error.stack
            });

            // 에러를 사용자에게도 표시
            this.showError(`배경음악 파형 분석 실패: ${error.message}`);
            this.renderFallbackWaveform(ctx, canvas, bgmPath);
        }
    }

    renderBGMWaveformData(ctx, canvas, waveformData, bgmPath) {
        console.log('🎨 배경음악 파형 데이터로 렌더링 시작:', waveformData.length, '포인트');

        // 배경 - 배경음악 트랙임을 나타내는 색상
        ctx.fillStyle = 'rgba(30, 20, 50, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 가운데 기준선
        const centerY = canvas.height / 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(canvas.width, centerY);
        ctx.stroke();

        // 실제 파형 데이터 그리기 - 배경음악은 보라색 계열
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#9C27B0');  // 퍼플
        gradient.addColorStop(0.5, '#8E24AA'); // 딥퍼플
        gradient.addColorStop(1, '#7B1FA2');   // 다크퍼플

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

        // 배경음악임을 표시
        ctx.fillStyle = 'rgba(156, 39, 176, 1)';
        ctx.font = 'bold 12px Arial';
        const fileName = bgmPath.split('/').pop();
        ctx.fillText(`🎵 ${fileName} (배경음악)`, 10, 20);
        console.log('🖼️ 배경음악 파형 텍스트 표시됨:', fileName);

        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(156, 39, 176, 0.8)';
        ctx.fillText(`배경음악 분석 완료 (${waveformData.length} 샘플)`, 10, canvas.height - 10);
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

        const startBtn = document.getElementById('start-speaker-recognition');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startSpeakerRecognition();
            });
        }

        const loadMainBtn = document.getElementById('load-saved-speaker-main');
        if (loadMainBtn) {
            loadMainBtn.addEventListener('click', () => {
                const selectedName = this.getSelectedSavedSpeakerName();
                this.loadSavedSpeakerClassification(selectedName);
            });
        }

        const loadBottomBtn = document.getElementById('load-saved-speaker-bottom');
        if (loadBottomBtn) {
            loadBottomBtn.addEventListener('click', () => {
                // 아래쪽 드롭다운에서 선택된 값 가져오기
                const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
                const selectedName = dropdownBottom ? dropdownBottom.value : null;
                this.loadSavedSpeakerClassification(selectedName);
            });
        }

        const saveProfileBtn = document.getElementById('save-speaker-profile');
        if (saveProfileBtn) {
            saveProfileBtn.addEventListener('click', () => {
                this.promptSaveSpeakerClassification();
            });
        }

        const renameProfileBtn = document.getElementById('rename-speaker-profile');
        if (renameProfileBtn) {
            renameProfileBtn.addEventListener('click', () => {
                this.renameSavedSpeakerClassification();
            });
        }

        const deleteProfileBtn = document.getElementById('delete-speaker-profile');
        if (deleteProfileBtn) {
            deleteProfileBtn.addEventListener('click', () => {
                this.deleteSavedSpeakerClassification();
            });
        }

        const savedDropdown = document.getElementById('saved-speaker-dropdown');
        if (savedDropdown && !savedDropdown.dataset.listenerAttached) {
            savedDropdown.addEventListener('change', () => {
                const value = savedDropdown.value || '';
                this.lastSelectedSavedSpeakerName = value ? value : null;
                this.updateSavedSpeakerButtonsState();

                const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
                if (dropdownBottom) {
                    dropdownBottom.value = value;
                }
            });
            savedDropdown.dataset.listenerAttached = 'true';
        }

        // 아래쪽 드롭다운에도 동일한 이벤트 리스너 추가
        const savedDropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
        if (savedDropdownBottom && !savedDropdownBottom.dataset.listenerAttached) {
            savedDropdownBottom.addEventListener('change', () => {
                const value = savedDropdownBottom.value || '';
                this.lastSelectedSavedSpeakerName = value ? value : null;

                const topDropdown = document.getElementById('saved-speaker-dropdown');
                if (topDropdown) {
                    topDropdown.value = value;
                    this.updateSavedSpeakerButtonsState();
                }
            });
            savedDropdownBottom.dataset.listenerAttached = 'true';
        }

        const applyBtn = document.getElementById('apply-speaker-mapping');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applySpeakerMapping();
            });
        }

        this.refreshSavedSpeakerDropdown();
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
                this.currentAnalysisMethod = 'text';
                this.displayDetectedSpeakers(result.speakers);
                this.currentSpeakers = result.speakers;
                this.storeSpeakerClassification('text-detection');
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
                this.currentAnalysisMethod = result.analysis_method || 'audio_based';

                this.displayAudioBasedSpeakers(result.speakers, result.analysis_method);
                this.currentSpeakers = result.speakers;

                // 자막이 함께 분석된 경우 분류된 자막 정보도 저장
                if (result.classified_subtitles) {
                    this.classifiedSubtitles = result.classified_subtitles;
                }

                this.storeSpeakerClassification('audio-detection');
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

        this.currentAnalysisMethod = analysisMethod || this.currentAnalysisMethod || 'audio_based';

        const speakersSection = document.getElementById('detected-speakers');
        const speakersGrid = document.getElementById('speakers-grid');

        speakersGrid.innerHTML = '';

        // 화자별 색상 매핑 생성
        const speakerColors = this.generateSpeakerColors(Object.keys(speakers));

        // 화자별 카드 생성
        Object.entries(speakers).forEach(([speakerName, speakerData]) => {
            const speakerColor = speakerColors[speakerName];
            const speakerIdSafe = this.sanitizeSpeakerNameForId(speakerName);
            const countElementId = `speaker-count-${speakerIdSafe}`;
            const subtitleCount = speakerData.subtitle_count ?? speakerData.window_count ?? 0;
            const hasSubtitleCount = speakerData.subtitle_count !== undefined;
            const countLabel = hasSubtitleCount ? '개 대사' : '개 구간';
            const speakerCard = document.createElement('div');
            speakerCard.className = 'speaker-card audio-based';
            speakerCard.style.borderLeft = `4px solid ${speakerColor}`;
            speakerCard.dataset.speaker = speakerName;

            speakerCard.innerHTML = `
                <div class="speaker-header">
                    <h5 style="color: ${speakerColor}">🎵 ${speakerName}</h5>
                    <span class="speaker-count" id="${countElementId}">${subtitleCount}${countLabel}</span>
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
        this.updateSpeakerStatisticsFromSubtitles();
        this.storeSpeakerClassification('audio-display');
    }

    displaySubtitleDetailsWithTrackSelection(subtitles) {
        console.log('📝 자막별 상세 분석 표시:', subtitles);

        const speakersSection = document.getElementById('detected-speakers');

        // 기존 상세 분석 섹션이 있으면 제거하고 새로 렌더링
        const existingDetails = document.querySelector('.subtitle-details-section');
        if (existingDetails && existingDetails.parentElement) {
            existingDetails.parentElement.removeChild(existingDetails);
        }

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

        // 저장된 프로필 드롭다운/버튼 이벤트 재연결 및 목록 갱신
        this.setupSavedSpeakerProfileControls(detailsSection);

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
                    <div class="subtitle-text" ondblclick="app.editSubtitleText(this, ${subtitle.globalIndex})" title="더블클릭하여 편집">"${subtitle.text}"</div>
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

    setupSavedSpeakerProfileControls(detailsSection) {
        if (!detailsSection) {
            return;
        }

        // 최신 목록을 드롭다운에 반영 (기존 선택 유지 시도)
        this.refreshSavedSpeakerDropdown(this.lastSelectedSavedSpeakerName ?? undefined);

        const bottomDropdown = detailsSection.querySelector('#saved-speaker-dropdown-bottom');
        if (bottomDropdown && !bottomDropdown.dataset.listenerAttached) {
            bottomDropdown.addEventListener('change', () => {
                const value = bottomDropdown.value || '';
                this.lastSelectedSavedSpeakerName = value ? value : null;

                const topDropdown = document.getElementById('saved-speaker-dropdown');
                if (topDropdown) {
                    topDropdown.value = value;
                }

                this.updateSavedSpeakerButtonsState();
            });
            bottomDropdown.dataset.listenerAttached = 'true';
        }

        const loadBottomBtn = detailsSection.querySelector('#load-saved-speaker-bottom');
        if (loadBottomBtn && !loadBottomBtn.dataset.listenerAttached) {
            loadBottomBtn.addEventListener('click', () => {
                const dropdown = detailsSection.querySelector('#saved-speaker-dropdown-bottom');
                const selectedName = dropdown ? dropdown.value : null;
                this.loadSavedSpeakerClassification(selectedName || null);
            });
            loadBottomBtn.dataset.listenerAttached = 'true';
        }
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

        this.currentAnalysisMethod = this.currentAnalysisMethod || 'text';

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
        this.storeSpeakerClassification('text-display');
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
        const userDefinedSpeakerOptions = [
            { value: 'unassigned', label: '❓ 사용자 지정 (미분류)', color: '#6c757d' }
        ];

        // 변경사항 추적을 위해 초기 설정 저장
        this.initialSpeakerMappings = {};

        Object.entries(speakers).forEach(([speakerName, speakerData], index) => {
            const mappingRow = document.createElement('div');
            mappingRow.className = 'mapping-row';

            const isUserDefinedSpeaker = speakerName === '화자4';
            const availableOptions = isUserDefinedSpeaker ? userDefinedSpeakerOptions : tracks;
            const defaultTrack = isUserDefinedSpeaker
                ? 'unassigned'
                : (index < tracks.length ? tracks[index].value : 'description');
            const speakerIdSafe = this.sanitizeSpeakerNameForId(speakerName);
            const mappingCountId = `mapping-count-${speakerIdSafe}`;
            const subtitleCount = speakerData.subtitle_count ?? 0;

            // 초기 설정 저장
            this.initialSpeakerMappings[speakerName] = defaultTrack;

            mappingRow.innerHTML = `
                <div class="speaker-info">
                    <input type="checkbox" id="speaker-checkbox-${speakerIdSafe}" class="speaker-checkbox" data-speaker="${speakerName}" checked style="margin-right: 8px; cursor: pointer; width: 18px; height: 18px;">
                    <strong>${speakerName}</strong>
                    <span class="subtitle-count" id="${mappingCountId}">(${subtitleCount}개 대사)</span>
                </div>
                <div class="track-selector">
                    <label>트랙 선택:</label>
                    <select class="track-select" data-speaker="${speakerName}" ${isUserDefinedSpeaker ? 'disabled' : ''} onchange="app.trackSpeakerMappingChanges()">
                        ${availableOptions.map(track =>
                            `<option value="${track.value}" ${track.value === defaultTrack ? 'selected' : ''}>
                                ${track.label}
                            </option>`
                        ).join('')}
                    </select>
                    ${isUserDefinedSpeaker ? '<small class="track-note">사용자 지정 화자는 자동 배치되지 않습니다.</small>' : ''}
                </div>
            `;

            mappingGrid.appendChild(mappingRow);
        });

        // 트랙 배치 버튼들 추가
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'track-mapping-actions';
        buttonContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <button id="apply-speaker-mapping" class="btn btn-primary" onclick="app.applySpeakerMapping()">
                    ✅ 트랙에 자동 배치
                </button>
                <button id="apply-changes-only" class="btn btn-secondary" onclick="app.applyChangesOnly()" style="display: none;">
                    🔄 변경 사항만 트랙 자동배치
                </button>
            </div>
            <div id="changes-summary" class="changes-summary" style="display: none;">
                <strong>변경된 화자:</strong>
                <span id="changed-speakers-list"></span>
            </div>
        `;

        mappingGrid.appendChild(buttonContainer);
        mappingSection.style.display = 'block';
    }

    trackSpeakerMappingChanges() {
        console.log('🔄 화자 매핑 변경사항 추적');

        const changedSpeakers = [];
        const currentMappings = {};

        // 현재 선택된 매핑 수집
        document.querySelectorAll('.track-select').forEach(select => {
            const speaker = select.dataset.speaker;
            const currentTrack = select.value;
            currentMappings[speaker] = currentTrack;

            // 초기 설정과 비교하여 변경된 화자 찾기
            if (this.initialSpeakerMappings[speaker] !== currentTrack) {
                changedSpeakers.push({
                    speaker: speaker,
                    from: this.initialSpeakerMappings[speaker],
                    to: currentTrack
                });
            }
        });

        const applyChangesBtn = document.getElementById('apply-changes-only');
        const changesSummary = document.getElementById('changes-summary');
        const changedSpeakersList = document.getElementById('changed-speakers-list');

        if (changedSpeakers.length > 0) {
            // 변경사항이 있으면 버튼과 요약 표시
            applyChangesBtn.style.display = 'inline-block';
            changesSummary.style.display = 'block';

            const trackLabels = {
                'main': '📝 메인',
                'translation': '🌐 번역',
                'description': '🔊 설명'
            };

            const changesList = changedSpeakers.map(change =>
                `${change.speaker} (${trackLabels[change.from]} → ${trackLabels[change.to]})`
            ).join(', ');

            changedSpeakersList.textContent = changesList;
        } else {
            // 변경사항이 없으면 숨김
            applyChangesBtn.style.display = 'none';
            changesSummary.style.display = 'none';
        }
    }

    async applyChangesOnly() {
        console.log('🔄 변경 사항만 트랙 배치 적용');

        // 변경된 화자 중 체크된 화자만 매핑 수집
        const speakerTrackMapping = {};
        let hasChanges = false;

        document.querySelectorAll('.track-select').forEach(select => {
            const speaker = select.dataset.speaker;
            const currentTrack = select.value;

            // 변경되었고 체크된 화자만 포함
            if (this.initialSpeakerMappings[speaker] !== currentTrack) {
                const speakerIdSafe = speaker.replace(/\s+/g, '_');
                const checkbox = document.getElementById(`speaker-checkbox-${speakerIdSafe}`);

                if (checkbox && checkbox.checked) {
                    speakerTrackMapping[speaker] = currentTrack;
                    hasChanges = true;
                }
            }
        });

        if (!hasChanges) {
            alert('변경된 화자가 없거나 체크되지 않았습니다.');
            return;
        }

        // 선택된 SRT 파일 확인
        const selectedFiles = this.getSelectedSrtFiles();
        if (selectedFiles.length === 0) {
            alert('SRT 파일을 먼저 선택해주세요');
            return;
        }

        const srtFile = selectedFiles[0];

        try {
            // 트랙 배치 API 호출 (변경된 화자만)
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
                // 변경사항 적용 후 초기 설정 업데이트
                Object.keys(speakerTrackMapping).forEach(speaker => {
                    this.initialSpeakerMappings[speaker] = speakerTrackMapping[speaker];
                });

                this.displayTrackingResults(result);
                this.updateHybridTracksWithSpeakers(result.classified_subtitles);

                // 변경사항 추적 UI 업데이트
                this.trackSpeakerMappingChanges();

                const changeCount = Object.keys(speakerTrackMapping).length;
                const trackCounts = result.track_counts || {};
                const totalApplied = Object.values(trackCounts).reduce((sum, count) => sum + count, 0);

                console.log('🔍 변경사항 적용 결과:', { speakerTrackMapping, trackCounts, totalApplied });

                let message = `✅ ${changeCount}개 화자의 변경사항이 적용되었습니다.\n\n📊 트랙별 자막 배치 결과 (총 ${totalApplied}개):\n`;

                const trackLabels = {
                    main: '📝 메인 자막',
                    translation: '🌐 번역 자막',
                    description: '🔊 설명 자막',
                    unassigned: '❓ 미분류'
                };

                // 변경된 화자들의 자막 개수만 표시
                let changedDetails = '';
                Object.keys(speakerTrackMapping).forEach(speaker => {
                    const track = speakerTrackMapping[speaker];
                    changedDetails += `${speaker} → ${trackLabels[track] || track}\n`;
                });

                message += `\n🔄 변경된 화자:\n${changedDetails}\n`;

                Object.entries(trackCounts).forEach(([track, count]) => {
                    message += `${trackLabels[track] || track}: ${count}개\n`;
                });

                alert(message);
            } else {
                throw new Error('변경사항 적용 실패');
            }

        } catch (error) {
            console.error('변경사항 적용 에러:', error);
            alert('❌ 변경사항 적용 중 오류가 발생했습니다');
        }
    }

    async applySpeakerMapping() {
        console.log('✅ 화자 트랙 매핑 적용');

        // 사용자가 설정한 매핑 수집 (체크된 화자만)
        const speakerTrackMapping = {};
        document.querySelectorAll('.track-select').forEach(select => {
            const speaker = select.dataset.speaker;
            const track = select.value;

            // 해당 화자의 체크박스가 체크되어 있는지 확인
            const speakerIdSafe = speaker.replace(/\s+/g, '_');
            const checkbox = document.getElementById(`speaker-checkbox-${speakerIdSafe}`);

            if (checkbox && checkbox.checked) {
                speakerTrackMapping[speaker] = track;
            }
        });

        // 체크된 화자가 없으면 경고
        if (Object.keys(speakerTrackMapping).length === 0) {
            alert('트랙에 배치할 화자를 최소 1개 이상 선택해주세요.');
            return;
        }

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
                // 적용된 설정을 새로운 초기 설정으로 업데이트
                Object.keys(speakerTrackMapping).forEach(speaker => {
                    this.initialSpeakerMappings[speaker] = speakerTrackMapping[speaker];
                });

                this.displayTrackingResults(result);
                this.updateHybridTracksWithSpeakers(result.classified_subtitles);

                // 변경사항 추적 UI 초기화
                this.trackSpeakerMappingChanges();

                const trackCounts = result.track_counts || {};
                const totalApplied = Object.values(trackCounts).reduce((sum, count) => sum + count, 0);

                console.log('🔍 전체 트랙 배치 결과:', { speakerTrackMapping, trackCounts, totalApplied });

                const checkedSpeakers = Object.keys(speakerTrackMapping);
                let message = `✅ 선택한 ${checkedSpeakers.length}개 화자가 트랙에 배치되었습니다.\n\n📊 트랙별 자막 배치 결과 (총 ${totalApplied}개):\n`;

                const trackLabels = {
                    main: '📝 메인 자막',
                    translation: '🌐 번역 자막',
                    description: '🔊 설명 자막',
                    unassigned: '❓ 미분류'
                };

                Object.entries(trackCounts).forEach(([track, count]) => {
                    message += `${trackLabels[track] || track}: ${count}개\n`;
                });

                alert(message);
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

        // classifiedSubtitles도 업데이트 (저장/불러오기를 위해)
        const allSubtitlesWithTrack = [];
        Object.entries(classifiedSubtitles).forEach(([trackType, trackSubtitles]) => {
            if (Array.isArray(trackSubtitles)) {
                trackSubtitles.forEach(sub => {
                    allSubtitlesWithTrack.push({
                        ...sub,
                        track_type: trackType
                    });
                });
            }
        });

        // 시간 순으로 정렬
        allSubtitlesWithTrack.sort((a, b) => a.start_time - b.start_time);

        // globalIndex 재설정
        allSubtitlesWithTrack.forEach((sub, idx) => {
            if (sub.globalIndex === undefined) {
                sub.globalIndex = idx;
            }
        });

        this.classifiedSubtitles = allSubtitlesWithTrack;
        console.log(`📝 classifiedSubtitles 업데이트 완료: ${allSubtitlesWithTrack.length}개 자막`);

        // timeline.subtitleData가 없으면 초기화
        if (!this.timeline.subtitleData) {
            console.log('🔧 timeline.subtitleData 초기화');

            this.timeline.subtitleData = {
                subtitles: allSubtitlesWithTrack,
                file_path: "speaker_classified",
                total_duration: allSubtitlesWithTrack.length > 0 ? Math.max(...allSubtitlesWithTrack.map(s => s.end_time)) : 0
            };

            console.log(`📝 timeline.subtitleData 초기화 완료: ${allSubtitlesWithTrack.length}개 자막`);
        }

        // 하이브리드 트랙 다시 렌더링
        this.renderHybridSubtitleTracks();

        // 전체 SRT 자막 섹션도 업데이트 (트랙 배치 결과 반영)
        setTimeout(() => {
            if (this.currentSpeakers) {
                this.refreshAllSRTSubtitlesWithUpdatedTracks();
            }
        }, 100);
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

    findSubtitleIndexForData(subtitle) {
        if (!Array.isArray(this.classifiedSubtitles)) return -1;

        const candidateFields = ['__source_index', 'original_index', 'originalIndex', 'global_index', 'globalIndex', 'index'];
        for (const field of candidateFields) {
            const value = subtitle ? subtitle[field] : undefined;
            if (Number.isInteger(value) && value >= 0 && this.matchesSubtitleAtIndex(value, subtitle)) {
                return value;
            }
        }

        const { start, end } = this.getSubtitleTimes(subtitle);
        const text = (subtitle && subtitle.text ? subtitle.text : '').trim();

        for (let idx = 0; idx < this.classifiedSubtitles.length; idx += 1) {
            if (this.matchesSubtitleData(this.classifiedSubtitles[idx], start, end, text)) {
                return idx;
            }
        }

        return -1;
    }

    matchesSubtitleAtIndex(index, subtitle) {
        if (!Array.isArray(this.classifiedSubtitles) || index < 0 || index >= this.classifiedSubtitles.length) {
            return false;
        }
        const candidate = this.classifiedSubtitles[index];
        const { start, end } = this.getSubtitleTimes(subtitle);
        const text = (subtitle && subtitle.text ? subtitle.text : '').trim();
        return this.matchesSubtitleData(candidate, start, end, text);
    }

    matchesSubtitleData(candidate, start, end, text) {
        if (!candidate) {
            return false;
        }
        const candidateText = (candidate.text || '').trim();
        const candidateTimes = this.getSubtitleTimes(candidate);

        const sameText = text ? candidateText === text : true;
        const sameStart = Number.isFinite(start) && Number.isFinite(candidateTimes.start)
            ? Math.abs(candidateTimes.start - start) < 0.05
            : true;
        const sameEnd = Number.isFinite(end) && Number.isFinite(candidateTimes.end)
            ? Math.abs(candidateTimes.end - end) < 0.05
            : true;

        return sameText && sameStart && sameEnd;
    }

    getSubtitleTimes(subtitle) {
        const start = Number(subtitle?.start_time ?? subtitle?.start ?? subtitle?.startTime);
        const end = Number(subtitle?.end_time ?? subtitle?.end ?? subtitle?.endTime);
        return {
            start: Number.isFinite(start) ? start : null,
            end: Number.isFinite(end) ? end : null
        };
    }

    sanitizeSpeakerNameForId(speakerName) {
        if (!speakerName) {
            return 'speaker';
        }

        const sanitized = speakerName.replace(/[^0-9A-Za-z가-힣_-]/g, '-');
        return sanitized.length > 0 ? sanitized : 'speaker';
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
                    <div class="subtitle-text-content" ondblclick="app.editSubtitleText(this, ${subtitle.globalIndex})" title="더블클릭하여 편집">"${subtitle.text}"</div>
                </div>
            `;

            subtitleList.appendChild(subtitleItem);
        });

        // 선택된 자막 개수 업데이트
        this.updateSelectedCount(speakerName);
    }

    updateTrackSubtitleText(trackName, index, newText) {
        if (!this.timeline || !this.timeline.speakerClassifiedSubtitles) return;
        const trackArray = this.timeline.speakerClassifiedSubtitles[trackName];
        if (!Array.isArray(trackArray)) return;
        const historyEntry = this.reinterpretationHistory ? this.reinterpretationHistory[index] : null;
        for (let i = 0; i < trackArray.length; i += 1) {
            const item = trackArray[i];
            if (!item) continue;
            const candidateIndex = this.findSubtitleIndexForData(item);
            if (candidateIndex === index) {
                trackArray[i] = {
                    ...item,
                    text: newText,
                    __original_description_text: historyEntry?.original_text ?? item.__original_description_text,
                    reinterpretation: historyEntry ? { ...historyEntry } : item.reinterpretation
                };
                return;
            }
        }
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
                    globalIndex: index  // 0-based index for backend compatibility
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
                               class="subtitle-checkbox global-subtitle-checkbox"
                               data-speaker="${subtitle.speaker_name}"
                               data-subtitle-index="${subtitle.globalIndex}"
                               ${isCurrentSpeaker ? 'checked' : ''}
                               onchange="app.onSubtitleCheckboxChange(${subtitle.globalIndex}, '${subtitle.speaker_name}')">
                        <label for="subtitle-check-${subtitle.globalIndex}" class="checkbox-label"></label>
                    </div>
                    <div class="subtitle-content" style="border-left: 3px solid ${currentSpeakerColor}; ${isCurrentSpeaker ? 'background-color: rgba(' + hexToRgb(currentSpeakerColor) + ', 0.1)' : ''}">
                        <div class="subtitle-time-info">
                            <span class="subtitle-number">#${subtitle.number || (subtitle.globalIndex + 1)}</span>
                            <span class="subtitle-time">${formatSRTTime(subtitle.start_time)} → ${formatSRTTime(subtitle.end_time)}</span>
                            <span class="speaker-label" style="color: ${currentSpeakerColor}; font-weight: bold;">${subtitle.speaker_name}</span>
                            <button class="play-subtitle-btn" onclick="app.seekToSubtitle(${subtitle.start_time})" title="재생">▶️</button>
                        </div>
                        <div class="subtitle-text-content" ondblclick="app.editSubtitleText(this, ${subtitle.globalIndex})" title="더블클릭하여 편집">${subtitle.text}</div>
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
                    globalIndex: index  // 0-based index for backend compatibility
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
                            <label>화자별 토글 선택:</label>
                            <button onclick="app.selectBySpeaker('화자1')" class="speaker-btn speaker1">화자1 선택/해제</button>
                            <button onclick="app.selectBySpeaker('화자2')" class="speaker-btn speaker2">화자2 선택/해제</button>
                            <button onclick="app.selectBySpeaker('화자3')" class="speaker-btn speaker3">화자3 선택/해제</button>
                            <button onclick="app.selectBySpeaker('미분류')" class="speaker-btn unclassified">미분류 선택/해제</button>
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
                    <div class="control-row">
                        <div class="apply-selection-controls">
                            <button onclick="app.quickSaveSpeakerClassification()" class="action-btn secondary" style="background-color: #27ae60; border-color: #27ae60;">💾 저장</button>
                            <button onclick="app.promptSaveSpeakerClassification()" class="action-btn primary">💾 다른이름저장</button>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label style="margin: 0;">저장된 프로필:
                                    <select id="saved-speaker-dropdown-bottom" style="padding: 6px 10px; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;">
                                        <option value="">자동 저장 (최근)</option>
                                    </select>
                                </label>
                                <button class="action-btn secondary" id="load-saved-speaker-bottom">📂 불러오기</button>
                                <button class="action-btn secondary" id="delete-saved-speaker-bottom" disabled style="background-color: #e74c3c; border-color: #e74c3c;">🗑️ 삭제</button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                                <button class="action-btn secondary" id="export-json-btn" style="background-color: #3498db; border-color: #3498db;">📦 JSON 내보내기</button>
                                <button class="action-btn secondary" id="import-json-btn" style="background-color: #3498db; border-color: #3498db;">📥 JSON 가져오기</button>
                                <input type="file" id="import-json-file" accept=".json" style="display: none;">
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                                <button class="action-btn secondary" id="export-srt-btn">📤 SRT 내보내기</button>
                                <button class="action-btn secondary" id="import-srt-btn">📥 SRT 가져오기</button>
                                <input type="file" id="import-srt-file" accept=".srt" style="display: none;">
                            </div>
                            <button onclick="app.refreshAllSRTSubtitlesWithUpdatedTracks()" class="action-btn">변경 적용</button>
                        </div>
                    </div>
                </div>
                <div class="all-subtitles-list"></div>
            `;

            // 적절한 위치에 자막 섹션 추가
            let targetContainer = null;

            // 1. speakers 섹션 다음에 추가 시도
            const speakersSection = document.getElementById('detected-speakers');
            if (speakersSection) {
                speakersSection.insertAdjacentElement('afterend', allSubtitlesSection);
                console.log('✅ detected-speakers 섹션 다음에 추가');
            } else {
                // 2. analysis container에 추가 시도
                const analysisContainer = document.querySelector('.analysis-container');
                if (analysisContainer) {
                    analysisContainer.appendChild(allSubtitlesSection);
                    console.log('✅ analysis-container에 추가');
                } else {
                    // 3. 마지막 수단으로 body에 추가
                    document.body.appendChild(allSubtitlesSection);
                    console.warn('⚠️ body에 추가');
                }
            }

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
                               class="subtitle-checkbox global-subtitle-checkbox"
                               data-speaker="${subtitle.speaker_name}"
                               data-subtitle-index="${subtitle.globalIndex}"
                               onchange="app.onSubtitleCheckboxChange(${subtitle.globalIndex}, '${subtitle.speaker_name}')">
                        <label for="subtitle-check-${subtitle.globalIndex}" class="checkbox-label"></label>
                    </div>
                    <div class="subtitle-content" style="border-left: 3px solid ${currentSpeakerColor}; background-color: rgba(${hexToRgb(currentSpeakerColor)}, 0.05);">
                        <div class="subtitle-time-info">
                            <span class="subtitle-number">#${subtitle.number || (subtitle.globalIndex + 1)}</span>
                            <span class="subtitle-time">${formatSRTTime(subtitle.start_time)} → ${formatSRTTime(subtitle.end_time)}</span>
                            <span class="speaker-label" style="color: ${currentSpeakerColor}; font-weight: bold;">${subtitle.speaker_name}</span>
                            <button class="play-subtitle-btn" onclick="app.seekToSubtitle(${subtitle.start_time})" title="재생">▶️</button>
                        </div>
                        <div class="subtitle-text-content" ondblclick="app.editSubtitleText(this, ${subtitle.globalIndex})" title="더블클릭하여 편집">${subtitle.text}</div>
                    </div>
                `;

                subtitleList.appendChild(subtitleItem);
            });

            // 전체 선택된 자막 개수 업데이트
            this.updateTotalSelectedCount();

            console.log(`✅ 전체 SRT 자막 표시 완료: ${enrichedSubtitles.length}개`);

            // 저장된 프로필 드롭다운 갱신
            this.refreshSavedSpeakerDropdown();

            // 아래쪽 드롭다운과 버튼 이벤트 리스너 재설정
            const loadBottomBtn = document.getElementById('load-saved-speaker-bottom');
            if (loadBottomBtn) {
                // 기존 이벤트 리스너 제거를 위해 clone and replace
                const newLoadBottomBtn = loadBottomBtn.cloneNode(true);
                loadBottomBtn.parentNode.replaceChild(newLoadBottomBtn, loadBottomBtn);

                newLoadBottomBtn.addEventListener('click', () => {
                    const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
                    const selectedName = dropdownBottom ? dropdownBottom.value : null;
                    this.loadSavedSpeakerClassification(selectedName);
                });
            }

            const deleteBottomBtn = document.getElementById('delete-saved-speaker-bottom');
            if (deleteBottomBtn) {
                // 기존 이벤트 리스너 제거를 위해 clone and replace
                const newDeleteBottomBtn = deleteBottomBtn.cloneNode(true);
                deleteBottomBtn.parentNode.replaceChild(newDeleteBottomBtn, deleteBottomBtn);

                newDeleteBottomBtn.addEventListener('click', () => {
                    const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
                    const selectedName = dropdownBottom ? dropdownBottom.value : null;

                    if (!selectedName) {
                        this.showError('삭제할 저장 프로필을 선택하세요');
                        return;
                    }

                    const confirmDelete = window.confirm(`'${selectedName}' 프로필을 삭제할까요?`);
                    if (!confirmDelete) {
                        return;
                    }

                    const entries = this.getSavedSpeakerEntries().filter(entry => entry.name !== selectedName);
                    this.setSavedSpeakerEntries(entries);
                    this.refreshSavedSpeakerDropdown();
                    this.showSuccess(`'${selectedName}' 프로필이 삭제되었습니다.`);
                });
            }

            const savedDropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
            if (savedDropdownBottom) {
                savedDropdownBottom.addEventListener('change', () => {
                    this.lastSelectedSavedSpeakerName = savedDropdownBottom.value || null;

                    // 삭제 버튼 활성화/비활성화
                    const deleteBtn = document.getElementById('delete-saved-speaker-bottom');
                    if (deleteBtn) {
                        deleteBtn.disabled = !savedDropdownBottom.value;
                    }
                });
            }

            // JSON 내보내기 버튼
            const exportJsonBtn = document.getElementById('export-json-btn');
            if (exportJsonBtn) {
                const newExportJsonBtn = exportJsonBtn.cloneNode(true);
                exportJsonBtn.parentNode.replaceChild(newExportJsonBtn, exportJsonBtn);

                newExportJsonBtn.addEventListener('click', () => {
                    this.exportToJSON();
                });
            }

            // JSON 가져오기 버튼
            const importJsonBtn = document.getElementById('import-json-btn');
            const importJsonFile = document.getElementById('import-json-file');
            if (importJsonBtn && importJsonFile) {
                const newImportJsonBtn = importJsonBtn.cloneNode(true);
                importJsonBtn.parentNode.replaceChild(newImportJsonBtn, importJsonBtn);

                newImportJsonBtn.addEventListener('click', () => {
                    importJsonFile.click();
                });

                importJsonFile.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.importFromJSON(file);
                        e.target.value = '';
                    }
                });
            }

            // SRT 내보내기 버튼
            const exportSrtBtn = document.getElementById('export-srt-btn');
            if (exportSrtBtn) {
                const newExportSrtBtn = exportSrtBtn.cloneNode(true);
                exportSrtBtn.parentNode.replaceChild(newExportSrtBtn, exportSrtBtn);

                newExportSrtBtn.addEventListener('click', () => {
                    this.exportToSRT();
                });
            }

            // SRT 가져오기 버튼
            const importSrtBtn = document.getElementById('import-srt-btn');
            const importSrtFile = document.getElementById('import-srt-file');
            if (importSrtBtn && importSrtFile) {
                const newImportSrtBtn = importSrtBtn.cloneNode(true);
                importSrtBtn.parentNode.replaceChild(newImportSrtBtn, importSrtBtn);

                newImportSrtBtn.addEventListener('click', () => {
                    importSrtFile.click();
                });

                importSrtFile.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.importFromSRT(file);
                        e.target.value = ''; // 같은 파일 재선택 가능하도록
                    }
                });
            }

        } catch (error) {
            console.error(`❌ 전체 SRT 자막 표시 실패: ${error}`);
        }
    }

    selectAllSubtitles() {
        const section = document.getElementById('all-subtitles-section');
        if (!section) {
            return;
        }

        section.querySelectorAll('.global-subtitle-checkbox').forEach(checkbox => {
            checkbox.checked = true;
        });

        this.updateTotalSelectedCount();
    }

    deselectAllSubtitles() {
        const section = document.getElementById('all-subtitles-section');
        if (!section) {
            return;
        }

        section.querySelectorAll('.global-subtitle-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });

        this.updateTotalSelectedCount();
    }

    updateTotalSelectedCount() {
        const section = document.getElementById('all-subtitles-section');
        if (!section) {
            return;
        }

        const selectedCheckboxes = section.querySelectorAll('.global-subtitle-checkbox:checked');
        const countElement = document.getElementById('total-selected-count');
        if (countElement) {
            countElement.textContent = selectedCheckboxes.length;
        }
    }

    selectBySpeaker(speakerName) {
        console.log(`🎭 ${speakerName} 화자의 모든 자막 선택`);

        // 해당 화자의 체크박스들만 토글 (다른 화자는 그대로 유지)
        const speakerCheckboxes = document.querySelectorAll(`#all-subtitles-section input.global-subtitle-checkbox[data-speaker="${speakerName}"]`);

        // 해당 화자의 자막이 모두 선택되어 있는지 확인
        const allChecked = Array.from(speakerCheckboxes).every(checkbox => checkbox.checked);

        // 모두 선택되어 있으면 해제, 아니면 선택
        speakerCheckboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
        });

        this.updateTotalSelectedCount();
        const action = allChecked ? '해제' : '선택';
        console.log(`✅ ${speakerName} 자막 ${speakerCheckboxes.length}개 ${action} 완료`);
    }

    async assignSelectedToTrack(trackType) {
        const section = document.getElementById('all-subtitles-section');
        if (!section) {
            return;
        }

        const selectedCheckboxes = section.querySelectorAll('.global-subtitle-checkbox:checked');
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
                            const checkbox = section.querySelector(`input.global-subtitle-checkbox[data-subtitle-index="${idx}"]`);
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

                this.storeSpeakerClassification('track-assign');

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
        const section = document.getElementById('all-subtitles-section');
        if (!section) {
            return;
        }

        const selectedCheckboxes = section.querySelectorAll('.global-subtitle-checkbox:checked');
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
                const classifiedIndex = parseInt(subtitleIndex, 10);
                if (!Number.isNaN(classifiedIndex) && this.classifiedSubtitles[classifiedIndex]) {
                    this.classifiedSubtitles[classifiedIndex].speaker_name = targetSpeaker;
                    this.classifiedSubtitles[classifiedIndex].speaker_id = targetSpeaker === '화자1' ? 0 :
                                                                             targetSpeaker === '화자2' ? 1 :
                                                                             targetSpeaker === '화자3' ? 2 : -1;
                }
            }
        });

        // 자동 선택해제 제거 - 사용자가 수동으로 해제하도록 변경
        // this.deselectAllSubtitles(); // 제거됨

        this.updateSpeakerStatisticsFromSubtitles();
        this.trackSpeakerMappingChanges();
        this.updateTotalSelectedCount();
        this.storeSpeakerClassification('speaker-change');

        console.log(`✅ ${selectedCheckboxes.length}개 자막의 화자를 ${targetSpeaker}로 변경 완료`);
        alert(`✅ ${selectedCheckboxes.length}개 자막의 화자가 ${targetSpeaker}로 변경되었습니다.\n선택된 자막은 그대로 유지됩니다. 선택을 해제하려면 '전체 해제' 버튼을 사용하세요.`);
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

    async refreshAllSRTSubtitlesWithUpdatedTracks() {
        console.log('🔄 트랙 배치 결과를 반영하여 전체 SRT 자막 섹션 업데이트');

        try {
            // 기존 전체 자막 섹션 제거
            const existingSection = document.getElementById('all-subtitles-section');
            if (existingSection) {
                console.log('🗑️ 기존 전체 자막 섹션 제거');
                existingSection.remove();
            }

            // speakers 섹션이 있는지 확인
            const speakersSection = document.getElementById('detected-speakers');
            if (!speakersSection) {
                console.error('❌ speakers 섹션을 찾을 수 없습니다');
                return;
            }

            // 현재 화자 정보 확인
            if (!this.currentSpeakers || Object.keys(this.currentSpeakers).length === 0) {
                console.error('❌ 현재 화자 정보가 없습니다');
                return;
            }

            console.log('🎭 현재 화자 정보:', Object.keys(this.currentSpeakers));

            // 현재 화자 정보로 전체 자막 섹션 다시 생성
            await this.displayAllSRTSubtitlesWithSpeakers(this.currentSpeakers);

            // 섹션이 제대로 생성되었는지 확인
            const newSection = document.getElementById('all-subtitles-section');
            if (newSection) {
                console.log('✅ 전체 SRT 자막 섹션 업데이트 완료');
            } else {
                console.error('❌ 전체 SRT 자막 섹션 생성 실패');
            }

            this.updateSpeakerStatisticsFromSubtitles();

        } catch (error) {
            console.error('❌ 전체 SRT 자막 섹션 업데이트 실패:', error);
        }
    }

    toggleAllSubtitles(speakerName) {
        console.log(`🔄 ${speakerName} 모든 자막 토글`);

        const speakerSection = document.querySelector(`#speaker-subtitles-${speakerName}`);
        if (!speakerSection) {
            return;
        }

        const checkboxes = speakerSection.querySelectorAll('.subtitle-checkbox');
        const checkedCount = speakerSection.querySelectorAll('.subtitle-checkbox:checked').length;
        const newState = checkedCount === 0; // 모두 체크 해제된 상태면 모두 체크

        checkboxes.forEach(checkbox => {
            checkbox.checked = newState;
        });

        this.updateSelectedCount(speakerName);
        this.updateTotalSelectedCount();
        this.showSuccess(`${speakerName}의 모든 자막을 ${newState ? '선택' : '해제'}했습니다`);
    }

    onSubtitleCheckboxChange(subtitleIndex, speakerName) {
        console.log(`☑️ 자막 #${subtitleIndex + 1} 체크박스 변경`);
        this.updateSelectedCount(speakerName);
        this.updateTotalSelectedCount();
    }

    updateSelectedCount(speakerName) {
        const speakerSection = document.querySelector(`#speaker-subtitles-${speakerName}`);
        if (!speakerSection) {
            return;
        }

        const checkboxes = speakerSection.querySelectorAll('.subtitle-checkbox');
        const checkedCount = speakerSection.querySelectorAll('.subtitle-checkbox:checked').length;
        const totalCount = checkboxes.length;

        // 화자 카드의 제목 업데이트
        const speakerHeader = document.querySelector(`#speaker-subtitles-${speakerName} .subtitle-header strong`);
        if (speakerHeader) {
            speakerHeader.innerHTML = `📝 실제 대사 (시간순): <span style="color: var(--success-color)">${checkedCount}/${totalCount} 선택됨</span>`;
        }
    }

    updateSpeakerStatisticsFromSubtitles() {
        if (!Array.isArray(this.classifiedSubtitles)) {
            console.warn('⚠️ 업데이트할 분류된 자막이 없습니다');
            return;
        }

        if (!this.currentSpeakers) {
            this.currentSpeakers = {};
        }

        const statsMap = {};

        this.classifiedSubtitles.forEach((subtitle, index) => {
            if (!subtitle) {
                return;
            }

            let speakerName = subtitle.speaker_name || '미분류';

            if (!statsMap[speakerName]) {
                statsMap[speakerName] = {
                    count: 0,
                    totalDuration: 0,
                    totalChars: 0,
                    sampleTexts: []
                };
            }

            const stats = statsMap[speakerName];
            stats.count += 1;

            const duration = subtitle.duration !== undefined
                ? subtitle.duration
                : (subtitle.end_time !== undefined && subtitle.start_time !== undefined
                    ? subtitle.end_time - subtitle.start_time
                    : 0);
            stats.totalDuration += Number.isFinite(duration) ? duration : 0;

            const text = subtitle.text || '';
            stats.totalChars += text.length;
            if (text && stats.sampleTexts.length < 3) {
                stats.sampleTexts.push(text);
            }
        });

        const allSpeakerNames = new Set([
            ...Object.keys(this.currentSpeakers),
            ...Object.keys(statsMap)
        ]);

        allSpeakerNames.forEach(speakerName => {
            const existing = this.currentSpeakers[speakerName] || {};
            const stats = statsMap[speakerName];

            const subtitleCount = stats ? stats.count : 0;
            const totalDuration = stats ? stats.totalDuration : 0;
            const totalChars = stats ? stats.totalChars : 0;
            const sampleTexts = stats ? stats.sampleTexts : [];

            this.currentSpeakers[speakerName] = {
                ...existing,
                subtitle_count: subtitleCount,
                total_duration: totalDuration,
                avg_duration: subtitleCount > 0 ? totalDuration / subtitleCount : 0,
                total_chars: totalChars,
                avg_chars: subtitleCount > 0 ? totalChars / subtitleCount : 0,
                sample_texts: sampleTexts
            };

            const safeId = this.sanitizeSpeakerNameForId(speakerName);
            const countElement = document.getElementById(`speaker-count-${safeId}`);
            if (countElement) {
                const data = this.currentSpeakers[speakerName];
                const subtitleValue = data.subtitle_count ?? data.window_count ?? 0;
                const hasSubtitleCount = data.subtitle_count !== undefined;
                const unitLabel = hasSubtitleCount ? '개 대사' : '개 구간';
                countElement.textContent = `${subtitleValue}${unitLabel}`;
            }

            const mappingCountElement = document.getElementById(`mapping-count-${safeId}`);
            if (mappingCountElement) {
                const data = this.currentSpeakers[speakerName];
                const subtitleValue = data.subtitle_count ?? 0;
                mappingCountElement.textContent = `(${subtitleValue}개 대사)`;
            }
        });
    }

    buildSpeakerClassificationSnapshot(source = 'manual-save') {
        if (!Array.isArray(this.classifiedSubtitles) || this.classifiedSubtitles.length === 0) {
            if (!this.timeline || !this.timeline.speakerClassifiedSubtitles) {
                return null;
            }
        }

        const subtitlesClone = Array.isArray(this.classifiedSubtitles)
            ? JSON.parse(JSON.stringify(this.classifiedSubtitles))
            : [];

        const classificationSource = this.timeline && this.timeline.speakerClassifiedSubtitles
            ? this.timeline.speakerClassifiedSubtitles
            : this.groupSubtitlesByTrack(subtitlesClone);

        const classificationClone = JSON.parse(JSON.stringify(classificationSource));

        return {
            saved_at: new Date().toISOString(),
            source,
            classified_subtitles: subtitlesClone,
            classification: classificationClone,
            current_speakers: this.currentSpeakers ? JSON.parse(JSON.stringify(this.currentSpeakers)) : {},
            track_states: this.trackStates ? JSON.parse(JSON.stringify(this.trackStates)) : {},
            selected_files: Array.from(this.selectedFiles || []),
            status: {
                current_tab: this.currentTab,
                analysis_method: this.currentAnalysisMethod || 'text'
            }
        };
    }

    buildTimelineSnapshotForSave(source = 'analysis-save') {
        const classificationSnapshot = this.buildSpeakerClassificationSnapshot(source);

        const subtitleDataClone = this.timeline && this.timeline.subtitleData
            ? JSON.parse(JSON.stringify(this.timeline.subtitleData))
            : null;

        if (!classificationSnapshot && !subtitleDataClone) {
            return null;
        }

        const snapshot = classificationSnapshot
            ? { ...classificationSnapshot }
            : {
                saved_at: new Date().toISOString(),
                source,
                classified_subtitles: [],
                classification: null,
                current_speakers: this.currentSpeakers ? JSON.parse(JSON.stringify(this.currentSpeakers)) : {},
                track_states: this.trackStates ? JSON.parse(JSON.stringify(this.trackStates)) : {},
                selected_files: Array.from(this.selectedFiles || []),
                status: {
                    current_tab: this.currentTab,
                    analysis_method: this.currentAnalysisMethod || 'text'
                }
            };

        snapshot.subtitle_data = subtitleDataClone;

        if (this.timeline) {
            snapshot.timeline_state = {
                zoom: this.timeline.zoom,
                duration: this.timeline.duration,
                currentTime: this.timeline.currentTime,
                pixelsPerSecond: this.timeline.pixelsPerSecond,
                startOffset: this.timeline.startOffset,
                minTime: this.timeline.minTime,
                maxTime: this.timeline.maxTime
            };
        }

        return snapshot;
    }

    storeSpeakerClassification(source = 'manual-save') {
        if (!this.isStorageAvailable()) {
            return;
        }

        try {
            const snapshot = this.buildSpeakerClassificationSnapshot(source);
            if (!snapshot) {
                return;
            }
            window.localStorage.setItem(this.speakerClassificationStorageKey, JSON.stringify(snapshot));
        } catch (error) {
            console.error('화자 분류 상태 저장 실패:', error);
        }
    }

    getSavedSpeakerEntries() {
        if (!this.isStorageAvailable()) {
            return [];
        }
        try {
            const raw = window.localStorage.getItem(this.speakerClassificationListKey);
            let entries = [];
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    entries = parsed;
                } else if (parsed && Array.isArray(parsed.entries)) {
                    entries = parsed.entries;
                }
            }
            entries = entries
                .filter(entry => entry && entry.name && entry.data)
                .map(entry => ({
                    name: String(entry.name),
                    saved_at: entry.saved_at || new Date().toISOString(),
                    source: entry.source || null,
                    data: entry.data
                }));
            entries.sort((a, b) => new Date(b.saved_at || 0) - new Date(a.saved_at || 0));
            return entries;
        } catch (error) {
            console.error('저장된 화자 분류 목록 로드 실패:', error);
            return [];
        }
    }

    setSavedSpeakerEntries(entries) {
        if (!this.isStorageAvailable()) {
            return;
        }
        try {
            window.localStorage.setItem(this.speakerClassificationListKey, JSON.stringify(entries));
        } catch (error) {
            console.error('저장된 화자 분류 목록 저장 실패:', error);
        }
    }

    refreshSavedSpeakerDropdown(selectedName = undefined) {
        const dropdown = document.getElementById('saved-speaker-dropdown');
        const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');

        if (!dropdown && !dropdownBottom) {
            console.warn('드롭다운을 찾을 수 없습니다');
            return;
        }

        const entries = this.getSavedSpeakerEntries();
        console.log(`📝 드롭다운 갱신: ${entries.length}개 프로필, 선택할 이름: ${selectedName || '없음'}`);

        const previousValue = selectedName !== undefined ? selectedName : (dropdown ? dropdown.value : '');

        // 두 드롭다운을 모두 업데이트
        [dropdown, dropdownBottom].forEach((dd, index) => {
            if (!dd) return;

            const ddName = index === 0 ? '위쪽' : '아래쪽';
            console.log(`  ${ddName} 드롭다운 업데이트 중...`);

            dd.innerHTML = '';
            const autoOption = document.createElement('option');
            autoOption.value = '';
            autoOption.textContent = '자동 저장 (최근)';
            dd.appendChild(autoOption);

            entries.forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.name;
                option.textContent = entry.name;
                dd.appendChild(option);
            });

            if (previousValue && entries.some(entry => entry.name === previousValue)) {
                dd.value = previousValue;
                this.lastSelectedSavedSpeakerName = previousValue;
                console.log(`  ${ddName} 드롭다운: "${previousValue}" 선택됨`);
            } else {
                dd.value = '';
                this.lastSelectedSavedSpeakerName = null;
                console.log(`  ${ddName} 드롭다운: 자동 저장 (최근) 선택됨`);
            }
        });

        this.updateSavedSpeakerButtonsState();

        // 아래쪽 삭제 버튼 상태도 업데이트
        const deleteBottomBtn = document.getElementById('delete-saved-speaker-bottom');
        if (deleteBottomBtn && dropdownBottom) {
            deleteBottomBtn.disabled = !dropdownBottom.value;
        }
    }

    updateSavedSpeakerButtonsState() {
        const dropdown = document.getElementById('saved-speaker-dropdown');
        const selectedName = dropdown ? dropdown.value : '';
        const hasSelection = !!selectedName;
        const renameBtn = document.getElementById('rename-speaker-profile');
        const deleteBtn = document.getElementById('delete-speaker-profile');

        if (renameBtn) renameBtn.disabled = !hasSelection;
        if (deleteBtn) deleteBtn.disabled = !hasSelection;
    }

    getSelectedSavedSpeakerName() {
        const dropdown = document.getElementById('saved-speaker-dropdown');
        if (dropdown && dropdown.value) {
            return dropdown.value;
        }
        return null;
    }

    quickSaveSpeakerClassification() {
        if (!Array.isArray(this.classifiedSubtitles) || this.classifiedSubtitles.length === 0) {
            this.showError('저장할 화자 분류가 없습니다');
            return;
        }

        // 현재 선택된 프로필 이름 확인 (위쪽 또는 아래쪽 드롭다운)
        let currentName = this.lastSelectedSavedSpeakerName;

        if (!currentName) {
            const dropdownTop = document.getElementById('saved-speaker-dropdown');
            const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');

            if (dropdownTop && dropdownTop.value) {
                currentName = dropdownTop.value;
            } else if (dropdownBottom && dropdownBottom.value) {
                currentName = dropdownBottom.value;
            }
        }

        // 선택된 프로필이 있으면 그 이름으로 저장, 없으면 새 이름 생성
        const saveName = currentName || this.generateDefaultProfileName();

        console.log('💾 빠른 저장:', currentName ? `기존 "${saveName}" 덮어쓰기` : `새 프로필 "${saveName}" 생성`);

        this.saveSpeakerClassificationWithName(saveName, 'quick-save');
    }

    promptSaveSpeakerClassification() {
        if (!Array.isArray(this.classifiedSubtitles) || this.classifiedSubtitles.length === 0) {
            this.showError('저장할 화자 분류가 없습니다');
            return;
        }

        const defaultName = this.generateDefaultProfileName();
        const name = window.prompt('저장할 이름을 입력하세요.', defaultName);
        if (name === null) {
            return;
        }
        const trimmed = name.trim();
        if (!trimmed) {
            this.showError('이름을 입력해야 합니다');
            return;
        }

        const entries = this.getSavedSpeakerEntries();
        const exists = entries.some(entry => entry.name === trimmed);
        if (exists) {
            const confirmReplace = window.confirm(`'${trimmed}' 이름이 이미 존재합니다. 덮어쓸까요?`);
            if (!confirmReplace) {
                return;
            }
        }

        this.saveSpeakerClassificationWithName(trimmed, 'manual-save');
    }

    saveSpeakerClassificationWithName(name, source = 'manual-save') {
        if (!name) {
            return;
        }
        const snapshot = this.buildSpeakerClassificationSnapshot(source);
        if (!snapshot) {
            this.showError('저장할 화자 분류가 없습니다');
            return;
        }

        console.log('💾 저장 스냅샷:', {
            name,
            classifiedSubtitles_count: snapshot.classified_subtitles?.length,
            classification_keys: snapshot.classification ? Object.keys(snapshot.classification) : [],
            sample_subtitle_0: snapshot.classified_subtitles?.[0],
            sample_subtitle_1: snapshot.classified_subtitles?.[1],
            sample_subtitle_2: snapshot.classified_subtitles?.[2]
        });

        // 전체 데이터 확인용 (개발자 도구에서 확인 가능)
        console.log('💾 저장되는 전체 snapshot:', JSON.parse(JSON.stringify(snapshot)));

        const entries = this.getSavedSpeakerEntries();
        const snapshotClone = JSON.parse(JSON.stringify(snapshot));
        const savedAt = new Date().toISOString();
        const existingIndex = entries.findIndex(entry => entry.name === name);
        if (existingIndex >= 0) {
            entries[existingIndex] = {
                name,
                saved_at: savedAt,
                source,
                data: snapshotClone
            };
        } else {
            entries.unshift({
                name,
                saved_at: savedAt,
                source,
                data: snapshotClone
            });
        }
        this.setSavedSpeakerEntries(entries);
        this.refreshSavedSpeakerDropdown(name);

        const totalProfiles = entries.length;
        this.showSuccess(`'${name}' 프로필이 저장되었습니다.\n\n저장된 프로필: 총 ${totalProfiles}개\n드롭다운 메뉴를 클릭하여 확인하세요.`);
    }

    deleteSavedSpeakerClassification() {
        const name = this.getSelectedSavedSpeakerName();
        if (!name) {
            this.showError('삭제할 저장 프로필을 선택하세요');
            return;
        }

        const confirmDelete = window.confirm(`'${name}' 프로필을 삭제할까요?`);
        if (!confirmDelete) {
            return;
        }

        const entries = this.getSavedSpeakerEntries().filter(entry => entry.name !== name);
        this.setSavedSpeakerEntries(entries);
        this.refreshSavedSpeakerDropdown();
        this.showSuccess(`'${name}' 프로필이 삭제되었습니다.`);
    }

    renameSavedSpeakerClassification() {
        const name = this.getSelectedSavedSpeakerName();
        if (!name) {
            this.showError('이름을 변경할 프로필을 선택하세요');
            return;
        }

        const newName = window.prompt('새 이름을 입력하세요.', name);
        if (newName === null) {
            return;
        }
        const trimmed = newName.trim();
        if (!trimmed) {
            this.showError('이름을 입력해야 합니다');
            return;
        }
        if (trimmed === name) {
            return;
        }

        const entries = this.getSavedSpeakerEntries();
        if (entries.some(entry => entry.name === trimmed)) {
            this.showError('같은 이름의 프로필이 이미 존재합니다');
            return;
        }

        const entry = entries.find(item => item.name === name);
        if (!entry) {
            this.showError('저장된 데이터를 찾을 수 없습니다');
            return;
        }

        entry.name = trimmed;
        entry.saved_at = new Date().toISOString();
        this.setSavedSpeakerEntries(entries);
        this.refreshSavedSpeakerDropdown(trimmed);
        this.showSuccess(`'${name}' 프로필 이름을 '${trimmed}'으로 변경했습니다.`);
    }

    loadSavedSpeakerClassification(name = null) {
        if (!this.isStorageAvailable()) {
            this.showError('저장소를 사용할 수 없습니다 (브라우저 설정 확인)');
            return;
        }

        if (name === null || name === undefined) {
            const dropdown = document.getElementById('saved-speaker-dropdown');
            if (dropdown && dropdown.value) {
                name = dropdown.value;
            }
        }

        if (name) {
            const entries = this.getSavedSpeakerEntries();
            const entry = entries.find(item => item.name === name);
            if (!entry) {
                this.showError(`'${name}' 프로필을 찾을 수 없습니다`);
                return;
            }

            console.log('📂 LocalStorage에서 불러온 entry:', {
                name: entry.name,
                saved_at: entry.saved_at,
                data_keys: entry.data ? Object.keys(entry.data) : [],
                classifiedSubtitles_count: entry.data?.classified_subtitles?.length
            });

            console.log('📂 불러온 전체 entry.data:', JSON.parse(JSON.stringify(entry.data)));

            this.applySpeakerClassificationSnapshot(entry.data, name);
            this.refreshSavedSpeakerDropdown(name);
            return;
        }

        const raw = window.localStorage.getItem(this.speakerClassificationStorageKey);
        if (!raw) {
            this.showError('저장된 화자 분류가 없습니다');
            return;
        }

        try {
            const snapshot = JSON.parse(raw);
            this.applySpeakerClassificationSnapshot(snapshot, '자동 저장');
            this.refreshSavedSpeakerDropdown();
        } catch (error) {
            console.error('자동 저장 화자 분류 불러오기 실패:', error);
            this.showError('저장된 화자 분류를 불러오지 못했습니다');
        }
    }

    applySpeakerClassificationSnapshot(snapshot, label = '저장된 분류') {
        if (!snapshot || !Array.isArray(snapshot.classified_subtitles)) {
            this.showError('저장된 데이터 형식이 올바르지 않습니다');
            return;
        }

        console.log('📂 불러오기 스냅샷:', {
            label,
            classifiedSubtitles_count: snapshot.classified_subtitles?.length,
            classification_keys: snapshot.classification ? Object.keys(snapshot.classification) : [],
            sample_subtitle: snapshot.classified_subtitles?.[0]
        });

        this.classifiedSubtitles = Array.isArray(snapshot.classified_subtitles)
            ? snapshot.classified_subtitles.map(sub => ({ ...sub }))
            : [];

        console.log('📝 복원된 classifiedSubtitles:', {
            count: this.classifiedSubtitles.length,
            sample_0: this.classifiedSubtitles[0],
            sample_1: this.classifiedSubtitles[1],
            sample_2: this.classifiedSubtitles[2]
        });

        console.log('📝 복원된 전체 classifiedSubtitles:', JSON.parse(JSON.stringify(this.classifiedSubtitles)));

        this.currentSpeakers = snapshot.current_speakers
            ? JSON.parse(JSON.stringify(snapshot.current_speakers))
            : {};

        if (snapshot.track_states) {
            this.trackStates = JSON.parse(JSON.stringify(snapshot.track_states));
        }

        this.currentAnalysisMethod = snapshot.status?.analysis_method || this.currentAnalysisMethod || 'text';

        const classification = snapshot.classification
            ? JSON.parse(JSON.stringify(snapshot.classification))
            : this.groupSubtitlesByTrack(this.classifiedSubtitles);

        console.log('🎯 classification 객체:', {
            keys: Object.keys(classification),
            main_count: classification.main?.length,
            translation_count: classification.translation?.length,
            description_count: classification.description?.length
        });

        // 타임라인에 직접 설정 (updateHybridTracksWithSpeakers를 호출하지 않음)
        if (this.timeline) {
            this.timeline.speakerClassifiedSubtitles = classification;

            // 타임라인 트랙 렌더링만 수행
            this.renderHybridSubtitleTracks();
        }

        if (this.currentSpeakers && Object.keys(this.currentSpeakers).length > 0) {
            const method = (this.currentAnalysisMethod || '').toLowerCase();
            if (method.includes('audio')) {
                this.displayAudioBasedSpeakers(this.currentSpeakers, this.currentAnalysisMethod);
            } else {
                this.displayDetectedSpeakers(this.currentSpeakers);
            }
        }

        // 화면에 표시된 전체 자막 리스트 업데이트
        this.updateDisplayedSubtitlesFromClassification();

        this.storeSpeakerClassification('load-snapshot');
        this.refreshSavedSpeakerDropdown(label && label !== '자동 저장' ? label : undefined);
        this.showSuccess(`'${label}' 프로필을 불러왔습니다.`);
        this.showStatus(`✅ '${label}' 분류 적용됨`);
    }

    updateDisplayedSubtitlesFromClassification() {
        // 전체 자막 섹션이 있는지 확인
        const allSubtitlesSection = document.getElementById('all-subtitles-section');
        if (!allSubtitlesSection) {
            console.log('전체 자막 섹션이 없어서 업데이트 건너뜀');
            return;
        }

        console.log('🔄 화면 자막 업데이트 시작, classifiedSubtitles:', this.classifiedSubtitles.length);

        // 모든 자막 체크박스 업데이트
        const checkboxes = allSubtitlesSection.querySelectorAll('.global-subtitle-checkbox');
        let updatedCount = 0;

        checkboxes.forEach(checkbox => {
            const subtitleIndex = parseInt(checkbox.dataset.subtitleIndex);
            if (isNaN(subtitleIndex)) return;

            // classifiedSubtitles에서 해당 인덱스의 자막 찾기 (여러 방법 시도)
            let classifiedSub = this.classifiedSubtitles.find(sub =>
                sub.globalIndex === subtitleIndex
            );

            // globalIndex로 못찾으면 index로 시도
            if (!classifiedSub) {
                classifiedSub = this.classifiedSubtitles.find(sub =>
                    sub.index === subtitleIndex
                );
            }

            // 그래도 못찾으면 시간으로 매칭 시도
            if (!classifiedSub) {
                const subtitleTimeInfo = checkbox.closest('.subtitle-item')?.querySelector('.subtitle-time')?.textContent;
                if (subtitleTimeInfo) {
                    // 시간 정보에서 start_time 추출 (예: "00:00:02.360 → 00:00:06.279")
                    const timeMatch = subtitleTimeInfo.match(/(\d{2}):(\d{2}):(\d{2}\.\d{3})/);
                    if (timeMatch) {
                        const hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);
                        const seconds = parseFloat(timeMatch[3]);
                        const startTime = hours * 3600 + minutes * 60 + seconds;

                        classifiedSub = this.classifiedSubtitles.find(sub =>
                            Math.abs(sub.start_time - startTime) < 0.1
                        );
                    }
                }
            }

            if (classifiedSub) {
                updatedCount++;

                // 화자 정보 업데이트
                const speakerName = classifiedSub.speaker_name || '미분류';
                checkbox.dataset.speaker = speakerName;

                // 부모 요소의 화자 라벨과 색상 업데이트
                const subtitleItem = checkbox.closest('.subtitle-item');
                if (subtitleItem) {
                    const speakerLabel = subtitleItem.querySelector('.speaker-label');
                    if (speakerLabel) {
                        speakerLabel.textContent = speakerName;

                        // 화자 색상 가져오기
                        const speakerColors = {
                            '화자1': '#FF6B6B',
                            '화자2': '#4ECDC4',
                            '화자3': '#45B7D1',
                            '미분류': '#95A5A6'
                        };
                        const color = speakerColors[speakerName] || '#95A5A6';
                        speakerLabel.style.color = color;

                        // 자막 내용 컨테이너 색상도 업데이트
                        const subtitleContent = subtitleItem.querySelector('.subtitle-content');
                        if (subtitleContent) {
                            subtitleContent.style.borderLeftColor = color;
                            const hexToRgb = (hex) => {
                                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                                return result ?
                                    parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) :
                                    '0,0,0';
                            };
                            subtitleContent.style.backgroundColor = `rgba(${hexToRgb(color)}, 0.05)`;
                        }
                    }
                }

                // 트랙 정보가 있으면 체크 상태 업데이트
                const trackType = classifiedSub.track_type;
                if (trackType && trackType !== 'none') {
                    checkbox.checked = true;
                } else {
                    checkbox.checked = false;
                }
            }
        });

        // 선택 카운트 업데이트
        this.updateTotalSelectedCount();

        console.log(`✅ 화면 자막 리스트 업데이트 완료: ${updatedCount}/${checkboxes.length}개 업데이트됨`);
    }

    exportToJSON() {
        // 현재 선택된 프로필 가져오기
        const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
        const selectedName = dropdownBottom && dropdownBottom.value ? dropdownBottom.value : null;

        if (!selectedName) {
            this.showError('내보낼 프로필을 선택하세요');
            return;
        }

        console.log('📦 JSON 내보내기 시작:', selectedName);

        // 프로필 데이터 가져오기
        const entries = this.getSavedSpeakerEntries();
        const profile = entries.find(entry => entry.name === selectedName);

        if (!profile) {
            this.showError(`'${selectedName}' 프로필을 찾을 수 없습니다`);
            return;
        }

        // JSON 파일로 다운로드
        const jsonString = JSON.stringify(profile, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showSuccess(`'${selectedName}' 프로필을 JSON 파일로 내보냈습니다`);
        console.log('✅ JSON 내보내기 완료:', `${selectedName}.json`);
    }

    async importFromJSON(file) {
        console.log('📥 JSON 가져오기 시작:', file.name);

        try {
            const text = await file.text();
            const profile = JSON.parse(text);

            // 프로필 데이터 검증
            if (!profile.name || !profile.data || !profile.data.classified_subtitles) {
                this.showError('올바르지 않은 프로필 형식입니다');
                return;
            }

            console.log('📝 가져온 프로필:', {
                name: profile.name,
                saved_at: profile.saved_at,
                classifiedSubtitles_count: profile.data.classified_subtitles.length
            });

            // 기존 프로필 확인
            const entries = this.getSavedSpeakerEntries();
            const exists = entries.some(entry => entry.name === profile.name);

            if (exists) {
                const confirmReplace = window.confirm(`'${profile.name}' 프로필이 이미 존재합니다. 덮어쓸까요?`);
                if (!confirmReplace) {
                    return;
                }
            }

            // 프로필 저장
            const existingIndex = entries.findIndex(entry => entry.name === profile.name);
            if (existingIndex >= 0) {
                entries[existingIndex] = profile;
            } else {
                entries.unshift(profile);
            }

            this.setSavedSpeakerEntries(entries);
            this.refreshSavedSpeakerDropdown(profile.name);

            // 자동으로 불러오기
            this.applySpeakerClassificationSnapshot(profile.data, profile.name);

            this.showSuccess(`'${profile.name}' 프로필을 가져왔습니다`);
            console.log('✅ JSON 가져오기 완료');

        } catch (error) {
            console.error('❌ JSON 가져오기 실패:', error);
            this.showError(`JSON 파일 가져오기 실패: ${error.message}`);
        }
    }

    exportToSRT() {
        if (!Array.isArray(this.classifiedSubtitles) || this.classifiedSubtitles.length === 0) {
            this.showError('내보낼 자막이 없습니다');
            return;
        }

        console.log('📤 SRT 내보내기 시작:', this.classifiedSubtitles.length, '개 자막');

        // SRT 형식으로 변환
        const formatSRTTime = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 1000);
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
        };

        let srtContent = '';
        let counter = 1;

        // 시간순 정렬
        const sortedSubtitles = [...this.classifiedSubtitles].sort((a, b) => a.start_time - b.start_time);

        sortedSubtitles.forEach(subtitle => {
            const speakerPrefix = subtitle.speaker_name && subtitle.speaker_name !== '미분류'
                ? `[${subtitle.speaker_name}] `
                : '';

            srtContent += `${counter}\n`;
            srtContent += `${formatSRTTime(subtitle.start_time)} --> ${formatSRTTime(subtitle.end_time)}\n`;
            srtContent += `${speakerPrefix}${subtitle.text}\n\n`;
            counter++;
        });

        // 파일 다운로드
        const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // 파일 이름 생성 (현재 프로필 이름 사용)
        let filename = '자막';
        const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
        if (dropdownBottom && dropdownBottom.value) {
            filename = dropdownBottom.value;
        } else {
            filename = this.generateDefaultProfileName();
        }

        a.download = `${filename}.srt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showSuccess(`${sortedSubtitles.length}개 자막을 SRT 파일로 내보냈습니다`);
        console.log('✅ SRT 내보내기 완료:', `${filename}.srt`);
    }

    async importFromSRT(file) {
        console.log('📥 SRT 가져오기 시작:', file.name);

        try {
            const text = await file.text();
            const subtitles = this.parseSRT(text);

            if (subtitles.length === 0) {
                this.showError('SRT 파일에서 자막을 찾을 수 없습니다');
                return;
            }

            console.log('📝 파싱된 자막:', subtitles.length, '개');

            // classifiedSubtitles 형식으로 변환
            this.classifiedSubtitles = subtitles.map((sub, index) => {
                // 화자 정보 파싱 ("[화자1] 텍스트" 형식)
                let speakerName = '미분류';
                let text = sub.text;
                const speakerMatch = text.match(/^\[([^\]]+)\]\s*/);
                if (speakerMatch) {
                    speakerName = speakerMatch[1];
                    text = text.substring(speakerMatch[0].length);
                }

                return {
                    start_time: sub.start_time,
                    end_time: sub.end_time,
                    text: text,
                    speaker_name: speakerName,
                    speaker_id: this.getSpeakerIdByName(speakerName),
                    globalIndex: index,
                    index: index,
                    track_type: 'main'
                };
            });

            // 화자 정보 추출
            const speakers = {};
            this.classifiedSubtitles.forEach(sub => {
                if (!speakers[sub.speaker_name]) {
                    speakers[sub.speaker_name] = {
                        name: sub.speaker_name,
                        count: 0,
                        assigned_track: 'main'
                    };
                }
                speakers[sub.speaker_name].count++;
            });

            this.currentSpeakers = speakers;

            // classification 구조 생성
            const classification = this.groupSubtitlesByTrack(this.classifiedSubtitles);

            // 타임라인 업데이트
            if (this.timeline) {
                this.timeline.speakerClassifiedSubtitles = classification;

                // subtitleData도 설정
                if (!this.timeline.subtitleData) {
                    this.timeline.subtitleData = {
                        subtitles: this.classifiedSubtitles,
                        file_path: file.name,
                        total_duration: this.classifiedSubtitles.length > 0
                            ? Math.max(...this.classifiedSubtitles.map(s => s.end_time))
                            : 0
                    };
                }

                this.renderHybridSubtitleTracks();
            }

            // 화자 표시 (displayAllSRTSubtitlesWithSpeakers 호출하지 않고 직접 표시)
            this.displayImportedSpeakers(this.currentSpeakers);

            // 저장
            this.storeSpeakerClassification('srt-import');

            this.showSuccess(`${subtitles.length}개 자막을 가져왔습니다 (화자: ${Object.keys(speakers).length}명)`);
            console.log('✅ SRT 가져오기 완료');

        } catch (error) {
            console.error('❌ SRT 가져오기 실패:', error);
            this.showError(`SRT 파일 가져오기 실패: ${error.message}`);
        }
    }

    displayImportedSpeakers(speakers) {
        console.log('🎭 가져온 화자 표시:', speakers);

        // 화자 정보 표시
        const speakersSection = document.getElementById('detected-speakers');
        if (speakersSection) {
            speakersSection.innerHTML = `
                <h3>🎭 감지된 화자 (${Object.keys(speakers).length}명)</h3>
                <div class="speakers-grid">
                    ${Object.entries(speakers).map(([name, data]) => `
                        <div class="speaker-card">
                            <div class="speaker-info">
                                <span class="speaker-name">${name}</span>
                                <span class="speaker-count">${data.count}개 자막</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            speakersSection.style.display = 'block';
        }

        // 전체 자막 섹션 생성
        const formatSRTTime = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = (seconds % 60).toFixed(3);
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
        };

        const getSpeakerColor = (speakerName) => {
            const colors = {
                '화자1': '#FF6B6B',
                '화자2': '#4ECDC4',
                '화자3': '#45B7D1',
                '화자4': '#9B59B6',
                '미분류': '#95A5A6'
            };
            return colors[speakerName] || '#95A5A6';
        };

        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ?
                parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) :
                '0,0,0';
        };

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
            <h3>🎬 전체 자막 (${this.classifiedSubtitles.length}개)</h3>
            <div class="subtitle-controls">
                <div class="control-row">
                    <button onclick="app.selectAllSubtitles()" class="action-btn">전체 선택</button>
                    <button onclick="app.deselectAllSubtitles()" class="action-btn">전체 해제</button>
                    <span class="selected-count">선택된 자막: <span id="total-selected-count">0</span>개</span>
                </div>
                <div class="control-row">
                    <div class="apply-selection-controls">
                        <button onclick="app.quickSaveSpeakerClassification()" class="action-btn secondary" style="background-color: #27ae60; border-color: #27ae60;">💾 저장</button>
                        <button onclick="app.promptSaveSpeakerClassification()" class="action-btn primary">💾 다른이름저장</button>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label style="margin: 0;">저장된 프로필:
                                <select id="saved-speaker-dropdown-bottom" style="padding: 6px 10px; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;">
                                    <option value="">자동 저장 (최근)</option>
                                </select>
                            </label>
                            <button class="action-btn secondary" id="load-saved-speaker-bottom">📂 불러오기</button>
                            <button class="action-btn secondary" id="delete-saved-speaker-bottom" disabled style="background-color: #e74c3c; border-color: #e74c3c;">🗑️ 삭제</button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                            <button class="action-btn secondary" id="export-srt-btn">📤 SRT 내보내기</button>
                            <button class="action-btn secondary" id="import-srt-btn">📥 SRT 가져오기</button>
                            <input type="file" id="import-srt-file" accept=".srt" style="display: none;">
                        </div>
                    </div>
                </div>
            </div>
            <div class="all-subtitles-list"></div>
        `;

        // speakersSection 다음에 추가
        if (speakersSection) {
            speakersSection.insertAdjacentElement('afterend', allSubtitlesSection);
        } else {
            const analysisContainer = document.querySelector('.analysis-container');
            if (analysisContainer) {
                analysisContainer.appendChild(allSubtitlesSection);
            }
        }

        // 자막 리스트 렌더링
        const subtitleList = allSubtitlesSection.querySelector('.all-subtitles-list');
        this.classifiedSubtitles.forEach((subtitle) => {
            const currentSpeakerColor = getSpeakerColor(subtitle.speaker_name);

            const subtitleItem = document.createElement('div');
            subtitleItem.className = 'subtitle-item';
            subtitleItem.innerHTML = `
                <div class="subtitle-checkbox-container">
                    <input type="checkbox"
                           id="subtitle-check-${subtitle.globalIndex}"
                           class="subtitle-checkbox global-subtitle-checkbox"
                           data-speaker="${subtitle.speaker_name}"
                           data-subtitle-index="${subtitle.globalIndex}">
                    <label for="subtitle-check-${subtitle.globalIndex}" class="checkbox-label"></label>
                </div>
                <div class="subtitle-content" style="border-left: 3px solid ${currentSpeakerColor}; background-color: rgba(${hexToRgb(currentSpeakerColor)}, 0.05);">
                    <div class="subtitle-time-info">
                        <span class="subtitle-number">#${subtitle.globalIndex + 1}</span>
                        <span class="subtitle-time">${formatSRTTime(subtitle.start_time)} → ${formatSRTTime(subtitle.end_time)}</span>
                        <span class="speaker-label" style="color: ${currentSpeakerColor}; font-weight: bold;">${subtitle.speaker_name}</span>
                    </div>
                    <div class="subtitle-text-content" ondblclick="app.editSubtitleText(this, ${subtitle.globalIndex})" title="더블클릭하여 편집">${subtitle.text}</div>
                </div>
            `;

            subtitleList.appendChild(subtitleItem);
        });

        // 드롭다운 갱신 및 이벤트 리스너 재설정
        this.refreshSavedSpeakerDropdown();

        // 이벤트 리스너 재설정 (기존 코드와 동일)
        const loadBottomBtn = document.getElementById('load-saved-speaker-bottom');
        if (loadBottomBtn) {
            const newLoadBottomBtn = loadBottomBtn.cloneNode(true);
            loadBottomBtn.parentNode.replaceChild(newLoadBottomBtn, loadBottomBtn);
            newLoadBottomBtn.addEventListener('click', () => {
                const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
                const selectedName = dropdownBottom ? dropdownBottom.value : null;
                this.loadSavedSpeakerClassification(selectedName);
            });
        }

        const deleteBottomBtn = document.getElementById('delete-saved-speaker-bottom');
        if (deleteBottomBtn) {
            const newDeleteBottomBtn = deleteBottomBtn.cloneNode(true);
            deleteBottomBtn.parentNode.replaceChild(newDeleteBottomBtn, deleteBottomBtn);
            newDeleteBottomBtn.addEventListener('click', () => {
                const dropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
                const selectedName = dropdownBottom ? dropdownBottom.value : null;
                if (!selectedName) {
                    this.showError('삭제할 저장 프로필을 선택하세요');
                    return;
                }
                const confirmDelete = window.confirm(`'${selectedName}' 프로필을 삭제할까요?`);
                if (!confirmDelete) return;
                const entries = this.getSavedSpeakerEntries().filter(entry => entry.name !== selectedName);
                this.setSavedSpeakerEntries(entries);
                this.refreshSavedSpeakerDropdown();
                this.showSuccess(`'${selectedName}' 프로필이 삭제되었습니다.`);
            });
        }

        const savedDropdownBottom = document.getElementById('saved-speaker-dropdown-bottom');
        if (savedDropdownBottom) {
            savedDropdownBottom.addEventListener('change', () => {
                this.lastSelectedSavedSpeakerName = savedDropdownBottom.value || null;
                const deleteBtn = document.getElementById('delete-saved-speaker-bottom');
                if (deleteBtn) {
                    deleteBtn.disabled = !savedDropdownBottom.value;
                }
            });
        }

        // JSON 버튼 이벤트
        const exportJsonBtn = document.getElementById('export-json-btn');
        if (exportJsonBtn) {
            const newExportJsonBtn = exportJsonBtn.cloneNode(true);
            exportJsonBtn.parentNode.replaceChild(newExportJsonBtn, exportJsonBtn);
            newExportJsonBtn.addEventListener('click', () => {
                this.exportToJSON();
            });
        }

        const importJsonBtn = document.getElementById('import-json-btn');
        const importJsonFile = document.getElementById('import-json-file');
        if (importJsonBtn && importJsonFile) {
            const newImportJsonBtn = importJsonBtn.cloneNode(true);
            importJsonBtn.parentNode.replaceChild(newImportJsonBtn, importJsonBtn);
            newImportJsonBtn.addEventListener('click', () => {
                importJsonFile.click();
            });
            importJsonFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.importFromJSON(file);
                    e.target.value = '';
                }
            });
        }

        // SRT 버튼 이벤트
        const exportSrtBtn = document.getElementById('export-srt-btn');
        if (exportSrtBtn) {
            const newExportSrtBtn = exportSrtBtn.cloneNode(true);
            exportSrtBtn.parentNode.replaceChild(newExportSrtBtn, exportSrtBtn);
            newExportSrtBtn.addEventListener('click', () => {
                this.exportToSRT();
            });
        }

        const importSrtBtn = document.getElementById('import-srt-btn');
        const importSrtFile = document.getElementById('import-srt-file');
        if (importSrtBtn && importSrtFile) {
            const newImportSrtBtn = importSrtBtn.cloneNode(true);
            importSrtBtn.parentNode.replaceChild(newImportSrtBtn, importSrtBtn);
            newImportSrtBtn.addEventListener('click', () => {
                importSrtFile.click();
            });
            importSrtFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.importFromSRT(file);
                    e.target.value = '';
                }
            });
        }

        this.updateTotalSelectedCount();
        console.log('✅ 가져온 자막 화면 표시 완료');
    }

    parseSRT(text) {
        const subtitles = [];
        const blocks = text.trim().split(/\n\s*\n/);

        blocks.forEach(block => {
            const lines = block.trim().split('\n');
            if (lines.length < 3) return;

            // 시간 라인 찾기
            const timeLine = lines.find(line => line.includes('-->'));
            if (!timeLine) return;

            const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
            if (!timeMatch) return;

            const start_time = parseInt(timeMatch[1]) * 3600 +
                             parseInt(timeMatch[2]) * 60 +
                             parseInt(timeMatch[3]) +
                             parseInt(timeMatch[4]) / 1000;

            const end_time = parseInt(timeMatch[5]) * 3600 +
                           parseInt(timeMatch[6]) * 60 +
                           parseInt(timeMatch[7]) +
                           parseInt(timeMatch[8]) / 1000;

            // 텍스트 라인 (시간 라인 다음부터)
            const timeLineIndex = lines.indexOf(timeLine);
            const textLines = lines.slice(timeLineIndex + 1);
            const text = textLines.join('\n').trim();

            if (text) {
                subtitles.push({ start_time, end_time, text });
            }
        });

        return subtitles;
    }

    getSpeakerIdByName(speakerName) {
        const speakerMap = {
            '화자1': 0,
            '화자2': 1,
            '화자3': 2,
            '화자4': 3,
            '미분류': -1
        };
        return speakerMap[speakerName] !== undefined ? speakerMap[speakerName] : -1;
    }

    generateDefaultProfileName() {
        const now = new Date();
        const pad = (value) => value.toString().padStart(2, '0');
        return `분류-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    }

    groupSubtitlesByTrack(subtitles) {
        const grouped = {
            main: [],
            translation: [],
            description: [],
            unassigned: []
        };

        if (!Array.isArray(subtitles)) {
            return grouped;
        }

        subtitles.forEach(sub => {
            if (!sub) return;
            const track = sub.assigned_track || sub.track || 'unassigned';
            if (!grouped[track]) {
                grouped[track] = [];
            }
            grouped[track].push(JSON.parse(JSON.stringify(sub)));
        });

        return grouped;
    }
    isStorageAvailable() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) {
                return false;
            }
            const testKey = '__speaker_storage_test__';
            window.localStorage.setItem(testKey, '1');
            window.localStorage.removeItem(testKey);
            return true;
        } catch (error) {
            console.warn('localStorage 사용 불가:', error);
            return false;
        }
    }

    restoreTimelineSnapshot(snapshot, options = {}) {
        if (!snapshot || typeof snapshot !== 'object') {
            return false;
        }

        const preserveExistingSubtitles = Boolean(options.preserveExistingSubtitles);

        const subtitleData = snapshot.subtitle_data || snapshot.subtitleData || null;
        if (subtitleData && (!preserveExistingSubtitles || !this.timeline || !this.timeline.subtitleData)) {
            if (!this.timeline) {
                this.timeline = {
                    zoom: 1,
                    duration: 0,
                    currentTime: 0,
                    pixelsPerSecond: 50,
                    startOffset: 0,
                    minTime: 0,
                    maxTime: 0,
                    subtitleData: null,
                    videoData: null,
                    audioData: null,
                    isPlaying: false,
                    realWaveformDrawn: false
                };
            }

            this.timeline.subtitleData = JSON.parse(JSON.stringify(subtitleData));

            const timelineState = snapshot.timeline_state || snapshot.timelineState || null;
            if (timelineState) {
                this.timeline.zoom = timelineState.zoom ?? this.timeline.zoom;
                this.timeline.duration = timelineState.duration ?? this.timeline.duration;
                this.timeline.currentTime = timelineState.currentTime ?? this.timeline.currentTime;
                this.timeline.pixelsPerSecond = timelineState.pixelsPerSecond ?? this.timeline.pixelsPerSecond;
                this.timeline.startOffset = timelineState.startOffset ?? this.timeline.startOffset;
                this.timeline.minTime = timelineState.minTime ?? this.timeline.minTime;
                this.timeline.maxTime = timelineState.maxTime ?? this.timeline.maxTime;
            }
        }

        if (snapshot.track_states) {
            this.trackStates = JSON.parse(JSON.stringify(snapshot.track_states));
        }

        if (Array.isArray(snapshot.classified_subtitles)) {
            this.classifiedSubtitles = snapshot.classified_subtitles.map(sub => ({ ...sub }));
        }

        if (snapshot.current_speakers) {
            this.currentSpeakers = JSON.parse(JSON.stringify(snapshot.current_speakers));
        }

        if (snapshot.status?.analysis_method) {
            this.currentAnalysisMethod = snapshot.status.analysis_method;
        }

        if (snapshot.classification) {
            const classificationClone = JSON.parse(JSON.stringify(snapshot.classification));
            this.updateHybridTracksWithSpeakers(classificationClone);
        } else if (this.timeline && this.timeline.subtitleData) {
            try {
                this.renderHybridSubtitleTracks();
            } catch (error) {
                console.error('타임라인 스냅샷 렌더링 실패:', error);
            }
        }

        this.refreshReinterpretationPanel();

        return true;
    }

    applySelectedSubtitles() {
        console.log('✅ 선택된 자막들 적용');

        const section = document.getElementById('all-subtitles-section');
        if (!section) {
            this.showError('전체 자막 섹션을 찾을 수 없습니다');
            return;
        }

        const allCheckboxes = section.querySelectorAll('.global-subtitle-checkbox:checked');
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
        this.updateSpeakerStatisticsFromSubtitles();
        this.storeSpeakerClassification('manual-save');

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

    escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value).replace(/[&<>"']/g, (ch) => {
            switch (ch) {
                case '&':
                    return '&amp;';
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '"':
                    return '&quot;';
                case "'":
                    return '&#39;';
                default:
                    return ch;
            }
        });
    }

    editSubtitleText(element, globalIndex) {
        console.log(`✏️ 자막 #${globalIndex + 1} 편집 시작`);

        const currentText = element.textContent.trim();

        // 편집 모드로 변환
        const input = document.createElement('textarea');
        input.value = currentText;
        input.className = 'subtitle-edit-input';
        input.style.cssText = `
            width: 100%;
            min-height: 60px;
            padding: 8px;
            border: 2px solid var(--primary-color);
            border-radius: 4px;
            font-family: inherit;
            font-size: inherit;
            background: white;
            color: var(--text-primary);
            resize: vertical;
            outline: none;
        `;

        // 저장/취소 버튼 컨테이너
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'edit-buttons';
        buttonContainer.style.cssText = `
            display: flex;
            gap: 8px;
            margin-top: 8px;
            justify-content: flex-end;
        `;

        // 저장 버튼
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 저장';
        saveBtn.className = 'edit-save-btn';
        saveBtn.style.cssText = `
            background: var(--success-color);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85rem;
        `;

        // 취소 버튼
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '❌ 취소';
        cancelBtn.className = 'edit-cancel-btn';
        cancelBtn.style.cssText = `
            background: var(--error-color);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85rem;
        `;

        // 원래 내용 저장
        const originalContent = element.innerHTML;

        // 편집 UI로 교체
        element.innerHTML = '';
        element.appendChild(input);
        buttonContainer.appendChild(saveBtn);
        buttonContainer.appendChild(cancelBtn);
        element.appendChild(buttonContainer);

        // 포커스 및 텍스트 선택
        input.focus();
        input.select();

        // 저장 기능
        const saveEdit = () => {
            const newText = input.value.trim();
            if (newText === '') {
                alert('자막 내용을 입력해주세요.');
                return;
            }

            if (newText === currentText) {
                // 변경사항이 없으면 편집 모드 종료
                element.innerHTML = originalContent;
                return;
            }

            // 자막 데이터 업데이트
            this.updateSubtitleText(globalIndex, newText);

            // UI 업데이트
            element.innerHTML = newText;
            element.title = '더블클릭하여 편집';

            console.log(`✅ 자막 #${globalIndex + 1} 수정 완료: "${newText}"`);
            this.showSuccess(`자막 #${globalIndex + 1} 내용이 수정되었습니다.`);
        };

        // 취소 기능
        const cancelEdit = () => {
            element.innerHTML = originalContent;
        };

        // 이벤트 리스너
        saveBtn.addEventListener('click', saveEdit);
        cancelBtn.addEventListener('click', cancelEdit);

        // Enter (Ctrl+Enter) 저장, Escape 취소
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
    }

    updateSubtitleText(globalIndex, newText, options = {}) {
        console.log(`🔄 자막 데이터 업데이트: #${globalIndex + 1} → "${newText}"`);

        let previousText = null;
        let updatedCount = 0;

        // 1. classifiedSubtitles 업데이트 (인덱스 또는 시간으로 찾기)
        if (Array.isArray(this.classifiedSubtitles)) {
            // globalIndex로 먼저 찾기
            let found = false;
            for (let i = 0; i < this.classifiedSubtitles.length; i++) {
                const sub = this.classifiedSubtitles[i];
                if (sub.globalIndex === globalIndex || sub.index === globalIndex) {
                    previousText = sub.text;
                    this.classifiedSubtitles[i].text = newText;
                    updatedCount++;
                    found = true;
                    console.log(`✅ classifiedSubtitles[${i}] 업데이트됨 (globalIndex 매칭)`);
                    break;
                }
            }

            // globalIndex로 못 찾으면 시간으로 찾기
            if (!found) {
                // 화면에서 시간 정보 가져오기
                const allSection = document.getElementById('all-subtitles-section');
                if (allSection) {
                    const checkbox = allSection.querySelector(`input[data-subtitle-index="${globalIndex}"]`);
                    if (checkbox) {
                        const timeInfo = checkbox.closest('.subtitle-item')?.querySelector('.subtitle-time')?.textContent;
                        if (timeInfo) {
                            const timeMatch = timeInfo.match(/(\d{2}):(\d{2}):(\d{2}\.\d{3})/);
                            if (timeMatch) {
                                const hours = parseInt(timeMatch[1]);
                                const minutes = parseInt(timeMatch[2]);
                                const seconds = parseFloat(timeMatch[3]);
                                const startTime = hours * 3600 + minutes * 60 + seconds;

                                for (let i = 0; i < this.classifiedSubtitles.length; i++) {
                                    const sub = this.classifiedSubtitles[i];
                                    if (Math.abs(sub.start_time - startTime) < 0.1) {
                                        previousText = sub.text;
                                        this.classifiedSubtitles[i].text = newText;
                                        updatedCount++;
                                        console.log(`✅ classifiedSubtitles[${i}] 업데이트됨 (시간 매칭: ${startTime})`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (previousText === null && this.timeline?.subtitleData?.subtitles?.[globalIndex]) {
            previousText = this.timeline.subtitleData.subtitles[globalIndex].text;
        }
        if (previousText === null) {
            previousText = '';
        }

        // 2. timeline.subtitleData 업데이트
        if (this.timeline?.subtitleData?.subtitles?.[globalIndex]) {
            this.timeline.subtitleData.subtitles[globalIndex].text = newText;
            updatedCount++;
        }

        // 3. timeline.speakerClassifiedSubtitles 업데이트
        if (this.timeline?.speakerClassifiedSubtitles) {
            Object.values(this.timeline.speakerClassifiedSubtitles).forEach(trackSubtitles => {
                if (Array.isArray(trackSubtitles)) {
                    trackSubtitles.forEach(subtitle => {
                        if (subtitle.globalIndex === globalIndex) {
                            subtitle.text = newText;
                            updatedCount++;
                        }
                    });
                }
            });
        }

        console.log(`📊 총 ${updatedCount}개 위치에서 자막 텍스트 업데이트됨`);

        // 자동 저장 (편집 후 즉시 저장)
        this.storeSpeakerClassification('subtitle-edit');

        // 4. 타임라인 블록 툴팁 업데이트
        const blocks = document.querySelectorAll(`[data-index="${globalIndex}"]`);
        blocks.forEach(block => {
            const subtitle = this.timeline.subtitleData.subtitles[globalIndex];
            if (subtitle) {
                const originalTooltip = subtitle.__original_description_text;
                if ((block.dataset.trackType || subtitle.assigned_track || subtitle.track) === 'description'
                    && originalTooltip
                    && originalTooltip.trim()
                    && originalTooltip.trim() !== newText.trim()) {
                    block.classList.add('has-reinterpretation');
                    block.dataset.originalText = originalTooltip;
                    block.dataset.updatedText = newText;
                    block.title = `#${globalIndex + 1}: ${this.formatSubtitleTime(subtitle.start_time)} - ${this.formatSubtitleTime(subtitle.end_time)}\n[변경 전]\n${originalTooltip}\n\n[변경 후]\n${newText}`;
                } else {
                    block.classList.remove('has-reinterpretation');
                    delete block.dataset.originalText;
                    delete block.dataset.updatedText;
                    block.title = `#${globalIndex + 1}: ${this.formatSubtitleTime(subtitle.start_time)} - ${this.formatSubtitleTime(subtitle.end_time)}\n${newText}`;
                }
            }
        });

        console.log(`✅ 자막 #${globalIndex + 1} 데이터 업데이트 완료`);

        this.afterSubtitleTextChange(globalIndex, previousText, newText, options.source || 'manual-edit', options);
    }

    afterSubtitleTextChange(index, previousText, newText, source = 'manual-edit', options = {}) {
        const trimmedPrev = (previousText || '').trim();
        const trimmedNew = (newText || '').trim();
        const timestamp = new Date().toISOString();

        if (!this.reinterpretationHistory) {
            this.reinterpretationHistory = {};
        }

        const forceHistory = Boolean(options.forceHistory);
        const history = this.reinterpretationHistory[index];
        const originalText = options.originalText || history?.original_text || trimmedPrev;

        if (history) {
            if (!history.original_text) {
                history.original_text = originalText;
            }
            if (history.updated_text !== trimmedNew) {
                if (history.updated_text && history.updated_text !== trimmedNew) {
                    if (!Array.isArray(history.changes)) {
                        history.changes = [];
                    }
                    history.changes.push({
                        text: history.updated_text,
                        source: history.source,
                        updated_at: history.updated_at
                    });
                }
                history.updated_text = trimmedNew;
            }
            history.source = source;
            history.updated_at = timestamp;
            history.reverted = history.original_text?.trim() === trimmedNew;
        } else if (forceHistory) {
            this.reinterpretationHistory[index] = {
                original_text: originalText,
                updated_text: trimmedNew,
                source,
                updated_at: timestamp,
                reverted: originalText?.trim() === trimmedNew
            };
        }

        const historyEntry = this.reinterpretationHistory[index];

        if (this.timeline && this.timeline.subtitleData && this.timeline.subtitleData.subtitles && this.timeline.subtitleData.subtitles[index]) {
            const subtitle = this.timeline.subtitleData.subtitles[index];
            subtitle.__original_description_text = historyEntry?.original_text || subtitle.__original_description_text || originalText;
            subtitle.reinterpretation = historyEntry ? { ...historyEntry } : subtitle.reinterpretation;
        }

        if (this.classifiedSubtitles && this.classifiedSubtitles[index]) {
            this.classifiedSubtitles[index].__original_description_text = historyEntry?.original_text || this.classifiedSubtitles[index].__original_description_text || originalText;
            this.classifiedSubtitles[index].reinterpretation = historyEntry ? { ...historyEntry } : this.classifiedSubtitles[index].reinterpretation;
        }

        if (this.timeline && this.timeline.speakerClassifiedSubtitles) {
            Object.keys(this.timeline.speakerClassifiedSubtitles).forEach(trackName => {
                const trackArray = this.timeline.speakerClassifiedSubtitles[trackName];
                if (!Array.isArray(trackArray)) return;
                for (let i = 0; i < trackArray.length; i += 1) {
                    const item = trackArray[i];
                    if (!item) continue;
                    const candidateIndex = this.findSubtitleIndexForData(item);
                    if (candidateIndex === index) {
                        trackArray[i] = {
                            ...item,
                            __original_description_text: historyEntry?.original_text || item.__original_description_text || originalText,
                            reinterpretation: historyEntry ? { ...historyEntry } : item.reinterpretation
                        };
                    }
                }
            });
        }

        if (this.analysisResults && this.analysisResults.reinterpretation) {
            this.updateAnalysisReplacements(index, trimmedPrev, trimmedNew, source, historyEntry ? historyEntry.original_text : originalText);
        }

        if (this.currentReinterpretationEditIndex === index) {
            this.refreshReinterpretationPanel();
        }
    }

    updateAnalysisReplacements(index, previousText, newText, source = 'manual-edit', originalText = null) {
        if (!this.analysisResults) {
            this.analysisResults = {};
        }

        if (!this.analysisResults.reinterpretation) {
            const toneKey = this.normalizeToneKey(this.lastReinterpretationTone || this.getReinterpretationTone());
            this.analysisResults.reinterpretation = {
                script: this.analysisResults.reinterpretation?.script || '',
                outline: this.analysisResults.reinterpretation?.outline || null,
                replacements: [],
                tone: toneKey
            };
        } else if (!this.analysisResults.reinterpretation.tone) {
            this.analysisResults.reinterpretation.tone = this.normalizeToneKey(this.lastReinterpretationTone || this.getReinterpretationTone());
        }

        if (!Array.isArray(this.analysisResults.reinterpretation.replacements)) {
            this.analysisResults.reinterpretation.replacements = [];
        }

        const replacements = this.analysisResults.reinterpretation.replacements;
        const existingIndex = replacements.findIndex(rep => Number(rep.index) === Number(index));
        const baselineOriginal = originalText || previousText;

        if (previousText === newText) {
            if (existingIndex !== -1) {
                replacements.splice(existingIndex, 1);
            }
            return;
        }

        if (existingIndex !== -1) {
            replacements[existingIndex] = {
                ...replacements[existingIndex],
                previous_text: replacements[existingIndex].previous_text || baselineOriginal,
                text: newText,
                source,
                target_length: newText.length,
                original_length: (baselineOriginal || '').length,
                updated_at: new Date().toISOString()
            };
        } else {
            replacements.push({
                index,
                previous_text: baselineOriginal,
                text: newText,
                source,
                original_length: (baselineOriginal || '').length,
                target_length: newText.length,
                updated_at: new Date().toISOString()
            });
        }
    }

    // 번역기 자막 로드
    async loadTranslatorSubtitles() {
        try {
            // 번역기 프로젝트 목록 가져오기
            const response = await fetch('/api/translator/projects');
            if (!response.ok) {
                throw new Error('번역기 프로젝트를 불러올 수 없습니다.');
            }

            const projects = await response.json();

            if (!projects || projects.length === 0) {
                alert('번역기 프로젝트가 없습니다.');
                return;
            }

            // 모달 표시
            this.showTranslatorProjectModal(projects);

        } catch (error) {
            console.error('번역기 자막 로드 실패:', error);
            alert(`번역기 자막 로드 실패: ${error.message}`);
        }
    }

    // 번역기 프로젝트 선택 모달 표시
    showTranslatorProjectModal(projects) {
        const modal = document.getElementById('translator-project-modal');
        const listContainer = document.getElementById('translator-project-list');
        const cancelBtn = document.getElementById('translator-modal-cancel-btn');
        const fileBtn = document.getElementById('translator-modal-file-btn');

        // 프로젝트 목록 생성
        listContainer.innerHTML = projects.map((p, idx) => `
            <div style="padding: 15px; margin: 10px 0; background: #3a3a3a; border-radius: 5px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;"
                 onmouseover="this.style.borderColor='#2196F3'; this.style.background='#404040';"
                 onmouseout="this.style.borderColor='transparent'; this.style.background='#3a3a3a';"
                 onclick="window.app.selectTranslatorProject('${p.id}')">
                <div style="color: #2196F3; font-weight: bold; margin-bottom: 5px;">${idx + 1}. ${p.base_name || p.id}</div>
                <div style="color: #999; font-size: 12px;">상태: ${p.status || '알 수 없음'} | 세그먼트: ${p.segments?.length || 0}개</div>
            </div>
        `).join('');

        // 모달 표시
        modal.style.display = 'flex';

        // 취소 버튼
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };

        // 파일 선택 버튼
        fileBtn.style.display = 'inline-flex';
        fileBtn.textContent = '📁 파일 선택';
        fileBtn.onclick = () => {
            modal.style.display = 'none';

            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const project = JSON.parse(text);
                    await this.loadTranslatorProject(project);
                } catch (error) {
                    console.error('파일 읽기 실패:', error);
                    alert('파일을 읽을 수 없습니다: ' + error.message);
                }
            };

            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        };

        // 모달 배경 클릭 시 닫기
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    // 번역기 프로젝트 선택 처리
    async selectTranslatorProject(projectId) {
        const modal = document.getElementById('translator-project-modal');
        modal.style.display = 'none';

        try {
            // 선택한 프로젝트의 상세 정보 가져오기
            const response = await fetch(
                `/api/translator/projects/${projectId}`
            );

            if (!response.ok) {
                throw new Error('프로젝트 상세 정보를 불러올 수 없습니다.');
            }

            const project = await response.json();
            await this.loadTranslatorProject(project);

        } catch (error) {
            console.error('프로젝트 로드 실패:', error);
            alert(`프로젝트 로드 실패: ${error.message}`);
        }
    }

    // 번역기 음성 로드
    async loadTranslatorAudio() {
        console.log('🎵 번역기 음성 로드 시작');
        try {
            // 번역기 프로젝트 목록 가져오기
            console.log('프로젝트 목록 요청 중...');
            const response = await fetch('/api/translator/projects');
            console.log('프로젝트 목록 응답:', response.status);

            if (!response.ok) {
                throw new Error('번역기 프로젝트를 불러올 수 없습니다.');
            }

            const projects = await response.json();
            console.log('프로젝트 목록:', projects);

            if (!projects || projects.length === 0) {
                alert('번역기 프로젝트가 없습니다.');
                return;
            }

            // 음성 파일 선택을 위한 모달 표시
            console.log('모달 표시 시작');
            this.showTranslatorAudioModal(projects);

        } catch (error) {
            console.error('번역기 음성 로드 실패:', error);
            alert(`번역기 음성 로드 실패: ${error.message}`);
        }
    }

    // 번역기 음성 파일 선택 모달 표시
    showTranslatorAudioModal(projects) {
        console.log('showTranslatorAudioModal 호출됨');
        const modal = document.getElementById('translator-project-modal');
        const listContainer = document.getElementById('translator-project-list');
        const cancelBtn = document.getElementById('translator-modal-cancel-btn');
        const fileBtn = document.getElementById('translator-modal-file-btn');

        console.log('모달 요소:', { modal, listContainer, cancelBtn, fileBtn });

        if (!modal || !listContainer) {
            console.error('모달 요소를 찾을 수 없습니다!');
            alert('모달 요소를 찾을 수 없습니다. 페이지를 새로고침해주세요.');
            return;
        }

        // 프로젝트 목록 생성
        listContainer.innerHTML = projects.map((p, idx) => `
            <div style="padding: 15px; margin: 10px 0; background: #3a3a3a; border-radius: 5px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;"
                 onmouseover="this.style.borderColor='#4CAF50'; this.style.background='#404040';"
                 onmouseout="this.style.borderColor='transparent'; this.style.background='#3a3a3a';"
                 onclick="window.app.selectTranslatorAudioProject('${p.id}')">
                <div style="color: #4CAF50; font-weight: bold; margin-bottom: 5px;">${idx + 1}. ${p.base_name || p.id}</div>
                <div style="color: #999; font-size: 12px;">상태: ${p.status || '알 수 없음'} | 세그먼트: ${p.segments?.length || 0}개</div>
            </div>
        `).join('');

        console.log('프로젝트 목록 HTML 생성 완료');

        // 모달 표시
        modal.style.display = 'flex';
        console.log('모달 display 설정:', modal.style.display);

        // 취소 버튼
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }

        // 파일 선택 버튼 (로컬 오디오 로드 허용)
        if (fileBtn) {
            fileBtn.style.display = 'inline-flex';
            fileBtn.textContent = '📁 오디오 파일 선택';
            fileBtn.onclick = () => {
                modal.style.display = 'none';

                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.style.display = 'none';

                input.onchange = async (event) => {
                    const file = event.target?.files?.[0];
                    if (!file) {
                        return;
                    }

                    try {
                        await this.loadCommentaryAudioFromLocalFile(file);
                    } catch (error) {
                        console.error('로컬 음성 파일 로드 실패:', error);
                        alert(`음성 파일 로드 실패: ${error.message}`);
                    } finally {
                        event.target.value = '';
                    }
                };

                document.body.appendChild(input);
                input.click();
                document.body.removeChild(input);
            };
        }

        // 모달 배경 클릭 시 닫기
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    // 번역기 음성 프로젝트 선택 처리
    async selectTranslatorAudioProject(projectId) {
        const modal = document.getElementById('translator-project-modal');
        modal.style.display = 'none';

        try {
            // 프로젝트 audio 폴더의 파일 목록 가져오기
            const audioFiles = await this.getProjectAudioFiles(projectId);

            if (!audioFiles || audioFiles.length === 0) {
                alert('이 프로젝트에 음성 파일이 없습니다.');
                return;
            }

            // 음성 파일 선택 모달 표시
            this.showAudioFileSelectionModal(projectId, audioFiles);

        } catch (error) {
            console.error('프로젝트 음성 파일 로드 실패:', error);
            alert(`프로젝트 음성 파일 로드 실패: ${error.message}`);
        }
    }

    // 프로젝트 audio 폴더의 파일 목록 가져오기
    async getProjectAudioFiles(projectId) {
        // 서버 API 호출하여 파일 목록 가져오기
        const response = await fetch(`/api/translator/projects/${projectId}/load-generated-tracks`);
        if (!response.ok) {
            throw new Error('음성 파일 목록을 불러올 수 없습니다.');
        }
        const data = await response.json();

        // tracks 배열을 파일 목록 형식으로 변환
        if (data && Array.isArray(data.tracks)) {
            return data.tracks.map(track => ({
                name: track.filename,
                path: track.path,
                size: track.segment_count ? `${track.segment_count}개 세그먼트` : '알 수 없음',
                type: track.type
            }));
        }

        return [];
    }

    // 음성 파일 선택 모달 표시
    showAudioFileSelectionModal(projectId, audioFiles) {
        // 간단한 커스텀 모달 생성
        const modalHtml = `
            <div id="audio-file-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <h3 style="color: #4CAF50; margin-top: 0;">음성 파일 선택</h3>
                    <div id="audio-file-list" style="margin: 20px 0;">
                        ${audioFiles.map((file, idx) => `
                            <div style="padding: 12px; margin: 8px 0; background: #3a3a3a; border-radius: 5px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;"
                                 onmouseover="this.style.borderColor='#4CAF50'; this.style.background='#404040';"
                                 onmouseout="this.style.borderColor='transparent'; this.style.background='#3a3a3a';"
                                 onclick="window.app.selectAudioFile('${projectId}', '${file.name}', '${file.path}')">
                                <div style="color: #fff; font-weight: bold;">${idx + 1}. ${file.name}</div>
                                <div style="color: #999; font-size: 12px;">크기: ${file.size || '알 수 없음'}</div>
                            </div>
                        `).join('')}
                    </div>
                    <button onclick="document.getElementById('audio-file-modal').remove()"
                            style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        취소
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // 음성 파일 선택
    async selectAudioFile(projectId, fileName, filePath) {
        // 모달 닫기
        const modal = document.getElementById('audio-file-modal');
        if (modal) modal.remove();

        try {
            if (this.commentaryAudioObjectUrl) {
                URL.revokeObjectURL(this.commentaryAudioObjectUrl);
                this.commentaryAudioObjectUrl = null;
            }
            this.commentaryAudioLocalFile = null;

            // 파일 URL 생성 (서버의 static 파일 제공 경로)
            const audioUrl = `/api/translator-audio/${projectId}/${fileName}`;

            // 해설 음성 트랙에 로드
            await this.loadCommentaryAudioFromUrl(audioUrl, fileName);

            alert(`음성 파일 로드 완료: ${fileName}`);

        } catch (error) {
            console.error('음성 파일 로드 실패:', error);
            alert(`음성 파일 로드 실패: ${error.message}`);
        }
    }

    // 로컬 오디오 파일 로드
    async loadCommentaryAudioFromLocalFile(file) {
        if (!file) {
            return;
        }

        try {
            if (this.commentaryAudioObjectUrl) {
                URL.revokeObjectURL(this.commentaryAudioObjectUrl);
                this.commentaryAudioObjectUrl = null;
            }

            const objectUrl = URL.createObjectURL(file);
            this.commentaryAudioObjectUrl = objectUrl;
            this.commentaryAudioLocalFile = file;

            await this.loadCommentaryAudioFromUrl(objectUrl, file.name);

            alert(`음성 파일 로드 완료: ${file.name}`);
        } catch (error) {
            if (this.commentaryAudioObjectUrl) {
                URL.revokeObjectURL(this.commentaryAudioObjectUrl);
                this.commentaryAudioObjectUrl = null;
            }
            this.commentaryAudioLocalFile = null;
            console.error('로컬 음성 파일 로드 실패:', error);
            throw error;
        }
    }

    // URL에서 해설 음성 로드
    async loadCommentaryAudioFromUrl(audioUrl, fileName) {
        // 기존 해설 음성 제거
        if (this.commentaryAudio) {
            this.commentaryAudio.pause();
            this.commentaryAudio = null;
        }

        // 새 오디오 객체 생성
        this.commentaryAudio = new Audio(audioUrl);
        this.commentaryAudio.volume = 1.0; // 볼륨 설정
        this.commentaryAudio.preload = 'auto'; // 자동 로드

        this.commentaryAudio.addEventListener('loadedmetadata', () => {
            console.log(`해설 음성 로드 완료: ${fileName}, 길이: ${this.commentaryAudio.duration}초`);
            console.log(`해설 음성 readyState: ${this.commentaryAudio.readyState}, 볼륨: ${this.commentaryAudio.volume}`);

            // 해설 파형 그리기
            this.drawCommentaryWaveform();
        });

        this.commentaryAudio.addEventListener('error', (e) => {
            console.error('해설 음성 로드 에러:', e);
            alert('해설 음성 로드 중 오류가 발생했습니다.');
        });

        // 로드 시작
        this.commentaryAudio.load();
    }

    // 해설 음성 로드
    async loadCommentaryAudio(audioUrl, fileName) {
        // 기존 해설 음성 제거
        if (this.commentaryAudio) {
            this.commentaryAudio.pause();
            this.commentaryAudio = null;
        }

        // 새 오디오 객체 생성
        this.commentaryAudio = new Audio(audioUrl);
        this.commentaryAudio.volume = 1.0; // 볼륨 설정
        this.commentaryAudio.preload = 'auto'; // 자동 로드

        this.commentaryAudio.addEventListener('loadedmetadata', () => {
            console.log(`해설 음성 로드 완료: ${fileName}, 길이: ${this.commentaryAudio.duration}초`);
            console.log(`해설 음성 readyState: ${this.commentaryAudio.readyState}, 볼륨: ${this.commentaryAudio.volume}`);

            // 해설 파형 그리기
            this.drawCommentaryWaveform();
        });

        this.commentaryAudio.addEventListener('error', (e) => {
            console.error('해설 음성 로드 에러:', e);
            alert('해설 음성 로드 중 오류가 발생했습니다.');
        });

        // 로드 시작
        this.commentaryAudio.load();
    }

    // 해설 파형 그리기
    async drawCommentaryWaveform() {
        const canvas = document.getElementById('commentary-waveform');
        if (!canvas || !this.commentaryAudio) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height;

        // 배경 그리기
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, width, height);

        try {
            // Web Audio API를 사용하여 실제 파형 그리기
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const response = await fetch(this.commentaryAudio.src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // 오디오 데이터 추출
            const rawData = audioBuffer.getChannelData(0); // 첫 번째 채널
            const samples = width; // 캔버스 너비만큼 샘플링
            const blockSize = Math.floor(rawData.length / samples);
            const filteredData = [];

            for (let i = 0; i < samples; i++) {
                const blockStart = blockSize * i;
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += Math.abs(rawData[blockStart + j]);
                }
                filteredData.push(sum / blockSize);
            }

            // 정규화 (스케일을 90%로 조정하여 트랙에 잘 맞도록)
            const multiplier = Math.pow(Math.max(...filteredData), -1);
            const normalizedData = filteredData.map(n => n * multiplier * 0.9);

            // 파형 그리기
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 1;
            ctx.beginPath();

            const sliceWidth = width / normalizedData.length;
            let x = 0;

            for (let i = 0; i < normalizedData.length; i++) {
                const v = normalizedData[i];
                const y = (height / 2) * (1 - v);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(width, height / 2);
            ctx.stroke();

            // 하단 미러 파형
            ctx.beginPath();
            x = 0;
            for (let i = 0; i < normalizedData.length; i++) {
                const v = normalizedData[i];
                const y = (height / 2) * (1 + v);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(width, height / 2);
            ctx.stroke();

            audioContext.close();

        } catch (error) {
            console.error('파형 그리기 실패:', error);
            // 에러 시 간단한 표시
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();

            ctx.fillStyle = '#999';
            ctx.font = '12px sans-serif';
            ctx.fillText('파형 로딩 중...', 10, height / 2 - 10);
        }
    }

    // 범용 파형 렌더링 함수
    renderWaveform(canvasId, waveformData) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !waveformData || !Array.isArray(waveformData)) {
            console.warn(`파형 렌더링 실패: canvas=${canvasId}, data=${waveformData ? 'exists' : 'null'}`);
            return;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height;

        // 배경 그리기
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, width, height);

        try {
            // 파형 데이터 정규화 (0.9 스케일로 조정하여 트랙 안에 잘 맞도록)
            const maxValue = Math.max(...waveformData.map(Math.abs));
            const scale = maxValue > 0 ? 0.9 / maxValue : 0.9;
            const normalizedData = waveformData.map(v => v * scale);

            // 파형 그리기
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 1;
            ctx.beginPath();

            const sliceWidth = width / normalizedData.length;
            let x = 0;

            for (let i = 0; i < normalizedData.length; i++) {
                const v = normalizedData[i];
                const y = (height / 2) * (1 - v);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(width, height / 2);
            ctx.stroke();

            // 하단 미러 파형
            ctx.beginPath();
            x = 0;
            for (let i = 0; i < normalizedData.length; i++) {
                const v = normalizedData[i];
                const y = (height / 2) * (1 + v);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(width, height / 2);
            ctx.stroke();

        } catch (error) {
            console.error('파형 렌더링 실패:', error);
            // 에러 시 간단한 표시
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();

            ctx.fillStyle = '#999';
            ctx.font = '12px sans-serif';
            ctx.fillText('파형 로딩 중...', 10, height / 2 - 10);
        }
    }

    // 파일 삭제
    async deleteFile(filePath) {
        try {
            const fileName = filePath.split('/').pop();
            const confirmed = confirm(`파일을 삭제하시겠습니까?\n\n${fileName}\n\n이 작업은 되돌릴 수 없습니다.`);

            if (!confirmed) return;

            const response = await fetch('/api/delete-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '파일 삭제 실패');
            }

            const result = await response.json();

            alert(`파일이 삭제되었습니다: ${fileName}`);

            // 선택 목록에서도 제거
            this.selectedFiles.delete(filePath);

            // 파일 목록 새로고침
            await this.loadFileList();

        } catch (error) {
            console.error('파일 삭제 실패:', error);
            alert(`파일 삭제 실패: ${error.message}`);
        }
    }

    // 파일 숨기기
    hideFile(filePath) {
        this.hiddenFiles.add(filePath);
        // localStorage에 저장
        try {
            window.localStorage.setItem('videoanalysis_hidden_files', JSON.stringify([...this.hiddenFiles]));
        } catch (error) {
            console.warn('Failed to save hidden files:', error);
        }
        this.loadFileList(); // 파일 목록 새로고침
    }

    // 전체 파일 보이기
    showAllFiles() {
        // 현재 숨긴 파일 목록을 백업
        this.lastHiddenFiles = new Set(this.hiddenFiles);

        // 화면에서만 모두 보이게 (localStorage는 유지)
        this.hiddenFiles.clear();
        this.loadFileList(); // 파일 목록 새로고침
    }

    // 이전에 숨겼던 파일들 다시 숨기기
    restoreHiddenFiles() {
        if (this.lastHiddenFiles.size === 0) {
            alert('복원할 숨김 목록이 없습니다. 먼저 파일을 숨긴 후 "전체보기"를 눌러주세요.');
            return;
        }

        // 백업된 숨김 목록 복원
        this.hiddenFiles = new Set(this.lastHiddenFiles);

        // localStorage에 저장
        try {
            window.localStorage.setItem('videoanalysis_hidden_files', JSON.stringify([...this.hiddenFiles]));
        } catch (error) {
            console.warn('Failed to save hidden files:', error);
        }

        this.loadFileList(); // 파일 목록 새로고침
    }

    // 숨긴 파일들 삭제
    async deleteHiddenFiles() {
        if (this.hiddenFiles.size === 0) {
            alert('숨긴 파일이 없습니다.');
            return;
        }

        const fileCount = this.hiddenFiles.size;
        const confirmed = confirm(`숨긴 파일 ${fileCount}개를 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`);

        if (!confirmed) return;

        const filesToDelete = [...this.hiddenFiles];
        let successCount = 0;
        let failCount = 0;

        for (const filePath of filesToDelete) {
            try {
                const response = await fetch('/api/delete-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_path: filePath })
                });

                if (response.ok) {
                    successCount++;
                    this.hiddenFiles.delete(filePath);
                    this.selectedFiles.delete(filePath);
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error('파일 삭제 실패:', filePath, error);
                failCount++;
            }
        }

        // localStorage 업데이트
        try {
            window.localStorage.setItem('videoanalysis_hidden_files', JSON.stringify([...this.hiddenFiles]));
        } catch (error) {
            console.warn('Failed to save hidden files:', error);
        }

        alert(`삭제 완료:\n성공: ${successCount}개\n실패: ${failCount}개`);

        // 파일 목록 새로고침
        await this.loadFileList();
    }

    // 설명자막 음성 묵음처리
    async cutTranslationAudio() {
        try {
            // 설명자막(description/화자3) 구간 확인
            if (!this.timeline || !this.timeline.speakerClassifiedSubtitles) {
                alert('먼저 자막을 로드해주세요.');
                return;
            }

            const descriptionSubtitles = this.timeline.speakerClassifiedSubtitles.description || [];

            if (descriptionSubtitles.length === 0) {
                alert('설명자막(화자3)이 없습니다.');
                return;
            }

            // 음성 파일 확인
            if (!this.audioFilePath) {
                alert('먼저 음성 파일을 로드해주세요.');
                return;
            }

            const confirmed = confirm(
                `설명자막 ${descriptionSubtitles.length}개 구간의 음성을 묵음처리 하시겠습니까?\n\n` +
                `음성 파일: ${this.audioFilePath}\n\n` +
                `처리된 파일은 '_muted' 접미사가 붙어 저장됩니다.\n` +
                `(원본 길이는 유지되며 해당 구간만 무음으로 대체됩니다)`
            );

            if (!confirmed) return;

            // 시간 구간 추출
            const timeRanges = descriptionSubtitles.map(sub => ({
                start: sub.start_time,
                end: sub.end_time
            }));

            console.log('묵음처리할 구간:', timeRanges);

            // API 호출
            const response = await fetch('/api/cut-audio-ranges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio_path: this.audioFilePath,
                    time_ranges: timeRanges
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '음성 묵음처리 실패');
            }

            const result = await response.json();

            const message = `음성 묵음처리 완료!\n\n` +
                `출력 파일: ${result.output_path}\n` +
                `원본 길이: ${result.input_duration?.toFixed(2)}초\n` +
                `결과 길이: ${result.output_duration?.toFixed(2)}초\n` +
                `묵음처리된 구간: ${result.ranges_cut}개`;

            alert(message);

            // 파일 목록 새로고침
            await this.loadFileList();

        } catch (error) {
            console.error('음성 묵음처리 실패:', error);
            alert(`음성 묵음처리 실패: ${error.message}`);
        }
    }

    // 번역기 프로젝트 데이터를 타임라인에 로드
    async loadTranslatorProject(project) {
        try {
            if (!project.segments || project.segments.length === 0) {
                alert('프로젝트에 자막이 없습니다.');
                return;
            }

            // 자막 데이터 변환
            const speaker1Subtitles = []; // 화자1(영상대화): 현재 자막 (한국어)
            const speaker3Subtitles = []; // 화자3(해설자): 번역 일본어 자막

            project.segments.forEach((seg, index) => {
                // 화자1: 현재 자막 (한국어)
                if (seg.source_text) {
                    speaker1Subtitles.push({
                        index: speaker1Subtitles.length,
                        start_time: seg.start,
                        end_time: seg.end,
                        text: seg.source_text,
                        speaker: '화자1'
                    });
                }

                // 화자3: 번역 일본어 자막
                if (seg.translated_text) {
                    speaker3Subtitles.push({
                        index: speaker3Subtitles.length,
                        start_time: seg.start,
                        end_time: seg.end,
                        text: seg.translated_text,
                        speaker: '화자3'
                    });
                }
            });

            // 타임라인 초기화 (필요한 경우)
            if (!this.timeline) {
                this.timeline = {
                    speakerSubtitles: {},
                    speakerClassifiedSubtitles: {},
                    subtitleData: { subtitles: [] }
                };
            }

            // 타임라인 속성 초기화
            if (!this.timeline.speakerSubtitles) {
                this.timeline.speakerSubtitles = {};
            }
            if (!this.timeline.subtitleData) {
                this.timeline.subtitleData = { subtitles: [] };
            }
            if (!this.timeline.subtitleData.subtitles) {
                this.timeline.subtitleData.subtitles = [];
            }

            // 기존 화자별 자막 데이터 업데이트
            this.timeline.speakerSubtitles['화자1'] = speaker1Subtitles;
            this.timeline.speakerSubtitles['화자3'] = speaker3Subtitles;

            // 화자 목록 업데이트
            const speakers = Object.keys(this.timeline.speakerSubtitles);
            console.log('📋 업데이트된 화자 목록:', speakers);

            // 화자별 자막 분류
            // 화자1(한국어) = main, 화자3(일본어) = description(설명자막)
            this.timeline.speakerClassifiedSubtitles = {
                main: speaker1Subtitles,
                translation: [],  // 번역 자막은 비움
                description: speaker3Subtitles  // 화자3을 설명자막으로 매핑
            };

            // 전체 자막 데이터 업데이트
            this.timeline.subtitleData.subtitles = [
                ...speaker1Subtitles,
                ...speaker3Subtitles
            ].sort((a, b) => a.start_time - b.start_time);

            // 타임라인 다시 렌더링
            if (this.renderHybridSubtitleTracks) {
                this.renderHybridSubtitleTracks();
            }

            alert(`번역기 자막을 불러왔습니다!\n화자1: ${speaker1Subtitles.length}개\n화자3: ${speaker3Subtitles.length}개`);

        } catch (error) {
            console.error('프로젝트 로드 실패:', error);
            alert(`프로젝트 로드 실패: ${error.message}`);
        }
    }

    setupVocalSeparation() {
        // 음성 분리용 파일 선택 버튼
        const selectSeparationAudioBtn = document.getElementById('select-separation-audio');
        if (selectSeparationAudioBtn) {
            selectSeparationAudioBtn.addEventListener('click', async () => {
                await this.showAudioFileSelectorForSeparation();
            });
        }

        // 음성 파일 로드 버튼
        const loadVocalsBtn = document.getElementById('load-vocals-file');
        if (loadVocalsBtn) {
            loadVocalsBtn.addEventListener('click', async () => {
                await this.showAudioFileSelectorForVocals();
            });
        }

        // 배경음악 로드 버튼
        const loadAccompanimentBtn = document.getElementById('load-accompaniment-file');
        if (loadAccompanimentBtn) {
            loadAccompanimentBtn.addEventListener('click', async () => {
                await this.showAudioFileSelectorForAccompaniment();
            });
        }

        // 폴더 열기 버튼들
        const openVocalsFolderBtn = document.getElementById('open-vocals-folder');
        if (openVocalsFolderBtn) {
            openVocalsFolderBtn.addEventListener('click', () => {
                const vocalsPath = document.getElementById('vocals-filename')?.textContent;
                if (vocalsPath) {
                    const folderPath = vocalsPath.substring(0, vocalsPath.lastIndexOf('/'));
                    this.showInfo(`폴더 경로: ${folderPath}`);
                    // 실제 파일 탐색기에서 폴더 열기는 서버 측 구현 필요
                }
            });
        }

        const openAccompanimentFolderBtn = document.getElementById('open-accompaniment-folder');
        if (openAccompanimentFolderBtn) {
            openAccompanimentFolderBtn.addEventListener('click', () => {
                const accompanimentPath = document.getElementById('accompaniment-filename')?.textContent;
                if (accompanimentPath) {
                    const folderPath = accompanimentPath.substring(0, accompanimentPath.lastIndexOf('/'));
                    this.showInfo(`폴더 경로: ${folderPath}`);
                    // 실제 파일 탐색기에서 폴더 열기는 서버 측 구현 필요
                }
            });
        }
    }

    async showAudioFileSelectorForTrack(fileType) {
        try {
            // 파일 목록 가져오기
            const response = await fetch('/api/files?filter_type=all');
            if (!response.ok) {
                throw new Error('파일 목록을 불러올 수 없습니다');
            }

            const data = await response.json();

            // 음성 파일만 필터링 (wav, mp3, m4a, ogg)
            const audioFiles = data.files.filter(file => {
                const ext = file.name.toLowerCase();
                return ext.endsWith('.wav') || ext.endsWith('.mp3') ||
                       ext.endsWith('.m4a') || ext.endsWith('.ogg');
            });

            if (audioFiles.length === 0) {
                this.showError('음성 파일이 없습니다');
                return;
            }

            // 파일 선택 모달 생성
            const modal = document.createElement('div');
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; overflow: auto;';

            const typeLabel = fileType === 'vocals' ? '🎤 음성' : '🎹 배경음악';

            modal.innerHTML = `
                <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <h3 style="color: #fff; margin-bottom: 20px;">${typeLabel} 파일 선택</h3>
                    <p style="color: #b0c4d0; margin-bottom: 20px; font-size: 14px;">로드할 음성 파일을 선택하세요</p>

                    <div style="margin-bottom: 15px;">
                        <input type="text" id="audio-file-search" placeholder="🔍 파일명 검색..."
                               style="width: 100%; padding: 10px; background: #1a1a1a; color: #fff; border: 1px solid #444; border-radius: 5px;">
                    </div>

                    <div id="audio-file-list" style="max-height: 400px; overflow-y: auto;">
                        ${audioFiles.map((file, idx) => `
                            <div class="audio-file-item" data-file-path="${file.path}"
                                 style="padding: 12px; margin: 8px 0; background: #3a3a3a; border-radius: 5px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;">
                                <div style="color: #4CAF50; font-weight: bold; margin-bottom: 3px;">${file.name}</div>
                                <div style="color: #999; font-size: 11px;">
                                    크기: ${file.size} | 경로: ${file.path.substring(0, 50)}${file.path.length > 50 ? '...' : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                        <button class="cancel-btn" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer;">취소</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // 검색 기능
            const searchInput = modal.querySelector('#audio-file-search');
            const fileItems = modal.querySelectorAll('.audio-file-item');

            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                fileItems.forEach(item => {
                    const fileName = item.querySelector('div').textContent.toLowerCase();
                    item.style.display = fileName.includes(searchTerm) ? 'block' : 'none';
                });
            });

            // 파일 항목 hover 효과
            fileItems.forEach(item => {
                item.addEventListener('mouseover', () => {
                    item.style.borderColor = '#4CAF50';
                    item.style.background = '#404040';
                });
                item.addEventListener('mouseout', () => {
                    item.style.borderColor = 'transparent';
                    item.style.background = '#3a3a3a';
                });
                item.addEventListener('click', () => {
                    const filePath = item.getAttribute('data-file-path');
                    modal.remove();
                    this.showTrackSelector(filePath, fileType);
                });
            });

            // 취소 버튼
            modal.querySelector('.cancel-btn').addEventListener('click', () => {
                modal.remove();
            });

            // 배경 클릭 시 닫기
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });

        } catch (error) {
            console.error('파일 목록 로드 실패:', error);
            this.showError(`파일 목록 로드 실패: ${error.message}`);
        }
    }

    async showAudioFileSelectorForSeparation() {
        try {
            const response = await fetch('/api/files?filter_type=all');
            if (!response.ok) {
                throw new Error('파일 목록을 불러올 수 없습니다');
            }

            const data = await response.json();
            const audioFiles = data.files.filter(file => {
                const ext = file.name.toLowerCase();
                return ext.endsWith('.wav') || ext.endsWith('.mp3') ||
                       ext.endsWith('.m4a') || ext.endsWith('.ogg');
            });

            if (audioFiles.length === 0) {
                this.showError('음성 파일이 없습니다');
                return;
            }

            this.showSeparationFileListModal(audioFiles);
        } catch (error) {
            console.error('파일 목록 로드 실패:', error);
            this.showError(`파일 목록 로드 실패: ${error.message}`);
        }
    }

    showSeparationFileListModal(audioFiles) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; overflow: auto;';

        modal.innerHTML = `
            <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <h3 style="color: #fff; margin-bottom: 20px;">🎵 음성 분리할 파일 선택</h3>
                <p style="color: #b0c4d0; margin-bottom: 20px; font-size: 14px;">분리할 음성 파일을 선택하세요</p>

                <div style="margin-bottom: 15px;">
                    <input type="text" id="separation-file-search" placeholder="🔍 파일명 검색..."
                           style="width: 100%; padding: 10px; background: #1a1a1a; color: #fff; border: 1px solid #444; border-radius: 5px;">
                </div>

                <div id="separation-file-list" style="max-height: 400px; overflow-y: auto;">
                    ${audioFiles.map((file, idx) => `
                        <div class="separation-file-item" data-file-path="${file.path}"
                             style="padding: 12px; margin: 8px 0; background: #3a3a3a; border-radius: 5px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;">
                            <div style="color: #4CAF50; font-weight: bold; margin-bottom: 3px;">${file.name}</div>
                            <div style="color: #999; font-size: 11px;">
                                크기: ${file.size} | 경로: ${file.path.substring(0, 50)}${file.path.length > 50 ? '...' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button class="cancel-btn" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer;">취소</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 검색 기능
        const searchInput = modal.querySelector('#separation-file-search');
        const fileItems = modal.querySelectorAll('.separation-file-item');

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            fileItems.forEach(item => {
                const fileName = item.querySelector('div').textContent.toLowerCase();
                item.style.display = fileName.includes(searchTerm) ? 'block' : 'none';
            });
        });

        // 파일 항목 hover 효과 및 클릭 이벤트
        fileItems.forEach(item => {
            item.addEventListener('mouseover', () => {
                item.style.borderColor = '#4CAF50';
                item.style.background = '#404040';
            });
            item.addEventListener('mouseout', () => {
                item.style.borderColor = 'transparent';
                item.style.background = '#3a3a3a';
            });
            item.addEventListener('click', () => {
                const filePath = item.getAttribute('data-file-path');
                const fileName = filePath.split('/').pop();

                // 선택된 파일 정보 저장 및 표시
                document.getElementById('separation-audio-path').value = filePath;
                document.getElementById('separation-audio-name').textContent = fileName;
                document.getElementById('selected-separation-audio').style.display = 'block';

                modal.remove();
                this.showSuccess(`${fileName} 파일이 선택되었습니다`);
            });
        });

        // 취소 버튼
        modal.querySelector('.cancel-btn').addEventListener('click', () => {
            modal.remove();
        });

        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async showAudioFileSelectorForVocals() {
        try {
            const response = await fetch('/api/files?filter_type=all');
            if (!response.ok) {
                throw new Error('파일 목록을 불러올 수 없습니다');
            }

            const data = await response.json();
            const audioFiles = data.files.filter(file => {
                const ext = file.name.toLowerCase();
                return ext.endsWith('.wav') || ext.endsWith('.mp3') ||
                       ext.endsWith('.m4a') || ext.endsWith('.ogg');
            });

            if (audioFiles.length === 0) {
                this.showError('음성 파일이 없습니다');
                return;
            }

            this.showFileListModal(audioFiles, '🎤 음성 파일 선택', 'commentary');
        } catch (error) {
            console.error('파일 목록 로드 실패:', error);
            this.showError(`파일 목록 로드 실패: ${error.message}`);
        }
    }

    async showAudioFileSelectorForAccompaniment() {
        try {
            const response = await fetch('/api/files?filter_type=all');
            if (!response.ok) {
                throw new Error('파일 목록을 불러올 수 없습니다');
            }

            const data = await response.json();
            const audioFiles = data.files.filter(file => {
                const ext = file.name.toLowerCase();
                return ext.endsWith('.wav') || ext.endsWith('.mp3') ||
                       ext.endsWith('.m4a') || ext.endsWith('.ogg');
            });

            if (audioFiles.length === 0) {
                this.showError('음성 파일이 없습니다');
                return;
            }

            this.showFileListModal(audioFiles, '🎹 배경음악 파일 선택', 'bgm');
        } catch (error) {
            console.error('파일 목록 로드 실패:', error);
            this.showError(`파일 목록 로드 실패: ${error.message}`);
        }
    }

    showFileListModal(audioFiles, title, targetTrack) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; overflow: auto;';

        modal.innerHTML = `
            <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <h3 style="color: #fff; margin-bottom: 20px;">${title}</h3>
                <p style="color: #b0c4d0; margin-bottom: 20px; font-size: 14px;">로드할 음성 파일을 선택하세요</p>

                <div style="margin-bottom: 15px;">
                    <input type="text" id="audio-file-search" placeholder="🔍 파일명 검색..."
                           style="width: 100%; padding: 10px; background: #1a1a1a; color: #fff; border: 1px solid #444; border-radius: 5px;">
                </div>

                <div id="audio-file-list" style="max-height: 400px; overflow-y: auto;">
                    ${audioFiles.map((file, idx) => `
                        <div class="audio-file-item" data-file-path="${file.path}"
                             style="padding: 12px; margin: 8px 0; background: #3a3a3a; border-radius: 5px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;">
                            <div style="color: #4CAF50; font-weight: bold; margin-bottom: 3px;">${file.name}</div>
                            <div style="color: #999; font-size: 11px;">
                                크기: ${file.size} | 경로: ${file.path.substring(0, 50)}${file.path.length > 50 ? '...' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button class="cancel-btn" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer;">취소</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 검색 기능
        const searchInput = modal.querySelector('#audio-file-search');
        const fileItems = modal.querySelectorAll('.audio-file-item');

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            fileItems.forEach(item => {
                const fileName = item.querySelector('div').textContent.toLowerCase();
                item.style.display = fileName.includes(searchTerm) ? 'block' : 'none';
            });
        });

        // 파일 항목 hover 효과 및 클릭 이벤트
        fileItems.forEach(item => {
            item.addEventListener('mouseover', () => {
                item.style.borderColor = '#4CAF50';
                item.style.background = '#404040';
            });
            item.addEventListener('mouseout', () => {
                item.style.borderColor = 'transparent';
                item.style.background = '#3a3a3a';
            });
            item.addEventListener('click', () => {
                const filePath = item.getAttribute('data-file-path');
                modal.remove();
                this.loadFileToTrack(filePath, targetTrack);
            });
        });

        // 취소 버튼
        modal.querySelector('.cancel-btn').addEventListener('click', () => {
            modal.remove();
        });

        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    showTrackSelector(filePath, fileType) {
        // 트랙 선택 모달 생성
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;';

        const fileName = filePath.split('/').pop();
        const typeLabel = fileType === 'vocals' ? '🎤 음성' : '🎹 배경음악';

        modal.innerHTML = `
            <div style="background: #2a2a2a; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%;">
                <h3 style="color: #fff; margin-bottom: 20px;">${typeLabel} 파일을 어디에 로드하시겠습니까?</h3>
                <p style="color: #b0c4d0; margin-bottom: 20px; font-size: 14px;">파일: ${fileName}</p>

                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                    <button class="track-option" data-track="video" style="padding: 15px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; text-align: left;">
                        📹 메인 영상 트랙
                    </button>
                    <button class="track-option" data-track="audio" style="padding: 15px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; text-align: left;">
                        🎵 메인 음성 트랙
                    </button>
                    <button class="track-option" data-track="commentary" style="padding: 15px; background: #FF9800; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; text-align: left;">
                        🎤 해설 음성 트랙
                    </button>
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="cancel-btn" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer;">취소</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 트랙 선택 버튼 이벤트
        modal.querySelectorAll('.track-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const trackType = btn.getAttribute('data-track');
                this.loadFileToTrack(filePath, trackType);
                modal.remove();
            });
        });

        // 취소 버튼
        modal.querySelector('.cancel-btn').addEventListener('click', () => {
            modal.remove();
        });

        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async loadFileToTrack(filePath, trackType, options = {}) {
        const { skipWaveformAnalysis = false } = options;

        try {
            let waveformData = null;

            // 파형 데이터 분석 (스킵 옵션이 없을 때만)
            if (!skipWaveformAnalysis) {
                try {
                    const response = await fetch('/api/analyze-waveform', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file_path: filePath })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.warn(`파형 분석 실패 (${filePath}):`, errorText);
                        // 파형 분석 실패해도 계속 진행
                    } else {
                        waveformData = await response.json();
                    }
                } catch (waveformError) {
                    console.warn(`파형 분석 중 오류 (${filePath}):`, waveformError);
                    // 파형 분석 실패해도 계속 진행
                }
            }

            // 트랙에 로드
            if (trackType === 'video') {
                this.loadedVideoPath = filePath;
                const videoElement = document.getElementById('timeline-video');
                if (videoElement) {
                    videoElement.src = `/api/file-content?path=${encodeURIComponent(filePath)}`;
                }

                // 음소거 버튼 초기 상태 설정
                const videoMuteBtn = document.getElementById('video-mute-btn');
                const videoPlayer = document.getElementById('video-player');
                if (videoMuteBtn && videoPlayer) {
                    videoMuteBtn.textContent = videoPlayer.muted ? '🔇' : '🔊';
                    videoMuteBtn.title = videoPlayer.muted ? '영상 음소거 해제' : '영상 음소거';
                }

                this.showSuccess(`${filePath.split('/').pop()} 파일이 영상 트랙에 로드되었습니다`);
            } else if (trackType === 'audio') {
                this.loadedAudioPath = filePath;
                if (waveformData && waveformData.waveform) {
                    this.audioWaveformData = waveformData.waveform;
                    this.renderWaveform('audio-waveform', waveformData.waveform);
                }
                this.showSuccess(`${filePath.split('/').pop()} 파일이 음성 트랙에 로드되었습니다`);
            } else if (trackType === 'commentary') {
                this.loadedCommentaryPath = filePath;
                if (waveformData && waveformData.waveform) {
                    this.commentaryWaveformData = waveformData.waveform;
                    this.renderWaveform('commentary-waveform', waveformData.waveform);
                }
                this.showSuccess(`${filePath.split('/').pop()} 파일이 해설 음성 트랙에 로드되었습니다`);
            }

            // 타임라인 업데이트
            if (this.timeline && waveformData && waveformData.duration) {
                this.timeline.duration = Math.max(this.timeline.duration || 0, waveformData.duration);
                this.updateTimelineDisplay();
            }

        } catch (error) {
            console.error('파일 로드 실패:', error);
            this.showError(`파일 로드 실패: ${error.message}`);
        }
    }
}

// 앱 초기화
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new VideoAnalysisApp();
    window.app = app; // 전역으로 노출

    // 분석 대상 저장 버튼 (다른 이름으로 저장)
    const saveBtn = document.getElementById('save-analysis-target');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            try {
                if (app.selectedFiles.size === 0) {
                    alert('선택된 파일이 없습니다.');
                    return;
                }

                // 이름 입력받기
                const saveName = prompt('저장할 이름을 입력하세요:', `분석세트_${new Date().toLocaleDateString()}`);
                if (!saveName || saveName.trim() === '') {
                    return; // 취소
                }

                // 기존 저장 목록 가져오기
                let savedTargets = {};
                const existingData = localStorage.getItem('analysisTargets');
                if (existingData) {
                    savedTargets = JSON.parse(existingData);
                }

                // 새 데이터 저장 (순서 포함)
                savedTargets[saveName.trim()] = {
                    files: Array.from(app.selectedFiles),
                    filesOrder: app.selectedFilesOrder, // 순서 정보 저장
                    timestamp: new Date().toISOString(),
                    fileCount: app.selectedFiles.size
                };

                localStorage.setItem('analysisTargets', JSON.stringify(savedTargets));

                // 사용자 피드백
                const originalText = saveBtn.textContent;
                saveBtn.textContent = '✅ 저장됨';
                saveBtn.style.backgroundColor = '#4CAF50';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.style.backgroundColor = '';
                }, 2000);

                console.log('분석 대상 저장 완료:', saveName, '-', app.selectedFiles.size, '개 파일');
            } catch (error) {
                console.error('저장 실패:', error);
                alert('저장 중 오류가 발생했습니다: ' + error.message);
            }
        });
    }

    // 분석 대상 불러오기 버튼 (목록에서 선택)
    const loadBtn = document.getElementById('load-analysis-target');
    const loadModal = document.getElementById('analysis-target-load-modal');
    const loadModalCancelBtn = document.getElementById('load-modal-cancel-btn');
    const savedTargetsList = document.getElementById('saved-targets-list');

    if (loadBtn && loadModal && loadModalCancelBtn && savedTargetsList) {
        loadBtn.addEventListener('click', () => {
            try {
                // 저장된 목록 가져오기
                const existingData = localStorage.getItem('analysisTargets');
                if (!existingData) {
                    alert('저장된 분석 대상이 없습니다.');
                    return;
                }

                const savedTargets = JSON.parse(existingData);
                const targetNames = Object.keys(savedTargets);

                if (targetNames.length === 0) {
                    alert('저장된 분석 대상이 없습니다.');
                    return;
                }

                // 목록 렌더링
                savedTargetsList.innerHTML = targetNames.map(name => {
                    const target = savedTargets[name];
                    const date = new Date(target.timestamp).toLocaleString('ko-KR');
                    return `
                        <div style="background: #333; padding: 15px; margin-bottom: 10px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <div style="color: #fff; font-weight: bold; margin-bottom: 5px;">${name}</div>
                                <div style="color: #aaa; font-size: 0.9em;">파일 ${target.fileCount}개 · ${date}</div>
                            </div>
                            <div style="display: flex; gap: 5px;">
                                <button class="load-target-btn" data-name="${name}" style="padding: 8px 15px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer;">📂 불러오기</button>
                                <button class="delete-target-btn" data-name="${name}" style="padding: 8px 15px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">🗑️ 삭제</button>
                            </div>
                        </div>
                    `;
                }).join('');

                // 불러오기 버튼 이벤트
                savedTargetsList.querySelectorAll('.load-target-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const name = e.target.dataset.name;
                        const target = savedTargets[name];

                        if (target && target.files && Array.isArray(target.files)) {
                            // 선택된 파일 복원
                            app.selectedFiles.clear();
                            target.files.forEach(filePath => app.selectedFiles.add(filePath));

                            // 순서 정보 복원 (있으면 사용, 없으면 files 순서 사용)
                            app.selectedFilesOrder = target.filesOrder || target.files;

                            // UI 업데이트
                            app.updateSelectedFilesList();

                            // 모달 닫기
                            loadModal.style.display = 'none';

                            // 피드백
                            const originalText = loadBtn.textContent;
                            loadBtn.textContent = `✅ ${target.files.length}개 불러옴`;
                            loadBtn.style.backgroundColor = '#2196F3';
                            setTimeout(() => {
                                loadBtn.textContent = originalText;
                                loadBtn.style.backgroundColor = '';
                            }, 2000);

                            console.log('분석 대상 불러오기 완료:', name, '-', target.files.length, '개 파일');
                        }
                    });
                });

                // 삭제 버튼 이벤트
                savedTargetsList.querySelectorAll('.delete-target-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const name = e.target.dataset.name;
                        if (confirm(`"${name}"을(를) 삭제하시겠습니까?`)) {
                            delete savedTargets[name];
                            localStorage.setItem('analysisTargets', JSON.stringify(savedTargets));

                            // 목록 다시 렌더링
                            const remainingNames = Object.keys(savedTargets);
                            if (remainingNames.length === 0) {
                                loadModal.style.display = 'none';
                                alert('모든 저장 항목이 삭제되었습니다.');
                            } else {
                                // 버튼 클릭 재발동
                                loadBtn.click();
                            }

                            console.log('분석 대상 삭제:', name);
                        }
                    });
                });

                // 모달 표시
                loadModal.style.display = 'flex';

            } catch (error) {
                console.error('불러오기 실패:', error);
                alert('불러오기 중 오류가 발생했습니다: ' + error.message);
            }
        });

        // 모달 닫기
        loadModalCancelBtn.addEventListener('click', () => {
            loadModal.style.display = 'none';
        });

        // 배경 클릭으로 모달 닫기
        loadModal.addEventListener('click', (e) => {
            if (e.target === loadModal) {
                loadModal.style.display = 'none';
            }
        });
    }
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
