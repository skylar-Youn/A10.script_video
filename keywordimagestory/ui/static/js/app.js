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
    video_import: null,
    long_script: null
  },
  savedRecords: {
    story_keywords: [],
    image_story: [],
    shorts_script: [],
    shorts_scenes: [],
    video_import: [],
    long_script: []
  },
  activeRecords: {
    story_keywords: null,
    image_story: null,
    shorts_script: null,
    shorts_scenes: null,
    video_import: null,
    long_script: null
  },
  checkedRecords: {
    story_keywords: new Set(),
    image_story: new Set(),
    shorts_script: new Set(),
    shorts_scenes: new Set(),
    video_import: new Set(),
    long_script: new Set()
  },
  lastRequests: {
    story_keywords: null,
    image_story: null,
    shorts_script: null,
    shorts_scenes: null,
    video_import: null,
    long_script: null
  },
  audioResults: {
    shorts_script: null,
    shorts_scenes: null
  },
  videoTrimQueue: []
};

const TOOL_KEYS = {
  STORY: "story_keywords",
  IMAGE_STORY: "image_story",
  SCRIPT: "shorts_script",
  SCENES: "shorts_scenes",
  VIDEO_IMPORT: "video_import",
  LONG_SCRIPT: "long_script"
};

const GENERATION_ENDPOINTS = {
  [TOOL_KEYS.SCRIPT]: { url: "/api/generate/shorts-script", type: "json" },
  [TOOL_KEYS.SCENES]: { url: "/api/generate/shorts-scenes", type: "json" },
  [TOOL_KEYS.LONG_SCRIPT]: { url: "/api/generate/long-script", type: "json" }
};

const AUDIO_CONTAINER_IDS = {
  [TOOL_KEYS.SCRIPT]: "shorts-script-audio",
  [TOOL_KEYS.SCENES]: "shorts-scenes-audio"
};

const TOOL_ALIAS_MAP = {
  shorts_script: TOOL_KEYS.SCRIPT,
  shorts_scenes: TOOL_KEYS.SCENES
};

const TRIM_LABELS = {
  start: "맨 앞프레임",
  end: "맨 뒤 프레임",
  current: "현재 프레임"
};
const DEFAULT_TRIM_SECONDS = 0.5;

let pendingRecordSelection = null;

const timelineScrollCleanups = new WeakMap();

const STORAGE_KEY = "kis-selected-record";

let activePreviewModal = null;
let allowLongScriptFormSync = true;
const videoLoaderInputs = new Map();
let pendingTrimPreviewTool = null;

async function captureFrameAt(video, time) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error("영상이 준비되지 않았습니다."));
      return;
    }

    const drawFrame = () => {
      try {
        const width = video.videoWidth || video.clientWidth || 1280;
        const height = video.videoHeight || video.clientHeight || 720;
        if (!width || !height) {
          throw new Error("영상 해상도 정보를 가져오지 못했습니다.");
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("캔버스를 초기화하지 못했습니다.");
        }
        context.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/png");
        resolve({ dataUrl, width, height });
      } catch (error) {
        reject(error);
      }
    };

    const cleanupAndReject = (error) => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(error);
    };

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      requestAnimationFrame(drawFrame);
    };

    const onError = () => {
      cleanupAndReject(new Error("영상 프레임을 캡처하는 중 오류가 발생했습니다."));
    };

    if (Math.abs(video.currentTime - time) < 0.01) {
      requestAnimationFrame(drawFrame);
      return;
    }

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try {
      video.currentTime = Math.max(time, 0);
    } catch (error) {
      cleanupAndReject(error);
    }
  });
}

function getVideoToolLabel(tool) {
  switch (tool) {
    case TOOL_KEYS.SCRIPT:
    case "shorts_script":
      return "쇼츠 대본";
    case TOOL_KEYS.SCENES:
    case "shorts_scenes":
      return "쇼츠 장면";
    default:
      return "영상";
  }
}

function persistSelection(tool, recordId, payload) {
  try {
    const value = JSON.stringify({ tool, recordId, payload });
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch (error) {
    console.warn("Failed to persist selection", error);
  }
}

function loadPersistedSelection() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to load persisted selection", error);
    return null;
  }
}

function clearPersistedSelection() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear persisted selection", error);
  }
}

function resolveToolKey(value) {
  if (!value) return null;
  if (Object.values(TOOL_KEYS).includes(value)) {
    return value;
  }
  return TOOL_ALIAS_MAP[value] || null;
}

function getToolAlias(toolKey) {
  const entry = Object.entries(TOOL_ALIAS_MAP).find(([, key]) => key === toolKey);
  return entry ? entry[0] : "";
}

function closePreviewModal() {
  if (!activePreviewModal) return;
  const { backdrop, escHandler, modal } = activePreviewModal;
  if (modal) {
    const video = modal.querySelector("video");
    if (video) {
      try {
        video.pause();
      } catch (error) {
        console.warn("Failed to pause preview video:", error);
      }
      detachTrimBehavior(video);
      video.removeAttribute("src");
      video.load();
    }
    const objectUrl = modal.dataset.videoObjectUrl;
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        console.warn("Failed to revoke object URL:", error);
      }
      delete modal.dataset.videoObjectUrl;
    }
  }
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
  }
  if (backdrop && backdrop.parentNode) {
    backdrop.parentNode.removeChild(backdrop);
  }
  activePreviewModal = null;
}

function openPreviewModal(title, bodyHtml) {
  closePreviewModal();

  const backdrop = document.createElement("div");
  backdrop.className = "preview-backdrop";

  const modal = document.createElement("div");
  modal.className = "preview-modal";
  modal.innerHTML = `
    <header class="preview-modal-header">
      <h3>${title}</h3>
      <button type="button" class="preview-modal-close" aria-label="닫기">×</button>
    </header>
    <div class="preview-content">
      ${bodyHtml}
    </div>
  `;
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const escHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePreviewModal();
    }
  };

  document.addEventListener("keydown", escHandler);

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closePreviewModal();
    }
  });

  const closeBtn = modal.querySelector(".preview-modal-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closePreviewModal();
    });
  }

  activePreviewModal = { backdrop, escHandler, modal };
  return modal;
}

function ensureVideoLoaderInput(tool) {
  let input = videoLoaderInputs.get(tool);
  if (input) return input;
  input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) {
      handleVideoFileSelection(tool, file);
    } else {
      showNotification("선택된 영상이 없습니다.", "error");
    }
    input.value = "";
  });
  document.body.appendChild(input);
  videoLoaderInputs.set(tool, input);
  return input;
}

