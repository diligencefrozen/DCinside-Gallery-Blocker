/* Fast UI snapshot for extension settings pages.
 * chrome.storage remains the source of truth; localStorage only avoids blank/loading controls
 * while the asynchronous storage read is completing.
 */
(() => {
  "use strict";
  if (globalThis.DCBUiSettingsCache) return;

  const CACHE_KEY = "dcb:ui-sync-settings:v1";
  let snapshot = {};
  let initialSyncSettled = false;
  const initialDirtyKeys = new Set();

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

  function markInitialDirtyKeys(value = {}) {
    if (initialSyncSettled) return;
    Object.keys(safeObject(value)).forEach((key) => initialDirtyKeys.add(key));
  }

  function merge(patch = {}) {
    const safePatch = safeObject(patch);
    markInitialDirtyKeys(safePatch);
    snapshot = { ...snapshot, ...safePatch };
    persist();
    return { ...snapshot };
  }

  function applyChanges(changes = {}) {
    const next = { ...snapshot };
    Object.entries(changes).forEach(([key, change]) => {
      if (!change || typeof change !== "object") return;
      if (!initialSyncSettled) initialDirtyKeys.add(key);
      if (Object.prototype.hasOwnProperty.call(change, "newValue") && change.newValue !== undefined) {
        next[key] = change.newValue;
      } else {
        delete next[key];
      }
    });
    snapshot = next;
    persist();
  }

  function finishInitialSync(value) {
    const stored = safeObject(value);
    const next = { ...stored };

    // UI에서 먼저 바뀐 값이나 초기 storage.onChanged 이벤트는 오래된 get(null)
    // 응답보다 우선한다. 팝업을 막 연 직후 키워드를 추가해도 목록이 되돌아가지 않는다.
    initialDirtyKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(snapshot, key)) next[key] = snapshot[key];
      else delete next[key];
    });

    snapshot = next;
    initialSyncSettled = true;
    initialDirtyKeys.clear();
    persist();
    return { ...snapshot };
  }

  load();

  const ready = globalThis.chrome?.storage?.sync
    ? chrome.storage.sync.get(null).then(finishInitialSync).catch(() => {
        initialSyncSettled = true;
        initialDirtyKeys.clear();
        return read();
      })
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
