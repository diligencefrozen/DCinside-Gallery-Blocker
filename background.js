/*****************************************************************
 * background.js 
 *****************************************************************/

/* ───── 상수 ───── */
const MAIN_URL  = "https://www.dcinside.com";
const BUILTIN   = ["dcbest"];          // 항상 차단
const RULE_NS   = 40_000;              // 다른 확장과 id 충돌 방지 (40001…)

/* 최초 설치 시 기본값 주입: 하드모드 + 사용 ON */
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.storage.sync.get(["blockMode", "enabled"], (conf) => {
      const patch = {};
      if (typeof conf.blockMode === "undefined") patch.blockMode = "block"; // 기본: 하드모드
      if (typeof conf.enabled   === "undefined") patch.enabled   = true;    // 기본: ON
      if (Object.keys(patch).length) chrome.storage.sync.set(patch);
    });
  }
});

/* 규칙 생성 */
const makeRules = (ids) =>
  ids.map((gid, i) => ({
    id       : RULE_NS + i + 1,
    priority : 1,
    condition: {
      urlFilter    : `|https://gall.dcinside.com/*id=${gid}*`, // 스킴+호스트 고정
      resourceTypes: ["main_frame"]                            // 탐색 요청만
    },
    action   : { type: "block" }
  }));

/* 동기화 */
async function syncRules() {
  // 기본값도 하드모드로 맞춤
  const { enabled = true, blockMode = "block", blockedIds = [] } =
    await chrome.storage.sync.get({
      enabled   : true,
      blockMode : "block",   // ← 기본 하드모드
      blockedIds: []
    });

  /* 현재 규칙 id */
  const curr = await chrome.declarativeNetRequest.getDynamicRules();
  const currIds = curr.map(r => r.id);

  /* redirect 모드 또는 OFF → 규칙 제거 후 끝 */
  if (!enabled || blockMode === "redirect") {
    if (currIds.length)
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: currIds });
    console.log("[DNR] redirect/OFF - rules cleared");
    return;
  }

  /* 완전 차단 모드 → 새 규칙 생성 */
  const ids   = [...new Set([...BUILTIN, ...blockedIds.map(t => t.toLowerCase())])];
  const rules = makeRules(ids);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: currIds,
    addRules     : rules
  });
  console.log(`[DNR] block mode – rules: ${rules.length}`);
}

/* 최초 + 스토리지 변경 감지 */
syncRules();
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "sync" && (c.blockedIds || c.blockMode || c.enabled)) syncRules();
});

/* 아이콘(툴바) 클릭 → 옵션 페이지 */
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
