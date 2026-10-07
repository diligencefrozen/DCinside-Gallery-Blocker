// uid-badge.js
(() => {
  const BADGE = "dcb-uid-badge";
  const STYLE_ID = "dcb-uid-style";

  const WRITER_SELECTOR = ".gall_writer,.ub-writer";

  let showEnabled = false;

  const isIpLike = (s) =>
    /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s || "").trim());

  function isListWriter(writer) {
    return globalThis.DCBWriterLayout?.detectContext(writer) === "list";
  }

  function removeAllBadges() {
    const writers = new Set();
    document.querySelectorAll(`.${BADGE}`).forEach((el) => {
      const writer = el.closest(WRITER_SELECTOR);
      if (writer) writers.add(writer);
      el.remove();
    });
    writers.forEach((writer) => globalThis.DCBWriterLayout?.cleanup(writer));
  }

  function removeInjectedStyle() {
    const st = document.getElementById(STYLE_ID);
    if (st) st.remove();

    const legacyStyle = document.getElementById(BADGE);
    if (legacyStyle && legacyStyle.tagName === "STYLE") {
      legacyStyle.remove();
    }
  }

  function restoreOriginalUi() {
    removeAllBadges();
    removeInjectedStyle();
  }

  function ensureStyle() {
    const legacyStyle = document.getElementById(BADGE);
    if (legacyStyle && legacyStyle.tagName === "STYLE") {
      legacyStyle.remove();
    }

    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement("style");
      st.id = STYLE_ID;
      st.dataset.dcbOwned = "uid-badge";
      (document.head || document.documentElement).appendChild(st);
    }

    st.textContent = `
      .${BADGE}{
        color:#98a2b3 !important;
        background:rgba(152,162,179,.15) !important;
        border-radius:10px !important;
        position:static !important;
        z-index:auto !important;
      }

      .${BADGE}.is-list{border-radius:8px !important;}
    `;
    (document.head || document.documentElement).appendChild(st);
    return st;
  }

  function extractUid(writer) {
    let uid = writer.getAttribute("data-uid") || "";
    if (uid && !isIpLike(uid)) return uid;

    const rf =
      writer.querySelector(".refresherUserData") ||
      writer.parentElement?.querySelector(".refresherUserData");

    if (rf) {
      uid = rf.getAttribute("title") || "";
      if (!uid) {
        const m = (rf.textContent || "").match(/\(([A-Za-z0-9._-]+)\)/);
        if (m) uid = m[1];
      }
      if (uid && !isIpLike(uid)) return uid;
    }

    const link =
      writer.querySelector(
        '.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]'
      ) ||
      writer.parentElement?.querySelector(
        '.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]'
      );

    if (link) {
      const src =
        link.getAttribute("onclick") || link.getAttribute("href") || "";

      let m = src.match(/gallog\.dcinside\.com\/([A-Za-z0-9._-]+)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];

      m = src.match(/\(([A-Za-z0-9._-]+)\)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];
    }

    return "";
  }

  function removeWriterNikconWhitespace(writer) {
    return globalThis.DCBWriterLayout?.removeNativeWhitespace(writer);
  }

  function placeBadge(writer) {
    if (!showEnabled) return;
    if (!(writer instanceof Element)) return;

    removeWriterNikconWhitespace(writer);

    const uid = extractUid(writer);
    const badges = Array.from(writer.querySelectorAll(`:scope .${BADGE}`));

    if (!uid) {
      badges.forEach((el) => el.remove());
      globalThis.DCBWriterLayout?.cleanup(writer);
      return;
    }

    let span = badges[0] || null;
    badges.slice(1).forEach((el) => el.remove());

    if (!span) {
      span = document.createElement("span");
      span.className = BADGE;
      span.setAttribute("data-dcb-owned", "1");
    }

    const listMode = isListWriter(writer);
    span.dataset.fullUid = uid;
    span.title = uid;
    span.classList.toggle("is-list", listMode);

    let value = span.querySelector(":scope > .dcb-uid-value");
    if (!value) {
      value = document.createElement("span");
      value.className = "dcb-uid-value";
      span.replaceChildren(document.createTextNode("("), value, document.createTextNode(")"));
    }
    if (value.textContent !== uid) value.textContent = uid;
    globalThis.DCBWriterLayout?.attachUid(writer, span);
  }

  function scan() {
    if (!showEnabled) {
      restoreOriginalUi();
      return;
    }

    ensureStyle();
    document.querySelectorAll(WRITER_SELECTOR).forEach(placeBadge);
  }

  function isUidOwnNode(node) {
    return !!(
      node &&
      node.nodeType === 1 &&
      (
        node.closest?.("[data-dcb-owned]") ||
        node.id === STYLE_ID ||
        node.classList?.contains(BADGE) ||
        node.closest?.(`.${BADGE}`)
      )
    );
  }

  const pendingWriters = new Set();

  function collectWritersFromNode(node) {
    if (!(node instanceof Element) || isUidOwnNode(node)) return;
    const closest = node.matches?.(WRITER_SELECTOR) ? node : node.closest?.(WRITER_SELECTOR);
    if (closest) pendingWriters.add(closest);
    node.querySelectorAll?.(WRITER_SELECTOR).forEach((writer) => pendingWriters.add(writer));
  }

  let scheduled = false;
  function handleDomMutations(mutations) {
    if (!showEnabled) return;
    for (const m of mutations) {
      if (isUidOwnNode(m.target)) continue;
      collectWritersFromNode(m.target);
      if (m.type === "childList") m.addedNodes.forEach(collectWritersFromNode);
    }
    if (!pendingWriters.size || scheduled) return;

    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const writers = [...pendingWriters];
      pendingWriters.clear();
      if (!showEnabled) return;
      ensureStyle();
      writers.forEach((writer) => { if (writer.isConnected) placeBadge(writer); });
    });
  }

  let unsubscribeDomBus = null;
  function startDomWatch() {
    if (!showEnabled || unsubscribeDomBus || !globalThis.DCBDomMutationBus) return;
    unsubscribeDomBus = globalThis.DCBDomMutationBus.subscribe(
      "uid-badge",
      handleDomMutations,
      { types: ["childList", "attributes"], attributes: ["data-uid", "data-full-uid", "data-memo-uid", "title", "href"] }
    );
  }

  function applySetting(value) {
    showEnabled = value === true;
    if (!showEnabled) {
      unsubscribeDomBus?.();
      unsubscribeDomBus = null;
      pendingWriters.clear();
      restoreOriginalUi();
      return;
    }
    startDomWatch();
    const run = () => scan();
    if (globalThis.DCBStartupScheduler) globalThis.DCBStartupScheduler.schedule("uid-badge:init", run, "normal");
    else requestAnimationFrame(run);
  }

  // Settings hydration owns the single initial pass; there is no speculative
  // DOMContentLoaded scan before the feature's ON/OFF state is known.
  globalThis.DCBRuntimeSettingsCache.get({ showUidBadge: false }, ({ showUidBadge }) => applySetting(showUidBadge));
  (globalThis.DCBRuntimeSettingsCache?.onChanged || chrome.storage.onChanged).addListener((changes, area) => {
    if (area === "sync" && changes.showUidBadge) applySetting(changes.showUidBadge.newValue);
  });
})();
