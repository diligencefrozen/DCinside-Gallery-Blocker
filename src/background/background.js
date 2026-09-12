/*****************************************************************
 * Bootstrap shared modules
 *****************************************************************/
importScripts("../shared/block-stats-history.js");
try {
  importScripts("../shared/storage/user-block-store.js");
} catch (error) {
  console.warn("[DCB] User block store bootstrap failed:", error);
}
importScripts("../shared/detection-config.js", "text-detection.js");

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
const USER_MEMO_CONTEXT_MENU_ID = "dcb-user-memo-context";

let userBlockMutationQueue = Promise.resolve();
let updateNoticeMutationQueue = Promise.resolve();

function queueUserBlockMutation(work) {
  const job = userBlockMutationQueue.then(work, work);
  userBlockMutationQueue = job.catch(() => {});
  return job;
}
const DCCON_BLOCK_CONTEXT_MENU_ID = "dcb-dccon-block-context";
const DCCON_BLOCK_ITEM_MENU_ID = "dcb-dccon-block-item";
const DCCON_BLOCK_GROUP_MENU_ID = "dcb-dccon-block-group";
const IMAGE_BLOCK_CONFIG_KEY = "dcbImageBlockConfig";
const LOW_ACTIVITY_RULE_KEY = "dcbImageAccountRules";
const DEFAULT_OFF_MIGRATION_KEY = "dcbDefaultOffMigration742";
const ACCOUNT_SAFETY_MIGRATION_KEY = "dcbAccountSafetyMigration739";
const ACCOUNT_SIGNAL_GUARD_KEY = "dcbAccountRequestGuardV1";
const ACCOUNT_SIGNAL_ENDPOINT = "https://gall.dcinside.com/api/gallog_user_layer/gallog_content_reple/";
const ACCOUNT_SIGNAL_MIN_INTERVAL_MS = 3_000;
const ACCOUNT_SIGNAL_WINDOW_MS = 10 * 60 * 1000;
const ACCOUNT_SIGNAL_WINDOW_LIMIT = 12;
const ACCOUNT_SIGNAL_TIMEOUT_MS = 8_000;
const ACCOUNT_SIGNAL_COOLDOWN_MS = 60 * 60 * 1000;
const AUTO_REFRESH_GUARD_KEY = "dcbAutoRefreshLastRequestAt";
const AUTO_REFRESH_MIN_INTERVAL_MS = 10_000;
const DCB_FETCH_TIMEOUT_MS = 12_000;
const BLOCK_STATS_TOTAL_KEY = "dcbBlockStatsTotal";
const BLOCK_STATS_HISTORY_KEY = "dcbBlockStatsHistory";
const UPDATE_NOTICE_KEY = "dcbUpdateNotice";
const UPDATE_NOTICE_SEEN_VERSION_KEY = "dcbUpdateNoticeSeenVersion";
const GITHUB_VERSION_CACHE_KEY = "dcbGithubPublishedVersion";
const GITHUB_RELEASE_API = "https://api.github.com/repos/diligencefrozen/DCinside-Gallery-Blocker/releases/latest";
const GITHUB_TAGS_API = "https://api.github.com/repos/diligencefrozen/DCinside-Gallery-Blocker/tags?per_page=100";
const GITHUB_RELEASES_URL = "https://github.com/diligencefrozen/DCinside-Gallery-Blocker/releases";
const GITHUB_TAGS_URL = "https://github.com/diligencefrozen/DCinside-Gallery-Blocker/tags";
const GITHUB_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GITHUB_PENDING_RETRY_MS = 10 * 60 * 1000;
const BLOCK_STATS_SESSION_PREFIX = "dcbBlockStatsPage:";
const BLOCK_STATS_CHECKPOINT_PREFIX = "dcbBlockStatsCheckpoint:";
const IMAGE_BYTES_TIMEOUT_MS = 12_000;
const IMAGE_BYTES_MAX_SIZE = 25 * 1024 * 1024;
const IMAGE_BYTES_MAX_CONCURRENCY = 2;
const IMAGE_BLOCK_INSTALL_DEFAULT = Object.freeze({
  enabled: false,
  hideMemberImages: true,
  hideGuestImages: true
});
const LOW_ACTIVITY_INSTALL_DEFAULT = Object.freeze({
  enabled: false,
  blockPosts: true,
  blockComments: true,
  ageRuleEnabled: false,
  maxPublicAgeDays: 30,
  postRuleEnabled: true,
  minPostCount: 5,
  commentRuleEnabled: true,
  minCommentCount: 10,
  activityMatchMode: "both",
  holdWhileChecking: false,
  cacheHours: 72
});

