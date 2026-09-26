/* cleaner-gall.js — 갤러리(게시글,목록) 숨김 */
const STYLE_ID = "dcb-gall-clean-style";

function ensureStyle(){
  let style = document.getElementById(STYLE_ID);
  if(!style){
    style = document.createElement("style");
    style.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  return style;
}

function apply(){
  globalThis.DCBRuntimeSettingsCache.get(
    { hideGallEnabled:true, removeSelectorsGall:[] },
    ({ hideGallEnabled, removeSelectorsGall }) => {
      const sels = (removeSelectorsGall || []).map(s=>s.trim()).filter(Boolean);
      const style = ensureStyle();

      // CSS 자체가 동적으로 추가되는 요소에도 적용되므로 MutationObserver와
      // 반복 querySelectorAll/remove가 필요 없다. Firefox에서 DOM 변경마다
      // 전체 문서를 재검색하던 비용을 없앤다.
      if (!hideGallEnabled || sels.length === 0) {
        style.textContent = "";
        return;
      }
      style.textContent = sels.map(s => `${s}{display:none!important}`).join("\n");
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
