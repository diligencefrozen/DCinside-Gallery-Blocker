(() => {
  "use strict";

  if (globalThis.DCBAccountActivityFilter) return;

  // 기존 설치의 설정·캐시 키는 호환성을 위해 유지한다.
  const SETTINGS_KEY = "dcbImageAccountRules";
  const CACHE_KEY = "dcbImageAccountSignalCache";
  const NEGATIVE_CACHE_MS = 60 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 1_000;
  // 전역 큐에서 요청 간격을 두므로 한 페이지의 마지막 판정까지 기다릴 수 있게 한다.
  const CONTENT_TIMEOUT_MS = 120_000;

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: false,
    blockPosts: true,
    blockComments: true,
    // 갤로그 게시글·댓글 페이지 추가 조회를 없애기 위해 연령 판정은 중단한다.
    ageRuleEnabled: false,
    maxPublicAgeDays: 30,
    postRuleEnabled: true,
    minPostCount: 5,
    commentRuleEnabled: true,
    minCommentCount: 10,
    activityMatchMode: "both",
    // 조회가 밀려도 화면이 빈 것처럼 보이지 않게 선숨김을 사용하지 않는다.
    holdWhileChecking: false,
    cacheHours: 72
  });

  const cleanText = (value) => String(value ?? "").trim();

  function boundedInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeSettings(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    return {
      enabled: source.enabled === true,
      blockPosts: source.blockPosts !== false,
      blockComments: source.blockComments !== false,
      ageRuleEnabled: false,
      maxPublicAgeDays: boundedInteger(source.maxPublicAgeDays, DEFAULT_SETTINGS.maxPublicAgeDays, 0, 3650),
      postRuleEnabled: source.postRuleEnabled !== false,
      minPostCount: boundedInteger(source.minPostCount, DEFAULT_SETTINGS.minPostCount, 0, 1_000_000),
      commentRuleEnabled: source.commentRuleEnabled !== false,
      minCommentCount: boundedInteger(source.minCommentCount, DEFAULT_SETTINGS.minCommentCount, 0, 1_000_000),
      activityMatchMode: source.activityMatchMode === "any" ? "any" : "both",
      holdWhileChecking: false,
      cacheHours: boundedInteger(source.cacheHours, DEFAULT_SETTINGS.cacheHours, 24, 168)
    };
  }

  function normalizeUid(value) {
    const uid = cleanText(value);
    return /^[A-Za-z0-9._-]{2,64}$/.test(uid) ? uid : "";
  }

  function readCookie(names) {
    const cookies = `; ${document.cookie || ""}`;
    for (const name of names) {
      const parts = cookies.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(";").shift() || "";
    }
    return "";
  }

  function requestAccountSignal(payload) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({
          ok: false,
          status: 0,
          reason: "CONTENT_TIMEOUT",
          retryAfterMs: NEGATIVE_CACHE_MS
        });
      }, CONTENT_TIMEOUT_MS);

      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              status: 0,
              reason: "RUNTIME",
              retryAfterMs: NEGATIVE_CACHE_MS
            });
            return;
          }
          resolve(response && typeof response === "object"
            ? response
            : {
                ok: false,
                status: 0,
                reason: "EMPTY",
                retryAfterMs: NEGATIVE_CACHE_MS
              });
        });
      } catch (_) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          status: 0,
          reason: "RUNTIME",
          retryAfterMs: NEGATIVE_CACHE_MS
        });
      }
    });
  }

  function activityDecision(posts, comments, settings) {
    const lowPost = settings.postRuleEnabled
      && settings.minPostCount > 0
      && posts < settings.minPostCount;
    const lowComment = settings.commentRuleEnabled
      && settings.minCommentCount > 0
      && comments < settings.minCommentCount;
    const checks = [];
    if (settings.postRuleEnabled && settings.minPostCount > 0) checks.push(lowPost);
    if (settings.commentRuleEnabled && settings.minCommentCount > 0) checks.push(lowComment);
    const hit = checks.length > 0 && (
      settings.activityMatchMode === "any" ? checks.some(Boolean) : checks.every(Boolean)
    );
    return { hit, lowPost, lowComment };
  }

  function unavailableSummary(reason) {
    if (reason === "COOLDOWN" || reason === "BUDGET") {
      return "안전 요청 한도에 따라 이번 조회를 건너뛰었습니다.";
    }
    if (reason === "NO_TOKEN") return "로그인 세션 정보를 확인하지 못했습니다.";
    return "작성자 활동 정보를 안전하게 확인하지 못했습니다.";
  }

  class AccountSignalService {
    constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      this.cache = {};
      this.inflight = new Map();
      this.cacheWriteTimer = null;
      this.readyPromise = this.initialize();
    }

    async initialize() {
      try {
        const [syncData, localData] = await Promise.all([
          chrome.storage.sync.get({ [SETTINGS_KEY]: DEFAULT_SETTINGS }),
          chrome.storage.local.get({ [CACHE_KEY]: {} })
        ]);
        this.settings = normalizeSettings(syncData[SETTINGS_KEY]);
        this.cache = localData[CACHE_KEY] && typeof localData[CACHE_KEY] === "object"
          ? localData[CACHE_KEY]
          : {};
        this.trimCache();
      } catch (_) {
        this.settings = { ...DEFAULT_SETTINGS };
        this.cache = {};
      }
      return this;
    }

    trimCache() {
      const entries = Object.entries(this.cache)
        .filter(([, item]) => item && typeof item === "object" && Number(item.checkedAt) > 0)
        .sort((a, b) => Number(b[1].checkedAt) - Number(a[1].checkedAt))
        .slice(0, MAX_CACHE_ENTRIES);
      this.cache = Object.fromEntries(entries);
    }

    scheduleCacheWrite() {
      if (this.cacheWriteTimer) clearTimeout(this.cacheWriteTimer);
      this.cacheWriteTimer = setTimeout(() => {
        this.cacheWriteTimer = null;
        this.trimCache();
        void chrome.storage.local.set({ [CACHE_KEY]: this.cache });
      }, 250);
    }

    cacheFresh(entry) {
      if (!entry || !Number(entry.checkedAt)) return false;
      if (entry.unavailable) {
        const expiresAt = Number(entry.expiresAt) || (Number(entry.checkedAt) + NEGATIVE_CACHE_MS);
        return Date.now() < expiresAt;
      }
      const ttl = this.settings.cacheHours * 60 * 60 * 1000;
      return Date.now() - Number(entry.checkedAt) < ttl;
    }

    async fetchSignal(uid) {
      const token = readCookie(["ci_c", "ci_t"]);
      if (!token) {
        return {
          checkedAt: Date.now(),
          expiresAt: Date.now() + NEGATIVE_CACHE_MS,
          unavailable: true,
          reason: "NO_TOKEN"
        };
      }

      const result = await requestAccountSignal({
        type: "dcb.accountSignal",
        uid,
        token
      });

      if (!result?.ok) {
        const retryAfterMs = boundedInteger(
          result?.retryAfterMs,
          NEGATIVE_CACHE_MS,
          NEGATIVE_CACHE_MS,
          24 * 60 * 60 * 1000
        );
        return {
          checkedAt: Date.now(),
          expiresAt: Date.now() + retryAfterMs,
          unavailable: true,
          reason: cleanText(result?.reason) || "UNAVAILABLE"
        };
      }

      return {
        checkedAt: Number(result.checkedAt) || Date.now(),
        posts: Math.max(0, Number(result.posts) || 0),
        comments: Math.max(0, Number(result.comments) || 0),
        unavailable: false
      };
    }

    judge(uid, entry) {
      if (!entry || entry.unavailable) {
        return {
          uid,
          available: false,
          shouldHide: false,
          reasons: [],
          summary: unavailableSummary(entry?.reason)
        };
      }

      const posts = Math.max(0, Number(entry.posts) || 0);
      const comments = Math.max(0, Number(entry.comments) || 0);
      const { hit, lowPost, lowComment } = activityDecision(posts, comments, this.settings);
      const reasons = [];
      if (hit && lowPost) reasons.push(`작성 글 ${posts}개`);
      if (hit && lowComment) reasons.push(`작성 댓글 ${comments}개`);

      return {
        uid,
        available: true,
        shouldHide: hit,
        reasons,
        summary: reasons.length ? reasons.join(" · ") : `작성 글 ${posts}개 · 댓글 ${comments}개`,
        stats: { posts, comments },
        checkedAt: Number(entry.checkedAt) || Date.now()
      };
    }

    async evaluate(rawUid) {
      await this.readyPromise;
      const uid = normalizeUid(rawUid);
      if (!uid || !this.settings.enabled) {
        return {
          uid,
          available: false,
          shouldHide: false,
          reasons: [],
          summary: "활동이 적은 회원 차단 비활성화"
        };
      }

      const key = uid.toLowerCase();
      const cached = this.cache[key];
      if (this.cacheFresh(cached)) return this.judge(uid, cached);
      if (this.inflight.has(key)) return this.inflight.get(key);

      const request = this.fetchSignal(uid)
        .then((entry) => {
          this.cache[key] = entry;
          this.scheduleCacheWrite();
          return this.judge(uid, entry);
        })
        .catch(() => ({
          uid,
          available: false,
          shouldHide: false,
          reasons: [],
          summary: "작성자 활동 정보를 안전하게 확인하지 못했습니다."
        }))
        .finally(() => this.inflight.delete(key));

      this.inflight.set(key, request);
      return request;
    }

    peek(rawUid) {
      const uid = normalizeUid(rawUid);
      if (!uid || !this.settings.enabled) return null;
      const cached = this.cache[uid.toLowerCase()];
      return this.cacheFresh(cached) ? this.judge(uid, cached) : null;
    }

    async clearCache() {
      await this.readyPromise;
      this.cache = {};
      await chrome.storage.local.set({ [CACHE_KEY]: {} });
    }
  }

  const service = new AccountSignalService();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[CACHE_KEY]) {
      service.cache = changes[CACHE_KEY].newValue && typeof changes[CACHE_KEY].newValue === "object"
        ? changes[CACHE_KEY].newValue
        : {};
      return;
    }
    if (area === "sync" && changes[SETTINGS_KEY]) {
      service.settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
      try {
        window.dispatchEvent(new CustomEvent("dcb:account-activity-rules-changed", {
          detail: { settings: { ...service.settings } }
        }));
      } catch (_) {}
    }
  });

  const api = Object.freeze({
    SETTINGS_KEY,
    CACHE_KEY,
    DEFAULT_SETTINGS,
    normalizeSettings,
    ready: () => service.readyPromise,
    getSettings: () => ({ ...service.settings }),
    peek: (uid) => service.peek(uid),
    evaluate: (uid) => service.evaluate(uid),
    clearCache: () => service.clearCache()
  });
  globalThis.DCBAccountActivityFilter = api;
  // 외부 사용자 스크립트와 이전 버전 호환용 별칭.
  globalThis.DCBImageAccountFilter = api;
})();
