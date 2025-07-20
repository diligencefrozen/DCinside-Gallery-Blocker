/*****************************************************************
 * background.js 
 *****************************************************************/

/* ── 기존 DNR 동기화 로직 ───────────────────────────────────── */
const MAIN_URL = "https://www.dcinside.com";

function syncRules() {
  chrome.storage.sync.get(
    { blockedIds: [], blockMode: "redirect" },           // redirect | block
    ({ blockedIds, blockMode }) => {
      const rules = blockedIds.map((id, i) => ({
        id: i + 1,
        priority: 1,
        condition: { urlFilter: `*://gall.dcinside.com/*id=${id}*` },
        action:
          blockMode === "block"
            ? { type: "block" }
            : { type: "redirect", redirect: { url: MAIN_URL } }
      }));
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: rules.map(r => r.id),
        addRules: rules
      });
    }
  );
}

syncRules();
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "sync" && (c.blockedIds || c.blockMode)) syncRules();
});

/* ── ✨ 아이콘(툴바) 클릭 시 옵션 페이지 열기 ──────────────── */
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
