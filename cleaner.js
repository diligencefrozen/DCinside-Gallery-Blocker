/*****************************************************************
 * cleaner.js 
 *****************************************************************/

const STYLE_ID = "dcb-main-clean-style";

/* <style> 태그 생성 / 갱신 */
function updateStyle(selectors) {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  style.textContent = selectors
    .map(s => `${s}{display:none!important}`)
    .join("\n");
}

/* 현재 DOM 에 존재하는 노드 즉시 제거 */
function removeNow(selectors) {
  selectors.forEach(sel =>
    document.querySelectorAll(sel).forEach(el => el.remove()));
}

/* MutationObserver – 동적 로딩 대응 */
let observer;
function startObserver(selectors) {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => removeNow(selectors));
  observer.observe(document.body, { childList: true, subtree: true });
}

/* 설정값 읽어 적용 */
function apply() {
  chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) => {
    const clean = removeSelectors.map(s => s.trim()).filter(Boolean);
    updateStyle(clean);
    
    if (document.body) {
      removeNow(clean);
      startObserver(clean);
    } else {
      window.addEventListener("DOMContentLoaded", () => {
        removeNow(clean);
        startObserver(clean);
      }, { once: true });
    }
  });
}

/* 스토리지 변경 감지 → 재적용 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.removeSelectors) apply();
});

apply();
