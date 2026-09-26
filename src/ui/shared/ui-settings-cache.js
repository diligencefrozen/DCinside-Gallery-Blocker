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
    const next = { ...safeObject(value) };

    // options/popup 초기화 직후 시작된 storage.sync.get(null)이 아직 끝나지 않은
    // 상태에서 백업을 가져오면, 그 오래된 응답이 뒤늦게 도착해 방금 가져온
    // 설정 화면을 되돌릴 수 있다. replace는 전체 스냅샷 교체이므로 기존/신규
    // 키 모두를 dirty로 표시해 초기 read보다 항상 우선하도록 한다.
    if (!initialSyncSettled) {
      new Set([...Object.keys(snapshot), ...Object.keys(next)]).forEach((key) => {
        initialDirtyKeys.add(key);
      });
    }

    snapshot = next;
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
