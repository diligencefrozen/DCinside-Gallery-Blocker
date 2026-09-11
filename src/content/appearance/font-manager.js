/* Reading fonts are an opt-in layer; removing the layer restores the site's CSS. */
(() => {
  if (!window.DCBFont || !globalThis.chrome?.storage?.sync) return;

  const STYLE_ID = "dcb-page-font-style";
  const LINK_ID = "dcb-page-google-font";
  const SIZE_ATTR = "data-dcb-font-size";
  const KEEP_ATTR = "data-dcb-font-keep";
  const ROOTS = [
    ".gall_list .gall_tit", ".title_subject", ".write_div",
    ".cmt_txtbox", ".reply_txtbox", ".usertxt",
    ".dcbpv-title", ".dcbpv-html", ".dcbpv-comment-body"
  ].join(",");
  const TEXT_NODES = "p,div,span,a,b,strong,em,i,u,s,small,mark,code,pre,blockquote,ul,ol,li,h1,h2,h3,h4,h5,h6,td,th,font,label";
  const EXCLUDED = [
    "button", "input", "textarea", "select", "svg", "iframe", "video", "audio",
    ".sp_img", '[class*="icon"]', '[class^="ico"]', '[class*=" ico"]',
    '[class*="dccon"]', '[class*="txtcon"]', '[class*="emot"]',
    ".dcbpv-btn", ".dcbpv-filter-chip", ".dcbpv-filter-reveal", ".dcb-uid-badge",
    ".gall_writer", ".ub-writer", ".cmt_nickbox", ".user_data_list",
    ".dcb-writer-tools", ".dc-member-ip-chip",
    '[data-dcb-ui]', '[contenteditable="true"]'
  ].join(",");
  const observedOptions = { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] };
  let active = false;
  let conf = { ...DCBFont.STORAGE_DEFAULTS };
  let requestVersion = 0;
  let refreshTimer = null;
  const decorated = new Set();

  function ensureNode(id, tagName) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement(tagName);
      node.id = id;
      (document.head || document.documentElement).appendChild(node);
    }
    return node;
  }

  function undecorate() {
    for (const node of decorated) {
      node.removeAttribute(SIZE_ATTR);
      node.removeAttribute(KEEP_ATTR);
    }
    decorated.clear();
  }

  function clearFont() {
    active = false;
    observer.disconnect();
    clearTimeout(refreshTimer);
    refreshTimer = null;
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(LINK_ID)?.remove();
    undecorate();
  }

  function refresh() {
    refreshTimer = null;
    if (!active || !document.documentElement) return;
    observer.disconnect();
    const style = ensureNode(STYLE_ID, "style");
    // Measure with our layer disabled, so nested em sizes never multiply again.
    style.disabled = true;
    undecorate();
    try {
      const candidates = new Set();
      const protectedNodes = new Set();
      for (const root of document.querySelectorAll(ROOTS)) {
        if (root.closest(EXCLUDED)) continue;
        candidates.add(root);
        for (const node of root.querySelectorAll(TEXT_NODES)) candidates.add(node);
        for (const node of root.querySelectorAll(EXCLUDED)) protectedNodes.add(node);
      }

      const measurements = [];
      const preserved = [];
      for (const node of candidates) {
        if (node.closest(EXCLUDED)) continue;
        const native = getComputedStyle(node);
        const size = Number.parseFloat(native.fontSize);
        if (!Number.isFinite(size) || size <= 0) continue;
        measurements.push([node, String(Math.round(size * 100) / 100)]);
      }
      for (const node of protectedNodes) {
        const native = getComputedStyle(node);
        preserved.push([node, native.fontFamily, native.fontSize, native.lineHeight]);
      }

      const sizes = new Set();
      for (const [node, size] of measurements) {
        node.setAttribute(SIZE_ATTR, size);
        decorated.add(node);
        sizes.add(size);
      }
      const keepRules = preserved.map(([node, family, size, lineHeight], index) => {
        node.setAttribute(KEEP_ATTR, String(index));
        decorated.add(node);
        return `[${KEEP_ATTR}="${index}"] { font-family:${family} !important; font-size:${size} !important; line-height:${lineHeight} !important; }`;
      });
      const scale = DCBFont.normalizeFontScale(conf.dcbFontScale) / 100;
      const family = DCBFont.cssFontStack(DCBFont.getEffectiveFontFamily(conf));
      const sizeRules = [...sizes].map((size) =>
        `[${SIZE_ATTR}="${size}"] { font-size:${Math.round(Number(size) * scale * 100) / 100}px !important; }`
      );
      style.textContent = `
        [${SIZE_ATTR}] { font-family:${family} !important; }
        ${scale === 1 ? "" : sizeRules.join("\n")}
        ${scale === 1 ? "" : `
          .write_div[${SIZE_ATTR}], .cmt_txtbox[${SIZE_ATTR}], .reply_txtbox[${SIZE_ATTR}],
          .usertxt[${SIZE_ATTR}], .dcbpv-html[${SIZE_ATTR}], .dcbpv-comment-body[${SIZE_ATTR}] {
            line-height:1.6 !important; overflow-wrap:anywhere;
          }
          .write_div [${SIZE_ATTR}], .cmt_txtbox [${SIZE_ATTR}], .reply_txtbox [${SIZE_ATTR}],
          .dcbpv-html [${SIZE_ATTR}], .dcbpv-comment-body [${SIZE_ATTR}] { line-height:1.6 !important; }
          .gall_list .gall_tit[${SIZE_ATTR}] { height:auto !important; line-height:1.5 !important; }
        `}
        ${keepRules.join("\n")}
      `;
    } finally {
      style.disabled = false;
      if (active) observer.observe(document.documentElement, observedOptions);
    }
  }

  function scheduleRefresh() {
    if (active && refreshTimer === null) refreshTimer = setTimeout(refresh, 80);
  }

  const observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      const target = record.target;
      if (target.nodeType === 1 && (target.matches(ROOTS) || target.closest(ROOTS))) return true;
      if (record.type === "attributes" && target.nodeType === 1 && target.querySelector(ROOTS)) return true;
      return [...record.addedNodes, ...record.removedNodes].some((node) =>
        node.nodeType === 1 && (node.matches(ROOTS) || node.querySelector(ROOTS))
      );
    });
    if (relevant) scheduleRefresh();
  });

  function applyFont(settings) {
    conf = { ...DCBFont.STORAGE_DEFAULTS, ...settings };
    if (conf.dcbApplyFontToDc !== true) {
      clearFont();
      return;
    }
    active = true;
    if (!document.documentElement) return;
    const link = ensureNode(LINK_ID, "link");
    link.rel = "stylesheet";
    const href = DCBFont.googleFontHref(DCBFont.getEffectiveFontFamily(conf));
    if (link.getAttribute("href") !== href) link.href = href;
    refresh();
  }

  function loadAndApply() {
    const version = ++requestVersion;
    chrome.storage.sync.get(DCBFont.STORAGE_DEFAULTS, (settings) => {
      if (version !== requestVersion || chrome.runtime?.lastError) return;
      applyFont(settings);
    });
  }

  loadAndApply();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndApply, { once: true });
  }
  window.addEventListener("load", scheduleRefresh, { once: true });
  window.addEventListener("resize", scheduleRefresh);
  document.addEventListener("load", (event) => {
    if (event.target?.tagName === "LINK" && event.target.id !== LINK_ID) scheduleRefresh();
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !Object.keys(DCBFont.STORAGE_DEFAULTS).some((key) => key in changes)) return;
    // OFF takes effect before any pending storage callback can restore old settings.
    if (changes.dcbApplyFontToDc && changes.dcbApplyFontToDc.newValue !== true) clearFont();
    loadAndApply();
  });
})();
