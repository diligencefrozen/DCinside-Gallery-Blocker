/*****************************************************************
cleaner-comment.js
 *****************************************************************/
(() => {
  const SELS = [
    'div#focus_cmt.view_comment[tabindex]',
    'a.reply_numbox',          
    'span.reply_num',
    'div.img_comment.fold.getMoreComment'  // 이미지 댓글 영역
  ];
  const STYLE_ID = 'dcb-hide-comment-style';
  const CSS_RULE = `${SELS.join(',')}{display:none !important}`;

  let styleNode = null;
  let hideComment = false;
  let observer = null;

  const addStyle = () => {
    if (styleNode) return;
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
    hideComment = hide;
    if (hide) {
      addStyle();
      startObserver();
      // 즉시 숨기기 적용 (DOM에 이미 있는 요소들)
      hideExistingElements();
    } else {
      removeStyle();
      stopObserver();
    }
  };
  
  /* ───── 기존 DOM 요소 즉시 숨기기 ───── */
  const hideExistingElements = () => {
    SELS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.cssText = 'display:none !important';
      });
    });
  };

  /* ───── 동적 콘텐츠 대응 ───── */
  const startObserver = () => {
    if (observer) return; // 이미 실행 중
    
    observer = new MutationObserver(() => {
      if (hideComment) {
        addStyle(); // 스타일이 제거되었을 경우 다시 추가
        hideExistingElements(); // 새로 추가된 요소도 숨기기
      }
    });
    
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        if (document.body && hideComment) {
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
  chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
    apply(hideComment);
  });

  /* ───── 설정 변경 감지 ───── */
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && c.hideComment) {
      apply(c.hideComment.newValue);
    }
  });

  /* ───── 페이지 로드 완료 후에도 한 번 더 실행 ───── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
        if (hideComment) {
          addStyle();
          hideExistingElements();
        }
      });
    }, { once: true });
  }
  
  /* ───── window.onload 시점에도 한 번 더 확인 ───── */
  window.addEventListener("load", () => {
    if (hideComment) {
      addStyle();
      hideExistingElements();
    }
  }, { once: true });
})();
