/**
 * 브라우저 기능 탐지 시스템
 * WebCodecs, WebGL, SharedArrayBuffer 등 최신 API 지원 여부 체크
 */

class BrowserCapabilities {
    constructor() {
        this.capabilities = null;
    }

    /**
     * 모든 브라우저 기능을 체크하고 결과를 반환
     */
    async checkAll() {
        const capabilities = {
            browser: this.getBrowserInfo(),
            webcodecs: await this.checkWebCodecs(),
            graphics: this.checkGraphics(),
            memory: this.checkMemory(),
            codecs: await this.checkCodecSupport(),
            performance: this.checkPerformance(),
            timestamp: new Date().toISOString()
        };

        this.capabilities = capabilities;
        return capabilities;
    }

    /**
     * 브라우저 정보
     */
    getBrowserInfo() {
        const ua = navigator.userAgent;
        let browserName = 'Unknown';
        let browserVersion = 'Unknown';

        if (ua.includes('Chrome') && !ua.includes('Edg')) {
            browserName = 'Chrome';
            const match = ua.match(/Chrome\/(\d+)/);
            browserVersion = match ? match[1] : 'Unknown';
        } else if (ua.includes('Edg')) {
            browserName = 'Edge';
            const match = ua.match(/Edg\/(\d+)/);
            browserVersion = match ? match[1] : 'Unknown';
        } else if (ua.includes('Firefox')) {
            browserName = 'Firefox';
            const match = ua.match(/Firefox\/(\d+)/);
            browserVersion = match ? match[1] : 'Unknown';
        } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
            browserName = 'Safari';
            const match = ua.match(/Version\/(\d+)/);
            browserVersion = match ? match[1] : 'Unknown';
        }

