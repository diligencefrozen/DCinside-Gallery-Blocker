/*****************************************************************
 * critical-filter-bootstrap.js
 *
 * First-paint protection for list rows that may be hidden by the
 * operator-notice or user-block filters.  Only candidate rows are
 * shielded; the page/body is never hidden.  Storage failures are
 * fail-open so this bootstrap can never leave the list invisible.
 *****************************************************************/
(() => {
  if (globalThis.DCBCriticalFilter) return;

  const ROOT_CLASS = "dcb-filter-pending";
  const STYLE_ID = "dcb-critical-filter-style";
  const USER_BLOCKED_CLASS = "dcb-userblock-hidden";
  const NOTICE_BLOCKED_CLASS = "dcb-notice-blocked";
  const FOREIGN_IP_BLOCKED_CLASS = "dcb-foreign-ip-hidden";
  const MEMBER_IP_BADGE_CLASS = "dc-member-ip-chip";
  const FAST_BADGE_ATTR = "data-dcb-fast-badge";
  const WATCHDOG_MS = 80;
  const HOT_CACHE_KEY = "dcbCriticalFilterHotCacheV1";
  const HOT_CACHE_VERSION = 2;
  const OWNED_SELECTOR = "[data-dcb-owned]";
  const ROW_SELECTOR = [
    ".gall_list tbody tr",
    ".gall_list tr.ub-content",
    ".gall_list tr[data-no]",
    ".gall_list tr.gall_tr",
    ".gall_list li.ub-content",
    ".gall_list li.gall_item"
  ].join(",");
  const WRITER_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    "td.gall_writer",
    ".refresherUserData",
    ".dcb-uid-badge",
    ".nickname",
    ".nick_name",
    ".user_nick",
    "[data-nick]",
    "[data-uid]",
    "[data-ip]",
    "[data-memo-uid]",
    "[data-memo-ip]"
  ].join(",");

  const state = {
    phase: "pending",
    sync: { userBlockEnabled: true, noticeBlockEnabled: true, hideForeignIpEnabled: false, showMemberIpInfo: false },
    tokens: [],
    matcher: null,
    completedAt: 0,
    reason: "",
    memberIpSettingKnown: false,
    memberIpViewReady: false
  };
  let observer = null;
  let reloadGeneration = 0;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  function mark(name) {
    try { performance.mark(`dcb-critical-filter:${name}`); } catch (_) {}
  }

  function installShield() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.add(ROOT_CLASS);
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.dataset.dcbOwned = "critical-filter";
      style.textContent = `
        html.${ROOT_CLASS} .gall_list tbody tr,
        html.${ROOT_CLASS} .gall_list tr.ub-content,
        html.${ROOT_CLASS} .gall_list tr[data-no],
        html.${ROOT_CLASS} .gall_list tr.gall_tr,
        html.${ROOT_CLASS} .gall_list li.ub-content,
        html.${ROOT_CLASS} .gall_list li.gall_item {
          visibility: hidden !important;
        }
        .${USER_BLOCKED_CLASS}, .${NOTICE_BLOCKED_CLASS}, .${FOREIGN_IP_BLOCKED_CLASS} {
          display: none !important;
        }
        .${MEMBER_IP_BADGE_CLASS}{
          --member-ip-bg:rgba(76,99,255,.09);--member-ip-fg:#3446a8;--member-ip-ring:rgba(76,99,255,.22);
          display:inline-flex!important;align-items:center!important;gap:3px!important;max-width:42px!important;height:13px!important;
          margin:0 0 0 1px!important;padding:0 2px!important;border:1px solid var(--member-ip-ring)!important;border-radius:8px!important;
          background:linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,255,255,.52)),var(--member-ip-bg)!important;
          box-shadow:0 1px 2px rgba(15,23,42,.06),inset 0 1px 0 rgba(255,255,255,.55)!important;color:var(--member-ip-fg)!important;
          font:800 8px/1.1 Arial,Helvetica,sans-serif!important;letter-spacing:-.35px!important;white-space:nowrap!important;
          vertical-align:baseline!important;overflow:hidden!important;text-overflow:ellipsis!important;box-sizing:border-box!important;
        }
        .${MEMBER_IP_BADGE_CLASS}::before{content:""!important;flex:0 0 4px!important;width:4px!important;height:4px!important;border-radius:50%!important;background:currentColor!important;opacity:.78!important;}
        .${MEMBER_IP_BADGE_CLASS}[data-tone="wired"]{--member-ip-bg:rgba(38,166,91,.10);--member-ip-fg:#257247;--member-ip-ring:rgba(38,166,91,.24);}
        .${MEMBER_IP_BADGE_CLASS}[data-tone="mobile"]{--member-ip-bg:rgba(59,130,246,.11);--member-ip-fg:#285ba9;--member-ip-ring:rgba(59,130,246,.24);}
        .${MEMBER_IP_BADGE_CLASS}[data-tone="risk"]{--member-ip-bg:rgba(239,68,68,.10);--member-ip-fg:#a83b3b;--member-ip-ring:rgba(239,68,68,.24);}
        .${MEMBER_IP_BADGE_CLASS}[data-tone="foreign"]{--member-ip-bg:rgba(148,163,184,.16);--member-ip-fg:#566173;--member-ip-ring:rgba(148,163,184,.26);}
      `;
      root.appendChild(style);
    }
  }

  function normalizeText(value) {
    return String(value || "").normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  }

  function normalizeNick(value) {
    return normalizeText(value)
      .replace(/\((?:\d{1,3}\.){1,3}\d{0,3}\)\s*$/g, "").trim().slice(0, 80);
  }

  function normalizeIp(value) {
    const match = String(value || "").match(/\b(\d{1,3}\.\d{1,3})(?:\.\d{1,3}){0,2}\b/);
    return match ? match[1] : "";
  }

  function normalizeUid(value) {
    const clean = String(value || "").replace(/^uid\s*[:=]\s*/i, "")
      .replace(/^@+/, "").replace(/[\s\)\]>'\";]+$/g, "").trim();
    return /^[A-Za-z0-9._-]{2,64}$/.test(clean) ? clean.toLowerCase() : "";
  }

  function buildMatcher(tokens) {
    const matcher = { uids: new Set(), ips: new Set(), nicks: [] };
    for (const raw of Array.isArray(tokens) ? tokens : []) {
      const value = String(raw || "").trim();
      const nickMatch = value.match(/^nick\s*[:=]\s*(.+)$/i);
      if (nickMatch) {
        const nick = normalizeNick(nickMatch[1]).toLowerCase();
        if (nick) matcher.nicks.push(nick);
        continue;
      }
      const ip = normalizeIp(value);
      if (ip && /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(value.replace(/^ip\s*[:=]\s*/i, ""))) {
        matcher.ips.add(ip);
        continue;
      }
      const uid = normalizeUid(value);
      if (uid) matcher.uids.add(uid);
    }
    return matcher;
  }

  function attr(scope, name) {
    return scope?.getAttribute?.(name) || scope?.querySelector?.(`[${name}]`)?.getAttribute?.(name) || "";
  }

  function writerTokens(writer) {
    const textAttrs = ["data-full-uid", "data-uid", "data-user-id", "data-userid", "data-user_id", "data-memo-uid"];
    let uid = "";
    for (const name of textAttrs) {
      uid = normalizeUid(attr(writer, name));
      if (uid) break;
    }
    if (!uid) {
      const gallog = writer.querySelector?.('[href*="gallog.dcinside.com"], [onclick*="gallog.dcinside.com"]');
      const ref = [gallog?.getAttribute?.("href"), gallog?.getAttribute?.("onclick")].filter(Boolean).join(" ");
      uid = normalizeUid(ref.match(/gallog\.dcinside\.com\/?([A-Za-z0-9._-]{2,64})/i)?.[1]);
    }
    const ip = normalizeIp([attr(writer, "data-ip"), attr(writer, "data-memo-ip"), writer.textContent].join(" "));
    const nickNode = writer.matches?.(".nickname,.nick_name,.user_nick")
      ? writer : writer.querySelector?.(".nickname,.nick_name,.user_nick");
    const nick = normalizeNick(attr(writer, "data-nick") || nickNode?.title || nickNode?.textContent).toLowerCase();
    return { uid, ip, nick };
  }

  function userMatches(writer, tokens = null) {
    const matcher = state.matcher;
    if (!matcher || state.sync.userBlockEnabled === false) return false;
    const { uid, ip, nick } = tokens || writerTokens(writer);
    return (uid && matcher.uids.has(uid)) || (ip && matcher.ips.has(ip)) ||
      (nick && matcher.nicks.some((needle) => nick.includes(needle)));
  }

  function isNoticeRow(row) {
    if (state.sync.noticeBlockEnabled === false) return false;
    const writer = row.querySelector?.(".gall_writer,.ub-writer,td.writer,.writer,[data-nick='운영자'],[data-uid='admin']");
    const writerText = normalizeText(writer?.textContent || row.textContent);
    if (!writerText.includes("운영자")) return false;
    const cells = [...(row.children || [])].slice(0, 3);
    const badges = [...row.querySelectorAll?.(".gall_num,.gall_subject,.gall_tit,.ub-word") || [], ...cells];
    return badges.some((cell) => {
      const value = normalizeText(cell.textContent).replace(/\s+/g, "");
      return value === "AD" || value === "설문" || value.startsWith("AD") || value.startsWith("설문");
    });
  }

  function isForeignNetworkWriter(writer, tokens = null) {
    if (state.sync.hideForeignIpEnabled !== true) return false;
    const classifier = globalThis.DCBFastIpNetworkClassifier;
    if (!classifier) return false;
    const rawIp = tokens?.ip || [attr(writer, "data-ip"), attr(writer, "data-memo-ip")].filter(Boolean).join(" ");
    const category = classifier.classify(rawIp).category;
    return category === "foreign" || category === "anonymizer" || category === "relay";
  }

  function applyLoadingMemberIpBadge(tag, ip) {
    tag.className = MEMBER_IP_BADGE_CLASS;
    tag.setAttribute(FAST_BADGE_ATTR, "1");
    tag.setAttribute("data-dcb-loading-badge", "1");
    tag.dataset.dcbOwned = "member-ip-fast";
    tag.dataset.tone = "loading";
    tag.dataset.ip = ip;
    tag.title = "IP 정보 판정 중";
    tag.textContent = "로딩 중";
    return tag;
  }

  function createLoadingMemberIpBadge(ip) {
    return applyLoadingMemberIpBadge(document.createElement("span"), ip);
  }

  function applyFastMemberIpBadge(tag, ip) {
    const classifier = globalThis.DCBFastIpNetworkClassifier;
    if (!classifier?.describeIpFragment) return applyLoadingMemberIpBadge(tag, ip);
    const info = classifier.describeIpFragment(ip);
    tag.className = MEMBER_IP_BADGE_CLASS;
    tag.setAttribute(FAST_BADGE_ATTR, "1");
    tag.removeAttribute("data-dcb-loading-badge");
    tag.dataset.dcbOwned = "member-ip-fast";
    tag.dataset.tone = info.tone;
    tag.dataset.ip = ip;
    tag.title = info.title;
    tag.textContent = info.label;
    return tag;
  }

  function createFastMemberIpBadge(ip) {
    return applyFastMemberIpBadge(document.createElement("span"), ip);
  }

  function placeMemberIpBadge(writer, tag, ip) {
    const anchors = [...(writer.querySelectorAll?.(".ip,.writer_ip") || [])];
    const anchor = anchors.find((node) => normalizeIp(node.textContent || "") === ip);
    if (anchor) {
      anchor.insertAdjacentElement("afterend", tag);
      return;
    }
    const after = writer.querySelector?.(":scope > .writer_nikcon") || writer.querySelector?.(":scope > .nickname") || writer.querySelector?.(".writer_nikcon,.nickname");
    if (after) after.insertAdjacentElement("afterend", tag);
    else writer.appendChild(tag);
  }

  function attachLoadingMemberIpBadge(writer, tokens = null) {
    if (!(writer instanceof Element)) return;
    const ip = (tokens || writerTokens(writer)).ip;
    if (!ip) return;
    const existing = writer.querySelector?.(`.${MEMBER_IP_BADGE_CLASS}`);
    if (existing) return;
    placeMemberIpBadge(writer, createLoadingMemberIpBadge(ip), ip);
  }

  function attachFastMemberIpBadge(writer, tokens = null) {
    if (!(writer instanceof Element) || state.sync.showMemberIpInfo !== true) return;
    const ip = (tokens || writerTokens(writer)).ip;
    if (!ip) return;
    const existing = writer.querySelector?.(`.${MEMBER_IP_BADGE_CLASS}`);
    if (existing) {
      if (existing.hasAttribute("data-dcb-loading-badge")) applyFastMemberIpBadge(existing, ip);
      return;
    }
    placeMemberIpBadge(writer, createFastMemberIpBadge(ip), ip);
  }

  function syncFastMemberIpBadges(row, writers, getTokens) {
    if (state.memberIpViewReady) return;
    if (!state.memberIpSettingKnown) {
      writers.forEach((writer) => attachLoadingMemberIpBadge(writer, getTokens(writer)));
      return;
    }
    if (state.sync.showMemberIpInfo === true) {
      writers.forEach((writer) => attachFastMemberIpBadge(writer, getTokens(writer)));
      return;
    }
    row.querySelectorAll?.(`.${MEMBER_IP_BADGE_CLASS}[${FAST_BADGE_ATTR}="1"]`).forEach((node) => node.remove());
  }

  function processRow(row) {
    if (!(row instanceof Element) || row.closest(OWNED_SELECTOR)) return;
    const writers = row.matches?.(WRITER_SELECTOR) ? [row] : [...row.querySelectorAll(WRITER_SELECTOR)];
    const tokenCache = new Map();
    const getTokens = (writer) => {
      if (!tokenCache.has(writer)) tokenCache.set(writer, writerTokens(writer));
      return tokenCache.get(writer);
    };
    const blockedUser = state.sync.userBlockEnabled === false ? false : writers.some((writer) => userMatches(writer, getTokens(writer)));
    row.classList.toggle(USER_BLOCKED_CLASS, !!blockedUser);
    row.classList.toggle(NOTICE_BLOCKED_CLASS, isNoticeRow(row));
    const blockedForeign = state.sync.hideForeignIpEnabled === true && writers.some((writer) => isForeignNetworkWriter(writer, getTokens(writer)));
    row.classList.toggle(FOREIGN_IP_BLOCKED_CLASS, !!blockedForeign);
    syncFastMemberIpBadges(row, writers, getTokens);
  }

  function processRoot(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root instanceof Element && root.closest(OWNED_SELECTOR)) return;
    if (root instanceof Element && root.matches(ROW_SELECTOR)) processRow(root);
    root.querySelectorAll?.(ROW_SELECTOR).forEach(processRow);
  }

  function finish(reason) {
    if (state.phase !== "pending") return;
    if (reason === "watchdog") {
      state.sync = { userBlockEnabled: false, noticeBlockEnabled: false, hideForeignIpEnabled: false, showMemberIpInfo: false };
      state.tokens = [];
      state.matcher = buildMatcher([]);
    }
    state.phase = reason === "watchdog" || reason === "hot-error" ? "error" : "ready";
    state.reason = reason;
    state.completedAt = performance.now?.() || Date.now();
    processRoot(document);
    document.documentElement?.classList.remove(ROOT_CLASS);
    mark(reason);
    try { performance.measure("dcb-critical-filter:bootstrap", "dcb-critical-filter:start", `dcb-critical-filter:${reason}`); } catch (_) {}
    resolveReady(getSnapshot());
  }

  function getSnapshot() {
    return {
      phase: state.phase,
      sync: { ...state.sync },
      tokens: [...state.tokens],
      completedAt: state.completedAt,
      reason: state.reason,
      memberIpSettingKnown: state.memberIpSettingKnown
    };
  }

  function applyHotRecord(record) {
    const data = record?.version === HOT_CACHE_VERSION && record?.data && typeof record.data === "object"
      ? record.data
      : null;
    if (!data) return false;

    const sync = data.sync && typeof data.sync === "object" ? data.sync : {};
    state.sync = {
      userBlockEnabled: sync.userBlockEnabled !== false,
      noticeBlockEnabled: sync.noticeBlockEnabled !== false,
      hideForeignIpEnabled: sync.hideForeignIpEnabled === true,
      showMemberIpInfo: sync.showMemberIpInfo !== false
    };
    state.tokens = Array.isArray(data.tokens) ? data.tokens : [];
    state.matcher = buildMatcher(state.tokens);
    state.memberIpSettingKnown = true;
    return true;
  }

  async function loadState({ initial = false } = {}) {
    const generation = ++reloadGeneration;
    try {
      const stored = await chrome.storage.local.get({ [HOT_CACHE_KEY]: null });
      if (generation !== reloadGeneration) return;
      const readyFromHotCache = applyHotRecord(stored?.[HOT_CACHE_KEY]);

      if (!readyFromHotCache) {
        // Never hold first paint for a cold/missing cache. The background worker
        // seeds this snapshot and the full cleaners reconcile after document_end.
        state.sync = { userBlockEnabled: false, noticeBlockEnabled: false, hideForeignIpEnabled: false, showMemberIpInfo: false };
        state.tokens = [];
        state.matcher = buildMatcher([]);
        state.memberIpSettingKnown = false;
      }

      if (initial && state.phase === "pending") finish(readyFromHotCache ? "hot-ready" : "hot-miss");
      else processRoot(document);
    } catch (_) {
      if (generation !== reloadGeneration) return;
      state.sync = { userBlockEnabled: false, noticeBlockEnabled: false, hideForeignIpEnabled: false, showMemberIpInfo: false };
      state.tokens = [];
      state.matcher = buildMatcher([]);
      state.memberIpSettingKnown = false;
      if (initial && state.phase === "pending") finish("hot-error");
      else processRoot(document);
    }
  }

  function startObserver() {
    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) processRoot(node);
        if (record.type === "attributes") {
          const row = record.target.closest?.(ROW_SELECTOR);
          if (row) processRow(row);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-uid", "data-full-uid", "data-ip", "data-nick", "data-memo-uid", "data-memo-ip", "title", "href"]
    });
  }

  function setMemberIpBadgeSetting(enabled) {
    state.memberIpSettingKnown = true;
    state.memberIpViewReady = true;
    state.sync.showMemberIpInfo = !!enabled;
    if (!enabled) {
      document.querySelectorAll?.(`.${MEMBER_IP_BADGE_CLASS}[${FAST_BADGE_ATTR}="1"]`).forEach((node) => node.remove());
    }
  }

  globalThis.DCBCriticalFilter = { ready, getSnapshot, processRoot, setMemberIpBadgeSetting };
  mark("start");

  function begin() {
    installShield();
    startObserver();
    const watchdog = setTimeout(() => finish("watchdog"), WATCHDOG_MS);
    ready.finally(() => clearTimeout(watchdog));
    loadState({ initial: true });
  }

  if (document.documentElement) {
    begin();
  } else {
    const rootObserver = new MutationObserver(() => {
      if (!document.documentElement) return;
      rootObserver.disconnect();
      begin();
    });
    rootObserver.observe(document, { childList: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[HOT_CACHE_KEY]) loadState();
  });
})();