function handleVideoFileSelection(tool, file) {
  if (!file) {
    showNotification("선택된 영상이 없습니다.", "error");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const safeName = escapeHtml(file.name || "불러온 영상");
  const sizeLabel = formatFileSize(file.size);
  const label = getVideoToolLabel(tool);
  const title = label === "영상" ? "영상 미리보기" : `${label} 영상 미리보기`;
  const body = `
    <div class="video-preview-wrapper">
      <video controls preload="metadata" style="width: 100%; max-height: 480px; background: #000;" data-video-player></video>
      <p class="video-preview-meta">${safeName}${sizeLabel ? ` · ${escapeHtml(sizeLabel)}` : ""}</p>
      <p class="video-preview-trim" data-video-trim-info hidden></p>
      <div style="margin-top: 1rem; text-align: center; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
        <button type="button" class="outline" data-trim-start-frame>⏱️ 맨 앞 자르기</button>
        <button type="button" class="outline" data-trim-end-frame>🏁 맨 뒤 자르기</button>
        <button type="button" class="outline" data-capture-current-frame>📸 현재 위치 캡처</button>
      </div>
      <div class="trim-image-gallery" data-preview-frame-gallery hidden style="margin-top: 1rem;">
        <h4>캡처한 이미지</h4>
        <div class="trim-image-list" data-preview-frame-list></div>
      </div>
    </div>
  `;
  const modal = openPreviewModal(title, body);
  if (modal) {
    modal.dataset.videoObjectUrl = objectUrl;
    setupPreviewModalInteractions(modal, tool);
    const video = modal.querySelector("[data-video-player]");
    if (video) {
      detachTrimBehavior(video);
      video.src = objectUrl;
      attachTrimBehavior(tool, video);
      video.load();
      video.play().catch(() => {});
    }
    const messageLabel = label === "영상" ? "영상" : `${label} 영상`;
    showNotification(`${messageLabel}을 불러왔습니다.`, "success");
    applyTrimToActivePreview(tool);
  } else {
    URL.revokeObjectURL(objectUrl);
  }
}

function handleVideoUrlLoad(tool, url) {
  const trimmed = (url || "").trim();
  if (!trimmed) {
    showNotification("영상 URL을 입력하세요.", "error");
    return;
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    showNotification("올바른 영상 URL이 아닙니다.", "error");
    return;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    showNotification("http 또는 https URL만 지원합니다.", "error");
    return;
  }

  const safeUrl = parsed.toString();
  const label = getVideoToolLabel(tool);
  const title = label === "영상" ? "영상 미리보기" : `${label} 영상 미리보기`;
  const body = `
    <div class="video-preview-wrapper">
      <video controls preload="metadata" style="width: 100%; max-height: 480px; background: #000;" src="${escapeHtml(safeUrl)}"></video>
      <p class="video-preview-meta">${escapeHtml(safeUrl)}</p>
      <p class="video-preview-trim" data-video-trim-info hidden></p>
      <div style="margin-top: 1rem; text-align: center; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
        <button type="button" class="outline" data-trim-start-frame>⏱️ 맨 앞 자르기</button>
        <button type="button" class="outline" data-trim-end-frame>🏁 맨 뒤 자르기</button>
        <button type="button" class="outline" data-capture-current-frame>📸 현재 위치 캡처</button>
      </div>
      <div class="trim-image-gallery" data-preview-frame-gallery hidden style="margin-top: 1rem;">
        <h4>캡처한 이미지</h4>
        <div class="trim-image-list" data-preview-frame-list></div>
      </div>
    </div>
  `;
  const modal = openPreviewModal(title, body);
  if (modal) {
    setupPreviewModalInteractions(modal, tool);
    if (tool) {
      const video = modal.querySelector("video");
      if (video) {
        detachTrimBehavior(video);
        attachTrimBehavior(tool, video);
      }
      applyTrimToActivePreview(tool);
    }
    const messageLabel = label === "영상" ? "영상" : `${label} 영상`;
    showNotification(`${messageLabel}을 불러왔습니다.`, "success");
  }
}

function openVideoLoadDialog(tool) {
  const label = getVideoToolLabel(tool);
  const titleLabel = label === "영상" ? "영상" : `${label} 영상`;
  const description = label === "영상"
    ? "영상 파일을 선택하거나 URL을 입력해 미리보기를 확인하세요."
    : `${label}에 사용할 영상을 선택하거나 URL을 입력해 미리보기를 확인하세요.`;
  const body = `
    <div class="video-load-dialog">
      <p>${escapeHtml(description)}</p>
      <div class="video-load-actions">
        <button type="button" class="outline" data-video-load-file>내 컴퓨터에서 선택</button>
        <button type="button" class="secondary" data-video-load-url>URL 입력</button>
      </div>
      <p class="video-preview-trim" data-video-trim-info hidden></p>
    </div>
  `;
  const modal = openPreviewModal(`${titleLabel} 불러오기`, body);
  if (!modal) return;
  setupPreviewModalInteractions(modal, tool);

  const fileButton = modal.querySelector("[data-video-load-file]");
  if (fileButton) {
    fileButton.addEventListener("click", () => {
      closePreviewModal();
      const input = ensureVideoLoaderInput(tool);
      input.click();
    });
  }

  const urlButton = modal.querySelector("[data-video-load-url]");
  if (urlButton) {
    urlButton.addEventListener("click", () => {
      const value = window.prompt("불러올 영상 URL을 입력하세요.");
      if (value === null) {
        return;
      }
      if (!value.trim()) {
        showNotification("영상 URL을 입력하세요.", "error");
        return;
      }
      closePreviewModal();
      handleVideoUrlLoad(tool, value);
    });
  }
}

async function openTrimPreview(toolAliasOrKey) {
  const toolKey = resolveToolKey(toolAliasOrKey);
  if (!toolKey) {
    showNotification("프레임 자르기 미리보기를 지원하지 않는 도구입니다.", "error");
    return;
  }
  const entries = getTrimEntries(toolKey);
  if (!entries.length) {
    showNotification("등록된 프레임 자르기 명령이 없습니다.", "error");
    return;
  }
  pendingTrimPreviewTool = toolKey;
  try {
    const modal = await showResultPreview(toolKey);
    if (modal) {
      setTimeout(() => {
        const playerSection = modal.querySelector("[data-video-player]");
        if (playerSection) {
          playerSection.hidden = false;
          playerSection.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 200);
    }
  } catch (error) {
    console.error("Failed to open trim preview:", error);
    showNotification(error.message || "프레임 자르기 미리보기를 여는 중 오류가 발생했습니다.", "error");
  } finally {
    pendingTrimPreviewTool = null;
  }
}

async function openTrimImagePreview(toolAliasOrKey, mode = "current") {
  const toolKey = resolveToolKey(toolAliasOrKey);
  if (!toolKey) {
    showNotification("이미지 미리보기를 지원하지 않는 도구입니다.", "error");
    return;
  }
  const result = state.latestResults[toolKey];
  if (!result) {
    showNotification("먼저 결과를 생성하세요.", "error");
    return;
  }

  pendingTrimPreviewTool = toolKey;
  try {
    const modal = await showResultPreview(toolKey);
    if (!modal) return;

    const ensureVisible = () => {
      const playerSection = modal.querySelector("[data-video-player]");
      if (playerSection) {
        playerSection.hidden = false;
      }
      modal.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    setTimeout(ensureVisible, 200);

    const focusOnFrame = async () => {
      const video = modal.querySelector("video");
      if (!video) {
        showNotification("영상 미리보기를 찾을 수 없습니다. 영상을 먼저 선택하세요.", "error");
        return;
      }

      const duration = Number.isFinite(video.duration) ? video.duration : null;
      const { start, end, startTrimmed, endTrimmed } = computeTrimBounds(toolKey, duration);

      let targetTime = 0;
      if (mode === "start") {
        targetTime = startTrimmed && Number.isFinite(start) ? start : start || 0;
      } else if (mode === "end") {
        const fallbackEnd = endTrimmed && end != null && Number.isFinite(end) ? end : duration;
        targetTime = Number.isFinite(fallbackEnd) ? Math.max(fallbackEnd - 0.1, 0) : start || 0;
      } else {
        const effectiveStart = startTrimmed && Number.isFinite(start) ? start : start || 0;
        const effectiveEnd = endTrimmed && end != null && Number.isFinite(end)
          ? end
          : Number.isFinite(duration)
            ? duration
            : effectiveStart;
        const span = Math.max(effectiveEnd - effectiveStart, 0);
        targetTime = Math.max(effectiveStart + span / 2, 0);
      }

      const capture = async () => {
        const previousTime = Number.isFinite(video.currentTime) ? video.currentTime : null;
        const wasPaused = video.paused;
        try {
          video.pause();
          const frame = await captureFrameAt(video, targetTime);
          const label = mode === "start" ? "앞" : mode === "end" ? "뒤" : "현재";
          const timeLabel = formatTimecode(Math.max(targetTime, 0));
          const content = modal.querySelector(".preview-content") || modal;
          let gallery = modal.querySelector("[data-trim-image-gallery]");
          if (!gallery) {
            gallery = document.createElement("section");
            gallery.className = "preview-section trim-image-gallery";
            gallery.dataset.trimImageGallery = "true";
            gallery.innerHTML = `
              <h4>캡처한 이미지</h4>
              <div class="trim-image-list" data-trim-image-list></div>
            `;
            content.insertBefore(gallery, content.firstChild);
          }
          const list = gallery.querySelector("[data-trim-image-list]");
          if (list) {
            const item = document.createElement("article");
            item.className = "trim-image-card";
            item.innerHTML = `
              <figure>
                <img src="${frame.dataUrl}" alt="${label} 이미지" loading="lazy" />
                <figcaption>${label} 지점 · ${timeLabel}</figcaption>
              </figure>
              <div class="trim-image-actions">
                <a href="${frame.dataUrl}" download="${toolKey}-${mode}-frame.png" class="outline">PNG 다운로드</a>
                <button type="button" class="secondary" data-save-frame>서버에 저장</button>
              </div>
            `;
            list.prepend(item);
            const saveButton = item.querySelector("[data-save-frame]");
            if (saveButton) {
              saveButton.dataset.frameData = frame.dataUrl;
              saveButton.dataset.frameLabel = label;
              saveButton.dataset.frameTime = timeLabel;
              saveButton.dataset.frameTool = toolKey;
            }
          }
          showNotification(`${label} 이미지 프레임을 캡처했습니다.`, "success");
        } catch (error) {
          console.error("Failed to capture frame:", error);
          showNotification(error.message || "이미지를 캡처하지 못했습니다.", "error");
        } finally {
          if (previousTime !== null) {
            try {
              video.currentTime = previousTime;
            } catch (error) {
              console.warn("Failed to restore video time after capture:", error);
            }
          }
          if (!wasPaused) {
            video.play().catch(() => {});
          }
        }
      };

      if (video.readyState >= 1) {
        capture();
      } else {
        video.addEventListener("loadedmetadata", () => capture(), { once: true });
      }
    };

    setTimeout(() => {
      focusOnFrame().catch((error) => {
        console.error("Failed to focus on trim frame:", error);
        showNotification(error.message || "이미지를 캡처하지 못했습니다.", "error");
      });
    }, 350);
  } catch (error) {
    console.error("Failed to open trim image preview:", error);
    showNotification(error.message || "이미지 미리보기를 여는 중 오류가 발생했습니다.", "error");
  } finally {
    pendingTrimPreviewTool = null;
  }
}

async function api(path, options = {}) {
  const init = { ...options };
  const headers = new Headers(init.headers || {});
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (hasHeaderEntries(headers)) {
    init.headers = headers;
  } else {
    delete init.headers;
  }

  const response = await fetch(path, init);
  const rawBody = await response.text();

  if (!response.ok) {
    let payload;
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (error) {
        payload = rawBody;
      }
    }
    const message = extractErrorMessage(payload) || response.statusText || `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204 || rawBody === "") {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    return rawBody;
  }
}

function hasHeaderEntries(headers) {
  for (const _ of headers.keys()) {
    return true;
  }
  return false;
}

function extractErrorMessage(detail) {
  if (detail === null || detail === undefined) {
    return "";
  }
  if (typeof detail === "string") {
    return detail.trim();
  }
  if (typeof detail === "number" || typeof detail === "boolean") {
    return String(detail);
  }
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => extractErrorMessage(item)).filter(Boolean);
    return messages.join("\n");
  }
  if (typeof detail === "object") {
    if (detail.detail !== undefined) {
      return extractErrorMessage(detail.detail);
    }
    if (detail.msg) {
      const location = Array.isArray(detail.loc) && detail.loc.length ? ` (${detail.loc.join(" > ")})` : "";
      return `${detail.msg}${location}`;
    }
    if (detail.message) {
      return extractErrorMessage(detail.message);
    }
    if (detail.error) {
      return extractErrorMessage(detail.error);
    }
    const nested = Object.values(detail)
      .map((value) => extractErrorMessage(value))
      .filter(Boolean);
    return nested.join("\n");
  }
  try {
    return JSON.stringify(detail);
  } catch (error) {
    return "";
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtml(value) {
  if (value === null || value === undefined) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

async function handleCopyButton(button) {
  const rawValue = button.getAttribute("data-copy-text") || "";
  const label = button.getAttribute("data-copy-label") || button.textContent || "복사";
  const successText = button.getAttribute("data-copy-success") || "복사 완료!";
  const decoded = decodeHtml(rawValue);
  if (!decoded) {
    alert("복사할 내용이 없습니다.");
    return;
  }
  try {
    await navigator.clipboard.writeText(decoded);
    button.blur();
    button.textContent = successText;
    button.disabled = true;
    setTimeout(() => {
      button.textContent = label;
      button.disabled = false;
    }, 2000);
  } catch (error) {
    console.error("Failed to copy text:", error);
    alert("클립보드로 복사하지 못했습니다. 브라우저 권한을 확인하거나 직접 복사해 주세요.");
  }
}

function formatTime(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return Number(value).toFixed(1);
}

function toSafeString(value, fallback = "") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (value === null || value === undefined) return fallback;
  try {
    const serialised = JSON.stringify(value);
    return serialised && serialised !== "{}" ? serialised : fallback;
  } catch (error) {
    return String(value);
  }
}

function formatTimecode(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "00:00:00,000";
  }
  const total = Math.max(0, Number(value));
  const hours = Math.floor(total / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  const millis = Math.round((total - Math.floor(total)) * 1000)
    .toString()
    .padStart(3, "0");
  return `${hours}:${minutes}:${seconds},${millis}`;
}

function parseTimecodeString(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  if ([hours, minutes, seconds, millis].some((num) => Number.isNaN(num))) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function toSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = parseTimecodeString(value.trim());
    if (parsed !== null) return parsed;
    const numeric = Number(value.trim());
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function applySegmentTimes(segment, startSeconds, endSeconds) {
  if (!segment || typeof segment !== "object") return;
  if (Number.isFinite(startSeconds)) {
    if (typeof segment.start === "number") segment.start = startSeconds;
    if (typeof segment.start_time === "string") segment.start_time = formatTimecode(startSeconds);
  }
  if (Number.isFinite(endSeconds)) {
    if (typeof segment.end === "number") segment.end = endSeconds;
    if (typeof segment.end_time === "string") segment.end_time = formatTimecode(endSeconds);
  }
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function toOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function displayAudioResult(tool, result) {
  const containerId = AUDIO_CONTAINER_IDS[tool];
  if (!containerId) return;
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!result || !result.url) {
    container.innerHTML = '<div class="placeholder"><p>자막 음성 변환 결과가 여기에 표시됩니다.</p></div>';
    return;
  }

  const extra = [];
  if (result.character_count) {
    extra.push(`${escapeHtml(String(result.character_count))}자`);
  }
  const meta = extra.length ? ` · ${extra.join(" · ")}` : "";

  container.innerHTML = `
    <article class="audio-link">
      <span>음성 파일 (${escapeHtml(result.voice || "alloy")} · ${escapeHtml(result.format || "mp3")}${meta}):</span>
      <a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">다운로드</a>
    </article>
  `;
}

function updateRecordSelectOptions() {
  const toolSelect = document.getElementById("tool-selection");
  const recordSelect = document.getElementById("record-selection");
  if (!toolSelect || !recordSelect) return;

  const selectedTool = toolSelect.value;
  console.log("updateRecordSelectOptions called with tool:", selectedTool);
  recordSelect.innerHTML = '<option value="">선택하세요</option>';

  if (!selectedTool) {
    recordSelect.disabled = true;
    recordSelect.value = "";
    return;
  }

  const records = state.savedRecords[selectedTool] || [];
  console.log("Records for", selectedTool, ":", records.length, records);
  const optionMarkup = records
    .map((record) => `<option value="${record.id}">${escapeHtml(record.title || record.id)}</option>`)
    .join("");
  recordSelect.insertAdjacentHTML("beforeend", optionMarkup);
  recordSelect.disabled = records.length === 0;
  console.log("Dropdown updated. Options count:", recordSelect.options.length, "Disabled:", recordSelect.disabled);

  const persisted = loadPersistedSelection();
  const targetRecordId = pendingRecordSelection || (persisted && persisted.tool === selectedTool ? persisted.recordId : "");
  if (targetRecordId && records.some((record) => record.id === targetRecordId)) {
    recordSelect.value = targetRecordId;
    state.activeRecords[selectedTool] = targetRecordId;
    pendingRecordSelection = null;
  } else if (records.length === 0) {
    recordSelect.value = "";
  }
}

function parseChatGPTResult(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const items = [];

  for (const line of lines) {
    // 숫자로 시작하는 줄을 찾아서 제목으로 추출
    const match = line.match(/^(\d+)[.)\-:]?\s*(.+)/);
    if (match) {
      const [, index, title] = match;
      items.push({
        index: parseInt(index),
        text: title.trim()
      });
    }
  }

  // 만약 번호가 없는 경우, 각 줄을 제목으로 처리
  if (items.length === 0) {
    lines.forEach((line, i) => {
      if (line.length > 0) {
        items.push({
          index: i + 1,
          text: line
        });
      }
    });
  }

  return items;
}

function parseChatGPTImageResult(text) {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\r/g, '').trim())
    .filter((line) => line.length > 0);

  const groups = [];
  let buffer = [];

  const flush = () => {
    if (!buffer.length) return;

    const first = buffer[0];
    const match = first.match(/^(\d+)(?:[.)\]\-:：）])?\s*(.*)$/);
    if (!match) {
      buffer = [];
      return;
    }

    const index = parseInt(match[1], 10);
    const remainder = match[2].trim();
    const contentLines = [];
    if (remainder) {
      contentLines.push(remainder);
    }
    if (buffer.length > 1) {
      contentLines.push(...buffer.slice(1));
    }

    const cleanedLines = contentLines
      .map((line) =>
        line
          .replace(/^[\-\*\u2022•·●▪▹►▶□■☑︎❖⦿\s]+/, '')
          .trim()
      )
      .filter((line) => line.length > 0);

    if (!cleanedLines.length) {
      const fallbackTitle = `항목 ${index}`;
      groups.push({
        index,
        title: fallbackTitle,
        description: '',
        text: fallbackTitle,
      });
      buffer = [];
      return;
    }

    let titlePart = '';
    const descriptionParts = [];

    cleanedLines.forEach((line) => {
      const normalised = line.replace(/\s+/g, ' ').trim();
      const titleMatch = normalised.match(/^(제목|타이틀|title)\s*[:：\-]\s*(.+)$/i);
      if (titleMatch) {
        if (!titlePart) {
          titlePart = titleMatch[2].trim();
        }
        return;
      }

      const descriptionMatch = normalised.match(/^(씬\s*묘사|장면\s*묘사|이미지\s*묘사|묘사|설명|description|scene\s*description)\s*[:：\-]\s*(.+)$/i);
      if (descriptionMatch) {
        descriptionParts.push(descriptionMatch[2].trim());
        return;
      }

      if (!titlePart) {
        titlePart = normalised;
      } else {
        descriptionParts.push(normalised);
      }
    });

    if (!titlePart) {
      titlePart = cleanedLines[0].trim();
    }

    const descriptionPart = descriptionParts.join(' ').trim();
    const combinedText = [titlePart, descriptionPart].filter(Boolean).join(' ').trim();

    groups.push({
      index,
      title: titlePart.trim(),
      description: descriptionPart,
      text: combinedText || titlePart.trim(),
    });
    buffer = [];
  };

  lines.forEach((line) => {
    if (/^\d+/.test(line)) {
      flush();
      buffer = [line];
    } else if (buffer.length) {
      buffer.push(line);
    }
  });
  flush();

  if (groups.length) {
    return groups.map((item) => ({
      index: item.index,
      title: (item.title && item.title.trim()) || item.text,
      description: item.description ? item.description.trim() : '',
      text: item.text,
    }));
  }

  return parseChatGPTResult(text).map((item) => ({
    index: item.index,
    title: item.text,
    description: '',
    text: item.text,
  }));
}

function parseTimecodeToSeconds(timecode) {
  if (typeof timecode !== "string") return null;
  const match = timecode.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4], 10);
  if ([hours, minutes, seconds, millis].some((value) => Number.isNaN(value))) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function parseChatGPTScenesResult(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { subtitles: [], scenes: [] };
  }

  const subtitles = [];
  const sceneMap = new Map();

  const ensureScene = (index) => {
    if (!sceneMap.has(index)) {
      sceneMap.set(index, {
        scene_tag: `씬 ${index}`,
        action: "",
        camera: "",
        mood: "",
        start: null,
        end: null
      });
    }
    return sceneMap.get(index);
  };

  const sceneSectionRegex = /\[Scene\s*(\d+)\]([\s\S]*?)(?=\[Scene\s*\d+\]|\[Filming Directions\]|\Z)/gi;
  let match;
  while ((match = sceneSectionRegex.exec(text)) !== null) {
    const index = parseInt(match[1], 10);
    if (Number.isNaN(index)) continue;
    const block = match[2].trim();
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

    let startSeconds = null;
    let endSeconds = null;
    let dialogue = "";
    let cameraInfo = "";

    lines.forEach((line) => {
      if (!startSeconds) {
        const timeMatch = line.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
        if (timeMatch) {
          startSeconds = parseTimecodeToSeconds(timeMatch[1]);
          endSeconds = parseTimecodeToSeconds(timeMatch[2]);
          return;
        }
      }

      const dialogueMatch = line.match(/^Dialogue:\s*["“]?([\s\S]*?)["”]?$/i);
      if (dialogueMatch) {
        dialogue = dialogueMatch[1].trim();
        return;
      }

      const cameraMatch = line.match(/^Camera:\s*([\s\S]*)$/i);
      if (cameraMatch) {
        cameraInfo = cameraMatch[1].trim();
      }
    });

    if (dialogue) {
      subtitles.push({
        index,
        start: startSeconds !== null ? startSeconds : undefined,
        end: endSeconds !== null ? endSeconds : undefined,
        text: dialogue,
        scene_tag: `[씬 ${index}]`
      });
    }

    const scene = ensureScene(index);
    if (startSeconds !== null) scene.start = startSeconds;
    if (endSeconds !== null) scene.end = endSeconds;
    if (dialogue) {
      scene.action = scene.action
        ? `${scene.action}\nDialogue: ${dialogue}`
        : `Dialogue: ${dialogue}`;
    }
    if (cameraInfo) {
      scene.camera = scene.camera ? `${scene.camera} | ${cameraInfo}` : cameraInfo;
    }
  }

  const fdMatch = text.match(/\[Filming Directions\]([\s\S]*)$/i);
  if (fdMatch) {
    const fdText = fdMatch[1];
    const fdRegex = /\[Scene\s*(\d+)\]([\s\S]*?)(?=\[Scene\s*\d+\]|\Z)/gi;
    let fdBlock;
    while ((fdBlock = fdRegex.exec(fdText)) !== null) {
      const index = parseInt(fdBlock[1], 10);
      if (Number.isNaN(index)) continue;
      const block = fdBlock[2].trim();
      if (!block) continue;
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      if (!lines.length) continue;

      const scene = ensureScene(index);
      const detailLines = [];

      lines.forEach((line) => {
        const detailMatch = line.match(/^([A-Za-z가-힣\s]+):\s*(.+)$/);
        if (!detailMatch) return;
        const label = detailMatch[1].trim();
        const value = detailMatch[2].trim();
        const lower = label.toLowerCase();

        if (lower === "mood" || lower === "분위기") {
          scene.mood = value;
        } else if (lower === "camera") {
          scene.camera = scene.camera ? `${scene.camera} | ${value}` : value;
        } else {
          detailLines.push(`${label}: ${value}`);
        }
      });

      if (detailLines.length) {
        const detailText = detailLines.join(" | ");
        scene.action = scene.action
          ? `${scene.action}\n${detailText}`
          : detailText;
      }
    }
  }

  const sortedSubtitles = subtitles.sort((a, b) => (a.index || 0) - (b.index || 0));

  const scenes = Array.from(sceneMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, scene]) => scene);

  return { subtitles: sortedSubtitles, scenes };
}

function buildExistingSRTString(subtitles = []) {
  const ensureTimecode = (value) => {
    if (typeof value === "string" && /\d{2}:\d{2}:\d{2},\d{3}/.test(value)) {
      return value;
    }
    if (typeof value === "number") {
      return formatTimecode(value);
    }
    return "00:00:00,000";
  };

  return subtitles
    .map((subtitle, idx) => {
      const index = subtitle.index ?? idx + 1;
      const start = ensureTimecode(subtitle.start);
      const end = ensureTimecode(subtitle.end);
      const text = subtitle.text || "";
      const tag = subtitle.scene_tag ? ` ${subtitle.scene_tag}` : "";
      return `${index}\n${start} --> ${end}\n${text}${tag}\n`;
    })
    .join("\n")
    .trim();
}

function createScriptContinuationPrompt({ keyword, language, existingSRT, nextIndex, nextImage, nextStartTimecode, summary = [] }) {
  const isKorean = (language || "ko").toLowerCase().startsWith("ko");
  const instructions = isKorean
    ? `### 작업 지시

1. 위 자막 내용을 세 줄의 핵심 bullet로 한국어로 요약하세요.
2. 기존 스토리의 흐름을 이어 가면서 새로운 60초 분량 SRT 자막을 작성하세요. 자막 번호는 ${nextIndex}번부터 시작하고, 타임스탬프는 ${nextStartTimecode} 이후로 자연스럽게 이어지도록 설정하세요. 각 자막 끝에는 [이미지 #] 태그를 붙이고, 이미지 번호는 ${nextImage}번부터 순차적으로 사용하세요.
3. 새 자막 작성이 끝나면, 해당 자막과 매칭되는 이미지 묘사를 목록 형태로 작성하세요. 각 항목은 "- [이미지 X] ..." 형식을 지키고, 분위기·조명·배경·행동을 생생하게 묘사하세요.
`
    : `### Tasks

1. Summarize the existing subtitles above in exactly three bullet points.
2. Continue the narrative with a NEW 60-second SRT script. Start numbering from ${nextIndex} and keep timestamps following ${nextStartTimecode}. End every subtitle with [Image #], continuing numbering from ${nextImage}.
3. After the new SRT, list matching cinematic image descriptions using the format "- [Image X] ..." with vivid details (mood, lighting, setting, motion).
`;

  const normalizedSummary = Array.isArray(summary)
    ? summary.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  const exampleStart = nextStartTimecode || "00:00:00,000";
  const outputFormat = isKorean
    ? `# 출력 형식

**[요약]**
- 요약 1
- 요약 2
- 요약 3

**[SRT 자막]**
${nextIndex}
${exampleStart} --> ...
대사... [이미지 ${nextImage}]

...

**[이미지 장면 묘사]**
- [이미지 ${nextImage}] ...
- ...

스토리 키워드: "${keyword || "Moonlit Song of the Robo Dog"}"
`
    : `# Output Format

**[Summary]**
- Bullet 1
- Bullet 2
- Bullet 3

**[SRT Subtitles]**
${nextIndex}
${exampleStart} --> ...
Line... [Image ${nextImage}]

...

**[Image Descriptions]**
- [Image ${nextImage}] ...
- ...

Story keyword: "${keyword || "Moonlit Song of the Robo Dog"}"
`;

  const summarySection = normalizedSummary.length
    ? (isKorean
        ? `이전 요약:
${normalizedSummary.map((item) => `- ${item}`).join("\n")}

`
        : `Previous summary:
${normalizedSummary.map((item) => `- ${item}`).join("\n")}

`)
    : "";

  const header = isKorean
    ? `${summarySection}기존 SRT 자막 (참고용):

${existingSRT}

새로운 자막은 기존 흐름을 잇되, 포맷을 반드시 지켜주세요.
`
    : `${summarySection}Existing SRT subtitles (for reference):

${existingSRT}

Continue the story while respecting the established format.
`;

  return `${header}
${instructions}
${outputFormat}`.trim();
}
function parseChatGPTShortsResult(text) {
  const subtitles = [];
  const images = [];
  const summary = [];

  const summaryPatterns = [
    /\*\*\[(?:Summary|요약)\]\*\*([\s\S]*?)(?=\*\*\[|$)/i,
    /\[(?:Summary|요약)\]([\s\S]*?)(?=\[|$)/i
  ];

  for (const pattern of summaryPatterns) {
    const match = text.match(pattern);
    if (match) {
      const lines = match[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      lines.forEach((line) => {
        const bulletMatch = line.match(/^(?:[-–•\*]\s*|^\d+[.)]\s*)(.+)$/);
        if (bulletMatch) {
          summary.push(bulletMatch[1].trim());
        } else {
          summary.push(line);
        }
      });
      break;
    }
  }

  // 먼저 [SRT 자막] 섹션 찾기 (여러 형태 지원)
  let srtText = "";
  const srtMatch1 = text.match(/\*\*\[SRT 자막\]\*\*([\s\S]*?)(?=\*\*\[(?:이미지 장면 묘사|이미지 프롬프트|image scene description|image prompts)\]\*\*|$)/i);
  const srtMatch2 = text.match(/\[SRT 자막\]([\s\S]*?)(?=\[(?:이미지 장면 묘사|이미지 프롬프트|image scene description|image prompts)\]|$)/i);

  if (srtMatch1) {
    srtText = srtMatch1[1];
  } else if (srtMatch2) {
    srtText = srtMatch2[1];
  } else {
    // 섹션 헤더가 없으면 전체 텍스트에서 SRT 형식 찾기
    srtText = text;
  }

  // SRT 형식 파싱: 번호, 타임코드, 텍스트를 각각의 블록으로 분리
  const lines = srtText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // 번호가 있는 라인 찾기
    if (/^\d+$/.test(line)) {
      const index = parseInt(line);
      i++;

      // 다음 라인이 타임코드인지 확인
      if (i < lines.length) {
        const timeLine = lines[i].trim();
        const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

        if (timeMatch) {
          i++;

          // 텍스트 라인들 수집 (빈 라인이 나올 때까지)
          const textLines = [];
          while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i].trim());
            i++;
          }

          const fullText = textLines.join(' ');

          // [이미지 #] 태그 추출
          const imageTagMatch = fullText.match(/\[(?:이미지|image)\s*(\d+)\]/i);
          const cleanText = fullText.replace(/\[(?:이미지|image)\s*\d+\]/gi, '').trim();

          subtitles.push({
            index: index,
            start: timeMatch[1],
            end: timeMatch[2],
            text: cleanText,
            scene_tag: imageTagMatch ? `[이미지 ${imageTagMatch[1]}]` : ""
          });
        }
      }
    }
    i++;
  }

  // 이미지 장면 묘사 부분 추출 (여러 형태 지원)
  let imageText = "";
  const imageSectionPatterns = [
    /\*\*\[(?:이미지 장면 묘사|이미지 프롬프트|image scene description|image prompts)\]\*\*([\s\S]*?)$/i,
    /\[(?:이미지 장면 묘사|이미지 프롬프트|image scene description|image prompts)\]([\s\S]*?)$/i
  ];

  for (const pattern of imageSectionPatterns) {
    const match = text.match(pattern);
    if (match) {
      imageText = match[1];
      break;
    }
  }

  if (imageText) {
    const imageLines = imageText
      .split('\n')
      .filter((line) => line.trim().match(/^\-?\s*\[(?:이미지|image)\s*\d+\]/i));

    imageLines.forEach((line, idx) => {
      const match = line.match(/^\-?\s*\[(?:이미지|image)\s*(\d+)\]\s*(.+)/i);
      if (match) {
        const imageNum = parseInt(match[1]);
        const description = match[2].trim();

        images.push({
          tag: `이미지 ${imageNum}`,
          description: description,
          start: null,
          end: null
        });
      }
    });
  }

  return { subtitles, images, summary };
}

function renderStoryKeywordResults(result) {
  const container = document.getElementById("story-keyword-results");
  if (!container) return;

  const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.titles) ? result.titles : []);
  if (!items.length) {
    container.innerHTML = '<div class="placeholder"><p>생성된 항목이 없습니다. 다른 키워드를 시도해 보세요.</p></div>';
    return;
  }

  const listMarkup = items
    .map((item, index) => {
      const text = escapeHtml(item.text ?? "");
      return `<li>${text}</li>`;
    })
    .join("");

  container.innerHTML = `
    <article>
      <header>
        <div>
          <h2>생성된 키워드</h2>
          <p class="status">입력 키워드: <strong>${escapeHtml(result.keyword ?? "")}</strong> · 총 ${items.length}개</p>
        </div>
        <small class="status">언어: ${escapeHtml(result.language ?? "ko")}</small>
      </header>
      <ol>
        ${listMarkup}
      </ol>
    </article>
  `;
}

function renderImageStoryResults(result) {
  const container = document.getElementById("image-story-results");
  if (!container) return;

  const items = Array.isArray(result?.items) ? result.items : [];
  if (!items.length) {
    container.innerHTML = '<div class="placeholder"><p>생성된 결과가 없습니다. 다른 이미지를 시도해 보세요.</p></div>';
    return;
  }

  const listMarkup = items
    .map((item, index) => {
      const label = typeof item.index === "number" ? item.index : index + 1;
      const rawTitle = item.title ?? item.text ?? item.name ?? "";
      const rawDescription = item.description ?? item.desc ?? item.text_detail ?? "";
      const title = escapeHtml(String(rawTitle));
      const description = escapeHtml(String(rawDescription));
      return `
        <li>
          <header><strong>${label}. ${title}</strong></header>
          <p>${description}</p>
        </li>
      `;
    })
    .join("");

  const infoRows = [];
  const source = result?.source ?? {};
  if (source.image_filename) {
    const sizeLabel = source.image_size ? ` (${escapeHtml(String(source.image_size))} bytes)` : "";
    infoRows.push(`<li><strong>이미지 파일</strong> ${escapeHtml(source.image_filename)}${sizeLabel}</li>`);
  }
  if (source.description) {
    infoRows.push(`<li><strong>사용자 설명</strong> ${escapeHtml(source.description)}</li>`);
  }

  container.innerHTML = `
    <article>
      <header>
        <div>
          <h3>생성된 이미지 스토리</h3>
          <p class="status">총 ${items.length}개 · 키워드: <strong>${escapeHtml(result.keyword ?? "")}</strong></p>
        </div>
        <small class="status">언어: ${escapeHtml(result.language ?? "ko")}</small>
      </header>
      ${infoRows.length ? `<ul class="context-info">${infoRows.join("")}</ul>` : ""}
      <ol>
        ${listMarkup}
      </ol>
    </article>
  `;
}

function renderShortsScriptResults(result) {
  const container = document.getElementById("shorts-script-results");
  if (!container) return;

  const subtitles = Array.isArray(result?.subtitles) ? result.subtitles : [];
  const images = Array.isArray(result?.images) ? result.images : [];
  const summaryItems = Array.isArray(result?.summary) ? result.summary : [];
  const languageCode = (result?.language || "ko").toLowerCase();
  const headerMarkup = `
    <header class="result-header">
      <div class="result-header-main">
        <h3>쇼츠용 SRT 대본</h3>
        <p class="status">키워드: <strong>${escapeHtml(result?.keyword ?? "")}</strong> · 언어: ${escapeHtml(result?.language ?? "ko")}</p>
      </div>
      <div class="result-header-actions">
        <span class="trim-counter" data-trim-counter="shorts_script" hidden></span>
        <button type="button" class="secondary" data-action="gpt-translate-script" title="ChatGPT로 전체 번역 비교 요청">GPT 번역 요청</button>
      </div>
    </header>
  `;

  if (!subtitles.length && !images.length) {
    if (summaryItems.length) {
      const summaryHeading = languageCode.startsWith("ko") ? "요약" : "Summary";
      const summaryMarkup = summaryItems
        .map((bullet) => `<li>${escapeHtml(typeof bullet === "string" ? bullet : String(bullet))}</li>`)
        .join("");
      container.innerHTML = `
        <article>
          ${headerMarkup}
          <section class="summary-section">
            <h4>${summaryHeading}</h4>
            <ul class="summary-list">${summaryMarkup}</ul>
          </section>
        </article>
      `;
      updateTrimBadge(TOOL_KEYS.SCRIPT);
      return;
    }
    container.innerHTML = '<div class="placeholder"><p>생성된 결과가 없습니다. 다른 키워드를 시도해 보세요.</p></div>';
    updateTrimBadge(TOOL_KEYS.SCRIPT);
    return;
  }

  const subtitleMarkup = subtitles
    .map((segment) => {
      const index = typeof segment.index === "number" ? segment.index : "-";
      const start = formatTimecode(segment.start);
      const end = formatTimecode(segment.end);
      const rawTag = segment.scene_tag ?? "";
      const text = escapeHtml(segment.text ?? "");
      const tag = escapeHtml(rawTag);
      const copyText = `${index}\n${start} --> ${end}\n${segment.text ?? ""}${rawTag ? ` ${rawTag}` : ""}`;
      const copyAttr = escapeHtml(copyText).replace(/\n/g, "&#10;");
      return `
        <li>
          <header><strong>${index}</strong> <span>${start} → ${end}</span></header>
          <p>${text}</p>
          <small>${tag}</small>
          <div class="item-actions">
            <button type="button" class="secondary copy-btn" data-copy-text="${copyAttr}" data-copy-label="복사">복사</button>
          </div>
        </li>
      `;
    })
    .join("");

  const imageMarkup = images
    .map((prompt, idx) => {
      const rawTag = prompt.tag ?? `이미지 ${idx + 1}`;
      const rawDescription = prompt.description ?? "";
      const tag = escapeHtml(rawTag);
      const description = escapeHtml(rawDescription);
      const start = prompt.start !== undefined && prompt.start !== null ? formatTimecode(prompt.start) : "-";
      const end = prompt.end !== undefined && prompt.end !== null ? formatTimecode(prompt.end) : "-";
      const copyText = `${rawTag} ${rawDescription}`.trim();
      const copyAttr = escapeHtml(copyText).replace(/\n/g, "&#10;");
      return `
        <li>
          <header><strong>${tag}</strong> <span>${start} → ${end}</span></header>
          <p>${description}</p>
          <div class="item-actions">
            <button type="button" class="secondary copy-btn" data-copy-text="${copyAttr}" data-copy-label="복사">복사</button>
          </div>
        </li>
      `;
    })
    .join("");

  const summaryMarkup = summaryItems
    .map((bullet, idx) => `<li>${escapeHtml(typeof bullet === "string" ? bullet : String(bullet))}</li>`)
    .join("");
  const summaryHeading = languageCode.startsWith("ko") ? "요약" : "Summary";
  const summarySection = summaryItems.length
    ? `<section class="summary-section">
        <h4>${summaryHeading}</h4>
        <ul class="summary-list">${summaryMarkup}</ul>
      </section>`
    : "";

  container.innerHTML = `
    <article>
      ${headerMarkup}
      ${summarySection}
      <div class="grid">
        <section>
          <h4>자막 타임라인</h4>
          <ol class="srt-list">${subtitleMarkup || '<li>자막이 없습니다.</li>'}</ol>
        </section>
        <section>
          <h4>이미지 장면 프롬프트</h4>
          <ol class="prompt-list">${imageMarkup || '<li>이미지 프롬프트가 없습니다.</li>'}</ol>
        </section>
      </div>
    </article>
  `;
  updateTrimBadge(TOOL_KEYS.SCRIPT);
  displayAudioResult(TOOL_KEYS.SCRIPT, state.audioResults[TOOL_KEYS.SCRIPT]);
}

function renderShortsSceneResults(result) {
  const container = document.getElementById("shorts-scenes-results");
  if (!container) return;

  const subtitles = Array.isArray(result?.subtitles) ? result.subtitles : [];
  const scenes = Array.isArray(result?.scenes) ? result.scenes : [];
  const rawScript = typeof result?.script === "string" ? result.script.trim() : "";
  const headerMarkup = `
    <header class="result-header">
      <div class="result-header-main">
        <h3>쇼츠용 씬 대본</h3>
        <p class="status">키워드: <strong>${escapeHtml(result?.keyword ?? "")}</strong> · 언어: ${escapeHtml(result?.language ?? "ko")}</p>
      </div>
      <div class="result-header-actions">
        <span class="trim-counter" data-trim-counter="shorts_scenes" hidden></span>
        <button type="button" class="secondary" data-action="gpt-translate-scenes" title="ChatGPT로 전체 번역 비교 요청">GPT 번역 요청</button>
      </div>
    </header>
  `;

  if (!subtitles.length && !scenes.length) {
    if (rawScript) {
      container.innerHTML = `
        <article>
          ${headerMarkup}
          <pre class="script-preview">${escapeHtml(rawScript)}</pre>
        </article>
      `;
      updateTrimBadge(TOOL_KEYS.SCENES);
      return;
    }
    container.innerHTML = '<div class="placeholder"><p>생성된 결과가 없습니다. 다른 키워드를 시도해 보세요.</p></div>';
    updateTrimBadge(TOOL_KEYS.SCENES);
    return;
  }

  const subtitleMarkup = subtitles
    .map((segment) => {
      const index = typeof segment.index === "number" ? segment.index : "-";
      const start = formatTimecode(segment.start);
      const end = formatTimecode(segment.end);
      const text = escapeHtml(segment.text ?? "");
      const tag = escapeHtml(segment.scene_tag ?? "");
      const rawTag = segment.scene_tag ?? "";
      const copyText = `${index}\n${start} --> ${end}\n${segment.text ?? ""}${rawTag ? ` ${rawTag}` : ""}`;
      const copyAttr = escapeHtml(copyText).replace(/\n/g, "&#10;");
      return `
        <li>
          <header><strong>${index}</strong> <span>${start} → ${end}</span></header>
          <p>${text}</p>
          <small>${tag}</small>
          <div class="item-actions">
            <button type="button" class="secondary copy-btn" data-copy-text="${copyAttr}" data-copy-label="복사">복사</button>
          </div>
        </li>
      `;
    })
    .join("");

  const sceneMarkup = scenes
    .map((scene, idx) => {
      const tag = escapeHtml(scene.scene_tag ?? `씬 ${idx + 1}`);
      const actionRaw = scene.action ?? "";
      const action = escapeHtml(actionRaw).replace(/\n/g, "<br>");
      const cameraRaw = scene.camera ?? "";
      const camera = escapeHtml(cameraRaw);
      const mood = escapeHtml(scene.mood ?? "");
      const start = scene.start !== undefined && scene.start !== null ? formatTimecode(scene.start) : "-";
      const end = scene.end !== undefined && scene.end !== null ? formatTimecode(scene.end) : "-";
      const copyText = `${scene.scene_tag ?? `씬 ${idx + 1}`}\n${actionRaw}\n카메라: ${cameraRaw} · 분위기: ${scene.mood ?? ""}`.trim();
      const copyAttr = escapeHtml(copyText).replace(/\n/g, "&#10;");
      return `
        <li>
          <header><strong>${tag}</strong> <span>${start} → ${end}</span></header>
          <p>${action}</p>
          <small>카메라: ${camera} · 분위기: ${mood}</small>
          <div class="item-actions">
            <button type="button" class="secondary copy-btn" data-copy-text="${copyAttr}" data-copy-label="복사">복사</button>
          </div>
        </li>
      `;
    })
    .join("");

  container.innerHTML = `
    <article>
      ${headerMarkup}
      <div class="grid">
        <section>
          <h4>SRT 구간</h4>
          <ol class="srt-list">${subtitleMarkup || '<li>자막이 없습니다.</li>'}</ol>
        </section>
        <section>
          <h4>영상 장면 프롬프트</h4>
          <ol class="prompt-list">${sceneMarkup || '<li>장면 프롬프트가 없습니다.</li>'}</ol>
        </section>
      </div>
    </article>
  `;
  updateTrimBadge(TOOL_KEYS.SCENES);
  displayAudioResult(TOOL_KEYS.SCENES, state.audioResults[TOOL_KEYS.SCENES]);
}

function renderLongScriptResults(result) {
  const container = document.getElementById("long-script-results");
  if (!container) return;

  const form = document.getElementById("long-script-form");
  const editor = document.getElementById("long-script-editor");
  const topicInput = form ? form.querySelector("input[name='script_topic']") : null;
  const languageSelect = form ? form.querySelector("select[name='script_language']") : null;

  if (allowLongScriptFormSync) {
    const topic = typeof result?.topic === "string" ? result.topic : "";
    if (topicInput) {
      topicInput.value = topic;
    }
    if (languageSelect) {
      const langValue = typeof result?.language === "string" && result.language ? result.language : languageSelect.value || "ko";
      const matchedOption = Array.from(languageSelect.options).some((option) => option.value === langValue);
      languageSelect.value = matchedOption ? langValue : languageSelect.options[0]?.value || "ko";
    }
    if (editor) {
      const nextValue =
        typeof result?.content === "string"
          ? result.content
          : typeof result?.script === "string"
            ? result.script
            : typeof result?.body === "string"
              ? result.body
              : "";
      if (editor.value !== nextValue) {
        const isFocused = document.activeElement === editor;
        const previousSelectionStart = editor.selectionStart ?? editor.value.length;
        editor.value = nextValue;
        if (isFocused) {
          const caret = Math.min(nextValue.length, previousSelectionStart);
          editor.selectionStart = caret;
          editor.selectionEnd = caret;
        }
      }
    }
  }

  const primaryContent =
    typeof result?.content === "string"
      ? result.content
      : typeof result?.script === "string"
        ? result.script
        : typeof result?.body === "string"
          ? result.body
          : "";
  const hasContent = primaryContent.trim().length > 0;
  if (!hasContent) {
    container.innerHTML = '<div class="placeholder"><p>작성된 대본이 없습니다. 편집 공간에 내용을 입력해 보세요.</p></div>';
    return;
  }

  const topicLabel =
    (typeof result?.topic === "string" && result.topic.trim().length ? result.topic.trim() : null) ||
    (typeof result?.keyword === "string" && result.keyword.trim().length ? result.keyword.trim() : null) ||
    "작성한 대본";
  const languageLabel = result?.language || "ko";
  const updatedLabel = result?.updated_at ? formatTimestamp(result.updated_at) : (result?.generated_at ? formatTimestamp(result.generated_at) : "");
  const safeContent = primaryContent;

  container.innerHTML = `
    <article>
      <header class="result-header">
        <div class="result-header-main">
          <h3>${escapeHtml(topicLabel)}</h3>
          <p class="status">언어: ${escapeHtml(languageLabel)}</p>
        </div>
        ${updatedLabel ? `<small class="status">마지막 수정: ${escapeHtml(updatedLabel)}</small>` : ""}
      </header>
      <section class="script-preview">
        <pre class="script-preview-text" style="white-space: pre-wrap;">${escapeHtml(safeContent)}</pre>
      </section>
    </article>
  `;
}

function renderMediaPrompts(data) {
  const resultsSection = document.getElementById("media-prompts-results");
  const container = document.getElementById("media-prompts-container");

  if (!resultsSection || !container) return;

  if (!data || !Array.isArray(data.prompts) || data.prompts.length === 0) {
    container.innerHTML = '<div class="placeholder"><p>생성된 프롬프트가 없습니다.</p></div>';
    resultsSection.style.display = "none";
    return;
  }

  const createCopyButton = (text, label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary copy-prompt-btn";
    btn.textContent = `📋 ${label} 복사`;
    btn.dataset.promptText = text;

    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        const originalText = btn.textContent;
        btn.textContent = "✓ 복사됨!";
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      } catch (error) {
        console.error("Failed to copy prompt:", error);
        alert("클립보드에 복사하지 못했습니다.");
      }
    });

    return btn;
  };

  const promptsHtml = data.prompts.map((prompt, idx) => {
    return `
      <div class="prompt-scene-card" style="margin-bottom: 2rem; padding: 1.5rem; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
        <div class="prompt-scene-header" style="margin-bottom: 1rem;">
          <h4 style="margin: 0 0 0.5rem 0;">🎬 Scene ${prompt.scene_number}: ${escapeHtml(prompt.scene_title)}</h4>
          <p style="margin: 0; font-size: 0.9rem; color: #666; font-style: italic;">${escapeHtml(prompt.scene_content)}</p>
        </div>

        <div class="prompt-section" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h5 style="margin: 0; color: #0066cc;">🖼️ 이미지 생성 프롬프트 (Kling, Midjourney, DALL-E)</h5>
            <div class="prompt-actions-${idx}-image"></div>
          </div>
          <div style="padding: 1rem; background: white; border: 1px solid #ddd; border-radius: 4px; white-space: pre-wrap; font-family: monospace; font-size: 0.9rem;">
${escapeHtml(prompt.image_prompt)}
          </div>
        </div>

        <div class="prompt-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h5 style="margin: 0; color: #cc6600;">🎥 영상 생성 프롬프트 (Sora, Runway, Kling, Pika)</h5>
            <div class="prompt-actions-${idx}-video"></div>
          </div>
          <div style="padding: 1rem; background: white; border: 1px solid #ddd; border-radius: 4px; white-space: pre-wrap; font-family: monospace; font-size: 0.9rem;">
${escapeHtml(prompt.video_prompt)}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="media-prompts-header" style="margin-bottom: 1.5rem; padding: 1rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px;">
      <h3 style="margin: 0 0 0.5rem 0; color: white;">✨ ${escapeHtml(data.topic)}</h3>
      <p style="margin: 0; opacity: 0.9;">총 ${data.total_scenes}개 장면의 이미지/영상 프롬프트가 생성되었습니다.</p>
    </div>
    ${promptsHtml}
  `;

  // 복사 버튼 추가
  data.prompts.forEach((prompt, idx) => {
    const imageActionsDiv = container.querySelector(`.prompt-actions-${idx}-image`);
    const videoActionsDiv = container.querySelector(`.prompt-actions-${idx}-video`);

    if (imageActionsDiv) {
      const imageCopyBtn = createCopyButton(prompt.image_prompt, "이미지 프롬프트");
      imageActionsDiv.appendChild(imageCopyBtn);
    }

    if (videoActionsDiv) {
      const videoCopyBtn = createCopyButton(prompt.video_prompt, "영상 프롬프트");
      videoActionsDiv.appendChild(videoCopyBtn);
    }
  });

  resultsSection.style.display = "block";

  // 결과 영역으로 스크롤
  resultsSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function getLanguageDisplayName(code) {
  const normalized = (code || "").toLowerCase();
  if (normalized.startsWith("ko")) return "한국어";
  if (normalized.startsWith("ja")) return "일본어";
  if (normalized.startsWith("en")) return "영어";
  if (normalized.startsWith("zh")) return "중국어";
  if (normalized.startsWith("es")) return "스페인어";
  if (normalized.startsWith("fr")) return "프랑스어";
  if (normalized.startsWith("de")) return "독일어";
  return code ? code.toUpperCase() : "원문 언어";
}

function determineTargetLanguage(sourceCode) {
  const normalized = (sourceCode || "").toLowerCase();
  if (normalized.startsWith("ja")) return "ko";
  if (normalized.startsWith("ko")) return "ja";
  if (normalized.startsWith("en")) return "ja";
  return "ja";
}

function serializeSubtitlesForPrompt(subtitles) {
  if (!Array.isArray(subtitles) || !subtitles.length) {
    return "";
  }
  return subtitles
    .map((segment, idx) => {
      const index = typeof segment.index === "number" ? segment.index : idx + 1;
      const lines = [String(index)];
      const start =
        segment.start !== undefined && segment.start !== null ? formatTimecode(segment.start) : "00:00:00,000";
      const end = segment.end !== undefined && segment.end !== null ? formatTimecode(segment.end) : "00:00:00,000";
      lines.push(`${start} --> ${end}`);
      const text = typeof segment.text === "string" ? segment.text.trim() : "";
      if (text) {
        lines.push(text);
      }
      const tag = typeof segment.scene_tag === "string" ? segment.scene_tag.trim() : "";
      if (tag) {
        lines.push(`[${tag}]`);
      }
      return lines.join("\n");
    })
    .join("\n\n")
    .trim();
}

function buildSceneTranslationPrompt(result) {
  if (!result) return null;

  const subtitles = Array.isArray(result.subtitles) ? result.subtitles : [];
  const scenes = Array.isArray(result.scenes) ? result.scenes : [];
  const rawScript = typeof result.script === "string" ? result.script.trim() : "";

  const sections = [];

  const srtText = serializeSubtitlesForPrompt(subtitles);
  if (srtText) {
    sections.push(`### SRT 자막\n${srtText}`);
  }

  if (scenes.length) {
    const scenesText = scenes
      .map((scene, idx) => {
        const tag = typeof scene.scene_tag === "string" && scene.scene_tag.trim() ? scene.scene_tag.trim() : `씬 ${idx + 1}`;
        const hasStart = scene.start !== undefined && scene.start !== null;
        const hasEnd = scene.end !== undefined && scene.end !== null;
        const timeParts = [];
        if (hasStart) {
          timeParts.push(formatTimecode(scene.start));
        }
        if (hasEnd) {
          const arrow = timeParts.length ? " → " : "";
          timeParts.push(`${arrow}${formatTimecode(scene.end)}`);
        }
        const headline = timeParts.length ? `[${tag}] ${timeParts.join("")}` : `[${tag}]`;
        const lines = [headline];

        const action = typeof scene.action === "string" ? scene.action.trim() : "";
        if (action) {
          lines.push(`대사/연출: ${action}`);
        }
        const camera = typeof scene.camera === "string" ? scene.camera.trim() : "";
        if (camera) {
          lines.push(`카메라: ${camera}`);
        }
        const mood = typeof scene.mood === "string" ? scene.mood.trim() : "";
        if (mood) {
          lines.push(`분위기: ${mood}`);
        }

        return lines.join("\n");
      })
      .join("\n\n")
      .trim();

    if (scenesText) {
      sections.push(`### 장면 프롬프트\n${scenesText}`);
    }
  }

  if (!sections.length && rawScript) {
    sections.push(`### 원본 스크립트\n${rawScript}`);
  }

  const scriptBody = sections.join("\n\n").trim();
  if (!scriptBody) {
    return null;
  }

  const sourceLanguage = (result.language || "ko").toLowerCase();
  const targetLanguage = determineTargetLanguage(sourceLanguage);
  const sourceLabel = getLanguageDisplayName(sourceLanguage);
  const targetLabel = getLanguageDisplayName(targetLanguage);

  const instructions = `다음은 ${sourceLabel}로 작성된 유튜브 쇼츠 영상의 씬 대본 전체입니다. 모든 자막과 장면 설명을 ${targetLabel}로 번역하고, 표 형태로 원문과 번역문을 비교해 주세요. 씬 번호, 시간 정보, 카메라/분위기 지시사항도 유지하면서 번역문을 제공합니다.`;

  const clipboardPrompt = `${instructions}\n\n---\n${scriptBody}`;
  const urlPrompt = `${instructions}\n\n${scriptBody}`;
  const fallbackPrompt = `유튜브 쇼츠 씬 대본을 ${sourceLabel}에서 ${targetLabel}로 번역하고 원문과 번역문을 표로 비교해 주세요. 전체 텍스트는 곧 붙여넣겠습니다.`;

  return {
    clipboardPrompt,
    urlPrompt,
    fallbackPrompt,
    sourceLabel,
    targetLabel
  };
}

function buildScriptTranslationPrompt(result) {
  if (!result) return null;

  const subtitles = Array.isArray(result.subtitles) ? result.subtitles : [];
  const images = Array.isArray(result.images) ? result.images : [];
  const summaryItems = Array.isArray(result.summary) ? result.summary : [];

  const sections = [];

  const srtText = serializeSubtitlesForPrompt(subtitles);
  if (srtText) {
    sections.push(`### SRT 자막\n${srtText}`);
  }

  if (images.length) {
    const imageText = images
      .map((image, idx) => {
        const tag = typeof image.tag === "string" && image.tag.trim() ? image.tag.trim() : `이미지 ${idx + 1}`;
        const description = typeof image.description === "string" ? image.description.trim() : "";
        return `- [${tag}] ${description}`;
      })
      .join("\n")
      .trim();
    if (imageText) {
      sections.push(`### 이미지 장면 묘사\n${imageText}`);
    }
  }

  if (summaryItems.length) {
    const summaryText = summaryItems
      .map((item) => (typeof item === "string" ? item.trim() : String(item)))
      .filter(Boolean)
      .map((item) => `- ${item}`)
      .join("\n");
    if (summaryText) {
      sections.push(`### 요약\n${summaryText}`);
    }
  }

  if (!sections.length) {
    return null;
  }

  const sourceLanguage = (result.language || "ko").toLowerCase();
  const targetLanguage = determineTargetLanguage(sourceLanguage);
  const sourceLabel = getLanguageDisplayName(sourceLanguage);
  const targetLabel = getLanguageDisplayName(targetLanguage);

  const instructions = `다음은 ${sourceLabel}로 작성된 유튜브 쇼츠용 SRT 자막과 장면 묘사 전체입니다. 모든 자막과 이미지 프롬프트를 ${targetLabel}로 번역하고, 표 형태로 원문과 번역문을 비교해 주세요. 타임라인 번호와 [이미지 #] 태그를 유지하면서 번역문을 제공합니다.`;

  const scriptBody = sections.join("\n\n").trim();
  const clipboardPrompt = `${instructions}\n\n---\n${scriptBody}`;
  const urlPrompt = `${instructions}\n\n${scriptBody}`;
  const fallbackPrompt = `유튜브 쇼츠 SRT 대본을 ${sourceLabel}에서 ${targetLabel}로 번역하고 원문과 번역문을 표로 비교해 주세요. 전체 텍스트는 곧 붙여넣겠습니다.`;

  return {
    clipboardPrompt,
    urlPrompt,
    fallbackPrompt,
    sourceLabel,
    targetLabel
  };
}

function getTrimEntries(toolKey) {
  if (!toolKey) return [];
  return state.videoTrimQueue.filter((entry) => entry.tool === toolKey);
}

function updateTrimBadge(toolKey) {
  const alias = getToolAlias(toolKey);
  if (!alias) return;
  const badge = document.querySelector(`[data-trim-counter='${alias}']`);
  if (!badge) return;
  const count = getTrimEntries(toolKey).length;
  if (count > 0) {
    badge.textContent = `✂️ ${count}`;
    badge.hidden = false;
  } else {
    badge.textContent = "";
    badge.hidden = true;
  }
}

function registerVideoTrimOperation(toolKey, mode, payload = {}, result = {}) {
  const entry = {
    id: `trim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tool: toolKey,
    mode,
    payload,
    keyword: result?.keyword ?? "",
    language: result?.language ?? "",
    created_at: new Date().toISOString()
  };
  state.videoTrimQueue.push(entry);
  updateTrimBadge(toolKey);
  console.debug("Registered video trim operation:", entry);
  applyTrimToActivePreview(toolKey);
}

function clearTrimQueueForTool(toolKey) {
  state.videoTrimQueue = state.videoTrimQueue.filter((entry) => entry.tool !== toolKey);
  updateTrimBadge(toolKey);
  applyTrimToActivePreview(toolKey);
}

function computeTrimBounds(toolKey, duration = null) {
  const entries = getTrimEntries(toolKey);
  let start = 0;
  let end = Number.isFinite(duration) ? duration : null;
  let startTrimmed = false;
  let endTrimmed = false;

  entries.forEach((entry) => {
    const rawOffset = Number(entry?.payload?.offset);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : DEFAULT_TRIM_SECONDS;
    if (entry.mode === "start") {
      start += offset;
      startTrimmed = true;
    } else if (entry.mode === "end") {
      if (end != null && Number.isFinite(end)) {
        end = Math.max(0, end - offset);
      } else if (Number.isFinite(duration)) {
        end = Math.max(0, duration - offset);
      }
      endTrimmed = true;
    } else if (entry.mode === "current") {
      const timestamp = Number(entry?.payload?.timestamp);
      if (Number.isFinite(timestamp)) {
        start = Math.max(start, timestamp);
        startTrimmed = true;
      }
    }
  });

  if (!Number.isFinite(start) || start < 0) {
    start = 0;
  }
  if (end != null && Number.isFinite(end) && end < start) {
    end = start;
  }

  return { start, end, startTrimmed, endTrimmed };
}

function applyTrimToVideoElement(toolKey, videoElement) {
  if (!videoElement || !toolKey) return;
  const duration = Number.isFinite(videoElement.duration) ? videoElement.duration : null;
  const { start, end, startTrimmed, endTrimmed } = computeTrimBounds(toolKey, duration);

  if (startTrimmed && Number.isFinite(start)) {
    videoElement.dataset.trimStart = String(Math.max(start, 0));
  } else {
    delete videoElement.dataset.trimStart;
  }

  if (endTrimmed && end != null && Number.isFinite(end)) {
    videoElement.dataset.trimEnd = String(Math.max(end, 0));
  } else {
    delete videoElement.dataset.trimEnd;
  }

  if (duration != null && Number.isFinite(start)) {
    const clamped = Math.min(Math.max(start, 0), duration);
    try {
      if (!Number.isFinite(videoElement.currentTime) || Math.abs(videoElement.currentTime - clamped) > 0.01) {
        videoElement.currentTime = clamped;
      }
    } catch (error) {
      console.warn("Failed to adjust video currentTime for trimming:", error);
    }
  }

  updateVideoTrimInfo(toolKey, videoElement);
}

function detachTrimBehavior(videoElement) {
  if (!videoElement || !videoElement._trimHandlers) return;
  const handlers = videoElement._trimHandlers;
  videoElement.removeEventListener("loadedmetadata", handlers.loadedmetadata);
  videoElement.removeEventListener("timeupdate", handlers.timeupdate);
  videoElement.removeEventListener("seeking", handlers.seeking);
  delete videoElement._trimHandlers;
}

function attachTrimBehavior(toolKey, videoElement) {
  if (!videoElement || !toolKey) return;
  detachTrimBehavior(videoElement);

  const enforceBounds = () => {
    const startAttr = videoElement.dataset.trimStart;
    const endAttr = videoElement.dataset.trimEnd;
    const start = startAttr !== undefined ? Number(startAttr) : NaN;
    const end = endAttr !== undefined ? Number(endAttr) : NaN;

    if (Number.isFinite(start) && videoElement.currentTime < start - 0.01) {
      try {
        videoElement.currentTime = start;
      } catch (error) {
        console.warn("Failed to enforce trim start bound:", error);
      }
    }

    if (Number.isFinite(end) && videoElement.currentTime > end + 0.01) {
      try {
        videoElement.currentTime = end;
      } catch (error) {
        console.warn("Failed to enforce trim end bound:", error);
      }
      videoElement.pause();
    }
  };

  const handlers = {
    loadedmetadata: () => {
      applyTrimToVideoElement(toolKey, videoElement);
      enforceBounds();
    },
    timeupdate: enforceBounds,
    seeking: enforceBounds
  };

  videoElement.addEventListener("loadedmetadata", handlers.loadedmetadata);
  videoElement.addEventListener("timeupdate", handlers.timeupdate);
  videoElement.addEventListener("seeking", handlers.seeking);

  videoElement._trimHandlers = handlers;

  if (videoElement.readyState >= 1) {
    handlers.loadedmetadata();
  }
}

function applyTrimToActivePreview(toolKey) {
  if (!toolKey || !activePreviewModal || !activePreviewModal.modal) return;
  const { modal } = activePreviewModal;
  const modalTool = modal.dataset.tool || "";
  if (modalTool !== toolKey) return;
  const videos = modal.querySelectorAll("video");
  videos.forEach((video) => attachTrimBehavior(toolKey, video));
  updateVideoTrimInfo(toolKey, videos[0] || null);
}

function updateVideoTrimInfo(toolKey, videoElement) {
  if (!activePreviewModal || !activePreviewModal.modal) return;
  const info = activePreviewModal.modal.querySelector("[data-video-trim-info]");
  if (!info) return;

  let targetVideo = videoElement;
  if (!targetVideo) {
    targetVideo = activePreviewModal.modal.querySelector("video");
  }

  const duration = targetVideo && Number.isFinite(targetVideo.duration) ? targetVideo.duration : null;
  const { start, end, startTrimmed, endTrimmed } = computeTrimBounds(toolKey, duration);

  if (!startTrimmed && !endTrimmed) {
    info.textContent = "";
    info.hidden = true;
    return;
  }

  const startSeconds = startTrimmed && Number.isFinite(start) ? start : 0;
  let endSeconds = null;
  if (endTrimmed && end != null && Number.isFinite(end)) {
    endSeconds = end;
  } else if (duration != null && Number.isFinite(duration)) {
    endSeconds = duration;
  }

  const startLabel = formatTimecode(Math.max(startSeconds, 0));
  const endLabel = endSeconds != null ? formatTimecode(Math.max(endSeconds, 0)) : null;
  info.textContent = endLabel ? `재생 구간: ${startLabel} → ${endLabel}` : `재생 시작: ${startLabel}`;
  info.hidden = false;
}

function getVideoCandidates(downloads = [], query = "") {
  const normalized = (query || "").trim().toLowerCase();
  const results = [];
  downloads.forEach((file) => {
    if (!file || !file.has_video) return;
    const videoFiles = Array.isArray(file.video_files) ? file.video_files : [];
    if (!videoFiles.length) return;
    const title = (file.title || file.id || "").trim();
    const identifier = (file.id || "").trim();
    const titleLower = title.toLowerCase();
    const idLower = identifier.toLowerCase();
    let baseScore = 0;
    if (!normalized) {
      baseScore = 1;
    } else {
      if (titleLower && titleLower.includes(normalized)) baseScore += 4;
      if (idLower && idLower.includes(normalized)) baseScore += 3;
    }
    videoFiles.forEach((fullPath, index) => {
      if (!fullPath) return;
      const filename = fullPath.split(/[\\/]/).pop() || fullPath;
      const filenameLower = filename.toLowerCase();
      let score = baseScore;
      if (normalized && filenameLower.includes(normalized)) {
        score += 2;
      }
      results.push({
        id: identifier || fullPath,
        title: title || identifier || filename,
        filename,
        path: fullPath,
        modified: file.modified || 0,
        score: score + 1 / (index + 1)
      });
    });
  });

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.modified || 0) - (a.modified || 0);
  });

  return results.slice(0, 10);
}

function buildVideoResultsMarkup(candidates = []) {
  if (!candidates.length) {
    return "";
  }
  return candidates
    .map((candidate) => {
      const title = escapeHtml(candidate.title || candidate.filename || candidate.path);
      const filename = escapeHtml(candidate.filename || "");
      const path = escapeHtml(candidate.path || "");
      return `
        <button type="button" class="video-result-item" data-video-path="${path}" data-video-title="${title}" data-video-filename="${filename}">
          <span class="video-result-title">${title}</span>
          <span class="video-result-meta">${filename}</span>
        </button>
      `;
    })
    .join("");
}

function buildVideoSearchSection(result, downloads) {
  const initialQuery = (result?.keyword || "").trim();
  const candidates = Array.isArray(downloads) && downloads.length ? getVideoCandidates(downloads, initialQuery) : [];
  const resultsMarkup = buildVideoResultsMarkup(candidates);
  const queryValue = escapeHtml(initialQuery);
  const noDownloadsMessage = '<p class="preview-meta">다운로드 폴더에서 영상을 찾을 수 없습니다. 먼저 영상 가져오기 기능을 사용해 주세요.</p>';
  const noResultsMessage = '<p class="preview-meta">검색 결과가 없습니다. 다른 키워드로 다시 시도해 보세요.</p>';

  return `
    <section class="preview-section preview-video-search" data-video-search>
      <h4>영상 찾기</h4>
      <div class="video-search-controls">
        <input type="text" class="preview-input" data-video-query value="${queryValue}" placeholder="영상 제목 또는 키워드를 입력하세요.">
        <div class="video-search-buttons">
          <button type="button" class="outline" data-video-search-btn>검색</button>
          <button type="button" class="outline" data-video-refresh-btn>목록 새로고침</button>
        </div>
      </div>
      <div class="video-search-results"${candidates.length ? "" : ' data-empty="true"'} data-video-results>
        ${
          Array.isArray(downloads) && downloads.length
            ? resultsMarkup || noResultsMessage
            : noDownloadsMessage
        }
      </div>
      <p class="preview-meta preview-instruction">영상 항목을 선택하면 아래에서 미리보기를 확인할 수 있습니다.</p>
    </section>
    <section class="preview-section preview-video-player" data-video-player hidden>
      <h4>영상 미리보기</h4>
      <video controls preload="metadata" class="preview-video" data-video-element></video>
      <div class="preview-meta preview-video-meta">
        <span data-video-path></span>
        <button type="button" class="secondary" data-video-open hidden>새 창으로 열기</button>
      </div>
    </section>
  `;
}

function setupPreviewModalInteractions(modal, toolKey = null) {
  if (!modal) return;
  if (toolKey) {
    modal.dataset.tool = toolKey;
  } else if (!modal.dataset.tool) {
    modal.dataset.tool = "";
  }
  const resolvedTool = modal.dataset.tool || "";

  const queryInput = modal.querySelector("[data-video-query]");
  const resultsContainer = modal.querySelector("[data-video-results]");
  const searchButton = modal.querySelector("[data-video-search-btn]");
  const refreshButton = modal.querySelector("[data-video-refresh-btn]");
  const playerSection = modal.querySelector("[data-video-player]");
  const videoElement = modal.querySelector("[data-video-element]");
  const pathLabel = modal.querySelector("[data-video-path]");
  const openButton = modal.querySelector("[data-video-open]");
  const detailsContainer = modal.querySelector("[data-preview-details]");
  const trimInfo = modal.querySelector("[data-video-trim-info]");

  if (!resultsContainer || !queryInput) {
    if (resolvedTool) {
      const inlineVideos = modal.querySelectorAll("video");
      inlineVideos.forEach((video) => attachTrimBehavior(resolvedTool, video));
      applyTrimToActivePreview(resolvedTool);
      updateVideoTrimInfo(resolvedTool, modal.querySelector("video"));
    }
    return;
  }

  if (resolvedTool) {
    updateVideoTrimInfo(resolvedTool, videoElement || null);
  }

  const toggleDetails = (visible) => {
    if (!detailsContainer) return;
    detailsContainer.hidden = !visible;
  };

  const resetPlayer = () => {
    if (videoElement) {
      try {
        videoElement.pause();
      } catch (error) {
        console.warn("Failed to pause preview video:", error);
      }
      detachTrimBehavior(videoElement);
      videoElement.removeAttribute("src");
      videoElement.load();
    }
    if (pathLabel) {
      pathLabel.textContent = "";
    }
    if (openButton) {
      openButton.hidden = true;
      openButton.onclick = null;
    }
    if (playerSection) {
      playerSection.hidden = true;
    }
    if (resolvedTool) {
      updateVideoTrimInfo(resolvedTool, null);
    }
  };

  toggleDetails(false);

  const selectCandidate = (button) => {
    if (!button) return;
    resultsContainer.querySelectorAll(".video-result-item").forEach((item) => {
      item.classList.toggle("selected", item === button);
    });
    const path = button.getAttribute("data-video-path");
    if (!path) return;
    const title = button.getAttribute("data-video-title") || "";
   const filename = button.getAttribute("data-video-filename") || "";
    const videoUrl = `/api/video?path=${encodeURIComponent(path)}`;

    if (videoElement) {
      detachTrimBehavior(videoElement);
      videoElement.src = videoUrl;
      videoElement.load();
      if (resolvedTool) {
        attachTrimBehavior(resolvedTool, videoElement);
      }
    }
    if (pathLabel) {
      const pieces = [];
      if (title) pieces.push(title);
      if (filename && filename !== title) pieces.push(filename);
      pathLabel.textContent = pieces.length ? pieces.join(" · ") : path;
    }
    if (openButton) {
      openButton.hidden = false;
      openButton.onclick = () => {
        window.open(videoUrl, "_blank", "noopener");
      };
    }
    if (playerSection) {
      playerSection.hidden = false;
    }
    toggleDetails(true);
    resultsContainer.dataset.selectedPath = path;
    if (resolvedTool) {
      updateVideoTrimInfo(resolvedTool, videoElement || null);
    }
  };

  const updateResults = (query, options = {}) => {
    const keepSelection = Boolean(options.keepSelection);
    const previousSelection = keepSelection ? resultsContainer.dataset.selectedPath || "" : "";

    if (!keepSelection) {
      delete resultsContainer.dataset.selectedPath;
    }

    resetPlayer();
    toggleDetails(false);

    const candidates = getVideoCandidates(downloadData, query);
    const markup = buildVideoResultsMarkup(candidates);

    if (markup) {
      resultsContainer.innerHTML = markup;
      resultsContainer.removeAttribute("data-empty");

      if (keepSelection && previousSelection) {
        const match = Array.from(resultsContainer.querySelectorAll(".video-result-item")).find(
          (btn) => btn.getAttribute("data-video-path") === previousSelection
        );
        if (match) {
          selectCandidate(match);
          return;
        }
      }
    } else {
      resultsContainer.innerHTML = downloadData.length
        ? '<p class="preview-meta">검색 결과가 없습니다. 다른 키워드를 입력해 보세요.</p>'
        : '<p class="preview-meta">다운로드된 영상이 없습니다.</p>';
      resultsContainer.setAttribute("data-empty", "true");
      delete resultsContainer.dataset.selectedPath;
    }

    if (resolvedTool) {
      updateVideoTrimInfo(resolvedTool, videoElement || null);
    }
  };

  resultsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-video-path]");
    if (!button) return;
    event.preventDefault();
    selectCandidate(button);
  });

  if (searchButton) {
    searchButton.addEventListener("click", () => {
      const value = queryInput.value.trim();
      updateResults(value, { keepSelection: false });
    });
  }

  queryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      updateResults(queryInput.value.trim(), { keepSelection: false });
    }
  });

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      if (refreshButton.disabled) return;
      const originalLabel = refreshButton.textContent;
      try {
        refreshButton.disabled = true;
        refreshButton.textContent = "새로고침 중...";
        await ensureDownloadData(true);
        updateResults(queryInput.value.trim(), { keepSelection: true });
        showNotification("영상 목록을 새로 불러왔습니다.", "success");
      } catch (error) {
        console.error("Failed to refresh download list:", error);
        showNotification(error.message || "영상 목록 새로고침에 실패했습니다.", "error");
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = originalLabel;
      }
    });
  }

  // 초기 검색 결과 표시 (영상 선택 전까지 미리보기는 숨김)
  updateResults(queryInput.value.trim(), { keepSelection: true });

  if (resolvedTool) {
    applyTrimToActivePreview(resolvedTool);
  }
}

function buildResultPreview(toolKey, downloads = []) {
  const result = state.latestResults[toolKey];
  if (!result) return null;

  const keyword = escapeHtml(result.keyword ?? "—");
  const language = escapeHtml(result.language ?? "-");
  const subtitles = Array.isArray(result.subtitles) ? result.subtitles : [];
  const images = Array.isArray(result.images) ? result.images : [];
  const scenes = Array.isArray(result.scenes) ? result.scenes : [];
  const trims = getTrimEntries(toolKey);

  const detailSections = [];

  detailSections.push(`
    <section class="preview-section">
      <ul class="preview-meta-list">
        <li><strong>키워드:</strong> ${keyword || "—"}</li>
        <li><strong>언어:</strong> ${language || "-"}</li>
        <li><strong>자막 개수:</strong> ${subtitles.length}</li>
      </ul>
    </section>
  `);

  if (subtitles.length) {
    const limited = subtitles.slice(0, 10);
    const items = limited
      .map((segment, idx) => {
        const index = typeof segment.index === "number" ? segment.index : idx + 1;
        const start = toSeconds(segment.start ?? segment.start_time);
        const end = toSeconds(segment.end ?? segment.end_time);
        const startLabel = Number.isFinite(start) ? formatTimecode(start) : "-";
        const endLabel = Number.isFinite(end) ? formatTimecode(end) : "-";
        const text = escapeHtml(segment.text ?? "");
        const tag = segment.scene_tag ? `<span class="preview-meta-tag">${escapeHtml(segment.scene_tag)}</span>` : "";
        return `
          <li>
            <div class="preview-row-header">
              <strong>#${index}</strong>
              <span>${startLabel} → ${endLabel}</span>
            </div>
            <p>${text || "<em>내용 없음</em>"}</p>
            ${tag ? `<p class="preview-meta">${tag}</p>` : ""}
          </li>
        `;
      })
      .join("");
    const remainder = subtitles.length > limited.length ? `<p class="preview-meta">총 ${subtitles.length}개 중 ${limited.length}개만 표시됩니다.</p>` : "";
    detailSections.push(`
      <section class="preview-section">
        <h4>자막 미리보기</h4>
        <ul class="preview-list">${items}</ul>
        ${remainder}
      </section>
    `);
  }

  if (toolKey === TOOL_KEYS.SCRIPT && images.length) {
    const limited = images.slice(0, 6);
    const items = limited
      .map((image, idx) => {
        const tag = escapeHtml(image.tag ?? `이미지 ${idx + 1}`);
        const description = escapeHtml(image.description ?? "");
        const start = toSeconds(image.start);
        const end = toSeconds(image.end);
        const startLabel = Number.isFinite(start) ? formatTimecode(start) : "-";
        const endLabel = Number.isFinite(end) ? formatTimecode(end) : "-";
        return `
          <li>
            <div class="preview-row-header">
              <strong>${tag}</strong>
              <span>${startLabel} → ${endLabel}</span>
            </div>
            <p>${description || "<em>설명이 없습니다.</em>"}</p>
          </li>
        `;
      })
      .join("");
    const remainder = images.length > limited.length ? `<p class="preview-meta">총 ${images.length}개 중 ${limited.length}개만 표시됩니다.</p>` : "";
    detailSections.push(`
      <section class="preview-section">
        <h4>이미지 장면 프롬프트</h4>
        <ul class="preview-list">${items}</ul>
        ${remainder}
      </section>
    `);
  }

  if (toolKey === TOOL_KEYS.SCENES && scenes.length) {
    const limited = scenes.slice(0, 8);
    const items = limited
      .map((scene, idx) => {
        const tag = escapeHtml(scene.scene_tag ?? `씬 ${idx + 1}`);
        const start = toSeconds(scene.start);
        const end = toSeconds(scene.end);
        const startLabel = Number.isFinite(start) ? formatTimecode(start) : "-";
        const endLabel = Number.isFinite(end) ? formatTimecode(end) : "-";
        const action = escapeHtml(scene.action ?? "");
        const camera = escapeHtml(scene.camera ?? "");
        const mood = escapeHtml(scene.mood ?? "");
        return `
          <li>
            <div class="preview-row-header">
              <strong>${tag}</strong>
              <span>${startLabel} → ${endLabel}</span>
            </div>
            <p>${action || "<em>액션 설명 없음</em>"}</p>
            <p class="preview-meta">${camera ? `카메라: ${camera}` : ""}${camera && mood ? " · " : ""}${mood ? `분위기: ${mood}` : ""}</p>
          </li>
        `;
      })
      .join("");
    const remainder = scenes.length > limited.length ? `<p class="preview-meta">총 ${scenes.length}개 중 ${limited.length}개만 표시됩니다.</p>` : "";
    detailSections.push(`
      <section class="preview-section">
        <h4>영상 장면 프롬프트</h4>
        <ul class="preview-list">${items}</ul>
        ${remainder}
      </section>
    `);
  }

  if (typeof result.script === "string" && result.script.trim()) {
    detailSections.push(`
      <section class="preview-section">
        <h4>원문 스크립트</h4>
        <pre class="preview-code">${escapeHtml(result.script.trim())}</pre>
      </section>
    `);
  }

  const trimsMarkup = trims.length
    ? `<ul class="preview-list">${trims
        .map((entry) => {
          const label = TRIM_LABELS[entry.mode] || entry.mode;
          const timestamp = Number.isFinite(entry?.payload?.timestamp)
            ? formatTimecode(entry.payload.timestamp)
            : null;
          const created = formatTimestamp(entry.created_at);
          return `
            <li>
              <div class="preview-row-header">
                <strong>${label}</strong>
                <span>${created}</span>
              </div>
              ${
                timestamp
                  ? `<p class="preview-meta">기준 시간: ${timestamp}</p>`
                  : ""
              }
            </li>
          `;
        })
        .join("")}</ul>`
    : '<p class="preview-meta">등록된 프레임 자르기 명령이 없습니다.</p>';

  detailSections.push(`
    <section class="preview-section">
      <h4>프레임 자르기 명령</h4>
      ${trimsMarkup}
    </section>
  `);

  const videoSection = buildVideoSearchSection(result, downloads);
  const detailsMarkup = detailSections.length
    ? detailSections.join("")
    : '<section class="preview-section"><p class="preview-meta">표시할 미리보기 데이터가 없습니다.</p></section>';
  const body = `
    ${videoSection}
    <div class="preview-details" data-preview-details hidden>
      ${detailsMarkup}
    </div>
  `;
  const title =
    toolKey === TOOL_KEYS.SCRIPT ? "쇼츠 SRT 대본 미리보기" : toolKey === TOOL_KEYS.SCENES ? "쇼츠 씬 대본 미리보기" : "결과 미리보기";

  return {
    title,
    body
  };
}

async function showResultPreview(toolAliasOrKey) {
  const toolKey = resolveToolKey(toolAliasOrKey);
  if (!toolKey) {
    showNotification("미리보기를 지원하지 않는 도구입니다.", "error");
    return;
  }
  const result = state.latestResults[toolKey];
  if (!result) {
    showNotification("표시할 결과가 없습니다. 먼저 결과를 생성해 주세요.", "error");
    return;
  }
  await ensureDownloadData(false);
  const preview = buildResultPreview(toolKey, downloadData);
  if (!preview) {
    showNotification("표시할 결과가 없습니다. 먼저 결과를 생성해 주세요.", "error");
    return;
  }
  const modal = openPreviewModal(preview.title, preview.body);
  setupPreviewModalInteractions(modal, toolKey);
  applyTrimToActivePreview(toolKey);
  return modal;
}

function handleVideoTrim(toolAliasOrKey, mode) {
  const toolKey = resolveToolKey(toolAliasOrKey);
  if (!toolKey) {
    showNotification("프레임 자르기를 지원하지 않는 도구입니다.", "error");
    return;
  }
  const result = state.latestResults[toolKey];
  if (!result) {
    showNotification("먼저 결과를 생성해 주세요.", "error");
    return;
  }
  const label = TRIM_LABELS[mode] || "프레임";
  const payload = {};
  if (mode === "current") {
    const input = window.prompt("현재 프레임 시간을 초 단위로 입력하세요 (예: 12.5)", "");
    if (input === null) return;
    const numeric = Number(input);
    if (!Number.isFinite(numeric) || numeric < 0) {
      showNotification("올바른 시간을 입력하세요.", "error");
      return;
    }
    payload.timestamp = numeric;
  } else {
    const defaultValue = DEFAULT_TRIM_SECONDS;
    const promptLabel = mode === "start"
      ? "앞부분에서 잘라낼 시간을 초 단위로 입력하세요 (예: 0.5)"
      : "뒷부분에서 잘라낼 시간을 초 단위로 입력하세요 (예: 0.5)";
    const input = window.prompt(promptLabel, String(defaultValue));
    if (input === null) return;
    const numeric = Number(input);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      showNotification("올바른 시간을 입력하세요.", "error");
      return;
    }
    payload.offset = numeric;
  }
  registerVideoTrimOperation(toolKey, mode, payload, result);
  showNotification(`영상 ${label} 자르기 작업이 추가되었습니다.`, "success");
}

async function openSceneTranslationComparison() {
  await openTranslationComparison(
    state.latestResults[TOOL_KEYS.SCENES],
    buildSceneTranslationPrompt,
    "씬 대본"
  );
}

async function openScriptTranslationComparison() {
  await openTranslationComparison(
    state.latestResults[TOOL_KEYS.SCRIPT],
    buildScriptTranslationPrompt,
    "SRT 대본"
  );
}

async function openTranslationComparison(result, promptBuilder, label) {
  if (!result) {
    showNotification(`생성된 ${label}이 없습니다.`, "error");
    return;
  }

  const promptConfig = promptBuilder(result);
  if (!promptConfig) {
    showNotification(`${label}에 번역할 내용이 없습니다.`, "error");
    return;
  }

  const encodedPrompt = encodeURIComponent(promptConfig.urlPrompt);
  let chatgptUrl = `https://chatgpt.com/?q=${encodedPrompt}`;
  let usedFallback = false;

  if (encodedPrompt.length > 1800) {
    const fallbackQuery = encodeURIComponent(promptConfig.fallbackPrompt);
    chatgptUrl = `https://chatgpt.com/?q=${fallbackQuery}`;
    usedFallback = true;
  }

  window.open(chatgptUrl, "_blank", "width=1200,height=800");

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(promptConfig.clipboardPrompt);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = promptConfig.clipboardPrompt;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    const successMessage = usedFallback
      ? `${promptConfig.sourceLabel} → ${promptConfig.targetLabel} 번역 비교용 프롬프트를 클립보드에 복사했습니다. ChatGPT 창에 붙여넣어 주세요.`
      : `${promptConfig.sourceLabel} → ${promptConfig.targetLabel} 번역 비교용 프롬프트를 클립보드에 복사했습니다. ChatGPT 창을 확인하세요.`;
    showNotification(successMessage, "success");
  } catch (error) {
    console.error("Failed to copy translation prompt:", error);
    showNotification("클립보드 복사에 실패했습니다. ChatGPT 창에서 직접 붙여넣어 주세요.", "error");
  }
}

const TOOL_CONFIG = {
  [TOOL_KEYS.STORY]: {
    savedContainer: "story-keyword-saved",
    resultsContainer: "story-keyword-results",
    renderer: renderStoryKeywordResults,
    defaultTitle: (payload) => {
      const keyword = payload?.keyword || "스토리 키워드";
      const total = payload?.count || (Array.isArray(payload?.items) ? payload.items.length : 0);
      return `${keyword} (${total}개)`;
    }
  },
  [TOOL_KEYS.IMAGE_STORY]: {
    savedContainer: "image-story-saved",
    resultsContainer: "image-story-results",
    renderer: renderImageStoryResults,
    defaultTitle: (payload) => {
      if (payload?.keyword) return `${payload.keyword} 이미지 스토리`;
      const first = Array.isArray(payload?.items) && payload.items.length ? payload.items[0] : null;
      if (first?.title) return first.title;
      return "이미지 스토리";
    },
    enrichForm: (formData, payload) => {
      if (!payload) return;
      formData.set("keyword", payload.keyword || "");
      formData.set("image_description", payload.source?.description || "");
    }
  },
  [TOOL_KEYS.SCRIPT]: {
    savedContainer: "shorts-script-saved",
    resultsContainer: "shorts-script-results",
    renderer: renderShortsScriptResults,
    defaultTitle: (payload) => `${payload?.keyword || "쇼츠 대본"} 자막`,
    enrichForm: (formData, payload) => {
      if (!payload) return;
      formData.set("keyword", payload.keyword || "");
      formData.set("language", payload.language || "ko");
    }
  },
  [TOOL_KEYS.SCENES]: {
    savedContainer: "shorts-scenes-saved",
    resultsContainer: "shorts-scenes-results",
    renderer: renderShortsSceneResults,
    defaultTitle: (payload) => `${payload?.keyword || "쇼츠 장면"} 씬`,
    enrichForm: (formData, payload) => {
      if (!payload) return;
      formData.set("keyword", payload.keyword || "");
      formData.set("language", payload.language || "ko");
    }
  },
  [TOOL_KEYS.LONG_SCRIPT]: {
    savedContainer: "long-script-saved",
    resultsContainer: "long-script-results",
    renderer: renderLongScriptResults,
    defaultTitle: (payload) => {
      const topic = typeof payload?.topic === "string" ? payload.topic.trim() : "";
      const keyword = typeof payload?.keyword === "string" ? payload.keyword.trim() : "";
      if (topic) {
        return `${topic} 대본`;
      }
      if (keyword) {
        return `${keyword} 대본`;
      }
      const contentSource =
        typeof payload?.content === "string"
          ? payload.content
          : typeof payload?.script === "string"
            ? payload.script
            : typeof payload?.body === "string"
              ? payload.body
              : "";
      const content = contentSource.trim();
      if (content) {
        const condensed = content.replace(/\s+/g, " ");
        const snippet = condensed.slice(0, 20);
        return condensed.length > 20 ? `${snippet}...` : snippet || "작성한 대본";
      }
      return "작성한 대본";
    }
  }
};

function renderSavedRecords(tool, records = state.savedRecords[tool] || []) {
  const config = TOOL_CONFIG[tool];
  console.log(`renderSavedRecords called for tool: ${tool}, records count: ${records.length}`);
  if (!config) {
    console.warn(`No config found for tool: ${tool}`);
    return;
  }
  const container = document.querySelector(`#${config.savedContainer} .saved-body`);
  if (!container) {
    console.warn(`No container found for tool: ${tool}, selector: #${config.savedContainer} .saved-body`);
    return;
  }
  console.log(`Rendering ${records.length} saved records for tool: ${tool}`);

  if (!records.length) {
    container.innerHTML = '<div class="placeholder"><p>저장된 결과가 없습니다.</p></div>';
    return;
  }

  const checkedSet = state.checkedRecords[tool] || new Set();

  const items = records
    .map((record) => {
      const created = formatTimestamp(record.created_at);
      const isActive = state.activeRecords[tool] === record.id;
      const isChecked = checkedSet.has(record.id);
      return `
        <li class="saved-item${isActive ? " active" : ""}" data-record-id="${record.id}" data-tool="${tool}">
          <label class="saved-check">
            <input type="checkbox" data-check ${isChecked ? "checked" : ""}>
            <span>선택</span>
          </label>
          <div class="saved-meta">
            <strong>${escapeHtml(record.title)}</strong>
            <small>${escapeHtml(created)}</small>
          </div>
          <div class="saved-actions">
            <button type="button" data-select>불러오기</button>
            <button type="button" data-delete class="outline danger">삭제</button>
          </div>
        </li>
      `;
    })
    .join("");

  container.innerHTML = `<ul class="saved-list">${items}</ul>`;
}

async function loadSavedRecords(tool) {
  try {
    console.log(`Loading saved records for tool: ${tool}`);
    const records = await api(`/api/tools/${tool}/records`);
    console.log(`Loaded ${records?.length || 0} records for ${tool}:`, records);
    state.savedRecords[tool] = Array.isArray(records) ? records : [];
    console.log(`State updated. state.savedRecords[${tool}] now has ${state.savedRecords[tool].length} records`);
    const previous = state.checkedRecords[tool] || new Set();
    const next = new Set();
    state.savedRecords[tool].forEach((record) => {
      if (previous.has(record.id)) {
        next.add(record.id);
      }
    });
    state.checkedRecords[tool] = next;
    const persisted = loadPersistedSelection();
    if (persisted && persisted.tool === tool) {
      const exists = state.savedRecords[tool].some((record) => record.id === persisted.recordId);
      if (exists) {
        state.activeRecords[tool] = persisted.recordId;
        if (!state.latestResults[tool]) {
          const saved = state.savedRecords[tool].find((record) => record.id === persisted.recordId);
          if (saved) {
            state.latestResults[tool] = saved.payload;
            if (tool === TOOL_KEYS.SCRIPT || tool === TOOL_KEYS.SCENES || tool === TOOL_KEYS.VIDEO_IMPORT) {
              const keyword = saved.payload?.keyword || saved.title;
              const language = saved.payload?.language || "ko";
              if (keyword) {
                state.lastRequests[tool] = { keyword, language };
              }
            }
          }
        }
      } else if (persisted.payload) {
        state.latestResults[tool] = state.latestResults[tool] || persisted.payload;
      } else {
        clearPersistedSelection();
      }
    }
    renderSavedRecords(tool);
    updateRecordSelectOptions();
  } catch (error) {
    console.error(`Failed to load records for ${tool}:`, error);
  }
}

async function saveLatestResult(tool) {
  const payload = state.latestResults[tool];
  if (!payload) {
    alert("먼저 결과를 생성하세요.");
    return;
  }
  const config = TOOL_CONFIG[tool];
  if (!config) return;
  const suggested = config.defaultTitle(payload) || "새로운 결과";
  const title = window.prompt("저장할 이름을 입력하세요.", suggested);
  if (title === null) return;
  if (!title.trim()) {
    alert("이름을 입력해야 합니다.");
    return;
  }
  try {
    await api(`/api/tools/${tool}/records`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), payload })
    });
    state.activeRecords[tool] = null;
    await loadSavedRecords(tool);
    alert("저장되었습니다.");
  } catch (error) {
    alert(error.message);
  }
}

async function deleteSavedRecord(tool, recordId) {
  if (!recordId) return;
  const confirmed = window.confirm("저장된 결과를 삭제할까요?");
  if (!confirmed) return;
  try {
    await api(`/api/tools/${tool}/records/${recordId}`, { method: "DELETE" });
    if (state.activeRecords[tool] === recordId) {
      state.activeRecords[tool] = null;
    }
    const persisted = loadPersistedSelection();
    if (persisted && persisted.tool === tool && persisted.recordId === recordId) {
      clearPersistedSelection();
    }
    await loadSavedRecords(tool);
  } catch (error) {
    alert(error.message);
  }
}

function selectSavedRecord(tool, recordId) {
  if (!recordId) return;
  const records = state.savedRecords[tool] || [];
  const record = records.find((item) => item.id === recordId);
  if (!record) {
    alert("저장된 데이터를 찾을 수 없습니다.");
    return;
  }
  const config = TOOL_CONFIG[tool];
  if (!config) return;
  state.latestResults[tool] = record.payload;
  state.activeRecords[tool] = recordId;
  config.renderer(record.payload);
  if (tool === TOOL_KEYS.SCRIPT || tool === TOOL_KEYS.SCENES) {
    state.audioResults[tool] = null;
    displayAudioResult(tool, null);
  }
  persistSelection(tool, recordId, record.payload);
  if (tool === TOOL_KEYS.SCRIPT) {
    const keyword = record.payload?.keyword;
    const language = record.payload?.language || "ko";
    if (keyword) {
      state.lastRequests[tool] = { keyword, language };
    }
  }
  if (tool === TOOL_KEYS.SCENES) {
    const keyword = record.payload?.keyword;
    const language = record.payload?.language || "ko";
    if (keyword) {
      state.lastRequests[tool] = { keyword, language };
    }
  }
  if (tool === TOOL_KEYS.LONG_SCRIPT) {
    const topic = record.payload?.topic || "";
    const language = record.payload?.language || "ko";
    const keyword = record.payload?.keyword || topic;
    state.lastRequests[tool] = { topic, keyword, language };
  }
  renderSavedRecords(tool);
  const target = document.getElementById(config.resultsContainer);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function handleSavedSectionClick(event) {
  const selectButton = event.target.closest("button[data-select]");
  if (selectButton) {
    const item = selectButton.closest("li[data-record-id]");
    if (!item) return;
    const tool = item.dataset.tool;
    const recordId = item.dataset.recordId;
    selectSavedRecord(tool, recordId);
    return;
  }

  const deleteButton = event.target.closest("button[data-delete]");
  if (deleteButton) {
    const item = deleteButton.closest("li[data-record-id]");
    if (!item) return;
    const tool = item.dataset.tool;
    const recordId = item.dataset.recordId;
    deleteSavedRecord(tool, recordId);
  }

  const checkBox = event.target.closest("input[data-check]");
  if (checkBox) {
    const item = checkBox.closest("li[data-record-id]");
    if (!item) return;
    const tool = item.dataset.tool;
    const recordId = item.dataset.recordId;
    if (!state.checkedRecords[tool]) {
      state.checkedRecords[tool] = new Set();
    }
    const bucket = state.checkedRecords[tool];
    if (checkBox.checked) {
      bucket.add(recordId);
    } else {
      bucket.delete(recordId);
    }
  }
}

async function continueGeneration(tool, modeVariant = null) {
  const endpoint = GENERATION_ENDPOINTS[tool];
  if (!endpoint) {
    alert("이 기능은 지원되지 않습니다.");
    return;
  }
  const request = state.lastRequests[tool];
  if (!request) {
    alert("먼저 초기 결과를 생성하세요.");
    return;
  }

  const form =
    tool === TOOL_KEYS.SCRIPT
      ? document.getElementById("shorts-script-form")
      : tool === TOOL_KEYS.SCENES
      ? document.getElementById("shorts-scenes-form")
      : null;
  const modeSelect = form ? form.querySelector("select[name='mode']") : null;
  const currentMode = modeSelect ? modeSelect.value : "api";

  if (currentMode === "chatgpt" && tool === TOOL_KEYS.SCRIPT && modeVariant === "story") {
    const latest = state.latestResults[TOOL_KEYS.SCRIPT];
    const subtitles = Array.isArray(latest?.subtitles) ? latest.subtitles : [];
    if (!subtitles.length) {
      alert("먼저 자막을 생성하거나 불러오세요.");
      return;
    }
    const keyword = latest?.keyword || request.keyword || "";
    const language = request.language || "en";
    const existingSRT = buildExistingSRTString(subtitles);
    const summaryList = Array.isArray(latest?.summary) ? latest.summary : [];
    const maxIndex =
      subtitles.reduce((acc, item, idx) => {
        if (typeof item.index === "number") {
          return Math.max(acc, item.index);
        }
        return Math.max(acc, idx + 1);
      }, 0) || subtitles.length;
    const nextIndex = maxIndex + 1;
    const existingImageCount =
      (Array.isArray(latest?.images) ? latest.images.length : 0) ||
      subtitles.filter((sub) => /\[(?:이미지|image)\s*\d+\]/i.test(sub.scene_tag || "")).length;
    const nextImage = existingImageCount + 1;

    const lastEndSeconds =
      subtitles.reduce((acc, item) => {
        const endValue = item.end;
        if (typeof endValue === "string") {
          const converted = parseTimecodeToSeconds(endValue);
          if (converted !== null) {
            return Math.max(acc, converted);
          }
        } else if (typeof endValue === "number" && !Number.isNaN(endValue)) {
          return Math.max(acc, endValue);
        }
        return acc;
      }, 0) || 0;
    const nextStartTimecode = formatTimecode(lastEndSeconds);

    const prompt = createScriptContinuationPrompt({
      keyword,
      language,
      existingSRT,
      nextIndex,
      nextImage,
      nextStartTimecode,
      summary: summaryList
    });

    const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    window.open(chatgptUrl, "_blank", "width=1200,height=800");
    return;
  }

  try {
    const options = { method: "POST" };
    const payload = { ...request };
    if (modeVariant) {
      payload.continue_mode = modeVariant;
    }
    if (endpoint.type === "json") {
      options.body = JSON.stringify(payload);
    } else {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value);
        }
      });
      options.body = formData;
    }
    const fresh = await api(endpoint.url, options);
    const current = state.latestResults[tool] || {};

    if (tool === TOOL_KEYS.SCRIPT) {
      current.subtitles = [...(current.subtitles || []), ...(fresh.subtitles || [])];
      current.images = [...(current.images || []), ...(fresh.images || [])];
      if (Array.isArray(fresh.summary) && fresh.summary.length) {
        current.summary = [...fresh.summary];
      }
      current.keyword = fresh.keyword || current.keyword;
      current.language = fresh.language || current.language;
      state.latestResults[tool] = current;
      renderShortsScriptResults(current);
    } else if (tool === TOOL_KEYS.SCENES) {
      current.subtitles = [...(current.subtitles || []), ...(fresh.subtitles || [])];
      current.scenes = [...(current.scenes || []), ...(fresh.scenes || [])];
      current.keyword = fresh.keyword || current.keyword;
      current.language = fresh.language || current.language;
      state.latestResults[tool] = current;
      renderShortsSceneResults(current);
    }
    if (tool === TOOL_KEYS.SCRIPT || tool === TOOL_KEYS.SCENES) {
      state.audioResults[tool] = null;
      displayAudioResult(tool, null);
    }
  } catch (error) {
    alert(error.message);
  }
}

