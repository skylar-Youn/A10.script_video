const state = {
  project: null,
  templates: [
    { id: "clean", name: "Clean Split", title: [0.5, 0.15], subtitle: [0.5, 0.85] },
    { id: "banner", name: "Bold Banner", title: [0.5, 0.12], subtitle: [0.5, 0.78] },
    { id: "shadow", name: "Shadow Card", title: [0.5, 0.2], subtitle: [0.5, 0.82] },
    { id: "focus", name: "Subtitle Focus", title: [0.5, 0.25], subtitle: [0.5, 0.8] },
    { id: "dual", name: "Dual Column", title: [0.45, 0.18], subtitle: [0.55, 0.82] }
  ],
  effects: [
    { id: "pan-left", name: "좌→우 팬" },
    { id: "pan-right", name: "우→좌 팬" },
    { id: "pan-top", name: "상→하 팬" },
    { id: "zoom-in", name: "줌 인" },
    { id: "zoom-out", name: "줌 아웃" },
    { id: "parallax", name: "패럴랙스" },
    { id: "mosaic", name: "모자이크" },
    { id: "color-shift", name: "컬러 시프트" },
    { id: "glitch", name: "글리치" },
    { id: "fade-blur", name: "페이드+블러" }
  ],
  textEffects: ["normal", "outline", "shadow", "glow", "gradient", "typewriter", "wave", "pulse", "shake", "fade"],
  latestResults: {
    story_keywords: null,
    image_story: null,
    shorts_script: null,
    shorts_scenes: null,
    video_import: null
  },
  savedRecords: {
    story_keywords: [],
    image_story: [],
    shorts_script: [],
    shorts_scenes: [],
    video_import: []
  },
  activeRecords: {
    story_keywords: null,
    image_story: null,
    shorts_script: null,
    shorts_scenes: null,
    video_import: null
  },
  checkedRecords: {
    story_keywords: new Set(),
    image_story: new Set(),
    shorts_script: new Set(),
    shorts_scenes: new Set(),
    video_import: new Set()
  },
  lastRequests: {
    story_keywords: null,
    image_story: null,
    shorts_script: null,
    shorts_scenes: null,
    video_import: null
  },
  audioResults: {
    shorts_script: null,
    shorts_scenes: null
  }
};

const TOOL_KEYS = {
  STORY: "story_keywords",
  IMAGE_STORY: "image_story",
  SCRIPT: "shorts_script",
  SCENES: "shorts_scenes",
  VIDEO_IMPORT: "video_import"
};

const GENERATION_ENDPOINTS = {
  [TOOL_KEYS.SCRIPT]: { url: "/api/generate/shorts-script", type: "json" },
  [TOOL_KEYS.SCENES]: { url: "/api/generate/shorts-scenes", type: "json" }
};

const AUDIO_CONTAINER_IDS = {
  [TOOL_KEYS.SCRIPT]: "shorts-script-audio",
  [TOOL_KEYS.SCENES]: "shorts-scenes-audio"
};

let pendingRecordSelection = null;
const timelineScrollCleanups = new WeakMap();
const STORAGE_KEY = "kis-selected-record";

export { state, TOOL_KEYS, GENERATION_ENDPOINTS, AUDIO_CONTAINER_IDS, pendingRecordSelection, timelineScrollCleanups, STORAGE_KEY };