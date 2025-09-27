import { state, TOOL_KEYS, GENERATION_ENDPOINTS } from './modules/state.js';
import { api } from './modules/api.js';
import {
  persistSelection,
  loadPersistedSelection,
  clearPersistedSelection,
  debounce
} from './modules/utils.js';
import {
  displayAudioResult,
  updateRecordSelectOptions
} from './modules/ui.js';
import {
  parseChatGPTResult,
  parseChatGPTImageResult,
  parseChatGPTShortsResult
} from './modules/parsers.js';

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  setupEventListeners();
  loadInitialData();
  restorePersistedSelection();
}

function setupEventListeners() {
  const toolSelect = document.getElementById("tool-selection");
  const recordSelect = document.getElementById("record-selection");

  if (toolSelect) {
    toolSelect.addEventListener("change", handleToolSelectionChange);
  }

  if (recordSelect) {
    recordSelect.addEventListener("change", handleRecordSelectionChange);
  }

  const generateButtons = document.querySelectorAll("[data-generate]");
  generateButtons.forEach(button => {
    button.addEventListener("click", handleGenerate);
  });

  const audioButtons = document.querySelectorAll("[data-audio]");
  audioButtons.forEach(button => {
    button.addEventListener("click", handleAudioGenerate);
  });
}

async function loadInitialData() {
  try {
    await loadAllSavedRecords();
    updateRecordSelectOptions();
  } catch (error) {
    console.error("Failed to load initial data:", error);
  }
}

function restorePersistedSelection() {
  const persisted = loadPersistedSelection();
  if (!persisted) return;

  const { tool, recordId } = persisted;
  const toolSelect = document.getElementById("tool-selection");

  if (toolSelect && tool) {
    toolSelect.value = tool;
    updateRecordSelectOptions();

    setTimeout(() => {
      const recordSelect = document.getElementById("record-selection");
      if (recordSelect && recordId) {
        recordSelect.value = recordId;
        handleRecordSelectionChange();
      }
    }, 100);
  }
}

function handleToolSelectionChange() {
  updateRecordSelectOptions();
  clearActiveRecord();
}

function handleRecordSelectionChange() {
  const toolSelect = document.getElementById("tool-selection");
  const recordSelect = document.getElementById("record-selection");

  if (!toolSelect || !recordSelect) return;

  const selectedTool = toolSelect.value;
  const selectedRecordId = recordSelect.value;

  if (selectedTool && selectedRecordId) {
    state.activeRecords[selectedTool] = selectedRecordId;
    loadSelectedRecord(selectedTool, selectedRecordId);
  } else {
    clearActiveRecord();
  }
}

async function loadSelectedRecord(tool, recordId) {
  try {
    const record = state.savedRecords[tool]?.find(r => r.id === recordId);
    if (!record) return;

    persistSelection(tool, recordId, record);
    displaySelectedRecord(tool, record);
  } catch (error) {
    console.error("Failed to load selected record:", error);
  }
}

function clearActiveRecord() {
  clearPersistedSelection();

  Object.keys(state.activeRecords).forEach(tool => {
    state.activeRecords[tool] = null;
  });
}

async function loadAllSavedRecords() {
  for (const tool of Object.values(TOOL_KEYS)) {
    try {
      const response = await api(`/api/tools/${tool}/records`);
      state.savedRecords[tool] = Array.isArray(response) ? response : [];
    } catch (error) {
      console.error(`Failed to load records for ${tool}:`, error);
      state.savedRecords[tool] = [];
    }
  }
}

async function handleGenerate(event) {
  const button = event.target;
  const tool = button.dataset.generate;

  if (!tool || !GENERATION_ENDPOINTS[tool]) {
    console.error("Unknown generation tool:", tool);
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "생성 중...";

    const formData = collectFormData(tool);
    const response = await api(GENERATION_ENDPOINTS[tool].url, {
      method: "POST",
      body: JSON.stringify(formData)
    });

    state.latestResults[tool] = response;
    displayGenerationResult(tool, response);

    await loadAllSavedRecords();
    updateRecordSelectOptions();

  } catch (error) {
    console.error(`Generation failed for ${tool}:`, error);
    alert(`생성 실패: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "생성";
  }
}

async function handleAudioGenerate(event) {
  const button = event.target;
  const tool = button.dataset.audio;

  if (!tool) return;

  try {
    button.disabled = true;
    button.textContent = "음성 생성 중...";

    const activeRecordId = state.activeRecords[tool];
    if (!activeRecordId) {
      throw new Error("선택된 레코드가 없습니다.");
    }

    const response = await api(`/api/generate/audio/${tool}`, {
      method: "POST",
      body: JSON.stringify({ record_id: activeRecordId })
    });

    state.audioResults[tool] = response;
    displayAudioResult(tool, response);

  } catch (error) {
    console.error(`Audio generation failed for ${tool}:`, error);
    alert(`음성 생성 실패: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "음성 생성";
  }
}

function collectFormData(tool) {
  const formData = {};

  switch (tool) {
    case TOOL_KEYS.SCRIPT:
      const keywordInput = document.getElementById("script-keyword");
      if (keywordInput) formData.keyword = keywordInput.value.trim();
      break;

    case TOOL_KEYS.SCENES:
      const scriptSelect = document.getElementById("script-selection");
      if (scriptSelect) formData.script_id = scriptSelect.value;
      break;
  }

  return formData;
}

function displayGenerationResult(tool, result) {
  switch (tool) {
    case TOOL_KEYS.SCRIPT:
      displayScriptResult(result);
      break;
    case TOOL_KEYS.SCENES:
      displayScenesResult(result);
      break;
  }
}

function displaySelectedRecord(tool, record) {
  switch (tool) {
    case TOOL_KEYS.SCRIPT:
      displayScriptResult(record.payload);
      break;
    case TOOL_KEYS.SCENES:
      displayScenesResult(record.payload);
      break;
  }
}

function displayScriptResult(result) {
  const container = document.getElementById("shorts-script-results");
  if (!container || !result) return;

  const parsedResult = parseChatGPTShortsResult(result.content || "");

  // Display implementation would go here
  container.innerHTML = `
    <div class="script-result">
      <h3>Generated Script</h3>
      <pre>${result.content || ""}</pre>
    </div>
  `;
}

function displayScenesResult(result) {
  const container = document.getElementById("shorts-scenes-results");
  if (!container || !result) return;

  // Display implementation would go here
  container.innerHTML = `
    <div class="scenes-result">
      <h3>Generated Scenes</h3>
      <pre>${JSON.stringify(result, null, 2)}</pre>
    </div>
  `;
}

export {
  initialize,
  loadAllSavedRecords,
  updateRecordSelectOptions,
  displayAudioResult
};