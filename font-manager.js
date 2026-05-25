/*****************************************************************
 * font-manager.js — 디시인사이드 페이지 글꼴 적용
 *****************************************************************/
(() => {
  if (!window.DCBFont || !globalThis.chrome?.storage?.sync) return;

  const STYLE_ID = "dcb-page-font-style";
  const LINK_ID = "dcb-page-google-font";

  function getRoot() {
    return document.head || document.documentElement;
  }

  function ensureFontLink() {
    let link = document.getElementById(LINK_ID);

    if (!link) {
      link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "stylesheet";
      getRoot().appendChild(link);
    }

    return link;
  }

  function ensureFontStyle() {
    let style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      getRoot().appendChild(style);
    }

    return style;
  }

  function clearFont() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(LINK_ID)?.remove();
  }

  function applyFont(conf = {}) {
    if (conf.dcbApplyFontToDc === false) {
      clearFont();
      return;
    }

    const fontFamily = DCBFont.getEffectiveFontFamily(conf);
    const fontScale = DCBFont.normalizeFontScale(conf.dcbFontScale);
    const ratio = (fontScale / 100).toFixed(2);
    const stack = DCBFont.cssFontStack(fontFamily);
    const scaleRule = fontScale === DCBFont.DEFAULT_FONT_SCALE ? "" : `
      .gall_list td,
      .gall_list th,
      .gall_list a,
      .gall_writer,
      .ub-writer,
      .ub-word,
      .nickname,
      .cmt_info,
      .cmt_txtbox,
      .reply_info,
      .reply_txtbox,
      .usertxt,
      input,
      textarea,
      select,
      button {
        font-size: clamp(12px, calc(1em * var(--dcb-font-scale)), 20px) !important;
      }

      .write_div,
      .view_content_wrap .write_div,
      .gallview_contents .write_div,
      .writing_view_box .write_div,
      #userct .write_div {
        font-size: clamp(13px, calc(1em * var(--dcb-font-scale)), 24px) !important;
      }

      .write_div :where(p, div, span, a, b, strong, em, i, u, s, small, mark, code, pre, blockquote, ul, ol, li),
      .view_content_wrap .write_div :where(p, div, span, a, b, strong, em, i, u, s, small, mark, code, pre, blockquote, ul, ol, li),
      .gallview_contents .write_div :where(p, div, span, a, b, strong, em, i, u, s, small, mark, code, pre, blockquote, ul, ol, li),
      .writing_view_box .write_div :where(p, div, span, a, b, strong, em, i, u, s, small, mark, code, pre, blockquote, ul, ol, li),
      #userct .write_div :where(p, div, span, a, b, strong, em, i, u, s, small, mark, code, pre, blockquote, ul, ol, li) {
        font-size: inherit !important;
      }
    `;

    ensureFontLink().href = DCBFont.googleFontHref(fontFamily);
    ensureFontStyle().textContent = `
      :root { --dcb-font-scale: ${ratio}; }

      html, body,
      body *:not(.sp_img):not([class*="icon"]):not([class*="ico"]):not([class*="emot"]),
      input, textarea, select, button {
        font-family: ${stack} !important;
      }

      body {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }

      .gall_list td,
      .gall_list th,
      .gall_list a,
      .gall_writer,
      .ub-writer,
      .ub-word,
      .nickname,
      .cmt_info,
      .cmt_txtbox,
      .reply_info,
      .reply_txtbox,
      .write_div,
      .write_div :where(p, div, span, a, b, strong, em, i, u, s, small, mark, code, pre, blockquote, ul, ol, li),
      .usertxt,
      input,
      textarea,
      select,
      button {
        line-height: 1.5 !important;
      }

      ${scaleRule}
    `;
  }

  function loadAndApply() {
    chrome.storage.sync.get(DCBFont.STORAGE_DEFAULTS, applyFont);
  }

  loadAndApply();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndApply, { once: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (
      changes.dcbFontFamily ||
      changes.dcbFontCustomFamily ||
      changes.dcbFontScale ||
      changes.dcbApplyFontToDc
    ) {
      loadAndApply();
    }
  });
})();
