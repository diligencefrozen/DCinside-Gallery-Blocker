/*****************************************************************
 * background.js
 *****************************************************************/

/* ───── 상수 ───── */
const MAIN_URL = "https://www.dcinside.com";
const BUILTIN = ["dcbest"];             // 기본 차단: 실베
const RULE_NS = 40_000;                 // DNR rule id namespace
const RULE_MAX_OFFSET = 20_000;         // 이 확장프로그램이 쓰는 동적 규칙 범위

/* ───── 컨텍스트 메뉴 ID ───── */
const CTX_ROOT = "dcb-root";
const CTX_BLOCK_USER = "dcb-block-user";
const CTX_OPEN_OPTIONS = "dcb-open-options";

/* ───── 유틸 ───── */
function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function escapeRegex(v) {
  return String(v || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
  사용자가 차단 갤러리를 추가할 때 아래 둘 다 허용한다.

  1) 갤러리 ID:
     asdf12

  2) 갤러리 URL:
     https://gall.dcinside.com/mgallery/board/lists?id=asdf12
     https://gall.dcinside.com/board/view/?id=dcbest&no=123
*/
function extractGalleryId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);

    if (!url.hostname.endsWith("dcinside.com")) {
      return norm(raw);
    }

    const id = url.searchParams.get("id");
    if (id) return norm(id);

    const pathMatch = url.pathname.match(/^\/(?:mgallery|mini|person)\/([^/?#]+)/i);
    if (pathMatch?.[1]) return norm(pathMatch[1]);

    return "";
  } catch {
    return norm(raw)
      .replace(/^id=/i, "")
      .split(/[?#&\s]/)[0]
      .trim();
  }
}

function normalizeGalleryIds(values) {
  const arr = Array.isArray(values) ? values : [];

  return Array.from(
    new Set(
      arr
        .map(extractGalleryId)
        .filter(Boolean)
    )
  );
}

function getAllBlockedGalleryIds(blockedIds = []) {
  return Array.from(
    new Set([
      ...BUILTIN.map(extractGalleryId).filter(Boolean),
      ...normalizeGalleryIds(blockedIds)
    ])
  );
}

function getOurRuleIds(rules) {
  return rules
    .map((r) => r.id)
    .filter((id) => id >= RULE_NS && id < RULE_NS + RULE_MAX_OFFSET);
}

/* ───── 설치/업데이트: 기본값 주입 + 메뉴 생성 ───── */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    const seed = await chrome.storage.sync.get([
      "blockMode",
      "galleryBlockEnabled",
      "enabled",
      "userBlockEnabled",
      "blockedIds"
    ]);

    const patch = {};

    if (typeof seed.blockMode === "undefined") {
      patch.blockMode = "smart";
    }

    if (typeof seed.galleryBlockEnabled === "undefined") {
      patch.galleryBlockEnabled =
        typeof seed.enabled === "boolean" ? !!seed.enabled : true;
    }

    if (typeof seed.userBlockEnabled === "undefined") {
      patch.userBlockEnabled = true;
    }

    if (!Array.isArray(seed.blockedIds)) {
      patch.blockedIds = [];
    }

    if (Object.keys(patch).length) {
      await chrome.storage.sync.set(patch);
    }
  }

  createContextMenus();
  syncRules();
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
    /*
      서비스워커 첫 부팅 직후 권한/컨텍스트 준비 타이밍 문제로
      실패할 수 있으므로 조용히 무시한다.
    */
  }
}

