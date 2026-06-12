/*****************************************************************
 * background.js
 *****************************************************************/

/* ───── 상수 ───── */
const MAIN_URL = "https://www.dcinside.com";
const BUILTIN_DCBEST_ID = "dcbest";       // 기본 차단: 실시간베스트
const RULE_NS = 40_000;                 // DNR rule id namespace
const RULE_MAX_OFFSET = 20_000;         // 이 확장프로그램이 쓰는 동적 규칙 범위
const AREA_PICKER_MENU_ID = "dcb-area-picker-select";
const USER_BLOCK_CONTEXT_MENU_ID = "dcb-user-block-context";

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

function getBuiltinBlockedGalleryIds(builtinDcbestBlockEnabled = true) {
  return builtinDcbestBlockEnabled === false ? [] : [BUILTIN_DCBEST_ID];
}

function getAllBlockedGalleryIds(blockedIds = [], builtinDcbestBlockEnabled = true) {
  return Array.from(
    new Set([
      ...getBuiltinBlockedGalleryIds(builtinDcbestBlockEnabled)
        .map(extractGalleryId)
        .filter(Boolean),
      ...normalizeGalleryIds(blockedIds)
    ])
  );
}

function getOurRuleIds(rules) {
  return rules
    .map((r) => r.id)
    .filter((id) => id >= RULE_NS && id < RULE_NS + RULE_MAX_OFFSET);
}

function normalizeUserBlockToken(token) {
  const clean = String(token || "")
    .trim()
    .replace(/^uid\s*[:=]\s*/i, "")
    .replace(/^ip\s*[:=]\s*/i, "")
    .replace(/^\(|\)$/g, "")
    .trim();

  if (!clean) return "";

  const ip = normalizeUserBlockIpPrefix(clean);
  if (ip && isUserBlockIpLike(clean)) return ip;

  return clean;
}

function normalizeUserBlockIpPrefix(token) {
  const m = String(token || "")
    .trim()
    .match(/\b(\d{1,3}\.\d{1,3})(?:\.\d{1,3}){0,2}\b/);
  return m ? m[1] : "";
}

function isUserBlockIpLike(token) {
  return /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(token || "").trim());
}

function userBlockTokenKey(token) {
  return normalizeUserBlockToken(token).toLowerCase();
}

function normalizeUserBlockList(values) {
  const out = [];
  const seen = new Set();

  (Array.isArray(values) ? values : []).forEach((value) => {
    const clean = normalizeUserBlockToken(value);
    const key = userBlockTokenKey(clean);
    if (!clean || seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  });

  return out;
}

async function normalizeStoredUserBlockList() {
  try {
    const { blockedUids = [] } = await chrome.storage.sync.get({ blockedUids: [] });
    if (!Array.isArray(blockedUids)) return;

    const normalized = normalizeUserBlockList(blockedUids);
    const changed =
      normalized.length !== blockedUids.length ||
      normalized.some((value, idx) => value !== blockedUids[idx]);

    if (changed) {
      await chrome.storage.sync.set({ blockedUids: normalized });
    }
  } catch (_) {
    // storage 정리는 보조 기능이므로 실패해도 핵심 차단 흐름은 유지한다.
  }
}
function showActionBadge(tabId, text) {
  if (!tabId) return;

  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" });
  }, 1100);
}

/* 우클릭 메뉴 재구성 */
function resetContextMenus() {
  try {
    if (!chrome.contextMenus?.removeAll) return;

    chrome.contextMenus.removeAll(() => {
      void chrome.runtime.lastError;

      try {
        chrome.contextMenus.create({
          id: AREA_PICKER_MENU_ID,
          title: "🧹 이 영역 숨기기",
          contexts: ["all"],
          documentUrlPatterns: [
            "*://gall.dcinside.com/*",
            "*://www.dcinside.com/*",
            "*://search.dcinside.com/*"
          ]
        }, () => void chrome.runtime.lastError);

        chrome.contextMenus.create({
          id: USER_BLOCK_CONTEXT_MENU_ID,
          title: "🚫 이 사용자 차단하기",
          contexts: ["all"],
          documentUrlPatterns: [
            "*://gall.dcinside.com/*"
          ]
        }, () => void chrome.runtime.lastError);
      } catch (_) {
        // contextMenus 초기화 타이밍 문제는 핵심 차단 기능과 무관하므로 무시한다.
      }
    });
  } catch (_) {
    // contextMenus 권한/초기화 타이밍 문제는 차단 기능과 무관하므로 무시한다.
  }
}

