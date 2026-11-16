/*
 * PC DC's own OutLink warning only. Runs in MAIN at document_start so the
 * site's setter updates both its private click-handler cache and its setting.
 * Verified against head_scripts_combined.min.js?v=1794465317 (2026-11-16):
 * unchecked -> OutLink.toggleWarning -> outlink_warning='N' -> no DC layer.
 * No navigation handler, browser protection, cookie or other setting is changed.
 */
(() => {
  "use strict";
  if (location.hostname !== "gall.dcinside.com" || !/^https?:$/.test(location.protocol)) return;
  if (window.__DCB_OUTLINK_OFF__) return;
  window.__DCB_OUTLINK_OFF__ = true;

  const key = "outlink_warning";
  const wrapped = new WeakMap();
  let current, setter, applying = false, lastFailure = "", pendingState = "waiting";

  function status(state, reason = "") {
    pendingState = state;
    const root = document.documentElement;
    if (root) {
      root.dataset.dcbOutlinkState = state;
      if (reason) root.dataset.dcbOutlinkReason = reason;
      else delete root.dataset.dcbOutlinkReason;
    }
    if (reason && reason !== lastFailure) {
      lastFailure = reason;
      console.warn("[DCB] DC external-link warning could not be disabled:", reason);
    }
  }

  function uncheck() {
    const checkbox = document.getElementById("chk_outlink");
    if (checkbox && checkbox.checked) checkbox.checked = false;
  }

  function forceOff() {
    if (applying || typeof setter !== "function") return false;
    applying = true;
    try {
      // Use the site's setter, not a synthetic checkbox click. Its private
      // outlinkWarningDisabledCache is what the actual link handler checks.
      setter.call(current, { checked: false });
      if (localStorage.getItem(key) !== "N") throw Error("outlink_warning was not saved as N");
      uncheck();
      status("off");
      return true;
    } catch (error) {
      status("failed", String(error?.message || error));
      return false;
    } finally { applying = false; }
  }

  function attach(api) {
    current = api;
    setter = wrapped.get(api) || (typeof api?.toggleWarning === "function" ? api.toggleWarning : null);
    if (!setter) { status("unsupported", "OutLink.toggleWarning is unavailable"); return; }
    if (wrapped.has(api)) return;
    const toggle = setter;
    wrapped.set(api, toggle);
    setter = toggle;
    api.toggleWarning = function () { return forceOff(); };
    // Never reload an ON value into the site's private cache while this
    // extension is active. init's lexical initial read is repaired after init.
    api.applyWarningCheckboxState = function () { return forceOff(); };
    const init = api.init;
    if (typeof init === "function") api.init = function (...args) {
      const result = init.apply(this, args);
      forceOff();
      return result;
    };
    // Assignment normally precedes pub.init(), when its storage is still null.
    // A microtask also handles injection into an already initialized page.
    queueMicrotask(() => { if (current === api && pendingState !== "off") forceOff(); });
  }

  // The site assigns OutLink and immediately calls pub.init(). Intercept that
  // assignment once, before any settings popup has been opened.
  const descriptor = Object.getOwnPropertyDescriptor(window, "OutLink");
  try {
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(window, "OutLink", {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() { return current; },
        set(value) { attach(value); }
      });
      if (descriptor?.value) attach(descriptor.value);
    } else if (window.OutLink) attach(window.OutLink);
    else status("unsupported", "OutLink cannot be observed");
  } catch (error) { status("failed", String(error?.message || error)); }

  // Repair a stale asynchronous site read immediately before its delegated
  // warning handler. Let the original anchor and every other handler run.
  document.addEventListener("click", event => {
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    try {
      const url = new URL(anchor.getAttribute("href"), location.href);
      if (/^https?:$/.test(url.protocol) && !/(^|\.)dcinside\.com$/i.test(url.hostname)) forceOff();
    } catch (_) {}
  }, true);
  window.addEventListener("storage", event => { if (event.key === key || event.key === null) forceOff(); });
  window.addEventListener("pageshow", () => { if (setter) forceOff(); });
  document.addEventListener("DOMContentLoaded", () => {
    observer.disconnect();
    if (setter) forceOff();
    else status("unsupported", "This page has no supported DC OutLink API");
  }, { once: true });
  // Observe parsing only. Subsequent DC redraws call the wrapped state method;
  // native ON clicks and outgoing clicks also repair state directly.
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.id === "chk_outlink" || node.querySelector?.("#chk_outlink"))))) {
      if (setter) forceOff();
    }
    if (document.documentElement && !document.documentElement.dataset.dcbOutlinkState) status(pendingState);
  });
  observer.observe(document, { childList: true, subtree: true });
  status("waiting");
})();
