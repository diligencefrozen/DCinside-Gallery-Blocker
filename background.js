/*****************************************************************
 * background.js
 *****************************************************************/

/* ───── 상수 ───── */
const MAIN_URL = "https://www.dcinside.com";
const BUILTIN  = ["dcbest"];                // 항상 차단
const MAX_ID   = 50_000;                    // id 충돌 방지를 위한 충분히 큰 범위

/* ───── 규칙 동기화 ───── */
async function syncRules() {
  const { enabled = true, blockMode = "redirect", blockedIds = [] } =
    await chrome.storage.sync.get({
      enabled   : true,
      blockMode : "redirect",
      blockedIds: []
    });

  /* 0) 현재 모든 동적 규칙 id 목록 */
  const currRules = await chrome.declarativeNetRequest.getDynamicRules();
  const currIds   = currRules.map(r => r.id);

  /* 1) ON 이 아닌 경우 → 규칙 모두 삭제 후 종료 */
  if (!enabled || blockMode === "redirect") {
    if (currIds.length)
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: currIds });
    /* redirect 모드일 땐 content_script 가 처리 → 여기선 규칙 필요 없음 */
    return;
  }

  /* 2) 완전 차단(block) 규칙 생성 */
  const allIds = [...new Set([...BUILTIN, ...blockedIds.map(s => s.toLowerCase())])];
  const addRules = allIds.map((gid, idx) => ({
    id: idx + 1,                                   // 1,2,3 … 안정적 id
    priority: 1,
    condition: { urlFilter: `*://gall.dcinside.com/*id=${gid}*` },
    action: { type: "block" }
  }));

  /* 3) 업데이트 (기존 → 제거, 신규 → 추가) */
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: currIds,
    addRules
  });
}

/* 최초 실행 */
syncRules();

/* storage 변경 → 재동기화 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "sync" &&
    (changes.blockedIds || changes.blockMode || changes.enabled)
  ) {
    syncRules();
  }
});

/* ───── 툴바 아이콘: 옵션 페이지 열기 ───── */
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
