/*****************************************************************
cleaner-img-comment.js - 이미지 댓글만 숨기기
 *****************************************************************/
(() => {
  const SELS = [
    'div.img_comment',                      // 이미지 댓글 영역 (기본)
    'div.img_comment.fold',                 // fold 클래스가 있는 경우
    'div.img_comment.getMoreComment',       // getMoreComment 클래스
    'button.btn_imgcmtopen'                 // 이미지 댓글 열기 버튼
  ];
  const STYLE_ID = 'dcb-hide-img-comment-style';
  const CSS_RULE = `${SELS.join(',')}{display:none !important}`;

  let styleNode = null;
  let hideImgComment = false;
  let observer = null;
  let debounceTimer = null;
  let settingsLoaded = false;

  const addStyle = () => {
    if (styleNode) return;
    styleNode = document.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.textContent = CSS_RULE;
    // head가 없어도 documentElement에 바로 추가
    const target = document.head || document.documentElement;
    if (!target.querySelector(`#${STYLE_ID}`)) {
      target.appendChild(styleNode);
    }
  };
  
  const removeStyle = () => {
    (styleNode ?? document.getElementById(STYLE_ID))?.remove();
    styleNode = null;
  };
  
  const apply = (hide) => {
    hideImgComment = hide;
    if (hide) {
      // 즉시 스타일 추가 (DOM 파싱 전에도 작동)
      addStyle();
      // 즉시 숨기기 적용
      hideExistingElements();
      // Observer 시작
      startObserver();
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
      if (hideImgComment) {
        // 디바운스로 과도한 호출 방지
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          addStyle();
          hideExistingElements();
          debounceTimer = null;
        }, 50);
      }
    });
    
    const target = document.body || document.documentElement;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  };

  const stopObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  /* ───── 초기 설정 로드 및 적용 ───── */
  const loadAndApply = () => {
    chrome.storage.sync.get({ hideImgComment: false }, ({ hideImgComment: hide }) => {
      settingsLoaded = true;
      apply(hide);
    });
  };

  /* ───── 설정 변경 감지 ───── */
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && c.hideImgComment) {
      apply(c.hideImgComment.newValue);
    }
  });

  /* ───── 즉시 실행 - 최대한 빨리 차단 ───── */
  loadAndApply();

  /* ───── 추가 타이밍 보장 ───── */
  // DOMContentLoaded 시점에 재확인
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (hideImgComment) {
        addStyle();
        hideExistingElements();
      }
    }, { once: true });
  }
  
  // window.onload 시점에도 재확인
  window.addEventListener("load", () => {
    if (hideImgComment) {
      addStyle();
      hideExistingElements();
    }
  }, { once: true });
})();