/* ───── 설치/업데이트: 기본값 주입 ───── */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  resetContextMenus();

  if (reason === "install") {
    const seed = await chrome.storage.sync.get([
      "blockMode",
      "galleryBlockEnabled",
      "builtinDcbestBlockEnabled",
      "enabled",
      "userBlockEnabled",
      "userBlockTriggerMode",
      "userBlockHoverHintEnabled",
      "gamemecaBlockEnabled",
      "doryBlockEnabled",
      "noticeBlockEnabled",
      "blockedIds",
      "dcbFontFamily",
      "dcbFontCustomFamily",
      "dcbFontScale",
      "dcbApplyFontToDc"
    ]);

    const patch = {};

    if (typeof seed.blockMode === "undefined") {
      patch.blockMode = "smart";
    }

    if (typeof seed.galleryBlockEnabled === "undefined") {
      patch.galleryBlockEnabled =
        typeof seed.enabled === "boolean" ? !!seed.enabled : true;
    }

    if (typeof seed.builtinDcbestBlockEnabled === "undefined") {
      patch.builtinDcbestBlockEnabled = true;
    }

    if (typeof seed.userBlockEnabled === "undefined") {
      patch.userBlockEnabled = true;
    }

    if (typeof seed.userBlockTriggerMode === "undefined") {
      patch.userBlockTriggerMode = "instant";
    }

    if (typeof seed.userBlockHoverHintEnabled === "undefined") {
      patch.userBlockHoverHintEnabled = true;
    }

    if (typeof seed.gamemecaBlockEnabled === "undefined") {
      patch.gamemecaBlockEnabled = true;
    }

    if (typeof seed.doryBlockEnabled === "undefined") {
      patch.doryBlockEnabled = true;
    }

    if (typeof seed.noticeBlockEnabled === "undefined") {
      patch.noticeBlockEnabled = true;
    }

    if (!Array.isArray(seed.blockedIds)) {
      patch.blockedIds = [];
    }

    if (typeof seed.dcbFontFamily === "undefined") {
      patch.dcbFontFamily = "Noto Sans KR";
    }

    if (typeof seed.dcbFontCustomFamily === "undefined") {
      patch.dcbFontCustomFamily = "";
    }

    if (typeof seed.dcbFontScale === "undefined") {
      patch.dcbFontScale = 100;
    }

    if (typeof seed.dcbApplyFontToDc === "undefined") {
      patch.dcbApplyFontToDc = true;
    }

    if (Object.keys(patch).length) {
      await chrome.storage.sync.set(patch);
    }
  }

  syncRules();
});

/* 서비스워커가 재시작될 때도 우클릭 메뉴를 안정적으로 재구성 */
resetContextMenus();
normalizeStoredUserBlockList();

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
    builtinDcbestBlockEnabled: true,
    blockedIds: []
  });

  const gEnabled =
    typeof conf.galleryBlockEnabled === "boolean"
      ? conf.galleryBlockEnabled
      : !!conf.enabled;

  const curr = await chrome.declarativeNetRequest.getDynamicRules();
  const currIds = getOurRuleIds(curr);

  /*
    DNR(main_frame 네트워크 차단)은 하드 모드 전용이다.

    smart    : 페이지를 로드한 뒤 경고 + 이번만 보기 제공
    redirect : 페이지를 로드한 뒤 카운트다운 후 메인으로 이동
    block    : 페이지 로드 전 네트워크 단계에서 완전 차단
  */
  if (!gEnabled || conf.blockMode !== "block") {
    if (currIds.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: currIds
      });
    }

    console.log(`[DNR] hard access rules cleared - enabled=${gEnabled}, mode=${conf.blockMode}`);
    return;
  }

  const ids = getAllBlockedGalleryIds(conf.blockedIds, conf.builtinDcbestBlockEnabled);
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
      c.builtinDcbestBlockEnabled ||
      c.enabled
    )
  ) {
    syncRules();
  }
});

