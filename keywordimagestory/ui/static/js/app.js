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
  textEffects: ["normal", "outline", "shadow", "glow", "gradient", "typewriter", "wave", "pulse", "shake", "fade"]
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
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

function toOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
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

function renderImageTitleResults(result) {
  const container = document.getElementById("image-title-results");
  if (!container) return;

  const items = Array.isArray(result?.items) ? result.items : [];
  if (!items.length) {
    container.innerHTML = '<div class="placeholder"><p>생성된 제목이 없습니다. 다른 설명을 입력해 보세요.</p></div>';
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
          <h3>생성된 스토리 제목</h3>
          <p class="status">설명 원문: <strong>${escapeHtml(result.description ?? "")}</strong></p>
        </div>
        <small class="status">키워드: ${escapeHtml(result.keyword ?? "")} · 언어: ${escapeHtml(result.language ?? "ko")}</small>
      </header>
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
      renderStoryKeywordResults(data);
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

function initImageTitlePage() {
  const form = document.getElementById("image-title-form");
  const resultsContainer = document.getElementById("image-title-results");
  if (!form || !resultsContainer) return;

  const submitButton = form.querySelector("button[type='submit']");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const description = String(formData.get("description") || "").trim();
    if (!description) {
      alert("이미지 설명을 입력하세요.");
      return;
    }
    const keyword = String(formData.get("keyword") || "").trim();
    let count = Number(formData.get("count") || 30);
    if (!Number.isFinite(count)) {
      count = 30;
    }

    const payload = { description, keyword, count };
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");
    }
    resultsContainer.innerHTML = '<div class="placeholder"><p>생성 중입니다...</p></div>';
    try {
      const data = await api("/api/generate/image-titles", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      renderImageTitleResults(data);
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
      renderShortsScriptResults(data);
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
      renderShortsSceneResults(data);
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
  const max = Math.max(...candidates, 60);
  return max || 60;
}

function buildOverlapBars(project, totalDuration) {
  const items = [];
  const pushItem = (type, label, start, end) => {
    if (start == null || end == null) return;
    const s = Number(start);
    const e = Number(end);
    if (Number.isNaN(s) || Number.isNaN(e)) return;
    items.push({ type, label, start: s, end: e });
  };
  project.subtitles.forEach((segment) => pushItem("subtitle", `#${segment.index}`, segment.start, segment.end));
  project.subtitles.forEach((segment) => pushItem("audio", `오디오 ${segment.index}`, segment.start, segment.end));
  project.image_prompts.forEach((prompt, idx) => pushItem("image", prompt.tag || `이미지 ${idx + 1}`, prompt.start, prompt.end));
  project.video_prompts.forEach((prompt, idx) => pushItem("video", prompt.scene_tag || `씬 ${idx + 1}`, prompt.start, prompt.end));

  items.sort((a, b) => a.start - b.start);
  let lastEnd = -1;
  return items
    .map((item) => {
      const overlap = item.start < lastEnd;
      lastEnd = Math.max(lastEnd, item.end);
      const leftPercent = (item.start / totalDuration) * 100;
      const widthPercent = ((item.end - item.start) / totalDuration) * 100 || 0.5;
      const classes = ["timeline-bar", item.type];
      if (overlap) classes.push("overlap");
      return `<div class="${classes.join(" ")}" style="left:${leftPercent}%;width:${widthPercent}%">${item.label}<small>${item.start.toFixed(1)}s→${item.end.toFixed(1)}s</small></div>`;
    })
    .join("");
}

function highlightPrompt(tag, type) {
  const container = document.getElementById("prompt-preview");
  if (!container || !state.project) return;
  let prompt;
  if (type === "image") {
    prompt = state.project.image_prompts.find((item) => item.tag === tag);
  } else {
    prompt = state.project.video_prompts.find((item) => item.scene_tag === tag);
  }
  if (!prompt) return;
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
  initImageTitlePage();
  initShortsScriptPage();
  initShortsScenesPage();

  const form = document.getElementById("project-form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      if (!payload.keyword) {
        alert("키워드를 입력하세요");
        return;
      }
      try {
        const project = await api("/api/projects", {
          method: "POST",
          body: JSON.stringify({ keyword: payload.keyword, language: payload.language })
        });
        renderProject(project);
        if (payload.image_description) {
          const updated = await api(`/api/projects/${project.project_id}/generate/titles`, {
            method: "POST",
            body: JSON.stringify({ type: "image", image_description: payload.image_description, count: 30 })
          });
          renderProject(updated);
        }
        const withSubtitles = await api(`/api/projects/${project.project_id}/generate/subtitles`, { method: "POST" });
        renderProject(withSubtitles);
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
