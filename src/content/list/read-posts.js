/* Device-local read history. Only a real top-level article visit records a read. */
(() => {
  "use strict";
  if (globalThis.__DCB_READ_POSTS__) return;
  try { if (window.top !== window) return; } catch (_) { return; }

  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_KEY = "dcbReadPosts";
  const HIGHLIGHT_KEY = "readPostsHighlightEnabled";
  const READ_CLASS = "dcb-read-post";
  const ROW_SELECTOR = ".gall_list tr[data-no]";

  function postNumber(value) {
    const text = String(value || "").trim();
    if (!/^\d{1,20}$/.test(text)) return "";
    return text.replace(/^0+/, "");
  }

  function galleryContext(raw) {
    try {
      const url = new URL(raw);
      const match = url.pathname.match(/^\/(?:(mgallery|mini|person)\/)?board\/(lists|view)\/?$/);
      const id = String(url.searchParams.get("id") || "").trim().toLowerCase();
      if (!/^https?:$/.test(url.protocol) || url.hostname !== "gall.dcinside.com"
        || url.username || url.password || url.port || !match || !/^[a-z0-9_-]{1,80}$/.test(id)) return null;
      return { prefix: `${match[1] || "gallery"}:${id}:`, mode: match[2], no: postNumber(url.searchParams.get("no")) };
    } catch (_) { return null; }
  }

  const context = galleryContext(location.href);
  if (!context || !api?.storage?.local) return;
  globalThis.__DCB_READ_POSTS__ = true;

  let readPosts = new Set();
  let storageRevision = 0;
  let hydration = null;
  // Keep native rows visible until the saved display preference is known.
  let highlightEnabled = false;
  let highlightRevision = 0;
  let highlightHydration = null;
  const rowsByIdentity = new Map();
  const identityByRow = new WeakMap();

  function forgetRow(row) {
    const previous = identityByRow.get(row);
    if (!previous) return;
    const rows = rowsByIdentity.get(previous);
    rows?.delete(row);
    if (!rows?.size) rowsByIdentity.delete(previous);
    identityByRow.delete(row);
  }

  function applyRow(row) {
    if (!row.isConnected || !row.matches(ROW_SELECTOR) || row.closest("[data-dcb-owned]")) return;
    const no = postNumber(row.dataset.no);
    const identity = no ? context.prefix + no : "";
    if (identityByRow.get(row) !== identity) {
      forgetRow(row);
      if (identity) {
        identityByRow.set(row, identity);
        if (!rowsByIdentity.has(identity)) rowsByIdentity.set(identity, new Set());
        rowsByIdentity.get(identity).add(row);
      }
    }
    row.classList.toggle(READ_CLASS, highlightEnabled && !!identity && readPosts.has(identity));
  }

  function collectRows(root, rows) {
    if (!root?.querySelectorAll || (root !== document && !root.isConnected)) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.closest("[data-dcb-owned]")) return;
      const enclosing = root.closest(ROW_SELECTOR);
      if (enclosing) rows.add(enclosing);
    }
    root.querySelectorAll(ROW_SELECTOR).forEach((row) => rows.add(row));
  }

  function reconcile(root = document) {
    const rows = new Set();
    collectRows(root, rows);
    rows.forEach(applyRow);
  }

  function updateIdentity(identity) {
    const rows = rowsByIdentity.get(identity);
    if (!rows) return;
    for (const row of rows) {
      if (!row.isConnected) {
        identityByRow.delete(row);
        rows.delete(row);
      } else row.classList.toggle(READ_CLASS, highlightEnabled && readPosts.has(identity));
    }
    if (!rows.size) rowsByIdentity.delete(identity);
  }

  function replaceSnapshot(snapshot) {
    const next = new Set();
    if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
      for (const [identity, timestamp] of Object.entries(snapshot)) {
        if (identity.startsWith(context.prefix) && postNumber(identity.slice(context.prefix.length))
          && Number.isFinite(timestamp) && timestamp > 0) next.add(identity);
      }
    }
    const changed = new Set([...readPosts].filter((identity) => !next.has(identity)));
    next.forEach((identity) => { if (!readPosts.has(identity)) changed.add(identity); });
    readPosts = next;
    changed.forEach(updateIdentity);
  }

  function refreshSnapshot() {
    if (hydration) return hydration;
    const revision = storageRevision;
    hydration = api.storage.local.get({ [STORAGE_KEY]: null }).then((stored) => {
      // A newer storage event can arrive while get() is in flight.
      if (revision === storageRevision) replaceSnapshot(stored?.[STORAGE_KEY]);
      reconcile();
    }).catch(() => {
      // Native content remains visible even when extension storage is unavailable.
      reconcile();
    }).finally(() => { hydration = null; });
    return hydration;
  }

  function recordVisit() {
    if (context.mode !== "view" || !context.no) return;
    // Background serializes writes and validates the trusted sender's URL/frame.
    // Fetches, previews and iframes never execute this top-level entry point.
    try { Promise.resolve(api.runtime.sendMessage({ type: "dcb.readPosts.mark" })).catch(() => {}); } catch (_) {}
  }

  function refreshHighlightSetting() {
    if (highlightHydration) return highlightHydration;
    if (!api.storage.sync) {
      highlightEnabled = true;
      reconcile();
      return Promise.resolve();
    }
    const revision = highlightRevision;
    highlightHydration = api.storage.sync.get({ [HIGHLIGHT_KEY]: true }).then((stored) => {
      // A setting changed in another UI must win over an older get() response.
      if (revision === highlightRevision) highlightEnabled = stored?.[HIGHLIGHT_KEY] !== false;
      reconcile();
    }).catch(() => {
      // Missing or unavailable settings use the documented ON default.
      if (revision !== highlightRevision) return;
      highlightEnabled = true;
      reconcile();
    }).finally(() => { highlightHydration = null; });
    return highlightHydration;
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && Object.prototype.hasOwnProperty.call(changes, HIGHLIGHT_KEY)) {
      highlightRevision += 1;
      highlightEnabled = changes[HIGHLIGHT_KEY].newValue !== false;
      reconcile();
      return;
    }
    if (area !== "local" || !Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;
    storageRevision += 1;
    replaceSnapshot(changes[STORAGE_KEY].newValue);
  });

  globalThis.DCBDomMutationBus?.subscribe("dcb-read-posts", (records) => {
    const rows = new Set();
    for (const record of records) {
      if (record.type === "attributes") {
        if (identityByRow.has(record.target) || record.target.matches?.(ROW_SELECTOR)) rows.add(record.target);
        continue;
      }
      for (const node of record.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || node.isConnected) continue;
        forgetRow(node);
        node.querySelectorAll("tr[data-no]").forEach(forgetRow);
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) collectRows(node, rows);
      }
    }
    rows.forEach((row) => {
      if (!row.matches(ROW_SELECTOR)) {
        forgetRow(row);
        row.classList.remove(READ_CLASS);
      } else applyRow(row);
    });
  }, { types: ["childList", "attributes"], attributes: ["data-no"] });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    refreshSnapshot();
    refreshHighlightSetting();
    recordVisit();
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => reconcile(), { once: true });
  }
  refreshSnapshot();
  refreshHighlightSetting();
  recordVisit();
})();
