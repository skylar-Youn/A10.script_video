/**
 * 클라이언트 측 성능 모니터링 시스템
 * API 호출, DOM 렌더링, 사용자 인터랙션 등의 성능 측정
 */

class PerformanceMonitor {
    constructor() {
        this.marks = {};
        this.measures = {};
        this.apiCalls = [];
        this.enabled = true;
    }

    /**
     * 성능 측정 시작
     */
    start(label) {
        if (!this.enabled) return;

        if ('performance' in window && 'now' in performance) {
            this.marks[label] = performance.now();
        } else {
            this.marks[label] = Date.now();
        }
    }

    /**
     * 성능 측정 종료
     */
    end(label) {
        if (!this.enabled) return;

        const endTime = ('performance' in window && 'now' in performance)
            ? performance.now()
            : Date.now();

        if (this.marks[label] !== undefined) {
            const duration = endTime - this.marks[label];
            this.measures[label] = duration;
            return duration;
        }

        return null;
    }

    /**
     * 성능 측정 및 실행
     */
    measure(label, fn) {
        this.start(label);
        const result = fn();
        const duration = this.end(label);

        console.log(`⏱️ ${label}: ${duration?.toFixed(2)}ms`);

        return result;
    }

    /**
     * async 함수 성능 측정
     */
    async measureAsync(label, asyncFn) {
        this.start(label);
        try {
            const result = await asyncFn();
            const duration = this.end(label);
            console.log(`⏱️ ${label}: ${duration?.toFixed(2)}ms`);
            return result;
        } catch (error) {
            this.end(label);
            throw error;
        }
    }

