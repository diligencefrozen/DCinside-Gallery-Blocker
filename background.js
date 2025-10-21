/*****************************************************************
 * background.js
 *****************************************************************/

/* ───── 상수 ───── */
const MAIN_URL  = "https://www.dcinside.com";
const BUILTIN   = ["dcbest"];          // 항상 차단
const RULE_NS   = 40_000;              // 다른 확장과 id 충돌 방지 (40001…)

/* ───── 컨텍스트 메뉴 ID ───── */
const CTX_ROOT         = "dcb-root";
const CTX_BLOCK_USER   = "dcb-block-user";
const CTX_OPEN_OPTIONS = "dcb-open-options";

/* ───── 설치/업데이트: 기본값 주입 + 메뉴 생성 ───── */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    // 기본값: 하드모드 + 갤러리차단 ON + 사용자차단 ON
    // ※ galleryBlockEnabled가 없으면 과거 enabled 값을 이관(fallback)
    const seed  = await chrome.storage.sync.get(["blockMode", "galleryBlockEnabled", "enabled", "userBlockEnabled"]);
    const patch = {};
    if (typeof seed.blockMode            === "undefined") patch.blockMode            = "block";
    if (typeof seed.galleryBlockEnabled  === "undefined") patch.galleryBlockEnabled  = (typeof seed.enabled === "boolean") ? !!seed.enabled : true;
    if (typeof seed.userBlockEnabled     === "undefined") patch.userBlockEnabled     = true;
    if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
  }
  createContextMenus();
});

/* 서비스워커가 재시작될 때도 메뉴가 확실히 있도록 */
createContextMenus();

/* ───── 컨텍스트 메뉴 생성 ───── */
function createContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CTX_ROOT,
        title: "디시갤 차단기",
        contexts: ["all"],
        documentUrlPatterns: ["*://gall.dcinside.com/*"]
      });
      chrome.contextMenus.create({
        id: CTX_BLOCK_USER,
        parentId: CTX_ROOT,
        title: "해당 이용자 즉시 차단!",
        contexts: ["all"],
        documentUrlPatterns: ["*://gall.dcinside.com/*"]
      });
      chrome.contextMenus.create({
        id: CTX_OPEN_OPTIONS,
        parentId: CTX_ROOT,
        title: "설정 열기",
        contexts: ["all"],
        documentUrlPatterns: ["*://gall.dcinside.com/*"]
      });
    });
  } catch (e) {
    // 첫 부팅 직후 permission 미준비 등으로 실패할 수 있으니 무시
  }
}

/* ───── DNR 규칙 생성 ───── */
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

/* ───── DNR 동기화 ───── */
async function syncRules() {
  // galleryBlockEnabled(신규) 우선, 없으면 enabled(구버전)로 대체
  const conf = await chrome.storage.sync.get({
    galleryBlockEnabled: undefined,
    enabled            : true,
    blockMode          : "block",
    blockedIds         : []
  });

  const gEnabled = (typeof conf.galleryBlockEnabled === "boolean")
    ? conf.galleryBlockEnabled
    : !!conf.enabled;

  const curr    = await chrome.declarativeNetRequest.getDynamicRules();
  const currIds = curr.map(r => r.id);

  // 하드모드(block)만 DNR 사용, redirect/smart는 content script가 처리
  if (!gEnabled || conf.blockMode === "redirect" || conf.blockMode === "smart") {
    if (currIds.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: currIds });
    }
    console.log(`[DNR] ${conf.blockMode || "OFF"} mode - rules cleared`);
    return;
  }

  const ids   = [...new Set([...BUILTIN, ...conf.blockedIds.map(t => t.toLowerCase())])];
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
  // blockedIds / blockMode / galleryBlockEnabled(enabled 호환) 변화에 반응
  if (area === "sync" && (c.blockedIds || c.blockMode || c.galleryBlockEnabled || c.enabled)) {
    syncRules();
  }
});

/* ───── 우클릭 후보 수신 (ctx-probe.js) ───── */
const lastCtxByTab = new Map();
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "dcb.ctxCandidate" && sender.tab?.id != null) {
    lastCtxByTab.set(sender.tab.id, { uid: msg.uid || "", ip: msg.ip || "" });
  }
});

/* ───── 컨텍스트 메뉴 클릭 처리 ───── */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === CTX_OPEN_OPTIONS) {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (info.menuItemId !== CTX_BLOCK_USER) return;

  const cand = lastCtxByTab.get(tab.id) || {};
  const sel  = (info.selectionText || "").trim();

  // UID 우선, 없으면 IP 앞두옥텟, 그래도 없으면 선택 텍스트에서 추출
  const uidFromSel = sel.match(/[A-Za-z0-9_\-]{3,}/)?.[0] || "";
  const ipFromSel  = sel.match(/(\d{1,3}\.\d{1,3})/)?.[1] || "";

  const token = (cand.uid && cand.uid.trim())
             || (cand.ip  && cand.ip.trim())
             || uidFromSel
             || ipFromSel;

  if (!token) {
    chrome.action.setBadgeText({ tabId: tab.id, text: "?" });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 1200);
    return;
  }

  const { blockedUids = [], userBlockEnabled = true } =
    await chrome.storage.sync.get({ blockedUids: [], userBlockEnabled: true });

  const next = Array.from(new Set([...blockedUids, token]));
  await chrome.storage.sync.set({ blockedUids: next });

  chrome.action.setBadgeText({ tabId: tab.id, text: userBlockEnabled ? "✔" : "OFF" });
  setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 1200);
});

/* 탭 닫힘 시 캐시 정리 */
chrome.tabs.onRemoved.addListener((tabId) => lastCtxByTab.delete(tabId));

/* 아이콘(툴바) 클릭 → 옵션 페이지 */
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
