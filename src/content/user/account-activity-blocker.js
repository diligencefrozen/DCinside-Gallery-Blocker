(() => {
  "use strict";
  if (globalThis.__DCB_ACCOUNT_ACTIVITY_BLOCKER__) return;
  globalThis.__DCB_ACCOUNT_ACTIVITY_BLOCKER__ = true;

  const FILTER = () => globalThis.DCBAccountActivityFilter;
  const STYLE_ID = "dcb-account-activity-style";
  const HIDDEN_CLASS = "dcb-account-activity-hidden";
  const PENDING_CLASS = "dcb-account-activity-pending";
  const NOTICE_CLASS = "dcb-account-activity-notice";
  const IS_NATIVE_LIST = location.hostname === "gall.dcinside.com" && /^\/(?:mgallery\/|mini\/|person\/)?board\/lists/.test(location.pathname);
  let navigationIntent = null;
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
  const writersByUid = new Map();
  const pendingRoots = new Set();
  const registeredUids = new Set(), newUids = new Set();
  let candidateRetryTimer = null, candidateRetryDelay = 30000;

  function registerCandidates() {
    if (!newUids.size || !enabled || document.hidden || candidateRetryTimer) return;
    const uids = [...newUids];
    newUids.clear();
    const epoch = rulesEpoch;
    const finish = result => {
      if (!enabled || epoch !== rulesEpoch) return;
      if (chrome.runtime.lastError || !result?.ok) {
        for (const uid of uids) newUids.add(uid);
        if (!document.hidden && !candidateRetryTimer) {
          candidateRetryTimer = setTimeout(() => { candidateRetryTimer = null; registerCandidates(); }, candidateRetryDelay);
          candidateRetryDelay = Math.min(candidateRetryDelay * 2, 300000);
        }
      } else candidateRetryDelay = 30000;
    };
    try { chrome.runtime.sendMessage({type:"dcb.activityCandidates", uids}, finish); }
    catch (_) { finish(null); }
  }
  chrome.runtime.onMessage?.addListener((message, sender, reply) => {
    if (message?.type !== "dcb.activityRecheck" || sender.id !== chrome.runtime.id) return;
    if (document.hidden || !enabled) { reply({inactive:true}); return; }
    FILTER().evaluate(message.uid, true).then(verdict => {
      refreshUid(message.uid, verdict);
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
      .dcb-activity-navigation-status{
        --dcb-activity-accent:#a9c7ff;
        box-sizing:border-box!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;
        position:static!important;float:none!important;clear:both!important;gap:10px!important;
        width:100%!important;min-width:0!important;max-width:100%!important;margin:8px 0!important;padding:12px!important;
        border:1px solid #3c5379!important;border-radius:10px!important;background:#17243a!important;color:#f1f5ff!important;
        box-shadow:0 3px 10px #0b12201a!important;font:12px/1.5 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;
        text-align:left!important;text-indent:0!important;white-space:normal!important;overflow-wrap:anywhere!important;
        animation:dcbActivityCardEnter 180ms ease-out both!important;
      }
      .dcb-activity-navigation-status[data-state="unavailable"]{--dcb-activity-accent:#f2cc89;border-color:#76603c!important}
      .dcb-activity-navigation-icon{
        display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 30px!important;
        width:30px!important;height:30px!important;border-radius:9px!important;background:#ffffff0d!important;color:var(--dcb-activity-accent)!important;
      }
      .dcb-activity-navigation-icon svg{display:block!important;width:19px!important;height:19px!important}
      .dcb-activity-navigation-copy{display:block!important;flex:1 1 0!important;min-width:0!important;white-space:normal!important}
      .dcb-activity-navigation-title{display:block!important;margin:0!important;color:#f1f5ff!important;font:750 12px/1.5 system-ui,sans-serif!important}
      .dcb-activity-navigation-detail{display:block!important;margin:3px 0 0!important;color:#bac8de!important;font:400 11px/1.6 system-ui,sans-serif!important;white-space:normal!important;overflow-wrap:anywhere!important}
      .dcb-activity-navigation-actions{display:flex!important;flex:1 0 100%!important;flex-wrap:wrap!important;justify-content:flex-end!important;gap:6px!important;min-width:0!important;max-width:100%!important}
      .dcb-activity-navigation-status button{
        appearance:none!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;
        min-width:0!important;max-width:100%!important;min-height:30px!important;margin:0!important;padding:5px 10px!important;
        border:1px solid #526685!important;border-radius:6px!important;background:#23344f!important;color:#e7edfa!important;
        font:650 11px/1.5 system-ui,sans-serif!important;white-space:normal!important;overflow-wrap:anywhere!important;text-align:center!important;cursor:pointer!important;
        transition:background-color 140ms ease,border-color 140ms ease!important;
      }
      .dcb-activity-navigation-status button[data-action="bypass"]{background:#ecf2ff!important;border-color:#ecf2ff!important;color:#17243a!important}
      .dcb-activity-navigation-status button:hover{border-color:#a9c7ff!important;background:#304563!important}
      .dcb-activity-navigation-status button[data-action="bypass"]:hover{background:#d6e4ff!important}
      .dcb-activity-navigation-status button:focus-visible{outline:3px solid #a9c7ff!important;outline-offset:2px!important}
      @keyframes dcbActivityCardEnter{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-reduced-motion:reduce){.dcb-activity-navigation-status{animation:none!important}.dcb-activity-navigation-status button{transition:none!important}}
      @media(prefers-color-scheme:dark){.dcb-activity-navigation-status{background:#111d30!important;box-shadow:none!important}}
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

  function currentNavigation(intent) {
    return navigationIntent === intent && !intent.cancelled && intent.anchor.isConnected && intent.writer.isConnected &&
      location.href === intent.sourceHref && intent.anchor.href === intent.url && extractUid(intent.writer).toLowerCase() === intent.uid.toLowerCase();
  }

  function clearNavigation(intent = navigationIntent) {
    if (!intent) return;
    intent.cancelled = true;
    const restoreFocus = intent.label?.contains(document.activeElement);
    intent.label?.remove();
    if (restoreFocus && intent.anchor.isConnected) intent.anchor.focus({preventScroll:true});
    if (intent.anchor.getAttribute("aria-busy") === "true") {
      if (intent.beforeBusy === null) intent.anchor.removeAttribute("aria-busy");
      else intent.anchor.setAttribute("aria-busy",intent.beforeBusy);
    }
    if (navigationIntent === intent) navigationIntent = null;
  }

  function showNavigationStatus(intent, unavailable = false) {
    if (!currentNavigation(intent)) { if (navigationIntent === intent) clearNavigation(intent); return; }
    installStyle();
    const restoreFocus = intent.label?.contains(document.activeElement);
    intent.label ||= document.createElement("div");
    intent.label.className = "dcb-activity-navigation-status";
    intent.label.dataset.dcbOwned = "activity-navigation";
    intent.label.dataset.state = unavailable ? "unavailable" : "checking";
    intent.label.setAttribute("role","group");
    intent.label.setAttribute("aria-label","게시글 열기 전 활동 확인");
    const icon = document.createElement("span");
    icon.className = "dcb-activity-navigation-icon"; icon.setAttribute("aria-hidden","true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 20 20");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.7");svg.setAttribute("stroke-linecap","round");svg.setAttribute("focusable","false");
    const circle = document.createElementNS("http://www.w3.org/2000/svg","circle");circle.setAttribute("cx","10");circle.setAttribute("cy","10");circle.setAttribute("r","7.5");
    const path = document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d",unavailable ? "M10 5.8v4.8M10 13.8h.01" : "M10 5.5v4.7l3 1.8");
    svg.append(circle,path);icon.append(svg);
    const copy = document.createElement("span");copy.className = "dcb-activity-navigation-copy";
    copy.setAttribute("role","status");copy.setAttribute("aria-live","polite");copy.setAttribute("aria-atomic","true");
    const title = document.createElement("strong");title.className = "dcb-activity-navigation-title";title.textContent = unavailable ? "활동 확인 불가" : "활동 확인 중…";
    const detail = document.createElement("span");detail.className = "dcb-activity-navigation-detail";
    detail.textContent = unavailable ? "활동 정보를 불러오지 못했어요. 잠시 후 제목을 다시 눌러 시도하거나, 확인 없이 열 수 있어요." : "게시글을 열기 전에 작성자의 활동 정보를 확인하고 있어요.";
    copy.append(title,detail);
    const actions = document.createElement("span");actions.className = "dcb-activity-navigation-actions";
    if (unavailable) {
      intent.state = "unavailable";
      if (intent.beforeBusy === null) intent.anchor.removeAttribute("aria-busy");
      else intent.anchor.setAttribute("aria-busy",intent.beforeBusy);
      const bypass = document.createElement("button");
      bypass.type = "button"; bypass.textContent = "확인 없이 열기";
      bypass.dataset.action = "bypass";
      bypass.onclick = () => { void resumeNavigation(intent,true); };
      actions.append(bypass);
    }
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "취소";
    cancel.onclick = () => clearNavigation(intent);
    actions.append(cancel);
    intent.label.replaceChildren(icon,copy,actions);
    // A normal-flow block grows the native title cell instead of covering its
    // source badge, reply count, author column or the following list row.
    if (!intent.label.isConnected) (intent.anchor.closest("td.gall_tit,.gall_tit") || intent.anchor.parentElement)?.append(intent.label);
    if (restoreFocus) actions.querySelector("button")?.focus({preventScroll:true});
  }

  async function resumeNavigation(intent, bypass = false) {
    if (!currentNavigation(intent)) { if (navigationIntent === intent) clearNavigation(intent); return; }
    try { await FILTER()?.flushCache?.(); } catch (_) { /* The verified verdict remains usable. */ }
    if (!currentNavigation(intent)) { if (navigationIntent === intent) clearNavigation(intent); return; }
    const settings = FILTER()?.getSettings(), latest = FILTER()?.peek(intent.uid);
    if (!bypass && settings?.enabled && settings.blockPosts !== false && latest?.available && latest.shouldHide) {
      setState(intent.info,intent.uid,"hidden",latest,false);clearNavigation(intent);return;
    }
    if (intent.newContext) {
      // A setting change or a repeated bypass can resume the same intent while
      // the first relay is awaiting its reply. Open that intent only once.
      if (intent.opening) return;
      intent.opening = true;
      try {
        const result = await new Promise((resolve,reject) => {
          chrome.runtime.sendMessage({type:"dcb.activityOpen",url:intent.url,active:intent.active,newWindow:intent.newWindow}, response => {
            if (chrome.runtime.lastError) reject(Error(chrome.runtime.lastError.message));
            else resolve(response);
          });
        });
        if (!result?.ok) throw Error("open failed");
        clearNavigation(intent);
      } catch (_) { intent.opening = false; showNavigationStatus(intent,true); }
    } else {
      const url = intent.url;
      clearNavigation(intent);
      location.assign(url);
    }
  }

  async function verifyNavigation(intent) {
    const filter = FILTER();
    try {
      await filter.ready();
      if (!currentNavigation(intent)) { if (navigationIntent === intent) clearNavigation(intent); return; }
      let settings = filter.getSettings();
      if (!settings.enabled || settings.blockPosts === false) { await resumeNavigation(intent); return; }
      const verdict = filter.peek(intent.uid) || await filter.evaluate(intent.uid);
      if (!currentNavigation(intent)) { if (navigationIntent === intent) clearNavigation(intent); return; }
      settings = filter.getSettings();
      if (!settings.enabled || settings.blockPosts === false) { await resumeNavigation(intent); return; }
      if (!verdict?.available) { showNavigationStatus(intent,true); return; }
      if (verdict.shouldHide) {
        setState(intent.info,intent.uid,"hidden",verdict,false);
        clearNavigation(intent);
        void filter.flushCache?.().catch(() => {});
      } else await resumeNavigation(intent);
    } catch (_) { showNavigationStatus(intent,true); }
  }

  function gateListNavigation(event) {
    if (!IS_NATIVE_LIST || !event.isTrusted || (event.type === "click" ? event.button !== 0 : event.button !== 1)) return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor) return;
    const row = anchor.closest(".gall_list tr,.gall_list li.ub-content,.gall_list li.gall_item");
    const writer = row?.querySelector(".gall_writer,.ub-writer");
    const uid = writer && extractUid(writer), filter = FILTER();
    let destination;
    try { destination = new URL(anchor.href,location.href); } catch { return; }
    if (!row || !uid || !filter || destination.hostname !== "gall.dcinside.com" ||
        !/^https?:$/.test(destination.protocol) || !/^\/(?:mgallery\/|mini\/|person\/)?board\/view\/?$/.test(destination.pathname) ||
        !/^[a-z0-9_]{1,80}$/i.test(destination.searchParams.get("id") || "") || !/^\d{1,20}$/.test(destination.searchParams.get("no") || "")) {
      clearNavigation(); return;
    }
    const settings = filter.getSettings(), snapshot = globalThis.DCBRuntimeSettingsCache?.peek?.({dcbImageAccountRules:null});
    if ((snapshot?.dcbImageAccountRules && (snapshot.dcbImageAccountRules.enabled !== true || snapshot.dcbImageAccountRules.blockPosts === false)) ||
        (filter.isReady?.() && (!settings.enabled || settings.blockPosts === false))) { clearNavigation(); return; }
    if (navigationIntent?.anchor === anchor && navigationIntent.uid.toLowerCase() === uid.toLowerCase() && navigationIntent.url === destination.href && navigationIntent.state === "checking") {
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    const cached = filter.peek(uid);
    if (cached?.available && !cached.shouldHide) { clearNavigation(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    if (navigationIntent?.anchor === anchor && navigationIntent.state === "checking") return;
    clearNavigation();
    const info = targetForWriter(writer) || {kind:"post",target:row,showNotice:false};
    if (cached?.available && cached.shouldHide) { installStyle();setState(info,uid,"hidden",cached,false);return; }
    const modified = event.ctrlKey || event.metaKey;
    const intent = {anchor,writer,info,uid,url:destination.href,sourceHref:location.href,state:"checking",cancelled:false,beforeBusy:anchor.getAttribute("aria-busy"),
      newContext:event.button===1 || modified || event.shiftKey || (anchor.target && !["_self","_top","_parent"].includes(anchor.target)),
      active:event.shiftKey || (!modified && event.button!==1),newWindow:event.shiftKey && !modified && event.button!==1};
    navigationIntent = intent;
    anchor.setAttribute("aria-busy","true");
    showNavigationStatus(intent);
    void verifyNavigation(intent);
  }

  if (IS_NATIVE_LIST) {
    document.addEventListener("click",gateListNavigation,true);
    document.addEventListener("auxclick",gateListNavigation,true);
    window.addEventListener("pagehide",()=>clearNavigation());
    window.addEventListener("popstate",()=>clearNavigation());
    window.addEventListener("hashchange",()=>clearNavigation());
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
      writersByUid.get(writer.dataset.dcbActivityUid.toLowerCase())?.delete(writer);
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
    const key = uid.toLowerCase();
    if (!writersByUid.has(key)) writersByUid.set(key, new Set());
    writersByUid.get(key).add(writer);
    if (writer.dataset.dcbActivityUid !== uid) writer.dataset.dcbActivityUid = uid;
    // Shared successful results cost no network request, even outside the viewport.
    const cached = filter.peek?.(uid);
    if (cached?.available) {
      const entry = uidQueue.get(key) || {key, targets:new Map()};
      entry.targets.set(target, {writer, info, uid});
      applyVerdict(entry, cached, settings);
      uidQueue.delete(key);
      activityViewport?.unobserve(writer);
      return;
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

    let entry = uidQueue.get(key);
    if (!entry) {
      entry = { key, uid, targets: new Map(), state: "queued", retryAt: 0, failures: 0 };
      uidQueue.set(key, entry);
    }
    entry.targets.set(target, { writer, info, uid });

    {
      if (cached && entry.state === "queued") deferEntry(entry, cached, false);
      if (!cached && entry.reason === "NO_TOKEN") {
        entry.reason = ""; entry.retryAt = 0; entry.state = "queued";
      }
      if (entry.state === "queued" && guardRetryAt > Date.now()) entry.state = "deferred";
      if (settings.display) setBadge(writer, info, uid, activityLabel(entry), activityStatus(entry));
      // Registration can encounter the same author hundreds of times in one
      // scan. The other rows already carry this queue state.
      if (settings.enabled && settingAllows(settings, info.kind) && target.dataset.dcbAccountActivityPeek !== uid) {
        setState(info, uid, entry.state, null, entry.state !== "unavailable" && settings.holdWhileChecking === true);
      }
    }
  }

  function refreshUid(rawUid, verdict = null) {
    if (!enabled || document.hidden) return;
    const key = normalizeUid(rawUid).toLowerCase(), writers = writersByUid.get(key);
    if (!writers) return;
    const filter = FILTER(), settings = filter.getSettings();
    const entry = uidQueue.get(key) || {key, targets:new Map()};
    for (const writer of writers) {
      if (!writer.isConnected || extractUid(writer).toLowerCase() !== key) { writers.delete(writer); continue; }
      const info = targetForWriter(writer);
      if (info) entry.targets.set(info.target, {writer, info, uid:extractUid(writer)});
    }
    if (!writers.size) writersByUid.delete(key);
    const cached = filter.peek(key);
    const result = cached?.available ? cached : verdict || cached;
    if (result?.available) {
      applyVerdict(entry, result, settings);
      uidQueue.delete(key);
    } else {
      if (result && uidQueue.has(key)) deferEntry(entry, result, false);
      for (const writer of writers) registerWriter(writer, filter, settings);
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
    const pending = uidQueue.get(uid.toLowerCase());
    if (info && pending) setBadge(writer, info, uid, activityLabel(pending), activityStatus(pending));
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

  function activityLabel(entry) {
    if (entry.reason === "NO_TOKEN") return "세션 없음";
    if (entry.reason === "BUDGET" || entry.reason === "COOLDOWN" || /^HTTP_(403|429|503)$/.test(entry.reason || "")) return "요청 대기";
    if (entry.reason) return entry.state === "unavailable" ? "조회 불가" : "재시도 대기";
    return entry.state === "checking" ? "조회 중" : "대기";
  }

  function applyQueueState(entry, settings) {
    for (const { info, uid, writer } of liveTargets(entry, settings)) {
      if (settings.display) setBadge(writer, info, uid, activityLabel(entry), activityStatus(entry));
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
      const settings = FILTER()?.getSettings();
      if (IS_NATIVE_LIST && settings?.enabled && settings.blockPosts !== false) run();
      else if (globalThis.DCBStartupScheduler) {
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
    const settings = FILTER()?.getSettings();
    if (IS_NATIVE_LIST && settings?.enabled && settings.blockPosts !== false) { void scanScopes([root]); return; }
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
        for (const node of record.removedNodes || []) {
          if (node.nodeType !== 1 || node.isConnected) continue;
          activityViewport?.unobserve(node);
          for (const writer of writerNodesInScope(node)) {
            activityViewport?.unobserve(writer);
            const key = writer.dataset.dcbActivityUid?.toLowerCase(), writers = writersByUid.get(key);
            writers?.delete(writer);
            if (writers && !writers.size) writersByUid.delete(key);
          }
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
    writersByUid.clear();
    clearTimeout(candidateRetryTimer);
    candidateRetryTimer = null;
    candidateRetryDelay = 30000;
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
    if (IS_NATIVE_LIST && settings.enabled && settings.blockPosts !== false) void scan();
    else scheduleScan(0);
  }

  window.addEventListener("dcb:account-activity-rules-changed", () => {
    const current = FILTER()?.getSettings();
    if (navigationIntent && (!current?.enabled || current.blockPosts === false)) void resumeNavigation(navigationIntent);
    rulesEpoch += 1;
    stopWork();
    clearAll(true);
    void updateFeatureState();
  });
  document.addEventListener("visibilitychange", () => {
    if (!enabled) return;
    if (document.visibilityState !== "hidden") {
      registerCandidates();
      scheduleScan(0);
      void drainUidQueue();
    } else {
      clearTimeout(candidateRetryTimer);
      candidateRetryTimer = null;
      if (queueWakeTimer) clearTimeout(queueWakeTimer);
      queueWakeTimer = null;
    }
  });
  window.addEventListener("dcb:account-activity-cache-changed", event => {
    if (!enabled || document.hidden) return;
    for (const uid of event.detail || []) refreshUid(uid);
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
