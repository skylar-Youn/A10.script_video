export function createSavedRecordsManager(options) {
  const {
    state,
    toolConfig,
    toolKeys,
    api,
    displayAudioResult,
    persistSelection,
    loadPersistedSelection,
    clearPersistedSelection,
    updateRecordSelectOptions,
    formatTimestamp,
    escapeHtml,
    alert: alertFn = (message) => window.alert(message),
    confirm: confirmFn = (message) => window.confirm(message),
    prompt: promptFn = (message, defaultValue) => window.prompt(message, defaultValue)
  } = options;

  if (!state || !toolConfig) {
    throw new Error('SavedRecordsManager requires state and toolConfig');
  }

  function renderSavedRecords(tool, records = state.savedRecords[tool] || []) {
    const config = toolConfig[tool];
    if (!config) {
      console.warn(`No config found for tool: ${tool}`);
      return;
    }

    const container = document.querySelector(`#${config.savedContainer} .saved-body`);
    if (!container) {
      console.warn(`No container found for tool: ${tool}, selector: #${config.savedContainer} .saved-body`);
      return;
    }

    if (!Array.isArray(records) || records.length === 0) {
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
      .join('');

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
              if (tool === toolKeys.SCRIPT || tool === toolKeys.SCENES || tool === toolKeys.VIDEO_IMPORT) {
                const keyword = saved.payload?.keyword || saved.title;
                const language = saved.payload?.language || 'ko';
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
      alertFn('먼저 결과를 생성하세요.');
      return;
    }

    const config = toolConfig[tool];
    if (!config) return;

    const suggested = config.defaultTitle(payload) || '새로운 결과';
    const title = promptFn('저장할 이름을 입력하세요.', suggested);
    if (title === null) return;
    if (!title.trim()) {
      alertFn('이름을 입력해야 합니다.');
      return;
    }

    try {
      await api(`/api/tools/${tool}/records`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), payload })
      });

      state.activeRecords[tool] = null;
      await loadSavedRecords(tool);
      alertFn('저장되었습니다.');
    } catch (error) {
      alertFn(error.message);
    }
  }

  async function deleteSavedRecord(tool, recordId) {
    if (!recordId) return;
    if (!confirmFn('저장된 결과를 삭제할까요?')) {
      return;
    }

    try {
      await api(`/api/tools/${tool}/records/${recordId}`, { method: 'DELETE' });

      if (state.activeRecords[tool] === recordId) {
        state.activeRecords[tool] = null;
      }

      const persisted = loadPersistedSelection();
      if (persisted && persisted.tool === tool && persisted.recordId === recordId) {
        clearPersistedSelection();
      }

      await loadSavedRecords(tool);
    } catch (error) {
      alertFn(error.message);
    }
  }

  function selectSavedRecord(tool, recordId) {
    if (!recordId) return;

    const records = state.savedRecords[tool] || [];
    const record = records.find((item) => item.id === recordId);
    if (!record) {
      alertFn('저장된 데이터를 찾을 수 없습니다.');
      return;
    }

    const config = toolConfig[tool];
    if (!config) return;

    state.latestResults[tool] = record.payload;
    state.activeRecords[tool] = recordId;
    config.renderer(record.payload);

    if (tool === toolKeys.SCRIPT || tool === toolKeys.SCENES) {
      state.audioResults[tool] = null;
      displayAudioResult(tool, null);
    }

    persistSelection(tool, recordId, record.payload);

    if (tool === toolKeys.SCRIPT || tool === toolKeys.SCENES) {
      const keyword = record.payload?.keyword;
      const language = record.payload?.language || 'ko';
      if (keyword) {
        state.lastRequests[tool] = { keyword, language };
      }
    }

    renderSavedRecords(tool);

    const target = document.getElementById(config.resultsContainer);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleSavedSectionClick(event) {
    const selectButton = event.target.closest('button[data-select]');
    if (selectButton) {
      const item = selectButton.closest('li[data-record-id]');
      if (!item) return;
      const tool = item.dataset.tool;
      const recordId = item.dataset.recordId;
      selectSavedRecord(tool, recordId);
      return;
    }

    const deleteButton = event.target.closest('button[data-delete]');
    if (deleteButton) {
      const item = deleteButton.closest('li[data-record-id]');
      if (!item) return;
      const tool = item.dataset.tool;
      const recordId = item.dataset.recordId;
      deleteSavedRecord(tool, recordId);
      return;
    }

    const checkBox = event.target.closest('input[data-check]');
    if (checkBox) {
      const item = checkBox.closest('li[data-record-id]');
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

  return {
    renderSavedRecords,
    loadSavedRecords,
    saveLatestResult,
    deleteSavedRecord,
    selectSavedRecord,
    handleSavedSectionClick
  };
}
