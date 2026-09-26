/* Shared DOM mutation bus.
 *
 * Firefox content scripts pay a relatively high cost when many independent
 * MutationObservers watch the same subtree. Keep one observer per frame and
 * fan out coalesced mutation batches to feature subscribers instead.
 */
(() => {
  if (globalThis.DCBDomMutationBus) return;

  const subscribers = new Map();
  const pendingRecords = [];
  let observer = null;
  let scheduled = false;
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
    const nodes = [...record.addedNodes, ...record.removedNodes].filter((node) => node?.nodeType === Node.ELEMENT_NODE);
    return nodes.length > 0 && nodes.every((node) => node.closest?.("[data-dcb-owned]"));
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
    scheduled = false;
    if (!pendingRecords.length || !subscribers.size) {
      pendingRecords.length = 0;
      return;
    }

    const records = pendingRecords.splice(0, pendingRecords.length);
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
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
    else setTimeout(flush, 16);
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
      if (!allAttributes && attributeNames.size) result.attributeFilter = [...attributeNames];
    }
    return result;
  }

  function reconnectObserver() {
    observer?.disconnect();
    observer = null;
    pendingRecords.length = 0;
    if (!subscribers.size) return;

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
    observer = new MutationObserver((records) => {
      if (!records.length || !subscribers.size) return;
      pendingRecords.push(...records);
      scheduleFlush();
    });
    observer.observe(root, options);
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
    subscribers.set(id, { id, handler, options: normalized });
    reconnectObserver();
    return () => {
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