async function regenerateAll(tool) {
  const request = state.lastRequests[tool];
  const config = TOOL_CONFIG[tool];
  const endpoint = GENERATION_ENDPOINTS[tool];
  if (!endpoint || !config) {
    alert("이 기능은 지원되지 않습니다.");
    return;
  }
  if (!request) {
    alert("먼저 결과를 생성하세요.");
    return;
  }
  try {
    const options = { method: "POST" };
    if (endpoint.type === "json") {
      options.body = JSON.stringify(request);
    } else {
      const formData = new FormData();
      Object.entries(request).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item) => formData.append(`${key}[]`, item));
        } else if (value !== undefined && value !== null) {
          formData.append(key, value);
        }
      });
      options.body = formData;
    }
    const data = await api(endpoint.url, options);
    state.latestResults[tool] = data;
    state.activeRecords[tool] = null;
    const renderer = config.renderer;
    if (renderer) {
      renderer(data);
    }
    if (tool === TOOL_KEYS.SCRIPT || tool === TOOL_KEYS.SCENES) {
      state.audioResults[tool] = null;
      displayAudioResult(tool, null);
    }
  } catch (error) {
    alert(error.message);
  }
}

async function regenerateSingle(tool, index) {
  const idx = Number(index);
  if (Number.isNaN(idx)) {
    alert("선택한 항목을 확인할 수 없습니다.");
    return;
  }
  const request = state.lastRequests[tool];
  const endpoint = GENERATION_ENDPOINTS[tool];
  if (!endpoint) {
    alert("이 기능은 지원되지 않습니다.");
    return;
  }
  if (!state.latestResults[tool]) {
    alert("먼저 결과를 생성하세요.");
    return;
  }
  if (request == null) {
    alert("최근 요청 정보를 찾을 수 없습니다. 전체 재생성을 먼저 실행하세요.");
    return;
  }
  try {
    const options = { method: "POST" };
    if (endpoint.type === "json") {
      options.body = JSON.stringify(request);
    } else {
      const formData = new FormData();
      Object.entries(request).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value);
        }
      });
      options.body = formData;
    }
    const fresh = await api(endpoint.url, options);
    const current = state.latestResults[tool];
    if (!current) return;

    if (tool === TOOL_KEYS.SCRIPT && Array.isArray(fresh.images)) {
      if (!Array.isArray(current.images)) {
        current.images = [];
      }
      if (fresh.images[idx]) {
        current.images[idx] = fresh.images[idx];
        renderShortsScriptResults(current);
      } else {
        alert("새 프롬프트를 찾을 수 없습니다.");
      }
    } else if (tool === TOOL_KEYS.SCENES && Array.isArray(fresh.scenes)) {
      if (!Array.isArray(current.scenes)) {
        current.scenes = [];
      }
      if (fresh.scenes[idx]) {
        current.scenes[idx] = fresh.scenes[idx];
        renderShortsSceneResults(current);
      } else {
        alert("새 장면 프롬프트를 찾을 수 없습니다.");
      }
    }
    if (tool === TOOL_KEYS.SCRIPT || tool === TOOL_KEYS.SCENES) {
      state.audioResults[tool] = null;
      displayAudioResult(tool, null);
    }
  } catch (error) {
    alert(error.message);
  }
}

async function convertToSpeech(tool) {
  const latest = state.latestResults[tool];
  if (!latest) {
    alert("먼저 결과를 생성하세요.");
    return;
  }
  const subtitles = Array.isArray(latest.subtitles) ? latest.subtitles : [];
  if (!subtitles.length) {
    alert("자막 데이터를 찾을 수 없습니다.");
    return;
  }
  displayAudioResult(tool, null);
  try {
    const result = await api(`/api/tools/${tool}/speech`, {
      method: "POST",
      body: JSON.stringify({ subtitles, voice: "alloy", format: "mp3" })
    });
    state.audioResults[tool] = result;
    displayAudioResult(tool, result);
  } catch (error) {
    alert(error.message);
  }
}

async function convertSingleSubtitleToSpeech(project, subtitleIndex) {
  const subtitles = project.subtitles || [];
  if (subtitleIndex >= subtitles.length) {
    alert("자막을 찾을 수 없습니다.");
    return;
  }

  const subtitle = subtitles[subtitleIndex];
  const button = document.querySelector(`[data-subtitle-index="${subtitleIndex}"]`);

  if (button) {
    button.textContent = "🔄";
    button.disabled = true;
  }

  try {
    const result = await api(`/api/projects/${project.project_id}/speech`, {
      method: "POST",
      body: JSON.stringify({
        subtitle_text: subtitle.text,
        subtitle_index: subtitleIndex,
        voice: "alloy",
        format: "mp3"
      })
    });

    // 음성 클립 표시 업데이트
    const voiceCell = document.querySelector(`tr[data-row-index="${subtitleIndex}"] .voice-content-tl`);
    if (voiceCell && result.audio_url) {
      voiceCell.innerHTML = `
        <div class="audio-clip-controls">
          <button type="button" class="play-audio-btn secondary small" data-audio-index="${subtitleIndex}" data-audio-url="${result.audio_url}" title="음성 재생">
            ▶️
          </button>
          <audio style="display: none;" data-audio-index="${subtitleIndex}">
            <source src="${result.audio_url}" type="audio/mpeg">
          </audio>
          <small>음성 클립 생성됨</small>
        </div>
      `;

      // 재생 버튼 이벤트 리스너 추가
      const playBtn = voiceCell.querySelector('.play-audio-btn');
      const audio = voiceCell.querySelector('audio');

      if (playBtn && audio) {
        playBtn.addEventListener('click', () => {
          playAudioClip(audio, playBtn);
        });
      }
    }

    showNotification("음성 변환이 완료되었습니다!", "success");
  } catch (error) {
    alert(`음성 변환 실패: ${error.message}`);
  } finally {
    if (button) {
      button.textContent = "🎤";
      button.disabled = false;
    }
  }
}

function bindTTSHandlers(project) {
  const ttsButtons = document.querySelectorAll('.tts-btn[data-subtitle-index]');
  ttsButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const subtitleIndex = parseInt(button.dataset.subtitleIndex);
      await convertSingleSubtitleToSpeech(project, subtitleIndex);
    });
  });
}

// 오디오 클립 재생 관련 함수들
let currentlyPlayingAudio = null;

function playAudioClip(audio, button) {
  // 현재 재생 중인 오디오가 있으면 정지
  if (currentlyPlayingAudio && !currentlyPlayingAudio.paused) {
    currentlyPlayingAudio.pause();
    currentlyPlayingAudio.currentTime = 0;
    // 이전 버튼 상태 복원
    const prevButton = document.querySelector(`[data-audio-index="${currentlyPlayingAudio.dataset.audioIndex}"]`);
    if (prevButton) {
      prevButton.textContent = "▶️";
      prevButton.disabled = false;
    }
  }

  if (audio.paused) {
    // 재생 시작
    audio.play().then(() => {
      button.textContent = "⏸️";
      currentlyPlayingAudio = audio;

      // 재생 완료 시 버튼 상태 복원
      audio.addEventListener('ended', () => {
        button.textContent = "▶️";
        currentlyPlayingAudio = null;
      }, { once: true });

    }).catch(error => {
      console.error('오디오 재생 실패:', error);
      alert('오디오 재생에 실패했습니다.');
    });
  } else {
    // 재생 중지
    audio.pause();
    audio.currentTime = 0;
    button.textContent = "▶️";
    currentlyPlayingAudio = null;
  }
}

async function playAllAudioClips() {
  const audioClips = document.querySelectorAll('.audio-clip-controls audio');

  if (audioClips.length === 0) {
    alert('재생할 음성 클립이 없습니다.');
    return;
  }

  // 현재 재생 중인 오디오 정지
  if (currentlyPlayingAudio) {
    currentlyPlayingAudio.pause();
    currentlyPlayingAudio.currentTime = 0;
    currentlyPlayingAudio = null;
  }

  const playAllButton = document.getElementById('play-all-audio');
  if (playAllButton) {
    playAllButton.textContent = "⏸️ 전체 정지";
    playAllButton.disabled = true;
  }

  try {
    for (let i = 0; i < audioClips.length; i++) {
      const audio = audioClips[i];
      const button = document.querySelector(`[data-audio-index="${audio.dataset.audioIndex}"]`);

      if (audio.src && button) {
        button.textContent = "⏸️";
        currentlyPlayingAudio = audio;

        // 오디오 재생 및 완료 대기
        await new Promise((resolve, reject) => {
          audio.play().then(() => {
            audio.addEventListener('ended', resolve, { once: true });
            audio.addEventListener('error', reject, { once: true });
          }).catch(reject);
        });

        button.textContent = "▶️";
        currentlyPlayingAudio = null;
      }
    }
  } catch (error) {
    console.error('전체 재생 중 오류:', error);
    alert('전체 재생 중 오류가 발생했습니다.');
  } finally {
    if (playAllButton) {
      playAllButton.textContent = "🔊 전체 재생";
      playAllButton.disabled = false;
    }
    currentlyPlayingAudio = null;
  }
}

function updateTemplatePreview(templateOption) {
  if (!templateOption) return;

  const preview = document.getElementById("template-preview");
  const titleBox = document.getElementById("preview-title");
  const subtitleBox = document.getElementById("preview-subtitle");

  if (!preview || !titleBox || !subtitleBox) return;

  // 템플릿 데이터 가져오기
  const titleX = parseFloat(templateOption.dataset.titleX);
  const titleY = parseFloat(templateOption.dataset.titleY);
  const subtitleX = parseFloat(templateOption.dataset.subtitleX);
  const subtitleY = parseFloat(templateOption.dataset.subtitleY);
  const templateId = templateOption.value;

  // 위치 업데이트 (상대적 위치를 %로 변환) - !important 사용하여 CSS 오버라이드
  titleBox.style.setProperty('left', `${titleX * 100}%`, 'important');
  titleBox.style.setProperty('top', `${titleY * 100}%`, 'important');
  subtitleBox.style.setProperty('left', `${subtitleX * 100}%`, 'important');
  subtitleBox.style.setProperty('top', `${subtitleY * 100}%`, 'important');

  // 크기 조정 - 사용자 지정 크기로 설정
  titleBox.style.setProperty('font-size', '36px', 'important');
  subtitleBox.style.setProperty('font-size', '24px', 'important');

  // 템플릿별 스타일 적용
  preview.className = `template-preview template-${templateId}`;

  // 텍스트 효과도 적용
  applyTextEffects();
}

