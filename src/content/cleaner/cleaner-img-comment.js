/*****************************************************************
cleaner-img-comment.js - 이미지 댓글만 숨기기
 *****************************************************************/
(() => {
  "use strict";

  const SELS = [
    "div.img_comment",
    "div.img_comment.fold",
    "div.img_comment.getMoreComment",
    "button.btn_imgcmtopen"
  ];
  const STYLE_ID = "dcb-hide-img-comment-style";
  const STATS_ID = "hide-image-comments";
  const STATS_SELECTOR = "div.img_comment,div.img_comment.fold,div.img_comment.getMoreComment";
  const CSS_RULE = `${SELS.join(",")}{display:none !important}`;

  let styleNode = null;

  function addStyle() {
    if (styleNode?.isConnected) return;
    styleNode = document.getElementById(STYLE_ID);
    if (styleNode) return;
    styleNode = document.createElement("style");
    styleNode.id = STYLE_ID;
    styleNode.textContent = CSS_RULE;
    (document.head || document.documentElement).appendChild(styleNode);
  }

  function removeStyle() {
    (styleNode ?? document.getElementById(STYLE_ID))?.remove();
    styleNode = null;
  }

  function apply(hide) {
    if (hide === true) {
      // CSS 규칙은 이후 추가되는 이미지 댓글에도 자동 적용된다.
      // DOM 전체 재검색/MutationObserver는 사용하지 않는다.
      addStyle();
      globalThis.DCBBlockStats?.registerSelector?.(STATS_ID, STATS_SELECTOR, "imageComments");
      return;
    }

    globalThis.DCBBlockStats?.unregisterSelector?.(STATS_ID);
    removeStyle();
  }

  chrome.storage.sync.get({ hideImgComment: false }, ({ hideImgComment }) => apply(hideImgComment));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.hideImgComment) apply(changes.hideImgComment.newValue);
  });
})();
