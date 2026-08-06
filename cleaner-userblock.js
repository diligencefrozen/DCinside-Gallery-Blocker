/*****************************************************************
 * cleaner-userblock.js
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-userblock-style";
  const BLOCKED_CLASS = "dcb-userblock-hidden";
  const OLD_MASKED_CLASS = "dcb-masked";
  const UNBLOCK_BUTTON_CLASS = "dcb-userblock-unblock";
  const UNBLOCK_HOST_CLASS = "dcb-userblock-unblock-host";
  const CSS_RULE_TOKEN_LIMIT = 80;

  let blockedUidsCache = null;
  let blockedUidsCacheRevision = 0;

  const DEFAULTS = {
    userBlockEnabled: true,
    blockedUids: [],          // ['회원UID', '118.235' 같은 IP prefix, 'nick:닉네임']
    includeGray: true,
    hideDCGray: undefined
  };

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

  function normalizeNick(value) {
    const nick = String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\((?:\d{1,3}\.){1,3}\d{0,3}\)\s*$/g, "")
      .trim();

    return nick.slice(0, 80);
  }

  function normalizeToken(value) {
    const raw = String(value || "").trim();
    const nickMatch = raw.match(/^nick\s*[:=]\s*(.+)$/i);
    if (nickMatch) {
      const nick = normalizeNick(nickMatch[1]);
      return nick ? `nick:${nick}` : "";
    }

    const clean = raw
      .replace(/^uid\s*[:=]\s*/i, "")
      .replace(/^ip\s*[:=]\s*/i, "")
      .replace(/^\(|\)$/g, "")
      .replace(/\s+/g, "")
      .trim();

    if (!clean) return "";

    const ip = normalizeIpPrefix(clean);
    if (ip && isIpLike(clean)) return ip;
    if (isUidLike(clean)) return clean;

    const implicitNick = normalizeNick(raw);
    return implicitNick ? `nick:${implicitNick}` : "";
  }

  function isIpLike(value) {
    return /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(value || "").trim());
  }

  function isUidLike(value) {
    return /^[A-Za-z0-9._-]{2,64}$/.test(String(value || "").trim());
  }

  function normalizeIpPrefix(value) {
    const s = String(value || "")
      .trim()
      .replace(/^ip\s*[:=]\s*/i, "")
      .replace(/^\(|\)$/g, "");
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
      "data-nick",
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

  function nicknameFromScope(scope) {
    if (!scope) return "";

    const nickEl =
      scope.matches?.(".nickname, .nick_name, .user_nick")
        ? scope
        : (scope.querySelector?.(":scope > .nickname") ||
           scope.querySelector?.(".nickname") ||
           scope.querySelector?.(".nick_name") ||
           scope.querySelector?.(".user_nick") ||
           null);

    return normalizeNick(
      readDataToken(scope, "data-nick") ||
      nickEl?.getAttribute?.("title") ||
      nickEl?.textContent ||
      ""
    );
  }

  function extractWriterTokens(scope) {
    if (!scope) return { uid: "", ip: "", nick: "" };

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

    const nick = nicknameFromScope(scope);

    return { uid, ip, nick };
  }

  function buildMatcher(rawTokens) {
    const uidTokens = new Map();
    const ipTokens = new Map();
    const nickTokens = new Map();

    (Array.isArray(rawTokens) ? rawTokens : []).forEach((raw) => {
      const clean = normalizeToken(raw);
      if (!clean) return;

      if (/^nick:/i.test(clean)) {
        const nick = normalizeNick(clean.replace(/^nick\s*[:=]\s*/i, ""));
        if (nick) {
          const key = nick.toLowerCase();
          nickTokens.set(key, clean);
        }
        return;
      }

      const ip = normalizeIpPrefix(clean);
      if (ip && isIpLike(clean)) {
        ipTokens.set(ip, clean);
        return;
      }

      const uid = normalizeUidCandidate(clean);
      if (uid) {
        const key = tokenKey(uid);
        uidTokens.set(key, clean);
      }
    });

    return {
      uidTokens,
      ipTokens,
      nickTokens,
      empty: !uidTokens.size && !ipTokens.size && !nickTokens.size
    };
  }

  function writerMatches(scope, matcher) {
    if (!scope || matcher.empty) return false;

    const { uid, ip, nick } = extractWriterTokens(scope);
    const uidKey = uid ? tokenKey(uid) : "";
    if (uidKey && matcher.uidTokens.has(uidKey)) return true;

    const ipKey = ip ? normalizeIpPrefix(ip) : "";
    if (ipKey && matcher.ipTokens.has(ipKey)) return true;

    const haystack = normalizeNick(nick).toLowerCase();
    if (!haystack) return false;
    for (const needle of matcher.nickTokens.keys()) {
      if (needle && haystack.includes(needle)) return true;
    }

    return false;
  }

  function findMatchedBlockedToken(scope, matcher) {
    return findMatchedBlockedTokens(scope, matcher)[0] || "";
  }

  function findMatchedBlockedTokens(scope, matcher) {
    if (!scope || matcher.empty) return [];

    const { uid, ip, nick } = extractWriterTokens(scope);
    const matched = [];
    const uidKey = uid ? tokenKey(uid) : "";
    if (uidKey && matcher.uidTokens.has(uidKey)) matched.push(matcher.uidTokens.get(uidKey));

    const ipKey = ip ? normalizeIpPrefix(ip) : "";
    if (ipKey && matcher.ipTokens.has(ipKey)) matched.push(matcher.ipTokens.get(ipKey));

    const haystack = normalizeNick(nick).toLowerCase();
    if (haystack) {
      for (const [needle, token] of matcher.nickTokens) {
        if (needle && haystack.includes(needle)) matched.push(token);
      }
    }

    return [...new Set(matched.filter(Boolean))];
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
    const revision = blockedUidsCacheRevision;

    if (globalThis.DCBUserBlockStore?.getAllTokens) {
      const reader = DCBUserBlockStore.getAllTokensReadOnly || DCBUserBlockStore.getAllTokens;
      const tokens = await reader();
      if (revision === blockedUidsCacheRevision) blockedUidsCache = tokens;
      return tokens;
    }

    const local = await chrome.storage.local.get({ blockedUids: [] });
    const tokens = Array.isArray(local.blockedUids) ? local.blockedUids : [];
    if (revision === blockedUidsCacheRevision) blockedUidsCache = tokens;
    return tokens;
  }

  function invalidateBlockedUidsCache() {
    blockedUidsCacheRevision += 1;
    blockedUidsCache = null;
  }

  function buildCss(conf) {
    const { userBlockEnabled, includeGray, blockedUids } = conf;
    const lines = [`
      .${UNBLOCK_HOST_CLASS} {
        display:inline-flex!important; align-items:center; flex:0 0 auto;
        min-width:0; max-width:100%; margin:0 0 0 6px!important;
        overflow:visible; white-space:nowrap; vertical-align:middle;
        line-height:1; position:relative; z-index:2;
      }
      .${UNBLOCK_BUTTON_CLASS} {
        --dcb-unblock-border:#d7dde7;
        --dcb-unblock-bg:#ffffff;
        --dcb-unblock-fg:#475569;
        --dcb-unblock-muted:#64748b;
        --dcb-unblock-action:#2563eb;
        box-sizing:border-box; display:inline-flex; align-items:center;
        min-width:0; max-width:100%; height:20px; padding:0 5px 0 3px;
        border:1px solid var(--dcb-unblock-border); border-radius:6px;
        background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);
        color:var(--dcb-unblock-fg);
        box-shadow:0 1px 2px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.9);
        font:600 10px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        letter-spacing:-.01em; cursor:pointer; vertical-align:middle;
        transition:border-color .14s ease, box-shadow .14s ease, background .14s ease, transform .14s ease;
      }
      .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-icon {
        display:inline-flex; align-items:center; justify-content:center;
        width:14px; height:14px; margin-right:4px; border-radius:4px;
        background:#eef2f7; color:#64748b; flex:0 0 auto;
      }
      .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-icon svg {
        display:block; width:10px; height:10px; fill:none; stroke:currentColor;
        stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round;
      }
      .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-status {
        overflow:hidden; text-overflow:ellipsis; color:var(--dcb-unblock-muted);
      }
      .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-divider {
        width:1px; height:10px; margin:0 5px; background:#dbe2ea; flex:0 0 auto;
      }
      .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-action {
        color:var(--dcb-unblock-action); font-weight:700; flex:0 0 auto;
      }
      .${UNBLOCK_BUTTON_CLASS}:hover {
        border-color:#aeb8c6; background:#fff;
        box-shadow:0 2px 5px rgba(15,23,42,.12), inset 0 1px 0 rgba(255,255,255,.95);
        transform:translateY(-1px);
      }
      .${UNBLOCK_BUTTON_CLASS}:hover .dcb-userblock-unblock-action { color:#1d4ed8; }
      .${UNBLOCK_BUTTON_CLASS}:active { transform:translateY(0); box-shadow:0 1px 2px rgba(15,23,42,.08); }
      .${UNBLOCK_BUTTON_CLASS}:focus-visible {
        outline:2px solid rgba(37,99,235,.55); outline-offset:2px;
      }
      .${UNBLOCK_BUTTON_CLASS}:disabled { opacity:.72; cursor:wait; transform:none; }
      .${UNBLOCK_BUTTON_CLASS}[data-state="busy"] .dcb-userblock-unblock-icon svg {
        animation:dcb-userblock-spin .8s linear infinite;
      }
      .${UNBLOCK_BUTTON_CLASS}[data-state="success"] {
        --dcb-unblock-border:#bbf7d0; --dcb-unblock-bg:#f0fdf4;
        --dcb-unblock-fg:#166534; --dcb-unblock-muted:#166534; --dcb-unblock-action:#166534;
        background:#f0fdf4;
      }
      .${UNBLOCK_BUTTON_CLASS}[data-state="error"] {
        --dcb-unblock-border:#fecaca; --dcb-unblock-fg:#b91c1c;
        --dcb-unblock-muted:#b91c1c; --dcb-unblock-action:#b91c1c;
        background:#fff7f7;
      }
      @keyframes dcb-userblock-spin { to { transform:rotate(360deg); } }
      html[data-theme="dark"] .${UNBLOCK_BUTTON_CLASS},
      body.dark .${UNBLOCK_BUTTON_CLASS},
      body.dcb-dark .${UNBLOCK_BUTTON_CLASS},
      .darkmode .${UNBLOCK_BUTTON_CLASS} {
        --dcb-unblock-border:#3b4656; --dcb-unblock-bg:#17202c;
        --dcb-unblock-fg:#d9e2ef; --dcb-unblock-muted:#aab7c8; --dcb-unblock-action:#8ab4ff;
        background:linear-gradient(180deg,#202a38 0%,#18212d 100%);
        box-shadow:0 1px 2px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.04);
      }
      html[data-theme="dark"] .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-icon,
      body.dark .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-icon,
      body.dcb-dark .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-icon,
      .darkmode .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-icon { background:#2b3646; }
      html[data-theme="dark"] .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-divider,
      body.dark .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-divider,
      body.dcb-dark .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-divider,
      .darkmode .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-divider { background:#3b4656; }
      @media (max-width:720px) {
        .${UNBLOCK_HOST_CLASS} { margin-left:4px!important; }
        .${UNBLOCK_BUTTON_CLASS} { padding-right:4px; }
        .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-status,
        .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-divider { display:none; }
        .${UNBLOCK_BUTTON_CLASS} .dcb-userblock-unblock-icon { margin-right:3px; }
      }
    `];

    if (!userBlockEnabled) return lines.join("\n");

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

        if (/^nick:/i.test(clean)) {
          const nick = normalizeNick(clean.replace(/^nick\s*[:=]\s*/i, ""));
          if (nick) {
            addRulesForAttr(`[data-nick*="${cssEscape(nick)}"]`);
            lines.push(
              `.gall_list tr:has(.gall_writer .nickname[title*="${cssEscape(nick)}"]){display:none!important}`,
              `.comment_wrap li.ub-content:has(.nickname[title*="${cssEscape(nick)}"]){display:none!important}`,
              `.cmt_list li.ub-content:has(.nickname[title*="${cssEscape(nick)}"]){display:none!important}`
            );
          }
          return;
        }

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

  function isReplyCommentItem(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches?.(".reply, .reply_line, .reply_item, .dcbpv-comment-item.reply, li[id^='reply_'], li[id^='reply_li_']")) return true;
    if (el.querySelector?.(":scope > .reply_info, :scope > .reply_box, :scope > .reply_txtbox")) return true;

    const depth = el.getAttribute?.("data-depth") || el.getAttribute?.("depth") || el.dataset?.depth || "";
    if (depth && Number(depth) > 0) return true;

    const parentNo = el.getAttribute?.("data-parent-no") || el.getAttribute?.("data-parent") || el.getAttribute?.("p-no") || "";
    if (parentNo) return true;

    return /(^|\s)(reply|reply_line|reply_item)(\s|$)/i.test(String(el.className || ""));
  }

  function readCommentNo(el) {
    if (!el || el.nodeType !== 1) return "";

    const fromId = String(el.id || "").match(/(?:comment|reply)_(?:li_)?(\d+)/i);
    if (fromId) return fromId[1];

    const attrNames = [
      "data-no", "data-comment-no", "data-commentno", "data-cno", "data-cmt-no", "data-article-no", "no"
    ];

    for (const name of attrNames) {
      const value = el.getAttribute?.(name);
      if (value && /^\d+$/.test(String(value).trim())) return String(value).trim();
    }

    const info = el.querySelector?.(":scope > .cmt_info[data-no], :scope > .reply_info[data-no], .cmt_info[data-no], .reply_info[data-no]");
    const infoNo = info?.getAttribute?.("data-no");
    return infoNo && /^\d+$/.test(String(infoNo).trim()) ? String(infoNo).trim() : "";
  }

  function collectReplyContainer(container, out) {
    if (!container || container.nodeType !== 1) return;
    if (!out.includes(container)) out.push(container);
    container.querySelectorAll?.(
      "li.reply, li.reply_line, li.reply_item, li[id^='reply_'], li[id^='reply_li_'], " +
      ".reply_item, .reply_box li, .reply_list li, .dcbpv-comment-item.reply"
    ).forEach((item) => {
      if (!out.includes(item)) out.push(item);
    });
  }

  function findReplyContainerForParentComment(root) {
    if (!root || root.nodeType !== 1 || isReplyCommentItem(root)) return null;

    const commentNo = readCommentNo(root);
    if (!commentNo) return null;

    const escapedNo = cssEscape(commentNo);
    const scopedSelector = [
      `#reply_list_${escapedNo}`,
      `.reply_list[p-no="${escapedNo}"]`,
      `.reply_list[data-parent-no="${escapedNo}"]`,
      `.reply_box[p-no="${escapedNo}"]`,
      `.reply_box[data-parent-no="${escapedNo}"]`,
      `[data-parent-no="${escapedNo}"]`,
      `[data-parent="${escapedNo}"]`
    ].join(",");

    let sib = root.nextElementSibling;
    let guard = 0;
    while (sib && guard < 6) {
      if (sib.matches?.(scopedSelector) || sib.querySelector?.(scopedSelector)) return sib;
      if (isReplyCommentItem(sib)) return sib;
      sib = sib.nextElementSibling;
      guard += 1;
    }

    const local = root.parentElement?.querySelector?.(scopedSelector) || document.querySelector(scopedSelector);
    if (!local) return null;
    return local.closest?.("li, .reply_box, .reply_list, .comment_wrap, .cmt_list") || local;
  }

  function expandCommentThread(root) {
    if (!root || root.nodeType !== 1) return [];

    const out = [root];

    root.querySelectorAll?.("li.reply, li.reply_line, li.reply_item, li[id^='reply_'], li[id^='reply_li_'], .reply_item, .reply_box li, .reply_list li, .dcbpv-comment-item.reply").forEach((item) => {
      if (!out.includes(item)) out.push(item);
    });

    const replyContainer = findReplyContainerForParentComment(root);
    if (replyContainer) collectReplyContainer(replyContainer, out);

    if (!isReplyCommentItem(root)) {
      let sib = root.nextElementSibling;
      let guard = 0;
      while (sib && guard < 80) {
        if (replyContainer && (sib === replyContainer || replyContainer.contains?.(sib))) {
          collectReplyContainer(sib, out);
          sib = sib.nextElementSibling;
          guard += 1;
          continue;
        }
        if (!isReplyCommentItem(sib)) break;
        collectReplyContainer(sib, out);
        sib = sib.nextElementSibling;
        guard += 1;
      }
    }

    return out;
  }

  function findCommentTargets(writer) {
    const commentLi = writer.closest?.(
      "#focus_cmt li, .comment_wrap li, .cmt_list li, .reply_box li, .reply_list li, .dccon_comment_box li, li.ub-content"
    );
    if (commentLi && isInsideCommentRoot(commentLi)) return expandCommentThread(commentLi);

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

  function getCandidateWriters(base = document) {
    const seen = new Set();
    const out = [];
    const authorSelector = ".gall_writer, .ub-writer";
    const infoSelector = ".cmt_info, .reply_info, .cmt_nickbox, .writer_info, .user_info";
    const unsafeFallbackSelector = "a, button, input, img, area, base, br, col, embed, hr, link, meta, param, source, track, wbr";

    const candidates = [];
    if (base === document || base?.nodeType === 9 || base?.nodeType === 11) {
      base.querySelectorAll?.(WRITER_SELECTOR).forEach((node) => candidates.push(node));
    } else if (base?.nodeType === 1) {
      if (base.matches?.(WRITER_SELECTOR)) candidates.push(base);
      base.querySelectorAll?.(WRITER_SELECTOR).forEach((node) => candidates.push(node));
    }

    candidates.forEach((node) => {
      const writer =
        (node.matches?.(authorSelector) ? node : null) ||
        node.closest?.(authorSelector) ||
        node.querySelector?.(authorSelector) ||
        node.closest?.(infoSelector) ||
        (node.matches?.(unsafeFallbackSelector) ? null : node);

      if (!writer || seen.has(writer)) return;
      seen.add(writer);
      out.push(writer);
    });

    return out;
  }

  function cleanupUnblockHost(host) {
    if (!host?.classList?.contains(UNBLOCK_HOST_CLASS)) return;
    if (!host.children.length && !host.textContent?.trim()) host.remove();
  }

  function clearUnblockControls() {
    document.querySelectorAll(`.${UNBLOCK_BUTTON_CLASS}`).forEach((button) => {
      const host = button.parentElement;
      button.remove();
      cleanupUnblockHost(host);
    });
  }

  function createUnblockIcon(state = "default") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const addPath = (d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    };

    if (state === "busy") {
      addPath("M13 8a5 5 0 1 1-1.46-3.54");
      addPath("M13 3.5v3h-3");
    } else if (state === "success") {
      addPath("M3.5 8.2 6.5 11 12.5 5");
    } else if (state === "error") {
      addPath("M8 2.25 14 13H2L8 2.25Z");
      addPath("M8 6v3.2");
      addPath("M8 11.5h.01");
    } else {
      addPath("M8 1.8 12.6 3.5v3.7c0 3-1.8 5.3-4.6 6.8-2.8-1.5-4.6-3.8-4.6-6.8V3.5L8 1.8Z");
      addPath("M5.7 5.7 10.3 10.3");
    }

    return svg;
  }

  function setUnblockButtonState(button, state = "default") {
    const safeState = ["busy", "success", "error"].includes(state) ? state : "default";
    const labels = {
      default: { status: "차단됨", action: "해제" },
      busy: { status: "처리 중", action: "" },
      success: { status: "해제됨", action: "" },
      error: { status: "실패", action: "재시도" }
    }[safeState];

    button.dataset.state = safeState === "default" ? "" : safeState;
    button.replaceChildren();

    const icon = document.createElement("span");
    icon.className = "dcb-userblock-unblock-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.appendChild(createUnblockIcon(safeState));

    const status = document.createElement("span");
    status.className = "dcb-userblock-unblock-status";
    status.textContent = labels.status;

    button.append(icon, status);

    if (labels.action) {
      const divider = document.createElement("span");
      divider.className = "dcb-userblock-unblock-divider";
      divider.setAttribute("aria-hidden", "true");

      const action = document.createElement("span");
      action.className = "dcb-userblock-unblock-action";
      action.textContent = labels.action;
      button.append(divider, action);
    }
  }

  function findUnblockOwner(writer) {
    const commentItem = writer.closest?.(
      "#focus_cmt li, .comment_wrap li, .cmt_list li, .reply_box li, .reply_list li, .dccon_comment_box li, li.ub-content"
    );
    if (commentItem && isInsideCommentRoot(commentItem)) return commentItem;

    return (
      findListContainer(writer) ||
      writer.closest?.(".gallview_head, .view_head, .writer_info, .user_info") ||
      writer.closest?.(".cmt_info, .reply_info, .cmt_nickbox") ||
      writer
    );
  }

  function unblockWriterRank(writer) {
    if (writer.matches?.(".gall_writer, .ub-writer")) return 4;
    if (writer.querySelector?.(":scope > .gall_writer, :scope > .ub-writer")) return 3;
    if (writer.closest?.(".gall_writer, .ub-writer")) return 2;
    if (writer.matches?.(".cmt_info, .reply_info, .cmt_nickbox, .writer_info, .user_info")) return 1;
    return 0;
  }

  function getUnblockRenderTarget(writer) {
    return (
      (writer.matches?.(".gall_writer, .ub-writer") ? writer : null) ||
      writer.querySelector?.(":scope > .gall_writer, :scope > .ub-writer") ||
      writer.querySelector?.(".gall_writer, .ub-writer") ||
      writer.closest?.(".gall_writer, .ub-writer") ||
      writer.closest?.(".cmt_info, .reply_info, .cmt_nickbox, .writer_info, .user_info") ||
      writer
    );
  }

  function placeUnblockHost(target, host) {
    if (!target || !host) return false;

    // Keep the control at the end of the author metadata lane. Inserting it
    // directly after the nickname can split UID/IP badges and make the chip
    // look as though it belongs to the comment body.
    if (target.matches?.(".gall_writer, .ub-writer")) {
      target.appendChild(host);
      return true;
    }

    const addbox = target.querySelector?.(":scope > .addbox");
    const anchor = target.querySelector?.(
      ":scope > .dcb-writer-tools, :scope > .addbox > .dcb-writer-tools, " +
      ":scope > .writer_nikcon, :scope > .nickname, :scope > .nick_name, :scope > .user_nick"
    );

    if (anchor) anchor.insertAdjacentElement("afterend", host);
    else if (addbox) addbox.appendChild(host);
    else {
      const fallback = target.matches?.("a, button") ? target.parentElement : target;
      if (!fallback || fallback.matches?.("input, img, area, base, br, col, embed, hr, link, meta, param, source, track, wbr")) {
        return false;
      }
      fallback.appendChild(host);
    }

    return true;
  }

  function ensureUnblockControlHost(writer, owner) {
    const target = getUnblockRenderTarget(writer);
    if (!target) return null;

    let host = owner?.querySelector?.(`.${UNBLOCK_HOST_CLASS}`) || null;
    if (!host) {
      host = document.createElement("span");
      host.className = UNBLOCK_HOST_CLASS;
    }

    if (!placeUnblockHost(target, host)) {
      cleanupUnblockHost(host);
      return null;
    }

    return host;
  }

  function collectUnblockGroups(matcher, base = document) {
    const groups = new Map();

    getCandidateWriters(base).forEach((writer) => {
      const tokens = findMatchedBlockedTokens(writer, matcher);
      if (!tokens.length) return;

      const owner = findUnblockOwner(writer);
      if (!owner) return;

      let group = groups.get(owner);
      if (!group) {
        group = { owner, writer, rank: unblockWriterRank(writer), tokens: new Set() };
        groups.set(owner, group);
      } else {
        const rank = unblockWriterRank(writer);
        if (rank > group.rank) {
          group.writer = writer;
          group.rank = rank;
        }
      }

      tokens.forEach((token) => group.tokens.add(token));
    });

    return [...groups.values()];
  }

  function applyUnblockControls(matcher, base = document, cleanup = true) {
    const activeButtons = new Set();

    if (!matcher.empty) {
      collectUnblockGroups(matcher, base).forEach(({ owner, writer, tokens: tokenSet }) => {
        const tokens = [...tokenSet];
        if (!tokens.length) return;

        const host = ensureUnblockControlHost(writer, owner);
        if (!host) return;
        host.dataset.dcbOwned = "userblock";
        let button = host.querySelector?.(`:scope > .${UNBLOCK_BUTTON_CLASS}`);

        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = UNBLOCK_BUTTON_CLASS;
          host.appendChild(button);
          setUnblockButtonState(button, "default");
        }

        button.dataset.token = tokens[0];
        button.dataset.tokens = JSON.stringify(tokens);
        button.dataset.defaultLabel = "차단됨 · 해제";
        button.title = tokens.length > 1
          ? `${tokens.length}개 차단 조건 모두 해제: ${tokens.join(", ")}`
          : `${tokens[0]} 차단 해제`;
        button.setAttribute("aria-label", `차단된 작성자. ${button.title}`);

        if (button.dataset.busy !== "1" && button.dataset.state !== "error") {
          setUnblockButtonState(button, "default");
        }
        activeButtons.add(button);
      });
    }

    if (!cleanup) return;

    document.querySelectorAll(`.${UNBLOCK_BUTTON_CLASS}`).forEach((button) => {
      if (activeButtons.has(button)) return;
      const host = button.parentElement;
      button.remove();
      cleanupUnblockHost(host);
    });
    document.querySelectorAll(`.${UNBLOCK_HOST_CLASS}`).forEach(cleanupUnblockHost);
  }

  function clearWriterBlockState(writer) {
    if (!writer) return;
    const targets = new Set();

    if (isInsideCommentRoot(writer)) {
      findCommentTargets(writer).forEach((target) => targets.add(target));
    } else {
      const listContainer = findListContainer(writer);
      const viewContainer = findViewContainer(writer);
      if (listContainer) targets.add(listContainer);
      if (viewContainer) targets.add(viewContainer);
    }

    targets.forEach((target) => target?.classList?.remove(BLOCKED_CLASS));
  }

  function applyDomBlocks(matcher, base = document, options = {}) {
    if (options.reset === true) clearDomBlocks();
    if (matcher.empty) return;

    getCandidateWriters(base).forEach((writer) => {
      if (options.reset !== true) clearWriterBlockState(writer);
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
      if (viewContainer) markBlocked(viewContainer);
    });
  }

  let applyGeneration = 0;
  let activeConf = null;
  let activeMatcher = buildMatcher([]);
  let debounceTimer = null;
  let incrementalTimer = null;
  const pendingRoots = new Set();

  function apply() {
    const generation = ++applyGeneration;
    chrome.storage.sync.get(DEFAULTS, async (raw) => {
      const conf = migrate(raw);

      try {
        conf.blockedUids = await readBlockedUids();
      } catch (_) {
        conf.blockedUids = [];
      }

      if (generation !== applyGeneration) return;

      activeConf = conf;
      activeMatcher = buildMatcher(conf.blockedUids || []);
      ensureStyle().textContent = buildCss(conf);
      pendingRoots.clear();

      if (!conf.userBlockEnabled) {
        clearDomBlocks();
        applyUnblockControls(activeMatcher, document, true);
        return;
      }

      clearUnblockControls();
      applyDomBlocks(activeMatcher, document, { reset: true });
    });
  }

  function scheduleApply(delay = 80) {
    applyGeneration += 1;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      apply();
    }, delay);
  }

  function isInternalUiNode(node) {
    if (!(node instanceof Element)) return false;
    return !!node.closest?.(
      `[data-dcb-owned='userblock'], .${UNBLOCK_HOST_CLASS}, .${UNBLOCK_BUTTON_CLASS}, ` +
      ".dcibx-actions, .dcibx-notice, .dcibx-overlay, #dcb-area-picker-overlay, #dcb-area-picker-guide"
    );
  }

  function flushIncrementalRoots() {
    incrementalTimer = null;
    if (!activeConf || !pendingRoots.size) return;

    const roots = Array.from(pendingRoots).filter((root) => root?.isConnected !== false);
    pendingRoots.clear();

    const minimalRoots = roots.filter((root, index) => {
      if (!(root instanceof Element)) return true;
      return !roots.some((other, otherIndex) => (
        index !== otherIndex && other instanceof Element && other.contains(root)
      ));
    });

    minimalRoots.forEach((root) => {
      if (activeConf.userBlockEnabled) {
        applyDomBlocks(activeMatcher, root, { reset: false });
      } else {
        applyUnblockControls(activeMatcher, root, false);
      }
    });
  }

  function queueIncrementalApply(root) {
    if (!root || isInternalUiNode(root)) return;
    pendingRoots.add(root);
    if (incrementalTimer) return;
    incrementalTimer = setTimeout(flushIncrementalRoots, 60);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }

  function requestUserBlockRemoval(tokens) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "dcb.userBlockRemoveMany", tokens }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "확장 프로그램 연결 실패"));
          return;
        }
        resolve(res);
      });
    });
  }

  document.addEventListener("click", async (event) => {
    const button = event.target?.closest?.(`.${UNBLOCK_BUTTON_CLASS}`);
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    let tokens = [];
    try {
      tokens = JSON.parse(button.dataset.tokens || "[]");
    } catch (_) {
      tokens = [];
    }
    if (!tokens.length && button.dataset.token) tokens = [button.dataset.token];
    if (!tokens.length || button.dataset.busy === "1") return;

    button.dataset.busy = "1";
    button.disabled = true;
    setUnblockButtonState(button, "busy");

    try {
      const res = await requestUserBlockRemoval(tokens);
      if (!res?.ok) throw new Error(res?.message || "차단 해제 실패");

      if (button.isConnected) setUnblockButtonState(button, "success");
      invalidateBlockedUidsCache();
      scheduleApply(0);
    } catch (_) {
      if (button.isConnected) {
        button.dataset.busy = "0";
        button.disabled = false;
        setUnblockButtonState(button, "error");
        setTimeout(() => {
          if (button.isConnected) setUnblockButtonState(button, "default");
        }, 1600);
      }
    }
  }, true);

  const mo = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === "attributes") {
        queueIncrementalApply(record.target);
        return;
      }
      record.addedNodes.forEach((node) => {
        if (node.nodeType === 1 || node.nodeType === 11) queueIncrementalApply(node);
      });
    });
  });

  const startMO = () => {
    if (document.body) {
      mo.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-uid", "data-full-uid", "data-ip", "data-nick", "data-memo-uid", "data-memo-ip", "title", "href"]
      });
    } else {
      document.addEventListener("DOMContentLoaded", startMO, { once: true });
    }
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
