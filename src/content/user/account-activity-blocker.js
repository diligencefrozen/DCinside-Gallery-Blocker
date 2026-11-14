(() => {
  "use strict";
  if (globalThis.__DCB_ACCOUNT_ACTIVITY_BLOCKER__) return;
  globalThis.__DCB_ACCOUNT_ACTIVITY_BLOCKER__ = true;

  const FILTER = () => globalThis.DCBAccountActivityFilter;
  const STYLE_ID = "dcb-account-activity-style";
  const HIDDEN_CLASS = "dcb-account-activity-hidden";
  const PENDING_CLASS = "dcb-account-activity-pending";
  const NOTICE_CLASS = "dcb-account-activity-notice";
  // Guard deferrals do not consume retries: they never reached the endpoint.
  // Actual lookup failures get at most two automatic retries in this document.
  const MAX_FAILURE_RETRIES = 2;
  const WRITER_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    ".dcb-uid-badge",
    "[data-full-uid]",
    "[data-uid]",
    "[data-memo-uid]"
  ].join(",");

  let observer = null;
  let unsubscribeDomBus = null;
  let enabled = false;
  let scanTimer = null;
  let incrementalTimer = null;
  let cancelScheduledScan = null;
  let queueWakeTimer = null;
  let queueActive = false;
  let guardRetryAt = 0;
  let rulesEpoch = 0;
  const uidQueue = new Map();
  const pendingRoots = new Set();
  const registeredUids = new Set(), newUids = new Set();

  function registerCandidates() {
    if (!newUids.size) return;
    const uids = [...newUids];
    newUids.clear();
    chrome.runtime.sendMessage({type:"dcb.activityCandidates", uids}, result => {
      if (chrome.runtime.lastError || !result?.ok) for (const uid of uids) registeredUids.delete(uid);
    });
  }
  chrome.runtime.onMessage?.addListener((message, sender, reply) => {
    if (message?.type !== "dcb.activityRecheck" || sender.id !== chrome.runtime.id) return;
    if (document.hidden || !enabled) { reply({inactive:true}); return; }
    FILTER().evaluate(message.uid, true).then(verdict => {
      reply({available:verdict.available, reason:verdict.reason, checkedAt:verdict.checkedAt, retryAt:verdict.retryAt});

    }, () => reply({available:false, reason:"UNAVAILABLE"}));
    return true;
  });

  const cleanText = (value) => String(value ?? "").trim();

  function escapeHtml(value) {
    return cleanText(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function normalizeUid(value) {
    const uid = cleanText(value)
      .replace(/^uid\s*[:=]\s*/i, "")
      .replace(/^@+/, "")
      .replace(/[\s\)\]>'";]+$/g, "")
      .trim();
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(uid)) return "";
    if (/^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(uid)) return "";
    return uid;
  }

  function dataValue(scope, names) {
    for (const name of names) {
      const own = cleanText(scope?.getAttribute?.(name));
      if (own) return own;
      const child = scope?.querySelector?.(`[${name}]`);
      const nested = cleanText(child?.getAttribute?.(name));
      if (nested) return nested;
    }
    return "";
  }

  function uidFromGallog(scope) {
    if (!scope) return "";
    const nestedRefs = scope.querySelectorAll?.(
      "[href*='gallog.dcinside.com'],[onclick*='gallog.dcinside.com']"
    ) || [];
    const refs = [scope, ...nestedRefs];
    for (const ref of refs) {
      const text = [ref.getAttribute?.("href"), ref.getAttribute?.("onclick")]
        .filter(Boolean)
        .join(" ");
      const path = text.match(/gallog\.dcinside\.com\/?([A-Za-z0-9._-]{2,64})/i);
      if (path) return normalizeUid(path[1]);
      const query = text.match(/[?&](?:id|user_id|userid|uid)=([A-Za-z0-9._-]{2,64})/i);
      if (query) return normalizeUid(query[1]);
    }
    return "";
  }

  function hasGallogMarker(scope) {
    if (!scope) return false;
    if (scope.matches?.(".writer_nikcon,.dcb-uid-badge")) return true;
    if (scope.querySelector?.(".writer_nikcon,.dcb-uid-badge,[href*='gallog'],[onclick*='gallog']")) return true;
    return (scope.hasAttribute("href") || scope.hasAttribute("onclick")) && !!uidFromGallog(scope);
  }

  const identityAttributes = ["data-full-uid","data-uid","data-memo-uid","data-user-id","data-userid","data-user_id"];
  function extractUid(writer) {
    const explicit = identityAttributes.find(name => writer.hasAttribute(name) && writer.getAttribute(name));
    if (explicit && writer.matches(".gall_writer,.ub-writer") && !writer.getAttribute("data-ip")) {
      const uid = normalizeUid(writer.getAttribute(explicit));
      if (uid) return uid;
    }
    if (!hasGallogMarker(writer)) return "";
    const raw =
      dataValue(writer, identityAttributes) ||
      cleanText(writer?.querySelector?.(".dcb-uid-badge")?.getAttribute?.("data-full-uid")) ||
      uidFromGallog(writer);
    return normalizeUid(raw);
  }

  function canonicalWriter(node) {
    if (node.matches?.(".dcbpv-comment-item")) {
      return node.querySelector(":scope > .dcbpv-comment-meta > .gall_writer");
    }
    return node?.closest?.(".gall_writer,.ub-writer") || node;
  }

  function targetForWriter(writer) {
    const comment = writer.closest?.(
      ".dcbpv-comment-item,#focus_cmt li,.comment_wrap li,.cmt_list li,.reply_box li,.reply_list li,.dccon_comment_box li"
    );
    if (comment) return { kind: "comment", target: comment, showNotice: false };

    // Native rows use the same post context on ordinary and recommend lists;
    // exception_mode does not change activity eligibility or queue ownership.
    const listPost = writer.closest?.(
      ".gall_list tr.ub-content,.gall_list tr[data-no],.gall_list tr.gall_tr," +
      "tr.ub-content,tr[data-no],tr.gall_tr,.gall_list li.ub-content,.gall_list li.gall_item,li.gall_item"
    );
    if (listPost) return { kind: "post", target: listPost, showNotice: false };

    const preview = writer.closest?.("#dcb-preview-overlay");
    if (preview) {
      const article = preview.querySelector(".dcbpv-article");
      if (article) return { kind: "post", target: article, showNotice: true };
    }

    if (writer.getAttribute?.("data-loc") === "view" || writer.closest?.(".gallview_head,.view_head,.view_content_wrap")) {
      const view = writer.closest?.(".view_content_wrap") || document.querySelector(".view_content_wrap");
      if (view) return { kind: "post", target: view, showNotice: true };
    }

    return null;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const root = document.head || document.documentElement;
    if (!root) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${HIDDEN_CLASS},.${PENDING_CLASS}{display:none!important}
      .${NOTICE_CLASS}{display:flex;align-items:center;gap:12px;margin:12px 0;padding:13px 14px;border:1px dashed rgba(244,63,94,.45);border-radius:14px;background:#111827;color:#e5e7eb;font:700 12px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      .${NOTICE_CLASS}[data-pending='1']{border-color:rgba(56,189,248,.45)}
      .${NOTICE_CLASS} span{min-width:0}
      .${NOTICE_CLASS} strong{display:block;color:#fff;font-size:13px;margin-bottom:2px}
      .${NOTICE_CLASS} small{display:block;color:#a5b4c7;font-size:11px;word-break:break-word}
      .${NOTICE_CLASS} button{margin-left:auto;flex:0 0 auto;border:0;border-radius:999px;background:#f8fafc;color:#111827;padding:8px 12px;font:800 11px/1 system-ui;cursor:pointer}
    `;
    root.appendChild(style);
  }

  function removeNotice(target) {
    const previous = target?.previousElementSibling;
    if (previous?.classList?.contains(NOTICE_CLASS)) previous.remove();
  }

  function clearTarget(target, uid = "") {
    if (!target) return;
    target.classList.remove(HIDDEN_CLASS, PENDING_CLASS);
    removeNotice(target);
    if (!uid || target.dataset.dcbAccountActivityUid === uid) {
      delete target.dataset.dcbAccountActivityUid;
      delete target.dataset.dcbAccountActivityState;
      delete target.dataset.dcbAccountActivitySummary;
    }
  }

  function revealTemporarily(target, uid) {
    target.dataset.dcbAccountActivityPeek = uid;
    clearTarget(target, uid);
  }

  function showTargetNotice(target, uid, verdict, pending) {
    removeNotice(target);
    const notice = document.createElement("div");
    notice.className = NOTICE_CLASS;
    notice.dataset.pending = pending ? "1" : "0";
    const title = pending ? "작성자 활동 정보를 확인하고 있어요" : "활동이 적은 회원의 게시글을 숨겼어요";
    const detail = pending ? `UID ${uid} · 확인하는 동안 먼저 접어 둡니다` : `UID ${uid} · ${verdict?.summary || "설정한 활동 기준 미달"}`;
    notice.innerHTML = `<span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span><button type="button">게시글 보기</button>`;
    notice.querySelector("button").addEventListener("click", () => revealTemporarily(target, uid));
    target.parentNode?.insertBefore(notice, target);
  }

  function setState(info, uid, state, verdict = null, pending = state === "pending") {
    const { target, showNotice } = info;
    const summary = cleanText(verdict?.summary);
    if (
      target.dataset.dcbAccountActivityUid === uid &&
      target.dataset.dcbAccountActivityState === state &&
      target.dataset.dcbAccountActivitySummary === summary &&
      target.classList.contains(PENDING_CLASS) === pending
    ) return;
    target.dataset.dcbAccountActivityUid = uid;
    target.dataset.dcbAccountActivityState = state;
    target.dataset.dcbAccountActivitySummary = summary;
    target.classList.toggle(PENDING_CLASS, pending);
    target.classList.toggle(HIDDEN_CLASS, state === "hidden");
    if (state === "hidden") globalThis.DCBBlockStats?.report?.(target, "lowActivity");
    if (showNotice && (pending || state === "hidden")) {
      showTargetNotice(target, uid, verdict, pending);
    } else {
      removeNotice(target);
    }
  }

  function settingAllows(settings, kind) {
    return kind === "comment" ? settings.blockComments !== false : settings.blockPosts !== false;
  }

  const badges = new WeakMap();
  let activityViewport;
  let seenInViewport = new WeakSet();
  function badgeHost(writer, info) {
    if (info.kind === "comment") {
      const comment = writer.closest(".cmt_info,.reply_info,.dcbpv-comment-item");
      if (comment?.matches(".dcbpv-comment-item")) {
        return comment.querySelector(":scope > .dcbpv-comment-meta > .dcbpv-comment-actions");
      }
      return comment?.querySelector(":scope > .fr") || comment;
    }
    return writer.closest("tr")?.querySelector("td.gall_tit.ub-word,td.gall_tit") || writer.parentElement;
  }
  function registerWriter(writer, filter, settings) {
    const info = targetForWriter(writer);
    if (!info) return;
    const uid = extractUid(writer);
    if (writer.dataset.dcbActivityUid && writer.dataset.dcbActivityUid !== uid) {
      delete writer.dataset.dcbActivityUid;
      delete writer.dataset.dcbWriterActivity;
    }
    const { target } = info;
    if (settings.display && (!uid || writer.dataset.dcbActivityUid !== uid)) {
      const stale = badgeHost(writer, info)?.querySelector(":scope > .dcb-activity-badge");
      if (stale && stale.dataset.activityOwner !== uid) stale.remove();
    }
    if (!uid || (!settings.display && !settingAllows(settings, info.kind))) {
      clearTarget(target);
      return;
    }
    if (!settings.display && target.dataset.dcbAccountActivityPeek === uid) {
      clearTarget(target, uid);
      return;
    }
    if (!registeredUids.has(uid.toLowerCase())) {
      registeredUids.add(uid.toLowerCase());
      newUids.add(uid.toLowerCase());
    }
    const settingAllowsActiveFilter = settings.enabled && settingAllows(settings, info.kind);
    if (settings.display && !settingAllowsActiveFilter && !seenInViewport.has(writer) && typeof IntersectionObserver === "function") {
      activityViewport ||= new IntersectionObserver(entries => {
        for (const item of entries) {
          if (!item.target.isConnected || item.isIntersecting) activityViewport?.unobserve(item.target);
          if (item.isIntersecting && item.target.isConnected) {
            seenInViewport.add(item.target);
            registerWriter(item.target, filter, filter.getSettings());
          }
        }
        void drainUidQueue();
      }, {rootMargin:"160px"});
      activityViewport.observe(writer);
      return;
    }

    const key = uid.toLowerCase();
    let entry = uidQueue.get(key);
    if (!entry) {
      entry = { key, uid, targets: new Map(), state: "queued", retryAt: 0, failures: 0 };
      uidQueue.set(key, entry);
    }
    entry.targets.set(target, { writer, info, uid });

    const cached = filter.peek?.(uid);
    if (cached?.available) {
      applyVerdict(entry, cached, settings);
      uidQueue.delete(key);
    } else {
      if (cached && entry.state === "queued") deferEntry(entry, cached, false);
      if (!cached && entry.reason === "NO_TOKEN") {
        entry.reason = ""; entry.retryAt = 0; entry.state = "queued";
      }
      if (settings.display && entry.reason) setBadge(writer, info, uid, "—", activityStatus(entry));
      if (entry.state === "queued" && guardRetryAt > Date.now()) entry.state = "deferred";
      // Registration can encounter the same author hundreds of times in one
      // scan. The other rows already carry this queue state.
      if (settings.enabled && settingAllows(settings, info.kind) && target.dataset.dcbAccountActivityPeek !== uid) {
        setState(info, uid, entry.state, null, entry.state !== "unavailable" && settings.holdWhileChecking === true);
      }
    }
  }

  function liveTargets(entry, settings) {
    for (const [target, item] of entry.targets) {
      if (!target.isConnected || !item.writer.isConnected ||
          extractUid(item.writer).toLowerCase() !== entry.key) {
        entry.targets.delete(target);
      } else if (!settings.display && (!settingAllows(settings, item.info.kind) || target.dataset.dcbAccountActivityPeek === item.uid)) {
        clearTarget(target, item.uid);
        entry.targets.delete(target);
      }
    }
    return entry.targets.values();
  }

  function setBadge(writer, info, uid, label, description) {
    if (writer.dataset.dcbActivityUid !== uid) writer.dataset.dcbActivityUid = uid;
    const host = badgeHost(writer, info);
    if (host) {
      let badge = badges.get(writer) || host.querySelector(":scope > .dcb-activity-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "dcb-activity-badge";
        badge.dataset.dcbOwned = "activity";
      }
      badges.set(writer,badge);
      if (badge.dataset.activityOwner !== uid) badge.dataset.activityOwner = uid;
      if (badge.title !== description) badge.title = description;
      const accessible = label + " · " + description;
      if (badge.getAttribute("aria-label") !== accessible) badge.setAttribute("aria-label", accessible);
      if (badge.dataset.dcbWriterActivity !== label) badge.dataset.dcbWriterActivity = label;
      if (badge.parentElement !== host) host.prepend(badge);
    }
  }

  function applyVerdict(entry, verdict, settings) {
    const description = settings.display ? "작성자 활동량 · " + new Date(verdict.checkedAt).toLocaleString() : "";
    for (const { info, uid, writer } of liveTargets(entry, settings)) {
      const counts = verdict.stats;
      if (settings.display && Number.isInteger(counts?.posts) && Number.isInteger(counts?.comments)) {
        const label = `글 ${counts.posts} · 댓 ${counts.comments}`;
        setBadge(writer, info, uid, label, description);
      }
      if (settings.enabled && settingAllows(settings,info.kind) && info.target.dataset.dcbAccountActivityPeek !== uid && verdict.shouldHide) setState(info, uid, "hidden", verdict);
      else if (info.target.hasAttribute("data-dcb-account-activity-uid")) clearTarget(info.target, uid);
    }
  }

  // Expose the transient queue state on demand, without constructing a badge
  // for every pending row during the initial scan.
  function showPendingStatus(event) {
    const filter = FILTER();
    if (!enabled || !filter?.getSettings().display) return;
    const writer = event.target.closest?.(".gall_writer,.ub-writer");
    if (!writer) return;
    const uid = extractUid(writer), entry = uidQueue.get(uid.toLowerCase());
    const info = entry && targetForWriter(writer);
    // Cookies can arrive after the first preview scan. Resume on user demand
    // when NO_TOKEN is no longer fresh, without polling or bypassing a budget.
    if (info && entry.reason === "NO_TOKEN" && !filter.peek(uid)) {
      registerWriter(writer, filter, filter.getSettings());
      void drainUidQueue();
    }
    if (info) setBadge(writer, info, uid, "—", activityStatus(entry));
  }
  document.addEventListener("pointerover", showPendingStatus);
  document.addEventListener("focusin", showPendingStatus);

  function activityStatus(entry) {
    const next = Math.max(entry.retryAt || 0, guardRetryAt);
    const retry = next > Date.now() ? " · 재조회 예정 " + new Date(next).toLocaleTimeString() : "";
    if (entry.reason === "NO_TOKEN") return "활동량 · 세션 토큰 없음 · 원문 접속 후 작성자에 마우스를 올려 다시 확인";
    if (entry.reason === "BUDGET") return "활동량 · 요청 예산 대기 (전체 탭 합산 10분당 12회)" + retry;
    if (entry.reason === "COOLDOWN" || /^HTTP_(403|429|503)$/.test(entry.reason)) return "활동량 · 서버 요청 제한" + retry;
    if (entry.reason) return "활동량 조회 실패 · " + entry.reason + retry;
    return entry.state === "checking" ? "활동량 조회 중" : "활동량 조회 대기";
  }

  function applyQueueState(entry, settings) {
    for (const { info, uid, writer } of liveTargets(entry, settings)) {
      if (settings.display && entry.reason) setBadge(writer, info, uid, "—", activityStatus(entry));
      if (!settings.enabled || !settingAllows(settings,info.kind) || info.target.dataset.dcbAccountActivityPeek === uid) continue;
      setState(info, uid, entry.state, null,
        entry.state !== "unavailable" && settings.holdWhileChecking === true);
    }
  }

  function deferEntry(entry, verdict, attempted) {
    entry.reason = verdict?.reason;
    const guarded = verdict?.reason === "BUDGET" || verdict?.reason === "COOLDOWN";
    const retryAt = Number(verdict?.retryAt) || 0;
    if (attempted && !guarded) entry.failures += 1;
    if (guarded) {
      guardRetryAt = Math.max(guardRetryAt, retryAt);
      for (const queued of uidQueue.values()) {
        if (queued.state === "queued") queued.state = "deferred";
      }
    }
    const retryable = retryAt > Date.now() &&
      (guarded || entry.failures <= MAX_FAILURE_RETRIES);
    entry.retryAt = retryable ? retryAt : 0;
    entry.state = retryable ? "deferred" : "unavailable";
  }

  function scheduleQueueWake() {
    if (queueWakeTimer) clearTimeout(queueWakeTimer);
    queueWakeTimer = null;
    if (!enabled || document.visibilityState === "hidden") return;
    const now = Date.now();
    let wakeAt = Infinity;
    for (const entry of uidQueue.values()) {
      if (entry.state === "unavailable" || !entry.targets.size) continue;
      wakeAt = Math.min(wakeAt, Math.max(entry.retryAt, guardRetryAt, now));
    }
    if (!Number.isFinite(wakeAt)) return;
    // A single deadline wake-up, not polling. Hidden documents resume on visibilitychange.
    queueWakeTimer = setTimeout(() => {
      queueWakeTimer = null;
      void drainUidQueue();
    }, Math.max(0, wakeAt - now));
  }

  async function drainUidQueue() {
    if (queueActive || !enabled || document.visibilityState === "hidden") return;
    const filter = FILTER();
    if (!filter) return;
    queueActive = true;
    const epoch = rulesEpoch;
    try {
      // A Map iterator also sees UIDs appended while evaluate() is pending.
      // Restarting from the first UID after every negative response used to
      // re-read every preceding writer's DOM on each iteration.
      let deadline = performance.now() + 8;
      for (const [key, next] of uidQueue) {
        if (performance.now() >= deadline) {
          await new Promise(resolve => setTimeout(resolve, 0));
          deadline = performance.now() + 8;
        }
        if (!enabled || epoch !== rulesEpoch || document.hidden) break;
        const settings = filter.getSettings();
        if (!settings.enabled && !settings.display) break;
        liveTargets(next, settings);
        if (!next.targets.size) {
          uidQueue.delete(key);
          continue;
        }
        const cached = filter.peek?.(next.uid);
        if (cached?.available) {
          applyVerdict(next, cached, settings);
          uidQueue.delete(key);
          continue;
        }
        const now = Date.now();
        if (next.state === "unavailable" || next.retryAt > now || guardRetryAt > now) continue;
        next.state = "checking";
        applyQueueState(next, settings);
        let verdict;
        try {
          verdict = await filter.evaluate(next.uid);
        } catch (_) {
          verdict = { available: false, reason: "EVALUATE" };
        }
        if (epoch !== rulesEpoch) break;
        if (verdict?.available) {
          applyVerdict(next, verdict, filter.getSettings());
          if (uidQueue.get(next.key) === next) uidQueue.delete(next.key);
        } else {
          deferEntry(next, verdict, true);
          applyQueueState(next, filter.getSettings());
        }
      }
    } finally {
      queueActive = false;
      scheduleQueueWake();
    }
  }

  function clearAll(resetPeek = false) {
    document.querySelectorAll(".dcb-activity-badge").forEach(badge=>badge.remove());
    document.querySelectorAll("[data-dcb-activity-uid]").forEach(writer => {
      delete writer.dataset.dcbActivityUid;
      delete writer.dataset.dcbWriterActivity;
    });
    document.querySelectorAll(`[data-dcb-account-activity-uid],[data-dcb-account-activity-peek],.${HIDDEN_CLASS},.${PENDING_CLASS}`).forEach((target) => {
      clearTarget(target);
      if (resetPeek) delete target.dataset.dcbAccountActivityPeek;
    });
    document.querySelectorAll(`.${NOTICE_CLASS}`).forEach((notice) => notice.remove());
  }

  function writerNodesInScope(scope) {
    const nodes = [];
    if (!scope) return nodes;
    if (scope === document || scope.nodeType === Node.DOCUMENT_NODE) {
      document.querySelectorAll(WRITER_SELECTOR).forEach((node) => nodes.push(node));
      return nodes;
    }
    if (scope.nodeType !== Node.ELEMENT_NODE && scope.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return nodes;
    if (scope.nodeType === Node.ELEMENT_NODE) {
      if (scope.matches?.(WRITER_SELECTOR)) nodes.push(scope);
      const owner = scope.closest?.(".gall_writer,.ub-writer");
      if (owner) nodes.push(owner);
    }
    scope.querySelectorAll?.(WRITER_SELECTOR).forEach((node) => nodes.push(node));
    return nodes;
  }

  async function scanScopes(scopes) {
    if (!enabled) return;
    const filter = FILTER();
    if (!filter) return;
    await filter.ready();
    if (!enabled) return;
    const settings = filter.getSettings();
    if (!settings.enabled && !settings.display) {
      if (scopes.includes(document)) clearAll();
      return;
    }
    if (document.visibilityState === "hidden") return;

    const seen = new Set();
    for (const scope of scopes) writerNodesInScope(scope).forEach((node) => {
      const writer = canonicalWriter(node);
      if (!writer || seen.has(writer)) return;
      seen.add(writer);
      registerWriter(writer, filter, settings);
    });
    registerCandidates();
    void drainUidQueue();
  }

  // Warm verdicts must not wait for the idle queue or the 80ms incremental
  // debounce. Use the same policy/cache, without starting network requests.
  function applyCachedRoots(roots) {
    if (!enabled) return;
    const filter = FILTER(), settings = filter?.getSettings();
    if (!settings?.enabled) return;
    const seen = new Set();
    for (const root of roots) for (const node of writerNodesInScope(root)) {
      const writer = canonicalWriter(node);
      if (!writer || !writer.isConnected || seen.has(writer)) continue;
      seen.add(writer);
      const info = targetForWriter(writer), uid = extractUid(writer);
      if (!info || !uid || !settingAllows(settings, info.kind) || info.target.dataset.dcbAccountActivityPeek === uid) continue;
      const verdict = filter.peek(uid);
      if (verdict?.available) {
        if (verdict.shouldHide) setState(info, uid, "hidden", verdict, false);
        else clearTarget(info.target, uid);
      } else if (settings.holdWhileChecking && !verdict) {
        setState(info, uid, "pending", null, true);
      }
    }
  }

  async function scan() {
    return scanScopes([document]);
  }

  function scheduleScan(delay = 80) {
    if (!enabled) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      const run = () => { cancelScheduledScan = null; void scan(); };
      cancelScheduledScan?.();
      if (globalThis.DCBStartupScheduler) {
        cancelScheduledScan = globalThis.DCBStartupScheduler.schedule("account-activity:scan", run, "idle");
      } else run();
    }, delay);
  }

  function minimalPendingRoots() {
    const roots = new Set(pendingRoots);
    pendingRoots.clear();
    return [...roots].filter(root => {
      if (!root.isConnected) return false;
      for (let parent = root.parentElement; parent; parent = parent.parentElement) {
        if (roots.has(parent)) return false;
      }
      return true;
    });
  }

  function flushIncrementalScans() {
    incrementalTimer = null;
    const roots = minimalPendingRoots();
    if (!roots.length) return;
    void scanScopes(roots);
  }

  function queueIncrementalScan(root, allowOwned = false) {
    if (!enabled) return;
    if (!root || (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)) return;
    if (!allowOwned && root instanceof Element && root.closest?.("[data-dcb-owned]")) {
      root = root.closest(".gall_writer,.ub-writer");
      if (!root) return;
    }
    pendingRoots.add(root);
    if (incrementalTimer) return;
    incrementalTimer = setTimeout(flushIncrementalScans, 80);
  }

  function watch() {
    if (!enabled || observer || unsubscribeDomBus || !document.documentElement) return;
    const handleRecords = (records) => {
      if (!enabled) return;
      const immediate = new Set();
      for (const record of records) {
        if (record.type === "attributes") {
          immediate.add(record.target);
          queueIncrementalScan(record.target);
          continue;
        }
        for (const node of record.addedNodes || []) {
          if (node.nodeType === Node.ELEMENT_NODE && !node.closest?.("[data-dcb-owned]")) immediate.add(node);
          queueIncrementalScan(node);
        }
        if (activityViewport) for (const node of record.removedNodes || []) {
          if (node.nodeType !== 1 || node.isConnected) continue;
          activityViewport.unobserve(node);
          node.querySelectorAll(".gall_writer,.ub-writer").forEach(writer=>activityViewport.unobserve(writer));
        }
      }
      applyCachedRoots(immediate);
    };
    const attributes = [...identityAttributes, "data-ip", "href", "onclick"];
    if (globalThis.DCBDomMutationBus) {
      unsubscribeDomBus = globalThis.DCBDomMutationBus.subscribe(
        "account-activity-blocker", handleRecords,
        { types: ["childList", "attributes"], attributes, ignoreOwned: false, immediate: true }
      );
      return;
    }
    observer = new MutationObserver(handleRecords);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: attributes
    });
  }

  function stopWork() {
    activityViewport?.disconnect();
    activityViewport = null;
    seenInViewport = new WeakSet();
    observer?.disconnect();
    observer = null;
    unsubscribeDomBus?.();
    unsubscribeDomBus = null;
    if (scanTimer) clearTimeout(scanTimer);
    if (incrementalTimer) clearTimeout(incrementalTimer);
    if (queueWakeTimer) clearTimeout(queueWakeTimer);
    scanTimer = incrementalTimer = queueWakeTimer = null;
    cancelScheduledScan?.();
    cancelScheduledScan = null;
    pendingRoots.clear();
    uidQueue.clear();
    registeredUids.clear();
    newUids.clear();
    guardRetryAt = 0;
  }

  async function updateFeatureState() {
    const filter = FILTER();
    if (!filter) return;
    await filter.ready();
    const settings = filter.getSettings();
    enabled = settings.enabled || settings.display;
    if (!enabled) {
      stopWork();
      document.getElementById(STYLE_ID)?.remove();
      return;
    }
    installStyle();
    applyCachedRoots([document]);
    watch();
    scheduleScan(0);
  }

  window.addEventListener("dcb:account-activity-rules-changed", () => {
    rulesEpoch += 1;
    stopWork();
    clearAll(true);
    void updateFeatureState();
  });
  document.addEventListener("visibilitychange", () => {
    if (!enabled) return;
    if (document.visibilityState !== "hidden") {
      scheduleScan(0);
      void drainUidQueue();
    } else if (queueWakeTimer) {
      clearTimeout(queueWakeTimer);
      queueWakeTimer = null;
    }
  });
  window.addEventListener("dcb:account-activity-cache-changed", event => {
    if (!enabled || document.hidden) return;
    const filter = FILTER(), settings = filter.getSettings();
    if (settings.display && event.detail?.length) {
      const changed = new Set(event.detail);
      for (const writer of document.querySelectorAll("[data-dcb-activity-uid]")) {
        const uid = writer.dataset.dcbActivityUid, key = uid.toLowerCase();
        if (!changed.has(key)) continue;
        const info = targetForWriter(writer), verdict = filter.peek(uid);
        if (info && verdict?.available) applyVerdict({key, targets:new Map([[info.target,{writer,info,uid}]])},verdict,settings);
        else if (info) registerWriter(writer,filter,settings);
      }
    }
    if (uidQueue.size) void drainUidQueue();
  });
  document.addEventListener("dcb-preview-state", event => {
    if (event.detail?.open !== false || !uidQueue.size) return;
    for (const [key, entry] of uidQueue) {
      for (const [target] of entry.targets) {
        if (!target.isConnected) entry.targets.delete(target);
      }
      if (!entry.targets.size) uidQueue.delete(key);
    }
    scheduleQueueWake();
  });
  document.addEventListener("dcb-preview-content", event => {
    if (!enabled) return;
    applyCachedRoots(event.detail?.addedRows || [event.detail?.root]);
    if (event.detail?.addedRows) {
      for (const row of event.detail.addedRows) queueIncrementalScan(row, true);
    } else if (event.detail?.root) queueIncrementalScan(event.detail.root, true);
  });

  void updateFeatureState();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!enabled) return;
      installStyle();
      applyCachedRoots([document]);
      watch();
      scheduleScan(0);
    }, { once: true });
  }
})();
