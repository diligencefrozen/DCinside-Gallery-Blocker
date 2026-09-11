/* Fast UI snapshot for extension settings pages.
 * chrome.storage remains the source of truth; localStorage only avoids blank/loading controls
 * while the asynchronous storage read is completing.
 */
(() => {
  "use strict";
  if (globalThis.DCBUiSettingsCache) return;

  const CACHE_KEY = "dcb:ui-sync-settings:v1";
  let snapshot = {};

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function load() {
    try {
      snapshot = safeObject(JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"));
    } catch (_) {
      snapshot = {};
    }
    return snapshot;
  }

  function persist() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch (_) {}
  }

  function read(defaults = {}) {
    return { ...safeObject(defaults), ...snapshot };
  }

  function replace(value) {
    snapshot = { ...safeObject(value) };
    persist();
    return { ...snapshot };
  }

  function merge(patch = {}) {
    snapshot = { ...snapshot, ...safeObject(patch) };
    persist();
    return { ...snapshot };
  }

  function applyChanges(changes = {}) {
    const next = { ...snapshot };
    Object.entries(changes).forEach(([key, change]) => {
      if (!change || typeof change !== "object") return;
      if (Object.prototype.hasOwnProperty.call(change, "newValue") && change.newValue !== undefined) {
        next[key] = change.newValue;
      } else {
        delete next[key];
      }
    });
    snapshot = next;
    persist();
  }

  load();

  const ready = globalThis.chrome?.storage?.sync
    ? chrome.storage.sync.get(null).then((value) => replace(value)).catch(() => read())
    : Promise.resolve(read());

  if (globalThis.chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync") applyChanges(changes);
    });
  }

  globalThis.DCBUiSettingsCache = Object.freeze({
    CACHE_KEY,
    read,
    replace,
    merge,
    ready
  });
})();
