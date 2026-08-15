/*****************************************************************
cleaner-img-comment.js - 이미지 댓글만 숨기기
 *****************************************************************/
(() => {
  const SELS = [
    'div.img_comment',
    'div.img_comment.fold',
    'div.img_comment.getMoreComment',
    'button.btn_imgcmtopen'
  ];
  const SELECTOR = SELS.join(',');
  const STYLE_ID = 'dcb-hide-img-comment-style';
  const CSS_RULE = `${SELECTOR}{display:none !important}`;

  let styleNode = null;
  let hideImgComment = false;
  let observer = null;

  const addStyle = () => {
    const existing = document.getElementById(STYLE_ID);
    if (existing) {
      styleNode = existing;
      if (styleNode.textContent !== CSS_RULE) styleNode.textContent = CSS_RULE;
      return;
    }

    styleNode = document.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.textContent = CSS_RULE;
    (document.head || document.documentElement).appendChild(styleNode);
  };

  const removeStyle = () => {
    (styleNode ?? document.getElementById(STYLE_ID))?.remove();
    styleNode = null;
  };

  const hideWithin = (root) => {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11)) return;

    if (root.nodeType === 1 && root.matches?.(SELECTOR)) {
      root.style.setProperty('display', 'none', 'important');
    }
    root.querySelectorAll?.(SELECTOR).forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  };

  const startObserver = () => {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (!hideImgComment) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) hideWithin(node);
      }
    });

    const target = document.body || document.documentElement;
    if (target) observer.observe(target, { childList: true, subtree: true });
  };

  const stopObserver = () => {
    observer?.disconnect();
    observer = null;
  };

  const apply = (hide) => {
    hideImgComment = !!hide;
    if (hideImgComment) {
      addStyle();
      hideWithin(document);
      startObserver();
    } else {
      removeStyle();
      stopObserver();
    }
  };

  chrome.storage.sync.get({ hideImgComment: false }, ({ hideImgComment: hide }) => {
    apply(hide);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.hideImgComment) {
      apply(changes.hideImgComment.newValue);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (hideImgComment) {
        addStyle();
        hideWithin(document);
        startObserver();
      }
    }, { once: true });
  }
})();
