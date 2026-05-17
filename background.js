/*****************************************************************
 * background.js
 *****************************************************************/

/* ───── 상수 ───── */
const MAIN_URL = "https://www.dcinside.com";
const BUILTIN = ["dcbest"];             // 기본 차단: 실베
const RULE_NS = 40_000;                 // DNR rule id namespace
const RULE_MAX_OFFSET = 20_000;         // 이 확장프로그램이 쓰는 동적 규칙 범위

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

function normalizeUserBlockToken(token) {
  return String(token || "")
    .trim()
    .replace(/^\(|\)$/g, "")
    .trim();
}

function showActionBadge(tabId, text) {
  if (!tabId) return;

  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" });
  }, 1100);
}

/* 이전 버전에서 생성된 우클릭 메뉴 제거 */
function clearLegacyContextMenus() {
  try {
    if (!chrome.contextMenus?.removeAll) return;
    chrome.contextMenus.removeAll(() => void chrome.runtime.lastError);
  } catch (_) {
    // contextMenus 권한/초기화 타이밍 문제는 차단 기능과 무관하므로 무시한다.
  }
}

/* ───── 설치/업데이트: 기본값 주입 ───── */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  clearLegacyContextMenus();

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

  syncRules();
});

/* 서비스워커가 재시작될 때도 과거 메뉴가 남지 않도록 정리 */
clearLegacyContextMenus();

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

  const prev = Array.isArray(blockedUids) ? blockedUids : [];
  const alreadyBlocked = prev.includes(cleanToken);
  const next = alreadyBlocked ? prev : [...prev, cleanToken];

  if (!alreadyBlocked) {
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

/* 아이콘(툴바) 클릭 → 옵션 페이지
   default_popup이 설정된 상태에서는 보통 팝업이 우선 열린다. */
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
