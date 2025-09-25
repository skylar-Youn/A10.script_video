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
    shorts_scenes: null
  },
  savedRecords: {
    story_keywords: [],
    image_story: [],
    shorts_script: [],
    shorts_scenes: []
  },
  activeRecords: {
    story_keywords: null,
    image_story: null,
    shorts_script: null,
    shorts_scenes: null
  },
  checkedRecords: {
    story_keywords: new Set(),
    image_story: new Set(),
    shorts_script: new Set(),
    shorts_scenes: new Set()
  },
  lastRequests: {
    story_keywords: null,
    image_story: null,
    shorts_script: null,
    shorts_scenes: null
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
  SCENES: "shorts_scenes"
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
  if (headers.size) {
    init.headers = headers;
  } else {
    delete init.headers;
  }
  const response = await fetch(path, init);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || response.statusText);
  }
  if (response.status === 204) return null;
  return response.json();
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
  recordSelect.innerHTML = '<option value="">선택하세요</option>';

  if (!selectedTool) {
    recordSelect.disabled = true;
    recordSelect.value = "";
    return;
  }

  const records = state.savedRecords[selectedTool] || [];
  const optionMarkup = records
    .map((record) => `<option value="${record.id}">${escapeHtml(record.title || record.id)}</option>`)
    .join("");
  recordSelect.insertAdjacentHTML("beforeend", optionMarkup);
  recordSelect.disabled = records.length === 0;

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

