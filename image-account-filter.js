(() => {
  "use strict";

  if (globalThis.DCBImageAccountFilter) return;

  const SETTINGS_KEY = "dcbImageAccountRules";
  const CACHE_KEY = "dcbImageAccountSignalCache";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const NEGATIVE_CACHE_MS = 10 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 300;
  const PUBLIC_ITEMS_PER_PAGE = 20;

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    ageRuleEnabled: true,
    maxPublicAgeDays: 30,
    postRuleEnabled: true,
    minPostCount: 5,
    commentRuleEnabled: true,
    minCommentCount: 10,
    activityMatchMode: "both",
    holdWhileChecking: true,
    cacheHours: 24
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
      enabled: source.enabled !== false,
      ageRuleEnabled: source.ageRuleEnabled !== false,
      maxPublicAgeDays: boundedInteger(source.maxPublicAgeDays, DEFAULT_SETTINGS.maxPublicAgeDays, 0, 3650),
      postRuleEnabled: source.postRuleEnabled !== false,
      minPostCount: boundedInteger(source.minPostCount, DEFAULT_SETTINGS.minPostCount, 0, 1_000_000),
      commentRuleEnabled: source.commentRuleEnabled !== false,
      minCommentCount: boundedInteger(source.minCommentCount, DEFAULT_SETTINGS.minCommentCount, 0, 1_000_000),
      activityMatchMode: source.activityMatchMode === "any" ? "any" : "both",
      holdWhileChecking: source.holdWhileChecking !== false,
      cacheHours: boundedInteger(source.cacheHours, DEFAULT_SETTINGS.cacheHours, 1, 168)
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

  function requestText(payload, timeoutMs = 8000) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, status: 0, text: "", error: "timeout" });
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ ok: false, status: 0, text: "", error: chrome.runtime.lastError.message || "runtime" });
            return;
          }
          resolve(response && typeof response === "object"
            ? response
            : { ok: false, status: 0, text: "", error: "empty" });
        });
      } catch (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, status: 0, text: "", error: error?.message || String(error) });
      }
    });
  }

  function parseActivityCounts(text) {
    const match = cleanText(text).match(/^(\d+)\s*,\s*(\d+)/);
    if (!match) return null;
    const posts = Number(match[1]);
    const comments = Number(match[2]);
    if (!Number.isSafeInteger(posts) || !Number.isSafeInteger(comments)) return null;
    return { posts, comments };
  }

  function utcDateValue(year, month, day) {
    const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function extractPublicActivityDates(html) {
    const dates = [];
    const spanPattern = /<span\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
    let spanMatch;
    while ((spanMatch = spanPattern.exec(String(html || "")))) {
      const dateMatch = spanMatch[1].match(/(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
      if (!dateMatch) continue;
      const stamp = utcDateValue(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (stamp) dates.push(stamp);
    }
    return dates;
  }

  function earliestValue(values) {
    const valid = values.filter((value) => Number.isFinite(value) && value > 0);
    return valid.length ? Math.min(...valid) : 0;
  }

  function activityDecision(posts, comments, settings) {
    const lowPost = settings.postRuleEnabled && settings.minPostCount > 0 && posts < settings.minPostCount;
    const lowComment = settings.commentRuleEnabled && settings.minCommentCount > 0 && comments < settings.minCommentCount;
    const checks = [];
    if (settings.postRuleEnabled && settings.minPostCount > 0) checks.push(lowPost);
    if (settings.commentRuleEnabled && settings.minCommentCount > 0) checks.push(lowComment);
    const hit = checks.length > 0 && (
      settings.activityMatchMode === "any" ? checks.some(Boolean) : checks.every(Boolean)
    );
    return { hit, lowPost, lowComment };
  }

  class RequestGate {
    constructor(limit = 3) {
      this.limit = limit;
      this.active = 0;
      this.waiting = [];
    }

    run(task) {
      return new Promise((resolve) => {
        this.waiting.push({ task, resolve });
        this.drain();
      });
    }

    drain() {
      while (this.active < this.limit && this.waiting.length) {
        const item = this.waiting.shift();
        this.active += 1;
        Promise.resolve()
          .then(item.task)
          .catch(() => null)
          .then(item.resolve)
          .finally(() => {
            this.active -= 1;
            this.drain();
          });
      }
    }
  }

  class AccountSignalService {
    constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      this.cache = {};
      this.inflight = new Map();
      this.gate = new RequestGate(3);
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
      if (!entry.unavailable
        && this.settings.ageRuleEnabled
        && this.settings.maxPublicAgeDays > 0
        && entry.ageChecked !== true
        && !activityDecision(Number(entry.posts) || 0, Number(entry.comments) || 0, this.settings).hit) return false;
      const ttl = entry.unavailable
        ? NEGATIVE_CACHE_MS
        : this.settings.cacheHours * 60 * 60 * 1000;
      return Date.now() - Number(entry.checkedAt) < ttl;
    }

    async fetchCounts(uid) {
      const token = readCookie(["ci_c", "ci_t"]);
      if (!token) return null;
      const endpoint = new URL("/api/gallog_user_layer/gallog_content_reple/", location.origin).href;
      const result = await requestText({
        type: "dcb.fetchText",
        url: endpoint,
        method: "POST",
        body: `ci_t=${encodeURIComponent(token)}&user_id=${encodeURIComponent(uid)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest"
        },
        accept: "text/plain,*/*;q=0.8"
      });
      return result?.ok ? parseActivityCounts(result.text) : null;
    }

    async fetchLastPublicDate(uid, section, count) {
      if (!count) return 0;
      const lastPage = Math.max(1, Math.ceil(count / PUBLIC_ITEMS_PER_PAGE));
      const url = `https://gallog.dcinside.com/${encodeURIComponent(uid)}/${section}?p=${lastPage}`;
      const result = await requestText({
        type: "dcb.fetchText",
        url,
        method: "GET",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.7"
      });
      if (!result?.ok) return 0;
      return earliestValue(extractPublicActivityDates(result.text));
    }

    async fetchSignal(uid) {
      const counts = await this.fetchCounts(uid);
      if (!counts) {
        return { checkedAt: Date.now(), unavailable: true };
      }

      let firstPublicActivityAt = 0;
      const activity = activityDecision(counts.posts, counts.comments, this.settings);
      const ageChecked = this.settings.ageRuleEnabled
        && this.settings.maxPublicAgeDays > 0
        && !activity.hit;
      if (ageChecked) {
        const [postDate, commentDate] = await Promise.all([
          this.fetchLastPublicDate(uid, "posting", counts.posts),
          this.fetchLastPublicDate(uid, "comment", counts.comments)
        ]);
        firstPublicActivityAt = earliestValue([postDate, commentDate]);
      }

      return {
        checkedAt: Date.now(),
        posts: counts.posts,
        comments: counts.comments,
        firstPublicActivityAt,
        ageChecked,
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
          summary: "작성자 활동 정보를 확인하지 못했습니다."
        };
      }

      const posts = Math.max(0, Number(entry.posts) || 0);
      const comments = Math.max(0, Number(entry.comments) || 0);
      const activity = activityDecision(posts, comments, this.settings);
      const { hit: activityHit, lowPost, lowComment } = activity;

      const firstPublicActivityAt = Number(entry.firstPublicActivityAt) || 0;
      const publicAgeDays = firstPublicActivityAt
        ? Math.max(0, Math.floor((Date.now() - firstPublicActivityAt) / DAY_MS))
        : null;
      const ageHit = this.settings.ageRuleEnabled
        && this.settings.maxPublicAgeDays > 0
        && publicAgeDays !== null
        && publicAgeDays <= this.settings.maxPublicAgeDays;

      const reasons = [];
      if (ageHit) reasons.push(`최초 공개 활동 ${publicAgeDays}일`);
      if (activityHit && lowPost) reasons.push(`작성 글 ${posts}개`);
      if (activityHit && lowComment) reasons.push(`작성 댓글 ${comments}개`);

      return {
        uid,
        available: true,
        shouldHide: ageHit || activityHit,
        reasons,
        summary: reasons.length ? reasons.join(" · ") : `작성 글 ${posts}개 · 댓글 ${comments}개`,
        stats: {
          posts,
          comments,
          firstPublicActivityAt: firstPublicActivityAt || null,
          publicAgeDays
        },
        checkedAt: Number(entry.checkedAt) || Date.now()
      };
    }

    async evaluate(rawUid) {
      await this.readyPromise;
      const uid = normalizeUid(rawUid);
      if (!uid || !this.settings.enabled) {
        return { uid, available: false, shouldHide: false, reasons: [], summary: "자동 판정 비활성화" };
      }

      const cached = this.cache[uid.toLowerCase()];
      if (this.cacheFresh(cached)) return this.judge(uid, cached);
      if (this.inflight.has(uid.toLowerCase())) return this.inflight.get(uid.toLowerCase());

      const request = this.gate.run(async () => {
        const entry = await this.fetchSignal(uid);
        this.cache[uid.toLowerCase()] = entry;
        this.scheduleCacheWrite();
        return this.judge(uid, entry);
      }).finally(() => this.inflight.delete(uid.toLowerCase()));

      this.inflight.set(uid.toLowerCase(), request);
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
        window.dispatchEvent(new CustomEvent("dcb:image-account-rules-changed", {
          detail: { settings: { ...service.settings } }
        }));
      } catch (_) {}
    }
  });

  globalThis.DCBImageAccountFilter = Object.freeze({
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
})();