// Compact mode changes density tokens; Writer Layout retains ordering and clipping ownership.
(() => {
  const STORAGE_KEY = "compactListEnabled";
  const ROOT_CLASS = "dcb-compact-list-mode";
  const STYLE_ID = "dcb-compact-list-style";
  const DEFAULTS = { [STORAGE_KEY]: false };
  let enabled = false;

  function isGalleryListPage() {
    return /^\/(?:board|mgallery\/board|mini\/board|person\/board)\/lists(?:\/|$)/.test(location.pathname);
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (style) return style;
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.dcbOwned = "compact-list";
    style.textContent = `
      html.${ROOT_CLASS} .gall_list tbody tr > td {
        padding-top:1px !important;
        padding-bottom:1px !important;
        height:auto !important;
      }
      html.${ROOT_CLASS} .gall_list tbody tr :is(.gall_tit,.gall_tit a,.gall_date,.gall_count,.gall_recommend) {
        line-height:1.18 !important;
      }
      html.${ROOT_CLASS} .dcb-writer-layout[data-dcb-writer-context="list"] {
        --dcb-writer-row-height:18px;
        --dcb-writer-badge-height:13px;
        --dcb-writer-normal-gap:1px;
        --dcb-writer-uid-size:9px;
        --dcb-writer-uid-padding:3px;
      }
      html.${ROOT_CLASS} .gall_list :is(.reply_num,.icon_img,.sp_img,.mini_img) {
        vertical-align:middle !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    return style;
  }

  function applyCompactMode() {
    ensureStyle();
    document.documentElement.classList.toggle(ROOT_CLASS, enabled && isGalleryListPage());
  }

  function boot() {
    globalThis.DCBRuntimeSettingsCache.get(DEFAULTS, (conf) => {
      enabled = !!conf[STORAGE_KEY];
      applyCompactMode();
    });
    (globalThis.DCBRuntimeSettingsCache?.onChanged || chrome.storage.onChanged).addListener((changes, area) => {
      if (area !== "sync" || !changes[STORAGE_KEY]) return;
      enabled = !!changes[STORAGE_KEY].newValue;
      applyCompactMode();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