function applyTextEffects() {
  const titleBox = document.getElementById("preview-title");
  const subtitleBox = document.getElementById("preview-subtitle");
  const staticEffectSelect = document.getElementById("static-effect");
  const dynamicEffectSelect = document.getElementById("dynamic-effect");

  if (!titleBox || !subtitleBox || !staticEffectSelect || !dynamicEffectSelect) return;

  const staticEffect = staticEffectSelect.value;
  const dynamicEffect = dynamicEffectSelect.value;

  // 기존 효과 클래스 제거
  titleBox.className = titleBox.className.replace(/effect-\w+/g, '').replace(/static-\w+/g, '').replace(/dynamic-\w+/g, '').trim();
  subtitleBox.className = subtitleBox.className.replace(/effect-\w+/g, '').replace(/static-\w+/g, '').replace(/dynamic-\w+/g, '').trim();

  // 정적 효과 적용
  if (staticEffect && staticEffect !== 'none') {
    titleBox.classList.add(`static-${staticEffect}`);
    subtitleBox.classList.add(`static-${staticEffect}`);
  }

  // 동적 효과 적용
  if (dynamicEffect && dynamicEffect !== 'none') {
    titleBox.classList.add(`dynamic-${dynamicEffect}`);
    subtitleBox.classList.add(`dynamic-${dynamicEffect}`);
  }

  // 효과 적용 후에도 폰트 크기 유지
  titleBox.style.setProperty('font-size', '36px', 'important');
  subtitleBox.style.setProperty('font-size', '24px', 'important');
}

function initStoryKeywordPage() {
  const form = document.getElementById("story-keyword-form");
  const resultsContainer = document.getElementById("story-keyword-results");
  if (!form || !resultsContainer) return;

  const submitButton = form.querySelector("button[type='submit']");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const keyword = String(formData.get("keyword") || "").trim();
    const mode = String(formData.get("mode") || "api");

    if (!keyword) {
      alert("키워드를 입력하세요.");
      return;
    }

    const language = String(formData.get("language") || "ko") || "ko";
    let count = Number(formData.get("count") || 30);
    if (!Number.isFinite(count)) {
      count = 30;
    }

    // ChatGPT 창 모드 처리
    if (mode === "chatgpt") {
      const languageMap = { ko: "한국어", en: "영어", ja: "일본어" };
      const langText = languageMap[language] || "한국어";
      const prompt = `"${keyword}"라는 키워드로 ${count}개의 창의적인 스토리 제목을 ${langText}로 생성해줘. 각 제목은 흥미롭고 독창적이어야 하며, 번호를 매겨서 목록 형태로 제시해줘.`;

      const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
      window.open(chatgptUrl, '_blank', 'width=1200,height=800');

      resultsContainer.innerHTML = `
        <div class="chatgpt-result-section">
          <div class="placeholder">
            <p>ChatGPT 창에서 "${keyword}" 키워드로 ${count}개의 제목을 생성하고 있습니다...</p>
            <p>💡 결과가 나오면 아래 텍스트 영역에 복사해서 붙여넣으세요.</p>
          </div>
          <div class="result-input-section" style="margin-top: 20px;">
            <label>ChatGPT 결과 붙여넣기:
              <textarea id="chatgpt-result-input" placeholder="ChatGPT에서 생성된 결과를 여기에 붙여넣으세요..." style="width: 100%; height: 200px; margin-top: 10px;"></textarea>
            </label>
            <button type="button" id="process-chatgpt-result" style="margin-top: 10px;">결과 처리하기</button>
          </div>
        </div>
      `;

      // ChatGPT 결과 처리 버튼 이벤트
      const processBtn = document.getElementById('process-chatgpt-result');
      const textarea = document.getElementById('chatgpt-result-input');

      processBtn.addEventListener('click', () => {
        const chatgptResult = textarea.value.trim();
        if (!chatgptResult) {
          alert('ChatGPT 결과를 입력해주세요.');
          return;
        }

        // ChatGPT 결과를 파싱하여 표시
        const data = {
          titles: parseChatGPTResult(chatgptResult),
          keyword: keyword,
          language: language,
          count: count
        };

        state.latestResults[TOOL_KEYS.STORY] = data;
        renderStoryKeywordResults(data);
      });

      return;
    }

    // API 모드 처리 (기존 로직)
    const payload = { keyword, language, count };
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");
    }
    resultsContainer.innerHTML = '<div class="placeholder"><p>생성 중입니다...</p></div>';
    try {
      const data = await api("/api/generate/story-keywords", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.latestResults[TOOL_KEYS.STORY] = data;
      state.activeRecords[TOOL_KEYS.STORY] = null;
      renderStoryKeywordResults(data);
      renderSavedRecords(TOOL_KEYS.STORY);
    } catch (error) {
      resultsContainer.innerHTML = `<div class="placeholder"><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    }
  });
}

function initImageStoryPage() {
  const form = document.getElementById("image-story-form");
  const resultsContainer = document.getElementById("image-story-results");
  if (!form || !resultsContainer) return;

  const submitButton = form.querySelector("button[type='submit']");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const mode = String(formData.get("mode") || "api");
    const keyword = String(formData.get("keyword") || "").trim();
    const description = String(formData.get("image_description") || "").trim();
    const imageFile = formData.get("image");
    const hasImage = imageFile instanceof File && imageFile.size > 0;

    if (!hasImage && !description && !keyword) {
      alert("이미지 또는 키워드/설명 중 하나는 입력해야 합니다.");
      return;
    }

    let count = Number(formData.get("count") || 8);
    if (!Number.isFinite(count)) {
      count = 8;
    }

    // ChatGPT 창 모드 처리
    if (mode === "chatgpt") {
      let imageContext = "";
      if (hasImage) {
        imageContext = "업로드된 이미지";
      }
      if (description) {
        imageContext = imageContext ? `${imageContext}와 다음 설명: "${description}"` : `이미지 설명: "${description}"`;
      }
      if (keyword) {
        imageContext = imageContext ? `${imageContext}, 키워드: "${keyword}"` : `키워드: "${keyword}"`;
      }

      const prompt = `당신은 창의적인 스토리텔러입니다.
${imageContext}을 기반으로 스토리 제목 ${count}개를 생성하세요.

요구사항:
- 모든 제목은 10~20자 이내
- 장르 다양하게 (스릴러, 코미디, 드라마, SF, 미스터리 등)
- 긴박감·코믹함·반전 요소를 골고루 반영
- 중복 없이 ${count}개
- 번호 매기기 형식으로 출력

${hasImage ? "※ 이미지를 함께 업로드해서 분석해주세요." : ""}`;

      const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
      window.open(chatgptUrl, '_blank', 'width=1200,height=800');

      resultsContainer.innerHTML = `
        <div class="chatgpt-result-section">
          <div class="placeholder">
            <p>ChatGPT 창에서 이미지 기반 제목 ${count}개를 생성하고 있습니다...</p>
            <p>💡 ${hasImage ? "이미지를 업로드하고 " : ""}결과가 나오면 아래 텍스트 영역에 복사해서 붙여넣으세요.</p>
          </div>
          <div class="result-input-section" style="margin-top: 20px;">
            <label>ChatGPT 결과 붙여넣기:
              <textarea id="chatgpt-image-result-input" placeholder="ChatGPT에서 생성된 결과를 여기에 붙여넣으세요..." style="width: 100%; height: 200px; margin-top: 10px;"></textarea>
            </label>
            <button type="button" id="process-chatgpt-image-result" style="margin-top: 10px;">결과 처리하기</button>
          </div>
        </div>
      `;

      // ChatGPT 결과 처리 버튼 이벤트
      const processBtn = document.getElementById('process-chatgpt-image-result');
      const textarea = document.getElementById('chatgpt-image-result-input');

      processBtn.addEventListener('click', () => {
        const chatgptResult = textarea.value.trim();
        if (!chatgptResult) {
          alert('ChatGPT 결과를 입력해주세요.');
          return;
        }

        // ChatGPT 결과를 파싱하여 표시
        const data = {
          items: parseChatGPTImageResult(chatgptResult),
          keyword: keyword,
          image_description: description,
          count: count
        };

        state.latestResults[TOOL_KEYS.IMAGE_STORY] = data;
        renderImageStoryResults(data);
      });

      return;
    }

    // API 모드 처리 (기존 로직)
    formData.set("keyword", keyword);
    formData.set("image_description", description);
    formData.set("count", String(count));
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");
    }
    resultsContainer.innerHTML = '<div class="placeholder"><p>생성 중입니다...</p></div>';
    try {
      const data = await api("/api/generate/image-story", {
        method: "POST",
        body: formData
      });
      state.latestResults[TOOL_KEYS.IMAGE_STORY] = data;
      state.activeRecords[TOOL_KEYS.IMAGE_STORY] = null;
      renderImageStoryResults(data);
      renderSavedRecords(TOOL_KEYS.IMAGE_STORY);
    } catch (error) {
      resultsContainer.innerHTML = `<div class="placeholder"><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    }
  });
}

