/*****************************************************************
 * cleaner-search.js — 검색 페이지 숨김
 *****************************************************************/

const STYLE_ID = "dcb-search-clean-style";
let observer = null;

/* <style> 생성/보장 */
function ensureStyle() {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  return style;
}

/* 즉시 제거 */
function removeNow(selectors) {
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  });
}

/* 새로 추가된 subtree만 검사해 전체 문서 재탐색을 피함 */
function removeWithin(root, selectors) {
  if (!root || (root.nodeType !== 1 && root.nodeType !== 11)) return;

  for (const sel of selectors) {
    if (root.nodeType === 1 && root.matches?.(sel)) {
      root.remove();
      return;
    }
    root.querySelectorAll?.(sel).forEach((el) => el.remove());
  }
}

/* 동적 로딩 대응 */
function startObserver(selectors) {
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        removeWithin(node, selectors);
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      if (observer) observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  }
}

/* 설정 적용 */
function apply() {
  chrome.storage.sync.get(
    { hideSearchEnabled: true, removeSelectorsSearch: [] },
    ({ hideSearchEnabled, removeSelectorsSearch }) => {
      const sels = (removeSelectorsSearch || []).map(s => s.trim()).filter(Boolean);
      const style = ensureStyle();

      // 🔒 마스터 OFF 또는 리스트 비었으면 모두 해제
      if (!hideSearchEnabled || sels.length === 0) {
        style.textContent = "";
        if (observer) observer.disconnect();
        return;
      }

      // CSS로 재등장 억제
      style.textContent = sels.map(s => `${s}{display:none!important}`).join("\n");

      // 즉시 제거 + 옵저버
      if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", () => {
          removeNow(sels);
          startObserver(sels);
        }, { once: true });
      } else {
        removeNow(sels);
        startObserver(sels);
      }
    }
  );
}

/* 스토리지 변경 감지 */
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "sync") return;
  if (c.hideSearchEnabled || c.removeSelectorsSearch) apply();
});

/* 초기 실행 */
apply();