/* ───── 사용자 즉시 차단 ───── */
async function addBlockedUserToken(token) {
  const cleanToken = normalizeUserBlockToken(token);

  if (!cleanToken) {
    return {
      ok: false,
      reason: "EMPTY_TOKEN"
    };
  }

  const { blockedUids = [], userBlockEnabled = true } =
    await chrome.storage.sync.get({
      blockedUids: [],
      userBlockEnabled: true
    });

  const prev = normalizeUserBlockList(blockedUids);
  const cleanKey = userBlockTokenKey(cleanToken);
  const alreadyBlocked = prev.some((value) => userBlockTokenKey(value) === cleanKey);
  const next = alreadyBlocked ? prev : [...prev, cleanToken];

  const shouldPersist =
    !alreadyBlocked ||
    !Array.isArray(blockedUids) ||
    prev.length !== blockedUids.length ||
    prev.some((value, idx) => value !== blockedUids[idx]);

  if (shouldPersist) {
    await chrome.storage.sync.set({
      blockedUids: next
    });
  }

  return {
    ok: true,
    token: cleanToken,
    added: !alreadyBlocked,
    alreadyBlocked,
    count: next.length,
    userBlockEnabled
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "dcb.instantCtxBlock") return;

  addBlockedUserToken(msg.token)
    .then((res) => {
      const tabId = sender.tab?.id;

      if (!res.ok) {
        showActionBadge(tabId, "?");
        sendResponse(res);
        return;
      }

      showActionBadge(tabId, res.userBlockEnabled ? "✔" : "OFF");

      if (tabId) {
        const applyMessage = { type: "dcb.userBlockApply", token: res.token };
        const options = typeof sender.frameId === "number" ? { frameId: sender.frameId } : undefined;
        chrome.tabs.sendMessage(tabId, applyMessage, options, () => void chrome.runtime.lastError);
      }

      sendResponse(res);
    })
    .catch((error) => {
      showActionBadge(sender.tab?.id, "!");
      sendResponse({
        ok: false,
        reason: "ERROR",
        message: error?.message || String(error)
      });
    });

  return true;
});

/* ───── 우클릭 메뉴: 사용자 차단 / 영역 숨기기 선택 ───── */
chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === USER_BLOCK_CONTEXT_MENU_ID) {
    const message = { type: "dcb.legacyContextUserBlock" };
    const done = () => {
      if (chrome.runtime.lastError) showActionBadge(tab.id, "?");
    };

    if (typeof info.frameId === "number") {
      chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId }, done);
    } else {
      chrome.tabs.sendMessage(tab.id, message, done);
    }

    return;
  }

  if (info.menuItemId !== AREA_PICKER_MENU_ID) return;

  const done = (res) => {
    if (chrome.runtime.lastError) {
      showActionBadge(tab.id, "?");
      return;
    }

    if (res?.ok) {
      showActionBadge(tab.id, "✔");
    } else {
      showActionBadge(tab.id, "!");
    }
  };

  const message = { type: "dcb.areaPicker.blockContextTarget" };

  if (typeof info.frameId === "number") {
    chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId }, done);
  } else {
    chrome.tabs.sendMessage(tab.id, message, done);
  }
});

/* 아이콘(툴바) 클릭 → 옵션 페이지
   default_popup이 설정된 상태에서는 보통 팝업이 우선 열린다. */
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
