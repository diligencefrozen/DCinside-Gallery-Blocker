/*****************************************************************
 * cleaner-anonymous.js — 비회원(갤로그 링크 없음) 글/댓글 숨김
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-anonymous-clean-style";
  let hideEnabled = false;
  let observer = null;

  /* <style> 보장 */
  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    return style;
  }

  /* 작성자가 비회원(갤로그 링크 없음)인지 판단 */
  function isAnonymous(writer) {
    if (!writer) return false;

    // 갤로그 링크 탐색
    const link =
      writer.parentElement?.querySelector(
        '.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]'
      ) || writer.querySelector('a[href*="gallog.dcinside.com"]');

    // 링크가 없으면 비회원
    return !link;
  }

  /* 비회원 글/댓글을 숨기기 위한 selector 수집 */
  function getAnonymousElements() {
    const anonymousElements = [];

    // 1) 글 목록/보기 – .gall_writer (작성자 블록)
    document.querySelectorAll(".gall_writer").forEach((writer) => {
      if (isAnonymous(writer)) {
        // 글의 경우: 상위 .gall_tr 또는 .gall_item 등 전체 행 숨기기
        const row = writer.closest(".gall_tr, .gall_item, tr[data-no]");
        if (row) anonymousElements.push(row);
      }
    });

    // 2) 댓글 – .gall_writer (댓글도 동일한 구조)
    document.querySelectorAll("div.comment_view .gall_writer").forEach((writer) => {
      if (isAnonymous(writer)) {
        const commentBox = writer.closest(
          ".gall_comment, .view_comment, li[id^='cmt_'], tr[id^='cmt_']"
        );
        if (commentBox) anonymousElements.push(commentBox);
      }
    });

    return anonymousElements;
  }

  /* 현재 DOM에 존재하는 비회원 요소 즉시 숨기기 */
  function hideNow() {
    if (!hideEnabled) return;
    const style = ensureStyle();
    const elements = getAnonymousElements();
    
    // CSS로 숨기기
    elements.forEach((el) => {
      el.style.display = "none !important";
    });

    // 추가: display:none을 클래스로도 설정해 CSS 우선순위 강제
    style.textContent = elements
      .map((el, idx) => {
        const selector = `[data-dcb-anon-hide="${idx}"]`;
        el.setAttribute("data-dcb-anon-hide", idx.toString());
        return `${selector}{display:none!important}`;
      })
      .join("\n");
  }

  /* MutationObserver – 동적 로딩(리스트 리프레셔, 댓글 새로고침) 대응 */
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      // debounce: requestAnimationFrame 사용
      requestAnimationFrame(() => hideNow());
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      window.addEventListener(
        "DOMContentLoaded",
        () => {
          if (observer)
            observer.observe(document.body, { childList: true, subtree: true });
        },
        { once: true }
      );
    }
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const style = document.getElementById(STYLE_ID);
    if (style) style.textContent = "";
  }

  /* 설정값 읽어 적용 */
  function apply() {
    chrome.storage.sync.get(
      { hideAnonymousEnabled: false },
      ({ hideAnonymousEnabled }) => {
        hideEnabled = !!hideAnonymousEnabled;

        if (!hideEnabled) {
          stopObserver();
          return;
        }

        ensureStyle();
        hideNow();
        startObserver();
      }
    );
  }

  // --- storage: 초기 로드 & 변경 반영 ---
  try {
    if (chrome && chrome.storage && chrome.storage.sync) {
      apply();

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.hideAnonymousEnabled) return;
        hideEnabled = !!changes.hideAnonymousEnabled.newValue;
        if (!hideEnabled) {
          stopObserver();
        } else {
          ensureStyle();
          hideNow();
          startObserver();
        }
      });
    }
  } catch (e) {
    // storage 없을 시 기본값(false)로 동작
  }
})();
