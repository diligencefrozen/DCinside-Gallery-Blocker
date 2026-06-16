/*****************************************************************
 * cleaner-userblock.js
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-userblock-style";
  const BLOCKED_CLASS = "dcb-userblock-hidden";
  const OLD_MASKED_CLASS = "dcb-masked";
  const CSS_RULE_TOKEN_LIMIT = 500;

  let blockedUidsCache = null;

  const DEFAULTS = {
    userBlockEnabled: true,
    blockedUids: [],          // ['회원UID', '118.235' 같은 IP prefix]
    includeGray: true,
    hideDCGray: undefined
  };

  const WRITER_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    "td.gall_writer",
    ".refresherUserData",
    ".dcb-uid-badge",
    "[data-uid]",
    "[data-ip]",
    "[data-memo-uid]",
    "[data-memo-ip]"
  ].join(",");

  const COMMENT_ROOT_SELECTOR = [
    "#focus_cmt",
    ".comment_wrap",
    ".cmt_list",
    ".reply_box",
    ".reply_list",
    ".dccon_comment_box"
  ].join(",");

  const COMMENT_BODY_SELECTOR = [
    ".cmt_txtbox",
    ".comment_box",
    ".cmt_txt",
    ".ub-word",
    ".usertxt",
    ".dccon_comment_box"
  ].join(",");

  const cssEscape = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  function normalizeToken(value) {
    return String(value || "")
      .trim()
      .replace(/^uid\s*[:=]\s*/i, "")
      .replace(/^ip\s*[:=]\s*/i, "")
      .replace(/^\(|\)$/g, "")
      .trim();
  }

  function isIpLike(value) {
    return /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(value || "").trim());
  }

  function normalizeIpPrefix(value) {
    const s = normalizeToken(value);
    const m = s.match(/\b(\d{1,3}\.\d{1,3})(?:\.\d{1,3}){0,2}\b/);
    return m ? m[1] : "";
  }

  function normalizeUidCandidate(value) {
    const s = normalizeToken(value)
      .replace(/^@+/, "")
      .replace(/[\s\)\]>'";]+$/g, "")
      .trim();

    if (!s || isIpLike(s)) return "";
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(s)) return "";
    return s;
  }

  function tokenKey(value) {
    const clean = normalizeToken(value);
    return clean ? clean.toLowerCase() : "";
  }

  function textFromAttrs(el) {
    if (!el) return "";

    const attrs = [
      "data-full-uid",
      "data-uid",
      "data-user-id",
      "data-userid",
      "data-user_id",
      "data-memo-uid",
      "data-ip",
      "data-memo-ip",
      "onclick",
      "href",
      "title",
      "alt",
      "aria-label"
    ];

    return attrs
      .map((name) => el.getAttribute?.(name) || "")
      .filter(Boolean)
      .join(" ");
  }

  function readDataToken(scope, name) {
    if (!scope) return "";

    const own = scope.getAttribute?.(name) || "";
    if (own) return own;

    const child = scope.querySelector?.(`[${name}]`);
    return child?.getAttribute?.(name) || "";
  }

  function extractUidFromGallogText(text) {
    const s = String(text || "");

    const path = s.match(/gallog\.dcinside\.com\/?([A-Za-z0-9._-]{2,64})/i);
    if (path) return normalizeUidCandidate(path[1]);

    const query = s.match(/[?&](?:id|user_id|userid|uid)=([A-Za-z0-9._-]{2,64})/i);
    if (query) return normalizeUidCandidate(query[1]);

    const encoded = s.match(/gallog\.dcinside\.com[^A-Za-z0-9._-]+([A-Za-z0-9._-]{2,64})/i);
    if (encoded) return normalizeUidCandidate(encoded[1]);

    const fnArg = s.match(/(?:go_?gallog|gallog|user_id|userid|uid)\s*(?:\(|=|:)\s*['"]?([A-Za-z0-9._-]{2,64})/i);
    if (fnArg) return normalizeUidCandidate(fnArg[1]);

    return "";
  }

  function uidFromBadge(scope) {
    if (!scope) return "";

    const badge =
      scope.matches?.(".dcb-uid-badge")
        ? scope
        : scope.querySelector?.(".dcb-uid-badge");

    if (!badge) return "";

    return (
      normalizeUidCandidate(badge.dataset?.fullUid) ||
      normalizeUidCandidate(badge.getAttribute?.("data-full-uid")) ||
      normalizeUidCandidate(badge.getAttribute?.("title")) ||
      normalizeUidCandidate((badge.textContent || "").replace(/[()]/g, ""))
    );
  }

  function uidFromRefresherData(scope) {
    if (!scope) return "";

    const ref =
      scope.matches?.(".refresherUserData")
        ? scope
        : scope.querySelector?.(".refresherUserData");

    if (!ref) return "";

    return (
      normalizeUidCandidate(ref.getAttribute?.("title")) ||
      normalizeUidCandidate(textFromAttrs(ref)) ||
      normalizeUidCandidate((ref.textContent || "").replace(/[()]/g, ""))
    );
  }

  function uidFromGallogReference(scope) {
    if (!scope) return "";

    const selfText = textFromAttrs(scope);
    const selfUid = extractUidFromGallogText(selfText);
    if (selfUid) return selfUid;

    const ref = scope.querySelector?.(
      '[onclick*="gallog.dcinside.com"], [href*="gallog.dcinside.com"], [title*="갤로그"], [alt*="갤로그"]'
    );

    return ref ? extractUidFromGallogText(textFromAttrs(ref)) : "";
  }

  function ipPrefixFromText(scope) {
    if (!scope) return "";

    const ipEl =
      scope.matches?.(".ip, .refresherUserData.ip")
        ? scope
        : (scope.querySelector?.(".ip") ||
           scope.querySelector?.(".refresherUserData.ip") ||
           scope.querySelector?.("[data-ip]") ||
           null);

    const attrText = [textFromAttrs(scope), textFromAttrs(ipEl)].filter(Boolean).join(" ");
    const fromAttr = normalizeIpPrefix(attrText);
    if (fromAttr) return fromAttr;

    const text = (ipEl?.textContent || scope.textContent || "").trim();
    return normalizeIpPrefix(text);
  }

  function extractWriterTokens(scope) {
    if (!scope) return { uid: "", ip: "" };

    const uid =
      normalizeUidCandidate(readDataToken(scope, "data-uid")) ||
      normalizeUidCandidate(readDataToken(scope, "data-memo-uid")) ||
      normalizeUidCandidate(readDataToken(scope, "data-user-id")) ||
      normalizeUidCandidate(readDataToken(scope, "data-userid")) ||
      normalizeUidCandidate(readDataToken(scope, "data-user_id")) ||
      uidFromBadge(scope) ||
      uidFromRefresherData(scope) ||
      uidFromGallogReference(scope) ||
      "";

    const ip =
      normalizeIpPrefix(readDataToken(scope, "data-ip")) ||
      normalizeIpPrefix(readDataToken(scope, "data-memo-ip")) ||
      ipPrefixFromText(scope) ||
      "";

    return { uid, ip };
  }

  function buildMatcher(rawTokens) {
    const uids = new Set();
    const ips = new Set();

    (Array.isArray(rawTokens) ? rawTokens : []).forEach((raw) => {
      const clean = normalizeToken(raw);
      if (!clean) return;

      const ip = normalizeIpPrefix(clean);
      if (ip && isIpLike(clean)) {
        ips.add(ip);
        return;
      }

      const uid = normalizeUidCandidate(clean);
      if (uid) uids.add(tokenKey(uid));
    });

    return { uids, ips, empty: !uids.size && !ips.size };
  }

  function writerMatches(scope, matcher) {
    if (!scope || matcher.empty) return false;

    const { uid, ip } = extractWriterTokens(scope);
    if (uid && matcher.uids.has(tokenKey(uid))) return true;
    if (ip && matcher.ips.has(normalizeIpPrefix(ip))) return true;

    return false;
  }

  function ensureStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  function migrate(conf) {
    if (typeof conf.userBlockEnabled !== "boolean" && typeof conf.hideDCGray === "boolean") {
      conf.userBlockEnabled = conf.hideDCGray;
      chrome.storage.sync.set({ userBlockEnabled: conf.userBlockEnabled });
    }
    return conf;
  }

  async function readBlockedUids() {
    if (Array.isArray(blockedUidsCache)) return blockedUidsCache;

    if (globalThis.DCBUserBlockStore?.getAllTokens) {
      blockedUidsCache = await DCBUserBlockStore.getAllTokens();
      return blockedUidsCache;
    }

    const local = await chrome.storage.local.get({ blockedUids: [] });
    blockedUidsCache = Array.isArray(local.blockedUids) ? local.blockedUids : [];
    return blockedUidsCache;
  }

  function invalidateBlockedUidsCache() {
    blockedUidsCache = null;
  }

  function buildCss(conf) {
    const { userBlockEnabled, includeGray, blockedUids } = conf;
    if (!userBlockEnabled) return "";

    const lines = [];
    if (includeGray) lines.push(".block-disable{display:none!important}");

    lines.push(`
      .${BLOCKED_CLASS} { display:none!important; }

      .dcb-blocked {
        display:block; margin:6px 0 8px; padding:8px 10px;
        background:rgba(224,49,49,.08); color:#e03131;
        border:1px dashed rgba(224,49,49,.45); border-radius:6px;
        font-size:12px; font-weight:700; line-height:1.45;
        white-space:pre-wrap; word-break:break-word;
      }
    `);

    const addRulesForAttr = (attr) => {
      lines.push(
        `.gall_list tr.ub-content:has(.gall_writer${attr}){display:none!important}`,
        `.gall_list tr:has(.gall_writer${attr}){display:none!important}`,
        `.gall_list li.ub-content:has(.gall_writer${attr}){display:none!important}`,
        `.gall_list li:has(.gall_writer${attr}){display:none!important}`,
        `.view_content_wrap:has(.gall_writer[data-loc="view"]${attr}){display:none!important}`,
        `#focus_cmt li.ub-content:has(.gall_writer${attr}){display:none!important}`,
        `.comment_wrap li.ub-content:has(.gall_writer${attr}){display:none!important}`,
        `.cmt_list li.ub-content:has(.gall_writer${attr}){display:none!important}`
      );
    };

    const cssTokens = Array.isArray(blockedUids) ? blockedUids : [];

    // 대량 차단 사용자에게 수천~수만 개 :has() CSS를 생성하면 페이지 렌더링이 무거워진다.
    // 작은 목록은 CSS로 빠르게 숨기고, 큰 목록은 아래 DOM 스캐너(Set 매칭)에 맡긴다.
    if (cssTokens.length <= CSS_RULE_TOKEN_LIMIT) {
      cssTokens.forEach((raw) => {
        const clean = normalizeToken(raw);
        if (!clean) return;

        const ip = normalizeIpPrefix(clean);
        if (ip && isIpLike(clean)) {
          addRulesForAttr(`[data-ip^="${cssEscape(ip)}"]`);
          return;
        }

        const uid = normalizeUidCandidate(clean);
        if (uid) addRulesForAttr(`[data-uid="${cssEscape(uid)}"]`);
      });
    }

    return lines.join("\n");
  }

  function clearDomBlocks() {
    document.querySelectorAll(`.${BLOCKED_CLASS}`).forEach((el) => {
      el.classList.remove(BLOCKED_CLASS);
    });

    document.querySelectorAll(`.${OLD_MASKED_CLASS}`).forEach((el) => {
      el.classList.remove(OLD_MASKED_CLASS);
    });

    document.querySelectorAll("[data-dcb-prev-display]").forEach((el) => {
      const prev = el.getAttribute("data-dcb-prev-display");
      if (prev) el.style.display = prev;
      else el.style.removeProperty("display");
      el.removeAttribute("data-dcb-prev-display");
    });
  }

  function isInsideCommentRoot(writer) {
    return !!writer.closest?.(COMMENT_ROOT_SELECTOR);
  }

  function findCommentBody(container) {
    return container?.querySelector?.(COMMENT_BODY_SELECTOR) || null;
  }

  function findBodyFromInfo(infoEl) {
    const parent = infoEl?.parentElement;
    const parentBody = findCommentBody(parent || infoEl);
    if (parentBody) return parentBody;

    let sib = infoEl?.nextElementSibling;
    for (let i = 0; i < 4 && sib; i += 1, sib = sib.nextElementSibling) {
      if (sib.matches?.(COMMENT_BODY_SELECTOR)) return sib;
      const inner = sib.querySelector?.(COMMENT_BODY_SELECTOR);
      if (inner) return inner;
    }

    return null;
  }

  function findCommentTargets(writer) {
    const commentLi = writer.closest?.(
      "#focus_cmt li, .comment_wrap li, .cmt_list li, .reply_box li, .reply_list li, .dccon_comment_box li, li.ub-content"
    );
    if (commentLi && isInsideCommentRoot(commentLi)) return [commentLi];

    const info = writer.closest?.(".cmt_info, .reply_info, .cmt_nickbox") || writer;
    const body = findBodyFromInfo(info);

    return [...new Set([info, body].filter(Boolean))];
  }

  function findListContainer(writer) {
    if (isInsideCommentRoot(writer)) return null;

    return writer.closest?.(
      ".gall_list tr.ub-content, .gall_list tr[data-no], .gall_list tr.gall_tr, " +
      "tr.ub-content, tr[data-no], tr.gall_tr, .gall_list li.ub-content, " +
      ".gall_list li.gall_item, li.ub-content, li.gall_item, .gall_item"
    ) || null;
  }

  function isViewWriter(writer) {
    if (isInsideCommentRoot(writer)) return false;
    if (writer.getAttribute?.("data-loc") === "view") return true;
    return !!writer.closest?.(".gallview_head, .view_head, .view_content_wrap");
  }

  function findViewContainer(writer) {
    if (!isViewWriter(writer)) return null;

    return (
      writer.closest?.(".view_content_wrap") ||
      document.querySelector(".view_content_wrap") ||
      writer.closest?.(".view_wrap") ||
      writer.closest?.(".gallview") ||
      writer.closest?.("article") ||
      writer.closest?.(".gallview_head, .view_head") ||
      null
    );
  }

  function markBlocked(el) {
    if (!el || el.nodeType !== 1) return;
    el.classList.add(BLOCKED_CLASS);
  }

  function getCandidateWriters() {
    const seen = new Set();
    const out = [];

    document.querySelectorAll(WRITER_SELECTOR).forEach((node) => {
      const writer =
        node.closest?.(".gall_writer, .ub-writer") ||
        node.closest?.(".cmt_info, .reply_info, .cmt_nickbox, .writer_info, .user_info") ||
        node;

      if (!writer || seen.has(writer)) return;
      seen.add(writer);
      out.push(writer);
    });

    return out;
  }

  function applyDomBlocks(matcher) {
    clearDomBlocks();
    if (matcher.empty) return;

    getCandidateWriters().forEach((writer) => {
      if (!writerMatches(writer, matcher)) return;

      const commentTargets = isInsideCommentRoot(writer) ? findCommentTargets(writer) : [];
      if (commentTargets.length) {
        commentTargets.forEach(markBlocked);
        return;
      }

      const listContainer = findListContainer(writer);
      if (listContainer) {
        markBlocked(listContainer);
        return;
      }

      const viewContainer = findViewContainer(writer);
      if (viewContainer) {
        markBlocked(viewContainer);
      }
    });
  }

  function apply() {
    chrome.storage.sync.get(DEFAULTS, async (raw) => {
      const conf = migrate(raw);

      try {
        conf.blockedUids = await readBlockedUids();
      } catch (_) {
        conf.blockedUids = [];
      }

      ensureStyle().textContent = buildCss(conf);

      if (!conf.userBlockEnabled) {
        clearDomBlocks();
        return;
      }

      const matcher = buildMatcher(conf.blockedUids || []);
      applyDomBlocks(matcher);
    });
  }

  let debounceTimer = null;
  function scheduleApply(delay = 80) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      apply();
    }, delay);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }

  const mo = new MutationObserver(() => scheduleApply(100));
  const startMO = () => {
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener("DOMContentLoaded", startMO, { once: true });
  };
  startMO();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && globalThis.DCBUserBlockStore?.isRelevantChange?.(changes)) {
      invalidateBlockedUidsCache();
      scheduleApply(0);
      return;
    }

    if (area === "sync") {
      if (changes.userBlockEnabled || changes.includeGray || changes.hideDCGray || changes.blockedUids) {
        if (changes.blockedUids) invalidateBlockedUidsCache();
        scheduleApply(0);
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "dcb.userBlockApply") {
      scheduleApply(0);
    }
  });
})();
