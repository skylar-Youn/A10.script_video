/**
 * Hybrid subtitle track manager for the video analysis dashboard.
 * Handles track visibility/lock controls and basic subtitle classification.
 */
(function registerHybridTracksManager(global) {
    if (!global) {
        throw new Error('VideoAnalysisHybridTracksManager requires a window context');
    }

    class VideoAnalysisHybridTracksManager {
        constructor(appInstance) {
            this.app = appInstance;
        }

        setupControls() {
            ['main', 'translation', 'description'].forEach(trackType => {
                const toggleBtn = document.querySelector(`.track-toggle[data-track="${trackType}"]`);
                if (toggleBtn) {
                    toggleBtn.addEventListener('click', () => this.toggleVisibility(trackType));
                }

                const lockBtn = document.querySelector(`.track-lock[data-track="${trackType}"]`);
                if (lockBtn) {
                    lockBtn.addEventListener('click', () => this.toggleLock(trackType));
                }

                const settingsBtn = document.querySelector(`.track-settings[data-track="${trackType}"]`);
                if (settingsBtn) {
                    settingsBtn.addEventListener('click', () => this.showSettings(trackType));
                }

                const trackHeader = document.querySelector(`#${trackType}-subtitle-track .track-header`);
                if (trackHeader) {
                    trackHeader.addEventListener('click', (event) => {
                        if (event.target.classList.contains('track-toggle')
                            || event.target.classList.contains('track-lock')
                            || event.target.classList.contains('track-settings')) {
                            return;
                        }

                        const track = document.getElementById(`${trackType}-subtitle-track`);
                        if (track && track.classList.contains('collapsed')) {
                            this.toggleVisibility(trackType);
                        }
                    });
                }
            });
        }

        toggleVisibility(trackType) {
            const state = this.app.trackStates;
            if (!state || !state[trackType]) {
                console.warn('트랙 상태 정보를 찾을 수 없습니다:', trackType);
                return;
            }

            state[trackType].visible = !state[trackType].visible;

            const toggleBtn = document.querySelector(`.track-toggle[data-track="${trackType}"]`);
            const track = document.getElementById(`${trackType}-subtitle-track`);

            if (state[trackType].visible) {
                if (toggleBtn) {
                    toggleBtn.textContent = '👁️';
                    toggleBtn.title = '트랙 숨기기';
                }
                if (track) {
                    track.classList.remove('collapsed');
                    track.style.height = '80px';
                }
            } else {
                if (toggleBtn) {
                    toggleBtn.textContent = '👁️‍🗨️';
                    toggleBtn.title = '트랙 보이기';
                }
                if (track) {
                    track.classList.add('collapsed');
                    track.style.height = '35px';
                }
            }

            if (typeof this.app.renderHybridSubtitleTracks === 'function') {
                this.app.renderHybridSubtitleTracks();
            }
        }

        toggleLock(trackType) {
            const state = this.app.trackStates;
            if (!state || !state[trackType]) {
                console.warn('트랙 상태 정보를 찾을 수 없습니다:', trackType);
                return;
            }

            state[trackType].locked = !state[trackType].locked;

            const lockBtn = document.querySelector(`.track-lock[data-track="${trackType}"]`);
            const track = document.getElementById(`${trackType}-subtitle-track`);

            if (state[trackType].locked) {
                if (lockBtn) {
                    lockBtn.textContent = '🔒';
                    lockBtn.title = '트랙 잠금 해제';
                }
                if (track) {
                    track.classList.add('locked');
                }
            } else {
                if (lockBtn) {
                    lockBtn.textContent = '🔓';
                    lockBtn.title = '트랙 잠금';
                }
                if (track) {
                    track.classList.remove('locked');
                }
            }
        }

        showSettings(trackType) {
            const trackNames = {
                main: '메인 자막',
                translation: '번역 자막',
                description: '설명 자막'
            };

            const label = trackNames[trackType] || trackType;
            alert(`${label} 설정\n\n향후 업데이트에서 제공될 예정입니다:\n- 트랙 색상 변경\n- 폰트 크기 조절\n- 자막 스타일 설정`);
        }

        classifySubtitlesByType(subtitles) {
            const classified = {
                main: [],
                translation: [],
                description: []
            };

            subtitles.forEach((subtitle, index) => {
                const text = (subtitle.text || '').toLowerCase();

                if (text.includes('[') && text.includes(']')) {
                    classified.description.push({ ...subtitle, originalIndex: index });
                } else if (text.match(/^[a-z\s\.,!?]+$/)) {
                    classified.translation.push({ ...subtitle, originalIndex: index });
                } else {
                    classified.main.push({ ...subtitle, originalIndex: index });
                }
            });

            return classified;
        }
    }

    global.VideoAnalysisHybridTracksManager = VideoAnalysisHybridTracksManager;
})(typeof window !== 'undefined' ? window : null);