/* ───── 유틸 ───── */
function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizePublishedVersion(value) {
  const raw = String(value || "").trim().replace(/^refs\/tags\//i, "").replace(/^v(?=\d)/i, "");
  return /^\d+\.\d+\.\d+\.\d+$/.test(raw) ? raw : "";
}

function comparePublishedVersions(a, b) {
  const aa = normalizePublishedVersion(a).split(".").map(Number);
  const bb = normalizePublishedVersion(b).split(".").map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
    const diff = (aa[i] || 0) - (bb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

async function fetchGithubJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGithubVersionCache(value) {
  if (!value || typeof value !== "object") return null;
  const version = normalizePublishedVersion(value.version);
  if (!version) return null;
  return {
    version,
    source: value.source === "tag" ? "tag" : "release",
    checkedAt: Number(value.checkedAt) || 0,
    releasesUrl: GITHUB_RELEASES_URL,
    tagsUrl: GITHUB_TAGS_URL
  };
}

async function fetchGithubPublishedVersion({ maxAgeMs = GITHUB_VERSION_CACHE_TTL_MS, force = false } = {}) {
  let cached = null;
  try {
    const stored = await chrome.storage.local.get({ [GITHUB_VERSION_CACHE_KEY]: null });
    cached = normalizeGithubVersionCache(stored[GITHUB_VERSION_CACHE_KEY]);
  } catch (_) {}

  if (!force && cached && Date.now() - cached.checkedAt < maxAgeMs) return cached;

  const candidates = [];
  const [releaseResult, tagsResult] = await Promise.allSettled([
    fetchGithubJson(GITHUB_RELEASE_API),
    fetchGithubJson(GITHUB_TAGS_API)
  ]);

  if (releaseResult.status === "fulfilled") {
    const release = releaseResult.value;
    const version = !release?.draft && !release?.prerelease
      ? normalizePublishedVersion(release?.tag_name || release?.name)
      : "";
    if (version) candidates.push({ version, source: "release" });
  }

  if (tagsResult.status === "fulfilled" && Array.isArray(tagsResult.value)) {
    for (const tag of tagsResult.value) {
      const version = normalizePublishedVersion(tag?.name);
      if (version) candidates.push({ version, source: "tag" });
    }
  }

  if (!candidates.length) return cached;
  candidates.sort((a, b) => comparePublishedVersions(b.version, a.version));
  const best = candidates[0];
  const next = {
    version: best.version,
    source: best.source,
    checkedAt: Date.now(),
    releasesUrl: GITHUB_RELEASES_URL,
    tagsUrl: GITHUB_TAGS_URL
  };
  try {
    await chrome.storage.local.set({ [GITHUB_VERSION_CACHE_KEY]: next });
  } catch (_) {}
  return next;
}

async function resolveUpdateReleaseStatus() {
  const stored = await chrome.storage.local.get({
    [UPDATE_NOTICE_KEY]: null,
    [UPDATE_NOTICE_SEEN_VERSION_KEY]: "",
    [GITHUB_VERSION_CACHE_KEY]: null
  }).catch(() => ({}));
  const pending = stored[UPDATE_NOTICE_KEY] && typeof stored[UPDATE_NOTICE_KEY] === "object"
    ? stored[UPDATE_NOTICE_KEY]
    : null;
  const cached = normalizeGithubVersionCache(stored[GITHUB_VERSION_CACHE_KEY]);
  const installedVersion = normalizePublishedVersion(chrome.runtime.getManifest().version);

  let published = cached;
  const cacheAge = published ? Date.now() - published.checkedAt : Infinity;
  const needsPendingRefresh = !!pending && (!published || published.version !== installedVersion)
    && cacheAge >= GITHUB_PENDING_RETRY_MS;
  if (!published || cacheAge >= GITHUB_VERSION_CACHE_TTL_MS || needsPendingRefresh) {
    published = await fetchGithubPublishedVersion({
      force: !published || needsPendingRefresh,
      maxAgeMs: pending ? GITHUB_PENDING_RETRY_MS : GITHUB_VERSION_CACHE_TTL_MS
    }).catch(() => published);
  }

  const publishedVersion = normalizePublishedVersion(published?.version);
  if (!pending || !publishedVersion || publishedVersion !== installedVersion) {
    return { publishedVersion, updateNotice: null, source: published?.source || "" };
  }

  const seenVersion = normalizePublishedVersion(stored[UPDATE_NOTICE_SEEN_VERSION_KEY]);
  if (seenVersion === publishedVersion) {
    chrome.storage.local.remove(UPDATE_NOTICE_KEY).catch(() => {});
    return { publishedVersion, updateNotice: null, source: published?.source || "" };
  }

  return {
    publishedVersion,
    source: published?.source || "",
    updateNotice: {
      version: publishedVersion,
      previousVersion: String(pending.previousVersion || ""),
      updatedAt: Number(pending.updatedAt) || Date.now()
    }
  };
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
    if (!globalThis.DCBUserBlockStore) return;
    await DCBUserBlockStore.migrateLegacyToBuckets();
  } catch (_) {
    // storage 정리는 보조 기능이므로 실패해도 핵심 차단 흐름은 유지한다.
  }
}
const actionBadgeTimers = new Map();
const pageBlockStats = new Map();
const pageBlockTokens = new Map();
let blockStatsMutationQueue = Promise.resolve();

function queueBlockStatsMutation(work) {
  const job = blockStatsMutationQueue.then(work, work);
  blockStatsMutationQueue = job.catch(() => {});
  return job;
}

function emptyBlockStats() {
  return { total: 0, byCategory: {} };
}

function normalizeBlockStatsHistory(value) {
  return DCBBlockStatsHistory.normalize(value);
}

function addBlockStatsHistory(value, counts) {
  // 누적 통계와 같은 입력 제한을 적용해야 그래프 합계도 항상 누적 증가량과 일치한다.
  const increment = mergeBlockStats(emptyBlockStats(), counts).total;
  return DCBBlockStatsHistory.add(value, increment);
}

function normalizeBlockStats(value) {
  const source = value && typeof value === "object" ? value : {};
  const byCategory = {};
  Object.entries(source.byCategory && typeof source.byCategory === "object" ? source.byCategory : {}).forEach(([key, count]) => {
    const safe = Math.max(0, Number.parseInt(count, 10) || 0);
    if (safe) byCategory[String(key).slice(0, 40)] = safe;
  });
  const total = Object.values(byCategory).reduce((sum, count) => sum + count, 0);
  return { total, byCategory };
}

function mergeBlockStats(base, counts) {
  const next = normalizeBlockStats(base);
  Object.entries(counts && typeof counts === "object" ? counts : {}).forEach(([key, value]) => {
    const category = String(key || "other").trim().slice(0, 40) || "other";
    const count = Math.max(0, Math.min(10_000, Number.parseInt(value, 10) || 0));
    if (!count) return;
    next.byCategory[category] = (next.byCategory[category] || 0) + count;
  });
  next.total = Object.values(next.byCategory).reduce((sum, count) => sum + count, 0);
  return next;
}

function blockStatsSessionKey(tabId) {
  return `${BLOCK_STATS_SESSION_PREFIX}${tabId}`;
}

function blockStatsCheckpointKey(tabId) {
  return `${BLOCK_STATS_CHECKPOINT_PREFIX}${tabId}`;
}

function badgeTextForCount(total) {
  const count = Math.max(0, Number.parseInt(total, 10) || 0);
  if (!count) return "";
  if (count > 9999) return "9k+";
  if (count > 999) return "999+";
  return String(count);
}

async function setCountBadge(tabId, stats = null) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  let current = stats || pageBlockStats.get(tabId);
  if (!current) {
    try {
      const pageKey = blockStatsSessionKey(tabId);
      const checkpointKey = blockStatsCheckpointKey(tabId);
      const [sessionStored, localStored] = await Promise.all([
        chrome.storage.session.get(pageKey).catch(() => ({})),
        chrome.storage.local.get({ [checkpointKey]: null }).catch(() => ({}))
      ]);
      const checkpoint = localStored[checkpointKey];
      const stored = normalizePageId(checkpoint?.pageId) ? checkpoint : sessionStored[pageKey];
      current = normalizeBlockStats(stored);
      pageBlockStats.set(tabId, current);
    } catch (_) {
      current = emptyBlockStats();
    }
  }
  const text = badgeTextForCount(current.total);

  // 숫자 자체가 핵심이다. 배지 색상 API 하나가 실패해도 숫자 표시까지 건너뛰지 않는다.
  try {
    await chrome.action.setBadgeText({ tabId, text });
  } catch (_) {
    return;
  }
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#4f7cff" });
  } catch (_) {}
  try {
    await chrome.action.setBadgeTextColor?.({ tabId, color: "#ffffff" });
  } catch (_) {}
}

function broadcastBlockStats(tabId, page, cumulative = null, history = null) {
  try {
    chrome.runtime.sendMessage({
      type: "dcb.stats.updated",
      tabId,
      page: normalizeBlockStats(page),
      cumulative: cumulative ? normalizeBlockStats(cumulative) : null,
      history: history ? normalizeBlockStatsHistory(history) : null
    }, () => void chrome.runtime.lastError);
  } catch (_) {}
}

function showActionBadge(tabId, text) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const previousTimer = actionBadgeTimers.get(tabId);
  if (previousTimer) clearTimeout(previousTimer);

  try {
    chrome.action.setBadgeText({ tabId, text: String(text || "") });
  } catch (_) {}

  const timer = setTimeout(() => {
    actionBadgeTimers.delete(tabId);
    void setCountBadge(tabId);
  }, 1100);
  actionBadgeTimers.set(tabId, timer);
}

function normalizePageId(value) {
  return String(value || "").trim().slice(0, 120);
}

function statsSenderPageId(sender, fallback = "") {
  // 콘텐츠 통계 모듈이 만든 PAGE_ID를 pageStart/sync/live 경로에서 일관되게 사용한다.
  // 브라우저별 documentId 구현 차이가 통계 문서를 갈라놓지 않도록 fallback을 우선한다.
  return normalizePageId(fallback || sender?.documentId);
}

function statsSenderIsActive(sender) {
  const lifecycle = String(sender?.documentLifecycle || "").trim().toLowerCase();
  return !lifecycle || lifecycle === "active";
}

function statsSessionValue(pageId, stats) {
  const normalized = normalizeBlockStats(stats);
  return { pageId: normalizePageId(pageId), total: normalized.total, byCategory: normalized.byCategory };
}

