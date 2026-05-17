/*****************************************************************
 * ctx-probe.js
 *****************************************************************/
(function () {
  const TOAST_ID = "dcb-instant-block-toast";
  const HINT_ID = "dcb-instant-block-hover-hint";
  const STYLE_ID = "dcb-instant-block-style";

  /*
    작성자 컨테이너와 작성자 내부 클릭 가능 요소를 분리한다.

  */
  const WRITER_CONTAINER_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    ".cmt_info"
  ].join(",");

  const AUTHOR_HIT_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    ".cmt_info",
    ".writer_nikcon",
    ".nickname",
    ".nick_name",
    ".dcb-writer-tools",
    ".dcb-user-memo-trigger",
    "[data-uid]",
    "[data-ip]",
    "[data-memo-uid]",
    "[data-memo-ip]"
  ].join(",");

  const closest = (el, sel) => (el && el.closest ? el.closest(sel) : null);

  let userBlockEnabledCache = true;

  try {
    chrome.storage.sync.get({ userBlockEnabled: true }, (res) => {
      userBlockEnabledCache = res?.userBlockEnabled !== false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.userBlockEnabled) {
        userBlockEnabledCache = changes.userBlockEnabled.newValue !== false;
      }
    });
  } catch (_) {
    userBlockEnabledCache = true;
  }

  function normalizeToken(v) {
    return String(v || "")
      .trim()
      .replace(/^\(|\)$/g, "")
      .trim();
  }

  function extractUidFromGallogText(text) {
    const s = String(text || "");
    const m = s.match(/gallog\.dcinside\.com\/?([A-Za-z0-9_\-]+)/i);
    return m ? m[1] : "";
  }

  function uidFromGallogReference(scope) {
    if (!scope) return "";

    const selfText = [
      scope.getAttribute?.("onclick"),
      scope.getAttribute?.("href"),
      scope.getAttribute?.("title")
    ].filter(Boolean).join(" ");

    let uid = extractUidFromGallogText(selfText);
    if (uid) return uid;

    const ref = scope.querySelector?.(
      '[onclick*="gallog.dcinside.com"], [href*="gallog.dcinside.com"], [title*="갤로그"]'
    );

    if (!ref) return "";

    const refText = [
      ref.getAttribute?.("onclick"),
      ref.getAttribute?.("href"),
      ref.getAttribute?.("title")
    ].filter(Boolean).join(" ");

    return extractUidFromGallogText(refText);
  }

  function ipPrefixFromText(scope) {
    if (!scope) return "";

    const ipEl =
      scope.querySelector?.(".ip") ||
      scope.querySelector?.(".refresherUserData.ip") ||
      null;

    const text = (ipEl?.textContent || scope.textContent || "").trim();
    const m = text.match(/\(?\b(\d{1,3}\.\d{1,3})\b\)?/);

    return m ? m[1] : "";
  }

  function readDataToken(scope, name) {
    if (!scope) return "";

    const own = scope.getAttribute?.(name) || "";
    if (own) return own;

    const child = scope.querySelector?.(`[${name}]`);
    return child?.getAttribute?.(name) || "";
  }

  function findActionableAuthorEl(start) {
    const hit = closest(start, AUTHOR_HIT_SELECTOR);
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

  function pickBlockToken(target) {
    const author = findActionableAuthorEl(target);
    if (!author) return "";

    let uid =
      readDataToken(author, "data-uid") ||
      readDataToken(author, "data-memo-uid") ||
      "";

    let ip =
      readDataToken(author, "data-ip") ||
      readDataToken(author, "data-memo-ip") ||
      "";

    if (!uid) uid = uidFromGallogReference(author);
    if (!ip) ip = ipPrefixFromText(author);

    return normalizeToken(uid || ip);
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
        display: flex;
        align-items: center;
        gap: 7px;
        max-width: 260px;
        padding: 8px 10px;
        border: 1px solid rgba(226, 232, 240, 0.92);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.96);
        color: #0f172a;
        box-shadow:
          0 14px 36px rgba(15, 23, 42, 0.16),
          0 2px 8px rgba(15, 23, 42, 0.06);
        backdrop-filter: blur(10px) saturate(1.06);
        -webkit-backdrop-filter: blur(10px) saturate(1.06);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.01em;
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px) scale(0.98);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      #${HINT_ID}.show {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      #${HINT_ID} .dcb-hover-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        background: #111827;
        color: #ffffff;
        font-size: 11px;
        font-weight: 900;
      }

      #${HINT_ID} .dcb-hover-muted {
        color: #64748b;
        font-weight: 700;
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

  function positionHoverHint(hint, author) {
    const rect = author.getBoundingClientRect();
    const pad = 8;
    const hintRect = hint.getBoundingClientRect();

    let top = rect.top - hintRect.height - 8;
    let left = rect.left + Math.min(12, Math.max(0, rect.width / 2 - 24));

    if (top < pad) top = rect.bottom + 8;
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

  function showHoverHint(author) {
    if (!userBlockEnabledCache || !author || activeHoverAuthor === author) return;

    ensureToastStyle();
    activeHoverAuthor = author;

    const prev = document.getElementById(HINT_ID);
    if (prev) prev.remove();

    const hint = document.createElement("div");
    hint.id = HINT_ID;
    hint.innerHTML = `
      <span class="dcb-hover-dot">↗</span>
      <span>우클릭 즉시 차단 <span class="dcb-hover-muted">· 작성자 영역</span></span>
    `;

    (document.body || document.documentElement).appendChild(hint);
    positionHoverHint(hint, author);
    requestAnimationFrame(() => hint.classList.add("show"));
  }

  function scheduleHoverHint(target) {
    const author = findActionableAuthorEl(target);

    if (!author || !pickBlockToken(author)) {
      activeHoverAuthor = null;
      if (hoverHintTimer) clearTimeout(hoverHintTimer);
      hideHoverHint();
      return;
    }

    if (activeHoverAuthor === author) return;
    if (hoverHintTimer) clearTimeout(hoverHintTimer);

    hoverHintTimer = setTimeout(() => {
      showHoverHint(author);
    }, 220);
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

  document.addEventListener(
    "contextmenu",
    (e) => {
      const token = pickBlockToken(e.target);

      if (!token) {
        return;
      }

      // 작성자 영역 우클릭은 확장 기능으로 사용하고, 브라우저 기본 메뉴는 열지 않는다.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();

      sendInstantBlock(token);
    },
    { capture: true }
  );
})();
