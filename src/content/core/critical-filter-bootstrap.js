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
  const WATCHDOG_MS = 1800;
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
    sync: { userBlockEnabled: true, noticeBlockEnabled: true },
    tokens: [],
    matcher: null,
    completedAt: 0,
    reason: ""
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
        html.${ROOT_CLASS} .gall_list tr:has(.gall_writer),
        html.${ROOT_CLASS} .gall_list tr:has(.ub-writer),
        html.${ROOT_CLASS} .gall_list li:has(.gall_writer),
        html.${ROOT_CLASS} .gall_list li:has(.ub-writer) {
          visibility: hidden !important;
        }
        .${USER_BLOCKED_CLASS}, .${NOTICE_BLOCKED_CLASS} {
          display: none !important;
        }
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

  function userMatches(writer) {
    const matcher = state.matcher;
    if (!matcher || state.sync.userBlockEnabled === false) return false;
    const { uid, ip, nick } = writerTokens(writer);
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

  function processRow(row) {
    if (!(row instanceof Element) || row.closest(OWNED_SELECTOR)) return;
    const writers = row.matches?.(WRITER_SELECTOR) ? [row] : [...row.querySelectorAll(WRITER_SELECTOR)];
    const blockedUser = writers.some(userMatches);
    row.classList.toggle(USER_BLOCKED_CLASS, !!blockedUser);
    row.classList.toggle(NOTICE_BLOCKED_CLASS, isNoticeRow(row));
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
      state.sync = { userBlockEnabled: false, noticeBlockEnabled: false };
      state.tokens = [];
      state.matcher = buildMatcher([]);
    }
    state.phase = reason === "ready" ? "ready" : "error";
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
      reason: state.reason
    };
  }

  async function loadState({ initial = false } = {}) {
    const generation = ++reloadGeneration;
    try {
      const [sync, tokens] = await Promise.all([
        chrome.storage.sync.get({ userBlockEnabled: true, noticeBlockEnabled: true }),
        globalThis.DCBUserBlockStore?.getAllTokensReadOnly?.() ||
          chrome.storage.local.get({ blockedUids: [] }).then((value) => value.blockedUids || [])
      ]);
      if (generation !== reloadGeneration) return;
      state.sync = {
        userBlockEnabled: sync.userBlockEnabled !== false,
        noticeBlockEnabled: sync.noticeBlockEnabled !== false
      };
      state.tokens = Array.isArray(tokens) ? tokens : [];
      state.matcher = buildMatcher(state.tokens);
      if (initial && state.phase === "pending") finish("ready");
      else {
        if (initial) state.phase = "ready";
        processRoot(document);
      }
    } catch (_) {
      if (generation !== reloadGeneration) return;
      state.sync = { userBlockEnabled: false, noticeBlockEnabled: false };
      state.tokens = [];
      state.matcher = buildMatcher([]);
      if (initial && state.phase === "pending") finish("storage-error");
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

  globalThis.DCBCriticalFilter = { ready, getSnapshot, processRoot };
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
    const relevantSync = area === "sync" && (changes.userBlockEnabled || changes.noticeBlockEnabled || changes.blockedUids);
    const relevantLocal = area === "local" && (
      globalThis.DCBUserBlockStore?.isRelevantChange?.(changes) || changes.blockedUids
    );
    if (relevantSync || relevantLocal) loadState();
  });
})();