async function resetPageBlockStats(tabId, pageId = "") {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const token = normalizePageId(pageId);
  const pageKey = blockStatsSessionKey(tabId);
  const checkpointKey = blockStatsCheckpointKey(tabId);

  // 동일 문서에서 pageStart가 재전송되더라도 이미 센 값을 지우지 않는다.
  if (token) {
    const memoryToken = normalizePageId(pageBlockTokens.get(tabId));
    const [sessionStored, localStored] = await Promise.all([
      chrome.storage.session.get(pageKey).catch(() => ({})),
      // 로컬 읽기 실패를 "체크포인트 없음"으로 취급하면 이미 반영한 델타를 다시 더할 수 있다.
      chrome.storage.local.get({ [checkpointKey]: null })
    ]);
    const durableValue = localStored[checkpointKey];
    const durableToken = normalizePageId(durableValue?.pageId);
    const sessionValue = sessionStored[pageKey];
    const sessionToken = normalizePageId(sessionValue?.pageId);
    const storedValue = durableToken ? durableValue : sessionValue;
    const storedToken = durableToken || sessionToken;

    if (storedToken === token || memoryToken === token) {
      const current = storedToken === token
        ? normalizeBlockStats(storedValue)
        : normalizeBlockStats(pageBlockStats.get(tabId));
      // 기존 session 체크포인트를 처음 마이그레이션하는 경우에도 다음 성공 응답 전에 내구화한다.
      if (durableToken !== token) {
        await chrome.storage.local.set({ [checkpointKey]: statsSessionValue(token, current) });
      }
      pageBlockTokens.set(tabId, token);
      pageBlockStats.set(tabId, current);
      await chrome.storage.session.set({ [pageKey]: statsSessionValue(token, current) }).catch(() => {});
      await setCountBadge(tabId, current);
      return { page: current, reused: true };
    }
  }

  const empty = emptyBlockStats();
  // 새 문서의 0 기준점도 먼저 내구화해야 이전 문서의 늦은 재전송과 구분할 수 있다.
  if (token) await chrome.storage.local.set({ [checkpointKey]: statsSessionValue(token, empty) });
  else await chrome.storage.local.remove(checkpointKey);

  pageBlockStats.set(tabId, empty);
  if (token) pageBlockTokens.set(tabId, token);
  else pageBlockTokens.delete(tabId);
  try {
    if (token) await chrome.storage.session.set({ [pageKey]: statsSessionValue(token, empty) });
    else await chrome.storage.session.remove(pageKey);
  } catch (_) {}
  await setCountBadge(tabId, empty);
  broadcastBlockStats(tabId, empty);
  return { page: empty, reused: false };
}

async function readBlockStatsState(tabId) {
  const pageKey = blockStatsSessionKey(tabId);
  const checkpointKey = blockStatsCheckpointKey(tabId);
  const [pageStored, totalStored] = await Promise.all([
    chrome.storage.session.get(pageKey).catch(() => ({})),
    // 누적 저장소 읽기가 실패하면 mutation 전체를 실패시켜 producer의 절대 스냅샷 재시도를 유도한다.
    chrome.storage.local.get({
      [BLOCK_STATS_TOTAL_KEY]: emptyBlockStats(),
      [BLOCK_STATS_HISTORY_KEY]: null,
      [checkpointKey]: null
    })
  ]);
  const durablePage = totalStored[checkpointKey];
  return {
    pageKey,
    checkpointKey,
    storedPage: normalizePageId(durablePage?.pageId) ? durablePage : pageStored[pageKey],
    cumulative: normalizeBlockStats(totalStored[BLOCK_STATS_TOTAL_KEY]),
    history: normalizeBlockStatsHistory(totalStored[BLOCK_STATS_HISTORY_KEY])
  };
}

function resolveBlockStatsBase(tabId, storedPage, token, senderIsActive = true) {
  const storedToken = normalizePageId(storedPage?.pageId);
  const memoryToken = normalizePageId(pageBlockTokens.get(tabId));
  const currentToken = storedToken || memoryToken;

  if (currentToken && currentToken !== token) {
    if (!senderIsActive) return { ignored: true, page: emptyBlockStats() };
    // pageStart가 유실되어도 새 활성 문서의 첫 집계를 그대로 받아들인다.
    return { ignored: false, page: emptyBlockStats(), newDocument: true };
  }

  const page = storedToken === token
    ? normalizeBlockStats(storedPage)
    : (pageBlockStats.get(tabId) || emptyBlockStats());
  return { ignored: false, page, newDocument: !currentToken };
}

async function persistBlockStats(tabId, token, pageKey, checkpointKey, page, cumulative, history) {
  const checkpoint = statsSessionValue(token, page);

  // 누적/일별 합계와 이 델타를 계산한 페이지 기준점을 한 저장 작업으로 커밋한다.
  // 실패를 삼키지 않아 producer가 같은 절대 스냅샷을 재전송하게 하고, 성공 후 재전송은
  // 함께 저장된 체크포인트가 중복 델타를 제거한다.
  await chrome.storage.local.set({
    [BLOCK_STATS_TOTAL_KEY]: cumulative,
    [BLOCK_STATS_HISTORY_KEY]: history,
    [checkpointKey]: checkpoint
  });

  pageBlockTokens.set(tabId, token);
  pageBlockStats.set(tabId, page);
  const sessionWrite = chrome.storage.session.set({ [pageKey]: checkpoint }).catch(() => {});
  await setCountBadge(tabId, page);
  broadcastBlockStats(tabId, page, cumulative, history);
  await sessionWrite;
  return { page, cumulative, history };
}

async function addBlockStats(tabId, counts, pageId = "", senderIsActive = true) {
  if (!Number.isInteger(tabId) || tabId < 0) return null;
  const token = normalizePageId(pageId);
  if (!token) return null;

  const {
    pageKey,
    checkpointKey,
    storedPage,
    cumulative: currentCumulative,
    history: currentHistory
  } = await readBlockStatsState(tabId);
  const base = resolveBlockStatsBase(tabId, storedPage, token, senderIsActive);
  if (base.ignored) return { ignored: true };

  const page = mergeBlockStats(base.page, counts);
  const cumulative = mergeBlockStats(currentCumulative, counts);
  const history = addBlockStatsHistory(currentHistory, counts);
  return persistBlockStats(tabId, token, pageKey, checkpointKey, page, cumulative, history);
}

async function syncBlockStats(tabId, absoluteStats, pageId = "", senderIsActive = true) {
  if (!Number.isInteger(tabId) || tabId < 0) return null;
  const token = normalizePageId(pageId);
  if (!token) return null;

  const incoming = normalizeBlockStats(absoluteStats);
  const {
    pageKey,
    checkpointKey,
    storedPage,
    cumulative: currentCumulative,
    history: currentHistory
  } = await readBlockStatsState(tabId);
  const base = resolveBlockStatsBase(tabId, storedPage, token, senderIsActive);
  if (base.ignored) return { ignored: true };

  const page = normalizeBlockStats(base.page);
  const delta = {};
  Object.entries(incoming.byCategory).forEach(([category, count]) => {
    const previous = Math.max(0, Number.parseInt(page.byCategory[category], 10) || 0);
    if (count > previous) delta[category] = count - previous;
    if (count > previous) page.byCategory[category] = count;
  });
  page.total = Object.values(page.byCategory).reduce((sum, count) => sum + count, 0);

  const cumulative = mergeBlockStats(currentCumulative, delta);
  const history = addBlockStatsHistory(currentHistory, delta);
  return persistBlockStats(tabId, token, pageKey, checkpointKey, page, cumulative, history);
}

function requestLiveBlockStats(tabId, { timeoutMs = 1200, reconcile = true } = {}) {
  if (!Number.isInteger(tabId) || tabId < 0 || !chrome.tabs?.sendMessage) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), Math.max(200, Number(timeoutMs) || 1200));

    try {
      chrome.tabs.sendMessage(
        tabId,
        { type: "dcb.stats.snapshot", reconcile },
        { frameId: 0 },
        (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            finish(null);
            return;
          }
          const pageId = normalizePageId(response.pageId);
          if (!pageId) {
            finish(null);
            return;
          }
          finish({ pageId, page: normalizeBlockStats(response.page) });
        }
      );
    } catch (_) {
      finish(null);
    }
  });
}

async function reconcileLiveBlockStats(tabId, { reconcile = true } = {}) {
  const live = await requestLiveBlockStats(tabId, { reconcile });
  if (!live) return null;
  // 탭 완료/활성화 이벤트도 메시지 기반 집계와 같은 큐를 사용해야
  // 여러 탭의 누적/일별 증가량이 서로의 storage 값을 덮어쓰지 않는다.
  return queueBlockStatsMutation(() => syncBlockStats(tabId, live.page, live.pageId, true));
}

function isStatsSupportedUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /(^|\.)dcinside\.(?:com|co\.kr)$/i.test(url.hostname);
  } catch (_) {
    return false;
  }
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
          title: "🚫 이 사용자 차단/해제",
          contexts: ["all"],
          documentUrlPatterns: [
            "*://gall.dcinside.com/*"
          ]
        }, () => void chrome.runtime.lastError);

        chrome.contextMenus.create({
          id: USER_MEMO_CONTEXT_MENU_ID,
          title: "📝 이 사용자 메모하기",
          contexts: ["all"],
          documentUrlPatterns: [
            "*://gall.dcinside.com/*"
          ]
        }, () => void chrome.runtime.lastError);

        chrome.contextMenus.create({
          id: DCCON_BLOCK_CONTEXT_MENU_ID,
          title: "🧩 디시콘 차단",
          contexts: ["page", "image", "video"],
          documentUrlPatterns: [
            "*://gall.dcinside.com/*"
          ]
        }, () => void chrome.runtime.lastError);

        chrome.contextMenus.create({
          id: DCCON_BLOCK_ITEM_MENU_ID,
          parentId: DCCON_BLOCK_CONTEXT_MENU_ID,
          title: "이 디시콘만 차단",
          contexts: ["page", "image", "video"],
          documentUrlPatterns: [
            "*://gall.dcinside.com/*"
          ]
        }, () => void chrome.runtime.lastError);

        chrome.contextMenus.create({
          id: DCCON_BLOCK_GROUP_MENU_ID,
          parentId: DCCON_BLOCK_CONTEXT_MENU_ID,
          title: "이 디시콘 그룹 전체 차단",
          contexts: ["page", "image", "video"],
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
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  resetContextMenus();

  if (reason === "update") {
    try {
      await chrome.storage.local.set({
        [UPDATE_NOTICE_KEY]: {
          previousVersion: String(previousVersion || ""),
          updatedAt: Date.now()
        }
      });
      // 표시할 버전명은 manifest가 아니라 GitHub Releases/Tags에서 확인한다.
      fetchGithubPublishedVersion({ force: true }).catch(() => {});
    } catch (_) {}
  }

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
      "dcbApplyFontToDc",
      "previewEnabled",
      "showMemberIpInfo",
      "userMemoEnabled",
      "recentPostsEnabled",
      "recentPostsLimit",
      IMAGE_BLOCK_CONFIG_KEY,
      LOW_ACTIVITY_RULE_KEY,
      DEFAULT_OFF_MIGRATION_KEY
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
      patch.dcbApplyFontToDc = false;
    }

    if (typeof seed.previewEnabled === "undefined") patch.previewEnabled = true;

    if (typeof seed.showMemberIpInfo === "undefined") {
      patch.showMemberIpInfo = true;
    }

    if (typeof seed.userMemoEnabled === "undefined") {
      patch.userMemoEnabled = false;
    }

    if (typeof seed.recentPostsEnabled === "undefined") {
      patch.recentPostsEnabled = false;
    }

    if (typeof seed.recentPostsLimit === "undefined") {
      patch.recentPostsLimit = 5;
    } else {
      const safeRecentPostsLimit = Math.min(5, Math.max(1, Number.parseInt(seed.recentPostsLimit, 10) || 5));
      if (safeRecentPostsLimit !== seed.recentPostsLimit) {
        patch.recentPostsLimit = safeRecentPostsLimit;
      }
    }

    if (!seed[IMAGE_BLOCK_CONFIG_KEY] || typeof seed[IMAGE_BLOCK_CONFIG_KEY] !== "object") {
      patch[IMAGE_BLOCK_CONFIG_KEY] = IMAGE_BLOCK_INSTALL_DEFAULT;
    }

    if (!seed[LOW_ACTIVITY_RULE_KEY] || typeof seed[LOW_ACTIVITY_RULE_KEY] !== "object") {
      patch[LOW_ACTIVITY_RULE_KEY] = LOW_ACTIVITY_INSTALL_DEFAULT;
    }

    if (seed[DEFAULT_OFF_MIGRATION_KEY] !== true) {
      const imageConfig = seed[IMAGE_BLOCK_CONFIG_KEY] && typeof seed[IMAGE_BLOCK_CONFIG_KEY] === "object"
        ? seed[IMAGE_BLOCK_CONFIG_KEY]
        : IMAGE_BLOCK_INSTALL_DEFAULT;
      const accountRules = seed[LOW_ACTIVITY_RULE_KEY] && typeof seed[LOW_ACTIVITY_RULE_KEY] === "object"
        ? seed[LOW_ACTIVITY_RULE_KEY]
        : LOW_ACTIVITY_INSTALL_DEFAULT;

      patch[IMAGE_BLOCK_CONFIG_KEY] = { ...imageConfig, enabled: false };
      patch[LOW_ACTIVITY_RULE_KEY] = { ...accountRules, enabled: false };
      patch[DEFAULT_OFF_MIGRATION_KEY] = true;
    }

    if (Object.keys(patch).length) {
      await chrome.storage.sync.set(patch);
    }
  }

  /*
    7.3.39 안전 마이그레이션
    - 기존 버전에서 켜 둔 자동 활동 조회를 업데이트 직후 한 번 끈다.
    - 갤로그 마지막 페이지를 훑던 연령 판정과 확인 중 선숨김을 비활성화한다.
    - 사용자가 다시 켜더라도 성공 판정은 오래 캐시해 반복 조회를 줄인다.
  */
  if (reason === "install" || reason === "update") {
    try {
      const safetySeed = await chrome.storage.sync.get({
        [LOW_ACTIVITY_RULE_KEY]: LOW_ACTIVITY_INSTALL_DEFAULT,
        [ACCOUNT_SAFETY_MIGRATION_KEY]: false
      });
      const safetyPatch = {};

      if (safetySeed[ACCOUNT_SAFETY_MIGRATION_KEY] !== true) {
        const current = safetySeed[LOW_ACTIVITY_RULE_KEY]
          && typeof safetySeed[LOW_ACTIVITY_RULE_KEY] === "object"
          ? safetySeed[LOW_ACTIVITY_RULE_KEY]
          : LOW_ACTIVITY_INSTALL_DEFAULT;

        safetyPatch[LOW_ACTIVITY_RULE_KEY] = {
          ...current,
          enabled: false,
          ageRuleEnabled: false,
          holdWhileChecking: false,
          cacheHours: Math.max(72, Number.parseInt(current.cacheHours, 10) || 0)
        };
        safetyPatch[ACCOUNT_SAFETY_MIGRATION_KEY] = true;
        await chrome.storage.local.set({
          dcbImageAccountSignalCache: {},
          [ACCOUNT_SIGNAL_GUARD_KEY]: {
            requestTimes: [],
            cooldownUntil: 0,
            consecutiveFailures: 0
          }
        });
      }

      if (Object.keys(safetyPatch).length) {
        await chrome.storage.sync.set(safetyPatch);
      }
    } catch (_) {
      // 안전 마이그레이션 실패가 다른 설치 작업을 막지 않도록 한다.
    }
  }

  syncRules();
});

/* 서비스워커가 재시작될 때도 우클릭 메뉴를 안정적으로 재구성 */
resetContextMenus();
queueUserBlockMutation(() => normalizeStoredUserBlockList());

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



/* ───── 회원 활동량 조회: 전 탭 공통 속도 제한·중복 제거·회로 차단 ───── */
const accountSignalQueue = [];
const accountSignalInflight = new Map();
let accountSignalQueueActive = false;
let accountSignalLastRequestAt = 0;
let accountSignalGuard = {
  requestTimes: [],
  cooldownUntil: 0,
  consecutiveFailures: 0
};