        return {
            name: browserName,
            version: browserVersion,
            userAgent: ua,
            platform: navigator.platform,
            cores: navigator.hardwareConcurrency || 'Unknown'
        };
    }

    /**
     * WebCodecs API 지원 여부
     */
    async checkWebCodecs() {
        const support = {
            video_decoder: 'VideoDecoder' in window,
            video_encoder: 'VideoEncoder' in window,
            audio_decoder: 'AudioDecoder' in window,
            audio_encoder: 'AudioEncoder' in window,
            video_frame: 'VideoFrame' in window,
            encoded_video_chunk: 'EncodedVideoChunk' in window,
            image_decoder: 'ImageDecoder' in window
        };

        // 전체 지원 여부
        support.full_support = support.video_decoder &&
                               support.video_encoder &&
                               support.audio_decoder &&
                               support.audio_encoder;

        return support;
    }

    /**
     * 그래픽 API 지원 여부
     */
    checkGraphics() {
        const canvas = document.createElement('canvas');

        const webgl1 = !!canvas.getContext('webgl') || !!canvas.getContext('experimental-webgl');
        const webgl2 = !!canvas.getContext('webgl2');

        let webgpuSupport = 'gpu' in navigator;

        return {
            webgl1: webgl1,
            webgl2: webgl2,
            webgpu: webgpuSupport,
            canvas_2d: !!canvas.getContext('2d'),
            offscreen_canvas: typeof OffscreenCanvas !== 'undefined'
        };
    }

    /**
     * 메모리 및 멀티스레딩 지원 여부
     */
    checkMemory() {
        return {
            shared_array_buffer: typeof SharedArrayBuffer !== 'undefined',
            atomics: typeof Atomics !== 'undefined',
            web_workers: typeof Worker !== 'undefined',
            wasm: typeof WebAssembly !== 'undefined',
            wasm_threads: this.checkWasmThreads()
        };
    }

    /**
     * WebAssembly 스레드 지원 여부
     */
    checkWasmThreads() {
        try {
            // SharedArrayBuffer가 있어야 WASM threads 사용 가능
            if (typeof SharedArrayBuffer === 'undefined') {
                return false;
            }

            // WebAssembly.Memory에 shared 옵션이 있는지 체크
            return WebAssembly.validate(new Uint8Array([
                0, 97, 115, 109, 1, 0, 0, 0,
                1, 4, 1, 96, 0, 0,
                3, 2, 1, 0,
                5, 3, 1, 0, 1,
                10, 14, 1, 12, 0, 65, 0, 65, 0, 65, 0, 252, 10, 0, 0, 11
            ]));
        } catch (e) {
            return false;
        }
    }

    /**
     * 코덱 지원 여부 체크
     */
    async checkCodecSupport() {
        const codecsToTest = [
            // H.264 (AVC)
            { name: 'H.264 Baseline', codec: 'avc1.42E01E', width: 1920, height: 1080 },
            { name: 'H.264 Main', codec: 'avc1.4D401E', width: 1920, height: 1080 },
            { name: 'H.264 High', codec: 'avc1.64001E', width: 1920, height: 1080 },

            // VP8/VP9
            { name: 'VP8', codec: 'vp8', width: 1920, height: 1080 },
            { name: 'VP9', codec: 'vp09.00.10.08', width: 1920, height: 1080 },

            // AV1
            { name: 'AV1', codec: 'av01.0.05M.08', width: 1920, height: 1080 },

            // HEVC (H.265) - 브라우저 지원 제한적
            { name: 'HEVC Main', codec: 'hev1.1.6.L93.B0', width: 1920, height: 1080 }
        ];

        const results = {};

        // VideoDecoder가 없으면 MediaSource로 폴백
        if ('VideoDecoder' in window) {
            for (const codec of codecsToTest) {
                try {
                    const config = {
                        codec: codec.codec,
                        codedWidth: codec.width,
                        codedHeight: codec.height
                    };
                    const support = await VideoDecoder.isConfigSupported(config);
                    results[codec.name] = support.supported || false;
                } catch (e) {
                    results[codec.name] = false;
                }
            }
        } else if ('MediaSource' in window && MediaSource.isTypeSupported) {
            // 폴백: MediaSource API 사용
            for (const codec of codecsToTest) {
                try {
                    const mimeType = `video/mp4; codecs="${codec.codec}"`;
                    results[codec.name] = MediaSource.isTypeSupported(mimeType);
                } catch (e) {
                    results[codec.name] = false;
                }
            }
        } else {
            // API가 없으면 모두 unknown
            codecsToTest.forEach(codec => {
                results[codec.name] = null;
            });
        }

        return results;
    }

    /**
     * 성능 관련 API 지원 여부
     */
    checkPerformance() {
        return {
            performance_api: 'performance' in window,
            performance_observer: 'PerformanceObserver' in window,
            performance_now: 'performance' in window && 'now' in performance,
            performance_memory: 'memory' in performance,
            request_idle_callback: 'requestIdleCallback' in window,
            request_animation_frame: 'requestAnimationFrame' in window
        };
    }

    /**
     * Tier 등급 판정 (사용자 경험 품질)
     */
    getTier() {
        if (!this.capabilities) {
            return null;
        }

        const { browser, webcodecs, graphics } = this.capabilities;

        // Tier 1: Chrome/Edge 94+ with WebCodecs
        if ((browser.name === 'Chrome' || browser.name === 'Edge') &&
            parseInt(browser.version) >= 94 &&
            webcodecs.full_support) {
            return {
                tier: 1,
                label: '최상',
                description: 'WebCodecs 하드웨어 가속, 60fps 미리보기, 프레임 단위 편집 가능',
                color: '#00ff88'
            };
        }

        // Tier 2: Firefox with WebGL2
        if (browser.name === 'Firefox' && graphics.webgl2) {
            return {
                tier: 2,
                label: '준수',
                description: 'Canvas 소프트웨어 렌더링, 30fps 미리보기 가능',
                color: '#ffd400'
            };
        }

        // Tier 3: Safari or older browsers
        if (browser.name === 'Safari' || !graphics.webgl2) {
            return {
                tier: 3,
                label: '제한적',
                description: '기본 미리보기만 가능, 최종 렌더링은 정상 작동',
                color: '#ff8800'
            };
        }

        // Tier 4: Very old browsers
        return {
            tier: 4,
            label: '최소',
            description: '브라우저 업그레이드 권장, 기본 기능만 제공',
            color: '#ff0000'
        };
    }

    /**
     * 권장 사항 생성
     */
    getRecommendations() {
        if (!this.capabilities) {
            return [];
        }

        const recommendations = [];
        const { browser, webcodecs, graphics, memory } = this.capabilities;

        // WebCodecs 미지원
        if (!webcodecs.full_support) {
            if (browser.name === 'Chrome' || browser.name === 'Edge') {
                recommendations.push({
                    type: 'warning',
                    message: '브라우저를 최신 버전으로 업데이트하면 성능이 크게 향상됩니다.',
                    action: '브라우저 업데이트'
                });
            } else if (browser.name === 'Safari') {
                recommendations.push({
                    type: 'info',
                    message: 'Safari는 WebCodecs를 지원하지 않습니다. Chrome 또는 Edge 사용을 권장합니다.',
                    action: '브라우저 변경'
                });
            } else if (browser.name === 'Firefox') {
                recommendations.push({
                    type: 'info',
                    message: 'Firefox는 WebCodecs 개발 중입니다. Chrome/Edge에서 더 나은 성능을 제공합니다.',
                    action: 'Chrome/Edge 사용 권장'
                });
            }
        }

        // WebGL2 미지원
        if (!graphics.webgl2) {
            recommendations.push({
                type: 'warning',
                message: 'WebGL2가 지원되지 않아 일부 효과가 제한됩니다.',
                action: '브라우저 업데이트 또는 변경'
            });
        }

        // SharedArrayBuffer 미지원
        if (!memory.shared_array_buffer) {
            recommendations.push({
                type: 'info',
                message: 'SharedArrayBuffer가 비활성화되어 있습니다. 사이트가 HTTPS이고 COOP/COEP 헤더가 설정되어야 활성화됩니다.',
                action: '서버 설정 확인'
            });
        }

        // 모든 것이 완벽한 경우
        if (recommendations.length === 0) {
            recommendations.push({
                type: 'success',
                message: '브라우저가 모든 최신 기능을 지원합니다! 최상의 편집 경험을 제공합니다.',
                action: null
            });
        }

        return recommendations;
    }

    /**
     * 결과를 HTML로 포맷팅
     */
    formatAsHTML() {
        if (!this.capabilities) {
            return '<p>기능 체크를 먼저 실행하세요.</p>';
        }

        const tier = this.getTier();
        const recommendations = this.getRecommendations();

        let html = `
            <div class="capability-report">
                <div class="tier-badge" style="background: ${tier.color}20; border: 2px solid ${tier.color}; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 5px 0; color: ${tier.color};">등급: Tier ${tier.tier} (${tier.label})</h3>
                    <p style="margin: 0; color: #b0c4de;">${tier.description}</p>
                </div>

                <div class="browser-info" style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">🌐 브라우저 정보</h4>
                    <ul style="color: #b0c4de; margin: 0; padding-left: 20px;">
                        <li>${this.capabilities.browser.name} ${this.capabilities.browser.version}</li>
                        <li>플랫폼: ${this.capabilities.browser.platform}</li>
                        <li>CPU 코어: ${this.capabilities.browser.cores}</li>
                    </ul>
                </div>

                <div class="webcodecs-support" style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">🎬 WebCodecs API</h4>
                    <ul style="color: #b0c4de; margin: 0; padding-left: 20px;">
                        ${this._formatBool('VideoDecoder', this.capabilities.webcodecs.video_decoder)}
                        ${this._formatBool('VideoEncoder', this.capabilities.webcodecs.video_encoder)}
                        ${this._formatBool('AudioDecoder', this.capabilities.webcodecs.audio_decoder)}
                        ${this._formatBool('AudioEncoder', this.capabilities.webcodecs.audio_encoder)}
                    </ul>
                </div>

                <div class="graphics-support" style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">🎨 그래픽 API</h4>
                    <ul style="color: #b0c4de; margin: 0; padding-left: 20px;">
                        ${this._formatBool('WebGL 1.0', this.capabilities.graphics.webgl1)}
                        ${this._formatBool('WebGL 2.0', this.capabilities.graphics.webgl2)}
                        ${this._formatBool('WebGPU', this.capabilities.graphics.webgpu)}
                        ${this._formatBool('OffscreenCanvas', this.capabilities.graphics.offscreen_canvas)}
                    </ul>
                </div>

                <div class="codec-support" style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">🎞️ 코덱 지원</h4>
                    <ul style="color: #b0c4de; margin: 0; padding-left: 20px;">
                        ${Object.entries(this.capabilities.codecs).map(([name, supported]) =>
                            this._formatBool(name, supported)
                        ).join('')}
                    </ul>
                </div>

                <div class="recommendations" style="margin-top: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">💡 권장 사항</h4>
                    ${recommendations.map(rec => `
                        <div style="padding: 10px; margin-bottom: 10px; background: ${this._getRecBgColor(rec.type)}; border-left: 3px solid ${this._getRecColor(rec.type)}; border-radius: 4px;">
                            <p style="margin: 0; color: #e2e8f0; font-size: 0.9rem;">${rec.message}</p>
                            ${rec.action ? `<small style="color: #b0c4de;">→ ${rec.action}</small>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        return html;
    }

    _formatBool(label, value) {
        if (value === null) {
            return `<li>${label}: <span style="color: #888;">알 수 없음</span></li>`;
        }
        const icon = value ? '✅' : '❌';
        const color = value ? '#00ff88' : '#ff4444';
        return `<li>${icon} <span style="color: ${color};">${label}</span></li>`;
    }

    _getRecColor(type) {
        const colors = {
            success: '#00ff88',
            info: '#4a9eff',
            warning: '#ffd400',
            error: '#ff4444'
        };
        return colors[type] || '#888';
    }

    _getRecBgColor(type) {
        const colors = {
            success: 'rgba(0, 255, 136, 0.1)',
            info: 'rgba(74, 158, 255, 0.1)',
            warning: 'rgba(255, 212, 0, 0.1)',
            error: 'rgba(255, 68, 68, 0.1)'
        };
        return colors[type] || 'rgba(136, 136, 136, 0.1)';
    }

    /**
     * 콘솔에 출력
     */
    printToConsole() {
        if (!this.capabilities) {
            console.log('기능 체크를 먼저 실행하세요.');
            return;
        }

        console.group('🔍 브라우저 기능 탐지 결과');
        console.log('브라우저:', this.capabilities.browser);
        console.log('WebCodecs:', this.capabilities.webcodecs);
        console.log('그래픽:', this.capabilities.graphics);
        console.log('메모리:', this.capabilities.memory);
        console.log('코덱:', this.capabilities.codecs);
        console.log('Tier:', this.getTier());
        console.log('권장사항:', this.getRecommendations());
        console.groupEnd();
    }
}

// 전역 인스턴스 생성
window.BrowserCapabilities = BrowserCapabilities;
