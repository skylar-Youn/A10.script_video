/**
 * Timeline manager handling hybrid subtitle track rendering and waveform sync.
 */
(function registerTimelineManager(global) {
    if (!global) {
        throw new Error('VideoAnalysisTimelineManager requires window context');
    }

    class VideoAnalysisTimelineManager {
        constructor(appInstance) {
            this.app = appInstance;
            this.realtimeSyncInterval = null;
        }

        renderTracks() {
            const app = this.app;
            console.log('🎬 하이브리드 자막 트랙 렌더링 시작');

            if (!app.timeline || !app.timeline.subtitleData) {
                console.error('❌ timeline.subtitleData가 없습니다');
                return;
            }

            const subtitles = app.timeline.subtitleData.subtitles || [];
            console.log(`📝 총 자막 수: ${subtitles.length}`);

            if (subtitles.length === 0) {
                console.error('❌ 자막 데이터가 비어있습니다');
                return;
            }

            const classified = app.timeline.speakerClassifiedSubtitles
                ? app.timeline.speakerClassifiedSubtitles
                : app.classifySubtitlesByType(subtitles);

            ['main', 'translation', 'description'].forEach(trackType => {
                if (app.trackStates[trackType].visible) {
                    this.renderTrack(trackType, classified[trackType]);
                } else {
                    this.clearTrack(trackType);
                }
            });

            setTimeout(() => {
                this.updateSubtitleAppearanceByAudio();
            }, 500);

            console.log('✅ 하이브리드 자막 트랙 렌더링 완료');
        }

        renderTrack(trackType, subtitles) {
            const app = this.app;
            console.log(`🎯 ${trackType} 트랙 렌더링: ${subtitles.length}개 자막`);

            this.updateTrackCount(trackType, subtitles.length);

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

            trackContent.innerHTML = '';

            if (subtitles.length === 0) {
                console.log(`📝 ${trackType} 트랙에 자막이 없습니다`);
                return;
            }

            const layers = this.calculateLayers(subtitles);

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

                const globalIndexGuess = app.findSubtitleIndexForData(subtitle);
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

                const historyEntry = app.reinterpretationHistory ? app.reinterpretationHistory[resolvedIndex] : null;
                if (historyEntry && trackType === 'description') {
                    block.classList.add('has-reinterpretation');
                    block.dataset.originalText = historyEntry.original_text || '';
                    block.dataset.updatedText = subtitle.text || '';
                }

                const startTime = Math.max(0, subtitle.start_time);
                const endTime = Math.max(0, subtitle.end_time);
                const totalDuration = Math.max(app.timeline.duration, 60);
                const duration = endTime - startTime;

                const startPercent = (startTime / totalDuration) * 100;
                const widthPercent = (duration / totalDuration) * 100;

                const layer = Math.min(layers[index] || 0, 2);
                const layerHeight = 32;
                const topPosition = 5 + (layer * layerHeight);

                block.style.left = `${startPercent}%`;
                block.style.width = `${Math.max(widthPercent, 3)}%`;
                block.style.top = `${topPosition}px`;
                block.style.height = '30px';
                block.dataset.layer = layer;

                block.style.background = `linear-gradient(135deg, ${theme.bgColor}, ${theme.bgColor.replace('0.9', '0.7')})`;
                block.style.border = `1px solid ${theme.bgColor.replace('0.9', '1')}`;

                block.title = `${theme.name} #${subtitle.originalIndex + 1 || index + 1} (Layer ${layer}): ${app.formatSubtitleTime(startTime)} - ${app.formatSubtitleTime(endTime)}\n${subtitle.text}`;

                const numberElement = document.createElement('div');
                numberElement.className = 'subtitle-number hybrid-number';
                numberElement.textContent = `${subtitle.originalIndex + 1 || index + 1}`;
                Object.assign(numberElement.style, {
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                    backgroundColor: theme.numberBg,
                    color: 'white',
                    fontWeight: '900',
                    fontSize: '9px',
                    padding: '1px 3px',
                    borderRadius: '3px',
                    position: 'absolute',
                    left: '2px',
                    top: '2px',
                    zIndex: '25',
                    minWidth: '15px',
                    textAlign: 'center',
                    lineHeight: '1.2'
                });

                const textElement = document.createElement('div');
                textElement.className = 'subtitle-text-display';

                const blockWidthPx = (widthPercent / 100) * (trackContent.offsetWidth || 1000);
                let displayText = subtitle.text;
                let fontSize = '8px';
                if (blockWidthPx < 40) {
                    displayText = '';
                } else if (blockWidthPx < 80) {
                    displayText = subtitle.text.substring(0, 8) + (subtitle.text.length > 8 ? '…' : '');
                    fontSize = '7px';
                } else if (blockWidthPx < 120) {
                    displayText = subtitle.text.substring(0, 15) + (subtitle.text.length > 15 ? '…' : '');
                    fontSize = '8px';
                } else if (blockWidthPx < 200) {
                    displayText = subtitle.text.substring(0, 25) + (subtitle.text.length > 25 ? '…' : '');
                    fontSize = '9px';
                } else {
                    displayText = subtitle.text.substring(0, 40) + (subtitle.text.length > 40 ? '…' : '');
                    fontSize = '10px';
                }

                textElement.textContent = displayText;
                Object.assign(textElement.style, {
                    position: 'absolute',
                    left: '20px',
                    top: '2px',
                    right: '2px',
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                });

                block.appendChild(numberElement);
                block.appendChild(textElement);

                this.addSubtitleBlockEvents(block, subtitle, resolvedIndex, theme);
                trackContent.appendChild(block);
            });
        }

        addSubtitleBlockEvents(block, subtitle, index, theme) {
            const app = this.app;
            block.addEventListener('click', (event) => {
                event.stopPropagation();
                document.querySelectorAll('.hybrid-subtitle.active').forEach(activeBlock => activeBlock.classList.remove('active'));
                block.classList.add('active');
                app.seekToTime(subtitle.start_time);
                app.showSubtitleEditInfo(subtitle, index);
                const datasetTrackType = block.dataset.trackType || subtitle.assigned_track || subtitle.track || 'main';
                if (app.reinterpretationManager) {
                    app.reinterpretationManager.updateComparison(index, datasetTrackType);
                }
                this.highlightWaveformForSubtitle(subtitle);
                this.showAudioAnalysisInfo(subtitle, block);
            });

            block.addEventListener('dblclick', (event) => {
                event.stopPropagation();
                if (!app.trackStates[block.dataset.trackType]?.locked) {
                    app.editSubtitleSegment(index);
                }
            });

            block.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                app.showSubtitleContextMenu(subtitle, index);
            });

            block.addEventListener('mouseenter', () => {
                block.classList.add('hover');
                this.showWaveformConnection(subtitle);
            });

            block.addEventListener('mouseleave', () => {
                block.classList.remove('hover');
                this.hideWaveformConnection();
            });

            this.attachDragHandlers(block, subtitle, index, theme);
        }

        attachDragHandlers(block, subtitle, subtitleIndex, theme) {
            const app = this.app;
            const numberElement = block.querySelector('.subtitle-number');
            if (numberElement) {
                numberElement.style.cursor = 'grab';
            }

            let dragStartX = 0;
            let dragStartY = 0;
            let dragStartTime = 0;
            let originalTop = 0;
            let isDragging = false;

            const onMouseDown = (event) => {
                if (app.trackStates[block.dataset.trackType]?.locked) {
                    console.log('🔒 잠금된 트랙은 수정할 수 없습니다');
                    return;
                }

                event.preventDefault();
                isDragging = true;
                dragStartX = event.clientX;
                dragStartY = event.clientY;
                dragStartTime = subtitle.start_time;
                originalTop = parseFloat(block.style.top);

                block.classList.add('dragging');
                this.showDragFeedback(block, true);

                const toggleBtn = document.querySelector(`.track-toggle[data-track="${block.dataset.trackType}"]`);
                if (toggleBtn) {
                    toggleBtn.setAttribute('disabled', 'disabled');
                }

                const track = document.getElementById(`${block.dataset.trackType}-subtitle-track`);
                if (track) {
                    track.classList.add('drag-active');
                }

                if (numberElement) {
                    numberElement.style.cursor = 'grabbing';
                }

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            const onMouseMove = (event) => {
                if (!isDragging) return;

                const deltaX = event.clientX - dragStartX;
                const deltaY = event.clientY - dragStartY;

                const track = document.getElementById(`${block.dataset.trackType}-subtitle-track`);
                const trackContent = track ? track.querySelector('.track-content') : null;
                if (!trackContent || !app.timeline) return;

                const trackWidth = trackContent.offsetWidth;
                const totalDuration = Math.max(app.timeline.duration, 60);

                const timePerPixel = totalDuration / trackWidth;
                const deltaTime = deltaX * timePerPixel;
                let newStartTime = Math.max(0, dragStartTime + deltaTime);

                newStartTime = this.snapToNearbySubtitles(newStartTime, subtitleIndex);

                const newLeft = (newStartTime / totalDuration) * 100;

                const layerHeight = 32;
                const newLayer = Math.max(0, Math.min(2, Math.round((originalTop + deltaY - 5) / layerHeight)));
                const newTop = 5 + (newLayer * layerHeight);

                block.style.left = `${newLeft}%`;
                block.style.top = `${newTop}px`;

                this.updateBlockLayerColor(block, newLayer);
                this.updateDragTimeDisplay(block, newStartTime, newLayer);
                this.showDragGuidelines(newStartTime);
                this.checkCollisionWarning(newStartTime, subtitleIndex, block);
            };

            const onMouseUp = () => {
                if (!isDragging) return;

                isDragging = false;

                if (numberElement) {
                    numberElement.style.cursor = 'grab';
                }

                block.classList.remove('dragging');
                this.showDragFeedback(block, false);
                this.hideDragGuidelines();

                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                const finalTime = this.calculateTimeFromPosition(block);
                this.updateSubtitleTime(subtitleIndex, finalTime);

                const toggleBtn = document.querySelector(`.track-toggle[data-track="${block.dataset.trackType}"]`);
                if (toggleBtn) {
                    toggleBtn.removeAttribute('disabled');
                }

                const track = document.getElementById(`${block.dataset.trackType}-subtitle-track`);
                if (track) {
                    track.classList.remove('drag-active');
                }

                console.log(`🖱️ 자막 #${subtitleIndex + 1} 드래그 완료: ${app.formatSubtitleTime(finalTime)}`);
            };

            block.addEventListener('mousedown', onMouseDown);
        }

        clearTrack(trackType) {
            const track = document.getElementById(`${trackType}-subtitle-track`);
            if (track) {
                const trackContent = track.querySelector('.track-content');
                if (trackContent) {
                    trackContent.innerHTML = '';
                }
            }
            this.updateTrackCount(trackType, 0);
        }

        updateTrackCount(trackType, count) {
            const track = document.getElementById(`${trackType}-subtitle-track`);
            if (!track) return;
            const trackTitle = track.querySelector('.track-title');
            if (!trackTitle) return;
            trackTitle.textContent = trackTitle.textContent.replace(/\s*\(\d+\)$/, '');
            if (count > 0) {
                trackTitle.textContent += ` (${count})`;
            }
        }

        calculateLayers(subtitles) {
            const layers = [];
            const activeLayers = [];

            subtitles
                .map((subtitle, index) => ({ ...subtitle, _originalIndex: index }))
                .sort((a, b) => (a.start_time || 0) - (b.start_time || 0))
                .forEach(subtitle => {
                    const startTime = subtitle.start_time || 0;
                    const endTime = subtitle.end_time || startTime + 1;

                    activeLayers.forEach((item, idx) => {
                        if ((item.end_time || 0) <= startTime) {
                            activeLayers[idx] = null;
                        }
                    });

                    let assignedLayer = activeLayers.findIndex(item => item === null);
                    if (assignedLayer === -1) {
                        assignedLayer = activeLayers.length;
                        activeLayers.push(subtitle);
                    } else {
                        activeLayers[assignedLayer] = subtitle;
                    }

                    layers[subtitle._originalIndex] = assignedLayer;
                });

            return layers;
        }

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

            const timeText = this.app.formatSubtitleTime(newStartTime);
            const layerText = newLayer !== null ? ` [레이어 ${newLayer}]` : '';
            timeDisplay.textContent = `${timeText}${layerText}`;
        }

        updateBlockLayerColor(block, newLayer) {
            const layerColors = [
                'rgba(0, 123, 255, 0.9)',
                'rgba(40, 167, 69, 0.9)',
                'rgba(255, 193, 7, 0.9)'
            ];

            const layerColor = layerColors[newLayer % layerColors.length];
            block.style.background = `linear-gradient(135deg, ${layerColor}, ${layerColor.replace('0.9', '0.7')})`;
            block.dataset.layer = newLayer;

            const currentTitle = block.title || '';
            const titleParts = currentTitle.split(' (Layer ');
            if (titleParts.length > 1) {
                const afterLayer = titleParts[1].split('): ');
                if (afterLayer.length > 1) {
                    block.title = `${titleParts[0]} (Layer ${newLayer}): ${afterLayer[1]}`;
                }
            }
        }

        showDragGuidelines(currentTime) {
            this.hideDragGuidelines();

            const audioTrack = document.getElementById('audio-track');
            if (!audioTrack || !this.app.timeline) return;

            const totalDuration = Math.max(this.app.timeline.duration, 60);
            const currentPercent = (currentTime / totalDuration) * 100;

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

            const timeLabel = document.createElement('div');
            timeLabel.className = 'drag-time-label';
            timeLabel.textContent = this.app.formatSubtitleTime(currentTime);
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

        snapToNearbySubtitles(targetTime, currentIndex) {
            if (!this.app.timeline || !this.app.timeline.subtitleData) return targetTime;

            const subtitles = this.app.timeline.subtitleData.subtitles;
            const snapThreshold = 0.5;
            let bestSnapTime = targetTime;
            let minDistance = snapThreshold;

            subtitles.forEach((subtitle, index) => {
                if (index === currentIndex) return;
                const startDistance = Math.abs(targetTime - subtitle.start_time);
                if (startDistance < minDistance) {
                    minDistance = startDistance;
                    bestSnapTime = subtitle.start_time;
                }
                const endDistance = Math.abs(targetTime - subtitle.end_time);
                if (endDistance < minDistance) {
                    minDistance = endDistance;
                    bestSnapTime = subtitle.end_time;
                }
            });

            const roundedTime = Math.round(targetTime);
            const roundDistance = Math.abs(targetTime - roundedTime);
            if (roundDistance < 0.3 && roundDistance < minDistance) {
                bestSnapTime = roundedTime;
            }

            return bestSnapTime;
        }

        checkCollisionWarning(newStartTime, currentIndex, dragBlock) {
            if (!this.app.timeline || !this.app.timeline.subtitleData) return;

            const currentSubtitle = this.app.timeline.subtitleData.subtitles[currentIndex];
            if (!currentSubtitle) return;

            const newEndTime = newStartTime + (currentSubtitle.end_time - currentSubtitle.start_time);
            let hasCollision = false;

            this.app.timeline.subtitleData.subtitles.forEach((subtitle, index) => {
                if (index === currentIndex) return;
                const overlap = !(newEndTime <= subtitle.start_time || newStartTime >= subtitle.end_time);
                if (overlap) {
                    hasCollision = true;
                }
            });

            if (hasCollision) {
                dragBlock.style.borderColor = 'rgba(255, 0, 0, 1)';
                dragBlock.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            } else {
                dragBlock.style.borderColor = 'rgba(255, 215, 0, 1)';
                dragBlock.style.backgroundColor = '';
            }
        }

        highlightWaveformForSubtitle(subtitle) {
            console.log('🎵 자막-파형 매칭 하이라이트:', subtitle.text);
            const audioTrack = document.getElementById('audio-track');
            if (!audioTrack || !this.app.timeline) {
                console.log('❌ 오디오 트랙을 찾을 수 없습니다');
                return;
            }

            this.clearWaveformHighlight();

            const startTime = Math.max(0, subtitle.start_time);
            const endTime = Math.max(0, subtitle.end_time);
            const totalDuration = Math.max(this.app.timeline.duration, 60);

            const startPercent = (startTime / totalDuration) * 100;
            const widthPercent = ((endTime - startTime) / totalDuration) * 100;

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

            const timeLabel = document.createElement('div');
            timeLabel.className = 'waveform-time-label';
            timeLabel.textContent = `${this.app.formatSubtitleTime(startTime)} - ${this.app.formatSubtitleTime(endTime)}`;
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

            this.highlightSubtitleText(subtitle.text);

            setTimeout(() => {
                this.clearWaveformHighlight();
            }, 3000);
        }

        showWaveformConnection(subtitle) {
            const audioTrack = document.getElementById('audio-track');
            if (!audioTrack || !this.app.timeline) return;

            this.hideWaveformConnection();

            const startTime = Math.max(0, subtitle.start_time);
            const endTime = Math.max(0, subtitle.end_time);
            const totalDuration = Math.max(this.app.timeline.duration, 60);

            const startPercent = (startTime / totalDuration) * 100;
            const widthPercent = ((endTime - startTime) / totalDuration) * 100;

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
            document.querySelectorAll('.waveform-connection').forEach(conn => conn.remove());
        }

        clearWaveformHighlight() {
            document.querySelectorAll('.waveform-subtitle-highlight').forEach(highlight => highlight.remove());
            this.clearSubtitleTextHighlight();
        }

        highlightSubtitleText(text) {
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

        analyzeAudioForSubtitle(subtitle) {
            const app = this.app;
            if (!app.timeline || !app.timeline.audioData) {
                console.log('❌ 오디오 데이터가 없습니다');
                return null;
            }

            const startTime = Math.max(0, subtitle.start_time);
            const endTime = Math.max(0, subtitle.end_time);

            if (!Array.isArray(app.timeline.audioData.samples)) {
                return null;
            }

            const samples = app.timeline.audioData.samples;
            const totalDuration = app.timeline.audioData.duration || app.timeline.duration || 60;
            const sampleRate = samples.length / totalDuration;

            const startIndex = Math.max(0, Math.floor(startTime * sampleRate));
            const endIndex = Math.min(samples.length - 1, Math.ceil(endTime * sampleRate));
            const segmentSamples = samples.slice(startIndex, endIndex);

            if (!segmentSamples.length) {
                return null;
            }

            const sumAmplitude = segmentSamples.reduce((acc, value) => acc + Math.abs(value), 0);
            const averageAmplitude = segmentSamples.length ? sumAmplitude / segmentSamples.length : 0;
            const sumSquares = segmentSamples.reduce((acc, value) => acc + value * value, 0);
            const rms = Math.sqrt(sumSquares / segmentSamples.length);
            const energy = rms;
            const silenceThreshold = 0.02;
            const silenceCount = segmentSamples.filter(value => Math.abs(value) < silenceThreshold).length;
            const silenceRatio = segmentSamples.length ? silenceCount / segmentSamples.length : 0;

            return {
                averageAmplitude,
                energy,
                silenceRatio,
                sampleCount: segmentSamples.length
            };
        }

        showAudioAnalysisInfo(subtitle, block) {
            const analysis = this.analyzeAudioForSubtitle(subtitle);
            if (!analysis) return;

            block.dataset.amplitude = analysis.averageAmplitude.toFixed(3);
            block.dataset.energy = analysis.energy.toFixed(3);
            block.dataset.silenceRatio = analysis.silenceRatio.toFixed(3);
        }

        updateSubtitleAppearanceByAudio() {
            const app = this.app;
            if (!app.timeline || !app.timeline.subtitleData) return;

            if (!app.timeline.audioData) {
                console.log('ℹ️ 오디오 데이터가 없어 파형 매칭을 건너뜁니다');
                return;
            }

            const subtitles = app.timeline.subtitleData.subtitles || [];
            console.log('🔄 자막과 오디오 분석 데이터 매칭');

            subtitles.forEach((subtitle, index) => {
                const audioAnalysis = this.analyzeAudioForSubtitle(subtitle);
                if (!audioAnalysis) return;

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
            const opacity = Math.max(0.4, Math.min(1, averageAmplitude * 2));
            const borderWidth = Math.max(1, Math.min(4, energy * 10)) + 'px';

            if (silenceRatio > 0.8) {
                block.style.borderStyle = 'dashed';
                block.style.opacity = '0.6';
            } else {
                block.style.borderStyle = 'solid';
                block.style.opacity = opacity;
            }

            block.style.borderWidth = borderWidth;
            const shadowIntensity = averageAmplitude * 10;
            block.style.boxShadow = `0 2px ${shadowIntensity}px rgba(0, 0, 0, 0.4)`;
        }

        startRealtimeWaveformSync() {
            console.log('🔄 실시간 파형-자막 동기화 시작');
            this.stopRealtimeWaveformSync();
            this.realtimeSyncInterval = setInterval(() => {
                this.updateCurrentSubtitleHighlight();
            }, 100);
        }

        stopRealtimeWaveformSync() {
            if (this.realtimeSyncInterval) {
                clearInterval(this.realtimeSyncInterval);
                this.realtimeSyncInterval = null;
            }
            this.clearCurrentPlaybackHighlight();
        }

        updateCurrentSubtitleHighlight() {
            const app = this.app;
            if (!app.timeline || !app.timeline.subtitleData) return;

            const currentTime = this.getCurrentPlaybackTime();
            if (currentTime === null) return;

            const subtitles = app.timeline.subtitleData.subtitles || [];
            const currentSubtitles = subtitles.filter(subtitle => {
                const startTime = Math.max(0, subtitle.start_time);
                const endTime = Math.max(0, subtitle.end_time);
                return currentTime >= startTime && currentTime <= endTime;
            });

            this.clearCurrentPlaybackHighlight();

            currentSubtitles.forEach((subtitle) => {
                this.highlightCurrentWaveformSection(subtitle, currentTime);
                this.highlightCurrentSubtitleBlock(subtitle);
            });

            if (currentSubtitles.length > 0) {
                const mainSubtitle = currentSubtitles.find(s => !s.text.includes('[')) || currentSubtitles[0];
                this.showCurrentSubtitleText(mainSubtitle.text);
            } else {
                this.hideCurrentSubtitleText();
            }
        }

        getCurrentPlaybackTime() {
            const videoPlayer = document.getElementById('video-player');
            if (videoPlayer && !videoPlayer.paused) {
                return videoPlayer.currentTime;
            }
            const audioPlayer = document.getElementById('audio-player');
            if (audioPlayer && !audioPlayer.paused) {
                return audioPlayer.currentTime;
            }
            return null;
        }

        highlightCurrentWaveformSection(subtitle, currentTime) {
            const audioTrack = document.getElementById('audio-track');
            if (!audioTrack || !this.app.timeline) return;

            const startTime = Math.max(0, subtitle.start_time);
            const endTime = Math.max(0, subtitle.end_time);
            const totalDuration = Math.max(this.app.timeline.duration, 60);

            const currentPercent = (currentTime / totalDuration) * 100;
            const startPercent = (startTime / totalDuration) * 100;
            const endPercent = (endTime / totalDuration) * 100;

            const currentLine = document.createElement('div');
            currentLine.className = 'current-time-line';
            currentLine.style.cssText = `
                position: absolute;
                left: ${currentPercent}%;
                top: 0;
                bottom: 0;
                width: 2px;
                background: rgba(0, 255, 127, 0.9);
                z-index: 35;
                pointer-events: none;
            `;

            const highlight = document.createElement('div');
            highlight.className = 'current-subtitle-highlight';
            highlight.style.cssText = `
                position: absolute;
                left: ${startPercent}%;
                width: ${Math.max(endPercent - startPercent, 0.5)}%;
                top: 0;
                bottom: 0;
                background: rgba(0, 255, 127, 0.2);
                border: 1px solid rgba(0, 255, 127, 0.5);
                border-radius: 4px;
                z-index: 34;
                pointer-events: none;
            `;

            audioTrack.appendChild(highlight);
            audioTrack.appendChild(currentLine);
        }

        highlightCurrentSubtitleBlock(subtitle) {
            const blocks = document.querySelectorAll(`[data-index="${subtitle.globalIndex}"]`);
            blocks.forEach(block => {
                block.classList.add('playing');
            });
        }

        clearCurrentPlaybackHighlight() {
            document.querySelectorAll('.current-time-line').forEach(line => line.remove());
            document.querySelectorAll('.current-subtitle-highlight').forEach(highlight => highlight.remove());
            document.querySelectorAll('.hybrid-subtitle.playing').forEach(block => block.classList.remove('playing'));
            this.hideCurrentSubtitleText();
        }

        showCurrentSubtitleText(text) {
            let display = document.getElementById('live-subtitle-display');
            if (!display) {
                display = document.createElement('div');
                display.id = 'live-subtitle-display';
                display.style.cssText = `
                    position: fixed;
                    bottom: 40px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 12px 24px;
                    border-radius: 24px;
                    font-size: 18px;
                    font-weight: 600;
                    z-index: 1000;
                    max-width: 80%;
                    text-align: center;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
                `;
                document.body.appendChild(display);
            }
            display.textContent = text;
            display.style.display = 'block';
        }

        hideCurrentSubtitleText() {
            const display = document.getElementById('live-subtitle-display');
            if (display) {
                display.style.display = 'none';
            }
        }

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

        calculateTimeFromPosition(block) {
            const app = this.app;
            const leftPercent = parseFloat(block.style.left);
            const totalDuration = Math.max(app.timeline.duration, 60);
            return (leftPercent / 100) * totalDuration;
        }

        updateSubtitleTime(subtitleIndex, newStartTime) {
            const app = this.app;
            if (!app.timeline || !app.timeline.subtitleData || !app.timeline.subtitleData.subtitles[subtitleIndex]) {
                return;
            }

            const subtitle = app.timeline.subtitleData.subtitles[subtitleIndex];
            const duration = subtitle.end_time - subtitle.start_time;
            subtitle.start_time = newStartTime;
            subtitle.end_time = newStartTime + duration;

            const blocks = document.querySelectorAll(`[data-index="${subtitleIndex}"]`);
            blocks.forEach(block => {
                block.title = `#${subtitleIndex + 1}: ${app.formatSubtitleTime(newStartTime)} - ${app.formatSubtitleTime(subtitle.end_time)}\n${subtitle.text}`;
            });

            setTimeout(() => {
                this.updateSubtitleAppearanceByAudio();
            }, 100);

            setTimeout(() => {
                this.renderTracks();
            }, 0);
        }
    }

    global.VideoAnalysisTimelineManager = VideoAnalysisTimelineManager;
})(typeof window !== 'undefined' ? window : null);