const accountSignalGuardReady = (async () => {
  try {
    const stored = await chrome.storage.local.get({
      [ACCOUNT_SIGNAL_GUARD_KEY]: accountSignalGuard
    });
    const value = stored[ACCOUNT_SIGNAL_GUARD_KEY];
    if (value && typeof value === "object") {
      accountSignalGuard = {
        requestTimes: Array.isArray(value.requestTimes)
          ? value.requestTimes.map(Number).filter(Number.isFinite)
          : [],
        cooldownUntil: Math.max(0, Number(value.cooldownUntil) || 0),
        consecutiveFailures: Math.max(0, Number.parseInt(value.consecutiveFailures, 10) || 0)
      };
    }
  } catch (_) {
    accountSignalGuard = {
      requestTimes: [],
      cooldownUntil: 0,
      consecutiveFailures: 0
    };
  }
})();

function accountSignalDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function normalizeAccountSignalUid(value) {
  const uid = String(value || "").trim();
  return /^[A-Za-z0-9._-]{2,64}$/.test(uid) ? uid : "";
}

function normalizeAccountSignalToken(value) {
  const token = String(value || "").trim();
  return token && token.length <= 2048 ? token : "";
}

function accountSignalSenderAllowed(sender) {
  try {
    const source = new URL(String(sender?.url || sender?.tab?.url || ""));
    return source.protocol === "https:" && source.hostname === "gall.dcinside.com";
  } catch (_) {
    return false;
  }
}

function pruneAccountSignalWindow(now = Date.now()) {
  accountSignalGuard.requestTimes = accountSignalGuard.requestTimes
    .map(Number)
    .filter((stamp) => Number.isFinite(stamp) && now - stamp < ACCOUNT_SIGNAL_WINDOW_MS)
    .sort((a, b) => a - b);
}

function persistAccountSignalGuard() {
  const snapshot = {
    requestTimes: [...accountSignalGuard.requestTimes],
    cooldownUntil: accountSignalGuard.cooldownUntil,
    consecutiveFailures: accountSignalGuard.consecutiveFailures
  };
  void chrome.storage.local.set({ [ACCOUNT_SIGNAL_GUARD_KEY]: snapshot });
}

function accountSignalRetryAfterMs(response) {
  const raw = String(response?.headers?.get?.("retry-after") || "").trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Math.max(0, Number(raw) * 1000);
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? Math.max(0, stamp - Date.now()) : 0;
}

