/*
 * runtime-settings-cache.js
 *
 * Firefox/Chromium 공통 런타임 설정 hot snapshot.
 * - content script마다 storage.sync.get()을 반복하지 않는다.
 * - 페이지당 local snapshot을 한 번 읽고 모든 content script가 공유한다.
 * - snapshot이 없을 때만 sync 전체를 한 번 읽어 복구한다.
 * - 설정 변경은 storage.onChanged로 메모리/local snapshot에 즉시 반영한다.
 */
(() => {
  "use strict";
  if (globalThis.DCBRuntimeSettingsCache) return;

  const api = typeof browser !== "undefined" ? browser : chrome;
  const HOT_KEY = "dcbRuntimeSettingsHotCacheV1";
  const VERSION = 1;
  let state = null;
  let source = "pending";
  let writeTimer = null;
  let writeQueue = Promise.resolve();

  function clone(value) {
    if (value == null) return value;
    try { return structuredClone(value); } catch (_) {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }
  }

  function select(keys) {
    const data = state && typeof state === "object" ? state : {};
    if (keys == null) return clone(data);
    if (typeof keys === "string") return { [keys]: clone(data[keys]) };
    if (Array.isArray(keys)) {
      const out = {};
      keys.forEach((key) => { if (key in data) out[key] = clone(data[key]); });
      return out;
    }
    if (keys && typeof keys === "object") {
      const out = {};
      for (const [key, fallback] of Object.entries(keys)) {
        out[key] = key in data ? clone(data[key]) : clone(fallback);
      }
      return out;
    }
    return {};
  }

  function persistSoon() {
    if (!api?.storage?.local || !state) return;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      const snapshot = clone(state);
      const job = writeQueue.then(() => api.storage.local.set({
        [HOT_KEY]: { version: VERSION, updatedAt: Date.now(), data: snapshot }
      }));
      writeQueue = job.catch(() => {});
    }, 20);
  }

  async function load() {
    if (api?.storage?.local) {
      try {
        const stored = await api.storage.local.get({ [HOT_KEY]: null });
        const record = stored?.[HOT_KEY];
        if (record?.version === VERSION && record?.data && typeof record.data === "object") {
          state = record.data;
          source = "hot";
          return state;
        }
      } catch (_) {}
    }

    // Cold recovery only. Once written, later navigations use local snapshot.
    if (api?.storage?.sync) {
      try {
        state = await api.storage.sync.get(null);
        source = "sync-recovery";
        persistSoon();
        return state;
      } catch (_) {}
    }
    state = {};
    source = "empty";
    return state;
  }

  const ready = load();

  function get(keys, callback) {
    const promise = ready.then(() => select(keys));
    if (typeof callback === "function") {
      promise.then((value) => queueMicrotask(() => callback(value))).catch(() => queueMicrotask(() => callback(select(keys))));
      return;
    }
    return promise;
  }

  function peek(keys) {
    if (!state) return null;
    return select(keys);
  }

  try {
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      const apply = () => {
        if (!state || typeof state !== "object") state = {};
        for (const [key, change] of Object.entries(changes || {})) {
          if (typeof change?.newValue === "undefined") delete state[key];
          else state[key] = clone(change.newValue);
        }
        source = "change";
        persistSoon();
      };
      if (state) apply();
      else ready.then(apply).catch(() => {});
    });
  } catch (_) {}

  globalThis.DCBRuntimeSettingsCache = Object.freeze({
    HOT_KEY,
    VERSION,
    ready,
    get,
    peek,
    get source() { return source; }
  });
})();
