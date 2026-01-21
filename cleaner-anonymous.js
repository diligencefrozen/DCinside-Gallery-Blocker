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

    // 갤로그 링크 감지: .writer_nikcon 클래스가 있으면 회원
    // (.writer_nikcon 요소가 있으면 갤로그 딱지가 있다는 뜻)
    const gallogLink = writer.querySelector('.writer_nikcon');
    if (gallogLink) return false; // 회원

    // 추가 확인: onclick이나 href에 gallog URL이 있으면 회원
    const gallogUrl = writer.querySelector('[onclick*="gallog"], [href*="gallog"]');
    if (gallogUrl) return false; // 회원

    // IP 뱃지 확인: span.ip가 없으면 필터링하지 않음 (익명 회원/비회원 구분 불가)
    const ipBadge = writer.querySelector('span.ip');
    if (!ipBadge) return false; // IP 뱃지 없음 = 필터링 스킵

    // IP 뱃지가 있으면 비회원
    return true;
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

    // 2) 댓글 – .cmt_info 내부의 .gall_writer만 검사 (정확한 탐색)
    document.querySelectorAll(".cmt_info .gall_writer").forEach((writer) => {
      if (isAnonymous(writer)) {
        // .cmt_info의 부모 li만 숨기기 (대댓글은 보존)
        const commentItem = writer.closest(".cmt_info")?.parentElement;
        if (commentItem && commentItem.tagName === "LI") {
          anonymousElements.push(commentItem);
        }
      }
    });

    // 3) 대댓글 – .reply_info 내부의 .gall_writer 검사
    document.querySelectorAll(".reply_info .gall_writer").forEach((writer) => {
      if (isAnonymous(writer)) {
        // 대댓글의 경우: 해당 대댓글 li만 숨기기
        const replyItem = writer.closest(".reply_info")?.parentElement;
        if (replyItem && replyItem.tagName === "LI") {
          anonymousElements.push(replyItem);
        }
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
