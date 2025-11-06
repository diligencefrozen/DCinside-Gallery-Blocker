/*****************************************************************
cleaner-dccon.js - 디시콘(DCcon) 숨기기
 *****************************************************************/
(() => {
  const COMMENT_DCCON_SEL = 'div.comment_dccon.clear';  // 댓글 속 디시콘
  const CONTENT_DCCON_SELS = [
    'video.written_dccon',           // 본문 속 디시콘 (video)
    'img.written_dccon',             // 본문 속 디시콘 (img)
    '.written_dccon'                 // 모든 written_dccon 클래스
  ];
  
  const STYLE_ID = 'dcb-hide-dccon-style';
  const CSS_RULE = CONTENT_DCCON_SELS.map(s => `${s}{display:none !important}`).join('\n');
  
  // 댓글 디시콘 대체 메시지 스타일
  const REPLACE_STYLE = `
    .dcb-dccon-blocked {
      display: inline-block;
      padding: 4px 8px;
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 4px;
      color: #666;
      font-size: 12px;
      font-style: italic;
    }
  `;

  let styleNode = null;
  let hideDccon = false;
  let observer = null;
  let processedCommentDccons = new WeakSet();

  const addStyle = () => {
    if (styleNode) return;
    styleNode = document.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.textContent = CSS_RULE + REPLACE_STYLE;
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
      // 즉시 숨기기 적용 (DOM에 이미 있는 요소들)
      hideExistingElements();
    } else {
      removeStyle();
      stopObserver();
      restoreCommentDccons();
    }
  };
  
  /* ───── 댓글 디시콘을 메시지로 교체 ───── */
  const replaceCommentDccon = (dcconDiv) => {
    if (processedCommentDccons.has(dcconDiv)) return;
    processedCommentDccons.add(dcconDiv);
    
    const placeholder = document.createElement('span');
    placeholder.className = 'dcb-dccon-blocked';
    placeholder.textContent = '🚫 차단된 디시콘입니다';
    placeholder.setAttribute('data-dcb-replaced', 'true');
    
    dcconDiv.style.display = 'none';
    dcconDiv.parentNode?.insertBefore(placeholder, dcconDiv);
  };
  
  /* ───── 댓글 디시콘 복원 ───── */
  const restoreCommentDccons = () => {
    document.querySelectorAll('[data-dcb-replaced="true"]').forEach(el => el.remove());
    document.querySelectorAll(COMMENT_DCCON_SEL).forEach(el => {
      el.style.display = '';
    });
    processedCommentDccons = new WeakSet();
  };
  
  /* ───── 기존 DOM 요소 즉시 숨기기 ───── */
  const hideExistingElements = () => {
    // 댓글 디시콘 - 메시지로 교체
    document.querySelectorAll(COMMENT_DCCON_SEL).forEach(el => {
      replaceCommentDccon(el);
    });
    
    // 본문 디시콘 - 숨김 (CSS로 처리됨)
    CONTENT_DCCON_SELS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.cssText = 'display:none !important';
      });
    });
  };

  /* ───── 동적 콘텐츠 대응 ───── */
  const startObserver = () => {
    if (observer) return; // 이미 실행 중
    
    observer = new MutationObserver(() => {
      if (hideDccon) {
        addStyle(); // 스타일이 제거되었을 경우 다시 추가
        hideExistingElements(); // 새로 추가된 요소도 숨기기
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
