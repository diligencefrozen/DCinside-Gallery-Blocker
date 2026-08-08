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
  selectors.forEach(sel =>
    document.querySelectorAll(sel).forEach(el => el.remove())
  );
}

/* MutationObserver – 동적 로딩 대응 */
function startObserver(selectors) {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => removeNow(selectors));
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    // 드물게 body가 아직 없을 수 있음
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
