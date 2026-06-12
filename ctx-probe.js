/*****************************************************************
 * ctx-probe.js
 *****************************************************************/
(function () {
  const TOAST_ID = "dcb-instant-block-toast";
  const HINT_ID = "dcb-instant-block-hover-hint";
  const STYLE_ID = "dcb-instant-block-style";

  /*
    작성자 정보를 실제로 가지고 있거나, 작성자 정보 추출 범위로 삼을 컨테이너.
    .cmt_info는 댓글 작성자 영역에서 닉네임/갤로그/메모 버튼의 형제 요소까지
    함께 읽어 UID/IP를 얻기 위해 유지한다.
  */
  const WRITER_CONTAINER_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    ".cmt_info",
    ".cmt_nickbox",
    ".reply_info",
    ".writer_info",
    ".user_info",
    "td.gall_writer"
  ].join(",");

  /*
    실제로 마우스를 올렸을 때 안내 팝업이 떠야 하는 작성자 조작부.
    댓글 본문(.cmt_txtbox, .usertxt, .ub-word 등)은 절대 포함하지 않는다.
  */
  const AUTHOR_HIT_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    "td.gall_writer",
    ".nickname",
    ".nickname em",
    ".nick_name",
    ".user_nick",
    ".writer_nikcon",
    ".refresherUserData",
    ".ip",
    ".dcb-writer-tools",
    ".dcb-user-memo-trigger",
    ".dcb-uid-badge",
    "[data-uid]",
    "[data-ip]",
    "[data-memo-uid]",
    "[data-memo-ip]",
    '[onclick*="gallog.dcinside.com"]',
    '[href*="gallog.dcinside.com"]',
    '[title*="갤로그"]'
  ].join(",");

  /*
    댓글/본문 텍스트 영역.
    이 영역에서는 상위에 data-uid/data-ip가 있더라도 작성자 hover/right-click으로 보지 않는다.
  */
  const NON_AUTHOR_TEXT_SELECTOR = [
    ".cmt_txtbox",
    ".usertxt",
    ".ub-word",
    ".write_div",
    ".dccon_comment_box",
    ".comment_dccon"
  ].join(",");

  const closest = (el, sel) => (el && el.closest ? el.closest(sel) : null);

  const USER_BLOCK_TRIGGER_MODES = new Set(["instant", "contextMenu"]);
  const LEGACY_CONTEXT_TOKEN_TTL = 8000;

  let userBlockEnabledCache = true;
  let userBlockTriggerModeCache = "instant";
  let userBlockHoverHintEnabledCache = true;
  let lastContextBlockToken = "";
  let lastContextBlockAt = 0;

  function normalizeUserBlockTriggerMode(v) {
    return USER_BLOCK_TRIGGER_MODES.has(v) ? v : "instant";
  }

  function isHoverHintEffective() {
    return (
      userBlockEnabledCache &&
      userBlockTriggerModeCache === "instant" &&
      userBlockHoverHintEnabledCache
    );
  }

  try {
    chrome.storage.sync.get(
      {
        userBlockEnabled: true,
        userBlockTriggerMode: "instant",
        userBlockHoverHintEnabled: true
      },
      (res) => {
        userBlockEnabledCache = res?.userBlockEnabled !== false;
        userBlockTriggerModeCache = normalizeUserBlockTriggerMode(res?.userBlockTriggerMode);
        userBlockHoverHintEnabledCache = res?.userBlockHoverHintEnabled !== false;
      }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;

      if (changes.userBlockEnabled) {
        userBlockEnabledCache = changes.userBlockEnabled.newValue !== false;
        if (!isHoverHintEffective()) hideHoverHint();
      }

      if (changes.userBlockTriggerMode) {
        userBlockTriggerModeCache = normalizeUserBlockTriggerMode(changes.userBlockTriggerMode.newValue);
        hideHoverHint();
      }

      if (changes.userBlockHoverHintEnabled) {
        userBlockHoverHintEnabledCache = changes.userBlockHoverHintEnabled.newValue !== false;
        if (!isHoverHintEffective()) hideHoverHint();
      }
    });
  } catch (_) {
    userBlockEnabledCache = true;
    userBlockTriggerModeCache = "instant";
    userBlockHoverHintEnabledCache = true;
  }

  function normalizeToken(v) {
    return String(v || "")
      .trim()
      .replace(/^\(|\)$/g, "")
      .trim();
  }

  function isIpLike(v) {
    return /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(v || "").trim());
  }

  function normalizeUidCandidate(v) {
    const s = normalizeToken(v)
      .replace(/^@+/, "")
      .replace(/[\s\)\]>'";]+$/g, "")
      .trim();

    if (!s || isIpLike(s)) return "";
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(s)) return "";
    return s;
  }

  function normalizeIpPrefix(v) {
    const s = normalizeToken(v);
    const m = s.match(/\b(\d{1,3}\.\d{1,3})(?:\.\d{1,3}){0,2}\b/);
    return m ? m[1] : "";
  }

  function extractUidFromGallogText(text) {
    const s = String(text || "");

    const direct = s.match(/gallog\.dcinside\.com\/?([A-Za-z0-9._-]+)/i);
    if (direct) return normalizeUidCandidate(direct[1]);

    const encoded = s.match(/gallog\.dcinside\.com[^A-Za-z0-9._-]+([A-Za-z0-9._-]{2,64})/i);
    if (encoded) return normalizeUidCandidate(encoded[1]);

    const fnArg = s.match(/(?:go_?gallog|gallog|user_id|userid|uid)\s*(?:\(|=|:)\s*['"]?([A-Za-z0-9._-]{2,64})/i);
    if (fnArg) return normalizeUidCandidate(fnArg[1]);

    return "";
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

  function uidFromRefresherData(scope) {
    if (!scope) return "";

    const ref =
      scope.matches?.(".refresherUserData")
        ? scope
        : scope.querySelector?.(".refresherUserData");

    if (!ref) return "";

    const fromTitle = normalizeUidCandidate(ref.getAttribute?.("title") || "");
    if (fromTitle) return fromTitle;

    const fromData = normalizeUidCandidate(textFromAttrs(ref));
    if (fromData) return fromData;

    const text = ref.textContent || "";
    const m = text.match(/\(([A-Za-z0-9._-]{2,64})\)/);
    return m ? normalizeUidCandidate(m[1]) : normalizeUidCandidate(text);
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

  function uidFromGallogReference(scope) {
    if (!scope) return "";

    const selfText = textFromAttrs(scope);
    let uid = extractUidFromGallogText(selfText);
    if (uid) return uid;

    const ref = scope.querySelector?.(
      '[onclick*="gallog.dcinside.com"], [href*="gallog.dcinside.com"], [title*="갤로그"], [alt*="갤로그"]'
    );

    if (!ref) return "";

    const refText = textFromAttrs(ref);
    uid = extractUidFromGallogText(refText);
    return uid || "";
  }

  function ipPrefixFromText(scope) {
    if (!scope) return "";

    const ipEl =
      scope.matches?.(".ip, .refresherUserData.ip")
        ? scope
        : (scope.querySelector?.(".ip") ||
           scope.querySelector?.(".refresherUserData.ip") ||
           scope.querySelector?.('[data-ip]') ||
           null);

    const attrText = [textFromAttrs(scope), textFromAttrs(ipEl)].filter(Boolean).join(" ");
    const fromAttr = normalizeIpPrefix(attrText);
    if (fromAttr) return fromAttr;

    const text = (ipEl?.textContent || scope.textContent || "").trim();
    return normalizeIpPrefix(text);
  }

  function readDataToken(scope, name) {
    if (!scope) return "";

    const own = scope.getAttribute?.(name) || "";
    if (own) return own;

    const child = scope.querySelector?.(`[${name}]`);
    return child?.getAttribute?.(name) || "";
  }

  function getAuthorHitElement(start) {
    if (!(start instanceof Element)) return null;

    const hit = closest(start, AUTHOR_HIT_SELECTOR);
    if (!hit) return null;

    /*
      댓글 본문 내부에서 발생한 이벤트가 상위 data-uid/data-ip 컨테이너로
      끌려 올라가 작성자 hover/right-click으로 오인되는 것을 막는다.
    */
    const textBox = closest(start, NON_AUTHOR_TEXT_SELECTOR);
    if (textBox && !textBox.contains(hit)) return null;

    return hit;
  }

  function findActionableAuthorEl(start) {
    const hit = getAuthorHitElement(start);
    if (!hit) return null;

    const writerContainer = closest(hit, WRITER_CONTAINER_SELECTOR);
    if (writerContainer) return writerContainer;

    const dataOwner = closest(hit, "[data-uid], [data-ip], [data-memo-uid], [data-memo-ip]");
    if (dataOwner) return dataOwner;

    if (hit.matches?.(".writer_nikcon")) {
      return closest(hit, ".addbox, .writer_info, .user_info") || hit;
    }

    return hit;
  }

  function extractBlockToken(author) {
    if (!author) return "";

    let uid =
      normalizeUidCandidate(readDataToken(author, "data-uid")) ||
      normalizeUidCandidate(readDataToken(author, "data-memo-uid")) ||
      normalizeUidCandidate(readDataToken(author, "data-user-id")) ||
      normalizeUidCandidate(readDataToken(author, "data-userid")) ||
      normalizeUidCandidate(readDataToken(author, "data-user_id")) ||
      uidFromBadge(author) ||
      uidFromRefresherData(author) ||
      uidFromGallogReference(author) ||
      "";

    let ip =
      normalizeIpPrefix(readDataToken(author, "data-ip")) ||
      normalizeIpPrefix(readDataToken(author, "data-memo-ip")) ||
      ipPrefixFromText(author) ||
      "";

    return normalizeToken(uid || ip);
  }

  function pickBlockToken(target) {
    const author = findActionableAuthorEl(target);
    return extractBlockToken(author);
  }

  function ensureToastStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TOAST_ID},
      #${TOAST_ID} * {
        box-sizing: border-box;
      }

      #${TOAST_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 40px));
        padding: 14px 15px;
        border: 1px solid rgba(226, 232, 240, 0.95);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.96);
        color: #0f172a;
        box-shadow:
          0 22px 60px rgba(15, 23, 42, 0.18),
          0 2px 10px rgba(15, 23, 42, 0.06);
        backdrop-filter: blur(12px) saturate(1.08);
        -webkit-backdrop-filter: blur(12px) saturate(1.08);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
        transform: translateY(8px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 150ms ease, transform 150ms ease;
      }

      #${TOAST_ID}.show {
        transform: translateY(0);
        opacity: 1;
      }

      #${TOAST_ID} .dcb-toast-row {
        display: flex;
        gap: 11px;
        align-items: flex-start;
      }

      #${TOAST_ID} .dcb-toast-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: #111827;
        color: #ffffff;
        font-size: 15px;
        font-weight: 900;
        line-height: 1;
      }

      #${TOAST_ID}.muted .dcb-toast-icon {
        background: #64748b;
      }

      #${TOAST_ID}.error .dcb-toast-icon {
        background: #dc2626;
      }

      #${TOAST_ID} .dcb-toast-title {
        margin: 0;
        color: #020617;
        font-size: 14px;
        font-weight: 850;
        line-height: 1.35;
        letter-spacing: -0.02em;
      }

      #${TOAST_ID} .dcb-toast-desc {
        margin: 3px 0 0;
        color: #64748b;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.5;
        letter-spacing: -0.01em;
      }

      #${TOAST_ID} .dcb-toast-token {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        color: #0f172a;
        font-weight: 800;
        word-break: break-all;
      }

      #${HINT_ID},
      #${HINT_ID} * {
        box-sizing: border-box;
      }

      #${HINT_ID} {
        position: fixed;
        z-index: 2147483646;
        width: 286px;
        padding: 12px 13px;
        border: 1px solid rgba(203, 213, 225, 0.96);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.98);
        color: #0f172a;
        box-shadow:
          0 18px 46px rgba(15, 23, 42, 0.18),
          0 3px 12px rgba(15, 23, 42, 0.07);
        backdrop-filter: blur(12px) saturate(1.08);
        -webkit-backdrop-filter: blur(12px) saturate(1.08);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
        pointer-events: none;
        opacity: 0;
        transform: translateY(5px) scale(0.98);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      #${HINT_ID}.show {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      #${HINT_ID} .dcb-hover-head {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      #${HINT_ID} .dcb-hover-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        border-radius: 999px;
        background: #111827;
        color: #ffffff;
        font-size: 13px;
        font-weight: 900;
        line-height: 1;
      }

      #${HINT_ID} .dcb-hover-title-wrap {
        min-width: 0;
      }

      #${HINT_ID} .dcb-hover-title {
        margin: 0;
        color: #020617;
        font-size: 13px;
        font-weight: 900;
        line-height: 1.25;
        letter-spacing: -0.02em;
      }

      #${HINT_ID} .dcb-hover-subtitle {
        margin: 2px 0 0;
        color: #64748b;
        font-size: 11px;
        font-weight: 750;
        line-height: 1.25;
        letter-spacing: -0.01em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${HINT_ID} .dcb-hover-body {
        margin: 9px 0 0;
        color: #334155;
        font-size: 12px;
        font-weight: 650;
        line-height: 1.45;
        letter-spacing: -0.01em;
      }

      #${HINT_ID} .dcb-hover-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 9px;
        padding: 6px 8px;
        border-radius: 10px;
        background: #f1f5f9;
        color: #0f172a;
        font-size: 11px;
        font-weight: 850;
        line-height: 1;
        letter-spacing: -0.01em;
      }

      #${HINT_ID} .dcb-hover-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 42px;
        height: 20px;
        padding: 0 7px;
        border: 1px solid rgba(148, 163, 184, 0.75);
        border-bottom-width: 2px;
        border-radius: 7px;
        background: #ffffff;
        color: #020617;
        font-size: 11px;
        font-weight: 900;
        line-height: 1;
      }

      #${HINT_ID} .dcb-hover-token {
        display: block;
        margin-top: 7px;
        color: #64748b;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 10.5px;
        font-weight: 800;
        line-height: 1.3;
        word-break: break-all;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function escapeHtml(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  let toastTimer = null;

  function showToast({ title, desc, token, variant = "success" }) {
    ensureToastStyle();

    const prev = document.getElementById(TOAST_ID);
    if (prev) prev.remove();
    if (toastTimer) clearTimeout(toastTimer);

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = variant;

    const icon = variant === "error" ? "!" : variant === "muted" ? "i" : "✓";
    const tokenHtml = token
      ? `<span class="dcb-toast-token">${escapeHtml(token)}</span>`
      : "";

    toast.innerHTML = `
      <div class="dcb-toast-row">
        <span class="dcb-toast-icon">${icon}</span>
        <div>
          <p class="dcb-toast-title">${escapeHtml(title)}</p>
          <p class="dcb-toast-desc">${tokenHtml}${tokenHtml ? " · " : ""}${escapeHtml(desc)}</p>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));

    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 180);
    }, 1900);
  }

  let hoverHintTimer = null;
  let activeHoverAuthor = null;

  function positionHoverHint(hint, anchor) {
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    const hintRect = hint.getBoundingClientRect();

    let top = rect.top - hintRect.height - 9;
    let left = rect.left + Math.min(12, Math.max(0, rect.width / 2 - 24));

    if (top < pad) top = rect.bottom + 9;
    if (left + hintRect.width > window.innerWidth - pad) {
      left = window.innerWidth - hintRect.width - pad;
    }
    if (left < pad) left = pad;

    hint.style.top = `${Math.round(top)}px`;
    hint.style.left = `${Math.round(left)}px`;
  }

  function hideHoverHint() {
    const hint = document.getElementById(HINT_ID);
    if (!hint) return;

    hint.classList.remove("show");
    setTimeout(() => {
      if (!hint.classList.contains("show")) hint.remove();
    }, 140);
  }

  function showHoverHint({ author, hit, token }) {
    if (
      !isHoverHintEffective() ||
      !author ||
      !hit ||
      activeHoverAuthor === author
    ) {
      return;
    }

    ensureToastStyle();
    activeHoverAuthor = author;

    const prev = document.getElementById(HINT_ID);
    if (prev) prev.remove();

    const title = "작성자 즉시 차단";
    const subtitle = "이 작성자를 바로 차단할 수 있습니다";
    const body = "이 영역을 <b>우클릭</b>하면 해당 사용자를 차단 목록에 추가합니다.";
    const action = "차단 목록에 추가";

    const hint = document.createElement("div");
    hint.id = HINT_ID;
    hint.innerHTML = `
      <div class="dcb-hover-head">
        <span class="dcb-hover-icon">🚫</span>
        <div class="dcb-hover-title-wrap">
          <p class="dcb-hover-title">${escapeHtml(title)}</p>
          <p class="dcb-hover-subtitle">${escapeHtml(subtitle)}</p>
        </div>
      </div>
      <p class="dcb-hover-body">
        ${body}
      </p>
      <span class="dcb-hover-action">
        <span class="dcb-hover-key">우클릭</span>
        ${escapeHtml(action)}
      </span>
      ${token ? `<span class="dcb-hover-token">대상: ${escapeHtml(token)}</span>` : ""}
    `;

    (document.body || document.documentElement).appendChild(hint);
    positionHoverHint(hint, hit);
    requestAnimationFrame(() => hint.classList.add("show"));
  }

  function scheduleHoverHint(target) {
    if (!isHoverHintEffective()) {
      activeHoverAuthor = null;
      if (hoverHintTimer) clearTimeout(hoverHintTimer);
      hideHoverHint();
      return;
    }

    const hit = getAuthorHitElement(target);
    const author = findActionableAuthorEl(target);
    const token = extractBlockToken(author);

    if (!hit || !author || !token) {
      activeHoverAuthor = null;
      if (hoverHintTimer) clearTimeout(hoverHintTimer);
      hideHoverHint();
      return;
    }

    if (activeHoverAuthor === author) return;
    if (hoverHintTimer) clearTimeout(hoverHintTimer);

    hoverHintTimer = setTimeout(() => {
      showHoverHint({ author, hit, token });
    }, 180);
  }

  function sendInstantBlock(token) {
    chrome.runtime.sendMessage(
      {
        type: "dcb.instantCtxBlock",
        token
      },
      (res) => {
        if (chrome.runtime.lastError) {
          showToast({
            title: "차단 실패",
            desc: "확장 프로그램을 다시 로드한 뒤 시도해 주세요.",
            token,
            variant: "error"
          });
          return;
        }

        if (!res?.ok) {
          showToast({
            title: "차단할 수 없음",
            desc: "작성자 정보를 찾지 못했습니다.",
            token,
            variant: "error"
          });
          return;
        }

        if (!res.userBlockEnabled) {
          showToast({
            title: res.added ? "차단 목록에 추가됨" : "이미 차단된 이용자",
            desc: "사용자 차단 기능이 꺼져 있습니다.",
            token: res.token || token,
            variant: "muted"
          });
          return;
        }

        showToast({
          title: res.added ? "차단 완료" : "이미 차단된 이용자",
          desc: "글과 댓글이 자동으로 숨김 처리됩니다.",
          token: res.token || token,
          variant: "success"
        });
      }
    );
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      scheduleHoverHint(e.target);
    },
    { capture: true }
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      const author = findActionableAuthorEl(e.target);
      if (!author) return;

      const next = e.relatedTarget;
      if (next && author.contains(next)) return;

      activeHoverAuthor = null;
      if (hoverHintTimer) clearTimeout(hoverHintTimer);
      hideHoverHint();
    },
    { capture: true }
  );

  window.addEventListener(
    "scroll",
    () => {
      activeHoverAuthor = null;
      hideHoverHint();
    },
    { passive: true }
  );

  function rememberLegacyContextToken(token) {
    lastContextBlockToken = token || "";
    lastContextBlockAt = lastContextBlockToken ? Date.now() : 0;
  }

  function runLegacyContextBlock() {
    const fresh = lastContextBlockToken && Date.now() - lastContextBlockAt <= LEGACY_CONTEXT_TOKEN_TTL;

    if (!fresh) {
      showToast({
        title: "차단할 수 없음",
        desc: "닉네임 위에서 다시 우클릭한 뒤 메뉴를 눌러주세요.",
        variant: "error"
      });
      return;
    }

    sendInstantBlock(lastContextBlockToken);
  }

  document.addEventListener(
    "contextmenu",
    (e) => {
      const author = findActionableAuthorEl(e.target);
      if (!author) return;

      const token = extractBlockToken(author);

      if (!token) {
        rememberLegacyContextToken("");

        if (userBlockTriggerModeCache === "instant") {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();

          showToast({
            title: "차단할 수 없음",
            desc: "이 작성자 영역에서 UID/IP를 찾지 못했습니다.",
            variant: "error"
          });
        }

        return;
      }

      if (userBlockTriggerModeCache === "contextMenu") {
        rememberLegacyContextToken(token);
        return;
      }

      // 즉시 차단 모드에서는 작성자 영역 우클릭을 확장 기능으로 사용한다.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();

      sendInstantBlock(token);
    },
    { capture: true }
  );

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "dcb.legacyContextUserBlock") return;
    runLegacyContextBlock();
  });
})();
