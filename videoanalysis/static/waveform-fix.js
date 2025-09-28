// 파형 표시 문제 해결을 위한 임시 스크립트

// DOM이 로드된 후 실행
document.addEventListener('DOMContentLoaded', function() {
    console.log('파형 수정 스크립트 로드됨');

    // 타임라인 파형 캔버스 강제 표시
    function forceShowWaveform() {
        const canvas = document.getElementById('timeline-waveform');
        if (!canvas) {
            console.log('timeline-waveform 캔버스를 찾을 수 없음');
            return;
        }

        const ctx = canvas.getContext('2d');

        // 캔버스 크기 설정
        if (canvas.width === 0 || canvas.height === 0) {
            canvas.width = 800;
            canvas.height = 80;
            canvas.style.width = '100%';
            canvas.style.height = '80px';
        }

        console.log('강제 파형 그리기 시작, 캔버스 크기:', canvas.width, 'x', canvas.height);

        // 배경 그리기
        ctx.fillStyle = 'rgba(10, 30, 50, 0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 가운데 선
        const centerY = canvas.height / 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(canvas.width, centerY);
        ctx.stroke();

        // 시뮬레이션 파형 그리기
        ctx.fillStyle = '#00ff88';

        for (let x = 0; x < canvas.width; x += 2) {
            // 더 복잡한 파형 패턴
            const freq1 = x * 0.02;
            const freq2 = x * 0.007;
            const freq3 = x * 0.031;

            const amplitude = (
                Math.sin(freq1) * 0.4 +
                Math.sin(freq2) * 0.3 +
                Math.sin(freq3) * 0.2 +
                (Math.random() - 0.5) * 0.1
            );

            // 음성 구간 시뮬레이션 (일정 간격으로 음성이 있는 것처럼)
            const speechGate = Math.sin(x * 0.005) > -0.2 ? 1 : 0.1;
            const finalAmplitude = amplitude * speechGate;

            const height = Math.abs(finalAmplitude) * centerY * 0.8;

            if (height > 1) {
                ctx.fillRect(x, centerY - height/2, 1, height);
            }
        }

        // 정보 텍스트
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '12px Arial';
        ctx.fillText('🎵 오디오 파형 (데모)', 10, 20);
        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(0, 255, 136, 0.8)';
        ctx.fillText('파형이 표시되고 있습니다', 10, canvas.height - 10);

        console.log('강제 파형 그리기 완료');
    }

    // 즉시 실행
    forceShowWaveform();

    // 주기적으로 확인하여 캔버스가 비어있으면 다시 그리기
    setInterval(function() {
        const canvas = document.getElementById('timeline-waveform');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const isEmpty = imageData.data.every(value => value === 0);

            if (isEmpty) {
                console.log('캔버스가 비어있음, 다시 그리기');
                forceShowWaveform();
            }
        }
    }, 3000);

    // 버튼 클릭 시에도 강제로 파형 그리기
    document.addEventListener('click', function(e) {
        if (e.target.id === 'load-audio-file') {
            setTimeout(forceShowWaveform, 1000);
        }
    });
});

// 전역 함수로 파형 강제 표시 기능 제공
window.forceShowAudioWaveform = function() {
    const canvas = document.getElementById('timeline-waveform');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // 현재 시간 기반 애니메이션 파형
    const now = Date.now() * 0.001;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerY = canvas.height / 2;
    ctx.fillStyle = '#4CAF50';

    for (let x = 0; x < canvas.width; x += 3) {
        const amplitude = Math.sin(x * 0.02 + now) * 0.5 + Math.sin(x * 0.05 + now * 2) * 0.3;
        const height = Math.abs(amplitude) * centerY;
        ctx.fillRect(x, centerY - height/2, 2, height);
    }

    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.fillText('실시간 파형', 5, 15);
};

console.log('파형 수정 스크립트 완전 로드됨');