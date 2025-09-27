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

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
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
    const match = line.match(/^(\d+)\.?\s*(.+)/);
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
  // 이미지 결과도 동일한 파싱 로직 사용
  return parseChatGPTResult(text);
}

function parseChatGPTShortsResult(text) {
  const subtitles = [];
  const images = [];

  // 먼저 [SRT 자막] 섹션 찾기 (여러 형태 지원)
  let srtText = "";
  const srtMatch1 = text.match(/\*\*\[SRT 자막\]\*\*([\s\S]*?)(?=\*\*\[이미지 장면 묘사\]\*\*|$)/);
  const srtMatch2 = text.match(/\[SRT 자막\]([\s\S]*?)(?=\[이미지 장면 묘사\]|$)/);

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
          const imageTagMatch = fullText.match(/\[이미지\s*(\d+)\]/);
          const cleanText = fullText.replace(/\[이미지\s*\d+\]/, '').trim();

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
  const imageMatch1 = text.match(/\*\*\[이미지 장면 묘사\]\*\*([\s\S]*?)$/);
  const imageMatch2 = text.match(/\[이미지 장면 묘사\]([\s\S]*?)$/);

  if (imageMatch1) {
    imageText = imageMatch1[1];
  } else if (imageMatch2) {
    imageText = imageMatch2[1];
  }

  if (imageText) {
    const imageLines = imageText.split('\n').filter(line => line.trim().match(/^\-?\s*\[이미지\s*\d+\]/));

    imageLines.forEach((line, idx) => {
      const match = line.match(/^\-?\s*\[이미지\s*(\d+)\]\s*(.+)/);
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

  return { subtitles, images };
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
      const title = escapeHtml(item.title ?? "");
      const description = escapeHtml(item.description ?? "");
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

  if (!subtitles.length && !images.length) {
    container.innerHTML = '<div class="placeholder"><p>생성된 결과가 없습니다. 다른 키워드를 시도해 보세요.</p></div>';
    return;
  }

  const subtitleMarkup = subtitles
    .map((segment) => {
      const index = typeof segment.index === "number" ? segment.index : "-";
      const start = formatTimecode(segment.start);
      const end = formatTimecode(segment.end);
      const text = escapeHtml(segment.text ?? "");
      const tag = escapeHtml(segment.scene_tag ?? "");
      return `
        <li>
          <header><strong>${index}</strong> <span>${start} → ${end}</span></header>
          <p>${text}</p>
          <small>${tag}</small>
        </li>
      `;
    })
    .join("");

  const imageMarkup = images
    .map((prompt, idx) => {
      const tag = escapeHtml(prompt.tag ?? `이미지 ${idx + 1}`);
      const description = escapeHtml(prompt.description ?? "");
      const start = prompt.start !== undefined && prompt.start !== null ? formatTimecode(prompt.start) : "-";
      const end = prompt.end !== undefined && prompt.end !== null ? formatTimecode(prompt.end) : "-";
      return `
        <li>
          <header><strong>${tag}</strong> <span>${start} → ${end}</span></header>
          <p>${description}</p>
          <div class="item-actions">
          </div>
        </li>
      `;
    })
    .join("");

  container.innerHTML = `
    <article>
      <header>
        <h3>쇼츠용 SRT 대본</h3>
        <p class="status">키워드: <strong>${escapeHtml(result.keyword ?? "")}</strong> · 언어: ${escapeHtml(result.language ?? "ko")}</p>
      </header>
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
  displayAudioResult(TOOL_KEYS.SCRIPT, state.audioResults[TOOL_KEYS.SCRIPT]);
}

function renderShortsSceneResults(result) {
  const container = document.getElementById("shorts-scenes-results");
  if (!container) return;

  const subtitles = Array.isArray(result?.subtitles) ? result.subtitles : [];
  const scenes = Array.isArray(result?.scenes) ? result.scenes : [];

  if (!subtitles.length && !scenes.length) {
    container.innerHTML = '<div class="placeholder"><p>생성된 결과가 없습니다. 다른 키워드를 시도해 보세요.</p></div>';
    return;
  }

  const subtitleMarkup = subtitles
    .map((segment) => {
      const index = typeof segment.index === "number" ? segment.index : "-";
      const start = formatTimecode(segment.start);
      const end = formatTimecode(segment.end);
      const text = escapeHtml(segment.text ?? "");
      const tag = escapeHtml(segment.scene_tag ?? "");
      return `
        <li>
          <header><strong>${index}</strong> <span>${start} → ${end}</span></header>
          <p>${text}</p>
          <small>${tag}</small>
        </li>
      `;
    })
    .join("");

  const sceneMarkup = scenes
    .map((scene, idx) => {
      const tag = escapeHtml(scene.scene_tag ?? `씬 ${idx + 1}`);
      const action = escapeHtml(scene.action ?? "");
      const camera = escapeHtml(scene.camera ?? "");
      const mood = escapeHtml(scene.mood ?? "");
      const start = scene.start !== undefined && scene.start !== null ? formatTimecode(scene.start) : "-";
      const end = scene.end !== undefined && scene.end !== null ? formatTimecode(scene.end) : "-";
      return `
        <li>
          <header><strong>${tag}</strong> <span>${start} → ${end}</span></header>
          <p>${action}</p>
          <small>카메라: ${camera} · 분위기: ${mood}</small>
          <div class="item-actions">
          </div>
        </li>
      `;
    })
    .join("");

  container.innerHTML = `
    <article>
      <header>
        <h3>쇼츠용 씬 대본</h3>
        <p class="status">키워드: <strong>${escapeHtml(result.keyword ?? "")}</strong> · 언어: ${escapeHtml(result.language ?? "ko")}</p>
      </header>
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
  displayAudioResult(TOOL_KEYS.SCENES, state.audioResults[TOOL_KEYS.SCENES]);
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
            if (tool === TOOL_KEYS.SCRIPT || tool === TOOL_KEYS.SCENES) {
              const keyword = saved.payload?.keyword;
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

async function continueGeneration(tool) {
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
    const current = state.latestResults[tool] || {};

    if (tool === TOOL_KEYS.SCRIPT) {
      current.subtitles = [...(current.subtitles || []), ...(fresh.subtitles || [])];
      current.images = [...(current.images || []), ...(fresh.images || [])];
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

    // ChatGPT 창 모드 처리
    if (mode === "chatgpt") {
      const languageMap = { ko: "한국어", en: "영어", ja: "일본어" };
      const langText = languageMap[language] || "한국어";

      const prompt = `입력받은 "${keyword}"라는 스토리 키워드를 바탕으로, 아래 기준에 따라 유튜브 Shorts용 60초 분량의 자막과 이미지 장면 묘사를 ${langText}로 생성하세요.

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
        if (!chatgptResult) {
          alert('ChatGPT 결과를 입력해주세요.');
          return;
        }

        // ChatGPT 결과를 파싱하여 표시
        console.log('원본 텍스트:', chatgptResult);
        const parsed = parseChatGPTShortsResult(chatgptResult);
        console.log('파싱 결과:', parsed);

        // 파싱이 실패한 경우 원본 텍스트를 표시
        if (parsed.subtitles.length === 0 && parsed.images.length === 0) {
          resultsContainer.innerHTML = `
            <article>
              <header>
                <h3>ChatGPT 결과 (원본)</h3>
                <p>키워드: <strong>${escapeHtml(keyword)}</strong></p>
              </header>
              <div style="white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 1rem; border-radius: 4px;">
                ${escapeHtml(chatgptResult)}
              </div>
            </article>
          `;
          return;
        }

        const data = {
          subtitles: parsed.subtitles,
          images: parsed.images,
          keyword: keyword,
          language: language
        };

        state.latestResults[TOOL_KEYS.SCRIPT] = data;
        renderShortsScriptResults(data);
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
      state.latestResults[TOOL_KEYS.SCRIPT] = data;
      state.activeRecords[TOOL_KEYS.SCRIPT] = null;
      state.audioResults[TOOL_KEYS.SCRIPT] = null;
      renderShortsScriptResults(data);
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

    // ChatGPT 창 모드 처리
    if (mode === "chatgpt") {
      const languageMap = { ko: "한국어", en: "영어", ja: "일본어" };
      const langText = languageMap[language] || "한국어";

      const prompt = `입력받은 "${keyword}"라는 스토리 키워드를 바탕으로, 아래 기준에 따라 유튜브 Shorts용 60초 분량의 영상 장면 대본과 카메라/촬영 지시사항을 ${langText}로 생성하세요.

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

        // ChatGPT 결과를 파싱하여 표시
        const data = {
          script: chatgptResult,
          keyword: keyword,
          language: language
        };

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
          <button id="play-all-audio" type="button" class="secondary" onclick="playAllAudioClips()" title="모든 음성 클립을 순서대로 재생">
            🔊 전체 재생
          </button>
        </div>
        <div class="timeline-table-container">
          <table class="timeline-table">
            <thead>
              <tr>
                <th>시간</th>
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

document.addEventListener("DOMContentLoaded", () => {
  initStoryKeywordPage();
  initImageStoryPage();
  initShortsScriptPage();
  initShortsScenesPage();

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
      continueGeneration(tool);
    });
  });

  document.querySelectorAll("[data-tts]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-tts");
      if (!tool) return;
      convertToSpeech(tool);
    });
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
  if (toolSelect) {
    // Add change event listener for dropdown functionality
    toolSelect.addEventListener("change", updateRecordSelectOptions);

    if (persistedSelection?.tool) {
      toolSelect.value = persistedSelection.tool;
    }

    // 페이지 로드 시 모든 기록 로드
    loadAllToolRecords();
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

        if (payload.keyword) {
          state.lastRequests[tool] = {
            keyword: toSafeString(payload.keyword),
            language: toSafeString(payload.language, "ko")
          };
        }

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

  return subtitles.map((subtitle, index) => {
    const timeLabel = `#${index + 1}<br/>${formatTime(subtitle.start)}s→${formatTime(subtitle.end)}s`;
    const music = backgroundMusic.length > 0 ? '🎵' : '❌';
    const image = imagePrompts[index] ? '🖼️' : '❌';
    const video = videoPrompts[index] ? '🎬' : '❌';

    return `
      <tr ${index > 0 ? 'class="section-divide-tl"' : ''} data-row-index="${index}">
        <td rowspan="2" class="time-column-tl">${timeLabel}</td>
        <td class="content-column-tl subtitle-content-tl" data-field="subtitle">
          <div class="subtitle-with-tts">
            <span class="subtitle-text">${escapeHtml(subtitle.text)}</span>
            <button type="button" class="tts-btn secondary small" data-subtitle-index="${index}" title="음성 변환">🎤</button>
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
        <td class="content-column-tl voice-content-tl" data-field="voice">
          <div class="audio-clip-controls">
            <button type="button" class="play-audio-btn secondary small" data-audio-index="${index}" title="음성 재생" disabled>
              ▶️
            </button>
            <small>음성 클립</small>
          </div>
        </td>
      </tr>
    `;
  }).join('');
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

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
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
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// ---------------------------------------------------------------------------
// Video Import functionality
// ---------------------------------------------------------------------------

let downloadData = [];

async function fetchDownloadList() {
  try {
    const response = await fetch('/api/downloads');
    const data = await response.json();
    downloadData = data.files || [];

    renderDownloadList();
    updateSelectedFileDropdown();

    showNotification(`${data.count}개의 파일을 찾았습니다.`, 'success');
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



