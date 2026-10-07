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
    if (uidFromGallog(scope)) return true;
    if (scope.matches?.(".writer_nikcon,.dcb-uid-badge")) return true;
    return !!scope.querySelector?.(
      ".writer_nikcon,.dcb-uid-badge,[href*='gallog'],[onclick*='gallog']"
    );
  }

  function extractUid(writer) {
    if (!hasGallogMarker(writer)) return "";
    const raw =
      dataValue(writer, ["data-full-uid", "data-uid", "data-memo-uid", "data-user-id", "data-userid", "data-user_id"]) ||
      cleanText(writer?.querySelector?.(".dcb-uid-badge")?.getAttribute?.("data-full-uid")) ||
      uidFromGallog(writer);
    return normalizeUid(raw);
  }

  function canonicalWriter(node) {
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

  function registerWriter(writer, filter, settings) {
    const info = targetForWriter(writer);
    if (!info) return;
    const uid = extractUid(writer);
    const { target } = info;
    if (!uid || !settingAllows(settings, info.kind)) {
      clearTarget(target);
      return;
    }
    if (target.dataset.dcbAccountActivityPeek === uid) {
      clearTarget(target, uid);
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
      if (entry.state === "queued" && guardRetryAt > Date.now()) entry.state = "deferred";
      applyQueueState(entry, settings);
    }
  }

  function liveTargets(entry, settings) {
    for (const [target, item] of entry.targets) {
      if (!target.isConnected || !item.writer.isConnected ||
          extractUid(item.writer).toLowerCase() !== entry.key) {
        entry.targets.delete(target);
      } else if (!settingAllows(settings, item.info.kind) || target.dataset.dcbAccountActivityPeek === item.uid) {
        clearTarget(target, item.uid);
        entry.targets.delete(target);
      }
    }
    return entry.targets.values();
  }

  function applyVerdict(entry, verdict, settings) {
    for (const { info, uid } of liveTargets(entry, settings)) {
      if (verdict.shouldHide) setState(info, uid, "hidden", verdict);
      else clearTarget(info.target, uid);
    }
  }

  function applyQueueState(entry, settings) {
    for (const { info, uid } of liveTargets(entry, settings)) {
      setState(info, uid, entry.state, null,
        entry.state !== "unavailable" && settings.holdWhileChecking === true);
    }
  }

  function deferEntry(entry, verdict, attempted) {
    const guarded = verdict?.reason === "BUDGET" || verdict?.reason === "COOLDOWN";
    const retryAt = Number(verdict?.retryAt) || 0;
    if (attempted && !guarded) entry.failures += 1;
    if (guarded) {
      guardRetryAt = Math.max(guardRetryAt, retryAt);
      for (const queued of uidQueue.values()) {
        if (queued.state === "queued") queued.state = "deferred";
      }
    }
    const retryable = retryAt > Date.now() && verdict?.reason !== "NO_TOKEN" &&
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
      while (enabled && epoch === rulesEpoch && document.visibilityState !== "hidden") {
        const settings = filter.getSettings();
        if (!settings.enabled) break;
        let next = null;
        const now = Date.now();
        for (const [key, entry] of uidQueue) {
          liveTargets(entry, settings);
          if (!entry.targets.size) {
            uidQueue.delete(key);
            continue;
          }
          const cached = filter.peek?.(entry.uid);
          if (cached?.available) {
            applyVerdict(entry, cached, settings);
            uidQueue.delete(key);
            continue;
          }
          if (entry.state === "unavailable" || entry.retryAt > now || guardRetryAt > now) continue;
          // Page DOM order prioritizes top rows; each UID has only one entry.
          next = entry;
          break;
        }
        if (!next) break;
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
          uidQueue.delete(next.key);
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

  async function scanScope(scope = document) {
    if (!enabled) return;
    const filter = FILTER();
    if (!filter) return;
    await filter.ready();
    if (!enabled) return;
    const settings = filter.getSettings();
    if (!settings.enabled) {
      if (scope === document) clearAll();
      return;
    }
    if (document.visibilityState === "hidden") return;

    const seen = new Set();
    writerNodesInScope(scope).forEach((node) => {
      const writer = canonicalWriter(node);
      if (!writer || seen.has(writer)) return;
      seen.add(writer);
      registerWriter(writer, filter, settings);
    });
    void drainUidQueue();
  }

  async function scan() {
    return scanScope(document);
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
    const roots = Array.from(pendingRoots).filter((root) => root?.isConnected !== false);
    pendingRoots.clear();
    return roots.filter((root, index) => {
      if (!(root instanceof Element)) return true;
      return !roots.some((other, otherIndex) => (
        index !== otherIndex && other instanceof Element && other.contains?.(root)
      ));
    });
  }

  function flushIncrementalScans() {
    incrementalTimer = null;
    const roots = minimalPendingRoots();
    if (!roots.length) return;
    roots.forEach((root) => void scanScope(root));
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
      for (const record of records) {
        if (record.type === "attributes") {
          queueIncrementalScan(record.target);
          continue;
        }
        for (const node of record.addedNodes || []) queueIncrementalScan(node);
      }
    };
    const attributes = ["data-uid", "data-full-uid", "data-memo-uid", "href", "onclick"];
    if (globalThis.DCBDomMutationBus) {
      unsubscribeDomBus = globalThis.DCBDomMutationBus.subscribe(
        "account-activity-blocker", handleRecords,
        { types: ["childList", "attributes"], attributes, ignoreOwned: false }
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
    guardRetryAt = 0;
  }

  async function updateFeatureState() {
    const filter = FILTER();
    if (!filter) return;
    await filter.ready();
    enabled = filter.getSettings().enabled === true;
    if (!enabled) {
      stopWork();
      document.getElementById(STYLE_ID)?.remove();
      return;
    }
    installStyle();
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
  window.addEventListener("dcb:account-activity-cache-changed", () => {
    if (enabled && uidQueue.size) void drainUidQueue();
  });
  document.addEventListener("dcb-preview-state", (event) => {
    if (!enabled || !event?.detail?.open) return;
    const preview = document.getElementById("dcb-preview-overlay");
    preview?.querySelectorAll?.(`[data-dcb-account-activity-uid],[data-dcb-account-activity-peek],.${HIDDEN_CLASS},.${PENDING_CLASS}`).forEach((target) => {
      clearTarget(target);
      delete target.dataset.dcbAccountActivityPeek;
    });
    if (preview) queueIncrementalScan(preview, true);
  });

  void updateFeatureState();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!enabled) return;
      installStyle();
      watch();
      scheduleScan(0);
    }, { once: true });
  }
})();