function renderStoryKeywordResults(result) {
  const container = document.getElementById("story-keyword-results");
  if (!container) return;

  const items = Array.isArray(result?.items) ? result.items : [];
  if (!items.length) {
    container.innerHTML = '<div class="placeholder"><p>생성된 항목이 없습니다. 다른 키워드를 시도해 보세요.</p></div>';
    return;
  }

  const listMarkup = items
    .map((item, index) => {
      const label = typeof item.index === "number" ? item.index : index + 1;
      const text = escapeHtml(item.text ?? "");
      return `<li><strong>${label}.</strong> ${text}</li>`;
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
            <button type="button" class="outline" data-regenerate-single="shorts_script" data-index="${idx}">이 프롬프트 다시 생성</button>
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
            <button type="button" class="outline" data-regenerate-single="shorts_scenes" data-index="${idx}">이 씬 다시 생성</button>
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
  if (!config) return;
  const container = document.querySelector(`#${config.savedContainer} .saved-body`);
  if (!container) return;

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
    const records = await api(`/api/tools/${tool}/records`);
    state.savedRecords[tool] = Array.isArray(records) ? records : [];
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

function initStoryKeywordPage() {
  const form = document.getElementById("story-keyword-form");
  const resultsContainer = document.getElementById("story-keyword-results");
  if (!form || !resultsContainer) return;

  const submitButton = form.querySelector("button[type='submit']");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const keyword = String(formData.get("keyword") || "").trim();
    if (!keyword) {
      alert("키워드를 입력하세요.");
      return;
    }

    const language = String(formData.get("language") || "ko") || "ko";
    let count = Number(formData.get("count") || 30);
    if (!Number.isFinite(count)) {
      count = 30;
    }

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
    const keyword = String(formData.get("keyword") || "").trim();
    if (!keyword) {
      alert("스토리 키워드를 입력하세요.");
      return;
    }
    const language = String(formData.get("language") || "ko") || "ko";

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
    const keyword = String(formData.get("keyword") || "").trim();
    if (!keyword) {
      alert("스토리 키워드를 입력하세요.");
      return;
    }
    const language = String(formData.get("language") || "ko") || "ko";

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
  bindProjectHandlers();
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
          <button data-action="generate-titles" class="outline">제목 재생성</button>
          <button data-action="generate-subtitles" class="outline">자막 재생성</button>
          <button data-action="generate-scenes" class="outline">영상 프롬프트</button>
          <button data-action="auto-align" class="outline">AI 자동 정렬</button>
          <button data-action="export" class="contrast">내보내기</button>
        </div>
      </header>

      <section>
        <h3>동시 편집 타임라인</h3>
        <div class="timeline-grid">
          ${renderTimelineRow("자막", project.subtitles, buildSubtitleSegment, "subtitle")}
          ${renderTimelineRow("음성", project.subtitles, buildAudioSegment, "audio")}
          ${renderTimelineRow("배경 음악", project.background_music || [], buildMusicSegment, "music")}
          ${renderTimelineRow("이미지 프롬프트", project.image_prompts, buildImageSegment, "image")}
          ${renderTimelineRow("영상 프롬프트", project.video_prompts, buildVideoSegment, "video")}
          <div><strong>정렬 미리보기</strong></div>
          <div class="timeline-track overlay" id="overlap-track" data-duration="${totalDuration}">
            ${buildOverlapBars(project, totalDuration)}
          </div>
        </div>
      </section>

      <section class="grid">
        <div>
          <h3>화면 템플릿</h3>
          <div class="grid" id="template-selector">
            ${state.templates
              .map(
                (template) => `<button class="outline" data-template="${template.id}" data-title-x="${template.title[0]}" data-title-y="${template.title[1]}" data-subtitle-x="${template.subtitle[0]}" data-subtitle-y="${template.subtitle[1]}">${template.name}</button>`
              )
              .join("")}
          </div>
        </div>
        <div>
          <h3>실시간 템플릿 프리뷰</h3>
          <div class="template-preview" id="template-preview">
            <div class="title-box" id="preview-title">${project.keyword}</div>
            <div class="subtitle-box" id="preview-subtitle">${project.subtitles[0]?.text || "자막 미리보기"}</div>
          </div>
          <label>제목 크기<input type="range" id="title-size" min="24" max="72" value="48" /></label>
          <label>자막 크기<input type="range" id="subtitle-size" min="16" max="48" value="28" /></label>
          <label>텍스트 효과<select id="text-effect">${state.textEffects.map((effect) => `<option value="${effect}">${effect}</option>`).join("")}</select></label>
        </div>
      </section>

      <section>
        <h3>영상 효과</h3>
        <form id="effect-form" class="grid">
          <label>효과 선택<select name="effect_id">${state.effects.map((effect) => `<option value="${effect.id}">${effect.name}</option>`).join("")}</select></label>
          <label>시작 (초)<input type="number" step="0.1" name="start_time" value="0" /></label>
          <label>종료 (초)<input type="number" step="0.1" name="end_time" value="5" /></label>
          <button type="submit">효과 적용</button>
        </form>
        <div class="effect-list">
          ${project.applied_effects
            .map(
              (effect) => `<span class="effect-badge" data-effect="${effect.effect_id}">${effect.name} (${effect.start_time.toFixed(1)}-${effect.end_time.toFixed(1)}s)<button type="button" data-remove-effect="${effect.effect_id}" class="outline">×</button></span>`
            )
            .join(" ")}
        </div>
      </section>

      <section class="grid">
        <div>
          <h3>이미지 프롬프트 추가</h3>
          <form id="image-prompt-form" class="grid">
            <label>태그<input type="text" name="tag" placeholder="이미지 7" required /></label>
            <label>설명<textarea name="description" rows="2" placeholder="장면 설명" required></textarea></label>
            <label>시작(초)<input type="number" step="0.1" name="start" placeholder="0" /></label>
            <label>종료(초)<input type="number" step="0.1" name="end" placeholder="5" /></label>
            <button type="submit">프롬프트 추가</button>
          </form>
          <h3>배경 음악 추가</h3>
          <form id="music-track-form" class="grid">
            <label>트랙 ID<input type="text" name="track_id" placeholder="bgm-main" required /></label>
            <label>제목<input type="text" name="title" placeholder="메인 테마" required /></label>
            <label>출처/파일<input type="text" name="source" placeholder="bgm/main-theme.mp3" /></label>
            <div class="segment-edit-grid">
              <label>시작(초)<input type="number" step="0.1" name="start" placeholder="0" /></label>
              <label>종료(초)<input type="number" step="0.1" name="end" placeholder="60" /></label>
            </div>
            <label>볼륨(0-1)<input type="number" step="0.05" min="0" max="1" name="volume" value="0.8" /></label>
            <button type="submit">배경 음악 추가</button>
          </form>
        </div>
        <div id="prompt-preview">
          <h3>프롬프트 프리뷰</h3>
          <div class="preview-body">
            <h4>선택된 프롬프트가 없습니다</h4>
            <p>타임라인의 이미지/영상 요소를 클릭하면 세부 정보를 확인할 수 있습니다.</p>
          </div>
        </div>
      </section>
    </article>
  `;
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
      confirmMessage: "선택한 이미지 프롬프트를 삭제할까요?",
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
      confirmMessage: "선택한 영상 프롬프트를 삭제할까요?",
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

  const templateSelector = container.querySelector("#template-selector");
  if (templateSelector) {
    templateSelector.querySelectorAll("button[data-template]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const templateId = btn.dataset.template;
        const payload = {
          template_id: templateId,
          title_position: [parseFloat(btn.dataset.titleX), parseFloat(btn.dataset.titleY)],
          subtitle_position: [parseFloat(btn.dataset.subtitleX), parseFloat(btn.dataset.subtitleY)],
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
    previewTitle.style.fontSize = `${titleSize.value}px`;
    previewSubtitle.style.fontSize = `${subtitleSize.value}px`;
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

  bindTimelineEditors(container);
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
  const items = [];
  const safeDuration = totalDuration && totalDuration > 0 ? totalDuration : 60;
  const clampToDuration = (value) => {
    const numeric = toOptionalNumber(value);
    if (numeric === null) return null;
    return Math.min(Math.max(0, numeric), safeDuration);
  };
  const pushItem = (type, label, start, end, order = 0, total = 1) => {
    const rawStart = clampToDuration(start);
    const rawEnd = clampToDuration(end);
    const missingStart = rawStart === null;
    const missingEnd = rawEnd === null;
    const slot = total > 0 ? safeDuration / total : safeDuration;
    const fallbackWidth = Math.min(slot, Math.max(safeDuration * 0.05, slot * 0.6, 0.5));

    let itemStart = missingStart ? null : rawStart;
    let itemEnd = missingEnd ? null : rawEnd;

    if (missingStart && missingEnd) {
      itemStart = order * slot;
      itemEnd = itemStart + fallbackWidth;
    } else if (missingStart) {
      itemEnd = rawEnd ?? 0;
      itemStart = itemEnd - fallbackWidth;
    } else if (missingEnd) {
      itemStart = rawStart ?? 0;
      itemEnd = itemStart + fallbackWidth;
    }

    if (itemStart === null || itemEnd === null) return;

    itemStart = Math.min(Math.max(0, itemStart), safeDuration);
    itemEnd = Math.min(Math.max(0, itemEnd), safeDuration);
    if (itemEnd <= itemStart) {
      itemEnd = Math.min(safeDuration, itemStart + fallbackWidth);
    }

    items.push({
      type,
      label,
      start: itemStart,
      end: itemEnd,
      missing: missingStart || missingEnd,
      missingStart,
      missingEnd
    });
  };

  project.subtitles.forEach((segment, index, list) => pushItem("subtitle", `#${segment.index}`, segment.start, segment.end, index, list.length || 1));
  project.subtitles.forEach((segment, index, list) => pushItem("audio", `오디오 ${segment.index}`, segment.start, segment.end, index, list.length || 1));
  (project.background_music || []).forEach((track, index, list) =>
    pushItem("music", track.title || track.track_id || `BGM ${index + 1}`, track.start, track.end, index, list.length || 1)
  );
  project.image_prompts.forEach((prompt, index, list) => pushItem("image", prompt.tag || `이미지 ${index + 1}`, prompt.start, prompt.end, index, list.length || 1));
  project.video_prompts.forEach((prompt, index, list) => pushItem("video", prompt.scene_tag || `씬 ${index + 1}`, prompt.start, prompt.end, index, list.length || 1));

  items.sort((a, b) => a.start - b.start);
  let lastEnd = -1;
  return items
    .map((item) => {
      const overlap = item.start < lastEnd;
      lastEnd = Math.max(lastEnd, item.end);
      const leftPercent = safeDuration ? (item.start / safeDuration) * 100 : 0;
      const widthPercent = safeDuration ? ((item.end - item.start) / safeDuration) * 100 || 0.5 : 0;
      const classes = ["timeline-bar", item.type];
      if (item.missing) classes.push("missing");
      if (overlap) classes.push("overlap");
      const startLabel = item.missingStart ? "-" : item.start.toFixed(1);
      const endLabel = item.missingEnd ? "-" : item.end.toFixed(1);
      return `<div class="${classes.join(" ")}" style="left:${leftPercent}%;width:${widthPercent}%">${item.label}<small>${startLabel}s→${endLabel}s</small></div>`;
    })
    .join("");
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
  const historyTable = document.getElementById("project-history-table");
  if (!historyTable) return;
  historyTable.querySelectorAll("tbody tr[data-project-id]").forEach((row) => {
    if (row.dataset.projectId === projectId) {
      row.classList.add("active");
    } else {
      row.classList.remove("active");
    }
  });
}

function updateHistoryEmptyState(table) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const hasDataRow = Boolean(tbody.querySelector("tr[data-project-id]"));
  if (hasDataRow) {
    const emptyRow = tbody.querySelector("tr.empty");
    if (emptyRow) emptyRow.remove();
    return;
  }

  tbody.innerHTML = '<tr class="empty"><td colspan="5">기록이 없습니다.</td></tr>';
}

function bindHistoryTable(table) {
  updateHistoryEmptyState(table);

  const rows = Array.from(table.querySelectorAll("tbody tr[data-project-id]"));
  rows.forEach((row) => {
    row.addEventListener("click", () => {
      loadProject(row.dataset.projectId);
    });
  });

  const deleteButtons = Array.from(table.querySelectorAll("button[data-delete-history]"));
  deleteButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const row = button.closest("tr[data-project-id]");
      if (!row) return;
      const projectId = row.dataset.projectId;
      const version = row.dataset.version;
      const confirmDelete = confirm("선택한 내보내기 기록을 삭제할까요?");
      if (!confirmDelete) return;
      try {
        await api(`/api/history/${projectId}/${version}`, { method: "DELETE" });
        row.remove();
        updateHistoryEmptyState(table);
      } catch (error) {
        alert(error.message);
      }
    });
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

  document.querySelectorAll("[data-regenerate-all]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-regenerate-all");
      if (!tool) return;
      regenerateAll(tool);
    });
  });

  const scriptResults = document.getElementById("shorts-script-results");
  if (scriptResults) {
    scriptResults.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-regenerate-single='shorts_script']");
      if (!button) return;
      const index = Number(button.dataset.index || 0);
      if (Number.isNaN(index)) return;
      regenerateSingle(TOOL_KEYS.SCRIPT, index);
    });
  }

  const sceneResults = document.getElementById("shorts-scenes-results");
  if (sceneResults) {
    sceneResults.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-regenerate-single='shorts_scenes']");
      if (!button) return;
      const index = Number(button.dataset.index || 0);
      if (Number.isNaN(index)) return;
      regenerateSingle(TOOL_KEYS.SCENES, index);
    });
  }

  Object.keys(TOOL_CONFIG).forEach((tool) => {
    const section = document.getElementById(TOOL_CONFIG[tool].savedContainer);
    if (section) {
      section.addEventListener("click", handleSavedSectionClick);
    }
    loadSavedRecords(tool);
  });

  const persistedSelection = loadPersistedSelection();
  const toolSelect = document.getElementById("tool-selection");
  if (toolSelect && persistedSelection?.tool) {
    toolSelect.value = persistedSelection.tool;
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
          }
        }

        if (tool === TOOL_KEYS.SCENES) {
          if (Array.isArray(payload.subtitles)) {
            currentProject.subtitles = payload.subtitles;
          }
          if (Array.isArray(payload.scenes)) {
            currentProject.video_prompts = payload.scenes;
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

  const historyTable = document.getElementById("project-history-table");
  if (historyTable) {
    bindHistoryTable(historyTable);
  }

  const url = new URL(window.location.href);
  const initialProjectId = url.searchParams.get("project") || (url.hash.startsWith("#project-") ? url.hash.replace("#project-", "") : null);
  if (initialProjectId) {
    loadProject(initialProjectId, { scrollIntoView: false });
  }
});
