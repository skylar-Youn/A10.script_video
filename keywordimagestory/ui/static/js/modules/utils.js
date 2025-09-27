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

function hasHeaderEntries(headers) {
  for (const _ of headers) {
    return true;
  }
  return false;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export {
  persistSelection,
  loadPersistedSelection,
  clearPersistedSelection,
  hasHeaderEntries,
  formatFileSize,
  escapeHtml,
  debounce
};