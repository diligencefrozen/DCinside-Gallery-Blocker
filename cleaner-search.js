/*****************************************************************
 * cleaner-search.js 
 *****************************************************************/

const STYLE_ID = "dcb-search-clean-style";
let observer;

/* <style> 태그 생성 / 갱신 */
function updateStyle(selectors) {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  style.textContent = selectors.map(s => `${s}{display:none!important}`).join("\n");
}

/* 즉시 제거 */
const removeNow = selArr =>
  selArr.forEach(sel =>
    document.querySelectorAll(sel).forEach(el => el.remove()));

/*  MutationObserver */
function startObserver(selectors) {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => removeNow(selectors));
  observer.observe(document.body, { childList: true, subtree: true });
}

/* 설정 적용 */
function apply() {
  chrome.storage.sync.get({ removeSelectorsSearch: [] }, ({ removeSelectorsSearch }) => {
    const list = removeSelectorsSearch.map(s => s.trim()).filter(Boolean);
    updateStyle(list);

    /* body 가 없으면 DOMContentLoaded 후 처리 */
    if (document.body) {
      removeNow(list);
      startObserver(list);
    } else {
      addEventListener("DOMContentLoaded", () => {
        removeNow(list);
        startObserver(list);
      }, { once: true });
    }
  });
}

/* 스토리지 변경 감지 */
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "sync" && c.removeSelectorsSearch) apply();
});

apply();
