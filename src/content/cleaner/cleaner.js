/*****************************************************************
 * cleaner.js  — 메인(www.dcinside.com) 영역 숨김
 *****************************************************************/

const STYLE_ID = "dcb-main-clean-style";
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

/* 현재 DOM 에 존재하는 노드 즉시 제거 */
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

/* MutationObserver – 동적 로딩 대응 */
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

/* 설정값 읽어 적용 */
function apply() {
  chrome.storage.sync.get(
    { hideMainEnabled: true, removeSelectors: [] },
    ({ hideMainEnabled, removeSelectors }) => {
      const sels = (removeSelectors || []).map(s => s.trim()).filter(Boolean);
      const style = ensureStyle();

      // 마스터 OFF 또는 목록 비었으면 전부 해제
      if (!hideMainEnabled || sels.length === 0) {
        style.textContent = "";
        if (observer) observer.disconnect();
        return;
      }

      // CSS 숨김 (재등장/지연 로딩 대비)
      style.textContent = sels.map(s => `${s}{display:none!important}`).join("\n");

      // 즉시 제거 + 동적 로딩 대응
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

/* 스토리지 변경 감지 → 재적용 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.hideMainEnabled || changes.removeSelectors) apply();
});

/* 초기 적용 */
apply();
