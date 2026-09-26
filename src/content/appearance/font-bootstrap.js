/*
 * font-bootstrap.js
 *
 * Sticky, non-blocking first-paint font bridge.
 *
 * Goals:
 * - Never hold the site's first render for extension storage or Google Fonts.
 * - Reuse the last confirmed enabled font synchronously on the next navigation.
 * - Keep that sticky font until the user explicitly disables the font feature.
 * - Leave expensive size/layout measurement to font-manager.js at document_end/idle.
 */
(() => {
  "use strict";
  if (globalThis.__DCB_FONT_BOOTSTRAP__) return;
  globalThis.__DCB_FONT_BOOTSTRAP__ = true;

  const fontApi = window.DCBFont;
  const cache = globalThis.DCBRuntimeSettingsCache;
  const storage = (typeof browser !== "undefined" ? browser : chrome)?.storage;
  if (!fontApi || !cache || !storage) return;

  const STYLE_ID = "dcb-page-font-bootstrap-style";
  // Shared with font-manager. The detailed manager can promote this preload to
  // a normal stylesheet later without issuing a separate URL.
  const LINK_ID = "dcb-page-google-font";
  const STICKY_KEY = "dcbFontStickyV1";
  const STICKY_VERSION = 1;
  const ROOTS = [
    ".gall_list .gall_tit",
    ".title_subject",
    ".write_div",
    ".cmt_txtbox",
    ".reply_txtbox",
    ".usertxt",
    ".dcbpv-title",
    ".dcbpv-html",
    ".dcbpv-comment-body"
  ].join(",");

  let conf = { ...fontApi.STORAGE_DEFAULTS };
  let requestVersion = 0;
  let stickyActive = false;

  function mountPoint() {
    return document.head || document.documentElement;
  }

  function ensureNode(id, tagName) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement(tagName);
      node.id = id;
      node.setAttribute("data-dcb-owned", "font-bootstrap");
      mountPoint()?.appendChild(node);
    }
    return node;
  }

  function normalizeSticky(settings = {}) {
    const merged = { ...fontApi.STORAGE_DEFAULTS, ...settings };
    return {
      version: STICKY_VERSION,
      enabled: merged.dcbApplyFontToDc === true,
      dcbFontFamily: fontApi.normalizeFontFamily(merged.dcbFontFamily) || fontApi.DEFAULT_FONT_FAMILY,
      dcbFontCustomFamily: fontApi.normalizeFontFamily(merged.dcbFontCustomFamily || ""),
      dcbFontScale: fontApi.normalizeFontScale(merged.dcbFontScale)
    };
  }

  function readSticky() {
    try {
      const raw = localStorage.getItem(STICKY_KEY);
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (record?.version !== STICKY_VERSION || record?.enabled !== true) return null;
      return {
        ...fontApi.STORAGE_DEFAULTS,
        dcbApplyFontToDc: true,
        dcbFontFamily: record.dcbFontFamily,
        dcbFontCustomFamily: record.dcbFontCustomFamily,
        dcbFontScale: record.dcbFontScale
      };
    } catch (_) {
      return null;
    }
  }

  function writeSticky(settings) {
    const record = normalizeSticky(settings);
    try {
      if (!record.enabled) {
        localStorage.removeItem(STICKY_KEY);
        stickyActive = false;
        return;
      }
      localStorage.setItem(STICKY_KEY, JSON.stringify(record));
      stickyActive = true;
    } catch (_) {}
  }

  function clearEarlyFont({ clearSticky = false } = {}) {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(LINK_ID)?.remove();
    if (clearSticky) {
      try { localStorage.removeItem(STICKY_KEY); } catch (_) {}
      stickyActive = false;
    }
  }

  function ensureGoogleFontNonBlocking(familyName) {
    const href = fontApi.googleFontHref(familyName);
    const link = ensureNode(LINK_ID, "link");
    if (link.dataset.dcbFontHref === href && (link.rel === "preload" || link.rel === "stylesheet")) return;

    // A document_start stylesheet can delay first paint. Preload the CSS instead;
    // when it is ready, promote it to a stylesheet. Cached fonts therefore become
    // available very quickly without putting the site behind a render-blocking URL.
    link.onload = () => {
      if (link.dataset.dcbFontHref !== href) return;
      link.onload = null;
      link.rel = "stylesheet";
      link.removeAttribute("as");
    };
    link.onerror = () => {
      link.onload = null;
      link.onerror = null;
    };
    link.dataset.dcbFontHref = href;
    link.rel = "preload";
    link.as = "style";
    link.href = href;
  }

  function applyEarlyFont(settings, { persist = true } = {}) {
    conf = { ...fontApi.STORAGE_DEFAULTS, ...conf, ...settings };
    if (conf.dcbApplyFontToDc !== true) {
      clearEarlyFont({ clearSticky: persist });
      return;
    }

    if (persist) writeSticky(conf);
    const familyName = fontApi.getEffectiveFontFamily(conf);
    const family = fontApi.cssFontStack(familyName);
    const style = ensureNode(STYLE_ID, "style");
    style.textContent = `${ROOTS} { font-family:${family} !important; }`;
    ensureGoogleFontNonBlocking(familyName);
  }

  function validateFromRuntime({ delay = 0 } = {}) {
    const version = ++requestVersion;
    const run = () => {
      const hot = cache.peek(fontApi.STORAGE_DEFAULTS);
      if (hot) {
        applyEarlyFont(hot);
        return;
      }
      cache.get(fontApi.STORAGE_DEFAULTS).then((settings) => {
        if (version !== requestVersion) return;
        // A transient cold-cache failure must not throw away a previously confirmed
        // sticky font. Only a real cached/sync state or an explicit storage change
        // is allowed to turn the feature off.
        if (stickyActive && settings?.dcbApplyFontToDc !== true && cache.source === "empty") return;
        applyEarlyFont(settings);
      }).catch(() => {});
    };
    if (delay > 0) setTimeout(run, delay);
    else queueMicrotask(run);
  }

  // Fast path: this is synchronous and performs no extension-storage IPC. Once a
  // font has been enabled on this DCinside origin, the same family is painted on
  // the next navigation immediately. Runtime storage is only a later validator.
  const sticky = readSticky();
  if (sticky) {
    stickyActive = true;
    applyEarlyFont(sticky, { persist: false });
    validateFromRuntime({ delay: 500 });
  } else {
    // First enable / first visit: do not make first paint wait. Resolve the shared
    // hot cache asynchronously and persist it for all following navigations.
    validateFromRuntime();
  }

  try {
    storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      let touched = false;
      const next = { ...conf };
      for (const key of Object.keys(fontApi.STORAGE_DEFAULTS)) {
        if (!(key in (changes || {}))) continue;
        touched = true;
        const change = changes[key];
        if (typeof change?.newValue === "undefined") next[key] = fontApi.STORAGE_DEFAULTS[key];
        else next[key] = change.newValue;
      }
      if (!touched) return;
      ++requestVersion;
      if (next.dcbApplyFontToDc !== true) {
        conf = { ...fontApi.STORAGE_DEFAULTS, ...next };
        clearEarlyFont({ clearSticky: true });
        return;
      }
      applyEarlyFont(next);
    });
  } catch (_) {}
})();
