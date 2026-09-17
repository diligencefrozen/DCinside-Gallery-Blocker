/*
 * keyword-settings-hot-cache.js
 *
 * 목적:
 * - chrome.storage.sync가 느리게 깨어나는 경우에도 키워드 차단/숨기기 설정을
 *   chrome.storage.local의 hot snapshot에서 먼저 읽어 초기 화면 flash를 줄인다.
 * - sync 저장소가 최종 source of truth이며, sync 결과가 도착하면 hot snapshot을 갱신한다.
 */
(() => {
  "use strict";
  if (globalThis.DCBKeywordSettingsHotCache) return;

  const HOT_KEY = "dcbKeywordSettingsHotCacheV1";
  const VERSION = 1;
  const DEFAULTS = Object.freeze({
    keywordBlockEnabled: false,
    blockedKeywords: [],
    keywordBlockTargets: {
      listTitle: true,
      viewTitle: true,
      viewBody: true,
      comments: true
    },
    keywordHideEnabled: false,
    hiddenKeywords: [],
    keywordHideTargets: {
      listTitle: true,
      viewTitle: true,
      viewBody: true,
      comments: true
    }
  });

  let lastHot = null;
  let lastSync = null;
  const listeners = new Set();

  function clone(value) {
    try {
      return structuredClone(value);
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function normalize(raw = {}) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      keywordBlockEnabled: !!src.keywordBlockEnabled,
      blockedKeywords: Array.isArray(src.blockedKeywords) ? src.blockedKeywords.slice() : [],
      keywordBlockTargets: {
        ...DEFAULTS.keywordBlockTargets,
        ...(src.keywordBlockTargets && typeof src.keywordBlockTargets === "object" ? src.keywordBlockTargets : {})
      },
      keywordHideEnabled: !!src.keywordHideEnabled,
      hiddenKeywords: Array.isArray(src.hiddenKeywords) ? src.hiddenKeywords.slice() : [],
      keywordHideTargets: {
        ...DEFAULTS.keywordHideTargets,
        ...(src.keywordHideTargets && typeof src.keywordHideTargets === "object" ? src.keywordHideTargets : {})
      }
    };
  }

  function same(a, b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
  }

  function emit(config, source) {
    const normalized = normalize(config);
    listeners.forEach((listener) => {
      try {
        listener(clone(normalized), { source });
      } catch (error) {
        console.warn("[DCB] keyword hot-cache listener failed:", error);
      }
    });
  }

  async function write(config) {
    if (!chrome?.storage?.local) return;
    const data = normalize(config);
    try {
      await chrome.storage.local.set({
        [HOT_KEY]: {
          version: VERSION,
          updatedAt: Date.now(),
          data
        }
      });
      lastHot = data;
    } catch (_) {}
  }

  const hotReady = (async () => {
    if (!chrome?.storage?.local) return null;
    try {
      const result = await chrome.storage.local.get({ [HOT_KEY]: null });
      const record = result?.[HOT_KEY];
      if (!record || record.version !== VERSION || !record.data || typeof record.data !== "object") return null;
      lastHot = normalize(record.data);
      emit(lastHot, "hot");
      return clone(lastHot);
    } catch (_) {
      return null;
    }
  })();

  const syncReady = (async () => {
    // local snapshot을 반드시 먼저 적용한다. sync가 우연히 먼저 끝난 뒤
    // 늦게 도착한 오래된 local 값이 UI/필터를 되돌리는 race를 막는다.
    await hotReady;
    if (!chrome?.storage?.sync) return null;
    try {
      const config = normalize(await chrome.storage.sync.get(DEFAULTS));
      lastSync = config;
      if (!lastHot || !same(lastHot, config)) emit(config, "sync");
      await write(config);
      return clone(config);
    } catch (_) {
      return null;
    }
  })();

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    if (lastHot) queueMicrotask(() => listener(clone(lastHot), { source: "hot" }));
    else if (lastSync) queueMicrotask(() => listener(clone(lastSync), { source: "sync" }));
    return () => listeners.delete(listener);
  }

  globalThis.DCBKeywordSettingsHotCache = Object.freeze({
    HOT_KEY,
    VERSION,
    DEFAULTS,
    hotReady,
    syncReady,
    subscribe,
    write,
    normalize
  });
})();
