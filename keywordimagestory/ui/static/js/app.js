const state = {
  project: null,
  templates: [
    { id: "clean", name: "Clean Split" },
    { id: "banner", name: "Bold Banner" },
    { id: "shadow", name: "Shadow Card" },
    { id: "focus", name: "Subtitle Focus" },
    { id: "dual", name: "Dual Column" }
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
  textEffects: [
    "normal",
    "outline",
    "shadow",
    "glow",
    "gradient",
    "typewriter",
    "wave",
    "pulse",
    "shake",
    "fade"
  ]
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || response.statusText);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function renderProject(project) {
  state.project = project;
  const container = document.getElementById("project-state");
  if (!container) return;

  container.innerHTML = `
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
          <button data-action="export" class="contrast">내보내기</button>
        </div>
      </header>

      <section>
        <h3>동시 편집 타임라인</h3>
        <div class="timeline-grid">
          <div><strong>자막</strong></div>
          <div class="timeline-track" id="subtitle-track">
            ${project.subtitles
              .map(
                (segment) => `
                  <div class="segment" data-index="${segment.index}" data-start="${segment.start}" data-end="${segment.end}">
                    <span>#${segment.index} (${segment.start.toFixed(1)}s→${segment.end.toFixed(1)}s)</span>
                    <strong>${segment.text}</strong>
                    <small>${segment.scene_tag}</small>
                  </div>
                `
              )
              .join("")}
          </div>

          <div><strong>음성</strong></div>
          <div class="timeline-track" id="audio-track">
            ${project.subtitles
              .map(
                (segment) => `
                  <div class="segment" data-index="${segment.index}" data-start="${segment.start}" data-end="${segment.end}">
                    <span>${segment.start.toFixed(1)}s-${segment.end.toFixed(1)}s</span>
                    <small>음성 클립</small>
                  </div>
                `
              )
              .join("")}
          </div>

          <div><strong>이미지/영상</strong></div>
          <div class="timeline-track" id="scene-track">
            ${project.image_prompts
              .map(
                (prompt, idx) => `
                  <div class="segment" data-scene="${prompt.tag}">
                    <span>${prompt.tag}</span>
                    <small>${prompt.description}</small>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </section>

      <section class="grid">
        <div>
          <h3>화면 템플릿</h3>
          <div class="grid" id="template-selector">
            ${state.templates
              .map(
                (template) => `
                  <button class="outline" data-template="${template.id}">${template.name}</button>
                `
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
          <label>제목 크기
            <input type="range" id="title-size" min="24" max="72" value="48" />
          </label>
          <label>자막 크기
            <input type="range" id="subtitle-size" min="16" max="48" value="28" />
          </label>
          <label>텍스트 효과
            <select id="text-effect">
              ${state.textEffects.map((effect) => `<option value="${effect}">${effect}</option>`).join("")}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h3>영상 효과</h3>
        <form id="effect-form" class="grid">
          <label>
            효과 선택
            <select name="effect_id">
              ${state.effects.map((effect) => `<option value="${effect.id}">${effect.name}</option>`).join("")}
            </select>
          </label>
          <label>
            시작 (초)
            <input type="number" step="0.1" name="start_time" value="0" />
          </label>
          <label>
            종료 (초)
            <input type="number" step="0.1" name="end_time" value="5" />
          </label>
          <button type="submit">효과 적용</button>
        </form>
        <div class="effect-list">
          ${project.applied_effects
            .map(
              (effect) => `
              <span class="effect-badge" data-effect="${effect.effect_id}">
                ${effect.name} (${effect.start_time.toFixed(1)}-${effect.end_time.toFixed(1)}s)
                <button type="button" data-remove-effect="${effect.effect_id}" class="outline">×</button>
              </span>
            `
            )
            .join(" ")}
        </div>
      </section>
    </article>
  `;

  bindProjectHandlers();
}

function bindProjectHandlers() {
  const container = document.getElementById("project-state");
  if (!container) return;

  container.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const action = event.currentTarget.dataset.action;
      try {
        if (action === "generate-titles") {
          const payload = { type: "keyword", count: 30 };
          const project = await api(`/api/projects/${state.project.project_id}/generate/titles`, {
            method: "POST",
            body: JSON.stringify(payload)
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

  const templateSelector = container.querySelector("#template-selector");
  if (templateSelector) {
    templateSelector.querySelectorAll("button[data-template]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const templateId = btn.dataset.template;
        const payload = {
          template_id: templateId,
          title_position: [0.5, 0.15],
          subtitle_position: [0.5, 0.85],
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

  function refreshPreview() {
    previewTitle.style.fontSize = `${titleSize.value}px`;
    previewSubtitle.style.fontSize = `${subtitleSize.value}px`;
  }

  if (titleSize && subtitleSize) {
    titleSize.addEventListener("input", refreshPreview);
    subtitleSize.addEventListener("input", refreshPreview);
  }
  refreshPreview();
}

// ---------------------------------------------------------------------------
// Form handling
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("project-form");
  if (!form) return;

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
        const updatedTitles = await api(`/api/projects/${project.project_id}/generate/titles`, {
          method: "POST",
          body: JSON.stringify({ type: "image", image_description: payload.image_description, count: 30 })
        });
        renderProject(updatedTitles);
      }
      const withSubtitles = await api(`/api/projects/${project.project_id}/generate/subtitles`, { method: "POST" });
      renderProject(withSubtitles);
    } catch (error) {
      alert(error.message);
    }
  });
});