function parseAccountSignalCounts(text) {
  const match = String(text || "").trim().match(/^(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  const posts = Number(match[1]);
  const comments = Number(match[2]);
  if (!Number.isSafeInteger(posts) || !Number.isSafeInteger(comments)) return null;
  return { posts, comments };
}

function tripAccountSignalCircuit(durationMs = ACCOUNT_SIGNAL_COOLDOWN_MS) {
  accountSignalGuard.cooldownUntil = Math.max(
    accountSignalGuard.cooldownUntil,
    Date.now() + Math.max(60_000, Number(durationMs) || ACCOUNT_SIGNAL_COOLDOWN_MS)
  );
  persistAccountSignalGuard();
}

function accountSignalFailure(reason, status = 0, retryAfterMs = 0) {
  accountSignalGuard.consecutiveFailures += 1;
  if ([403, 429, 503].includes(status)) {
    tripAccountSignalCircuit(Math.max(ACCOUNT_SIGNAL_COOLDOWN_MS, retryAfterMs));
  } else if (accountSignalGuard.consecutiveFailures >= 3) {
    tripAccountSignalCircuit(ACCOUNT_SIGNAL_COOLDOWN_MS);
  } else {
    persistAccountSignalGuard();
  }
  return {
    ok: false,
    status,
    reason,
    retryAfterMs: Math.max(
      retryAfterMs,
      accountSignalGuard.cooldownUntil - Date.now(),
      60 * 60 * 1000
    )
  };
}

async function performAccountSignalRequest(uid, token) {
  await accountSignalGuardReady;

  let now = Date.now();
  pruneAccountSignalWindow(now);

  if (accountSignalGuard.cooldownUntil > now) {
    return {
      ok: false,
      status: 0,
      reason: "COOLDOWN",
      retryAfterMs: accountSignalGuard.cooldownUntil - now
    };
  }

  if (accountSignalGuard.requestTimes.length >= ACCOUNT_SIGNAL_WINDOW_LIMIT) {
    const availableAt = accountSignalGuard.requestTimes[0] + ACCOUNT_SIGNAL_WINDOW_MS;
    accountSignalGuard.cooldownUntil = Math.max(accountSignalGuard.cooldownUntil, availableAt);
    persistAccountSignalGuard();
    return {
      ok: false,
      status: 0,
      reason: "BUDGET",
      retryAfterMs: Math.max(60_000, availableAt - now)
    };
  }

  const spacing = ACCOUNT_SIGNAL_MIN_INTERVAL_MS - (now - accountSignalLastRequestAt);
  if (spacing > 0) await accountSignalDelay(spacing);

  now = Date.now();
  pruneAccountSignalWindow(now);
  if (accountSignalGuard.cooldownUntil > now) {
    return {
      ok: false,
      status: 0,
      reason: "COOLDOWN",
      retryAfterMs: accountSignalGuard.cooldownUntil - now
    };
  }
  if (accountSignalGuard.requestTimes.length >= ACCOUNT_SIGNAL_WINDOW_LIMIT) {
    const availableAt = accountSignalGuard.requestTimes[0] + ACCOUNT_SIGNAL_WINDOW_MS;
    accountSignalGuard.cooldownUntil = Math.max(accountSignalGuard.cooldownUntil, availableAt);
    persistAccountSignalGuard();
    return {
      ok: false,
      status: 0,
      reason: "BUDGET",
      retryAfterMs: Math.max(60_000, availableAt - now)
    };
  }

  accountSignalLastRequestAt = now;
  accountSignalGuard.requestTimes.push(now);
  persistAccountSignalGuard();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACCOUNT_SIGNAL_TIMEOUT_MS);

  try {
    const body = new URLSearchParams({ ci_t: token, user_id: uid });
    const response = await fetch(ACCOUNT_SIGNAL_ENDPOINT, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      headers: {
        "Accept": "text/plain,*/*;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: body.toString(),
      signal: controller.signal
    });

    const retryAfterMs = accountSignalRetryAfterMs(response);
    if (!response.ok) {
      return accountSignalFailure("HTTP", response.status, retryAfterMs);
    }

    const counts = parseAccountSignalCounts(await response.text());
    if (!counts) return accountSignalFailure("INVALID_RESPONSE", response.status);

    accountSignalGuard.consecutiveFailures = 0;
    accountSignalGuard.cooldownUntil = 0;
    persistAccountSignalGuard();
    return {
      ok: true,
      status: response.status,
      posts: counts.posts,
      comments: counts.comments,
      checkedAt: Date.now()
    };
  } catch (error) {
    return accountSignalFailure(
      error?.name === "AbortError" ? "TIMEOUT" : "NETWORK",
      0
    );
  } finally {
    clearTimeout(timeout);
  }
}

function drainAccountSignalQueue() {
  if (accountSignalQueueActive) return;
  accountSignalQueueActive = true;

  void (async () => {
    while (accountSignalQueue.length) {
      const item = accountSignalQueue.shift();
      let result;
      try {
        result = await performAccountSignalRequest(item.uid, item.token);
      } catch (error) {
        result = accountSignalFailure(error?.message || "REQUEST", 0);
      }
      item.resolve(result);
    }
    accountSignalQueueActive = false;
  })();
}

function enqueueAccountSignal(uid, token) {
  const key = uid.toLowerCase();
  if (accountSignalInflight.has(key)) return accountSignalInflight.get(key);

  const queued = new Promise((resolve) => {
    accountSignalQueue.push({ uid, token, resolve });
    drainAccountSignalQueue();
  });
  const tracked = queued.finally(() => accountSignalInflight.delete(key));
  accountSignalInflight.set(key, tracked);
  return tracked;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "dcb.stats.pageStart") {
    const tabId = sender?.tab?.id;
    const pageId = statsSenderPageId(sender, message.pageId);
    if (!Number.isInteger(tabId) || !pageId || !statsSenderIsActive(sender)) {
      sendResponse({ ok: false });
      return;
    }
    queueBlockStatsMutation(() => resetPageBlockStats(tabId, pageId))
      .then((result) => sendResponse({ ok: true, ...(result || {}) }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "dcb.stats.sync") {
    const tabId = sender?.tab?.id;
    const pageId = statsSenderPageId(sender, message.pageId);
    if (!Number.isInteger(tabId) || !pageId) {
      sendResponse({ ok: false });
      return;
    }
    queueBlockStatsMutation(() => syncBlockStats(
      tabId,
      message.stats,
      pageId,
      statsSenderIsActive(sender)
    ))
      .then((result) => sendResponse({ ok: true, ...(result || {}) }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "dcb.stats.add") {
    const tabId = sender?.tab?.id;
    const pageId = statsSenderPageId(sender, message.pageId);
    if (!Number.isInteger(tabId) || !pageId) {
      sendResponse({ ok: false });
      return;
    }
    queueBlockStatsMutation(() => addBlockStats(
      tabId,
      message.counts,
      pageId,
      statsSenderIsActive(sender)
    ))
      .then((result) => sendResponse({ ok: true, ...(result || {}) }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "dcb.stats.live") {
    const tabId = Number.isInteger(message.tabId) ? message.tabId : sender?.tab?.id;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false });
      return;
    }

    requestLiveBlockStats(tabId, { reconcile: message.reconcile !== false })
      .then((live) => {
        if (!live) return null;
        return queueBlockStatsMutation(() => syncBlockStats(tabId, live.page, live.pageId, true))
          .then((result) => ({ live, result }));
      })
      .then((payload) => {
        if (!payload?.live || !payload?.result) {
          sendResponse({ ok: false });
          return;
        }
        sendResponse({
          ok: true,
          pageId: payload.live.pageId,
          page: payload.result.page,
          cumulative: payload.result.cumulative,
          history: payload.result.history
        });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "dcb.stats.get") {
    const tabId = Number.isInteger(message.tabId) ? message.tabId : sender?.tab?.id;
    const pageKey = Number.isInteger(tabId) ? blockStatsSessionKey(tabId) : "";
    const checkpointKey = Number.isInteger(tabId) ? blockStatsCheckpointKey(tabId) : "";
    const localDefaults = {
      [BLOCK_STATS_TOTAL_KEY]: emptyBlockStats(),
      [BLOCK_STATS_HISTORY_KEY]: null,
      [GITHUB_VERSION_CACHE_KEY]: null
    };
    if (checkpointKey) localDefaults[checkpointKey] = null;
    Promise.all([
      pageKey ? chrome.storage.session.get(pageKey).catch(() => ({})) : Promise.resolve({}),
      // 읽기 오류를 정상적인 0 통계처럼 표시하지 않는다. 호출자가 기존 화면을 유지할 수 있게 실패로 응답한다.
      chrome.storage.local.get(localDefaults)
    ]).then(([pageStored, localStored]) => {
      const durablePageValue = checkpointKey ? localStored[checkpointKey] : null;
      const storedPageValue = normalizePageId(durablePageValue?.pageId)
        ? durablePageValue
        : (pageKey ? pageStored[pageKey] : null);
      const storedPage = normalizeBlockStats(storedPageValue);
      const memoryPage = Number.isInteger(tabId) ? pageBlockStats.get(tabId) : null;
      const page = memoryPage && memoryPage.total >= storedPage.total ? normalizeBlockStats(memoryPage) : storedPage;
      if (Number.isInteger(tabId)) {
        pageBlockStats.set(tabId, page);
        const storedToken = normalizePageId(storedPageValue?.pageId);
        if (storedToken && !pageBlockTokens.get(tabId)) pageBlockTokens.set(tabId, storedToken);
      }
      const cachedRelease = normalizeGithubVersionCache(localStored[GITHUB_VERSION_CACHE_KEY]);
      sendResponse({
        ok: true,
        page,
        cumulative: normalizeBlockStats(localStored[BLOCK_STATS_TOTAL_KEY]),
        history: normalizeBlockStatsHistory(localStored[BLOCK_STATS_HISTORY_KEY]),
        publishedVersion: cachedRelease?.version || ""
      });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "dcb.release.status") {
    resolveUpdateReleaseStatus()
      .then((result) => sendResponse({ ok: true, ...(result || {}) }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "dcb.updateNotice.consume") {
    const version = normalizePublishedVersion(message.version);
    if (!version) {
      sendResponse({ ok: false, show: false });
      return;
    }
    updateNoticeMutationQueue = updateNoticeMutationQueue.then(async () => {
      const stored = await chrome.storage.local.get({ [UPDATE_NOTICE_SEEN_VERSION_KEY]: "" });
      const seenVersion = normalizePublishedVersion(stored[UPDATE_NOTICE_SEEN_VERSION_KEY]);
      if (seenVersion === version) return { ok: true, show: false };
      await chrome.storage.local.set({ [UPDATE_NOTICE_SEEN_VERSION_KEY]: version });
      await chrome.storage.local.remove(UPDATE_NOTICE_KEY);
      return { ok: true, show: true };
    }, async () => ({ ok: false, show: false }));
    updateNoticeMutationQueue
      .then((result) => sendResponse(result || { ok: false, show: false }))
      .catch(() => sendResponse({ ok: false, show: false }));
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    // loading 이벤트에서 tab.url은 이전 문서 주소일 수 있다.
    // 명시적인 새 URL이 비지원 페이지일 때만 지우고, DCInside 문서 경계는 pageStart/PAGE_ID가 맡는다.
    if (changeInfo.url && !isStatsSupportedUrl(changeInfo.url)) {
      void queueBlockStatsMutation(() => resetPageBlockStats(tabId)).catch(() => {});
    }
    return;
  }

  if (changeInfo.status === "complete") {
    const currentUrl = tab?.url || changeInfo.url || "";
    if (!isStatsSupportedUrl(currentUrl)) {
      void queueBlockStatsMutation(() => resetPageBlockStats(tabId)).catch(() => {});
      return;
    }
    // 초기 push가 누락돼도 로딩 완료 시 실제 content script 스냅샷으로 한 번 복구한다.
    void reconcileLiveBlockStats(tabId).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const timer = actionBadgeTimers.get(tabId);
  if (timer) clearTimeout(timer);
  actionBadgeTimers.delete(tabId);
  // 진행 중인 mutation 뒤에서 정리해야 완료된 쓰기가 제거된 체크포인트를 되살리지 않는다.
  void queueBlockStatsMutation(async () => {
    pageBlockStats.delete(tabId);
    pageBlockTokens.delete(tabId);
    await Promise.all([
      chrome.storage.session.remove(blockStatsSessionKey(tabId)).catch(() => {}),
      chrome.storage.local.remove(blockStatsCheckpointKey(tabId)).catch(() => {})
    ]);
  }).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  // 탭 전환 시에도 DOM을 다시 훑는 대신 content script가 보관한 스냅샷을 받아 배지를 복구한다.
  void reconcileLiveBlockStats(tabId)
    .then((result) => {
      if (!result) return setCountBadge(tabId);
      return null;
    })
    .catch(() => setCountBadge(tabId));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "dcb.accountSignal") return;

  const uid = normalizeAccountSignalUid(message.uid);
  const token = normalizeAccountSignalToken(message.token);
  if (!uid || !token || !accountSignalSenderAllowed(sender)) {
    sendResponse({
      ok: false,
      status: 0,
      reason: "INVALID_REQUEST",
      retryAfterMs: 60 * 60 * 1000
    });
    return;
  }

  enqueueAccountSignal(uid, token)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({
      ok: false,
      status: 0,
      reason: error?.message || "REQUEST",
      retryAfterMs: 60 * 60 * 1000
    }));

  return true;
});

/* ───── 자동 새로고침: 모든 창·탭의 요청 시작 간격 조정 ───── */
let autoRefreshLastRequestAt = 0;
let autoRefreshPermitQueue = Promise.resolve();

const autoRefreshGuardReady = (async () => {
  try {
    const stored = await chrome.storage.session.get({
      [AUTO_REFRESH_GUARD_KEY]: 0
    });
    const storedAt = Math.max(0, Number(stored[AUTO_REFRESH_GUARD_KEY]) || 0);
    autoRefreshLastRequestAt = storedAt <= Date.now() ? storedAt : 0;
  } catch (_) {
    autoRefreshLastRequestAt = 0;
  }
})();

function autoRefreshSenderAllowed(sender) {
  try {
    const source = new URL(String(sender?.url || sender?.tab?.url || ""));
    return /^https?:$/.test(source.protocol)
      && source.hostname === "gall.dcinside.com"
      && /^\/(?:board|mgallery\/board|mini\/board|person\/board)\/lists(?:\/|$)/.test(source.pathname)
      && !!source.searchParams.get("id");
  } catch (_) {
    return false;
  }
}

async function grantAutoRefreshPermit() {
  await autoRefreshGuardReady;

  const now = Date.now();
  if (autoRefreshLastRequestAt > now) autoRefreshLastRequestAt = 0;
  const retryAfterMs = AUTO_REFRESH_MIN_INTERVAL_MS - (now - autoRefreshLastRequestAt);
  if (retryAfterMs > 0) {
    return {
      ok: true,
      granted: false,
      retryAfterMs
    };
  }

  autoRefreshLastRequestAt = now;
  try {
    await chrome.storage.session.set({ [AUTO_REFRESH_GUARD_KEY]: now });
  } catch (_) {
    // 현재 서비스 워커의 메모리 값으로 요청 간격을 계속 지킨다.
  }
  return {
    ok: true,
    granted: true,
    grantedAt: now
  };
}

function enqueueAutoRefreshPermit() {
  const task = autoRefreshPermitQueue.then(grantAutoRefreshPermit, grantAutoRefreshPermit);
  autoRefreshPermitQueue = task.catch(() => {});
  return task;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "dcb.autoRefreshPermit") return;

  if (!autoRefreshSenderAllowed(sender)) {
    sendResponse({ ok: false, reason: "INVALID_REQUEST" });
    return;
  }

  enqueueAutoRefreshPermit()
    .then(sendResponse)
    .catch((error) => sendResponse({
      ok: false,
      reason: error?.message || "REQUEST"
    }));

  return true;
});

/* ───── 공통 HTML fetch 브릿지: 미리보기에서 모바일 글/댓글 HTML을 가져오기 위함 ───── */
const DCB_FETCH_ALLOWED_HOSTS = new Set([
  "gall.dcinside.com",
  "gallog.dcinside.com",
  "m.dcinside.com",
  "www.dcinside.com",
  "search.dcinside.com"
]);

async function dcbFetchDcinsideHtml(rawUrl, options = {}) {
  let target;
  try {
    target = new URL(String(rawUrl || ""));
  } catch (_) {
    return { ok: false, status: 0, error: "잘못된 URL입니다.", text: "" };
  }

  if (!DCB_FETCH_ALLOWED_HOSTS.has(target.hostname)) {
    return { ok: false, status: 0, error: "허용되지 않은 호스트입니다.", text: "" };
  }

  if (!/^https?:$/.test(target.protocol)) {
    return { ok: false, status: 0, error: "지원하지 않는 프로토콜입니다.", text: "" };
  }

  const method = String(options.method || "GET").toUpperCase();
  if (!/^(GET|POST)$/.test(method)) {
    return { ok: false, status: 0, error: "지원하지 않는 요청 방식입니다.", text: "" };
  }

  const headers = new Headers();
  headers.set("Accept", options.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  headers.set("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7");

  const extraHeaders = options.headers && typeof options.headers === "object" ? options.headers : {};
  Object.entries(extraHeaders).forEach(([name, value]) => {
    const key = String(name || "").toLowerCase();
    if (!["content-type", "x-requested-with", "accept", "accept-language"].includes(key)) return;
    headers.set(name, String(value));
  });

  const requestInit = {
    method,
    credentials: "include",
    cache: options.cache === "reload" ? "reload" : "default",
    redirect: "follow",
    headers
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DCB_FETCH_TIMEOUT_MS);
  requestInit.signal = controller.signal;

  if (method === "POST") requestInit.body = String(options.body || "");
  if (options.referrer) {
    try {
      const ref = new URL(String(options.referrer));
      if (DCB_FETCH_ALLOWED_HOSTS.has(ref.hostname)) requestInit.referrer = ref.href;
    } catch (_) {}
  }

  try {
    const response = await fetch(target.href, requestInit);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      text,
      error: response.ok ? "" : `HTTP ${response.status}`
    };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "DCinside 응답 시간이 초과되었습니다."
      : (error?.message || String(error));
    return {
      ok: false,
      status: 0,
      error: message === "Failed to fetch"
        ? "DCinside HTML fetch가 차단되었습니다. manifest의 connect-src/host_permissions를 확인하세요."
        : message,
      text: ""
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "dcb.fetchText") return;

  if (!accountSignalSenderAllowed(sender)) {
    sendResponse({ ok: false, status: 0, error: "허용되지 않은 요청 출처입니다.", text: "" });
    return;
  }

  dcbFetchDcinsideHtml(msg.url, {
    cache: msg.cache,
    method: msg.method,
    body: msg.body,
    headers: msg.headers,
    accept: msg.accept,
    referrer: msg.referrer
  })
    .then((result) => sendResponse(result))
    .catch((error) => {
      const message = error?.message || String(error);
      sendResponse({ ok: false, status: 0, error: message, text: "" });
    });

  return true;
});

/* ───── 사용자 즉시 차단/해제 ───── */
function matchingBlockedUserTokens(storedTokens, candidates) {
  const normalizedCandidates = DCBUserBlockStore.normalizeList(candidates);
  const exactKeys = new Set(normalizedCandidates.map((value) => DCBUserBlockStore.makeBlockKey(value)).filter(Boolean));
  const nickHaystacks = normalizedCandidates
    .filter((value) => /^nick\s*[:=]/i.test(value))
    .map((value) => value.replace(/^nick\s*[:=]\s*/i, "").toLowerCase());
  const seen = new Set();

  return (Array.isArray(storedTokens) ? storedTokens : []).filter((stored) => {
    const normalized = DCBUserBlockStore.normalizeToken(stored);
    const key = DCBUserBlockStore.makeBlockKey(normalized);
    if (!normalized || !key || seen.has(key)) return false;

    const nickNeedle = /^nick\s*[:=]/i.test(normalized)
      ? normalized.replace(/^nick\s*[:=]\s*/i, "").toLowerCase()
      : "";
    const matched = exactKeys.has(key)
      || (nickNeedle && nickHaystacks.some((haystack) => haystack.includes(nickNeedle)));
    if (matched) seen.add(key);
    return matched;
  });
}

async function toggleBlockedUserToken(token, candidates = []) {
  if (!globalThis.DCBUserBlockStore) {
    return {
      ok: false,
      reason: "STORAGE_ERROR",
      message: "사용자 차단 저장 모듈을 불러오지 못했습니다."
    };
  }

  const { userBlockEnabled = true } = await chrome.storage.sync.get({
    userBlockEnabled: true
  });

  const normalizedToken = DCBUserBlockStore.normalizeToken(token);
  const normalizedCandidates = DCBUserBlockStore.normalizeList([
    normalizedToken,
    ...(Array.isArray(candidates) ? candidates : [])
  ]);
  const storedTokens = await DCBUserBlockStore.getAllTokens();
  const matchedTokens = matchingBlockedUserTokens(storedTokens, normalizedCandidates);
  let res;

  if (matchedTokens.length) {
    res = await DCBUserBlockStore.removeTokens(matchedTokens);
  } else {
    const added = await DCBUserBlockStore.addToken(normalizedToken);
    res = {
      ...added,
      removed: false,
      blocked: !!added?.ok,
      action: added?.ok ? "blocked" : "unchanged"
    };
  }

  if (!res?.ok) {
    return res;
  }

  return {
    ...res,
    userBlockEnabled
  };
}

async function removeBlockedUserToken(token) {
  if (!globalThis.DCBUserBlockStore) {
    return {
      ok: false,
      reason: "STORAGE_ERROR",
      message: "사용자 차단 저장 모듈을 불러오지 못했습니다."
    };
  }

  return DCBUserBlockStore.removeToken(token);
}

async function removeBlockedUserTokens(tokens) {
  if (!globalThis.DCBUserBlockStore) {
    return {
      ok: false,
      reason: "STORAGE_ERROR",
      message: "사용자 차단 저장 모듈을 불러오지 못했습니다."
    };
  }

  if (!Array.isArray(tokens) || !tokens.length || !tokens.every((value) => typeof value === "string")) {
    return {
      ok: false,
      reason: "INVALID_PAYLOAD",
      message: "차단 해제 목록 형식이 올바르지 않습니다."
    };
  }

  return DCBUserBlockStore.removeTokens(tokens);
}

async function mutateUserBlockList(message) {
  if (!globalThis.DCBUserBlockStore) {
    return {
      ok: false,
      reason: "STORAGE_ERROR",
      message: "사용자 차단 저장 모듈을 불러오지 못했습니다."
    };
  }

  if (message.type === "dcb.userBlockAdd") {
    return DCBUserBlockStore.addToken(message.token);
  }

  if (message.type === "dcb.userBlockSetAll") {
    if (!Array.isArray(message.tokens) || !message.tokens.every((value) => typeof value === "string")) {
      return {
        ok: false,
        reason: "INVALID_PAYLOAD",
        message: "사용자 차단 목록 형식이 올바르지 않습니다."
      };
    }
    const tokens = await DCBUserBlockStore.setAllTokens(message.tokens);
    return { ok: true, tokens, count: tokens.length };
  }

  if (message.type === "dcb.userBlockClear") {
    const tokens = await DCBUserBlockStore.clearAllTokens();
    return { ok: true, tokens, count: 0 };
  }

  return { ok: false, reason: "UNKNOWN_ACTION", message: "지원하지 않는 사용자 차단 작업입니다." };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "dcb.instantCtxBlock") return;

  queueUserBlockMutation(() => toggleBlockedUserToken(msg.token, msg.candidates))
    .then((res) => {
      const tabId = sender.tab?.id;

      if (!res.ok) {
        showActionBadge(tabId, "?");
        sendResponse(res);
        return;
      }

      showActionBadge(tabId, res.removed ? "−" : (res.userBlockEnabled ? "✔" : "OFF"));

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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!["dcb.userBlockRemove", "dcb.userBlockRemoveMany"].includes(msg?.type)) return;

  const removeTask = msg.type === "dcb.userBlockRemoveMany"
    ? () => removeBlockedUserTokens(msg.tokens)
    : () => removeBlockedUserToken(msg.token);

  queueUserBlockMutation(removeTask)
    .then((res) => {
      const tabId = sender.tab?.id;

      if (!res?.ok) {
        showActionBadge(tabId, "!");
        sendResponse(res);
        return;
      }

      showActionBadge(tabId, "−");

      if (tabId && res.removed) {
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!["dcb.userBlockAdd", "dcb.userBlockSetAll", "dcb.userBlockClear"].includes(msg?.type)) return;

  queueUserBlockMutation(() => mutateUserBlockList(msg))
    .then((result) => sendResponse(result))
    .catch((error) => {
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

  if (
    info.menuItemId === DCCON_BLOCK_ITEM_MENU_ID
    || info.menuItemId === DCCON_BLOCK_GROUP_MENU_ID
  ) {
    const message = {
      type: "dcb.dcconBlockContext",
      mode: info.menuItemId === DCCON_BLOCK_GROUP_MENU_ID ? "group" : "item"
    };
    const done = (res) => {
      if (chrome.runtime.lastError) {
        showActionBadge(tab.id, "?");
        return;
      }
      showActionBadge(tab.id, res?.ok ? "✔" : "!");
    };

    if (typeof info.frameId === "number") {
      chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId }, done);
    } else {
      chrome.tabs.sendMessage(tab.id, message, done);
    }

    return;
  }

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

  if (info.menuItemId === USER_MEMO_CONTEXT_MENU_ID) {
    const message = { type: "dcb.userMemoOpenContext" };
    const done = (res) => {
      if (chrome.runtime.lastError) {
        showActionBadge(tab.id, "?");
        return;
      }
      showActionBadge(tab.id, res?.ok ? "📝" : "OFF");
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

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});


function encodeImageBlockPayload(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const imageByteInflight = new Map();
const imageByteQueue = [];
let imageByteActive = 0;

function normalizeImageBlockUrl(rawUrl) {
  try {
    const target = new URL(String(rawUrl || ""));
    const host = target.hostname.toLowerCase();
    const allowedHost = host === "dcinside.com"
      || host.endsWith(".dcinside.com")
      || host === "dcinside.co.kr"
      || host.endsWith(".dcinside.co.kr");
    return target.protocol === "https:" && allowedHost ? target.href : "";
  } catch (_) {
    return "";
  }
}

async function fetchImageBlockPayload(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_BYTES_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      credentials: "include",
      cache: "force-cache",
      signal: controller.signal
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > IMAGE_BYTES_MAX_SIZE) {
      return { success: false, error: "파일이 이미지 차단 확인 한도(25MB)를 초과했습니다." };
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const allowedType = !contentType
      || contentType.startsWith("image/")
      || contentType.startsWith("video/")
      || contentType.startsWith("application/octet-stream");
    if (!allowedType) {
      return { success: false, error: "지원하지 않는 미디어 형식입니다." };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > IMAGE_BYTES_MAX_SIZE) {
      return { success: false, error: "파일이 이미지 차단 확인 한도(25MB)를 초과했습니다." };
    }

    return {
      success: true,
      data: encodeImageBlockPayload(buffer),
      contentType: contentType || "application/octet-stream"
    };
  } catch (error) {
    return {
      success: false,
      error: error?.name === "AbortError"
        ? "이미지 확인 시간이 초과되었습니다."
        : (error?.message || String(error))
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function drainImageByteQueue() {
  while (imageByteActive < IMAGE_BYTES_MAX_CONCURRENCY && imageByteQueue.length) {
    const item = imageByteQueue.shift();
    imageByteActive += 1;
    fetchImageBlockPayload(item.url)
      .then(item.resolve)
      .catch((error) => item.resolve({ success: false, error: error?.message || String(error) }))
      .finally(() => {
        imageByteActive -= 1;
        drainImageByteQueue();
      });
  }
}

function enqueueImageBlockPayload(url) {
  const existing = imageByteInflight.get(url);
  if (existing) return existing;

  const task = new Promise((resolve) => {
    imageByteQueue.push({ url, resolve });
    drainImageByteQueue();
  });
  imageByteInflight.set(url, task);
  void task.finally(() => imageByteInflight.delete(url));
  return task;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "dcb.imageBytes") return;

  const url = normalizeImageBlockUrl(message.url);
  if (!url || !accountSignalSenderAllowed(sender)) {
    sendResponse({ success: false, error: "허용되지 않은 이미지 요청입니다." });
    return;
  }

  enqueueImageBlockPayload(url).then(sendResponse);

  return true;
});