function initShortsScriptPage() {
  const form = document.getElementById("shorts-script-form");
  const resultsContainer = document.getElementById("shorts-script-results");
  if (!form || !resultsContainer) return;

  const submitButton = form.querySelector("button[type='submit']");
  const toolContent = form.closest(".tool-content");
  const englishPromptBtn = form.querySelector("[data-generate-script-english-prompt]");
  const englishPromptTextarea = toolContent ? toolContent.querySelector("#shorts-script-english-prompt") : null;
  const englishPromptCopyBtn = toolContent ? toolContent.querySelector("[data-copy-script-english-prompt]") : null;
  const koreanPromptBtn = form.querySelector("[data-generate-script-korean-prompt]");
  const koreanPromptTextarea = toolContent ? toolContent.querySelector("#shorts-script-korean-prompt") : null;
  const koreanPromptCopyBtn = toolContent ? toolContent.querySelector("[data-copy-script-korean-prompt]") : null;
  const importChatgptBtn = form.querySelector("[data-import-chatgpt-script]");
  const modeSelect = form.querySelector("select[name='mode']");

  const updateImportButtonState = () => {
    if (!importChatgptBtn) return;
    if (!modeSelect) {
      importChatgptBtn.disabled = false;
      return;
    }
    importChatgptBtn.disabled = modeSelect.value !== "chatgpt";
  };

  if (modeSelect && importChatgptBtn) {
    updateImportButtonState();
    modeSelect.addEventListener("change", updateImportButtonState);
  } else if (importChatgptBtn) {
    importChatgptBtn.disabled = true;
  }

  const processChatGPTShortsContent = (chatgptResult, keywordValue, languageValue) => {
    if (!chatgptResult) {
      alert("ChatGPT 결과를 입력해주세요.");
      return;
    }

    console.log("원본 텍스트:", chatgptResult);
    const parsed = parseChatGPTShortsResult(chatgptResult);
    console.log("파싱 결과:", parsed);

    if (parsed.subtitles.length === 0 && parsed.images.length === 0) {
      resultsContainer.innerHTML = `
        <article>
          <header>
            <h3>ChatGPT 결과 (원본)</h3>
            <p>키워드: <strong>${escapeHtml(keywordValue || "")}</strong></p>
          </header>
          <div style="white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 1rem; border-radius: 4px;">
            ${escapeHtml(chatgptResult)}
          </div>
        </article>
      `;
      return;
    }

    const previous = state.latestResults[TOOL_KEYS.SCRIPT] || {};
    const previousSummary = Array.isArray(previous.summary)
      ? previous.summary.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
    let mergedSummary = [...previousSummary];
    if (Array.isArray(parsed.summary) && parsed.summary.length) {
      const seen = new Set(previousSummary);
      parsed.summary.forEach((item) => {
        const normalised = String(item ?? "").trim();
        if (normalised && !seen.has(normalised)) {
          seen.add(normalised);
          mergedSummary.push(normalised);
        }
      });
    }

    const data = {
      subtitles: parsed.subtitles,
      images: parsed.images,
      summary: mergedSummary,
      keyword: keywordValue,
      language: languageValue
    };

    clearTrimQueueForTool(TOOL_KEYS.SCRIPT);
    state.latestResults[TOOL_KEYS.SCRIPT] = data;
    renderShortsScriptResults(data);
  };

  if (englishPromptTextarea) {
    englishPromptTextarea.addEventListener("input", () => {
      const hasText = englishPromptTextarea.value.trim().length > 0;
      if (englishPromptCopyBtn) {
        englishPromptCopyBtn.disabled = !hasText;
        if (!hasText) {
          englishPromptCopyBtn.textContent = "프롬프트 복사";
        }
      }
    });
  }
  if (koreanPromptTextarea) {
    koreanPromptTextarea.addEventListener("input", () => {
      const hasText = koreanPromptTextarea.value.trim().length > 0;
      if (koreanPromptCopyBtn) {
        koreanPromptCopyBtn.disabled = !hasText;
        if (!hasText) {
          koreanPromptCopyBtn.textContent = "프롬프트 복사";
        }
      }
    });
  }

  if (englishPromptBtn) {
    englishPromptBtn.addEventListener("click", async () => {
      const keywordInput = form.querySelector("input[name='shorts_keyword']");
      const keyword = keywordInput ? keywordInput.value.trim() : "";
      if (!keyword) {
        alert("스토리 키워드를 입력하세요.");
        return;
      }

      const formData = new FormData(form);
      const language = String(formData.get("language") || "ko") || "ko";

      try {
        englishPromptBtn.disabled = true;
        englishPromptBtn.setAttribute("aria-busy", "true");
        if (englishPromptTextarea) {
          englishPromptTextarea.value = "영어 프롬프트를 생성 중입니다...";
        }
        if (englishPromptCopyBtn) {
          englishPromptCopyBtn.disabled = true;
          englishPromptCopyBtn.textContent = "프롬프트 복사";
        }

        const data = await api("/api/generate/shorts-script-prompt", {
          method: "POST",
          body: JSON.stringify({ keyword, language })
        });

        if (englishPromptTextarea) {
          englishPromptTextarea.value = data?.prompt || "";
          englishPromptTextarea.scrollTop = 0;
          englishPromptTextarea.dispatchEvent(new Event("input"));
          englishPromptTextarea.focus();
          englishPromptTextarea.select();
        }
      } catch (error) {
        console.error("Failed to generate English prompt:", error);
        alert(error.message || "영어 프롬프트 생성에 실패했습니다.");
        if (englishPromptTextarea) {
          englishPromptTextarea.value = "";
          englishPromptTextarea.dispatchEvent(new Event("input"));
          englishPromptTextarea.focus();
        }
      } finally {
        englishPromptBtn.disabled = false;
        englishPromptBtn.removeAttribute("aria-busy");
      }
    });
  }
  if (koreanPromptBtn) {
    koreanPromptBtn.addEventListener("click", async () => {
      const keywordInput = form.querySelector("input[name='shorts_keyword']");
      const keyword = keywordInput ? keywordInput.value.trim() : "";
      if (!keyword) {
        alert("스토리 키워드를 입력하세요.");
        return;
      }
      try {
        koreanPromptBtn.disabled = true;
        koreanPromptBtn.setAttribute("aria-busy", "true");
        if (koreanPromptTextarea) {
          koreanPromptTextarea.value = "한국어 프롬프트를 생성 중입니다...";
        }
        if (koreanPromptCopyBtn) {
          koreanPromptCopyBtn.disabled = true;
          koreanPromptCopyBtn.textContent = "프롬프트 복사";
        }
        const data = await api("/api/generate/shorts-script-prompt", {
          method: "POST",
          body: JSON.stringify({ keyword, language: "ko" })
        });
        if (koreanPromptTextarea) {
          koreanPromptTextarea.value = data?.prompt || "";
          koreanPromptTextarea.scrollTop = 0;
          koreanPromptTextarea.dispatchEvent(new Event("input"));
          koreanPromptTextarea.focus();
        }
      } catch (error) {
        console.error("Failed to generate Korean prompt:", error);
        alert(error.message || "한국어 프롬프트 생성에 실패했습니다.");
        if (koreanPromptTextarea) {
          koreanPromptTextarea.value = "";
          koreanPromptTextarea.dispatchEvent(new Event("input"));
          koreanPromptTextarea.focus();
        }
      } finally {
        koreanPromptBtn.disabled = false;
        koreanPromptBtn.removeAttribute("aria-busy");
      }
    });
  }

  if (englishPromptCopyBtn && englishPromptTextarea) {
    englishPromptCopyBtn.addEventListener("click", async () => {
      const promptText = englishPromptTextarea.value.trim();
      if (!promptText) {
        alert("먼저 영어 프롬프트를 생성하세요.");
        return;
      }
      try {
        await navigator.clipboard.writeText(promptText);
        englishPromptCopyBtn.textContent = "복사 완료!";
        setTimeout(() => {
          englishPromptCopyBtn.textContent = "프롬프트 복사";
        }, 2000);
      } catch (error) {
        console.error("Failed to copy prompt:", error);
        alert("클립보드에 복사하지 못했습니다. 직접 복사해 주세요.");
      }
    });
  }
  if (koreanPromptCopyBtn && koreanPromptTextarea) {
    koreanPromptCopyBtn.addEventListener("click", async () => {
      const promptText = koreanPromptTextarea.value.trim();
      if (!promptText) {
        alert("먼저 한국어 프롬프트를 생성하세요.");
        return;
      }
      try {
        await navigator.clipboard.writeText(promptText);
        koreanPromptCopyBtn.textContent = "복사 완료!";
        setTimeout(() => {
          koreanPromptCopyBtn.textContent = "프롬프트 복사";
        }, 2000);
      } catch (error) {
        console.error("Failed to copy prompt:", error);
        alert("클립보드에 복사하지 못했습니다. 직접 복사해 주세요.");
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const mode = String(formData.get("mode") || "api");
    const keyword = String(formData.get("shorts_keyword") || "").trim();
    if (!keyword) {
      alert("스토리 키워드를 입력하세요.");
      return;
    }
    const language = String(formData.get("language") || "ko") || "ko";
    const englishPromptText = englishPromptTextarea ? englishPromptTextarea.value.trim() : "";
    const koreanPromptText = koreanPromptTextarea ? koreanPromptTextarea.value.trim() : "";

    // ChatGPT 창 모드 처리
    if (mode === "chatgpt") {
      const languageMap = { ko: "한국어", en: "영어", ja: "일본어" };
      const langText = languageMap[language] || "한국어";

      const prompt =
        englishPromptText ||
        koreanPromptText ||
        `입력받은 "${keyword}"라는 스토리 키워드를 바탕으로, 아래 기준에 따라 유튜브 Shorts용 60초 분량의 자막과 이미지 장면 묘사를 ${langText}로 생성하세요.

### 출력 규칙

1. 60초 분량 자막을 **SRT 형식**으로 작성하세요.
    - 각 자막 항목은 다음 요소를 포함해야 합니다:
        - 자막 번호
        - 타임스탬프 (형식: 00:00:00,000 --> 00:00:05,000)
        - 대사(내레이션 또는 인물 대사)
    - 각 대사 마지막에 반드시 [이미지 #] 태그를 붙여 해당 장면에 들어갈 이미지를 명확하게 지정하세요.
    - 전체 길이가 약 60초가 되도록, 6~10개의 자막으로 구성하세요.

2. **이미지 장면 묘사**를 모두 작성한 후, 마지막에 구분하여 정리하세요.
    - 각 이미지 번호([이미지 1]~[이미지 N])별로 1~2문장으로 구체적으로 묘사하세요.
    - 색감, 배경, 인물/사물의 액션, 상황 분위기를 최대한 생생하게 표현하세요.

# 출력 형식

**[SRT 자막]**
(각 자막 항목별로 번호, 타임스탬프, 대사 [이미지 #])

[빈 줄]

**[이미지 장면 묘사]**
- [이미지 1] XXX
- [이미지 2] XXX
- … (최종 자막에 등장한 이미지 번호 모두)

스토리 키워드: "${keyword}"`;

      const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
      window.open(chatgptUrl, '_blank', 'width=1200,height=800');

      resultsContainer.innerHTML = `
        <div class="chatgpt-result-section">
          <div class="placeholder">
            <p>ChatGPT 창에서 "${keyword}" 키워드로 쇼츠용 대본과 이미지 프롬프트를 생성하고 있습니다...</p>
            <p>💡 결과가 나오면 아래 텍스트 영역에 복사해서 붙여넣으세요.</p>
          </div>
          <div class="result-input-section" style="margin-top: 20px;">
            <label>ChatGPT 결과 붙여넣기:
              <textarea id="chatgpt-shorts-result-input" placeholder="ChatGPT에서 생성된 SRT 자막과 이미지 묘사를 여기에 붙여넣으세요..." style="width: 100%; height: 300px; margin-top: 10px;"></textarea>
            </label>
            <button type="button" id="process-chatgpt-shorts-result" style="margin-top: 10px;">결과 처리하기</button>
          </div>
        </div>
      `;

      // ChatGPT 결과 처리 버튼 이벤트
      const processBtn = document.getElementById('process-chatgpt-shorts-result');
      const textarea = document.getElementById('chatgpt-shorts-result-input');

      processBtn.addEventListener('click', () => {
        const chatgptResult = textarea.value.trim();
        processChatGPTShortsContent(chatgptResult, keyword, language);
      });

      return;
    }

    // API 모드 처리 (기존 로직)
    const payload = { keyword, language };
    state.lastRequests[TOOL_KEYS.SCRIPT] = { ...payload };
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");
    }
    resultsContainer.innerHTML = '<div class="placeholder"><p>생성 중입니다...</p></div>';
    try {
      const data = await api("/api/generate/shorts-script", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const normalizedData = { ...data, summary: Array.isArray(data.summary) ? data.summary : [] };
      clearTrimQueueForTool(TOOL_KEYS.SCRIPT);
      state.latestResults[TOOL_KEYS.SCRIPT] = normalizedData;
      state.activeRecords[TOOL_KEYS.SCRIPT] = null;
      state.audioResults[TOOL_KEYS.SCRIPT] = null;
      renderShortsScriptResults(normalizedData);
      renderSavedRecords(TOOL_KEYS.SCRIPT);
    } catch (error) {
      resultsContainer.innerHTML = `<div class="placeholder"><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    }
  });
}

function initShortsScenesPage() {
  const form = document.getElementById("shorts-scenes-form");
  const resultsContainer = document.getElementById("shorts-scenes-results");
  if (!form || !resultsContainer) return;

  const submitButton = form.querySelector("button[type='submit']");
  const toolContent = form.closest(".tool-content");
  const englishPromptBtn = form.querySelector("[data-generate-english-prompt]");
  const englishPromptTextarea = toolContent ? toolContent.querySelector("#shorts-scenes-english-prompt") : null;
  const englishPromptCopyBtn = toolContent ? toolContent.querySelector("[data-copy-english-prompt]") : null;
  const koreanPromptBtn = form.querySelector("[data-generate-korean-prompt]");
  const koreanPromptTextarea = toolContent ? toolContent.querySelector("#shorts-scenes-korean-prompt") : null;
  const koreanPromptCopyBtn = toolContent ? toolContent.querySelector("[data-copy-korean-prompt]") : null;

  if (englishPromptTextarea) {
    englishPromptTextarea.addEventListener("input", () => {
      const hasText = englishPromptTextarea.value.trim().length > 0;
      if (englishPromptCopyBtn) {
        englishPromptCopyBtn.disabled = !hasText;
        if (!hasText) {
          englishPromptCopyBtn.textContent = "프롬프트 복사";
        }
      }
    });
  }
  if (koreanPromptTextarea) {
    koreanPromptTextarea.addEventListener("input", () => {
      const hasText = koreanPromptTextarea.value.trim().length > 0;
      if (koreanPromptCopyBtn) {
        koreanPromptCopyBtn.disabled = !hasText;
        if (!hasText) {
          koreanPromptCopyBtn.textContent = "프롬프트 복사";
        }
      }
    });
  }

  if (englishPromptBtn) {
    englishPromptBtn.addEventListener("click", async () => {
      const keywordInput = form.querySelector("input[name='scenes_keyword']");
      const keyword = keywordInput ? keywordInput.value.trim() : "";
      if (!keyword) {
        alert("스토리 키워드를 입력하세요.");
        return;
      }

      const formData = new FormData(form);
      const language = String(formData.get("language") || "ko") || "ko";

      try {
        englishPromptBtn.disabled = true;
        englishPromptBtn.setAttribute("aria-busy", "true");
        if (englishPromptTextarea) {
          englishPromptTextarea.value = "영어 프롬프트를 생성 중입니다...";
        }
        if (englishPromptCopyBtn) {
          englishPromptCopyBtn.disabled = true;
          englishPromptCopyBtn.textContent = "프롬프트 복사";
        }

        const data = await api("/api/generate/shorts-scenes-prompt", {
          method: "POST",
          body: JSON.stringify({ keyword, language })
        });

        if (englishPromptTextarea) {
          englishPromptTextarea.value = data?.prompt || "";
          englishPromptTextarea.scrollTop = 0;
          englishPromptTextarea.dispatchEvent(new Event("input"));
          englishPromptTextarea.focus();
          englishPromptTextarea.select();
        }
      } catch (error) {
        console.error("Failed to generate scene English prompt:", error);
        alert(error.message || "영어 프롬프트 생성에 실패했습니다.");
        if (englishPromptTextarea) {
          englishPromptTextarea.value = "";
          englishPromptTextarea.dispatchEvent(new Event("input"));
          englishPromptTextarea.focus();
        }
      } finally {
        englishPromptBtn.disabled = false;
        englishPromptBtn.removeAttribute("aria-busy");
      }
    });
  }
  if (koreanPromptBtn) {
    koreanPromptBtn.addEventListener("click", async () => {
      const keywordInput = form.querySelector("input[name='scenes_keyword']");
      const keyword = keywordInput ? keywordInput.value.trim() : "";
      if (!keyword) {
        alert("스토리 키워드를 입력하세요.");
        return;
      }
      try {
        koreanPromptBtn.disabled = true;
        koreanPromptBtn.setAttribute("aria-busy", "true");
        if (koreanPromptTextarea) {
          koreanPromptTextarea.value = "한국어 프롬프트를 생성 중입니다...";
        }
        if (koreanPromptCopyBtn) {
          koreanPromptCopyBtn.disabled = true;
          koreanPromptCopyBtn.textContent = "프롬프트 복사";
        }
        const data = await api("/api/generate/shorts-scenes-prompt", {
          method: "POST",
          body: JSON.stringify({ keyword, language: "ko" })
        });
        if (koreanPromptTextarea) {
          koreanPromptTextarea.value = data?.prompt || "";
          koreanPromptTextarea.scrollTop = 0;
          koreanPromptTextarea.dispatchEvent(new Event("input"));
          koreanPromptTextarea.focus();
        }
      } catch (error) {
        console.error("Failed to generate scene Korean prompt:", error);
        alert(error.message || "한국어 프롬프트 생성에 실패했습니다.");
        if (koreanPromptTextarea) {
          koreanPromptTextarea.value = "";
          koreanPromptTextarea.dispatchEvent(new Event("input"));
          koreanPromptTextarea.focus();
        }
      } finally {
        koreanPromptBtn.disabled = false;
        koreanPromptBtn.removeAttribute("aria-busy");
      }
    });
  }

  if (englishPromptCopyBtn && englishPromptTextarea) {
    englishPromptCopyBtn.addEventListener("click", async () => {
      const promptText = englishPromptTextarea.value.trim();
      if (!promptText) {
        alert("먼저 영어 프롬프트를 생성하세요.");
        return;
      }
      try {
        await navigator.clipboard.writeText(promptText);
        englishPromptCopyBtn.textContent = "복사 완료!";
        setTimeout(() => {
          englishPromptCopyBtn.textContent = "프롬프트 복사";
        }, 2000);
      } catch (error) {
        console.error("Failed to copy prompt:", error);
        alert("클립보드에 복사하지 못했습니다. 직접 복사해 주세요.");
      }
    });
  }
  if (koreanPromptCopyBtn && koreanPromptTextarea) {
    koreanPromptCopyBtn.addEventListener("click", async () => {
      const promptText = koreanPromptTextarea.value.trim();
      if (!promptText) {
        alert("먼저 한국어 프롬프트를 생성하세요.");
        return;
      }
      try {
        await navigator.clipboard.writeText(promptText);
        koreanPromptCopyBtn.textContent = "복사 완료!";
        setTimeout(() => {
          koreanPromptCopyBtn.textContent = "프롬프트 복사";
        }, 2000);
      } catch (error) {
        console.error("Failed to copy prompt:", error);
        alert("클립보드에 복사하지 못했습니다. 직접 복사해 주세요.");
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const mode = String(formData.get("mode") || "api");
    const keyword = String(formData.get("scenes_keyword") || "").trim();
    if (!keyword) {
      alert("스토리 키워드를 입력하세요.");
      return;
    }
    const language = String(formData.get("language") || "ko") || "ko";
    const englishPromptText = englishPromptTextarea ? englishPromptTextarea.value.trim() : "";

    // ChatGPT 창 모드 처리
    if (mode === "chatgpt") {
      const languageMap = { ko: "한국어", en: "영어", ja: "일본어" };
      const langText = languageMap[language] || "한국어";

      const prompt =
        englishPromptText ||
        koreanPromptText ||
        `입력받은 "${keyword}"라는 스토리 키워드를 바탕으로, 아래 기준에 따라 유튜브 Shorts용 60초 분량의 영상 장면 대본과 카메라/촬영 지시사항을 ${langText}로 생성하세요.

### 출력 규칙

1. 60초 분량 대본을 **씬별 형식**으로 작성하세요.
    - 각 씬은 다음 요소를 포함해야 합니다:
        - [씬 #] 태그
        - 타임스탬프 (형식: 00:00:00,000 --> 00:00:05,000)
        - 대사/내레이션
        - 카메라 동작 및 촬영 지시사항
    - 전체 길이가 약 60초가 되도록, 6~10개의 씬으로 구성하세요.

2. **영상 장면 촬영 지시사항**을 각 씬별로 작성하세요.
    - 카메라 앵글 (클로즈업, 와이드샷, 미디엄샷 등)
    - 카메라 움직임 (팬, 틸트, 줌인/아웃, 트래킹 등)
    - 조명 및 색감 톤
    - 배경과 소품 설명
    - 인물/오브젝트 액션과 표정 연출

# 출력 형식

**[영상 씬 대본]**

[씬 1] 00:00:00,000 --> 00:00:06,000
대사: XXX
카메라: XXX

[씬 2] 00:00:06,000 --> 00:00:12,000
대사: XXX
카메라: XXX

...

**[촬영 지시사항]**
- [씬 1] 카메라 앵글, 조명, 연출 등 구체적 지시사항
- [씬 2] 카메라 앵글, 조명, 연출 등 구체적 지시사항
- ...

스토리 키워드: "${keyword}"`;

      const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
      window.open(chatgptUrl, '_blank', 'width=1200,height=800');

      resultsContainer.innerHTML = `
        <div class="chatgpt-result-section">
          <div class="placeholder">
            <p>ChatGPT 창에서 "${keyword}" 키워드로 영상 장면 대본과 촬영 지시사항을 생성하고 있습니다...</p>
            <p>💡 결과가 나오면 아래 텍스트 영역에 복사해서 붙여넣으세요.</p>
          </div>
          <div class="result-input-section" style="margin-top: 20px;">
            <label>ChatGPT 결과 붙여넣기:
              <textarea id="chatgpt-scenes-result-input" placeholder="ChatGPT에서 생성된 영상 씬 대본과 촬영 지시사항을 여기에 붙여넣으세요..." style="width: 100%; height: 300px; margin-top: 10px;"></textarea>
            </label>
            <button type="button" id="process-chatgpt-scenes-result" style="margin-top: 10px;">결과 처리하기</button>
          </div>
        </div>
      `;

      // ChatGPT 결과 처리 버튼 이벤트
      const processBtn = document.getElementById('process-chatgpt-scenes-result');
      const textarea = document.getElementById('chatgpt-scenes-result-input');

      processBtn.addEventListener('click', () => {
        const chatgptResult = textarea.value.trim();
        if (!chatgptResult) {
          alert('ChatGPT 결과를 입력해주세요.');
          return;
        }

        const parsed = parseChatGPTScenesResult(chatgptResult);
        const data = {
          ...parsed,
          script: chatgptResult,
          keyword: keyword,
          language: language
        };

        clearTrimQueueForTool(TOOL_KEYS.SCENES);
        state.latestResults[TOOL_KEYS.SCENES] = data;
        renderShortsSceneResults(data);
      });

      return;
    }

    // API 모드 처리 (기존 로직)
    const payload = { keyword, language };
    state.lastRequests[TOOL_KEYS.SCENES] = { ...payload };
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");
    }
    resultsContainer.innerHTML = '<div class="placeholder"><p>생성 중입니다...</p></div>';
    try {
      const data = await api("/api/generate/shorts-scenes", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      clearTrimQueueForTool(TOOL_KEYS.SCENES);
      state.latestResults[TOOL_KEYS.SCENES] = data;
      state.activeRecords[TOOL_KEYS.SCENES] = null;
      state.audioResults[TOOL_KEYS.SCENES] = null;
      renderShortsSceneResults(data);
      renderSavedRecords(TOOL_KEYS.SCENES);
    } catch (error) {
      resultsContainer.innerHTML = `<div class="placeholder"><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    }
  });

}

function renderProject(project) {
  state.project = project;
  const container = document.getElementById("project-state");
  if (!container) return;

  const totalDuration = getTotalDuration(project);
  container.innerHTML = buildProjectMarkup(project, totalDuration);
  setupTimelineScrollSync(container);
  bindProjectHandlers();
  bindTTSHandlers(project);
  highlightHistorySelection(project.project_id);
}

function buildProjectMarkup(project, totalDuration) {
  return `
    <article>
      <header class="grid">
        <div>
          <h2>${project.keyword}</h2>
          <p>프로젝트 ID: <code>${project.project_id}</code></p>
        </div>
        <div class="command-group">
          <button data-action="auto-align" class="outline">AI 자동 정렬</button>
          <button data-action="export" class="contrast">내보내기</button>
        </div>
      </header>

      <!-- 동시 편집 타임라인 섹션 -->
      <section class="timeline-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0;">동시 편집 타임라인</h3>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button id="play-all-audio" type="button" class="secondary" title="모든 음성 클립을 순서대로 재생">
              🔊 전체 재생
            </button>
            <button id="save-all-timeline" type="button" class="primary" title="현재 타임라인 상태를 모두 저장">
              💾 전체 저장
            </button>
            <button id="save-as-timeline" type="button" class="secondary" title="현재 타임라인을 다른 이름으로 저장">
              📝 다른 이름 저장
            </button>
            <button id="load-timeline" type="button" class="secondary" title="저장된 타임라인 불러오기">
              📂 불러오기
            </button>
            <button id="delete-timeline" type="button" class="danger" title="저장된 타임라인 삭제">
              🗑️ 삭제
            </button>
            <div style="border-left: 1px solid #ddd; margin: 0 0.5rem; height: 32px;"></div>
            <button id="bulk-reinterpret-all" type="button" class="secondary" title="모든 해설 부분을 재해석AI로 변환">
              🔄 전체 재해석
            </button>
            <button id="bulk-translate-jp-all" type="button" class="secondary" title="모든 해설 부분을 일본어로 번역">
              🇯🇵 전체 일본어
            </button>
            <button id="bulk-backtranslate-kr-all" type="button" class="secondary" title="모든 해설 부분을 역번역 한국어로 변환">
              🔙 전체 역번역
            </button>
            <button id="bulk-tts-all" type="button" class="secondary" title="모든 해설 부분을 음성으로 변환">
              🎤 전체 음성
            </button>
            <span id="autosave-indicator" style="font-size: 0.8rem; color: #666; margin-left: 1rem; min-width: 80px;"></span>
          </div>
        </div>
        <div class="timeline-table-container">
          <table class="timeline-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>유형</th>
                <th>음성·자막</th>
                <th>🎵</th>
                <th>🖼️</th>
                <th>🎬</th>
                <th>⚙️</th>
              </tr>
            </thead>
            <tbody>
              ${renderTimelineTableRows(project)}
            </tbody>
          </table>
        </div>
      </section>

      <!-- 전체 AI 변환 섹션 -->
      <section class="bulk-ai-section" style="margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0;">🤖 해설 부분 전체 AI 변환</h3>
          <div style="display: flex; gap: 1rem; align-items: center;">
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <label for="bulk-ai-type" style="font-weight: 500;">변환 유형:</label>
              <select id="bulk-ai-type" style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                <option value="">변환 유형 선택</option>
                <option value="reinterpret">🔄 재해석AI</option>
                <option value="translate-jp">🇯🇵 일본어번역AI</option>
                <option value="backtranslate-kr">🔙 역번역한국어AI</option>
                <option value="tts">🎤 음성변환</option>
              </select>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button id="bulk-ai-start" type="button" class="primary" disabled>
                🚀 전체 변환 시작
              </button>
              <button id="bulk-ai-cancel" type="button" class="secondary" disabled>
                ⏹️ 중단
              </button>
            </div>
          </div>
        </div>

        <!-- 진행 상태 표시 -->
        <div id="bulk-ai-progress" style="display: none; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span id="bulk-ai-status">준비 중...</span>
            <span id="bulk-ai-count">0 / 0</span>
          </div>
          <div style="width: 100%; background: #f0f0f0; border-radius: 10px; height: 20px; overflow: hidden;">
            <div id="bulk-ai-progress-bar" style="width: 0%; background: linear-gradient(90deg, #007bff, #0056b3); height: 100%; transition: width 0.3s ease; border-radius: 10px;"></div>
          </div>
        </div>

        <!-- 대상 항목 미리보기 -->
        <div id="bulk-ai-preview" style="display: none;">
          <h4 style="margin: 1rem 0 0.5rem 0;">변환 대상 (해설 부분만):</h4>
          <div id="bulk-ai-preview-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 1rem; background: #f9f9f9;">
            <!-- 동적으로 생성됨 -->
          </div>
        </div>
      </section>

      <!-- 미디어 추가 섹션 -->
      <section class="media-add-section">
        <h3>미디어 추가</h3>
        <div class="media-add-buttons">
          <button type="button" class="media-add-btn image-add" data-media="image">
            🖼️ 이미지 추가
          </button>
          <button type="button" class="media-add-btn music-add" data-media="music">
            🎵 배경 음악 추가
          </button>
          <button type="button" class="media-add-btn video-add" data-media="video">
            📹 영상 추가
          </button>
        </div>
      </section>

        <!-- 화면 템플릿 섹션 -->
        <section class="template-section">
          <div class="template-grid-container">
            <div class="control-group">
              <label class="control-label">화면 템플릿</label>
              <select id="template-selection" class="control-select">
                ${state.templates
                  .map(
                    (template, index) => `<option value="${template.id}" ${index === 0 ? 'selected' : ''}
                      data-title-x="${template.title[0]}"
                      data-title-y="${template.title[1]}"
                      data-subtitle-x="${template.subtitle[0]}"
                      data-subtitle-y="${template.subtitle[1]}">${template.name}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>

          <!-- 설정 관리 섹션 -->
          <div class="settings-management-section">
            <div class="settings-controls">
              <h3>⚙️ 설정 관리</h3>
              <div class="settings-buttons-row">
                <div class="save-settings-group">
                  <input type="text" id="settings-filename" class="settings-filename-input" placeholder="설정 파일명 (예: 내_설정_1)" />
                  <button type="button" class="settings-btn save-settings">💾 저장</button>
                </div>
                <div class="load-settings-group">
                  <select id="saved-settings-list" class="settings-list-select">
                    <option value="">저장된 설정을 선택하세요</option>
                  </select>
                  <button type="button" class="settings-btn load-settings">📂 불러오기</button>
                  <button type="button" class="settings-btn delete-settings">🗑️ 삭제</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 실시간 템플릿 프리뷰 섹션 -->
          <div class="template-preview-section">
            <h3>실시간 템플릿 프리뷰</h3>
            <div class="template-preview" id="template-preview">
              <div class="video-area" id="video-placeholder">
                <div class="video-indicator">📹 영상 영역</div>
              </div>
              <div class="title-box" id="preview-title">${project.keyword}</div>
              <div class="subtitle-box" id="preview-subtitle">${project.subtitles[0]?.text || "자막 미리보기"}</div>
            </div>
          </div>

          <div class="area-controls-wrapper">

                <!-- 영역 크기 및 위치 조절 컨트롤 -->
                <div class="area-controls-container">
                  <div class="area-controls-grid">
                    <!-- 영상 영역 컨트롤 -->
                    <div class="area-control-group">
                      <h4 class="area-title">📹 영상 영역</h4>
                      <button type="button" class="auto-adjust-btn" data-area="video">⚡ 자동조정</button>
                      <div class="control-group">
                        <label class="control-label">크기</label>
                        <input type="range" id="video-area-size" min="50" max="100" value="80" class="control-slider" />
                        <div class="size-display">80%</div>
                        <div class="size-bar">
                          <div class="size-bar-fill" style="width: 80%"></div>
                        </div>
                      </div>
                      <div class="position-controls">
                        <div class="position-row">
                          <label class="control-label">좌우</label>
                          <input type="range" id="video-area-x" min="0" max="100" value="50" class="control-slider" />
                          <div class="size-display">50%</div>
                        </div>
                        <div class="position-row">
                          <label class="control-label">상하</label>
                          <input type="range" id="video-area-y" min="0" max="100" value="50" class="control-slider" />
                          <div class="size-display">50%</div>
                        </div>
                      </div>
                    </div>

                    <!-- 제목 영역 컨트롤 -->
                    <div class="area-control-group">
                      <h4 class="area-title">📝 제목 영역</h4>
                      <button type="button" class="auto-adjust-btn" data-area="title">⚡ 자동조정</button>
                      <div class="control-group">
                        <label class="control-label">폰트 크기</label>
                        <input type="range" id="title-size" min="24" max="60" value="36" class="control-slider" />
                        <div class="size-display">36px</div>
                        <div class="size-bar">
                          <div class="size-bar-fill" style="width: 33.3%"></div>
                        </div>
                      </div>
                      <div class="control-group">
                        <label class="control-label">영역 크기</label>
                        <input type="range" id="title-area-size" min="60" max="120" value="100" class="control-slider" />
                        <div class="size-display">100%</div>
                        <div class="size-bar">
                          <div class="size-bar-fill" style="width: 66.7%"></div>
                        </div>
                      </div>
                      <div class="position-controls">
                        <div class="position-row">
                          <label class="control-label">좌우</label>
                          <input type="range" id="title-area-x" min="0" max="100" value="50" class="control-slider" />
                          <div class="size-display">50%</div>
                        </div>
                        <div class="position-row">
                          <label class="control-label">상하</label>
                          <input type="range" id="title-area-y" min="0" max="100" value="50" class="control-slider" />
                          <div class="size-display">50%</div>
                        </div>
                      </div>
                    </div>

                    <!-- 자막 영역 컨트롤 -->
                    <div class="area-control-group">
                      <h4 class="area-title">💬 자막 영역</h4>
                      <button type="button" class="auto-adjust-btn" data-area="subtitle">⚡ 자동조정</button>
                      <div class="control-group">
                        <label class="control-label">폰트 크기</label>
                        <input type="range" id="subtitle-size" min="16" max="48" value="24" class="control-slider" />
                        <div class="size-display">24px</div>
                        <div class="size-bar">
                          <div class="size-bar-fill" style="width: 25%"></div>
                        </div>
                      </div>
                      <div class="control-group">
                        <label class="control-label">상하 크기</label>
                        <input type="range" id="subtitle-height-size" min="60" max="120" value="100" class="control-slider" />
                        <div class="size-display">100%</div>
                        <div class="size-bar">
                          <div class="size-bar-fill" style="width: 66.7%"></div>
                        </div>
                      </div>
                      <div class="control-group">
                        <label class="control-label">좌우 크기</label>
                        <input type="range" id="subtitle-width-size" min="60" max="120" value="100" class="control-slider" />
                        <div class="size-display">100%</div>
                        <div class="size-bar">
                          <div class="size-bar-fill" style="width: 66.7%"></div>
                        </div>
                      </div>
                      <div class="position-controls">
                        <div class="position-row">
                          <label class="control-label">좌우</label>
                          <input type="range" id="subtitle-area-x" min="0" max="100" value="50" class="control-slider" />
                          <div class="size-display">50%</div>
                        </div>
                        <div class="position-row">
                          <label class="control-label">상하</label>
                          <input type="range" id="subtitle-area-y" min="0" max="100" value="95" class="control-slider" />
                          <div class="size-display">95%</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 효과 컨트롤 섹션 -->
                  <div class="effects-section">
                    <div class="effects-grid-container">
                      <!-- 영상 효과 컨트롤 -->
                      <div class="video-effects-control">
                        <h4 class="area-title">🎬 영상 효과</h4>
                        <p>비디오에 특수 효과를 적용하세요</p>
                        <form id="effect-form" class="effect-form">
                          <div class="form-row">
                            <label>효과 선택
                              <select name="effect_id">
                                ${state.effects.map((effect) => `<option value="${effect.id}">${effect.name}</option>`).join("")}
                              </select>
                            </label>
                          </div>
                          <div class="time-inputs">
                            <label>시작 시간 (초)
                              <input type="number" step="0.1" name="start_time" value="0" min="0" />
                            </label>
                            <label>종료 시간 (초)
                              <input type="number" step="0.1" name="end_time" value="5" min="0" />
                            </label>
                          </div>
                          <button type="submit" class="contrast">효과 적용</button>
                        </form>
                        <div class="applied-effects">
                          <h4>적용된 효과</h4>
                          <div class="effect-list">
                            ${project.applied_effects
                              .map(
                                (effect) => `
                                <div class="effect-item">
                                  <span class="effect-name">${effect.name}</span>
                                  <span class="effect-time">${effect.start_time.toFixed(1)}-${effect.end_time.toFixed(1)}초</span>
                                  <button type="button" data-remove-effect="${effect.effect_id}" class="outline small">삭제</button>
                                </div>`
                              )
                              .join("")}
                          </div>
                        </div>
                      </div>

                      <!-- 텍스트 효과 컨트롤 -->
                      <div class="text-effects-control">
                        <h4 class="area-title">🎨 텍스트 효과</h4>
                        <div class="effects-controls">
                          <div class="control-group">
                            <label class="control-label">정적 효과 (스타일)</label>
                            <select id="static-effect" class="control-select">
                              <option value="none">없음</option>
                              <option value="outline">외곽선</option>
                              <option value="shadow">그림자</option>
                              <option value="glow">글로우</option>
                              <option value="gradient">그라데이션</option>
                              <option value="neon">네온</option>
                            </select>
                          </div>
                          <div class="control-group">
                            <label class="control-label">동적 효과 (모션)</label>
                            <select id="dynamic-effect" class="control-select">
                              <option value="none">없음</option>
                              <option value="typewriter">타이핑</option>
                              <option value="wave">웨이브</option>
                              <option value="pulse">펄스</option>
                              <option value="shake">떨림</option>
                              <option value="fade">페이드</option>
                              <option value="bounce">바운스</option>
                              <option value="flip">회전</option>
                              <option value="slide">슬라이드</option>
                              <option value="zoom">줌</option>
                              <option value="rotate">회전</option>
                              <option value="glitch">글리치</option>
                              <option value="matrix">매트릭스</option>
                              <option value="fire">불꽃</option>
                              <option value="rainbow">무지개</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 미디어 추가 폼들 -->
        <div class="media-forms-container">
          <!-- 이미지 추가 패널 -->
          <article class="image-panel media-form-panel" style="display: none;">
            <header>
              <h3>🖼️ 이미지 추가</h3>
              <p>타임라인에 이미지를 삽입하세요</p>
            </header>
            <form id="image-prompt-form" class="image-form">
              <label>이미지 태그
                <input type="text" name="tag" placeholder="예: 이미지 7" required />
              </label>
              <label>이미지 설명
                <textarea name="description" rows="3" placeholder="장면에 대한 상세 설명을 입력하세요..." required></textarea>
              </label>
              <div class="time-inputs">
                <label>시작 시간 (초)
                  <input type="number" step="0.1" name="start" placeholder="0" min="0" />
                </label>
                <label>종료 시간 (초)
                  <input type="number" step="0.1" name="end" placeholder="5" min="0" />
                </label>
              </div>
              <button type="submit" class="contrast">이미지 추가</button>
            </form>
          </article>

          <!-- 배경 음악 추가 패널 -->
          <article class="music-panel media-form-panel" style="display: none;">
            <header>
              <h3>🎵 배경 음악 추가</h3>
              <p>프로젝트에 배경 음악을 추가하세요</p>
            </header>
            <form id="music-track-form" class="music-form">
              <div class="music-info">
                <label>트랙 ID
                  <input type="text" name="track_id" placeholder="예: bgm-main" required />
                </label>
                <label>음악 제목
                  <input type="text" name="title" placeholder="예: 메인 테마" required />
                </label>
                <label>파일 경로
                  <input type="text" name="source" placeholder="예: bgm/main-theme.mp3" />
                </label>
              </div>
              <div class="time-inputs">
                <label>시작 시간 (초)
                  <input type="number" step="0.1" name="start" placeholder="0" min="0" />
                </label>
                <label>종료 시간 (초)
                  <input type="number" step="0.1" name="end" placeholder="60" min="0" />
                </label>
              </div>
              <label>음량 (0.0 - 1.0)
                <input type="range" name="volume" min="0" max="1" step="0.05" value="0.8" />
                <output>0.8</output>
              </label>
              <button type="submit" class="contrast">배경 음악 추가</button>
            </form>
          </article>

          <!-- 영상 추가 패널 -->
          <article class="video-panel media-form-panel" style="display: none;">
            <header>
              <h3>🎬 영상 추가</h3>
              <p>타임라인에 영상을 삽입하세요</p>
            </header>
            <form id="video-prompt-form" class="video-form">
              <label>영상 태그
                <input type="text" name="scene_tag" placeholder="예: 씬 1" required />
              </label>
              <label>영상 설명
                <textarea name="description" rows="3" placeholder="영상 장면에 대한 상세 설명을 입력하세요..." required></textarea>
              </label>
              <div class="time-inputs">
                <label>시작 시간 (초)
                  <input type="number" step="0.1" name="start" placeholder="0" min="0" />
                </label>
                <label>종료 시간 (초)
                  <input type="number" step="0.1" name="end" placeholder="10" min="0" />
                </label>
              </div>
              <button type="submit" class="contrast">영상 추가</button>
            </form>
          </article>
        </div>

      </section>


      </section>
    </article>
  `;
}

function setupTimelineScrollSync(root) {
  const previousCleanup = timelineScrollCleanups.get(root);
  if (previousCleanup) {
    previousCleanup();
    timelineScrollCleanups.delete(root);
  }

  const wrapper = root.querySelector(".timeline-wrapper");
  if (!wrapper) return;

  const tracks = Array.from(wrapper.querySelectorAll(".timeline-track"));
  const slider = wrapper.querySelector(".timeline-scrollbar input[type='range']");
  if (!tracks.length || !slider) return;

  const metrics = new Map();
  let isSyncing = false;

  const computeMetrics = () => {
    metrics.clear();
    tracks.forEach((track) => {
      const maxOffset = Math.max(0, track.scrollWidth - track.clientWidth);
      metrics.set(track, maxOffset);
    });
    const maxOffset = Math.max(0, ...metrics.values());
    slider.disabled = maxOffset <= 0;
    if (maxOffset <= 0) {
      slider.value = "0";
    }
  };

  const syncTracksToRatio = (ratio) => {
    tracks.forEach((track) => {
      const maxOffset = metrics.get(track) ?? 0;
      track.scrollLeft = maxOffset * ratio;
    });
  };

  const ratioFromTrack = (track) => {
    const maxOffset = metrics.get(track) ?? Math.max(0, track.scrollWidth - track.clientWidth);
    if (!maxOffset) return 0;
    return Math.min(1, Math.max(0, track.scrollLeft / maxOffset));
  };

  const updateSliderFromRatio = (ratio) => {
    slider.value = String(Math.round(ratio * Number(slider.max || 1000)));
  };

  const handleTrackScroll = (event) => {
    if (isSyncing) return;
    isSyncing = true;
    const source = event.currentTarget;
    const ratio = ratioFromTrack(source);
    tracks.forEach((track) => {
      if (track !== source) {
        const maxOffset = metrics.get(track) ?? 0;
        track.scrollLeft = maxOffset * ratio;
      }
    });
    updateSliderFromRatio(ratio);
    isSyncing = false;
  };

  const handleSliderInput = () => {
    if (slider.disabled) return;
    const maxValue = Number(slider.max || 1000) || 1000;
    const ratio = Number(slider.value || 0) / maxValue;
    isSyncing = true;
    syncTracksToRatio(ratio);
    isSyncing = false;
    updateSliderFromRatio(ratio);
  };

  computeMetrics();
  updateSliderFromRatio(tracks.length ? ratioFromTrack(tracks[0]) : 0);

  tracks.forEach((track) => {
    track.addEventListener("scroll", handleTrackScroll, { passive: true });
  });
  slider.addEventListener("input", handleSliderInput);

  const resizeObservers = [];
  const handleResize = () => {
    computeMetrics();
    const reference = tracks[0];
    updateSliderFromRatio(reference ? ratioFromTrack(reference) : 0);
  };

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(handleResize);
    tracks.forEach((track) => observer.observe(track));
    resizeObservers.push(observer);
  } else {
    window.addEventListener("resize", handleResize);
  }

  requestAnimationFrame(() => {
    computeMetrics();
    updateSliderFromRatio(tracks.length ? ratioFromTrack(tracks[0]) : 0);
  });

  const cleanup = () => {
    tracks.forEach((track) => {
      track.removeEventListener("scroll", handleTrackScroll);
    });
    slider.removeEventListener("input", handleSliderInput);
    if (resizeObservers.length) {
      resizeObservers.forEach((observer) => observer.disconnect());
    } else {
      window.removeEventListener("resize", handleResize);
    }
    timelineScrollCleanups.delete(root);
  };

  timelineScrollCleanups.set(root, cleanup);
}

function renderTimelineRow(label, items, builder, key) {
  const trackId = key ? `${key}-track` : null;
  const content = items && items.length ? items.map(builder).join("") : '<div class="segment empty">데이터 없음</div>';
  const attributes = [
    'class="timeline-track"',
    `data-label="${label}"`,
    key ? `data-track="${key}"` : "",
    trackId ? `id="${trackId}"` : ""
  ]
    .filter(Boolean)
    .join(" ");
  return `
    <div><strong>${label}</strong></div>
    <div ${attributes}>
      ${content}
    </div>
  `;
}

function buildSubtitleSegment(segment) {
  const text = escapeHtml(segment.text);
  const scene = escapeHtml(segment.scene_tag);
  const start = formatTime(segment.start);
  const end = formatTime(segment.end);
  return `
    <div class="segment editable" data-type="subtitle" data-index="${segment.index}">
      <div class="segment-view">
        <span>#${segment.index} (${start}s→${end}s)</span>
        <strong>${text}</strong>
        <small>${scene}</small>
      </div>
      <form class="segment-edit" data-form="subtitle">
        <label>내용<textarea name="text" rows="2">${text}</textarea></label>
        <div class="segment-edit-grid">
          <label>시작(초)<input type="number" step="0.1" name="start" value="${start}" required /></label>
          <label>종료(초)<input type="number" step="0.1" name="end" value="${end}" required /></label>
        </div>
        <div class="segment-edit-actions">
          <button type="submit" data-action="save">저장</button>
          <button type="button" data-action="cancel">취소</button>
        </div>
      </form>
      <div class="segment-actions">
        <button type="button" data-action="edit">수정</button>
        <button type="button" data-action="delete">삭제</button>
      </div>
    </div>
  `;
}

function buildAudioSegment(segment) {
  const start = formatTime(segment.start);
  const end = formatTime(segment.end);
  return `
    <div class="segment read-only" data-type="audio" data-index="${segment.index}">
      <span>${start}s-${end}s</span>
      <small>음성 클립</small>
    </div>
  `;
}

function buildMusicSegment(track) {
  const trackId = escapeHtml(track.track_id);
  const title = escapeHtml(track.title);
  const source = escapeHtml(track.source);
  const start = formatTime(track.start);
  const end = formatTime(track.end);
  const volume = typeof track.volume === "number" && !Number.isNaN(track.volume) ? track.volume : 0.8;
  const volumeLabel = `${Math.round(volume * 100)}%`;
  return `
    <div class="segment editable music-segment" data-type="music" data-track="${trackId}">
      <div class="segment-view">
        <span>${title}</span>
        <small>ID: ${trackId}</small>
        ${source ? `<small>${source}</small>` : ""}
        <small>${start || "-"}s → ${end || "-"}s · 볼륨 ${volumeLabel}</small>
      </div>
      <form class="segment-edit" data-form="music">
        <label>트랙 ID<input type="text" name="track_id" value="${trackId}" required /></label>
        <label>제목<input type="text" name="title" value="${title}" required /></label>
        <label>출처/파일<input type="text" name="source" value="${source}" /></label>
        <div class="segment-edit-grid">
          <label>시작(초)<input type="number" step="0.1" name="start" value="${start}" /></label>
          <label>종료(초)<input type="number" step="0.1" name="end" value="${end}" /></label>
        </div>
        <label>볼륨(0-1)<input type="number" step="0.05" min="0" max="1" name="volume" value="${volume}" /></label>
        <div class="segment-edit-actions">
          <button type="submit" data-action="save">저장</button>
          <button type="button" data-action="cancel">취소</button>
        </div>
      </form>
      <div class="segment-actions">
        <button type="button" data-action="edit">수정</button>
        <button type="button" data-action="delete">삭제</button>
      </div>
    </div>
  `;
}

function buildImageSegment(prompt) {
  const tag = escapeHtml(prompt.tag);
  const description = escapeHtml(prompt.description);
  const start = formatTime(prompt.start);
  const end = formatTime(prompt.end);
  return `
    <div class="segment editable scene-segment" data-type="image" data-tag="${tag}">
      <div class="segment-view">
        <span>${tag}</span>
        <small>${description}</small>
        <small>${start || "-"}s → ${end || "-"}s</small>
      </div>
      <form class="segment-edit" data-form="image">
        <label>태그<input type="text" name="tag" value="${tag}" required /></label>
        <label>설명<textarea name="description" rows="2">${description}</textarea></label>
        <div class="segment-edit-grid">
          <label>시작(초)<input type="number" step="0.1" name="start" value="${start}" /></label>
          <label>종료(초)<input type="number" step="0.1" name="end" value="${end}" /></label>
        </div>
        <div class="segment-edit-actions">
          <button type="submit" data-action="save">저장</button>
          <button type="button" data-action="cancel">취소</button>
        </div>
      </form>
      <div class="segment-actions">
        <button type="button" data-action="edit">수정</button>
        <button type="button" data-action="delete">삭제</button>
      </div>
    </div>
  `;
}

function buildVideoSegment(prompt) {
  const sceneTag = escapeHtml(prompt.scene_tag);
  const camera = escapeHtml(prompt.camera);
  const action = escapeHtml(prompt.action);
  const mood = escapeHtml(prompt.mood);
  const start = formatTime(prompt.start);
  const end = formatTime(prompt.end);
  return `
    <div class="segment editable video-segment" data-type="video" data-scene="${sceneTag}">
      <div class="segment-view">
        <span>${sceneTag}</span>
        <small>${action}</small>
        <small>${start || "-"}s → ${end || "-"}s</small>
      </div>
      <form class="segment-edit" data-form="video">
        <label>씬 태그<input type="text" name="scene_tag" value="${sceneTag}" required /></label>
        <label>카메라<input type="text" name="camera" value="${camera}" required /></label>
        <label>액션<textarea name="action" rows="2">${action}</textarea></label>
        <label>분위기<input type="text" name="mood" value="${mood}" required /></label>
        <div class="segment-edit-grid">
          <label>시작(초)<input type="number" step="0.1" name="start" value="${start}" /></label>
          <label>종료(초)<input type="number" step="0.1" name="end" value="${end}" /></label>
        </div>
        <div class="segment-edit-actions">
          <button type="submit" data-action="save">저장</button>
          <button type="button" data-action="cancel">취소</button>
        </div>
      </form>
      <div class="segment-actions">
        <button type="button" data-action="edit">수정</button>
        <button type="button" data-action="delete">삭제</button>
      </div>
    </div>
  `;
}

function setupSegmentEditor(segmentEl, { onSave, onDelete, confirmMessage }) {
  const form = segmentEl.querySelector(".segment-edit");
  const editButton = segmentEl.querySelector("[data-action='edit']");
  const cancelButton = segmentEl.querySelector(".segment-edit [data-action='cancel']");
  const deleteButton = segmentEl.querySelector("[data-action='delete']");

  if (editButton && form) {
    editButton.addEventListener("click", () => {
      segmentEl.classList.add("editing");
      const focusTarget = form.querySelector("input, textarea");
      if (focusTarget) {
        focusTarget.focus();
      }
    });
  }

  if (cancelButton && form) {
    cancelButton.addEventListener("click", () => {
      form.reset();
      segmentEl.classList.remove("editing");
    });
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await onSave(new FormData(form));
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      if (confirmMessage && !confirm(confirmMessage)) return;
      try {
        await onDelete();
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

function bindTimelineEditors(container) {
  const projectId = state.project?.project_id;
  if (!projectId) return;

  container.querySelectorAll(".segment[data-type='subtitle']").forEach((segmentEl) => {
    const index = segmentEl.dataset.index;
    if (!index) return;
    setupSegmentEditor(segmentEl, {
      confirmMessage: "선택한 자막을 삭제할까요?",
      onSave: async (formData) => {
        const payload = {
          text: String(formData.get("text") || "").trim(),
          start: Number(formData.get("start")),
          end: Number(formData.get("end"))
        };
        if (!payload.text) {
          alert("자막 내용을 입력하세요.");
          return;
        }
        const project = await api(`/api/projects/${projectId}/subtitles/${index}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        renderProject(project);
      },
      onDelete: async () => {
        const project = await api(`/api/projects/${projectId}/subtitles/${index}`, {
          method: "DELETE"
        });
        renderProject(project);
      }
    });
  });

  container.querySelectorAll(".segment[data-type='image']").forEach((segmentEl) => {
    const originalTag = segmentEl.dataset.tag;
    if (!originalTag) return;
    setupSegmentEditor(segmentEl, {
      confirmMessage: "선택한 이미지를 삭제할까요?",
      onSave: async (formData) => {
        const payload = {
          tag: String(formData.get("tag") || "").trim(),
          description: String(formData.get("description") || "").trim(),
          start: toOptionalNumber(formData.get("start")),
          end: toOptionalNumber(formData.get("end"))
        };
        if (!payload.tag || !payload.description) {
          alert("태그와 설명을 모두 입력하세요.");
          return;
        }
        if (payload.start === null) delete payload.start;
        if (payload.end === null) delete payload.end;
        const project = await api(`/api/projects/${projectId}/prompts/image/${encodeURIComponent(originalTag)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        renderProject(project);
      },
      onDelete: async () => {
        const project = await api(`/api/projects/${projectId}/prompts/image/${encodeURIComponent(originalTag)}`, {
          method: "DELETE"
        });
        renderProject(project);
      }
    });

    segmentEl.addEventListener("click", (event) => {
      if (event.target.closest(".segment-actions") || event.target.closest(".segment-edit")) return;
      highlightPrompt(originalTag, "image");
    });
  });

  container.querySelectorAll(".segment[data-type='music']").forEach((segmentEl) => {
    const originalTrackId = segmentEl.dataset.track;
    if (!originalTrackId) return;
    setupSegmentEditor(segmentEl, {
      confirmMessage: "선택한 배경 음악을 삭제할까요?",
      onSave: async (formData) => {
        const payload = {
          track_id: String(formData.get("track_id") || "").trim(),
          title: String(formData.get("title") || "").trim(),
          source: String(formData.get("source") || "").trim() || undefined,
          start: toOptionalNumber(formData.get("start")),
          end: toOptionalNumber(formData.get("end")),
          volume: toOptionalNumber(formData.get("volume"))
        };
        if (!payload.track_id || !payload.title) {
          alert("트랙 ID와 제목을 입력하세요.");
          return;
        }
        if (payload.start === null) delete payload.start;
        if (payload.end === null) delete payload.end;
        if (payload.volume === null || Number.isNaN(payload.volume)) {
          delete payload.volume;
        }
        const project = await api(`/api/projects/${projectId}/music/${encodeURIComponent(originalTrackId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        renderProject(project);
      },
      onDelete: async () => {
        const project = await api(`/api/projects/${projectId}/music/${encodeURIComponent(originalTrackId)}`, {
          method: "DELETE"
        });
        renderProject(project);
      }
    });

    segmentEl.addEventListener("click", (event) => {
      if (event.target.closest(".segment-actions") || event.target.closest(".segment-edit")) return;
      highlightPrompt(originalTrackId, "music");
    });
  });

  container.querySelectorAll(".segment[data-type='video']").forEach((segmentEl) => {
    const originalTag = segmentEl.dataset.scene;
    if (!originalTag) return;
    setupSegmentEditor(segmentEl, {
      confirmMessage: "선택한 영상을 삭제할까요?",
      onSave: async (formData) => {
        const payload = {
          scene_tag: String(formData.get("scene_tag") || "").trim(),
          camera: String(formData.get("camera") || "").trim(),
          action: String(formData.get("action") || "").trim(),
          mood: String(formData.get("mood") || "").trim(),
          start: toOptionalNumber(formData.get("start")),
          end: toOptionalNumber(formData.get("end"))
        };
        if (!payload.scene_tag || !payload.camera || !payload.action || !payload.mood) {
          alert("씬 태그, 카메라, 액션, 분위기를 모두 입력하세요.");
          return;
        }
        if (payload.start === null) delete payload.start;
        if (payload.end === null) delete payload.end;
        const project = await api(`/api/projects/${projectId}/prompts/video/${encodeURIComponent(originalTag)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        renderProject(project);
      },
      onDelete: async () => {
        const project = await api(`/api/projects/${projectId}/prompts/video/${encodeURIComponent(originalTag)}`, {
          method: "DELETE"
        });
        renderProject(project);
      }
    });

    segmentEl.addEventListener("click", (event) => {
      if (event.target.closest(".segment-actions") || event.target.closest(".segment-edit")) return;
      highlightPrompt(originalTag, "video");
    });
  });
}

function bindProjectHandlers() {
  const container = document.getElementById("project-state");
  if (!container) return;

  container.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const action = event.currentTarget.dataset.action;
      try {
        if (action === "generate-titles") {
          const project = await api(`/api/projects/${state.project.project_id}/generate/titles`, {
            method: "POST",
            body: JSON.stringify({ type: "keyword", count: 30 })
          });
          renderProject(project);
        }
        if (action === "generate-subtitles") {
          const project = await api(`/api/projects/${state.project.project_id}/generate/subtitles`, { method: "POST" });
          renderProject(project);
        }
        if (action === "generate-scenes") {
          const project = await api(`/api/projects/${state.project.project_id}/generate/scenes`, { method: "POST" });
          renderProject(project);
        }
        if (action === "auto-align") {
          const project = await api(`/api/projects/${state.project.project_id}/align`, { method: "POST" });
          renderProject(project);
        }
        if (action === "export") {
          const data = await api(`/api/projects/${state.project.project_id}/export`, { method: "POST" });
          alert(`내보내기 완료:\n${Object.entries(data)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n")}`);
        }
      } catch (error) {
        alert(error.message);
      }
    });
  });

  const templateSelector = container.querySelector("#template-selection");
  if (templateSelector) {
    templateSelector.addEventListener("change", async () => {
      const selectedOption = templateSelector.selectedOptions[0];

      // 실시간 미리보기 업데이트
      updateTemplatePreview(selectedOption);

      const templateId = selectedOption.value;
      const payload = {
        template_id: templateId,
        title_position: [parseFloat(selectedOption.dataset.titleX), parseFloat(selectedOption.dataset.titleY)],
        subtitle_position: [parseFloat(selectedOption.dataset.subtitleX), parseFloat(selectedOption.dataset.subtitleY)],
        title_style: { effect: document.getElementById("text-effect").value },
        subtitle_style: { effect: document.getElementById("text-effect").value }
      };
      try {
        const project = await api(`/api/projects/${state.project.project_id}/template`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        renderProject(project);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const effectForm = container.querySelector("#effect-form");
  if (effectForm) {
    effectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(effectForm);
      const effectId = formData.get("effect_id");
      const effect = state.effects.find((e) => e.id === effectId);
      if (!effect) return;
      const payload = {
        effect_id: effect.id,
        name: effect.name,
        start_time: Number(formData.get("start_time")),
        end_time: Number(formData.get("end_time")),
        parameters: {}
      };
      try {
        const project = await api(`/api/projects/${state.project.project_id}/effects`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        renderProject(project);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  container.querySelectorAll("button[data-remove-effect]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const effectId = btn.dataset.removeEffect;
      try {
        const project = await api(`/api/projects/${state.project.project_id}/effects/${effectId}`, {
          method: "DELETE"
        });
        renderProject(project);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  const titleSize = container.querySelector("#title-size");
  const subtitleSize = container.querySelector("#subtitle-size");
  const previewTitle = container.querySelector("#preview-title");
  const previewSubtitle = container.querySelector("#preview-subtitle");

  const refreshPreview = () => {
    if (previewTitle && titleSize) {
      previewTitle.style.fontSize = `${titleSize.value}px`;
      // 크기 표시 업데이트
      const titleSizeDisplay = titleSize.parentNode.querySelector(".size-display");
      if (titleSizeDisplay) {
        titleSizeDisplay.textContent = `${titleSize.value}px`;
      }
    }
    if (previewSubtitle && subtitleSize) {
      previewSubtitle.style.fontSize = `${subtitleSize.value}px`;
      // 크기 표시 업데이트
      const subtitleSizeDisplay = subtitleSize.parentNode.querySelector(".size-display");
      if (subtitleSizeDisplay) {
        subtitleSizeDisplay.textContent = `${subtitleSize.value}px`;
      }
    }
  };

  if (titleSize && subtitleSize) {
    titleSize.addEventListener("input", refreshPreview);
    subtitleSize.addEventListener("input", refreshPreview);
  }
  refreshPreview();

  const imagePromptForm = container.querySelector("#image-prompt-form");
  if (imagePromptForm) {
    imagePromptForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(imagePromptForm);
      const payload = Object.fromEntries(formData.entries());
      payload.start = payload.start ? Number(payload.start) : undefined;
      payload.end = payload.end ? Number(payload.end) : undefined;
      if (!payload.tag || !payload.description) {
        alert("태그와 설명을 입력하세요");
        return;
      }
      try {
        const project = await api(`/api/projects/${state.project.project_id}/prompts/image`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        imagePromptForm.reset();
        renderProject(project);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const musicTrackForm = container.querySelector("#music-track-form");
  if (musicTrackForm) {
    musicTrackForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(musicTrackForm);
      const payload = {
        track_id: String(formData.get("track_id") || "").trim(),
        title: String(formData.get("title") || "").trim(),
        source: String(formData.get("source") || "").trim() || undefined,
        start: toOptionalNumber(formData.get("start")),
        end: toOptionalNumber(formData.get("end")),
        volume: toOptionalNumber(formData.get("volume")),
      };
      if (!payload.track_id || !payload.title) {
        alert("트랙 ID와 제목을 입력하세요.");
        return;
      }
      if (payload.start === null) delete payload.start;
      if (payload.end === null) delete payload.end;
      if (payload.volume === null || Number.isNaN(payload.volume)) {
        delete payload.volume;
      }
      try {
        const project = await api(`/api/projects/${state.project.project_id}/music`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        musicTrackForm.reset();
        const volumeInput = musicTrackForm.querySelector("input[name='volume']");
        if (volumeInput) volumeInput.value = "0.8";
        renderProject(project);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  // 템플릿 미리보기 컨트롤 이벤트 바인딩
  bindTemplateControls(container);

  bindTimelineEditors(container);
}

function bindTemplateControls(container) {

  // 정적 효과 선택
  const staticEffectSelect = container.querySelector('#static-effect');
  if (staticEffectSelect) {
    staticEffectSelect.addEventListener('change', applyTextEffects);
  }

  // 동적 효과 선택
  const dynamicEffectSelect = container.querySelector('#dynamic-effect');
  if (dynamicEffectSelect) {
    dynamicEffectSelect.addEventListener('change', applyTextEffects);
  }

  // 영역 크기 조절 컨트롤
  const videoAreaSizeSlider = container.querySelector('#video-area-size');
  if (videoAreaSizeSlider) {
    videoAreaSizeSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      // size-bar 업데이트
      const sizeBar = this.nextElementSibling.nextElementSibling.querySelector('.size-bar-fill');
      if (sizeBar) {
        sizeBar.style.width = value;
      }
      const videoArea = document.getElementById('video-placeholder');
      if (videoArea) {
        videoArea.style.setProperty('width', value, 'important');
        // 비율에 맞게 높이도 조절
        const heightValue = (this.value * 0.5) + '%'; // 50% 기준으로 조절
        videoArea.style.setProperty('height', heightValue, 'important');
      }
    });
  }

  const titleAreaSizeSlider = container.querySelector('#title-area-size');
  if (titleAreaSizeSlider) {
    titleAreaSizeSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      // size-bar 업데이트 (60-120 범위를 0-100%로 변환)
      const barPercentage = ((this.value - 60) / (120 - 60)) * 100;
      const sizeBar = this.nextElementSibling.nextElementSibling.querySelector('.size-bar-fill');
      if (sizeBar) {
        sizeBar.style.width = barPercentage + '%';
      }
      const titleBox = document.getElementById('preview-title');
      if (titleBox) {
        const scale = this.value / 100;
        titleBox.style.setProperty('transform', `scale(${scale})`, 'important');
        titleBox.style.setProperty('transform-origin', 'center', 'important');
      }
    });
  }

  // 자막 상하 크기 슬라이더
  const subtitleHeightSizeSlider = container.querySelector('#subtitle-height-size');
  if (subtitleHeightSizeSlider) {
    subtitleHeightSizeSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      // size-bar 업데이트 (60-120 범위를 0-100%로 변환)
      const barPercentage = ((this.value - 60) / (120 - 60)) * 100;
      const sizeBar = this.nextElementSibling.nextElementSibling.querySelector('.size-bar-fill');
      if (sizeBar) {
        sizeBar.style.width = barPercentage + '%';
      }
      updateSubtitleSize();
    });
  }

  // 자막 좌우 크기 슬라이더
  const subtitleWidthSizeSlider = container.querySelector('#subtitle-width-size');
  if (subtitleWidthSizeSlider) {
    subtitleWidthSizeSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      // size-bar 업데이트 (60-120 범위를 0-100%로 변환)
      const barPercentage = ((this.value - 60) / (120 - 60)) * 100;
      const sizeBar = this.nextElementSibling.nextElementSibling.querySelector('.size-bar-fill');
      if (sizeBar) {
        sizeBar.style.width = barPercentage + '%';
      }
      updateSubtitleSize();
    });
  }

  function updateSubtitleSize() {
    const subtitleBox = document.getElementById('preview-subtitle');
    if (subtitleBox) {
      const heightValue = subtitleHeightSizeSlider?.value || 100;
      const widthValue = subtitleWidthSizeSlider?.value || 100;

      const scaleX = widthValue / 100;
      const scaleY = heightValue / 100;

      subtitleBox.style.setProperty('transform', `scaleX(${scaleX}) scaleY(${scaleY})`, 'important');
      subtitleBox.style.setProperty('transform-origin', 'center', 'important');
    }
  }

  // 영상 영역 위치 조절
  const videoAreaXSlider = container.querySelector('#video-area-x');
  if (videoAreaXSlider) {
    videoAreaXSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      const videoArea = document.getElementById('video-placeholder');
      if (videoArea) {
        videoArea.style.setProperty('left', value, 'important');
        videoArea.style.setProperty('transform', `translate(-50%, -50%)`, 'important');
      }
    });
  }

  const videoAreaYSlider = container.querySelector('#video-area-y');
  if (videoAreaYSlider) {
    videoAreaYSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      const videoArea = document.getElementById('video-placeholder');
      if (videoArea) {
        videoArea.style.setProperty('top', value, 'important');
        videoArea.style.setProperty('transform', `translate(-50%, -50%)`, 'important');
      }
    });
  }

  // 제목 영역 위치 조절
  const titleAreaXSlider = container.querySelector('#title-area-x');
  if (titleAreaXSlider) {
    titleAreaXSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      const titleBox = document.getElementById('preview-title');
      if (titleBox) {
        titleBox.style.setProperty('left', value, 'important');
        titleBox.style.setProperty('position', 'absolute', 'important');
        titleBox.style.setProperty('transform', 'translateX(-50%)', 'important');
      }
    });
  }

  const titleAreaYSlider = container.querySelector('#title-area-y');
  if (titleAreaYSlider) {
    titleAreaYSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      const titleBox = document.getElementById('preview-title');
      if (titleBox) {
        titleBox.style.setProperty('top', value, 'important');
        titleBox.style.setProperty('position', 'absolute', 'important');
        titleBox.style.setProperty('transform', 'translateX(-50%)', 'important');
      }
    });
  }

  // 자막 영역 위치 조절
  const subtitleAreaXSlider = container.querySelector('#subtitle-area-x');
  if (subtitleAreaXSlider) {
    subtitleAreaXSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      const subtitleBox = document.getElementById('preview-subtitle');
      if (subtitleBox) {
        subtitleBox.style.setProperty('left', value, 'important');
        subtitleBox.style.setProperty('position', 'absolute', 'important');
        subtitleBox.style.setProperty('transform', 'translateX(-50%)', 'important');
      }
    });
  }

  const subtitleAreaYSlider = container.querySelector('#subtitle-area-y');
  if (subtitleAreaYSlider) {
    subtitleAreaYSlider.addEventListener('input', function() {
      const value = this.value + '%';
      this.nextElementSibling.textContent = value;
      const subtitleBox = document.getElementById('preview-subtitle');
      if (subtitleBox) {
        subtitleBox.style.setProperty('top', value, 'important');
        subtitleBox.style.setProperty('position', 'absolute', 'important');
        subtitleBox.style.setProperty('transform', 'translateX(-50%)', 'important');
      }
    });
  }

  // 자동조정 버튼 이벤트
  const autoAdjustButtons = container.querySelectorAll('.auto-adjust-btn');
  autoAdjustButtons.forEach(button => {
    button.addEventListener('click', function() {
      const area = this.dataset.area;
      autoAdjustArea(area);
    });
  });

  // 설정 저장/불러오기 버튼 이벤트
  const saveSettingsBtn = container.querySelector('.save-settings');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveCurrentSettings);
  }

  const loadSettingsBtn = container.querySelector('.load-settings');
  if (loadSettingsBtn) {
    loadSettingsBtn.addEventListener('click', loadSelectedSettings);
  }

  const deleteSettingsBtn = container.querySelector('.delete-settings');
  if (deleteSettingsBtn) {
    deleteSettingsBtn.addEventListener('click', deleteSelectedSettings);
  }

  // 저장된 설정 목록 로드
  loadSettingsList();

  // 제목 크기 슬라이더
  const titleSizeSlider = container.querySelector('#title-size');
  if (titleSizeSlider) {
    titleSizeSlider.addEventListener('input', function() {
      const value = this.value + 'px';
      this.nextElementSibling.textContent = value;
      // size-bar 업데이트 (24-60 범위를 0-100%로 변환)
      const barPercentage = ((this.value - 24) / (60 - 24)) * 100;
      const sizeBar = this.nextElementSibling.nextElementSibling.querySelector('.size-bar-fill');
      if (sizeBar) {
        sizeBar.style.width = barPercentage + '%';
      }
      const titleBox = document.getElementById('preview-title');
      if (titleBox) {
        titleBox.style.setProperty('font-size', value, 'important');
      }
    });
  }

  // 자막 크기 슬라이더
  const subtitleSizeSlider = container.querySelector('#subtitle-size');
  if (subtitleSizeSlider) {
    subtitleSizeSlider.addEventListener('input', function() {
      const value = this.value + 'px';
      this.nextElementSibling.textContent = value;
      // size-bar 업데이트 (16-40 범위를 0-100%로 변환)
      const barPercentage = ((this.value - 16) / (40 - 16)) * 100;
      const sizeBar = this.nextElementSibling.nextElementSibling.querySelector('.size-bar-fill');
      if (sizeBar) {
        sizeBar.style.width = barPercentage + '%';
      }
      const subtitleBox = document.getElementById('preview-subtitle');
      if (subtitleBox) {
        subtitleBox.style.setProperty('font-size', value, 'important');
      }
    });
  }

  // 미디어 추가 버튼 이벤트
  const mediaAddButtons = container.querySelectorAll('.media-add-btn');
  mediaAddButtons.forEach(button => {
    button.addEventListener('click', function() {
      const mediaType = this.dataset.media;
      handleMediaAdd(mediaType);
    });
  });
}

