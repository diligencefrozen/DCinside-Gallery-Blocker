/*****************************************************************
cleaner-dccon.js - 디시콘(DCcon) 숨기기
 *****************************************************************/
(() => {
  const COMMENT_DCCON_SEL = 'div.comment_dccon, .comment_dccon';  // 댓글 속 디시콘
  const LEGACY_PLACEHOLDER_SEL = '.dcb-dccon-blocked[data-dcb-replaced="true"], .dcb-dccon-blocked';
  const COMMENT_ROW_SEL = [
    // DCInside 댓글 최상위 래퍼. 디시콘 댓글 제거의 1순위 타깃입니다.
    'div.cmt_info[data-no]',
    'div.cmt_info[data-article-no]',
    'div.cmt_info.clear',
    '.cmt_info',

    // 다른 갤러리/모바일/구형 DOM 대응
    'li.ub-content',
    'li[id^="comment_li_"]',
    'li[id^="reply_"]',
    '.cmt_item',
    '.reply_item',
    '.comment_item',
    '.comment_wrap li',
    '.cmt_list li',
    '.dccon_comment_box li'
  ].join(',');

  const CONTENT_DCCON_SELS = [
    'video.written_dccon',           // 본문 속 디시콘 (video)
    'img.written_dccon',             // 본문 속 디시콘 (img)
    '.written_dccon'                 // 모든 written_dccon 클래스
  ];

  const STYLE_ID = 'dcb-hide-dccon-style';
  const COMMENT_HIDDEN_CLASS = 'dcb-dccon-comment-hidden';
  const CONTENT_HIDDEN_CLASS = 'dcb-dccon-content-hidden';
  const CSS_RULE = `
    /* Chrome 계열에서는 :has()로 디시콘 댓글 행을 CSS 단계에서 먼저 숨깁니다. */
    div.cmt_info:has(.comment_dccon),
    li.ub-content:has(.comment_dccon),
    li[id^="comment_li_"]:has(.comment_dccon),
    li[id^="reply_"]:has(.comment_dccon),
    .cmt_item:has(.comment_dccon),
    .reply_item:has(.comment_dccon),
    .comment_item:has(.comment_dccon),
    .${COMMENT_HIDDEN_CLASS},
    .${CONTENT_HIDDEN_CLASS},
    ${LEGACY_PLACEHOLDER_SEL} {
      display: none !important;
    }

    ${CONTENT_DCCON_SELS.map(s => `${s}{display:none !important}`).join('\n')}
  `;

  let styleNode = null;
  let hideDccon = false;
  let observer = null;
  let processedCommentDccons = new WeakSet();

  const addStyle = () => {
    if (styleNode || document.getElementById(STYLE_ID)) {
      styleNode = document.getElementById(STYLE_ID);
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

  const apply = (hide) => {
    hideDccon = hide;
    if (hide) {
      addStyle();
      startObserver();
      hideExistingElements();
    } else {
      removeStyle();
      stopObserver();
      restoreDccons();
    }
  };

  const findCommentRow = (node) => {
    if (!node || typeof node.closest !== 'function') return null;
    return node.closest(COMMENT_ROW_SEL);
  };

  const removeLegacyPlaceholders = (scope = document) => {
    scope.querySelectorAll?.(LEGACY_PLACEHOLDER_SEL).forEach(el => el.remove());
  };

  /* ───── 댓글 디시콘이 포함된 댓글 행 자체를 최우선 숨김 ───── */
  const hideCommentDcconRow = (dcconNode) => {
    if (!dcconNode || processedCommentDccons.has(dcconNode)) return;
    processedCommentDccons.add(dcconNode);

    const row = findCommentRow(dcconNode);
    const target = row || dcconNode;

    // 이전 버전에서 삽입된 "차단된 디시콘입니다" 문구가 남아 있으면 먼저 제거합니다.
    removeLegacyPlaceholders(target);

    target.classList.add(COMMENT_HIDDEN_CLASS);
    target.setAttribute('data-dcb-dccon-hidden', 'true');
  };

  const hideLegacyPlaceholderRow = (placeholder) => {
    const row = findCommentRow(placeholder);
    if (row) {
      hideCommentDcconRow(row.querySelector(COMMENT_DCCON_SEL) || placeholder);
      return;
    }
    placeholder.remove();
  };

  const restoreInlineDisplay = () => {
    // 이전 버전이 직접 넣은 inline display:none 흔적을 가능한 범위에서 복원합니다.
    document.querySelectorAll(`${COMMENT_DCCON_SEL}, ${CONTENT_DCCON_SELS.join(',')}`).forEach(el => {
      if (el.style?.display === 'none') {
        el.style.removeProperty('display');
      }
    });
  };

  /* ───── 디시콘 복원 ───── */
  const restoreDccons = () => {
    document.querySelectorAll('[data-dcb-dccon-hidden="true"]').forEach(el => {
      el.classList.remove(COMMENT_HIDDEN_CLASS, CONTENT_HIDDEN_CLASS);
      el.removeAttribute('data-dcb-dccon-hidden');
    });

    restoreInlineDisplay();
    processedCommentDccons = new WeakSet();
  };

  /* ───── 기존 DOM 요소 즉시 숨기기 ───── */
  const hideExistingElements = () => {
    // 1순위: 이미 삽입된 구버전 안내 문구가 있으면 문구가 아니라 댓글 행 전체를 숨깁니다.
    document.querySelectorAll(LEGACY_PLACEHOLDER_SEL).forEach(el => {
      hideLegacyPlaceholderRow(el);
    });

    // 2순위: 댓글 디시콘 컨테이너가 보이면 댓글 행 전체를 숨깁니다.
    document.querySelectorAll(COMMENT_DCCON_SEL).forEach(el => {
      hideCommentDcconRow(el);
    });

    // 3순위: 본문/기타 영역의 디시콘은 기존처럼 해당 디시콘 요소만 숨깁니다.
    CONTENT_DCCON_SELS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (findCommentRow(el)) {
          hideCommentDcconRow(el);
          return;
        }

        el.classList.add(CONTENT_HIDDEN_CLASS);
        el.setAttribute('data-dcb-dccon-hidden', 'true');
      });
    });
  };

  /* ───── 동적 콘텐츠 대응 ───── */
  const startObserver = () => {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (hideDccon) {
        addStyle();
        hideExistingElements();
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        if (document.body && hideDccon) {
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }, { once: true });
    }
  };

  const stopObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  /* ───── 초기 설정 로드 ───── */
  chrome.storage.sync.get({ hideDccon: false }, ({ hideDccon }) => {
    apply(hideDccon);
  });

  /* ───── 설정 변경 감지 ───── */
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && c.hideDccon) {
      apply(c.hideDccon.newValue);
    }
  });

  /* ───── 페이지 로드 완료 후에도 한 번 더 실행 ───── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      chrome.storage.sync.get({ hideDccon: false }, ({ hideDccon }) => {
        if (hideDccon) {
          addStyle();
          hideExistingElements();
        }
      });
    }, { once: true });
  }

  /* ───── window.onload 시점에도 한 번 더 확인 ───── */
  window.addEventListener("load", () => {
    if (hideDccon) {
      addStyle();
      hideExistingElements();
    }
  }, { once: true });
})();