/* ───── DNR 규칙 생성 ───── */
function makeRules(ids) {
  const cleanIds = Array.from(
    new Set(ids.map(extractGalleryId).filter(Boolean))
  );

  const rules = [];
  let offset = 1;

  for (const gid of cleanIds) {
    const safeGid = escapeRegex(gid);

    /*
      1) query id 차단
      예:
      https://gall.dcinside.com/mgallery/board/lists?id=asdf12
      https://gall.dcinside.com/board/view/?id=dcbest&no=123
      https://gall.dcinside.com/mini/board/view/?id=asdf12&no=123
    */
    rules.push({
      id: RULE_NS + offset++,
      priority: 10,
      condition: {
        regexFilter:
          `^https?://gall\\.dcinside\\.com/.*[?&]id=${safeGid}([&#]|$)`,
        resourceTypes: ["main_frame"]
      },
      action: { type: "block" }
    });

    /*
      2) 경로형 갤러리 대비
      예:
      https://gall.dcinside.com/mgallery/asdf12
      https://gall.dcinside.com/mini/asdf12
      https://gall.dcinside.com/person/asdf12
    */
    rules.push({
      id: RULE_NS + offset++,
      priority: 10,
      condition: {
        regexFilter:
          `^https?://gall\\.dcinside\\.com/(mgallery|mini|person)/${safeGid}([/?#]|$)`,
        resourceTypes: ["main_frame"]
      },
      action: { type: "block" }
    });
  }

  return rules;
}

/* ───── DNR 동기화 ───── */
async function syncRules() {
  const conf = await chrome.storage.sync.get({
    galleryBlockEnabled: undefined,
    enabled: true,
    blockMode: "smart",
    blockedIds: []
  });

  const gEnabled =
    typeof conf.galleryBlockEnabled === "boolean"
      ? conf.galleryBlockEnabled
      : !!conf.enabled;

  const curr = await chrome.declarativeNetRequest.getDynamicRules();
  const currIds = getOurRuleIds(curr);

  if (!gEnabled) {
    if (currIds.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: currIds
      });
    }

    console.log("[DNR] gallery blocking disabled - rules cleared");
    return;
  }

  /*
    사용자가 추가한 차단 갤러리는 Google, 주소창, 북마크, 내부 검색으로
    우회 접근할 수 있으므로 갤러리 차단 기능이 켜져 있으면 DNR을 항상 동기화한다.

    blockMode는 기존 content script의 표시 방식에만 사용하고,
    main_frame 접근 방어는 여기서 먼저 수행한다.
  */
  const ids = getAllBlockedGalleryIds(conf.blockedIds);
  const rules = makeRules(ids);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: currIds,
    addRules: rules
  });

  console.log(`[DNR] hard access rules synced: ${rules.length}`);
}

/* 최초 + 스토리지 변경 감지 */
syncRules();

chrome.storage.onChanged.addListener((c, area) => {
  if (
    area === "sync" &&
    (
      c.blockedIds ||
      c.blockMode ||
      c.galleryBlockEnabled ||
      c.enabled
    )
  ) {
    syncRules();
  }
});

/* ───── 우클릭 후보 수신 (ctx-probe.js) ───── */
const lastCtxByTab = new Map();

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "dcb.ctxCandidate" && sender.tab?.id != null) {
    lastCtxByTab.set(sender.tab.id, {
      uid: msg.uid || "",
      ip: msg.ip || ""
    });
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
  const sel = (info.selectionText || "").trim();

  const uidFromSel = sel.match(/[A-Za-z0-9_\-]{3,}/)?.[0] || "";
  const ipFromSel = sel.match(/(\d{1,3}\.\d{1,3})/)?.[1] || "";

  const token =
    (cand.uid && cand.uid.trim()) ||
    (cand.ip && cand.ip.trim()) ||
    uidFromSel ||
    ipFromSel;

  if (!token) {
    chrome.action.setBadgeText({ tabId: tab.id, text: "?" });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    }, 1200);
    return;
  }

  const { blockedUids = [], userBlockEnabled = true } =
    await chrome.storage.sync.get({
      blockedUids: [],
      userBlockEnabled: true
    });

  const next = Array.from(new Set([...blockedUids, token]));

  await chrome.storage.sync.set({
    blockedUids: next
  });

  chrome.action.setBadgeText({
    tabId: tab.id,
    text: userBlockEnabled ? "✔" : "OFF"
  });

  setTimeout(() => {
    chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  }, 1200);
});

/* 탭 닫힘 시 캐시 정리 */
chrome.tabs.onRemoved.addListener((tabId) => {
  lastCtxByTab.delete(tabId);
});

/* 아이콘(툴바) 클릭 → 옵션 페이지 */
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
