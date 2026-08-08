/*****************************************************************
 * cleaner-comment.js
 *
 * 댓글 목록만 CSS로 숨긴다. 댓글 입력/등록 컨테이너(#focus_cmt)는
 * 유지하며, 이전 버전이 남긴 inline display:none도 자동 복구한다.
 *****************************************************************/
(() => {
  "use strict";

  const STYLE_ID = "dcb-hide-comment-style";
  const COMMENT_ITEM_SELECTORS = [
    "#focus_cmt li.ub-content",
    "#focus_cmt li[id^='comment_']",
    "#focus_cmt li[id^='reply_']",
    "#focus_cmt .cmt_list > li",
    ".comment_wrap li.ub-content",
    ".comment_wrap .cmt_list > li",
    ".cmt_list > li.ub-content",
    ".reply_list > li"
  ];
  const AUXILIARY_SELECTORS = [
    "a.reply_numbox",
    "span.reply_num",
    "button.btn_cmt_delete",
    ".btn_cmt_delete",
    "input.article_chkbox"
  ];
  const LEGACY_SELECTORS = [
    "div#focus_cmt.view_comment[tabindex]",
    ...AUXILIARY_SELECTORS
  ];

  let hideComment = false;

  function cleanupLegacyInlineStyles() {
    LEGACY_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.style.getPropertyValue("display") === "none") {
          el.style.removeProperty("display");
        }
      });
    });
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.dataset.dcbOwned = "cleaner-comment";
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = `${[...COMMENT_ITEM_SELECTORS, ...AUXILIARY_SELECTORS].join(",")} { display:none !important; }`;
    return style;
  }

  function removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function apply(hide) {
    hideComment = hide === true;
    cleanupLegacyInlineStyles();
    if (hideComment) ensureStyle();
    else removeStyle();
  }

  cleanupLegacyInlineStyles();

  chrome.storage.sync.get({ hideComment: false }, ({ hideComment: value }) => {
    apply(value);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.hideComment) {
      apply(changes.hideComment.newValue);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cleanupLegacyInlineStyles, { once: true });
  }
})();
