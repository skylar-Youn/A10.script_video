import { hasHeaderEntries } from './utils.js';

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

function formatTime(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return Number(value).toFixed(1);
}

export { api, extractErrorMessage, formatTime };