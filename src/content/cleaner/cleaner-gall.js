/* cleaner-gall.js — 갤러리(게시글,목록) 숨김 */
const STYLE_ID = "dcb-gall-clean-style";
let observer = null;

function ensureStyle(){
  let style = document.getElementById(STYLE_ID);
  if(!style){
    style = document.createElement("style");
    style.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  return style;
}

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

function apply(){
  chrome.storage.sync.get(
    { hideGallEnabled:true, removeSelectorsGall:[] },
    ({ hideGallEnabled, removeSelectorsGall }) => {
      const sels = (removeSelectorsGall || []).map(s=>s.trim()).filter(Boolean);
      const style = ensureStyle();

      // 마스터 OFF 또는 비어있으면 모두 해제
      if (!hideGallEnabled || sels.length === 0) {
        style.textContent = "";
        if (observer) observer.disconnect();
        return;
      }

      // CSS로 재등장 억제
      style.textContent = sels.map(s => `${s}{display:none!important}`).join("\n");

      // 즉시 제거 + 동적 로딩 대응
      if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", () => {
          removeNow(sels);
          startObserver(sels);
        }, { once:true });
      } else {
        removeNow(sels);
        startObserver(sels);
      }
    }
  );
}

// 스토리지 변경 → 재적용
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "sync") return;
  if (c.hideGallEnabled || c.removeSelectorsGall) apply();
});

// 초기 실행
apply();