function handleMediaAdd(mediaType) {
  // 모든 미디어 폼 패널을 숨김
  const allPanels = document.querySelectorAll('.media-form-panel');
  allPanels.forEach(panel => {
    panel.style.display = 'none';
  });

  // 선택된 패널만 보이기
  let targetPanel = null;
  if (mediaType === 'image') {
    targetPanel = document.querySelector('.image-panel');
  } else if (mediaType === 'music') {
    targetPanel = document.querySelector('.music-panel');
  } else if (mediaType === 'video') {
    targetPanel = document.querySelector('.video-panel');
  }

  if (targetPanel) {
    // 패널이 이미 보이는 상태면 숨기고, 숨겨진 상태면 보이기
    if (targetPanel.style.display === 'block') {
      targetPanel.style.display = 'none';
    } else {
      targetPanel.style.display = 'block';
      // 부드러운 스크롤과 강조 효과
      setTimeout(() => {
        targetPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetPanel.style.animation = 'pulse 1s';
        setTimeout(() => {
          targetPanel.style.animation = '';
        }, 1000);
      }, 100);
    }
  }

  // 영상 버튼의 경우 영상 효과 패널도 강조
  if (mediaType === 'video') {
    const videoEffectsPanel = document.querySelector('.video-effects-section .effect-panel');
    if (videoEffectsPanel) {
      setTimeout(() => {
        videoEffectsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        videoEffectsPanel.style.animation = 'pulse 1s';
        setTimeout(() => {
          videoEffectsPanel.style.animation = '';
        }, 1000);
      }, 1500);
    }
  }
}

function autoAdjustArea(area) {
  if (area === 'video') {
    // 영상 영역 자동조정: 중앙에 80% 크기로 배치
    const sizeSlider = document.getElementById('video-area-size');
    const xSlider = document.getElementById('video-area-x');
    const ySlider = document.getElementById('video-area-y');

    if (sizeSlider) {
      sizeSlider.value = 80;
      sizeSlider.dispatchEvent(new Event('input'));
    }
    if (xSlider) {
      xSlider.value = 50;
      xSlider.dispatchEvent(new Event('input'));
    }
    if (ySlider) {
      ySlider.value = 50;
      ySlider.dispatchEvent(new Event('input'));
    }
  } else if (area === 'title') {
    // 제목 영역 자동조정: 상단 중앙에 100% 크기로 배치
    const sizeSlider = document.getElementById('title-area-size');
    const xSlider = document.getElementById('title-area-x');
    const ySlider = document.getElementById('title-area-y');

    if (sizeSlider) {
      sizeSlider.value = 100;
      sizeSlider.dispatchEvent(new Event('input'));
    }
    if (xSlider) {
      xSlider.value = 50;
      xSlider.dispatchEvent(new Event('input'));
    }
    if (ySlider) {
      ySlider.value = 20;
      ySlider.dispatchEvent(new Event('input'));
    }
  } else if (area === 'subtitle') {
    // 자막 영역 자동조정: 하단 중앙에 100% 크기로 배치
    const heightSlider = document.getElementById('subtitle-height-size');
    const widthSlider = document.getElementById('subtitle-width-size');
    const xSlider = document.getElementById('subtitle-area-x');
    const ySlider = document.getElementById('subtitle-area-y');

    if (heightSlider) {
      heightSlider.value = 100;
      heightSlider.dispatchEvent(new Event('input'));
    }
    if (widthSlider) {
      widthSlider.value = 100;
      widthSlider.dispatchEvent(new Event('input'));
    }
    if (xSlider) {
      xSlider.value = 50;
      xSlider.dispatchEvent(new Event('input'));
    }
    if (ySlider) {
      ySlider.value = 95;
      ySlider.dispatchEvent(new Event('input'));
    }
  }
}

function saveCurrentSettings() {
  const filenameInput = document.getElementById('settings-filename');
  const filename = filenameInput?.value?.trim();

  if (!filename) {
    alert('설정 파일명을 입력해주세요.');
    return;
  }

  // 특수문자 제거
  const cleanFilename = filename.replace(/[^\w\s-가-힣]/g, '').trim();
  if (!cleanFilename) {
    alert('올바른 파일명을 입력해주세요.');
    return;
  }

  const settings = {
    name: cleanFilename,
    timestamp: new Date().toISOString(),
    data: {
      titleSize: document.getElementById('title-size')?.value || 36,
      titleVerticalPosition: document.getElementById('title-vertical')?.value || 50,
      subtitleSize: document.getElementById('subtitle-size')?.value || 24,
      subtitleVerticalPosition: document.getElementById('subtitle-vertical')?.value || 80,
      staticEffect: document.getElementById('static-effect')?.value || 'none',
      dynamicEffect: document.getElementById('dynamic-effect')?.value || 'none',
      videoAreaSize: document.getElementById('video-area-size')?.value || 80,
      videoAreaX: document.getElementById('video-area-x')?.value || 50,
      videoAreaY: document.getElementById('video-area-y')?.value || 50,
      titleAreaSize: document.getElementById('title-area-size')?.value || 100,
      titleAreaX: document.getElementById('title-area-x')?.value || 50,
      titleAreaY: document.getElementById('title-area-y')?.value || 20,
      subtitleHeightSize: document.getElementById('subtitle-height-size')?.value || 100,
      subtitleWidthSize: document.getElementById('subtitle-width-size')?.value || 100,
      subtitleAreaX: document.getElementById('subtitle-area-x')?.value || 50,
      subtitleAreaY: document.getElementById('subtitle-area-y')?.value || 95
    }
  };

  // 기존 설정 목록 가져오기
  const savedSettingsList = JSON.parse(localStorage.getItem('template-settings-list') || '{}');

  // 새 설정 추가
  savedSettingsList[cleanFilename] = settings;

  // 저장
  localStorage.setItem('template-settings-list', JSON.stringify(savedSettingsList));

  // 파일명 입력창 비우기
  if (filenameInput) {
    filenameInput.value = '';
  }

  // 목록 새로고침
  loadSettingsList();

  alert(`설정이 "${cleanFilename}"로 저장되었습니다.`);
}

function loadSettingsList() {
  const settingsSelect = document.getElementById('saved-settings-list');
  if (!settingsSelect) return;

  const savedSettingsList = JSON.parse(localStorage.getItem('template-settings-list') || '{}');

  // 기존 옵션들 제거 (첫 번째 기본 옵션 제외)
  settingsSelect.innerHTML = '<option value="">저장된 설정을 선택하세요</option>';

  // 설정 목록을 시간순으로 정렬해서 추가
  const sortedSettings = Object.entries(savedSettingsList)
    .sort(([,a], [,b]) => new Date(b.timestamp) - new Date(a.timestamp));

  sortedSettings.forEach(([filename, settings]) => {
    const option = document.createElement('option');
    option.value = filename;
    const date = new Date(settings.timestamp).toLocaleDateString('ko-KR');
    const time = new Date(settings.timestamp).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    option.textContent = `${settings.name} (${date} ${time})`;
    settingsSelect.appendChild(option);
  });
}

function loadSelectedSettings() {
  const settingsSelect = document.getElementById('saved-settings-list');
  const selectedFilename = settingsSelect?.value;

  if (!selectedFilename) {
    alert('불러올 설정을 선택해주세요.');
    return;
  }

  const savedSettingsList = JSON.parse(localStorage.getItem('template-settings-list') || '{}');
  const selectedSettings = savedSettingsList[selectedFilename];

  if (!selectedSettings) {
    alert('선택된 설정을 찾을 수 없습니다.');
    return;
  }

  // 모든 설정값 적용
  Object.entries(selectedSettings.data).forEach(([key, value]) => {
    const elementId = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    const element = document.getElementById(elementId);
    if (element) {
      element.value = value;
      element.dispatchEvent(new Event('input'));
    }
  });

  alert(`"${selectedSettings.name}" 설정이 불러와졌습니다.`);
}

function deleteSelectedSettings() {
  const settingsSelect = document.getElementById('saved-settings-list');
  const selectedFilename = settingsSelect?.value;

  if (!selectedFilename) {
    alert('삭제할 설정을 선택해주세요.');
    return;
  }

  const savedSettingsList = JSON.parse(localStorage.getItem('template-settings-list') || '{}');
  const selectedSettings = savedSettingsList[selectedFilename];

  if (!selectedSettings) {
    alert('선택된 설정을 찾을 수 없습니다.');
    return;
  }

  if (confirm(`"${selectedSettings.name}" 설정을 삭제하시겠습니까?`)) {
    delete savedSettingsList[selectedFilename];
    localStorage.setItem('template-settings-list', JSON.stringify(savedSettingsList));

    // 목록 새로고침
    loadSettingsList();

    alert(`"${selectedSettings.name}" 설정이 삭제되었습니다.`);
  }
}

function getTotalDuration(project) {
  const candidates = [project.duration || 0];
  const collect = (start, end) => {
    if (start !== undefined && end !== undefined) candidates.push(end);
  };
  project.subtitles.forEach((segment) => collect(segment.start, segment.end));
  project.image_prompts.forEach((prompt) => collect(prompt.start, prompt.end));
  project.video_prompts.forEach((prompt) => collect(prompt.start, prompt.end));
  (project.background_music || []).forEach((track) => collect(track.start, track.end));
  const max = Math.max(...candidates, 60);
  return max || 60;
}

function buildOverlapBars(project, totalDuration) {
  const safeDuration = totalDuration && totalDuration > 0 ? totalDuration : 60;

  const normaliseRange = (startValue, endValue) => {
    const start = toOptionalNumber(startValue);
    const end = toOptionalNumber(endValue);
    const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
    const tentativeEnd = Number.isFinite(end) ? Math.max(safeStart, end) : safeStart;
    const safeEnd = tentativeEnd > safeStart ? tentativeEnd : safeStart + Math.max(safeDuration * 0.02, 0.1);
    return {
      start: Math.min(safeDuration, safeStart),
      end: Math.min(safeDuration, safeEnd)
    };
  };

  const summarise = (value, maxLength = 60) => {
    if (!value) return "";
    const text = String(value).trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
  };

  const formatRange = (start, end) => `${start.toFixed(1)}s → ${end.toFixed(1)}s`;

  const mergeRanges = (ranges) => {
    const sorted = ranges
      .map(({ start, end }) => {
        const normalised = normaliseRange(start, end);
        return { ...normalised };
      })
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start);

    if (!sorted.length) {
      return [{ start: 0, end: safeDuration }];
    }

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = merged[merged.length - 1];
      const current = sorted[i];
      if (current.start <= prev.end) {
        prev.end = Math.max(prev.end, current.end);
      } else {
        merged.push({ ...current });
      }
    }

    return merged;
  };

  const chunkSummary = (items, formatter) => {
    if (!items.length) return "";
    return items
      .map((item) => formatter(item))
      .filter(Boolean)
      .join("<br />");
  };

  const collectItemsForRange = (items, range, mapper) => {
    if (!items || !items.length) return [];
    return items
      .filter((item) => {
        const start = toOptionalNumber(item.start);
        const end = toOptionalNumber(item.end);
        const hasOverlap =
          Number.isFinite(start) && Number.isFinite(end)
            ? !(end <= range.start || start >= range.end)
            : Number.isFinite(start)
            ? start >= range.start && start < range.end
            : Number.isFinite(end)
            ? end > range.start && end <= range.end
            : true;
        return hasOverlap;
      })
      .map(mapper);
  };

  const subtitleSegments = Array.isArray(project.subtitles) ? project.subtitles : [];
  const imagePrompts = Array.isArray(project.image_prompts) ? project.image_prompts : [];
  const videoPrompts = Array.isArray(project.video_prompts) ? project.video_prompts : [];
  const musicTracks = Array.isArray(project.background_music) ? project.background_music : [];

  const narrationColumn = {
    key: "narration",
    label: "음성·자막",
    items: subtitleSegments.map((segment, index) => {
      const idx = typeof segment.index === "number" ? segment.index : index + 1;
      return {
        type: "narration",
        title: `음성 ${idx}`,
        subtitle: summarise(segment.text, 80),
        meta: segment.scene_tag ? `씬 ${segment.scene_tag}` : "",
        start: segment.start,
        end: segment.end
      };
    })
  };

  const imageColumn = {
    key: "image",
    label: "이미지",
    items: imagePrompts.map((prompt, index) => {
      const tag = prompt.tag || `이미지 ${index + 1}`;
      return {
        type: "image",
        title: tag,
        subtitle: summarise(prompt.description, 80),
        meta: prompt.status ? `상태: ${prompt.status}` : "",
        start: prompt.start,
        end: prompt.end
      };
    })
  };

  const sceneColumn = {
    key: "video",
    label: "영상",
    items: videoPrompts.map((prompt, index) => {
      const tag = prompt.scene_tag || `씬 ${index + 1}`;
      const camera = prompt.camera ? `카메라: ${prompt.camera}` : "";
      const mood = prompt.mood ? `분위기: ${prompt.mood}` : "";
      const metaPieces = [camera, mood].filter(Boolean);
      return {
        type: "video",
        title: tag,
        subtitle: summarise(prompt.action, 80),
        meta: metaPieces.join(" · "),
        start: prompt.start,
        end: prompt.end
      };
    })
  };

  const musicColumn = {
    key: "music",
    label: "배경 음악",
    items: musicTracks.map((track, index) => {
      const title = track.title || track.track_id || `BGM ${index + 1}`;
      const volume = typeof track.volume === "number" && !Number.isNaN(track.volume) ? `볼륨 ${Math.round(track.volume * 100)}%` : "";
      const source = track.source ? `출처 ${track.source}` : "";
      const metaPieces = [volume, source].filter(Boolean);
      return {
        type: "music",
        title,
        subtitle: summarise(track.track_id && track.track_id !== title ? track.track_id : ""),
        meta: metaPieces.join(" · "),
        start: track.start,
        end: track.end
      };
    })
  };

  const baseRanges = subtitleSegments.length
    ? subtitleSegments
    : [...imagePrompts, ...videoPrompts, ...musicTracks];

  const segmentRanges = mergeRanges(
    baseRanges.map((item) => ({
      start: item.start,
      end: item.end
    }))
  );

  if (!segmentRanges.length) {
    return '<div class="overlap-empty-message">타임라인 데이터를 생성하면 정렬 미리보기를 확인할 수 있습니다.</div>';
  }

  const columns = [narrationColumn, musicColumn, imageColumn, sceneColumn];

  const buildCell = (column, range) => {
    let content = "";
    if (column.key === "narration") {
      const items = collectItemsForRange(subtitleSegments, range, (segment, idx) => {
        const index = typeof segment.index === "number" ? segment.index : idx + 1;
        return {
          index,
          text: segment.text || ""
        };
      });
      if (items.length) {
        const lines = [];
        items.forEach(({ index, text }) => {
          const subtitleLine = text ? `자막 ${index}: ${summarise(text, 80)}` : `자막 ${index}`;
          lines.push(subtitleLine);
          lines.push(`음성 ${index}`);
        });
        content = lines.join("<br />");
      } else {
        content = "";
      }
    } else if (column.key === "music") {
      const items = collectItemsForRange(musicTracks, range, (track) => track.title || track.track_id || "BGM");
      content = chunkSummary(items, (value) => value) || "";
    } else if (column.key === "image") {
      const items = collectItemsForRange(imagePrompts, range, (prompt, index) => prompt.tag || `이미지 ${index + 1}`);
      content = chunkSummary(items, (value) => value) || "";
    } else if (column.key === "video") {
      const items = collectItemsForRange(videoPrompts, range, (prompt, index) => prompt.scene_tag || `영상씬 ${index + 1}`);
      content = chunkSummary(items, (value) => value) || "";
    }
    return `<td class="overlap-table-cell" data-type="${column.key}">${content || "-"}</td>`;
  };

  const headerRow = segmentRanges
    .map((range, index) => {
      const label = `${index + 1}. ${formatRange(range.start, range.end)}`;
      return `<th scope="col">${label}</th>`;
    })
    .join("");

  const bodyRows = columns.map((column) => {
    const cells = segmentRanges.map((range) => buildCell(column, range)).join("");
    return `<tr><th scope="row">${column.label}</th>${cells}</tr>`;
  });

  return `
    <div class="overlap-table-wrapper">
      <table class="overlap-table">
        <thead>
          <tr>
            <th aria-hidden="true"></th>
            ${headerRow}
          </tr>
        </thead>
        <tbody>
          ${bodyRows.join("")}
        </tbody>
      </table>
    </div>
  `;
}

function highlightPrompt(tag, type) {
  const container = document.getElementById("prompt-preview");
  if (!container || !state.project) return;
  let prompt;
  if (type === "image") {
    prompt = state.project.image_prompts.find((item) => item.tag === tag);
  } else if (type === "video") {
    prompt = state.project.video_prompts.find((item) => item.scene_tag === tag);
  } else if (type === "music") {
    prompt = (state.project.background_music || []).find((item) => item.track_id === tag);
  } else {
    return;
  }
  if (!prompt) return;
  if (type === "music") {
    const volume = typeof prompt.volume === "number" && !Number.isNaN(prompt.volume) ? prompt.volume : 0.8;
    const title = escapeHtml(prompt.title);
    const trackId = escapeHtml(prompt.track_id);
    const source = escapeHtml(prompt.source);
    container.querySelector(".preview-body").innerHTML = `
      <h4>🎵 ${title}</h4>
      <p>ID: ${trackId}</p>
      ${prompt.source ? `<p>출처: ${source}</p>` : ""}
      <dl>
        <dt>시간</dt>
        <dd>${(prompt.start ?? 0).toFixed(1)}s → ${(prompt.end ?? 0).toFixed(1)}s</dd>
        <dt>볼륨</dt>
        <dd>${Math.round(volume * 100)}%</dd>
      </dl>
    `;
    return;
  }
  container.querySelector(".preview-body").innerHTML = `
    <h4>${type === "image" ? prompt.tag : prompt.scene_tag}</h4>
    <p>${type === "image" ? prompt.description : prompt.action}</p>
    <dl>
      <dt>시간</dt>
      <dd>${(prompt.start ?? 0).toFixed(1)}s → ${(prompt.end ?? 0).toFixed(1)}s</dd>
      ${type === "video" ? `<dt>카메라</dt><dd>${prompt.camera}</dd><dt>분위기</dt><dd>${prompt.mood}</dd>` : ""}
    </dl>
  `;
}

function highlightHistorySelection(projectId) {
  const historyContainer = document.querySelector(".history-container");
  if (!historyContainer) return;
  historyContainer.querySelectorAll(".history-card[data-project-id]").forEach((card) => {
    if (card.dataset.projectId === projectId) {
      card.classList.add("active");
    } else {
      card.classList.remove("active");
    }
  });
}


function bindHistoryCards(container) {
  const cards = Array.from(container.querySelectorAll(".history-card[data-project-id]"));

  cards.forEach((card) => {
    // 카드 클릭으로 프로젝트 로드
    const openBtn = card.querySelector(".open-project-btn");
    if (openBtn) {
      openBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const projectId = card.dataset.projectId;
          const project = await api(`/api/projects/${projectId}`);
          renderProject(project);
          highlightHistorySelection(projectId);

          const projectSection = document.getElementById("project-state");
          if (projectSection) {
            projectSection.scrollIntoView({ behavior: "smooth", block: "start" });
          }

          const url = new URL(window.location.href);
          url.searchParams.set("project", projectId);
          url.hash = `project-${projectId}`;
          window.history.replaceState({}, "", url);
        } catch (error) {
          console.error("Failed to load project:", error);
          alert("프로젝트를 불러오는데 실패했습니다: " + error.message);
        }
      });
    }

    // 다시 열기 버튼
    const reloadBtn = card.querySelector(".reload-btn");
    if (reloadBtn) {
      reloadBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const projectId = card.dataset.projectId;
          const project = await api(`/api/projects/${projectId}`);
          renderProject(project);
          highlightHistorySelection(projectId);

          const projectSection = document.getElementById("project-state");
          if (projectSection) {
            projectSection.scrollIntoView({ behavior: "smooth", block: "start" });
          }

          const url = new URL(window.location.href);
          url.searchParams.set("project", projectId);
          url.hash = `project-${projectId}`;
          window.history.replaceState({}, "", url);
        } catch (error) {
          console.error("Failed to load project:", error);
          alert("프로젝트를 불러오는데 실패했습니다: " + error.message);
        }
      });
    }

    // 삭제 버튼
    const deleteBtn = card.querySelector(".delete-btn[data-delete-history]");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const projectId = card.dataset.projectId;
        const version = card.dataset.version;
        const confirmDelete = confirm("선택한 프로젝트 기록을 삭제할까요?");
        if (!confirmDelete) return;
        try {
          await api(`/api/history/${projectId}/${version}`, { method: "DELETE" });
          card.remove();
          // 카드가 모두 사라지면 empty state 표시
          const remainingCards = container.querySelectorAll(".history-card[data-project-id]");
          if (remainingCards.length === 0) {
            const historyGrid = container.querySelector(".history-grid");
            if (historyGrid) {
              historyGrid.innerHTML = `
                <div class="empty-state">
                  <div class="empty-icon">📝</div>
                  <h3>아직 작업 내역이 없습니다</h3>
                  <p>새 프로젝트를 생성하면 여기에 표시됩니다.</p>
                  <a href="${window.location.origin}/tools" class="contrast">첫 프로젝트 만들기 →</a>
                </div>
              `;
            }
          }
        } catch (error) {
          alert(error.message);
        }
      });
    }
  });
}

async function loadProject(projectId, { scrollIntoView = true } = {}) {
  try {
    const project = await api(`/api/projects/${projectId}`);
    renderProject(project);
    highlightHistorySelection(projectId);

    const projectSection = document.getElementById("project-state");
    if (scrollIntoView && projectSection) {
      projectSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    url.hash = `project-${projectId}`;
    window.history.replaceState({}, "", url);
  } catch (error) {
    alert(error.message);
  }
}

function initLongScriptTool() {
  const form = document.getElementById("long-script-form");
  const editor = document.getElementById("long-script-editor");
  const topicInput = form ? form.querySelector("input[name='script_topic']") : null;
  const languageSelect = form ? form.querySelector("select[name='script_language']") : null;
  const modeSelect = form ? form.querySelector("select[name='mode']") : null;
  const generateButton = form ? form.querySelector("[data-generate-long-script]") : null;
  const gptButton = form ? form.querySelector("[data-gpt-script-button]") : null;
  const copyButton = form ? form.querySelector("[data-copy-long-script]") : null;
  const chatgptSection = document.querySelector("[data-chatgpt-import-section]");
  const chatgptTextarea = chatgptSection ? chatgptSection.querySelector("#long-script-chatgpt-input") : null;
  const chatgptProcessButton = chatgptSection ? chatgptSection.querySelector("[data-process-chatgpt-long-script]") : null;
  const chatgptClearButton = chatgptSection ? chatgptSection.querySelector("[data-clear-chatgpt-long-script]") : null;

  renderLongScriptResults(state.latestResults[TOOL_KEYS.LONG_SCRIPT]);

  if (!form || !editor) {
    return;
  }

  const copyButtonInitialLabel = copyButton ? (copyButton.textContent || "대본 복사") : "대본 복사";
  const getMode = () => (modeSelect ? modeSelect.value : "api");

  const setButtonBusy = (button, busy) => {
    if (!button) return;
    button.disabled = busy;
    if (busy) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
  };

  const showChatgptArea = (visible, { focus = true } = {}) => {
    if (!chatgptSection) return;
    chatgptSection.style.display = visible ? "block" : "none";
    if (visible && chatgptTextarea && focus) {
      chatgptTextarea.focus();
    }
  };

  const updateModeUI = () => {
    const isChatgpt = getMode() === "chatgpt";
    showChatgptArea(isChatgpt, { focus: false });
    if (gptButton) {
      gptButton.style.display = isChatgpt ? "" : "none";
    }
    if (generateButton) {
      generateButton.textContent = isChatgpt ? "ChatGPT 열기" : "대본 생성";
    }
  };

  const updateStateFromForm = ({ notify = false } = {}) => {
    const rawContent = editor.value || "";
    const trimmedContent = rawContent.trim();
    const topicValue = topicInput ? topicInput.value.trim() : "";
    const languageValue = languageSelect ? languageSelect.value : "ko";

    state.lastRequests[TOOL_KEYS.LONG_SCRIPT] = {
      topic: topicValue,
      keyword: topicValue,
      language: languageValue
    };

    if (!trimmedContent) {
      state.latestResults[TOOL_KEYS.LONG_SCRIPT] = null;
      state.activeRecords[TOOL_KEYS.LONG_SCRIPT] = null;
      allowLongScriptFormSync = false;
      renderLongScriptResults(null);
      allowLongScriptFormSync = true;
      if (notify) {
        showNotification("대본 내용을 입력하세요.", "error");
      }
      return false;
    }

    const payload = {
      topic: topicValue,
      keyword: topicValue,
      language: languageValue,
      content: rawContent,
      updated_at: new Date().toISOString()
    };

    state.latestResults[TOOL_KEYS.LONG_SCRIPT] = payload;
    state.activeRecords[TOOL_KEYS.LONG_SCRIPT] = null;

    allowLongScriptFormSync = false;
    renderLongScriptResults(payload);
    allowLongScriptFormSync = true;

    if (notify) {
      showNotification("대본이 업데이트되었습니다.", "success");
    }
    return true;
  };

  const handleChatgptLaunch = () => {
    const topicValue = topicInput ? topicInput.value.trim() : "";
    const query = topicValue ? `유튜브 대본생성 ${topicValue}` : "유튜브 대본생성";
    const gptUrl = `https://chatgpt.com/?q=${encodeURIComponent(query)}`;
    window.open(gptUrl, "_blank", "width=1200,height=800");
    showChatgptArea(true);
    showNotification("ChatGPT 창에서 대본을 생성한 뒤 결과를 붙여넣어 주세요.", "info");
  };

  const handleApiGeneration = async () => {
    const topicValue = topicInput ? topicInput.value.trim() : "";
    if (!topicValue) {
      alert("콘텐츠 주제를 입력하세요.");
      if (topicInput) topicInput.focus();
      return;
    }
    const languageValue = languageSelect ? languageSelect.value : "ko";
    const endpoint = GENERATION_ENDPOINTS[TOOL_KEYS.LONG_SCRIPT];
    if (!endpoint) {
      showNotification("이 기능은 현재 사용할 수 없습니다.", "error");
      return;
    }
    setButtonBusy(generateButton, true);
    try {
      const requestBody = {
        topic: topicValue,
        keyword: topicValue,
        language: languageValue
      };
      const data = await api(endpoint.url, {
        method: "POST",
        body: JSON.stringify(requestBody)
      });
      const enriched = {
        topic: data?.topic || topicValue,
        keyword: data?.keyword || topicValue,
        language: data?.language || languageValue,
        content: typeof data?.content === "string" ? data.content : "",
        subtitles: Array.isArray(data?.subtitles) ? data.subtitles : [],
        images: Array.isArray(data?.images) ? data.images : [],
        updated_at: new Date().toISOString(),
        generated_at: new Date().toISOString()
      };
      state.latestResults[TOOL_KEYS.LONG_SCRIPT] = enriched;
      state.activeRecords[TOOL_KEYS.LONG_SCRIPT] = null;
      state.lastRequests[TOOL_KEYS.LONG_SCRIPT] = {
        topic: enriched.topic,
        keyword: enriched.keyword,
        language: enriched.language
      };
      allowLongScriptFormSync = false;
      renderLongScriptResults(enriched);
      allowLongScriptFormSync = true;
      renderSavedRecords(TOOL_KEYS.LONG_SCRIPT);
      showNotification("대본을 생성했습니다.", "success");
      if (chatgptTextarea && getMode() !== "chatgpt") {
        chatgptTextarea.value = "";
        showChatgptArea(false, { focus: false });
      }
    } catch (error) {
      console.error("Failed to generate long script:", error);
      showNotification(error.message || "대본 생성에 실패했습니다.", "error");
    } finally {
      setButtonBusy(generateButton, false);
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateStateFromForm({ notify: true });
  });

  editor.addEventListener("input", () => {
    updateStateFromForm();
  });

  if (topicInput) {
    topicInput.addEventListener("input", () => {
      updateStateFromForm();
    });
  }

  if (languageSelect) {
    languageSelect.addEventListener("change", () => {
      updateStateFromForm();
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      updateModeUI();
    });
  }

  if (generateButton) {
    generateButton.addEventListener("click", async () => {
      if (getMode() === "chatgpt") {
        handleChatgptLaunch();
      } else {
        await handleApiGeneration();
      }
    });
  }

  if (gptButton) {
    gptButton.addEventListener("click", () => {
      handleChatgptLaunch();
    });
  }

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const content = editor.value || "";
      if (!content.trim()) {
        alert("복사할 대본이 없습니다.");
        return;
      }
      try {
        await navigator.clipboard.writeText(content);
        copyButton.textContent = "복사 완료!";
        setTimeout(() => {
          copyButton.textContent = copyButtonInitialLabel;
        }, 2000);
      } catch (error) {
        console.error("Failed to copy long script:", error);
        alert("클립보드에 복사하지 못했습니다. 직접 복사해 주세요.");
      }
    });
  }

  // 이미지/영상 프롬프트 생성 버튼
  const mediaPromptsButton = form ? form.querySelector("[data-generate-media-prompts]") : null;
  if (mediaPromptsButton) {
    mediaPromptsButton.addEventListener("click", async () => {
      const content = editor.value || "";
      if (!content.trim()) {
        alert("대본 내용을 먼저 작성하거나 생성해주세요.");
        return;
      }

      const topicValue = topicInput ? topicInput.value.trim() : "콘텐츠";

      setButtonBusy(mediaPromptsButton, true);
      try {
        const requestBody = {
          script_content: content,
          topic: topicValue
        };

        const data = await api("/api/generate/media-prompts-from-script", {
          method: "POST",
          body: JSON.stringify(requestBody)
        });

        renderMediaPrompts(data);
        showNotification(`${data.total_scenes}개 장면의 프롬프트를 생성했습니다.`, "success");
      } catch (error) {
        console.error("Failed to generate media prompts:", error);
        showNotification(error.message || "프롬프트 생성에 실패했습니다.", "error");
      } finally {
        setButtonBusy(mediaPromptsButton, false);
      }
    });
  }

  if (state.latestResults[TOOL_KEYS.LONG_SCRIPT]) {
    const existing = state.latestResults[TOOL_KEYS.LONG_SCRIPT];
    const topicValue = typeof existing?.topic === "string" ? existing.topic : "";
    const languageValue = typeof existing?.language === "string" ? existing.language : (languageSelect ? languageSelect.value : "ko");
    state.lastRequests[TOOL_KEYS.LONG_SCRIPT] = { topic: topicValue, keyword: topicValue, language: languageValue };
  } else {
    updateStateFromForm();
  }

  if (chatgptProcessButton && chatgptTextarea) {
    chatgptProcessButton.addEventListener("click", () => {
      const chatgptResult = chatgptTextarea.value.trim();
      if (!chatgptResult) {
        alert("ChatGPT 결과를 입력하세요.");
        chatgptTextarea.focus();
        return;
      }
      editor.value = chatgptResult;
      updateStateFromForm({ notify: true });
      showNotification("ChatGPT 결과를 편집 공간에 반영했습니다.", "success");
    });
  }

  if (chatgptClearButton && chatgptTextarea) {
    chatgptClearButton.addEventListener("click", () => {
      chatgptTextarea.value = "";
      chatgptTextarea.focus();
    });
  }

  updateModeUI();
}

