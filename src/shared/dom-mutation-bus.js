/* Shared DOM mutation bus.
 *
 * Firefox content scripts pay a relatively high cost when many independent
 * MutationObservers watch the same subtree. Keep one observer per frame and
 * fan out coalesced mutation batches to feature subscribers instead.
 */
(() => {
  if (globalThis.DCBDomMutationBus) return;

  const subscribers = new Map();
  let pendingRecords = [];
  let observer = null;
  let observedRoot = null;
  let observedOptions = '';
  let frame = null;
  let timer = null;
  let rootReadyHandlerInstalled = false;

  function getElement(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) return node;
    return node.parentElement || null;
  }

  function isOwnedMutation(record) {
    const target = getElement(record.target);
    if (target?.closest?.("[data-dcb-owned]")) return true;
    if (record.type !== "childList") return false;
    let hasElements = false;
    for (const nodes of [record.addedNodes, record.removedNodes]) {
      for (const node of nodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        hasElements = true;
        if (!node.closest("[data-dcb-owned]")) return false;
      }
    }
    return hasElements;
  }

  function matchesOptions(record, options, ownedCache) {
    if (options.types && !options.types.has(record.type)) return false;
    if (record.type === "attributes" && options.attributes && !options.attributes.has(record.attributeName)) return false;
    if (options.ignoreOwned !== false) {
      let owned = ownedCache.get(record);
      if (owned === undefined) {
        owned = isOwnedMutation(record);
        ownedCache.set(record, owned);
      }
      if (owned) return false;
    }
    return true;
  }

  function flush() {
    frame = timer = null;
    if (!pendingRecords.length || !subscribers.size) {
      pendingRecords.length = 0;
      return;
    }

    const records = pendingRecords;
    pendingRecords = [];
    const ownedCache = new WeakMap();
    for (const subscriber of subscribers.values()) {
      const filtered = subscriber.options.raw
        ? records
        : records.filter((record) => matchesOptions(record, subscriber.options, ownedCache));
      if (!filtered.length) continue;
      try {
        subscriber.handler(filtered);
      } catch (error) {
        console.error("[DCB DOM bus] subscriber failed:", subscriber.id, error);
      }
    }
  }

  function scheduleFlush() {
    if (frame !== null || timer !== null || !pendingRecords.length) return;
    if (!document.hidden && typeof requestAnimationFrame === "function") {
      frame = requestAnimationFrame(flush);
    } else {
      // Hidden tabs may suspend animation frames while the site continues to
      // mutate. Drain batches on a timer so returning to the tab costs less.
      timer = setTimeout(flush, document.hidden ? 250 : 16);
    }
  }

  function cancelFlush() {
    if (frame !== null) cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    frame = timer = null;
  }

  function visibilityChanged() {
    cancelFlush();
    scheduleFlush();
  }

  function enqueue(records) {
    if (!records.length) return;
    if (pendingRecords.length === 0) pendingRecords = records;
    else for (const record of records) pendingRecords.push(record);
    scheduleFlush();
  }

  function buildObserveOptions() {
    let childList = false;
    let characterData = false;
    let attributes = false;
    let allAttributes = false;
    let needOldValue = false;
    const attributeNames = new Set();

    for (const subscriber of subscribers.values()) {
      const { options } = subscriber;
      const types = options.types;
      const wantsAll = options.raw || !types;
      if (wantsAll || types.has("childList")) childList = true;
      if (wantsAll || types.has("characterData")) characterData = true;
      if (wantsAll || types.has("attributes")) {
        attributes = true;
        needOldValue = needOldValue || options.attributeOldValue === true;
        if (!options.attributes) allAttributes = true;
        else options.attributes.forEach((name) => attributeNames.add(name));
      }
    }

    const result = { subtree: true };
    if (childList) result.childList = true;
    if (characterData) result.characterData = true;
    if (attributes) {
      result.attributes = true;
      if (needOldValue) result.attributeOldValue = true;
      if (!allAttributes && attributeNames.size) result.attributeFilter = [...attributeNames].sort();
    }
    return result;
  }

  function reconnectObserver() {
    if (!subscribers.size) {
      observer?.disconnect(); observer = null; observedRoot = null; observedOptions = '';
      document.removeEventListener("visibilitychange", visibilityChanged);
      cancelFlush();
      pendingRecords.length = 0;
      return;
    }

    const root = document.documentElement;
    if (!root) {
      if (!rootReadyHandlerInstalled) {
        rootReadyHandlerInstalled = true;
        document.addEventListener("readystatechange", () => {
          rootReadyHandlerInstalled = false;
          reconnectObserver();
        }, { once: true });
      }
      return;
    }

    const options = buildObserveOptions();
    if (!options.childList && !options.characterData && !options.attributes) return;
    const signature = JSON.stringify(options);
    if (observer && observedRoot === root && observedOptions === signature) return;
    // Lazy feature registration must not discard mutations queued for existing
    // filters. Reuse the observer; only update its union of requested options.
    if (observer) {
      enqueue(observer.takeRecords());
      if (observedRoot !== root) observer.disconnect();
    } else {
      document.addEventListener("visibilitychange", visibilityChanged);
      observer = new MutationObserver(enqueue);
    }
    observer.observe(root, options);
    observedRoot = root; observedOptions = signature;
    if (pendingRecords.length) scheduleFlush();
  }

  function subscribe(id, handler, options = {}) {
    if (!id || typeof handler !== "function") return () => {};
    const normalized = {
      raw: options.raw === true,
      ignoreOwned: options.ignoreOwned !== false,
      types: Array.isArray(options.types) ? new Set(options.types) : null,
      attributes: Array.isArray(options.attributes) ? new Set(options.attributes) : null,
      attributeOldValue: options.attributeOldValue === true
    };
    const subscription = { id, handler, options: normalized };
    subscribers.set(id, subscription);
    reconnectObserver();
    return () => {
      if (subscribers.get(id) !== subscription) return;
      subscribers.delete(id);
      reconnectObserver();
    };
  }

  function unsubscribe(id) {
    if (!subscribers.delete(id)) return;
    reconnectObserver();
  }

  globalThis.DCBDomMutationBus = Object.freeze({ subscribe, unsubscribe });
})();
