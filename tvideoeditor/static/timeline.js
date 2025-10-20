/**
 * Timeline 및 Track 관리 시스템
 */

class TimelineManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.tracks = [];
        this.currentTime = 0;
        this.duration = 0;
        this.zoom = 1;
        this.scrollX = 0;

        // 선택된 트랙 및 클립
        this.selectedTrack = null;
        this.selectedClip = null;

        // 드래그 상태
        this.isDragging = false;
        this.dragType = null; // 'clip', 'trim-start', 'trim-end'
        this.dragStartX = 0;

        this.setupEventListeners();
        this.render();
    }

    /**
     * 트랙 추가
     */
    addTrack(type = 'video') {
        const track = {
            id: `track-${Date.now()}`,
            type: type, // 'video', 'subtitle', 'audio', 'effect'
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} Track ${this.tracks.length + 1}`,
            clips: [],
            enabled: true,
            locked: false,
            height: 60
        };

        this.tracks.push(track);
        this.render();
        return track;
    }

    /**
     * 클립 추가
     */
    addClip(trackId, clip) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return null;

        const newClip = {
            id: `clip-${Date.now()}`,
            startTime: clip.startTime || 0,
            duration: clip.duration || 1,
            type: clip.type || 'video',
            source: clip.source || null,
            data: clip.data || {},
            ...clip
        };

        track.clips.push(newClip);
        this.updateDuration();
        this.render();
        return newClip;
    }

    /**
     * 클립 제거
     */
    removeClip(trackId, clipId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return false;

        track.clips = track.clips.filter(c => c.id !== clipId);
        this.updateDuration();
        this.render();
        return true;
    }

    /**
     * 전체 duration 업데이트
     */
    updateDuration() {
        let maxDuration = 0;
        this.tracks.forEach(track => {
            track.clips.forEach(clip => {
                const endTime = clip.startTime + clip.duration;
                if (endTime > maxDuration) {
                    maxDuration = endTime;
                }
            });
        });
        this.duration = maxDuration;
    }

    /**
     * 시간을 X 좌표로 변환
     */
    timeToX(time) {
        const pixelsPerSecond = 50 * this.zoom;
        return (time * pixelsPerSecond) - this.scrollX;
    }

    /**
     * X 좌표를 시간으로 변환
     */
    xToTime(x) {
        const pixelsPerSecond = 50 * this.zoom;
        return (x + this.scrollX) / pixelsPerSecond;
    }

    /**
     * 타임라인 렌더링
     */
    render() {
        const { width, height } = this.canvas;

        // 배경
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, width, height);

        // 시간 눈금 그리기
        this.renderTimeRuler();

        // 트랙 렌더링
        let y = 40; // 시간 눈금 높이
        this.tracks.forEach(track => {
            this.renderTrack(track, y);
            y += track.height + 2;
        });

        // 플레이헤드
        this.renderPlayhead();
    }

    /**
     * 시간 눈금 렌더링
     */
    renderTimeRuler() {
        const { width } = this.canvas;
        const rulerHeight = 40;

        // 배경
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, 0, width, rulerHeight);

        // 눈금
        this.ctx.strokeStyle = '#666';
        this.ctx.fillStyle = '#ccc';
        this.ctx.font = '11px monospace';
        this.ctx.textAlign = 'center';

        const pixelsPerSecond = 50 * this.zoom;
        const startTime = Math.floor(this.scrollX / pixelsPerSecond);
        const endTime = Math.ceil((this.scrollX + width) / pixelsPerSecond);

        for (let t = startTime; t <= endTime; t++) {
            const x = this.timeToX(t);
            if (x < 0 || x > width) continue;

            // 초 눈금
            this.ctx.beginPath();
            this.ctx.moveTo(x, rulerHeight - 10);
            this.ctx.lineTo(x, rulerHeight);
            this.ctx.stroke();

            // 시간 텍스트
            const minutes = Math.floor(t / 60);
            const seconds = t % 60;
            const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            this.ctx.fillText(timeText, x, 12);
        }
    }

    /**
     * 트랙 렌더링
     */
    renderTrack(track, y) {
        const { width } = this.canvas;

        // 트랙 배경
        this.ctx.fillStyle = track.enabled ? '#2a2a2a' : '#1a1a1a';
        this.ctx.fillRect(0, y, width, track.height);

        // 트랙 테두리
        this.ctx.strokeStyle = '#444';
        this.ctx.strokeRect(0, y, width, track.height);

        // 클립 렌더링
        track.clips.forEach(clip => {
            this.renderClip(clip, y, track.height);
        });
    }

    /**
     * 클립 렌더링
     */
    renderClip(clip, trackY, trackHeight) {
        const x = this.timeToX(clip.startTime);
        const width = (clip.duration * 50 * this.zoom);

        // 클립 배경
        const isSelected = this.selectedClip?.id === clip.id;
        this.ctx.fillStyle = isSelected ? '#4a9eff' : '#3a7fcc';
        this.ctx.fillRect(x, trackY + 2, width, trackHeight - 4);

        // 클립 테두리
        this.ctx.strokeStyle = isSelected ? '#fff' : '#5a9fdd';
        this.ctx.lineWidth = isSelected ? 2 : 1;
        this.ctx.strokeRect(x, trackY + 2, width, trackHeight - 4);

        // 클립 이름
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(
            clip.name || clip.type,
            x + 5,
            trackY + trackHeight / 2 + 4,
            width - 10
        );
    }

    /**
     * 플레이헤드 렌더링
     */
    renderPlayhead() {
        const x = this.timeToX(this.currentTime);
        const { height } = this.canvas;

        // 플레이헤드 라인
        this.ctx.strokeStyle = '#ff3333';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, height);
        this.ctx.stroke();

        // 플레이헤드 상단 핸들
        this.ctx.fillStyle = '#ff3333';
        this.ctx.beginPath();
        this.ctx.moveTo(x - 8, 0);
        this.ctx.lineTo(x + 8, 0);
        this.ctx.lineTo(x, 15);
        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
    }

    /**
     * 마우스 다운 이벤트
     */
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 플레이헤드 클릭 체크
        const playheadX = this.timeToX(this.currentTime);
        if (Math.abs(x - playheadX) < 10 && y < 40) {
            this.isDragging = true;
            this.dragType = 'playhead';
            return;
        }

        // 클립 선택
        const { track, clip } = this.getClipAtPosition(x, y);
        if (clip) {
            this.selectedTrack = track;
            this.selectedClip = clip;
            this.isDragging = true;
            this.dragType = 'clip';
            this.dragStartX = x;
            this.render();
        }
    }

    /**
     * 마우스 이동 이벤트
     */
    handleMouseMove(e) {
        if (!this.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;

        if (this.dragType === 'playhead') {
            this.currentTime = Math.max(0, this.xToTime(x));
            this.render();

            // 비디오 시크 이벤트 발생
            this.dispatchEvent('seek', { time: this.currentTime });
        } else if (this.dragType === 'clip' && this.selectedClip) {
            const deltaX = x - this.dragStartX;
            const deltaTime = deltaX / (50 * this.zoom);
            this.selectedClip.startTime = Math.max(0, this.selectedClip.startTime + deltaTime);
            this.dragStartX = x;
            this.render();
        }
    }

    /**
     * 마우스 업 이벤트
     */
    handleMouseUp(e) {
        this.isDragging = false;
        this.dragType = null;
    }

    /**
     * 휠 이벤트 (줌)
     */
    handleWheel(e) {
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
            // 줌
            const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom = Math.max(0.1, Math.min(5, this.zoom * zoomDelta));
        } else {
            // 스크롤
            this.scrollX = Math.max(0, this.scrollX + e.deltaX);
        }

        this.render();
    }

    /**
     * 위치에서 클립 찾기
     */
    getClipAtPosition(x, y) {
        let trackY = 40;

        for (const track of this.tracks) {
            if (y >= trackY && y < trackY + track.height) {
                for (const clip of track.clips) {
                    const clipX = this.timeToX(clip.startTime);
                    const clipWidth = clip.duration * 50 * this.zoom;

                    if (x >= clipX && x < clipX + clipWidth) {
                        return { track, clip };
                    }
                }
            }
            trackY += track.height + 2;
        }

        return { track: null, clip: null };
    }

    /**
     * 커스텀 이벤트 발생
     */
    dispatchEvent(eventName, detail) {
        const event = new CustomEvent(eventName, { detail });
        this.canvas.dispatchEvent(event);
    }

    /**
     * 타임라인 데이터 내보내기
     */
    export() {
        return {
            tracks: this.tracks,
            duration: this.duration,
            currentTime: this.currentTime
        };
    }

    /**
     * 타임라인 데이터 가져오기
     */
    import(data) {
        this.tracks = data.tracks || [];
        this.duration = data.duration || 0;
        this.currentTime = data.currentTime || 0;
        this.render();
    }
}

// 전역으로 export
window.TimelineManager = TimelineManager;
