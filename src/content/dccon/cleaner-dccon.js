/*****************************************************************
cleaner-dccon.js - 디시콘 / 텍스트콘 숨기기
 *****************************************************************/
(() => {
  const TEXTCON_WRAPPER_SEL = '.coment_dccon_txt, .comment_dccon_txt';
  const TEXTCON_SEL = `${TEXTCON_WRAPPER_SEL}, .txtcon_txt`;

  // 디시콘 숨기기는 모든 디시콘을 숨기고, 텍스트콘 숨기기는 텍스트콘만 따로 숨길 때 사용합니다.
// 아래 목록은 이미지·움짤·영상 디시콘만 찾기 위한 선택자입니다.
  const COMMENT_MEDIA_DCCON_SEL = [
    '.comment_dccon:not(:has(.coment_dccon_txt,.comment_dccon_txt,.txtcon_txt))',
    '.coment_dccon_img',
    '.dcbpv-dccon:not(.coment_dccon_txt):not(.comment_dccon_txt):not(.txtcon_txt):not(:has(.coment_dccon_txt,.comment_dccon_txt,.txtcon_txt))',
    '[reqpath*="dccon"]'
  ].join(',');

  const MEDIA_DCCON_SELS = [
    'video.written_dccon',
    'img.written_dccon',
    '.written_dccon',
    '.dcbpv-dccon:not(.coment_dccon_txt):not(.comment_dccon_txt):not(.txtcon_txt):not(:has(.coment_dccon_txt,.comment_dccon_txt,.txtcon_txt))',
    'img[src*="dccon.php"]',
    'video[src*="dccon"]',
    'source[src*="dccon"]',
    'img[class*="dccon"]',
    'video[class*="dccon"]'
  ];

  const LEGACY_PLACEHOLDER_SEL = '.dcb-dccon-blocked[data-dcb-replaced="true"], .dcb-dccon-blocked';
  const COMMENT_ROW_SEL = [
    'div.cmt_info[data-no]',
    'div.cmt_info[data-article-no]',
    'div.cmt_info.clear',
    '.cmt_info',
    'li.ub-content',
    'li[id^="comment_li_"]',
    'li[id^="reply_"]',
    '.cmt_item',
    '.reply_item',
    '.comment_item',
    '.comment_wrap li',
    '.cmt_list li',
    '.dccon_comment_box li',
    '.dcbpv-comment-item'
  ].join(',');

  const MEDIA_STYLE_ID = 'dcb-hide-dccon-style';
  const TEXT_STYLE_ID = 'dcb-hide-textcon-style';
  const MEDIA_COMMENT_HIDDEN_CLASS = 'dcb-cleaner-dccon-comment-hidden';
  const TEXT_COMMENT_HIDDEN_CLASS = 'dcb-cleaner-textcon-comment-hidden';
  const MEDIA_CONTENT_HIDDEN_CLASS = 'dcb-cleaner-dccon-content-hidden';
  const TEXT_CONTENT_HIDDEN_CLASS = 'dcb-cleaner-textcon-content-hidden';
  const SELECTIVE_HIDDEN_SEL = '.dcb-selective-dccon-hidden, [data-dcb-selective-dccon-hidden="true"]';

  const MEDIA_CANDIDATE_SEL = [COMMENT_MEDIA_DCCON_SEL, ...MEDIA_DCCON_SELS].join(',');

  const MEDIA_CSS_RULE = `
    :is(${COMMENT_ROW_SEL}):has(:is(${COMMENT_MEDIA_DCCON_SEL}, ${MEDIA_DCCON_SELS.join(',')})),
    .${MEDIA_COMMENT_HIDDEN_CLASS},
    .${MEDIA_CONTENT_HIDDEN_CLASS},
    ${LEGACY_PLACEHOLDER_SEL} {
      display: none !important;
    }

    ${MEDIA_DCCON_SELS.map((s) => `${s}{display:none !important}`).join('\n')}
  `;

  const TEXT_CSS_RULE = `
    :is(${COMMENT_ROW_SEL}):has(:is(${TEXTCON_SEL})),
    .${TEXT_COMMENT_HIDDEN_CLASS},
    .${TEXT_CONTENT_HIDDEN_CLASS} {
      display: none !important;
    }

    ${TEXTCON_SEL}{display:none !important}
  `;

  let mediaStyleNode = null;
  let textStyleNode = null;
  let hideDccon = false;
  let hideTextCon = false;
  let observer = null;
  let debounceTimer = null;

  const ensureStyle = (id, css, currentNode) => {
    if (currentNode?.isConnected) return currentNode;
    const existing = document.getElementById(id);
    if (existing) return existing;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };

  const syncStyles = () => {
    if (hideDccon) mediaStyleNode = ensureStyle(MEDIA_STYLE_ID, MEDIA_CSS_RULE, mediaStyleNode);
    else {
      (mediaStyleNode ?? document.getElementById(MEDIA_STYLE_ID))?.remove();
      mediaStyleNode = null;
    }

    if (hideDccon || hideTextCon) textStyleNode = ensureStyle(TEXT_STYLE_ID, TEXT_CSS_RULE, textStyleNode);
    else {
      (textStyleNode ?? document.getElementById(TEXT_STYLE_ID))?.remove();
      textStyleNode = null;
    }
  };

  const findCommentRow = (node) => {
    if (!node || typeof node.closest !== 'function') return null;
    return node.closest(COMMENT_ROW_SEL);
  };

  const isTextConNode = (node) => {
    if (!(node instanceof Element)) return false;
    return !!node.matches?.(TEXTCON_SEL) || !!node.closest?.(TEXTCON_WRAPPER_SEL);
  };

  const isTextConFamily = (node) => {
    if (!(node instanceof Element)) return false;
    return isTextConNode(node) || !!node.querySelector?.(TEXTCON_SEL);
  };

  const removeLegacyPlaceholders = (scope = document) => {
    scope.querySelectorAll?.(LEGACY_PLACEHOLDER_SEL).forEach((el) => el.remove());
  };

  const addHiddenKind = (target, kind) => {
    const kinds = new Set(String(target.getAttribute('data-dcb-dccon-kind') || '').split(',').filter(Boolean));
    kinds.add(kind);
    target.setAttribute('data-dcb-dccon-kind', Array.from(kinds).join(','));
    target.setAttribute('data-dcb-cleaner-hidden', 'true');
    target.setAttribute('data-dcb-dccon-hidden', 'true');
  };

  const hideCommentRow = (node, kind) => {
    if (!node) return;
    const row = findCommentRow(node);
    const target = row || node;
    if (kind === 'textcon') target.classList.add(TEXT_COMMENT_HIDDEN_CLASS);
    else target.classList.add(MEDIA_COMMENT_HIDDEN_CLASS);
    addHiddenKind(target, kind);
  };

  const hideContentNode = (node, kind) => {
    if (!(node instanceof Element)) return;
    if (findCommentRow(node)) {
      hideCommentRow(node, kind);
      return;
    }
    if (kind === 'textcon') node.classList.add(TEXT_CONTENT_HIDDEN_CLASS);
    else node.classList.add(MEDIA_CONTENT_HIDDEN_CLASS);
    addHiddenKind(node, kind);
  };

  const restoreInlineDisplay = () => {
    document.querySelectorAll(`${MEDIA_CANDIDATE_SEL}, ${TEXTCON_SEL}`).forEach((el) => {
      if (el.matches?.(SELECTIVE_HIDDEN_SEL) || el.closest?.(SELECTIVE_HIDDEN_SEL)) return;
      if (el.style?.display === 'none') el.style.removeProperty('display');
    });
  };

  const restoreOwnHiddenState = () => {
    document.querySelectorAll('[data-dcb-cleaner-hidden="true"]').forEach((el) => {
      el.classList.remove(
        MEDIA_COMMENT_HIDDEN_CLASS,
        TEXT_COMMENT_HIDDEN_CLASS,
        MEDIA_CONTENT_HIDDEN_CLASS,
        TEXT_CONTENT_HIDDEN_CLASS
      );
      el.removeAttribute('data-dcb-dccon-kind');
      el.removeAttribute('data-dcb-cleaner-hidden');
      el.removeAttribute('data-dcb-dccon-hidden');
    });
    restoreInlineDisplay();
  };

  const hideMediaInScope = (scope) => {
    if (!hideDccon || !scope?.querySelectorAll) return;

    scope.querySelectorAll(LEGACY_PLACEHOLDER_SEL).forEach((el) => {
      const row = findCommentRow(el);
      if (row) hideCommentRow(row.querySelector(COMMENT_MEDIA_DCCON_SEL) || el, 'media');
      else el.remove();
    });

    const handle = (el) => {
      if (!(el instanceof Element) || isTextConFamily(el)) return;
      hideContentNode(el, 'media');
    };

    if (scope instanceof Element && scope.matches?.(MEDIA_CANDIDATE_SEL)) handle(scope);
    scope.querySelectorAll(MEDIA_CANDIDATE_SEL).forEach(handle);
  };

  const hideTextConsInScope = (scope) => {
    if ((!hideDccon && !hideTextCon) || !scope?.querySelectorAll) return;
    const handle = (el) => hideContentNode(el, 'textcon');
    if (scope instanceof Element && scope.matches?.(TEXTCON_SEL)) handle(scope);
    scope.querySelectorAll(TEXTCON_SEL).forEach(handle);
  };

  const hideExistingElements = (scope = document) => {
    hideMediaInScope(scope);
    hideTextConsInScope(scope);
  };

  const mutationMayContainRelevantContent = (node) => {
    if (!(node instanceof Element)) return false;

    if ((hideDccon || hideTextCon) && (
      node.matches?.(TEXTCON_SEL)
      || isTextConNode(node)
      || !!node.querySelector?.(TEXTCON_SEL)
    )) return true;

    if (hideDccon && !isTextConFamily(node) && (
      node.matches?.(MEDIA_CANDIDATE_SEL)
      || !!node.querySelector?.(MEDIA_CANDIDATE_SEL)
      || node.matches?.(LEGACY_PLACEHOLDER_SEL)
      || !!node.querySelector?.(LEGACY_PLACEHOLDER_SEL)
    )) return true;

    return false;
  };

  const stopObserver = () => {
    observer?.disconnect();
    observer = null;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  };

  const startObserver = () => {
    if (observer || (!hideDccon && !hideTextCon)) return;

    const pendingScopes = new Set();
    const flush = () => {
      debounceTimer = null;
      if (!hideDccon && !hideTextCon) return;
      syncStyles();
      const scopes = pendingScopes.size ? Array.from(pendingScopes) : [document];
      pendingScopes.clear();
      scopes.forEach((scope) => hideExistingElements(scope));
    };

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes || []) {
            if (mutationMayContainRelevantContent(node)) pendingScopes.add(node);
          }
        } else if (mutation.type === 'attributes' && mutationMayContainRelevantContent(mutation.target)) {
          pendingScopes.add(mutation.target);
        }
      }
      if (!pendingScopes.size) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, 120);
    });

    const observeRoot = document.documentElement || document.body;
    if (observeRoot) {
      observer.observe(observeRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'class', 'data-src', 'data-original', 'data-gif', 'data-mp4', 'reqpath']
      });
    }
  };

  const applySettings = (next = {}) => {
    if (Object.prototype.hasOwnProperty.call(next, 'hideDccon')) hideDccon = next.hideDccon === true;
    if (Object.prototype.hasOwnProperty.call(next, 'hideTextCon')) hideTextCon = next.hideTextCon === true;

    stopObserver();
    restoreOwnHiddenState();
    syncStyles();

    if (hideDccon || hideTextCon) {
      hideExistingElements();
      startObserver();
    }
  };

  chrome.storage.sync.get({ hideDccon: false, hideTextCon: false }, (settings) => {
    applySettings(settings);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const next = {};
    if (changes.hideDccon) next.hideDccon = changes.hideDccon.newValue;
    if (changes.hideTextCon) next.hideTextCon = changes.hideTextCon.newValue;
    if (Object.keys(next).length) applySettings(next);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (hideDccon || hideTextCon) {
        syncStyles();
        hideExistingElements();
        startObserver();
      }
    }, { once: true });
  }

  window.addEventListener('load', () => {
    if (hideDccon || hideTextCon) hideExistingElements();
  }, { once: true });
})();