    /**
     * fetch 호출 래핑 (자동 성능 측정)
     */
    async monitoredFetch(url, options = {}) {
        const label = `API: ${options.method || 'GET'} ${url}`;
        const startTime = performance.now();

        const apiCall = {
            url,
            method: options.method || 'GET',
            startTime: new Date().toISOString(),
            duration: 0,
            success: false,
            statusCode: null,
            error: null
        };

        try {
            const response = await fetch(url, options);
            const duration = performance.now() - startTime;

            apiCall.duration = duration;
            apiCall.success = response.ok;
            apiCall.statusCode = response.status;

            this.apiCalls.push(apiCall);
            this.measures[label] = duration;

            console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms (${response.status})`);

            return response;
        } catch (error) {
            const duration = performance.now() - startTime;

            apiCall.duration = duration;
            apiCall.success = false;
            apiCall.error = error.message;

            this.apiCalls.push(apiCall);

            console.error(`❌ ${label}: ${duration.toFixed(2)}ms - Error: ${error.message}`);

            throw error;
        }
    }

    /**
     * DOM 렌더링 성능 측정
     */
    measureDOMRender(label, domOperation) {
        this.start(label);

        // DOM 조작 실행
        domOperation();

        // 다음 프레임에서 측정 (렌더링 완료 후)
        requestAnimationFrame(() => {
            const duration = this.end(label);
            console.log(`🎨 ${label}: ${duration?.toFixed(2)}ms`);
        });
    }

    /**
     * 리소스 로딩 성능 분석
     */
    getResourceTimings() {
        if (!('performance' in window) || !('getEntriesByType' in performance)) {
            return [];
        }

        const resources = performance.getEntriesByType('resource');

        return resources.map(resource => ({
            name: resource.name,
            type: resource.initiatorType,
            duration: resource.duration,
            size: resource.transferSize || 0,
            cached: resource.transferSize === 0 && resource.decodedBodySize > 0
        }));
    }

    /**
     * 네비게이션 타이밍 분석
     */
    getNavigationTimings() {
        if (!('performance' in window) || !('getEntriesByType' in performance)) {
            return null;
        }

        const [navigation] = performance.getEntriesByType('navigation');

        if (!navigation) return null;

        return {
            dns: navigation.domainLookupEnd - navigation.domainLookupStart,
            tcp: navigation.connectEnd - navigation.connectStart,
            request: navigation.responseStart - navigation.requestStart,
            response: navigation.responseEnd - navigation.responseStart,
            dom_processing: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            load: navigation.loadEventEnd - navigation.loadEventStart,
            total: navigation.loadEventEnd - navigation.fetchStart
        };
    }

    /**
     * 메모리 사용량 (Chrome only)
     */
    getMemoryUsage() {
        if ('memory' in performance) {
            return {
                used: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
                total: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
                limit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB'
            };
        }
        return null;
    }

    /**
     * FPS 측정 (60fps 기준)
     */
    measureFPS(duration = 1000) {
        return new Promise((resolve) => {
            let frameCount = 0;
            const startTime = performance.now();

            function countFrame() {
                frameCount++;
                const elapsed = performance.now() - startTime;

                if (elapsed < duration) {
                    requestAnimationFrame(countFrame);
                } else {
                    const fps = (frameCount / elapsed) * 1000;
                    resolve(Math.round(fps));
                }
            }

            requestAnimationFrame(countFrame);
        });
    }

    /**
     * 성능 요약 리포트 생성
     */
    getSummary() {
        const summary = {
            measures: { ...this.measures },
            api_calls: this.apiCalls.slice(-20), // 최근 20개
            navigation: this.getNavigationTimings(),
            resources: this.getResourceTimings().slice(0, 50), // 상위 50개
            memory: this.getMemoryUsage(),
            timestamp: new Date().toISOString()
        };

        return summary;
    }

    /**
     * API 호출 통계
     */
    getAPIStats() {
        if (this.apiCalls.length === 0) {
            return {
                total: 0,
                success: 0,
                failed: 0,
                avgDuration: 0
            };
        }

        const total = this.apiCalls.length;
        const success = this.apiCalls.filter(call => call.success).length;
        const failed = total - success;
        const avgDuration = this.apiCalls.reduce((sum, call) => sum + call.duration, 0) / total;

        return {
            total,
            success,
            failed,
            avgDuration: avgDuration.toFixed(2),
            calls: this.apiCalls.slice(-10) // 최근 10개
        };
    }

    /**
     * 성능 데이터 초기화
     */
    clear() {
        this.marks = {};
        this.measures = {};
        this.apiCalls = [];
    }

    /**
     * 콘솔에 성능 리포트 출력
     */
    printReport() {
        console.group('📊 성능 모니터링 리포트');

        // 측정된 작업들
        console.group('⏱️ 측정된 작업');
        Object.entries(this.measures).forEach(([label, duration]) => {
            console.log(`${label}: ${duration.toFixed(2)}ms`);
        });
        console.groupEnd();

        // API 호출 통계
        const apiStats = this.getAPIStats();
        console.group('🌐 API 호출 통계');
        console.log(`총 호출: ${apiStats.total}`);
        console.log(`성공: ${apiStats.success}`);
        console.log(`실패: ${apiStats.failed}`);
        console.log(`평균 시간: ${apiStats.avgDuration}ms`);
        console.groupEnd();

        // 메모리 사용량
        const memory = this.getMemoryUsage();
        if (memory) {
            console.group('💾 메모리 사용량');
            console.log(`사용 중: ${memory.used}`);
            console.log(`전체: ${memory.total}`);
            console.log(`제한: ${memory.limit}`);
            console.groupEnd();
        }

        // 네비게이션 타이밍
        const nav = this.getNavigationTimings();
        if (nav) {
            console.group('🚀 페이지 로딩');
            console.log(`DNS: ${nav.dns.toFixed(2)}ms`);
            console.log(`TCP: ${nav.tcp.toFixed(2)}ms`);
            console.log(`Request: ${nav.request.toFixed(2)}ms`);
            console.log(`Response: ${nav.response.toFixed(2)}ms`);
            console.log(`DOM Processing: ${nav.dom_processing.toFixed(2)}ms`);
            console.log(`Total: ${nav.total.toFixed(2)}ms`);
            console.groupEnd();
        }

        console.groupEnd();
    }

    /**
     * HTML 리포트 생성
     */
    generateHTMLReport() {
        const apiStats = this.getAPIStats();
        const memory = this.getMemoryUsage();
        const nav = this.getNavigationTimings();

        let html = `
            <div class="performance-report" style="font-family: monospace; font-size: 0.9rem;">
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">⏱️ 측정된 작업</h4>
                    <ul style="color: #b0c4de; margin: 0; padding-left: 20px;">
        `;

        Object.entries(this.measures).slice(-10).forEach(([label, duration]) => {
            const color = duration < 100 ? '#00ff88' : duration < 500 ? '#ffd400' : '#ff4444';
            html += `<li><span style="color: ${color};">${label}</span>: ${duration.toFixed(2)}ms</li>`;
        });

        html += `
                    </ul>
                </div>

                <div style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">🌐 API 호출 통계</h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; color: #b0c4de;">
                        <div>총 호출: <strong style="color: #4a9eff;">${apiStats.total}</strong></div>
                        <div>평균 시간: <strong style="color: #4a9eff;">${apiStats.avgDuration}ms</strong></div>
                        <div>성공: <strong style="color: #00ff88;">${apiStats.success}</strong></div>
                        <div>실패: <strong style="color: #ff4444;">${apiStats.failed}</strong></div>
                    </div>
                </div>
        `;

        if (memory) {
            html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">💾 메모리 사용량</h4>
                    <div style="color: #b0c4de;">
                        <div>사용 중: <strong style="color: #ffd400;">${memory.used}</strong></div>
                        <div>전체: <strong>${memory.total}</strong></div>
                        <div>제한: <strong>${memory.limit}</strong></div>
                    </div>
                </div>
            `;
        }

        if (nav) {
            html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #f0f4f8; margin-bottom: 10px;">🚀 페이지 로딩</h4>
                    <div style="color: #b0c4de;">
                        <div>DNS: ${nav.dns.toFixed(2)}ms</div>
                        <div>TCP: ${nav.tcp.toFixed(2)}ms</div>
                        <div>Request: ${nav.request.toFixed(2)}ms</div>
                        <div>Response: ${nav.response.toFixed(2)}ms</div>
                        <div>DOM Processing: ${nav.dom_processing.toFixed(2)}ms</div>
                        <div><strong>Total: ${nav.total.toFixed(2)}ms</strong></div>
                    </div>
                </div>
            `;
        }

        html += `</div>`;

        return html;
    }
}

// 전역 인스턴스 생성
window.performanceMonitor = new PerformanceMonitor();

// 페이지 로드 시 자동 측정 시작
if (document.readyState === 'loading') {
    window.performanceMonitor.start('페이지 로딩');
    document.addEventListener('DOMContentLoaded', () => {
        window.performanceMonitor.end('페이지 로딩');
    });
}

// window.onload에서 초기 리포트
window.addEventListener('load', () => {
    console.log('📊 Performance Monitor 준비 완료');
    console.log('사용법:');
    console.log('  - performanceMonitor.start("작업명") / end("작업명")');
    console.log('  - performanceMonitor.measure("작업명", () => { ... })');
    console.log('  - performanceMonitor.printReport()');
});
