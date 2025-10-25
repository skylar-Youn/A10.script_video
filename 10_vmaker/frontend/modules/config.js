// API 설정
export const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:8007'
    : '';

// localStorage 키
export const STORAGE_KEY = 'vmaker_state';

// 기본 설정
export const DEFAULT_VIDEO_SIZE = 50; // %
export const DEFAULT_ASPECT_RATIO = 'youtube'; // 'youtube' or 'shorts'