document.addEventListener("DOMContentLoaded", () => {
  initStoryKeywordPage();
  initImageStoryPage();
  initShortsScriptPage();
  initShortsScenesPage();
  initLongScriptTool();

  // 자동 저장 시스템 초기화
  setupAutoSave();

  // 타임라인 버튼들을 나중에 바인딩 (DOM이 완전히 준비된 후)
  setTimeout(() => {
    setupTimelineButtons();
  }, 2000);

  // 페이지 로드 시 이전 편집 내용 복원 시도
  setTimeout(() => {
    loadTimelineFromLocalStorage();
  }, 1000); // DOM이 완전히 로드된 후 1초 뒤에 복원

  document.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-save");
      if (!tool) return;
      saveLatestResult(tool);
    });
  });

  document.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-refresh");
      if (!tool) return;
      loadSavedRecords(tool);
    });
  });

  document.querySelectorAll("[data-continue]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-continue");
      if (!tool) return;
      const mode = button.getAttribute("data-continue-mode");
      continueGeneration(tool, mode || null);
    });
  });

  document.querySelectorAll("[data-tts]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-tts");
      if (!tool) return;
      convertToSpeech(tool);
    });
  });

  document.querySelectorAll("[data-preview]").forEach((button) => {
    button.addEventListener("click", async () => {
      const tool = button.getAttribute("data-preview");
      if (!tool) return;
      await showResultPreview(tool);
    });
  });

  document.querySelectorAll("[data-trim]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-trim");
      if (!tool) return;
      const mode = button.getAttribute("data-trim-mode") || "current";
      handleVideoTrim(tool, mode);
    });
  });

  document.addEventListener("click", (event) => {
    const translateBtn = event.target.closest("[data-action^='gpt-translate-']");
    if (!translateBtn) return;
    event.preventDefault();
    const action = translateBtn.getAttribute("data-action");
    if (action === "gpt-translate-scenes") {
      openSceneTranslationComparison();
    } else if (action === "gpt-translate-script") {
      openScriptTranslationComparison();
    }
  });

  document.addEventListener("click", (event) => {
    const copyBtn = event.target.closest("[data-copy-text]");
    if (!copyBtn) return;
   event.preventDefault();
    handleCopyButton(copyBtn);
  });

  document.addEventListener("click", (event) => {
    const loadVideoBtn = event.target.closest("[data-load-video]");
    if (!loadVideoBtn) return;
    event.preventDefault();
    const tool = loadVideoBtn.getAttribute("data-load-video");
    if (!tool) return;
    openVideoLoadDialog(tool);
  });

  document.addEventListener("click", async (event) => {
    const trimPreviewBtn = event.target.closest("[data-preview-trim]");
    if (!trimPreviewBtn) return;
    event.preventDefault();
    const tool = trimPreviewBtn.getAttribute("data-preview-trim");
    if (!tool) return;
    await openTrimPreview(tool);
  });

  document.addEventListener("click", async (event) => {
    const imageBtn = event.target.closest("[data-preview-trim-image]");
    if (!imageBtn) return;
    event.preventDefault();
    const tool = imageBtn.getAttribute("data-preview-trim-image");
    if (!tool) return;
    const mode = imageBtn.getAttribute("data-trim-image-mode") || "current";
    await openTrimImagePreview(tool, mode);
  });

  document.addEventListener("click", async (event) => {
    const saveBtn = event.target.closest("[data-save-frame]");
    if (!saveBtn) return;
    event.preventDefault();
    const dataUrl = saveBtn.dataset.frameData;
    if (!dataUrl) {
      showNotification("저장할 이미지 데이터를 찾을 수 없습니다.", "error");
      return;
    }
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "저장 중...";
      const response = await api("/api/tools/frames", {
        method: "POST",
        body: JSON.stringify({ data_url: dataUrl })
      });
      const url = response?.url;
      if (url) {
        saveBtn.textContent = "저장 완료";
        saveBtn.classList.add("success");
        const actions = saveBtn.closest(".trim-image-actions");
        if (actions && !actions.querySelector("[data-frame-link]")) {
          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = "저장본 열기";
          link.className = "outline";
          link.dataset.frameLink = "true";
          actions.appendChild(link);
        }
        showNotification("이미지를 파일로 저장했습니다.", "success");
      } else {
        throw new Error("서버 응답에 URL이 없습니다.");
      }
    } catch (error) {
      console.error("Failed to save frame:", error);
      saveBtn.disabled = false;
      saveBtn.textContent = "서버에 저장";
      showNotification(error.message || "이미지 저장에 실패했습니다.", "error");
    }
  });

  // 10초 간격 프레임 추출
  document.addEventListener("click", async (event) => {
    const extractBtn = event.target.closest("[data-extract-frames]");
    if (!extractBtn) return;
    event.preventDefault();

    const tool = extractBtn.getAttribute("data-extract-frames");
    const interval = parseInt(extractBtn.getAttribute("data-interval") || "10", 10);

    if (!tool) return;

    const result = state.latestResults[tool];
    if (!result) {
      showNotification("먼저 결과를 생성하세요.", "error");
      return;
    }

    // 영상 경로 찾기
    let videoPath = null;
    if (result.videoFiles && result.videoFiles.length > 0) {
      videoPath = result.videoFiles[0];
    } else if (result.video_path) {
      videoPath = result.video_path;
    }

    if (!videoPath) {
      showNotification("영상 파일을 찾을 수 없습니다. 먼저 영상을 불러오세요.", "error");
      return;
    }

    try {
      extractBtn.disabled = true;
      extractBtn.textContent = "프레임 추출 중...";

      const response = await api("/api/tools/extract-frames", {
        method: "POST",
        body: JSON.stringify({
          video_path: videoPath,
          interval: interval
        })
      });

      if (response?.success) {
        extractBtn.textContent = `${response.extracted_count}개 프레임 추출 완료`;
        extractBtn.classList.add("success");
        showNotification(`${response.extracted_count}개의 프레임을 ${interval}초 간격으로 추출했습니다.`, "success");

        // 추출 완료 후 자동으로 갤러리 표시
        setTimeout(() => {
          const viewBtn = document.querySelector(`[data-view-extracted-frames="${tool}"]`);
          if (viewBtn) viewBtn.click();
        }, 500);
      } else {
        throw new Error("프레임 추출에 실패했습니다.");
      }
    } catch (error) {
      console.error("Failed to extract frames:", error);
      showNotification(error.message || "프레임 추출에 실패했습니다.", "error");
    } finally {
      extractBtn.disabled = false;
      setTimeout(() => {
        extractBtn.textContent = `⏱️ ${interval}초 간격 자르기`;
        extractBtn.classList.remove("success");
      }, 3000);
    }
  });

  // 추출된 이미지 갤러리 보기
  document.addEventListener("click", async (event) => {
    const viewBtn = event.target.closest("[data-view-extracted-frames]");
    if (!viewBtn) return;
    event.preventDefault();

    const tool = viewBtn.getAttribute("data-view-extracted-frames");
    if (!tool) return;

    try {
      viewBtn.disabled = true;
      viewBtn.textContent = "불러오는 중...";

      const response = await api("/api/tools/list-extracted-frames");

      if (!response?.frames || response.frames.length === 0) {
        showNotification("추출된 이미지가 없습니다. 먼저 프레임을 추출하세요.", "info");
        return;
      }

      // 모달 생성
      const modal = document.createElement("dialog");
      modal.className = "extracted-frames-modal";
      modal.style.maxWidth = "90vw";
      modal.style.maxHeight = "90vh";
      modal.style.overflow = "auto";

      const galleryHtml = response.frames.map((frame, index) => `
        <article class="trim-image-card" style="display: inline-block; margin: 1rem; width: 280px; vertical-align: top;">
          <figure>
            <img src="${frame.url}" alt="추출된 프레임 ${index + 1}" loading="lazy" style="width: 100%; height: auto;" />
            <figcaption>프레임 #${index + 1}</figcaption>
          </figure>
          <div class="trim-image-actions">
            <a href="${frame.url}" download="${frame.filename}" class="outline">다운로드</a>
            <a href="${frame.url}" target="_blank" class="secondary">새 탭에서 열기</a>
          </div>
        </article>
      `).join('');

      modal.innerHTML = `
        <article style="padding: 2rem;">
          <header style="margin-bottom: 1rem;">
            <h3>📁 추출된 이미지 (총 ${response.count}개)</h3>
            <button class="secondary" style="float: right;" data-close-modal>닫기</button>
          </header>
          <div style="clear: both; text-align: center;">
            ${galleryHtml}
          </div>
        </article>
      `;

      document.body.appendChild(modal);
      modal.showModal();

      // 닫기 버튼 이벤트
      modal.querySelector("[data-close-modal]")?.addEventListener("click", () => {
        modal.close();
        modal.remove();
      });

      // 배경 클릭시 닫기
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.close();
          modal.remove();
        }
      });

    } catch (error) {
      console.error("Failed to view extracted frames:", error);
      showNotification(error.message || "이미지 목록을 불러오지 못했습니다.", "error");
    } finally {
      viewBtn.disabled = false;
      viewBtn.textContent = "📁 자른 이미지 보기";
    }
  });

  // 미리보기에서 현재 위치 캡처
  document.addEventListener("click", async (event) => {
    const captureBtn = event.target.closest("[data-capture-current-frame]");
    if (!captureBtn) return;
    event.preventDefault();

    // 모달 내의 비디오 요소 찾기
    const modal = captureBtn.closest(".preview-modal");
    if (!modal) {
      showNotification("미리보기 창을 찾을 수 없습니다.", "error");
      return;
    }

    const video = modal.querySelector("video");
    if (!video) {
      showNotification("영상을 찾을 수 없습니다.", "error");
      return;
    }

    const currentTime = video.currentTime;
    const timeLabel = formatTimecode(currentTime);

    try {
      captureBtn.disabled = true;
      const originalText = captureBtn.textContent;
      captureBtn.textContent = "캡처 중...";

      // 현재 위치에서 프레임 캡처
      const frame = await captureFrameAt(video, currentTime);

      // 갤러리 표시
      let gallery = modal.querySelector("[data-preview-frame-gallery]");
      if (gallery) {
        gallery.hidden = false;
      }

      const list = modal.querySelector("[data-preview-frame-list]");
      if (list) {
        const item = document.createElement("article");
        item.className = "trim-image-card";
        item.style.display = "inline-block";
        item.style.margin = "1rem";
        item.style.width = "280px";
        item.style.verticalAlign = "top";

        item.innerHTML = `
          <figure>
            <img src="${frame.dataUrl}" alt="캡처 프레임" loading="lazy" style="width: 100%; height: auto;" />
            <figcaption>${timeLabel}</figcaption>
          </figure>
          <div class="trim-image-actions">
            <a href="${frame.dataUrl}" download="frame-${timeLabel.replace(/:/g, '-')}.png" class="outline">PNG 다운로드</a>
            <button type="button" class="secondary" data-save-frame data-frame-data="${frame.dataUrl}">서버에 저장</button>
          </div>
        `;

        list.prepend(item);

        // 저장 버튼 이벤트 설정
        const saveButton = item.querySelector("[data-save-frame]");
        if (saveButton) {
          saveButton.dataset.frameData = frame.dataUrl;
          saveButton.dataset.frameLabel = "캡처";
          saveButton.dataset.frameTime = timeLabel;
        }
      }

      showNotification(`${timeLabel} 위치의 프레임을 캡처했습니다.`, "success");
      captureBtn.textContent = originalText;

    } catch (error) {
      console.error("Failed to capture current frame:", error);
      showNotification(error.message || "프레임 캡처에 실패했습니다.", "error");
    } finally {
      captureBtn.disabled = false;
    }
  });

  // 맨 앞 자르기 버튼 핸들러
  document.addEventListener("click", async (event) => {
    const trimStartBtn = event.target.closest("[data-trim-start-frame]");
    if (!trimStartBtn) return;
    event.preventDefault();

    const modal = trimStartBtn.closest(".preview-modal");
    if (!modal) {
      showNotification("미리보기 창을 찾을 수 없습니다.", "error");
      return;
    }

    const video = modal.querySelector("video");
    if (!video) {
      showNotification("영상을 찾을 수 없습니다.", "error");
      return;
    }

    try {
      trimStartBtn.disabled = true;
      const originalText = trimStartBtn.textContent;
      trimStartBtn.textContent = "캡처 중...";

      // 첫 프레임으로 이동하여 캡처
      video.currentTime = 0;

      // 비디오가 첫 프레임을 로드할 때까지 대기
      await new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      const frame = await captureFrameAt(video, 0);

      const gallery = document.getElementById("captured-frames-gallery");
      if (gallery) {
        const container = document.createElement("div");
        container.className = "captured-frame-item";
        container.innerHTML = `
          <img src="${frame}" alt="맨 앞 프레임" />
          <div class="frame-info">
            <span class="frame-time">00:00:00</span>
            <button type="button" class="remove-frame" title="삭제">×</button>
          </div>
        `;
        gallery.appendChild(container);

        const removeBtn = container.querySelector(".remove-frame");
        removeBtn.addEventListener("click", () => {
          container.remove();
          if (gallery.children.length === 0) {
            gallery.style.display = "none";
          }
        });

        gallery.style.display = "grid";
      }

      showNotification("맨 앞 프레임을 캡처했습니다.", "success");
      trimStartBtn.textContent = originalText;
    } catch (error) {
      console.error("Failed to capture first frame:", error);
      showNotification(error.message || "맨 앞 프레임 캡처에 실패했습니다.", "error");
    } finally {
      trimStartBtn.disabled = false;
    }
  });

  // 맨 뒤 자르기 버튼 핸들러
  document.addEventListener("click", async (event) => {
    const trimEndBtn = event.target.closest("[data-trim-end-frame]");
    if (!trimEndBtn) return;
    event.preventDefault();

    const modal = trimEndBtn.closest(".preview-modal");
    if (!modal) {
      showNotification("미리보기 창을 찾을 수 없습니다.", "error");
      return;
    }

    const video = modal.querySelector("video");
    if (!video) {
      showNotification("영상을 찾을 수 없습니다.", "error");
      return;
    }

    try {
      trimEndBtn.disabled = true;
      const originalText = trimEndBtn.textContent;
      trimEndBtn.textContent = "캡처 중...";

      // 마지막 프레임으로 이동하여 캡처 (duration - 0.1초)
      const lastFrameTime = Math.max(0, video.duration - 0.1);
      video.currentTime = lastFrameTime;

      // 비디오가 마지막 프레임을 로드할 때까지 대기
      await new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      const frame = await captureFrameAt(video, lastFrameTime);
      const timeLabel = formatTimecode(lastFrameTime);

      const gallery = document.getElementById("captured-frames-gallery");
      if (gallery) {
        const container = document.createElement("div");
        container.className = "captured-frame-item";
        container.innerHTML = `
          <img src="${frame}" alt="맨 뒤 프레임" />
          <div class="frame-info">
            <span class="frame-time">${timeLabel}</span>
            <button type="button" class="remove-frame" title="삭제">×</button>
          </div>
        `;
        gallery.appendChild(container);

        const removeBtn = container.querySelector(".remove-frame");
        removeBtn.addEventListener("click", () => {
          container.remove();
          if (gallery.children.length === 0) {
            gallery.style.display = "none";
          }
        });

        gallery.style.display = "grid";
      }

      showNotification(`맨 뒤 프레임(${timeLabel})을 캡처했습니다.`, "success");
      trimEndBtn.textContent = originalText;
    } catch (error) {
      console.error("Failed to capture last frame:", error);
      showNotification(error.message || "맨 뒤 프레임 캡처에 실패했습니다.", "error");
    } finally {
      trimEndBtn.disabled = false;
    }
  });

  Object.keys(TOOL_CONFIG).forEach((tool) => {
    const section = document.getElementById(TOOL_CONFIG[tool].savedContainer);
    if (section) {
      section.addEventListener("click", handleSavedSectionClick);
    }
    loadSavedRecords(tool);
  });

  // 타임라인 테이블 편집 기능 이벤트 핸들러
  document.addEventListener('click', function(event) {
    // 수정 버튼 클릭
    if (event.target.classList.contains('edit-row')) {
      const rowIndex = parseInt(event.target.dataset.row);
      enableRowEdit(rowIndex);
    }

    // 삭제 버튼 클릭
    if (event.target.classList.contains('delete-row')) {
      const rowIndex = parseInt(event.target.dataset.row);
      deleteTimelineRow(rowIndex);
    }

    // 저장 버튼 클릭
    if (event.target.classList.contains('save-row')) {
      const rowIndex = parseInt(event.target.dataset.row);
      saveTimelineRow(rowIndex);
    }

    // 갭 행 자막 추가 버튼 클릭
    if (event.target.classList.contains('add-subtitle-btn')) {
      const gapIndex = event.target.dataset.gap;
      addSubtitleToGap(gapIndex);
    }

    // 갭 행 삭제 버튼 클릭
    if (event.target.classList.contains('delete-gap-btn')) {
      const gapIndex = event.target.dataset.gap;
      deleteGap(gapIndex);
    }

    // 갭 길이 조정 버튼 클릭
    if (event.target.classList.contains('trim-gap-btn')) {
      const gapIndex = event.target.dataset.gap;
      trimGap(gapIndex);
    }
  });

  // 모든 도구의 저장된 기록 로드
  async function loadAllToolRecords() {
    for (const tool of Object.values(TOOL_KEYS)) {
      try {
        await loadSavedRecords(tool);
      } catch (error) {
        console.error(`Failed to load records for ${tool}:`, error);
      }
    }
  }

  const persistedSelection = loadPersistedSelection();
  const toolSelect = document.getElementById("tool-selection");
  const recordSelect = document.getElementById("record-selection");

  if (toolSelect) {
    // Add change event listener for dropdown functionality
    toolSelect.addEventListener("change", updateRecordSelectOptions);

    if (persistedSelection?.tool) {
      toolSelect.value = persistedSelection.tool;
    }

    // 페이지 로드 시 모든 기록 로드 후 선택 복원
    loadAllToolRecords().then(() => {
      // 기록 로드 완료 후 드롭다운 업데이트
      updateRecordSelectOptions();

      // 저장된 선택 복원
      if (persistedSelection?.tool && persistedSelection?.recordId) {
        const recordSelect = document.getElementById("record-selection");
        if (recordSelect) {
          recordSelect.value = persistedSelection.recordId;
        }
      }
    });
  }

  // 저장된 결과 선택 이벤트 리스너 추가
  if (recordSelect) {
    recordSelect.addEventListener("change", function() {
      const selectedTool = toolSelect?.value;
      const selectedRecordId = this.value;

      if (selectedTool && selectedRecordId) {
        state.activeRecords[selectedTool] = selectedRecordId;
        // 선택사항을 localStorage에 저장
        const records = state.savedRecords[selectedTool] || [];
        const record = records.find(r => r.id === selectedRecordId);
        if (record) {
          persistSelection(selectedTool, selectedRecordId, record.payload);
        }
      } else if (selectedTool) {
        state.activeRecords[selectedTool] = null;
        clearPersistedSelection();
      }
    });
  }
  if (persistedSelection?.tool) {
    state.activeRecords[persistedSelection.tool] = persistedSelection.recordId || null;
    if (persistedSelection.payload && !state.latestResults[persistedSelection.tool]) {
      state.latestResults[persistedSelection.tool] = persistedSelection.payload;
    }
    if (
      (persistedSelection.tool === TOOL_KEYS.SCRIPT || persistedSelection.tool === TOOL_KEYS.SCENES) &&
      persistedSelection.payload?.keyword
    ) {
      state.lastRequests[persistedSelection.tool] = {
        keyword: persistedSelection.payload.keyword,
        language: persistedSelection.payload.language || "ko"
      };
    }
  }

  const form = document.getElementById("project-form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const selection = formData.get("tool_selection");
      if (!selection) {
        alert("먼저 도구에서 결과를 선택하세요.");
        return;
      }
      const tool = String(selection);
      let recordId = state.activeRecords[tool];
      let records = state.savedRecords[tool] || [];
      let record = recordId ? records.find((item) => item.id === recordId) : undefined;
      const persisted = loadPersistedSelection();
      if (!record && persisted && persisted.tool === tool) {
        recordId = persisted.recordId || null;
        record = recordId ? records.find((item) => item.id === recordId) : undefined;
      }
      const payload = record?.payload || (persisted && persisted.tool === tool ? persisted.payload : null);
      if (!payload) {
        alert("선택된 결과를 불러올 수 없습니다. 프롬프트 도구에서 저장 항목을 선택하세요.");
        return;
      }
      if (!record && persisted && persisted.tool === tool && persisted.recordId) {
        state.activeRecords[tool] = persisted.recordId;
      }

      try {
        const projectInit = {
          keyword: toSafeString(payload.keyword, toSafeString(record?.title, "AI 프로젝트")),
          language: toSafeString(payload.language, "ko")
        };
        const project = await api("/api/projects", {
          method: "POST",
          body: JSON.stringify(projectInit)
        });
        let currentProject = project;

        if (Array.isArray(payload.items)) {
          const titles = payload.items.map((item, index) => ({
            index: item.index || index + 1,
            text: toSafeString(item.text || item.title, `아이템 ${index + 1}`),
            source: tool === TOOL_KEYS.STORY ? "keyword" : "image"
          }));
          currentProject = await api(`/api/projects/${project.project_id}/generate/titles`, {
            method: "POST",
            body: JSON.stringify({ type: "keyword", count: titles.length })
          });
          currentProject.titles = titles;
        }

        if (tool === TOOL_KEYS.SCRIPT) {
          if (Array.isArray(payload.subtitles)) {
            currentProject.subtitles = payload.subtitles;
          }
          if (Array.isArray(payload.images)) {
            currentProject.image_prompts = payload.images;
            // Save image prompts to server
            for (const image of payload.images) {
              await api(`/api/projects/${project.project_id}/prompts/image`, {
                method: "POST",
                body: JSON.stringify(image)
              });
            }
          }
        }

        if (tool === TOOL_KEYS.SCENES) {
          if (Array.isArray(payload.subtitles)) {
            currentProject.subtitles = payload.subtitles;
          }
          if (Array.isArray(payload.scenes)) {
            currentProject.video_prompts = payload.scenes;
            // Save video prompts to server
            for (const scene of payload.scenes) {
              await api(`/api/projects/${project.project_id}/prompts/video`, {
                method: "POST",
                body: JSON.stringify(scene)
              });
            }
          }
        }

        if (tool === TOOL_KEYS.VIDEO_IMPORT) {
          if (Array.isArray(payload.subtitles)) {
            currentProject.subtitles = payload.subtitles;
          }
          // video_import의 경우 keyword가 없으므로 record title을 사용
          if (record?.title && !payload.keyword) {
            payload.keyword = record.title;
          }
        }

        if (payload.keyword) {
          state.lastRequests[tool] = {
            keyword: toSafeString(payload.keyword),
            language: toSafeString(payload.language, "ko")
          };
        }

        // 프로젝트에 tool 정보 추가
        currentProject.tool = tool;

        renderProject(currentProject);
        const activeId = state.activeRecords[tool] || recordId || (persisted?.tool === tool ? persisted.recordId : null);
        persistSelection(tool, activeId, payload);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const historyContainer = document.querySelector(".history-container");
  if (historyContainer) {
    bindHistoryCards(historyContainer);
  }

  const url = new URL(window.location.href);
  const initialProjectId = url.searchParams.get("project") || (url.hash.startsWith("#project-") ? url.hash.replace("#project-", "") : null);
  if (initialProjectId) {
    loadProject(initialProjectId, { scrollIntoView: false });
  }
});

// 새로운 테이블 렌더링 함수들
function renderTimelineTableRows(project) {
  const subtitles = project.subtitles || [];
  const backgroundMusic = project.background_music || [];
  const imagePrompts = project.image_prompts || [];
  const videoPrompts = project.video_prompts || [];

  // 타임스탬프 갭 감지 및 빈 행 생성을 위한 확장된 배열 생성
  const extendedItems = [];

  for (let i = 0; i < subtitles.length; i++) {
    const current = subtitles[i];
    const next = subtitles[i + 1];

    // 현재 자막 추가
    extendedItems.push({ type: 'subtitle', data: current, originalIndex: i });

    // 다음 자막이 있을 때 갭 체크
    if (next) {
      const currentEndTime = parseFloat(current.end_time || current.end);
      const nextStartTime = parseFloat(next.start_time || next.start);

      // 0.1초 이상의 갭이 있으면 빈 행 추가
      if (nextStartTime - currentEndTime > 0.1) {
        extendedItems.push({
          type: 'gap',
          startTime: currentEndTime,
          endTime: nextStartTime,
          gapIndex: `gap_${i}_${i+1}`
        });
      }
    }
  }

  return extendedItems.map((item, extendedIndex) => {
    if (item.type === 'gap') {
      return renderGapRow(item, extendedIndex);
    } else {
      return renderSubtitleRow(item.data, item.originalIndex, extendedIndex, project, backgroundMusic, imagePrompts, videoPrompts);
    }
  }).join('');

  // 타임라인 테이블이 렌더링된 후 체크박스 이벤트 리스너 설정
  setTimeout(() => {
    setupNarrationCheckboxListeners();
  }, 100);
}

// 갭 행 렌더링 함수
function renderGapRow(gapItem, extendedIndex) {
  const timeDisplay = `${formatTime(gapItem.startTime)}s→${formatTime(gapItem.endTime)}s`;
  const timeLabel = `GAP<br/>${timeDisplay}`;

  return `
    <tr class="gap-row" data-gap-index="${gapItem.gapIndex}" data-extended-index="${extendedIndex}">
      <td rowspan="2" class="time-column-tl gap-time">${timeLabel}</td>
      <td rowspan="2" class="narration-check-column-tl gap-actions">
        <div style="display: flex; flex-direction: column; gap: 0.25rem; align-items: center;">
          <button type="button" class="add-subtitle-btn outline small" data-gap="${gapItem.gapIndex}" title="자막 추가">➕</button>
          <button type="button" class="delete-gap-btn outline small" data-gap="${gapItem.gapIndex}" title="갭 삭제">🗑️</button>
        </div>
      </td>
      <td class="content-column-tl gap-content" data-field="gap-content">
        <div class="gap-placeholder" style="text-align: center; color: #999; font-style: italic; padding: 1rem;">
          빈 타임스탬프 구간<br/>
          <small>자막을 추가하거나 길이를 조정할 수 있습니다</small>
        </div>
      </td>
      <td rowspan="2" class="bgmusic-column-tl">❌</td>
      <td rowspan="2" class="image-column-tl">❌</td>
      <td rowspan="2" class="video-column-tl">❌</td>
      <td rowspan="2" class="actions-column-tl">
        <div class="row-actions">
          <button type="button" class="trim-gap-btn outline small" data-gap="${gapItem.gapIndex}" title="길이 조정">✂️</button>
        </div>
      </td>
    </tr>
    <tr>
      <td class="content-column-tl gap-controls" style="text-align: center; padding: 0.5rem;">
        <small style="color: #666;">갭 시간: ${(gapItem.endTime - gapItem.startTime).toFixed(1)}초</small>
      </td>
    </tr>
  `;
}

// 자막 행 렌더링 함수 (기존 로직을 분리)
function renderSubtitleRow(subtitle, originalIndex, extendedIndex, project, backgroundMusic, imagePrompts, videoPrompts) {
  const index = originalIndex; // 기존 인덱스 유지
    // video_import는 start_time/end_time(문자열), 다른 것들은 start/end(숫자) 사용
    const startTime = subtitle.start_time || subtitle.start;
    const endTime = subtitle.end_time || subtitle.end;

    // 시간 표시: 문자열이면 그대로, 숫자면 formatTime 사용
    let timeDisplay;
    if (typeof startTime === 'string' && typeof endTime === 'string') {
      timeDisplay = `${startTime}→${endTime}`;
    } else {
      timeDisplay = `${formatTime(startTime)}s→${formatTime(endTime)}s`;
    }

    const timeLabel = `#${index + 1}<br/>${timeDisplay}`;
    const music = backgroundMusic.length > 0 ? '🎵' : '❌';
    const image = imagePrompts[index] ? '🖼️' : '❌';

    // video_import 타입의 경우 모든 행에 V1 표시, 그 외에는 기존 로직
    let video;
    const toolSelect = document.getElementById('tool-selection');
    const currentTool = toolSelect ? toolSelect.value : null;

    if (project.tool === 'video_import' || currentTool === 'video_import') {
      video = 'V1';
    } else {
      video = videoPrompts[index] ? '🎬' : '❌';
    }

    const isNarration = subtitle.text.startsWith('>>') || subtitle.text.startsWith('>> ');

    return `
      <tr ${index > 0 ? 'class="section-divide-tl"' : ''} data-row-index="${index}">
        <td rowspan="2" class="time-column-tl">${timeLabel}</td>
        <td rowspan="2" class="narration-check-column-tl">
          <div class="narration-checkbox-wrapper">
            <input type="checkbox" id="narration-${index}" class="narration-checkbox" data-row="${index}" ${isNarration ? 'checked' : ''}>
            <label for="narration-${index}" class="narration-label" title="해설 체크박스">
              <span class="checkbox-icon">${isNarration ? '🗣️' : '💬'}</span>
            </label>
          </div>
          <div class="reinterpret-checkbox-wrapper" style="margin-top: 0.5rem;">
            <input type="checkbox" id="reinterpret-${index}" class="reinterpret-checkbox" data-row="${index}">
            <label for="reinterpret-${index}" class="reinterpret-label" title="체크박스">
              <span class="checkbox-icon"></span>
            </label>
          </div>
        </td>
        <td class="content-column-tl subtitle-content-tl" data-field="subtitle">
          <div class="subtitle-row">
            <span class="subtitle-text${isNarration ? ' narration' : ''}">${escapeHtml(subtitle.text.replace('>> ', '').replace('>>', ''))}</span>
            <div style="border-top: 1px solid #dee2e6; margin: 0.5rem 0;"></div>
            <div class="audio-clip-controls">
              <button type="button" class="play-audio-btn secondary small" data-audio-index="${index}" title="음성 클립 재생" disabled>
                ▶️
              </button>
            </div>
          </div>
        </td>
        <td rowspan="2" class="bgmusic-column-tl" data-field="music">${music}</td>
        <td rowspan="2" class="image-column-tl" data-field="image">${image}</td>
        <td rowspan="2" class="video-column-tl" data-field="video">${video}</td>
        <td rowspan="2" class="actions-column-tl">
          <div class="row-actions">
            <button type="button" class="edit-row outline small" data-row="${index}" title="수정">✏️</button>
            <button type="button" class="delete-row outline small" data-row="${index}" title="삭제">🗑️</button>
            <button type="button" class="save-row contrast small" data-row="${index}" title="저장" style="display: none;">💾</button>
          </div>
        </td>
      </tr>
      <tr>
        <td class="content-column-tl ai-buttons-row-tl" data-field="ai-buttons">
          <div class="ai-buttons-compact" style="display: flex; gap: 0.5rem; align-items: center; justify-content: center; padding: 0.25rem 0;">
            <button type="button" class="ai-icon-btn reinterpret-btn" data-row-index="${index}" title="재해석AI">🔄</button>
            <button type="button" class="ai-icon-btn translate-jp-btn" data-row-index="${index}" title="일본어번역">🇯🇵</button>
            <button type="button" class="ai-icon-btn backtranslate-kr-btn" data-row-index="${index}" title="역번역한국어">🔙</button>
            <button type="button" class="ai-icon-btn tts-btn" data-subtitle-index="${index}" title="음성변환">🎤</button>
          </div>
        </td>
      </tr>
    `;
}

// 전체 타임라인 저장 함수
// 파일명 입력 모달 생성 함수
function createFilenameModal() {
  const modal = document.createElement('div');
  modal.className = 'filename-modal';
  modal.innerHTML = `
    <div class="filename-modal-content">
      <h3>📁 타임라인 저장</h3>
      <div class="filename-input-group">
        <label for="timeline-filename">파일명을 입력하세요:</label>
        <input type="text" id="timeline-filename" class="filename-input"
               placeholder="예: 북극성_4,5화_타임라인"
               value="">
      </div>
      <div class="filename-modal-buttons">
        <button type="button" class="filename-modal-btn secondary" id="filename-cancel">취소</button>
        <button type="button" class="filename-modal-btn primary" id="filename-save">💾 저장</button>
      </div>
    </div>
  `;
  return modal;
}

// 수정된 저장 함수 - 파일명 입력 모달 포함
async function saveAllTimelineChanges() {
  console.log('전체 저장 버튼 클릭됨');

  // 파일명 입력 모달 표시
  const modal = createFilenameModal();
  document.body.appendChild(modal);

  const filenameInput = modal.querySelector('#timeline-filename');
  const cancelBtn = modal.querySelector('#filename-cancel');
  const saveBtn = modal.querySelector('#filename-save');

  // 기본 파일명 설정 (현재 날짜/시간 기반)
  const now = new Date();
  const defaultFilename = `타임라인_${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}-${now.getMinutes().toString().padStart(2,'0')}`;
  filenameInput.value = defaultFilename;
  filenameInput.select();

  return new Promise((resolve) => {
    // 취소 버튼 이벤트
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      resolve(false);
    });

    // 모달 배경 클릭 시 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
        resolve(false);
      }
    });

    // Enter 키 처리
    filenameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveBtn.click();
      } else if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });

    // 저장 버튼 이벤트
    saveBtn.addEventListener('click', async () => {
      const filename = filenameInput.value.trim();
      if (!filename) {
        alert('파일명을 입력해주세요.');
        filenameInput.focus();
        return;
      }

      // 모달 닫기
      document.body.removeChild(modal);

      // 실제 저장 수행
      await performTimelineSave(filename);
      resolve(true);
    });
  });
}

// 실제 저장 수행 함수
async function performTimelineSave(filename) {
  const saveBtn = document.getElementById('save-all-timeline');
  if (!saveBtn) return;

  // 버튼 상태 변경
  const originalText = saveBtn.innerHTML;
  saveBtn.innerHTML = '⏳ 저장 중...';
  saveBtn.disabled = true;

  try {
    // 현재 프로젝트 정보 가져오기
    const currentProject = window.currentProject;
    if (!currentProject) {
      throw new Error('프로젝트 정보를 찾을 수 없습니다.');
    }

    // 타임라인 테이블에서 현재 상태 수집
    const timelineData = collectTimelineData();

    // 서버에 저장
    const response = await fetch('/api/project/save-timeline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: currentProject.id,
        timeline_data: timelineData,
        filename: filename,
        timestamp: new Date().toISOString()
      }),
    });

    if (!response.ok) {
      throw new Error(`저장 실패: ${response.status}`);
    }

    const result = await response.json();

    // 로컬 스토리지에도 저장 (백업용)
    const storageKey = `timeline_save_${currentProject.id}_${Date.now()}`;
    const saveData = {
      projectId: currentProject.id,
      timelineData: timelineData,
      filename: filename,
      timestamp: new Date().toISOString(),
      lastModified: Date.now()
    };
    localStorage.setItem(storageKey, JSON.stringify(saveData));

    // 성공 피드백
    saveBtn.innerHTML = '✅ 저장 완료';
    saveBtn.style.background = '#28a745';

    // 성공 메시지 표시
    showNotification(`"${filename}" 타임라인이 성공적으로 저장되었습니다.`, 'success');

    setTimeout(() => {
      saveBtn.innerHTML = originalText;
      saveBtn.disabled = false;
      saveBtn.style.background = '';
    }, 2000);

  } catch (error) {
    console.error('타임라인 저장 오류:', error);

    // 오류 피드백
    saveBtn.innerHTML = '❌ 저장 실패';
    saveBtn.style.background = '#dc3545';

    // 오류 메시지 표시
    showNotification(`저장 실패: ${error.message}`, 'error');

    setTimeout(() => {
      saveBtn.innerHTML = originalText;
      saveBtn.disabled = false;
      saveBtn.style.background = '';
    }, 3000);
  }
}

// 다른 이름으로 저장 함수
function saveAsTimeline() {
  console.log('다른 이름으로 저장 버튼 클릭됨');
  saveAllTimelineChanges(); // 기존 저장 함수 재사용
}

// 저장된 타임라인 목록 가져오기
function getSavedTimelineList() {
  const savedTimelines = [];
  const currentProject = window.currentProject;

  if (!currentProject) return savedTimelines;

  // 로컬 스토리지에서 저장된 타임라인들 찾기
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`timeline_save_${currentProject.id}_`)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.filename) {
          savedTimelines.push({
            key: key,
            filename: data.filename,
            timestamp: data.timestamp,
            projectId: data.projectId
          });
        }
      } catch (error) {
        console.error('타임라인 데이터 파싱 오류:', error);
      }
    }
  }

  // 최신순으로 정렬
  savedTimelines.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return savedTimelines;
}

// 저장된 타임라인 목록 모달 생성
function createTimelineListModal(title, onSelect) {
  const savedTimelines = getSavedTimelineList();

  const modal = document.createElement('div');
  modal.className = 'filename-modal';
  modal.innerHTML = `
    <div class="filename-modal-content">
      <h3>${title}</h3>
      <div style="max-height: 300px; overflow-y: auto; margin: 1rem 0;">
        ${savedTimelines.length === 0
          ? '<p style="text-align: center; color: #666;">저장된 타임라인이 없습니다.</p>'
          : savedTimelines.map(timeline => `
              <div class="timeline-item" data-key="${timeline.key}" style="
                padding: 0.75rem;
                border: 1px solid #ddd;
                border-radius: 4px;
                margin-bottom: 0.5rem;
                cursor: pointer;
                transition: background-color 0.2s;
              ">
                <div style="font-weight: 500;">${timeline.filename}</div>
                <div style="font-size: 0.8rem; color: #666;">
                  ${new Date(timeline.timestamp).toLocaleString()}
                </div>
              </div>
            `).join('')}
      </div>
      <div class="filename-modal-buttons">
        <button type="button" class="filename-modal-btn secondary" id="timeline-modal-cancel">취소</button>
      </div>
    </div>
  `;

  // 타임라인 아이템 클릭 이벤트
  modal.querySelectorAll('.timeline-item').forEach(item => {
    item.addEventListener('click', () => {
      const key = item.dataset.key;
      const filename = item.querySelector('div').textContent;
      onSelect(key, filename);
      document.body.removeChild(modal);
    });

    // 호버 효과
    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = '#f8f9fa';
    });
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = '';
    });
  });

  // 취소 버튼
  modal.querySelector('#timeline-modal-cancel').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // 모달 배경 클릭으로 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  return modal;
}

// 타임라인 불러오기 함수
function loadTimeline() {
  console.log('불러오기 버튼 클릭됨');
  const modal = createTimelineListModal('📂 저장된 타임라인 불러오기', (key, filename) => {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data && data.timelineData) {
        restoreTimelineState(data.timelineData);
        showNotification(`"${filename}" 타임라인을 불러왔습니다.`, 'success');
      } else {
        throw new Error('타임라인 데이터가 없습니다.');
      }
    } catch (error) {
      console.error('타임라인 불러오기 오류:', error);
      showNotification(`불러오기 실패: ${error.message}`, 'error');
    }
  });

  document.body.appendChild(modal);
}

// 타임라인 삭제 함수
function deleteTimeline() {
  console.log('삭제 버튼 클릭됨');
  const modal = createTimelineListModal('🗑️ 타임라인 삭제', (key, filename) => {
    if (confirm(`"${filename}" 타임라인을 정말 삭제하시겠습니까?`)) {
      try {
        localStorage.removeItem(key);
        showNotification(`"${filename}" 타임라인이 삭제되었습니다.`, 'success');

        // 모달을 다시 열어서 업데이트된 목록 표시
        setTimeout(() => {
          deleteTimeline();
        }, 100);
      } catch (error) {
        console.error('타임라인 삭제 오류:', error);
        showNotification(`삭제 실패: ${error.message}`, 'error');
      }
    }
  });

  document.body.appendChild(modal);
}

// 타임라인 데이터 수집 함수
function collectTimelineData() {
  const timelineRows = document.querySelectorAll('tr[data-row-index]');
  const timelineData = [];

  timelineRows.forEach((row) => {
    const rowIndex = parseInt(row.dataset.rowIndex);

    // 자막 텍스트 가져오기
    const subtitleElement = row.querySelector('.subtitle-text');
    const subtitleText = subtitleElement ? subtitleElement.textContent.trim() : '';

    // 해설 여부 확인
    const narrationCheckbox = row.querySelector('.narration-checkbox');
    const isNarration = narrationCheckbox ? narrationCheckbox.checked : false;

    // 실제 저장될 텍스트 (해설인 경우 >> 접두사 추가)
    const finalText = isNarration ? `>> ${subtitleText}` : subtitleText;

    // 미디어 정보 수집
    const musicCell = row.querySelector('.bgmusic-column-tl');
    const imageCell = row.querySelector('.image-column-tl');
    const videoCell = row.querySelector('.video-column-tl');

    const rowData = {
      index: rowIndex,
      subtitle: finalText,
      is_narration: isNarration,
      music: musicCell ? musicCell.textContent.trim() : '',
      image: imageCell ? imageCell.textContent.trim() : '',
      video: videoCell ? videoCell.textContent.trim() : '',
      timestamp: new Date().toISOString()
    };

    timelineData.push(rowData);
  });

  return timelineData;
}

// 로컬 스토리지에 타임라인 상태 자동 저장
function saveTimelineToLocalStorage() {
  try {
    const timelineData = collectTimelineData();
    const currentProject = window.currentProject;

    if (currentProject && timelineData.length > 0) {
      const storageKey = `timeline_autosave_${currentProject.id}`;
      const saveData = {
        projectId: currentProject.id,
        timelineData: timelineData,
        timestamp: new Date().toISOString(),
        lastModified: Date.now()
      };

      localStorage.setItem(storageKey, JSON.stringify(saveData));
      console.log('타임라인 자동 저장 완료:', new Date().toLocaleTimeString());
    }
  } catch (error) {
    console.error('로컬 스토리지 저장 실패:', error);
  }
}

// 로컬 스토리지에서 타임라인 상태 복원
function loadTimelineFromLocalStorage() {
  try {
    const currentProject = window.currentProject;
    if (!currentProject) return false;

    const storageKey = `timeline_autosave_${currentProject.id}`;
    const savedData = localStorage.getItem(storageKey);

    if (!savedData) return false;

    const parsedData = JSON.parse(savedData);

    // 5분 이내 저장된 데이터만 복원 (너무 오래된 데이터는 복원하지 않음)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    if (parsedData.lastModified < fiveMinutesAgo) {
      return false;
    }

    // 타임라인 복원
    restoreTimelineState(parsedData.timelineData);

    showNotification('이전 편집 내용이 복원되었습니다. ✨', 'info');
    return true;
  } catch (error) {
    console.error('로컬 스토리지 복원 실패:', error);
    return false;
  }
}

// 타임라인 상태 복원 함수
function restoreTimelineState(timelineData) {
  timelineData.forEach(item => {
    const row = document.querySelector(`tr[data-row-index="${item.index}"]`);
    if (!row) return;

    // 자막 텍스트 복원 (>> 접두사 제거)
    const subtitleElement = row.querySelector('.subtitle-text');
    if (subtitleElement) {
      const originalText = item.subtitle.startsWith('>> ')
        ? item.subtitle.substring(3)
        : item.subtitle;
      subtitleElement.textContent = originalText;
    }

    // 해설 체크박스 상태 복원
    const narrationCheckbox = row.querySelector('.narration-checkbox');
    if (narrationCheckbox) {
      narrationCheckbox.checked = item.is_narration;

      // 해설 스타일 적용
      if (item.is_narration) {
        subtitleElement?.classList.add('narration');
      } else {
        subtitleElement?.classList.remove('narration');
      }
    }
  });
}

