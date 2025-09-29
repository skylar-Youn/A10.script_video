export function createRenderers({ escapeHtml, formatTimecode, displayAudioResult, state, TOOL_KEYS }) {
  function renderStoryKeywordResults(result) {
    const container = document.getElementById("story-keyword-results");
    if (!container) return;

    const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result?.titles) ? result.titles : []);
    if (!items.length) {
      container.innerHTML = '<div class="placeholder"><p>생성된 항목이 없습니다. 다른 키워드를 시도해 보세요.</p></div>';
      return;
    }

    const listMarkup = items
      .map((item) => {
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
      .map((image, index) => {
        const tag = escapeHtml(image.tag ?? `이미지 ${index + 1}`);
        const description = escapeHtml(image.description ?? "");
        return `
          <li>
            <header><strong>${tag}</strong></header>
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
            <div class="item-actions"></div>
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

  return {
    renderStoryKeywordResults,
    renderImageStoryResults,
    renderShortsScriptResults,
    renderShortsSceneResults
  };
}
