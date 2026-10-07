/*****************************************************************
 * cleaner-comment.js
 *
 * 댓글 목록만 CSS로 숨긴다. 댓글 입력/등록 컨테이너(#focus_cmt)는
 * 유지한다. 숨기기 기능이 꺼져 있으면 native 댓글 lifecycle에 손대지 않는다.
 *****************************************************************/
(() => {
  "use strict";

  const STYLE_ID = "dcb-hide-comment-style";
  const COMMENT_ITEM_SELECTORS = [
    "#focus_cmt li.ub-content",
    "#focus_cmt li[id^='comment_']",
    "#focus_cmt li[id^='reply_']",
    "#focus_cmt .cmt_list > li:has(.gall_writer,.ub-writer)",
    ".comment_wrap li.ub-content",
    ".comment_wrap .cmt_list > li:has(.gall_writer,.ub-writer)",
    ".cmt_list > li.ub-content",
    ".reply_list > li:has(.gall_writer,.ub-writer)"
  ];
  let hideComment = false;

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.dataset.dcbOwned = "cleaner-comment";
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = `${COMMENT_ITEM_SELECTORS.join(",")} { display:none !important; }`;
    return style;
  }

  function removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function apply(hide) {
    hideComment = hide === true;
    if (hideComment) ensureStyle();
    else removeStyle();
  }

  globalThis.DCBRuntimeSettingsCache.get({ hideComment: false }, ({ hideComment: value }) => {
    apply(value);
  });

  (globalThis.DCBRuntimeSettingsCache?.onChanged || chrome.storage.onChanged).addListener((changes, area) => {
    if (area === "sync" && changes.hideComment) {
      apply(changes.hideComment.newValue);
    }
  });

})();
