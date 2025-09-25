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

function renderProject(project) {
  state.project = project;
  const container = document.getElementById("project-state");
  if (!container) return;

  const totalDuration = getTotalDuration(project);
  container.innerHTML = buildProjectMarkup(project, totalDuration);
  bindProjectHandlers(totalDuration);
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
          ${renderTimelineRow("자막", project.subtitles, buildSubtitleSegment)}
          ${renderTimelineRow("음성", project.subtitles, buildAudioSegment)}
          ${renderTimelineRow("이미지 프롬프트", project.image_prompts, buildImageSegment)}
          ${renderTimelineRow("영상 프롬프트", project.video_prompts, buildVideoSegment)}
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

function renderTimelineRow(label, items, builder) {
  return `
    <div><strong>${label}</strong></div>
    <div class="timeline-track" data-label="${label}">
      ${items && items.length ? items.map(builder).join("") : '<div class="segment">데이터 없음</div>'}
    </div>
  `;
}

function buildSubtitleSegment(segment) {
  return `<div class="segment" data-index="${segment.index}" data-start="${segment.start}" data-end="${segment.end}">
      <span>#${segment.index} (${segment.start.toFixed(1)}s→${segment.end.toFixed(1)}s)</span>
      <strong>${segment.text}</strong>
      <small>${segment.scene_tag}</small>
    </div>`;
}

function buildAudioSegment(segment) {
  return `<div class="segment" data-index="${segment.index}" data-start="${segment.start}" data-end="${segment.end}">
      <span>${segment.start.toFixed(1)}s-${segment.end.toFixed(1)}s</span>
      <small>음성 클립</small>
    </div>`;
}

function buildImageSegment(prompt) {
  return `<div class="segment scene-segment" data-scene="${prompt.tag}" data-start="${prompt.start ?? 0}" data-end="${prompt.end ?? 0}">
      <span>${prompt.tag}</span>
      <small>${prompt.description}</small>
    </div>`;
}

function buildVideoSegment(prompt) {
  return `<div class="segment video-segment" data-scene="${prompt.scene_tag}" data-start="${prompt.start ?? 0}" data-end="${prompt.end ?? 0}">
      <span>${prompt.scene_tag}</span>
      <small>${prompt.action}</small>
    </div>`;
}

function bindProjectHandlers(totalDuration) {
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

  container.querySelectorAll("#subtitle-track .segment").forEach((segmentEl) => {
    segmentEl.addEventListener("click", async () => {
      const index = segmentEl.dataset.index;
      if (!index) return;
      const currentText = segmentEl.querySelector("strong").textContent;
      const nextText = prompt("자막 수정", currentText);
      if (nextText && nextText !== currentText) {
        try {
          const project = await api(`/api/projects/${state.project.project_id}/subtitles/${index}`, {
            method: "PATCH",
            body: JSON.stringify({ text: nextText })
          });
          renderProject(project);
        } catch (error) {
          alert(error.message);
        }
      }
    });

    segmentEl.addEventListener("contextmenu", async (event) => {
      event.preventDefault();
      const index = segmentEl.dataset.index;
      if (!index) return;
      const start = prompt("새 시작 시점(초)", segmentEl.dataset.start || "0");
      if (start === null) return;
      const end = prompt("새 종료 시점(초)", segmentEl.dataset.end || "5");
      if (end === null) return;
      try {
        const project = await api(`/api/projects/${state.project.project_id}/subtitles/${index}`, {
          method: "PATCH",
          body: JSON.stringify({ start: Number(start), end: Number(end) })
        });
        renderProject(project);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  container.querySelectorAll("#image-track .scene-segment").forEach((segmentEl) => {
    segmentEl.addEventListener("click", () => highlightPrompt(segmentEl.dataset.scene, "image"));
  });

  container.querySelectorAll("#video-track .video-segment").forEach((segmentEl) => {
    segmentEl.addEventListener("click", () => highlightPrompt(segmentEl.dataset.scene, "video"));
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
