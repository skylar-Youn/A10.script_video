import { escapeHtml, formatTimestamp } from './utils.js';
import { state, AUDIO_CONTAINER_IDS } from './state.js';

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
}

export {
  toSafeString,
  formatTimecode,
  toOptionalNumber,
  displayAudioResult,
  updateRecordSelectOptions
};