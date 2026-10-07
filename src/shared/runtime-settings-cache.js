/*
 * runtime-settings-cache.js
 *
 * Firefox/Chromium 공통 런타임 설정 hot snapshot.
 * - content script마다 storage.sync.get()을 반복하지 않는다.
 * - 페이지당 local snapshot을 한 번 읽고 모든 content script가 공유한다.
 * - snapshot이 없을 때만 sync 전체를 한 번 읽어 복구한다.
 * - 설정 변경은 메모리에 반영하고, local snapshot은 background가 소유한다.
 * - 백업/설치 transaction의 중간 변경은 모아서 최종 commit 뒤 한 번 전달한다.
 */
(() => {
  "use strict";
  if (globalThis.DCBRuntimeSettingsCache) return;

  const api = typeof browser !== "undefined" ? browser : chrome;
  const HOT_KEY = "dcbRuntimeSettingsHotCacheV1";
  const VERSION = 1;
  let state = null;
  let source = "pending";
  const BATCH_KEY = "dcbSettingsBatchV1";
  const listeners = new Map();
  const pendingChanges = new Map();
  const startupEvents = [];
  let initialized = false;
  let applyingEpoch = null;
  let committedEpoch = null;
  let listenerId = 0;
  let batchWaiters = [];
  const syncOverrides = new Map();
  const latestLocalChanges = new Map();
  let changeRevision = 0;
  const hydratingCommits = new Set();

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

  function hotData(record, committed = false) {
    if (record?.version !== VERSION || !record.data || typeof record.data !== "object") return false;
    const next = clone(record.data);
    for (const [key, change] of syncOverrides) {
      if (JSON.stringify(next[key]) === JSON.stringify(change.newValue)) syncOverrides.delete(key);
      else if (!committed || change.seenAt > Number(record.updatedAt || 0)) {
        if (change.newValue === undefined) delete next[key];
        else next[key] = clone(change.newValue);
      } else syncOverrides.delete(key);
    }
    return next;
  }

  function settingsDiff(previous, next) {
    const diff = {};
    for (const key of new Set([...Object.keys(previous || {}), ...Object.keys(next)])) {
      if (JSON.stringify(previous?.[key]) !== JSON.stringify(next[key]))
        diff[key] = { oldValue: previous?.[key], newValue: next[key] };
    }
    return diff;
  }

  function acceptHot(record) {
    const next = hotData(record);
    if (!next) return false;
    state = next;
    source = "hot";
    return true;
  }

  function mergeInto(target, changes, area) {
    const merged = target.get(area) || {};
    for (const [key, change] of Object.entries(changes || {})) {
      if (key === BATCH_KEY) continue;
      merged[key] = { ...change, oldValue: key in merged ? merged[key].oldValue : change.oldValue };
    }
    target.set(area, merged);
  }

  function mergeChanges(changes, area) {
    mergeInto(pendingChanges, changes, area);
  }

  function scheduleListener(listener, entry) {
    if (entry.scheduled) return;
    entry.scheduled = true;
    const reconcile = async () => {
      await waitForBatch();
      if (!listeners.has(listener)) return;
      const batches = [...entry.pending];
      entry.pending.clear();
      entry.scheduled = false;
      for (const [area, changes] of batches) {
        if (!Object.keys(changes).length) continue;
        try { listener(changes, area); } catch (error) { console.warn("[DCB] batch listener failed", error); }
      }
    };
    if (globalThis.DCBStartupScheduler) globalThis.DCBStartupScheduler.schedule(`settings-batch:${entry.id}`, reconcile, "normal");
    else setTimeout(reconcile, 0);
  }

  function notify(changes, area) {
    if (!Object.keys(changes).length) return;
    for (const [listener, entry] of listeners) {
      if (entry.scheduled) { mergeInto(entry.pending, changes, area); continue; }
      try { listener(changes, area); } catch (error) { console.warn("[DCB] settings listener failed", error); }
    }
  }

  function finishBatch(epoch) {
    committedEpoch = epoch;
    applyingEpoch = null;
    const batches = [...pendingChanges];
    pendingChanges.clear();
    batchWaiters.splice(0).forEach((resolve) => resolve());
    // Each feature reconciles once per storage area, on a separate browser task.
    // The final memory snapshot is already available to every callback.
    for (const [listener, entry] of listeners) {
      for (const [area, changes] of batches) mergeInto(entry.pending, changes, area);
      scheduleListener(listener, entry);
    }
  }

  function receiveChanges(changes, area, allowIncomplete = false) {
    const marker = area === "local" ? changes[BATCH_KEY]?.newValue : null;
    if (marker?.epoch === committedEpoch) return;
    if (marker && committedEpoch && Number(String(marker.epoch).split(":")[0])
      < Number(String(committedEpoch).split(":")[0])) return;
    if (area === "sync") {
      for (const [key, change] of Object.entries(changes)) syncOverrides.set(key, { newValue: change.newValue, seenAt: Date.now() });
    }
    if (marker?.phase === "applying") applyingEpoch = marker.epoch;
    if (marker?.phase === "committed" && marker.epoch === committedEpoch) return;
    if (marker?.phase === "committed" && applyingEpoch && marker.epoch !== applyingEpoch
      && Number(String(marker.epoch).split(":")[0]) < Number(String(applyingEpoch).split(":")[0])) return;
    if (marker?.phase === "committed") {
      const seenLocal = pendingChanges.get("local") || {};
      const missing = (Array.isArray(marker.localKeys) ? marker.localKeys : [])
        .filter((key) => !(key in changes) && !(key in seenLocal));
      if (missing.length && !allowIncomplete) {
        if (hydratingCommits.has(marker.epoch)) return;
        hydratingCommits.add(marker.epoch);
        applyingEpoch = marker.epoch;
        mergeChanges(changes, area);
        const revision = changeRevision;
        api.storage.local.get(missing).then((values) => {
          const completed = { ...changes };
          for (const key of missing) {
            const recent = latestLocalChanges.get(key);
            completed[key] = recent?.revision > revision ? recent.change : { newValue: values[key] };
          }
          receiveChanges(completed, "local");
        }).catch(() => receiveChanges(changes, area, true))
          .finally(() => hydratingCommits.delete(marker.epoch));
        return;
      }
    }
    if (applyingEpoch || marker?.phase === "committed") {
      mergeChanges(changes, area);
      if (marker?.phase === "committed") {
        const record = changes[HOT_KEY]?.newValue;
        if (record?.version === VERSION && record.data && typeof record.data === "object") {
          // Also covers suspended tabs that missed individual sync events.
          const next = hotData(record, true);
          mergeChanges(settingsDiff(state, next), "sync");
          state = next;
        } else {
          if (!state) state = {};
          for (const [key, change] of Object.entries(pendingChanges.get("sync") || {})) {
            if (change.newValue === undefined) delete state[key];
            else state[key] = clone(change.newValue);
          }
        }
        source = "batch";
        finishBatch(marker.epoch);
      }
      return;
    }
    if (area === "local" && changes[HOT_KEY]) {
      // A navigation can precede its last sync mirror. Accept that later mirror,
      // retaining any newer sync values this document has already observed.
      const next = hotData(changes[HOT_KEY].newValue);
      if (next) { const diff = settingsDiff(state, next); state = next; notify(diff, "sync"); }
    }
    if (area === "sync") {
      if (!state) state = {};
      for (const [key, change] of Object.entries(changes || {})) {
        if (typeof change.newValue === "undefined") delete state[key];
        else state[key] = clone(change.newValue);
      }
      source = "change";
    }
    const visibleChanges = { ...changes };
    delete visibleChanges[BATCH_KEY];
    notify(visibleChanges, area);
  }

  function waitForBatch() {
    return applyingEpoch ? new Promise((resolve) => batchWaiters.push(resolve)) : Promise.resolve();
  }

  async function load() {
    if (api?.storage?.local) {
      try {
        const stored = await api.storage.local.get({ [HOT_KEY]: null, [BATCH_KEY]: null });
        const marker = stored?.[BATCH_KEY];
        if (marker?.phase === "committed") committedEpoch = marker.epoch;
        if (marker?.phase === "applying") {
          applyingEpoch = marker.epoch;
          // Wake an interrupted MV3 worker; recovery serializes with live imports.
          try { Promise.resolve(api.runtime.sendMessage({ type: "dcb.settingsBatch.recover" })).catch(() => {}); } catch (_) {}
        }
        if (acceptHot(stored?.[HOT_KEY])) return state;
      } catch (_) {}
    }

    // Cold recovery only. Once written, later navigations use local snapshot.
    if (api?.storage?.sync) {
      try {
        state = await api.storage.sync.get(null);
        for (const [key, newValue] of Object.entries(state)) syncOverrides.set(key, { newValue, seenAt: Date.now() });
        source = "sync-recovery";
        return state;
      } catch (_) {}
    }
    state = {};
    source = "empty";
    return state;
  }

  // Install the listener before hydration so an import cannot race the snapshot.
  api.storage.onChanged.addListener((changes, area) => {
    changeRevision += 1;
    if (area === "local") {
      for (const [key, change] of Object.entries(changes)) latestLocalChanges.set(key, { change, revision: changeRevision });
    }
    if (!initialized) startupEvents.push([changes, area]);
    else receiveChanges(changes, area);
  });
  const ready = load().then(() => {
    initialized = true;
    startupEvents.splice(0).forEach(([changes, area]) => receiveChanges(changes, area));
    return state;
  });

  function get(keys, callback) {
    const promise = ready.then(waitForBatch).then(() => select(keys));
    if (typeof callback === "function") {
      promise.then((value) => queueMicrotask(() => callback(value))).catch(() => queueMicrotask(() => callback(select(keys))));
      return;
    }
    return promise;
  }

  function peek(keys) {
    if (!state || applyingEpoch) return null;
    return select(keys);
  }

  api.runtime.onMessage.addListener((message) => {
    if (message?.type !== "dcb:settings-batch-committed" || message.epoch === committedEpoch) return;
    // A suspended tab may miss storage events. The single commit notice recovers
    // the final record; the epoch makes this idempotent with storage.onChanged.
    const epochAtRequest = applyingEpoch;
    const revision = changeRevision;
    api.storage.local.get([HOT_KEY, BATCH_KEY]).then(async (stored) => {
      if (stored[BATCH_KEY]?.phase !== "committed" || stored[BATCH_KEY].epoch !== message.epoch) return;
      if (applyingEpoch !== epochAtRequest && applyingEpoch !== message.epoch) return;
      const keys = Array.isArray(stored[BATCH_KEY].localKeys) ? stored[BATCH_KEY].localKeys : [];
      const values = keys.length ? await api.storage.local.get(keys) : {};
      if (applyingEpoch !== epochAtRequest && applyingEpoch !== message.epoch) return;
      const changes = { [HOT_KEY]: { newValue: stored[HOT_KEY] }, [BATCH_KEY]: { newValue: stored[BATCH_KEY] } };
      for (const key of keys) {
        const recent = latestLocalChanges.get(key);
        changes[key] = recent?.revision > revision ? recent.change : { newValue: values[key] };
      }
      // A verified latest commit also releases a tab that missed its BEGIN.
      applyingEpoch = null;
      receiveChanges(changes, "local");
    }).catch(() => {});
  });

  globalThis.DCBRuntimeSettingsCache = Object.freeze({
    HOT_KEY,
    VERSION,
    ready,
    get,
    peek,
    onChanged: Object.freeze({
      addListener(listener) {
        if (typeof listener === "function" && !listeners.has(listener))
          listeners.set(listener, { id: ++listenerId, pending: new Map(), scheduled: false });
      },
      removeListener(listener) { listeners.delete(listener); },
      hasListener(listener) { return listeners.has(listener); }
    }),
    get source() { return source; }
  });
})();