// 타임라인 버튼 이벤트 리스너 설정
function setupTimelineButtons() {
  console.log('타임라인 버튼 설정 시작...');

  // 전체 재생 버튼 이벤트 리스너 추가
  const playAllButton = document.getElementById('play-all-audio');
  if (playAllButton) {
    playAllButton.addEventListener('click', playAllAudioClips);
    console.log('전체 재생 버튼 연결됨');
  } else {
    console.warn('전체 재생 버튼을 찾을 수 없음');
  }

  // 전체 저장 버튼 이벤트 리스너 추가
  const saveAllButton = document.getElementById('save-all-timeline');
  if (saveAllButton) {
    saveAllButton.addEventListener('click', saveAllTimelineChanges);
    console.log('전체 저장 버튼 연결됨');
  } else {
    console.warn('전체 저장 버튼을 찾을 수 없음');
  }

  // 다른 이름으로 저장 버튼 이벤트 리스너 추가
  const saveAsButton = document.getElementById('save-as-timeline');
  if (saveAsButton) {
    saveAsButton.addEventListener('click', saveAsTimeline);
    console.log('다른 이름 저장 버튼 연결됨');
  } else {
    console.warn('다른 이름 저장 버튼을 찾을 수 없음');
  }

  // 불러오기 버튼 이벤트 리스너 추가
  const loadButton = document.getElementById('load-timeline');
  if (loadButton) {
    loadButton.addEventListener('click', loadTimeline);
    console.log('불러오기 버튼 연결됨');
  } else {
    console.warn('불러오기 버튼을 찾을 수 없음');
  }

  // 삭제 버튼 이벤트 리스너 추가
  const deleteButton = document.getElementById('delete-timeline');
  if (deleteButton) {
    deleteButton.addEventListener('click', deleteTimeline);
    console.log('삭제 버튼 연결됨');
  } else {
    console.warn('삭제 버튼을 찾을 수 없음');
  }

  // 전체 AI 변환 버튼들 이벤트 리스너 추가
  const bulkReinterpretAllButton = document.getElementById('bulk-reinterpret-all');
  if (bulkReinterpretAllButton) {
    bulkReinterpretAllButton.addEventListener('click', () => startBulkAIConversion('reinterpret'));
    console.log('전체 재해석 버튼 연결됨');
  }

  const bulkTranslateJpAllButton = document.getElementById('bulk-translate-jp-all');
  if (bulkTranslateJpAllButton) {
    bulkTranslateJpAllButton.addEventListener('click', () => startBulkAIConversion('translate-jp'));
    console.log('전체 일본어 버튼 연결됨');
  }

  const bulkBacktranslateKrAllButton = document.getElementById('bulk-backtranslate-kr-all');
  if (bulkBacktranslateKrAllButton) {
    bulkBacktranslateKrAllButton.addEventListener('click', () => startBulkAIConversion('backtranslate-kr'));
    console.log('전체 역번역 버튼 연결됨');
  }

  const bulkTtsAllButton = document.getElementById('bulk-tts-all');
  if (bulkTtsAllButton) {
    bulkTtsAllButton.addEventListener('click', () => startBulkAIConversion('tts'));
    console.log('전체 음성 버튼 연결됨');
  }

  console.log('타임라인 버튼 설정 완료');

  // AI 버튼들도 함께 설정
  setupAIButtons();
}

// AI 버튼 이벤트 리스너 설정
function setupAIButtons() {
  console.log('AI 버튼 설정 시작...');

  // 이벤트 위임을 사용하여 동적으로 생성된 버튼들에도 이벤트 적용
  document.addEventListener('click', function(e) {
    const target = e.target;

    if (target.classList.contains('reinterpret-btn')) {
      e.preventDefault();
      const rowIndex = target.dataset.rowIndex;
      reinterpretText(rowIndex, target);
    } else if (target.classList.contains('translate-jp-btn')) {
      e.preventDefault();
      const rowIndex = target.dataset.rowIndex;
      translateToJapanese(rowIndex, target);
    } else if (target.classList.contains('backtranslate-kr-btn')) {
      e.preventDefault();
      const rowIndex = target.dataset.rowIndex;
      backTranslateToKorean(rowIndex, target);
    }
  });

  console.log('AI 버튼 설정 완료');

  // 전체 AI 변환 기능도 설정
  setupBulkAIFeature();
}

// 전체 AI 변환 기능 설정
function setupBulkAIFeature() {
  console.log('전체 AI 변환 기능 설정 시작...');

  // 요소들이 없으면 나중에 다시 시도
  setTimeout(() => {
    const bulkAiType = document.getElementById('bulk-ai-type');
    const bulkAiStart = document.getElementById('bulk-ai-start');
    const bulkAiCancel = document.getElementById('bulk-ai-cancel');

    console.log('전체 AI 변환 요소 확인:', {
      bulkAiType: !!bulkAiType,
      bulkAiStart: !!bulkAiStart,
      bulkAiCancel: !!bulkAiCancel
    });

    if (!bulkAiType || !bulkAiStart || !bulkAiCancel) {
      console.warn('전체 AI 변환 요소들을 찾을 수 없음 - DOM이 아직 준비되지 않음');
      return;
    }

    // 변환 유형 선택 시 미리보기 표시
    bulkAiType.addEventListener('change', function() {
      const selectedType = this.value;
      console.log('변환 유형 선택됨:', selectedType);

      if (selectedType) {
        updateBulkAIPreview();
        bulkAiStart.disabled = false;
        const bulkAiPreview = document.getElementById('bulk-ai-preview');
        if (bulkAiPreview) {
          bulkAiPreview.style.display = 'block';
        }
      } else {
        bulkAiStart.disabled = true;
        const bulkAiPreview = document.getElementById('bulk-ai-preview');
        if (bulkAiPreview) {
          bulkAiPreview.style.display = 'none';
        }
      }
    });

    // 전체 변환 시작 버튼
    bulkAiStart.addEventListener('click', function() {
      const selectedType = bulkAiType.value;
      console.log('전체 변환 시작 클릭:', selectedType);
      if (selectedType) {
        startBulkAIConversion(selectedType);
      }
    });

    // 변환 중단 버튼
    bulkAiCancel.addEventListener('click', function() {
      console.log('변환 중단 클릭');
      cancelBulkAIConversion();
    });

    console.log('전체 AI 변환 기능 설정 완료');
  }, 3000); // 3초 후에 설정
}

// 해설 부분 대상 항목 수집
function getNarrationTargets() {
  const targets = [];
  const rows = document.querySelectorAll('tr[data-row-index]');

  console.log(`전체 행 개수: ${rows.length}`);

  rows.forEach(row => {
    const rowIndex = parseInt(row.dataset.rowIndex);
    const narrationCheckbox = row.querySelector('.narration-checkbox');
    const subtitleElement = row.querySelector('.subtitle-text');

    if (narrationCheckbox && narrationCheckbox.checked && subtitleElement) {
      const text = subtitleElement.textContent.trim();
      if (text) {
        targets.push({
          rowIndex: rowIndex,
          element: subtitleElement,
          originalText: text,
          row: row
        });
        console.log(`해설 대상 추가: 행 ${rowIndex}, 텍스트: ${text.substring(0, 50)}...`);
      }
    }
  });

  console.log(`해설 대상 총 개수: ${targets.length}`);
  return targets;
}

// 전체 AI 변환 미리보기 업데이트
function updateBulkAIPreview() {
  console.log('미리보기 업데이트 시작');
  const targets = getNarrationTargets();
  const previewList = document.getElementById('bulk-ai-preview-list');

  if (!previewList) {
    console.warn('미리보기 리스트 요소를 찾을 수 없음');
    return;
  }

  if (targets.length === 0) {
    previewList.innerHTML = '<p style="color: #666; text-align: center;">해설로 체크된 항목이 없습니다.</p>';
    console.log('해설 대상 없음');
    return;
  }

  const html = targets.map((target, index) => `
    <div style="padding: 0.5rem; border-bottom: 1px solid #eee; ${index === targets.length - 1 ? 'border-bottom: none;' : ''}">
      <div style="font-weight: 500; margin-bottom: 0.25rem;">행 ${target.rowIndex + 1}</div>
      <div style="color: #666; font-size: 0.9rem;">${target.originalText.length > 100 ? target.originalText.substring(0, 100) + '...' : target.originalText}</div>
    </div>
  `).join('');

  previewList.innerHTML = `
    <div style="margin-bottom: 1rem; font-weight: 500; color: #333;">
      총 ${targets.length}개 항목이 변환됩니다.
    </div>
    ${html}
  `;

  console.log('미리보기 업데이트 완료:', targets.length, '개 항목');
}

// 전체 AI 변환 상태 변수
let bulkAIConversionState = {
  isRunning: false,
  shouldCancel: false,
  currentIndex: 0,
  totalCount: 0,
  targets: [],
  type: ''
};

// 전체 AI 변환 시작
async function startBulkAIConversion(type) {
  console.log(`전체 AI 변환 시작: ${type}`);

  const targets = getNarrationTargets();

  if (targets.length === 0) {
    showNotification('해설로 체크된 항목이 없습니다. 먼저 해설 체크박스를 선택해주세요.', 'error');
    return;
  }

  console.log(`변환할 대상: ${targets.length}개`);

  // 사용자 확인
  if (!confirm(`${targets.length}개의 해설 항목을 ${type}로 변환하시겠습니까?`)) {
    return;
  }

  // 상태 초기화
  bulkAIConversionState = {
    isRunning: true,
    shouldCancel: false,
    currentIndex: 0,
    totalCount: targets.length,
    targets: targets,
    type: type
  };

  // UI 상태 업데이트
  updateBulkAIUI(true);

  // 변환 진행률 표시 시작
  updateBulkAIProgress(0, targets.length, '변환 준비 중...');

  try {
    for (let i = 0; i < targets.length; i++) {
      if (bulkAIConversionState.shouldCancel) {
        showNotification('변환이 사용자에 의해 중단되었습니다.', 'info');
        break;
      }

      bulkAIConversionState.currentIndex = i;
      const target = targets[i];

      updateBulkAIProgress(i + 1, targets.length, `${i + 1}번째 항목 변환 중...`);

      await processBulkAITarget(target, type);

      // 각 변환 후 잠시 대기 (API 제한 고려)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!bulkAIConversionState.shouldCancel) {
      showNotification(`${targets.length}개 항목의 전체 변환이 완료되었습니다.`, 'success');

      // 자동 저장
      saveTimelineToLocalStorage();
    }

  } catch (error) {
    console.error('전체 AI 변환 오류:', error);
    showNotification(`전체 변환 중 오류 발생: ${error.message}`, 'error');
  } finally {
    // 상태 초기화
    bulkAIConversionState.isRunning = false;
    updateBulkAIUI(false);
  }
}

// 개별 타겟 처리
async function processBulkAITarget(target, type) {
  try {
    let apiEndpoint = '';
    let requestBody = {};

    switch (type) {
      case 'reinterpret':
        apiEndpoint = '/api/ai/reinterpret';
        requestBody = {
          text: target.originalText,
          context: 'subtitle_reinterpretation'
        };
        break;
      case 'translate-jp':
        apiEndpoint = '/api/ai/translate-jp';
        requestBody = {
          text: target.originalText,
          sourceLanguage: 'ko',
          targetLanguage: 'ja'
        };
        break;
      case 'backtranslate-kr':
        apiEndpoint = '/api/ai/backtranslate-kr';
        requestBody = {
          text: target.originalText,
          sourceLanguage: 'ja',
          targetLanguage: 'ko'
        };
        break;
      case 'tts':
        // TTS는 기존 함수 재사용
        await convertTextToSpeech(target.rowIndex);
        return;
      default:
        throw new Error(`알 수 없는 변환 타입: ${type}`);
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const result = await response.json();

    let resultText = '';
    if (type === 'reinterpret' && result.reinterpretedText) {
      resultText = result.reinterpretedText;
    } else if ((type === 'translate-jp' || type === 'backtranslate-kr') && result.translatedText) {
      resultText = result.translatedText;
    } else {
      throw new Error('변환 결과가 없습니다.');
    }

    // UI 업데이트
    target.element.textContent = resultText;

  } catch (error) {
    console.error(`타겟 ${target.rowIndex} 변환 오류:`, error);
    throw error;
  }
}

// 전체 AI 변환 중단
function cancelBulkAIConversion() {
  if (bulkAIConversionState.isRunning) {
    bulkAIConversionState.shouldCancel = true;
    console.log('전체 AI 변환 중단 요청');
  }
}

// 전체 AI 변환 진행률 업데이트
function updateBulkAIProgress(current, total, status) {
  const progressElement = document.getElementById('bulk-ai-progress');
  const statusElement = document.getElementById('bulk-ai-status');
  const countElement = document.getElementById('bulk-ai-count');
  const progressBarElement = document.getElementById('bulk-ai-progress-bar');

  if (progressElement && statusElement && countElement && progressBarElement) {
    progressElement.style.display = bulkAIConversionState.isRunning ? 'block' : 'none';
    statusElement.textContent = status;
    countElement.textContent = `${current} / ${total}`;

    const percentage = total > 0 ? (current / total) * 100 : 0;
    progressBarElement.style.width = `${percentage}%`;
  }
}

// 전체 AI 변환 UI 상태 업데이트
function updateBulkAIUI(isRunning) {
  const bulkAiType = document.getElementById('bulk-ai-type');
  const bulkAiStart = document.getElementById('bulk-ai-start');
  const bulkAiCancel = document.getElementById('bulk-ai-cancel');

  if (bulkAiType && bulkAiStart && bulkAiCancel) {
    bulkAiType.disabled = isRunning;
    bulkAiStart.disabled = isRunning;
    bulkAiCancel.disabled = !isRunning;
  }

  if (!isRunning) {
    // 진행률 숨기기
    setTimeout(() => {
      const progressElement = document.getElementById('bulk-ai-progress');
      if (progressElement) {
        progressElement.style.display = 'none';
      }
    }, 2000);
  }
}

// 재해석 AI 함수
async function reinterpretText(rowIndex, button) {
  console.log(`재해석 AI 실행: 행 ${rowIndex}`);

  const row = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
  if (!row) return;

  const subtitleElement = row.querySelector('.subtitle-text');
  const originalText = subtitleElement ? subtitleElement.textContent.trim() : '';

  if (!originalText) {
    showNotification('재해석할 텍스트가 없습니다.', 'error');
    return;
  }

  // 버튼 로딩 상태
  button.classList.add('loading');
  button.disabled = true;

  try {
    const response = await fetch('/api/ai/reinterpret', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: originalText,
        context: 'subtitle_reinterpretation'
      }),
    });

    if (!response.ok) {
      throw new Error(`재해석 실패: ${response.status}`);
    }

    const result = await response.json();

    if (result.reinterpretedText) {
      subtitleElement.textContent = result.reinterpretedText;
      showNotification('텍스트가 재해석되었습니다.', 'success');

      // 자동 저장 트리거
      saveTimelineToLocalStorage();
    } else {
      throw new Error('재해석 결과가 없습니다.');
    }

  } catch (error) {
    console.error('재해석 오류:', error);
    showNotification(`재해석 실패: ${error.message}`, 'error');
  } finally {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// 일본어 번역 AI 함수
async function translateToJapanese(rowIndex, button) {
  console.log(`일본어 번역 AI 실행: 행 ${rowIndex}`);

  const row = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
  if (!row) return;

  const subtitleElement = row.querySelector('.subtitle-text');
  const originalText = subtitleElement ? subtitleElement.textContent.trim() : '';

  if (!originalText) {
    showNotification('번역할 텍스트가 없습니다.', 'error');
    return;
  }

  // 버튼 로딩 상태
  button.classList.add('loading');
  button.disabled = true;

  try {
    const response = await fetch('/api/ai/translate-jp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: originalText,
        sourceLanguage: 'ko',
        targetLanguage: 'ja'
      }),
    });

    if (!response.ok) {
      throw new Error(`일본어 번역 실패: ${response.status}`);
    }

    const result = await response.json();

    if (result.translatedText) {
      subtitleElement.textContent = result.translatedText;
      showNotification('일본어로 번역되었습니다.', 'success');

      // 자동 저장 트리거
      saveTimelineToLocalStorage();
    } else {
      throw new Error('번역 결과가 없습니다.');
    }

  } catch (error) {
    console.error('일본어 번역 오류:', error);
    showNotification(`일본어 번역 실패: ${error.message}`, 'error');
  } finally {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// 역번역 한국어 AI 함수
async function backTranslateToKorean(rowIndex, button) {
  console.log(`역번역 한국어 AI 실행: 행 ${rowIndex}`);

  const row = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
  if (!row) return;

  const subtitleElement = row.querySelector('.subtitle-text');
  const originalText = subtitleElement ? subtitleElement.textContent.trim() : '';

  if (!originalText) {
    showNotification('역번역할 텍스트가 없습니다.', 'error');
    return;
  }

  // 버튼 로딩 상태
  button.classList.add('loading');
  button.disabled = true;

  try {
    const response = await fetch('/api/ai/backtranslate-kr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: originalText,
        sourceLanguage: 'ja',
        targetLanguage: 'ko'
      }),
    });

    if (!response.ok) {
      throw new Error(`역번역 실패: ${response.status}`);
    }

    const result = await response.json();

    if (result.translatedText) {
      subtitleElement.textContent = result.translatedText;
      showNotification('한국어로 역번역되었습니다.', 'success');

      // 자동 저장 트리거
      saveTimelineToLocalStorage();
    } else {
      throw new Error('역번역 결과가 없습니다.');
    }

  } catch (error) {
    console.error('역번역 오류:', error);
    showNotification(`역번역 실패: ${error.message}`, 'error');
  } finally {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// 자동 저장 이벤트 리스너 설정
function setupAutoSave() {
  // 입력 변경 시 자동 저장 (디바운스 적용)
  let autoSaveTimeout;
  const debouncedAutoSave = () => {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      saveTimelineToLocalStorage();
      // 상태 표시 (선택사항)
      const saveIndicator = document.getElementById('autosave-indicator');
      if (saveIndicator) {
        saveIndicator.textContent = '🟢 자동저장됨';
        setTimeout(() => {
          saveIndicator.textContent = '';
        }, 2000);
      }
    }, 2000); // 2초 후 저장
  };

  // 타임라인 테이블 변경 감지
  const timelineContainer = document.querySelector('.timeline-table-container');
  if (timelineContainer) {
    timelineContainer.addEventListener('input', debouncedAutoSave);
    timelineContainer.addEventListener('change', debouncedAutoSave);
  }

  // 페이지 종료 전 자동 저장
  window.addEventListener('beforeunload', () => {
    saveTimelineToLocalStorage();
  });

  // 주기적 자동 저장 (30초마다)
  setInterval(saveTimelineToLocalStorage, 30000);
}

// 통합 알림 메시지 표시 함수
function showNotification(message, type = 'info') {
  // 기존 알림 제거
  const existingNotification = document.querySelector('.timeline-notification, .notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  // 새 알림 생성
  const notification = document.createElement('div');

  // 타임라인 섹션이 있으면 타임라인용 스타일, 없으면 일반 스타일
  const timelineSection = document.querySelector('.timeline-section');

  if (timelineSection) {
    // 타임라인 알림 스타일 (CSS 클래스 사용)
    notification.className = `timeline-notification notification-${type}`;
    notification.textContent = message;
    timelineSection.insertBefore(notification, timelineSection.firstChild);
  } else {
    // 일반 알림 스타일 (fixed position)
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
      color: white;
      border-radius: 4px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
  }

  // 3초 후 자동 제거
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

// 체크박스 상태 변경 시 자막 스타일 업데이트
function setupNarrationCheckboxListeners() {
  const checkboxes = document.querySelectorAll('.narration-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const rowIndex = parseInt(this.dataset.row);
      const isChecked = this.checked;

      // 체크박스 아이콘 업데이트
      const icon = this.nextElementSibling.querySelector('.checkbox-icon');
      if (icon) {
        icon.textContent = isChecked ? '🗣️' : '💬';
      }

      // 자막 스타일 업데이트
      const subtitleText = document.querySelector(`tr[data-row-index="${rowIndex}"] .subtitle-text`);
      if (subtitleText) {
        if (isChecked) {
          subtitleText.classList.add('narration');
        } else {
          subtitleText.classList.remove('narration');
        }
      }

      // 서버에 상태 저장 (나중에 구현)
      // updateNarrationStatus(rowIndex, isChecked);
    });
  });
}

// 타임라인 테이블 편집 기능들
function enableRowEdit(rowIndex) {
  const rows = document.querySelectorAll(`tr[data-row-index="${rowIndex}"]`);
  if (rows.length === 0) return;

  rows.forEach(row => {
    const editableCells = row.querySelectorAll('td[data-field]');
    editableCells.forEach(cell => {
      const field = cell.dataset.field;
      const currentText = cell.textContent.trim();

      if (field === 'subtitle') {
        // 자막 셀의 경우 TTS 버튼을 고려해서 텍스트만 추출
        const subtitleText = cell.querySelector('.subtitle-text');
        const actualText = subtitleText ? subtitleText.textContent.trim() : currentText;
        cell.innerHTML = `<input type="text" class="inline-edit" value="${escapeHtml(actualText)}" />`;
      } else if (field === 'voice') {
        cell.innerHTML = `<input type="text" class="inline-edit" value="${escapeHtml(currentText)}" />`;
      } else if (field === 'music' || field === 'image' || field === 'video') {
        cell.innerHTML = `<textarea class="inline-edit" rows="2">${escapeHtml(currentText)}</textarea>`;
      }
    });

    // 버튼 상태 변경
    const editBtn = row.querySelector('.edit-row');
    const saveBtn = row.querySelector('.save-row');
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'inline-block';
  });
}

function saveTimelineRow(rowIndex) {
  const rows = document.querySelectorAll(`tr[data-row-index="${rowIndex}"]`);
  if (rows.length === 0) return;

  const updatedData = {};

  rows.forEach(row => {
    const editableCells = row.querySelectorAll('td[data-field]');
    editableCells.forEach(cell => {
      const field = cell.dataset.field;
      const input = cell.querySelector('.inline-edit');
      if (input) {
        updatedData[field] = input.value.trim();

        if (field === 'subtitle') {
          // 자막 필드는 TTS 버튼과 함께 복원
          cell.innerHTML = `
            <div class="subtitle-with-tts">
              <span class="subtitle-text">${escapeHtml(input.value.trim())}</span>
              <button type="button" class="tts-btn secondary small" data-subtitle-index="${rowIndex}" title="음성 변환">🎤</button>
            </div>
          `;
        } else {
          cell.textContent = input.value.trim();
        }
      }
    });

    // 버튼 상태 복원
    const editBtn = row.querySelector('.edit-row');
    const saveBtn = row.querySelector('.save-row');
    if (editBtn) editBtn.style.display = 'inline-block';
    if (saveBtn) saveBtn.style.display = 'none';
  });

  // TTS 버튼 이벤트 다시 바인딩
  if (state.project && updatedData.subtitle) {
    bindTTSHandlers(state.project);
  }

  // 실제 데이터 업데이트 (여기서는 메모리에만)
  console.log(`Row ${rowIndex} updated:`, updatedData);

  // 성공 메시지
  showNotification('타임라인이 수정되었습니다.', 'success');
}

function deleteTimelineRow(rowIndex) {
  if (!confirm('이 타임라인 항목을 삭제하시겠습니까?')) return;

  const rows = document.querySelectorAll(`tr[data-row-index="${rowIndex}"]`);
  rows.forEach(row => row.remove());

  // 실제 데이터에서도 제거 (여기서는 메모리에만)
  console.log(`Row ${rowIndex} deleted`);

  showNotification('타임라인 항목이 삭제되었습니다.', 'info');
}


// ---------------------------------------------------------------------------
// Video Import functionality
// ---------------------------------------------------------------------------

let downloadData = [];
let downloadRequestInFlight = null;

async function requestDownloadList() {
  if (downloadRequestInFlight) {
    try {
      return await downloadRequestInFlight;
    } catch (error) {
      // previous failure should not permanently reject; fall through to retry
    }
  }
  downloadRequestInFlight = fetch("/api/downloads")
    .then(async (response) => {
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "다운로드 목록을 불러오지 못했습니다.");
      }
      return response.json();
    })
    .finally(() => {
      downloadRequestInFlight = null;
    });
  const payload = await downloadRequestInFlight;
  return Array.isArray(payload?.files) ? payload.files : [];
}

async function ensureDownloadData(force = false) {
  if (!force && downloadData.length) {
    return downloadData;
  }
  try {
    const files = await requestDownloadList();
    downloadData = files;
    return downloadData;
  } catch (error) {
    console.error("Failed to load download metadata:", error);
    showNotification(error.message || "다운로드 파일 정보를 불러오지 못했습니다.", "error");
    return [];
  }
}

async function fetchDownloadList() {
  try {
    const files = await requestDownloadList();
    downloadData = files;
    renderDownloadList();
    updateSelectedFileDropdown();

    showNotification(`${downloadData.length}개의 파일을 찾았습니다.`, 'success');
  } catch (error) {
    console.error('Error fetching downloads:', error);
    showNotification('다운로드 목록을 불러오는데 실패했습니다.', 'error');
  }
}

function renderDownloadList() {
  const container = document.getElementById('download-list');
  if (!container) return;

  if (!downloadData.length) {
    container.innerHTML = '<div class="placeholder"><p>다운로드된 파일이 없습니다.</p></div>';
    return;
  }

  const html = downloadData.map(file => `
    <div class="download-item" data-file-id="${file.id}">
      <div class="download-info">
        <h4>${file.title}</h4>
        <div class="file-details">
          <span class="subtitle-info">자막: ${file.subtitle_file.split('/').pop()}</span>
          <span class="video-info">영상: ${file.has_video ? file.video_files.length + '개' : '없음'}</span>
          <span class="size-info">크기: ${(file.size / 1024).toFixed(1)}KB</span>
        </div>
      </div>
      <div class="download-actions">
        <button type="button" class="select-file-btn" data-file-id="${file.id}">선택</button>
      </div>
    </div>
  `).join('');

  container.innerHTML = html;

  // 이벤트 리스너 추가
  container.addEventListener('click', handleDownloadItemClick);
}

function handleDownloadItemClick(event) {
  const selectBtn = event.target.closest('.select-file-btn');
  if (selectBtn) {
    const fileId = selectBtn.dataset.fileId;
    selectDownloadFile(fileId);
  }
}

function selectDownloadFile(fileId) {
  // 기존 선택 해제
  document.querySelectorAll('.download-item').forEach(item => {
    item.classList.remove('selected');
  });

  // 새 선택
  const selectedItem = document.querySelector(`[data-file-id="${fileId}"]`);
  if (selectedItem) {
    selectedItem.classList.add('selected');
  }

  // 드롭다운 업데이트
  const selectedFileSelect = document.getElementById('selected-file');
  if (selectedFileSelect) {
    selectedFileSelect.value = fileId;
    selectedFileSelect.disabled = false;
  }
}

function updateSelectedFileDropdown() {
  const selectedFileSelect = document.getElementById('selected-file');
  if (!selectedFileSelect) return;

  selectedFileSelect.innerHTML = '<option value="">파일을 선택하세요</option>';

  downloadData.forEach(file => {
    const option = document.createElement('option');
    option.value = file.id;
    option.textContent = file.title;
    selectedFileSelect.appendChild(option);
  });

  if (downloadData.length > 0) {
    selectedFileSelect.disabled = false;
  }
}

async function importVideo(formData) {
  try {
    const response = await fetch('/api/import-video', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      renderImportResult(result);
      showNotification(result.message, 'success');

      // 저장 버튼 활성화
      const saveBtn = document.getElementById('save-video-import-btn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.onclick = () => saveVideoImportResult(result);
      }
    } else {
      throw new Error(result.message || 'Import failed');
    }
  } catch (error) {
    console.error('Error importing video:', error);
    showNotification('영상 가져오기에 실패했습니다: ' + error.message, 'error');
  }
}

function renderImportResult(result) {
  const container = document.getElementById('video-import-result');
  if (!container) return;

  // Handle the direct API response structure
  const subtitles = result.subtitles || [];
  const subtitleCount = result.subtitle_count || 0;
  const videoCount = result.video_count || 0;

  const html = `
    <div class="import-success">
      <h4>✅ 가져오기 완료</h4>
      <div class="import-details">
        <p><strong>메시지:</strong> ${result.message}</p>
        <p><strong>자막 개수:</strong> ${subtitleCount}개</p>
        <p><strong>영상 파일:</strong> ${videoCount}개</p>
        <p><strong>가져온 시간:</strong> ${new Date().toLocaleString()}</p>
      </div>
      <div class="subtitle-preview">
        <h5>자막 미리보기 (처음 3개)</h5>
        <div class="subtitle-list">
          ${subtitles.slice(0, 3).map(sub => `
            <div class="subtitle-item">
              <span class="time">${sub.start_time} → ${sub.end_time}</span>
              <span class="text">${sub.text}</span>
            </div>
          `).join('')}
          ${subtitles.length > 3 ? `<p>... 외 ${subtitles.length - 3}개</p>` : ''}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// 현재 선택된 파일명 저장 변수
let currentSelectedFileName = '';

// 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', function() {
  // 다운로드 목록 새로고침 버튼
  const fetchBtn = document.getElementById('fetch-downloads');
  if (fetchBtn) {
    fetchBtn.addEventListener('click', fetchDownloadList);
  }

  // 영상 가져오기 폼
  const importForm = document.getElementById('video-import-form');
  if (importForm) {
    importForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const formData = new FormData(this);
      const fileId = formData.get('selected_file');

      if (!fileId) {
        showNotification('파일을 선택해주세요.', 'error');
        return;
      }

      await importVideo(formData);
    });
  }

  // 선택된 파일 드롭다운 변경 이벤트
  const selectedFileSelect = document.getElementById('selected-file');
  if (selectedFileSelect) {
    selectedFileSelect.addEventListener('change', function() {
      const fileId = this.value;
      if (fileId) {
        // 선택된 파일명 저장 (option의 텍스트에서 가져오기)
        const selectedOption = this.options[this.selectedIndex];
        currentSelectedFileName = selectedOption.text || fileId;
        selectDownloadFile(fileId);
      }
    });
  }

  // 저장된 비디오 가져오기 목록 로드
  loadVideoImportRecords();
});

// 비디오 가져오기 결과 저장
async function saveVideoImportResult(result) {
  const defaultTitle = currentSelectedFileName || `가져온 영상 ${new Date().toLocaleDateString()}`;
  const title = prompt('저장할 제목을 입력하세요:', defaultTitle);
  if (!title) return;

  try {
    const payload = {
      subtitle_count: result.subtitle_count,
      video_count: result.video_count,
      subtitles: result.subtitles,
      message: result.message
    };

    const response = await fetch('/api/tools/video_import/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, payload })
    });

    if (response.ok) {
      showNotification(`"${title}" 저장되었습니다.`, 'success');
      loadVideoImportRecords();

      // 저장 버튼 비활성화
      const saveBtn = document.getElementById('save-video-import-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
      }
    } else {
      throw new Error('저장에 실패했습니다.');
    }
  } catch (error) {
    console.error('Error saving video import result:', error);
    showNotification('저장에 실패했습니다: ' + error.message, 'error');
  }
}

// 저장된 비디오 가져오기 기록 로드
async function loadVideoImportRecords() {
  try {
    const response = await fetch('/api/tools/video_import/records');
    const records = await response.json();
    renderVideoImportRecords(records);
  } catch (error) {
    console.error('Error loading video import records:', error);
  }
}

// 저장된 비디오 가져오기 기록 렌더링
function renderVideoImportRecords(records) {
  const container = document.getElementById('video-import-saved-body');
  if (!container) return;

  if (!records || records.length === 0) {
    container.innerHTML = '<div class="placeholder"><p>가져온 영상이 없습니다.</p></div>';
    return;
  }

  const html = records.map(record => `
    <div class="saved-item">
      <input type="checkbox" id="video-import-${record.id}" />
      <label for="video-import-${record.id}" class="saved-item-label">
        <div class="saved-item-title">${record.title}</div>
        <div class="saved-item-meta">
          자막 ${record.payload.subtitle_count}개, 영상 ${record.payload.video_count}개 ·
          ${new Date(record.created_at).toLocaleString()}
        </div>
      </label>
      <div class="saved-item-actions">
        <button type="button" class="load-btn" data-record-id="${record.id}">불러오기</button>
        <button type="button" class="delete-btn" data-record-id="${record.id}">삭제</button>
      </div>
    </div>
  `).join('');

  container.innerHTML = html;

  // 이벤트 리스너 추가
  container.querySelectorAll('.load-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const recordId = btn.getAttribute('data-record-id');
      loadVideoImportRecord(recordId);
    });
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const recordId = btn.getAttribute('data-record-id');
      deleteVideoImportRecord(recordId);
    });
  });
}

// 저장된 비디오 가져오기 기록 불러오기
async function loadVideoImportRecord(recordId) {
  try {
    const response = await fetch(`/api/tools/video_import/records/${recordId}`);
    const record = await response.json();

    renderImportResult({
      subtitle_count: record.payload.subtitle_count,
      video_count: record.payload.video_count,
      subtitles: record.payload.subtitles,
      message: record.payload.message
    });

    showNotification(`"${record.title}" 불러왔습니다.`, 'success');
  } catch (error) {
    console.error('Error loading video import record:', error);
    showNotification('불러오기에 실패했습니다: ' + error.message, 'error');
  }
}

// 저장된 비디오 가져오기 기록 삭제
async function deleteVideoImportRecord(recordId) {
  if (!confirm('정말 삭제하시겠습니까?')) return;

  try {
    const response = await fetch(`/api/tools/video_import/records/${recordId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showNotification('삭제되었습니다.', 'success');
      loadVideoImportRecords();
    } else {
      throw new Error('삭제에 실패했습니다.');
    }
  } catch (error) {
    console.error('Error deleting video import record:', error);
    showNotification('삭제에 실패했습니다: ' + error.message, 'error');
  }
}

// ===== 갭 관리 함수들 =====

// 갭에 자막 추가
function addSubtitleToGap(gapIndex) {
  const [startIdx, endIdx] = gapIndex.split('_').slice(1).map(Number);
  const gapRow = document.querySelector(`[data-gap-index="${gapIndex}"]`);

  if (!gapRow || !currentProject || !currentProject.subtitles) {
    showNotification('갭 정보를 찾을 수 없습니다.', 'error');
    return;
  }

  // 갭의 시간 정보 가져오기
  const prevSubtitle = currentProject.subtitles[startIdx];
  const nextSubtitle = currentProject.subtitles[endIdx];

  if (!prevSubtitle || !nextSubtitle) {
    showNotification('타임스탬프 정보가 올바르지 않습니다.', 'error');
    return;
  }

  const startTime = parseFloat(prevSubtitle.end_time || prevSubtitle.end);
  const endTime = parseFloat(nextSubtitle.start_time || nextSubtitle.start);
  const midTime = (startTime + endTime) / 2;

  // 새 자막 객체 생성
  const newSubtitle = {
    start_time: startTime.toFixed(1),
    end_time: midTime.toFixed(1),
    text: "새 자막을 입력하세요",
    start: startTime,
    end: midTime
  };

  // 자막 배열에 삽입
  currentProject.subtitles.splice(endIdx, 0, newSubtitle);

  // 테이블 다시 렌더링
  const tableBody = document.querySelector('.timeline-table tbody');
  if (tableBody) {
    tableBody.innerHTML = renderTimelineTableRows(currentProject);
  }

  showNotification('새 자막이 추가되었습니다. 텍스트를 수정해주세요.', 'success');
}

// 갭 삭제 (인접한 자막의 시간을 연결)
function deleteGap(gapIndex) {
  if (!confirm('이 갭을 삭제하고 인접한 자막을 연결하시겠습니까?')) return;

  const [startIdx, endIdx] = gapIndex.split('_').slice(1).map(Number);

  if (!currentProject || !currentProject.subtitles) {
    showNotification('프로젝트 정보를 찾을 수 없습니다.', 'error');
    return;
  }

  const prevSubtitle = currentProject.subtitles[startIdx];
  const nextSubtitle = currentProject.subtitles[endIdx];

  if (!prevSubtitle || !nextSubtitle) {
    showNotification('자막 정보를 찾을 수 없습니다.', 'error');
    return;
  }

  // 이전 자막의 종료 시간을 다음 자막의 시작 시간으로 연장
  const nextStartTime = parseFloat(nextSubtitle.start_time || nextSubtitle.start);
  prevSubtitle.end_time = nextStartTime.toFixed(1);
  prevSubtitle.end = nextStartTime;

  // 테이블 다시 렌더링
  const tableBody = document.querySelector('.timeline-table tbody');
  if (tableBody) {
    tableBody.innerHTML = renderTimelineTableRows(currentProject);
  }

  showNotification('갭이 삭제되고 자막이 연결되었습니다.', 'success');
}

// 갭 길이 조정
function trimGap(gapIndex) {
  const [startIdx, endIdx] = gapIndex.split('_').slice(1).map(Number);

  if (!currentProject || !currentProject.subtitles) {
    showNotification('프로젝트 정보를 찾을 수 없습니다.', 'error');
    return;
  }

  const prevSubtitle = currentProject.subtitles[startIdx];
  const nextSubtitle = currentProject.subtitles[endIdx];

  if (!prevSubtitle || !nextSubtitle) {
    showNotification('자막 정보를 찾을 수 없습니다.', 'error');
    return;
  }

  const startTime = parseFloat(prevSubtitle.end_time || prevSubtitle.end);
  const endTime = parseFloat(nextSubtitle.start_time || nextSubtitle.start);
  const currentGapDuration = endTime - startTime;

  // 간단한 프롬프트로 새 길이 입력받기
  const newDuration = prompt(`현재 갭 길이: ${currentGapDuration.toFixed(1)}초\n새로운 갭 길이를 입력하세요 (초):`, Math.max(0.1, currentGapDuration / 2).toFixed(1));

  if (newDuration === null) return; // 취소

  const duration = parseFloat(newDuration);
  if (isNaN(duration) || duration < 0.1) {
    showNotification('올바른 시간을 입력해주세요 (최소 0.1초)', 'error');
    return;
  }

  if (duration >= currentGapDuration) {
    showNotification('새 길이는 현재 갭 길이보다 작아야 합니다.', 'error');
    return;
  }

  // 갭 길이 조정 (중앙에서 줄이기)
  const reductionTime = (currentGapDuration - duration) / 2;
  const newPrevEndTime = startTime + reductionTime;
  const newNextStartTime = endTime - reductionTime;

  // 자막 시간 업데이트
  prevSubtitle.end_time = newPrevEndTime.toFixed(1);
  prevSubtitle.end = newPrevEndTime;
  nextSubtitle.start_time = newNextStartTime.toFixed(1);
  nextSubtitle.start = newNextStartTime;

  // 테이블 다시 렌더링
  const tableBody = document.querySelector('.timeline-table tbody');
  if (tableBody) {
    tableBody.innerHTML = renderTimelineTableRows(currentProject);
  }

  showNotification(`갭 길이가 ${duration}초로 조정되었습니다.`, 'success');
}
