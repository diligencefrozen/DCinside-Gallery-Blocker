/* DCinside Main Cleaner – 숨길 요소 제거 */
const STYLE_ID = "dcb-clean-style";

function applySelectors(selectors) {
  /* 1) <style> 태그 갱신 */
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  style.textContent = selectors
    .map(sel => `${sel} { display: none !important; }`)
    .join("\n");

  /* 2) 이미 렌더된 노드 즉시 제거 */
  selectors.forEach(sel =>
    document.querySelectorAll(sel).forEach(el => el.remove()));
}

/* 3) MutationObserver – 동적 로딩 대응 */
let observer;
function startObserver(selectors) {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    selectors.forEach(sel =>
      document.querySelectorAll(sel).forEach(el => el.remove()));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/* 4) 최초 로드 & 실시간 반영 */
function init() {
  chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) => {
    const ss = removeSelectors.map(s => s.trim()).filter(Boolean);
    applySelectors(ss);
    startObserver(ss);
  });
}
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "sync" && c.removeSelectors) init();
});
init();
