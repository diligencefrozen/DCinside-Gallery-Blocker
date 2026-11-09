// access-guard.js
(() => {
  const REDIRECT_URL = "https://www.dcinside.com/";
  const STYLE_ID = "dcb-access-guard-style";
  const OVERLAY_ID = "dcb-access-guard-overlay";
  const BLOCKED_CLASS = "dcb-access-guard-blocked";
  const TEMP_ALLOW_KEY = "dcb-temp-allow";

  /*
    기본 차단은 실시간베스트만.
    무출산 갤러리/asdf12 같은 것은 사용자가 blockedIds에 추가한 값으로 처리한다.
  */
  const BUILTIN_DCBEST_ID = "dcbest";

  const DEFAULTS = {
    galleryBlockEnabled: undefined,
    enabled: true,
    blockMode: "smart",
    builtinDcbestBlockEnabled: true,
    blockedIds: [],
    delay: 0
  };

  let settings = {
    enabled: true,
    blockMode: "smart",
    delay: 0,
    builtinDcbestBlockEnabled: true,
    blockedSet: new Set([BUILTIN_DCBEST_ID]),
    userBlockedSet: new Set()
  };

  let redirectTimer = null;
  let lastRedirectHref = "";

  function norm(v) {
    return String(v || "").trim().toLowerCase();
  }

  function escapeHtml(v) {
    return String(v || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function clampDelay(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(10, n));
  }

  /*
    사용자가 차단 목록에 아래 둘 중 무엇을 넣어도 ID만 추출한다.

    1) asdf12
    2) https://gall.dcinside.com/mgallery/board/lists?id=asdf12
  */
  function extractGalleryId(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";

    if (/^id\s*=\s*/i.test(raw)) {
      return norm(raw.replace(/^id\s*=\s*/i, "").split(/[&#?\s]/)[0]);
    }

    if (/^[a-z0-9_-]+$/i.test(raw)) {
      return norm(raw);
    }

    try {
      const url = new URL(raw, location.href);

      if (!url.hostname.endsWith("dcinside.com")) {
        return norm(raw);
      }

      const id = url.searchParams.get("id");
      if (id) return norm(id);

      const pathMatch = url.pathname.match(/^\/(?:mgallery|mini|person)\/([^/?#]+)/i);
      if (pathMatch?.[1]) return norm(pathMatch[1]);

      return "";
    } catch {
      return norm(raw)
        .replace(/^id=/i, "")
        .split(/[?#&\s]/)[0]
        .trim();
    }
  }

  function getGalleryIdFromUrl(urlLike = location.href) {
    try {
      const url = new URL(urlLike, location.href);

      if (!url.hostname.endsWith("dcinside.com")) return "";

      const id = url.searchParams.get("id");
      if (id) return norm(id);

      const pathMatch = url.pathname.match(/^\/(?:mgallery|mini|person)\/([^/?#]+)/i);
      if (pathMatch?.[1]) return norm(pathMatch[1]);

      return "";
    } catch {
      return "";
    }
  }

  function getUserBlockedGalleryIds(blockedIds) {
    return Array.isArray(blockedIds)
      ? blockedIds.map(extractGalleryId).filter(Boolean)
      : [];
  }

  function getBuiltinBlockedGalleryIds(builtinDcbestBlockEnabled = true) {
    return builtinDcbestBlockEnabled === false ? [] : [BUILTIN_DCBEST_ID];
  }

  function getAllBlockedGalleryIds(blockedIds, builtinDcbestBlockEnabled = true) {
    return Array.from(
      new Set([
        ...getBuiltinBlockedGalleryIds(builtinDcbestBlockEnabled)
          .map(extractGalleryId)
          .filter(Boolean),
        ...getUserBlockedGalleryIds(blockedIds)
      ])
    );
  }

  function isBlockedGallery(gid) {
    gid = norm(gid);
    if (!gid) return false;
    return settings.blockedSet.has(gid);
  }

  function isBuiltinDcbestBlocked(gid) {
    return norm(gid) === BUILTIN_DCBEST_ID && settings.builtinDcbestBlockEnabled !== false;
  }

  function getUnblockButtonHtml(gid) {
    const id = norm(gid);
    const buttons = [];

    if (settings.userBlockedSet.has(id)) {
      buttons.push('<button type="button" class="dcb-access-btn" data-act="unblock">내 목록에서 차단 해제</button>');
    }

    if (isBuiltinDcbestBlocked(id)) {
      buttons.push('<button type="button" class="dcb-access-btn" data-act="disable-dcbest">실시간베스트 차단 끄기</button>');
    }

    return buttons.join("");
  }

  function unblockGallery(gid) {
    const id = norm(gid);
    if (!id) return;

    clearRedirectTimer();

    globalThis.DCBRuntimeSettingsCache.get({ blockedIds: [] }, ({ blockedIds }) => {
      const normalized = getUserBlockedGalleryIds(blockedIds);
      const next = Array.from(new Set(normalized.filter((blockedId) => blockedId !== id)));

      chrome.storage.sync.set({ blockedIds: next }, () => {
        if (chrome.runtime.lastError) return;

        settings.userBlockedSet = new Set(next);
        settings.blockedSet = new Set(getAllBlockedGalleryIds(next, settings.builtinDcbestBlockEnabled));
        clearBlockedOverlay();
        loadSettingsThenEnforce();
      });
    });
  }

  function disableBuiltinDcbestBlock() {
    clearRedirectTimer();

    chrome.storage.sync.set({ builtinDcbestBlockEnabled: false }, () => {
      if (chrome.runtime.lastError) return;

      settings.builtinDcbestBlockEnabled = false;
      settings.blockedSet = new Set(
        getAllBlockedGalleryIds(Array.from(settings.userBlockedSet), false)
      );
      clearBlockedOverlay();
      loadSettingsThenEnforce();
    });
  }

  function clearRedirectTimer() {
    if (redirectTimer) {
      clearInterval(redirectTimer);
      redirectTimer = null;
    }
  }

  function getTempAllowedIds() {
    try {
      const raw = sessionStorage.getItem(TEMP_ALLOW_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(norm).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function isTempAllowed(gid) {
    return getTempAllowedIds().includes(norm(gid));
  }

  function addTempAllow(gid) {
    try {
      const id = norm(gid);
      if (!id) return;

      const next = Array.from(new Set([...getTempAllowedIds(), id]));
      sessionStorage.setItem(TEMP_ALLOW_KEY, JSON.stringify(next));
    } catch {}
  }

  /*
    이전 버전 access-guard.js가 남긴 inline style 복구.
    직접 지정했던 값과 일치할 때만 제거한다.
  */
  function cleanupLegacyInlineStyles() {
    try {
      const html = document.documentElement;

      if (html.style.background === "rgb(2, 6, 23)" || html.style.background === "#020617") {
        html.style.background = "";
      }

      if (html.style.color === "rgb(248, 250, 252)" || html.style.color === "#f8fafc") {
        html.style.color = "";
      }
    } catch {}
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      html.${BLOCKED_CLASS}, html.${BLOCKED_CLASS} body { overflow: hidden !important; }

      #${OVERLAY_ID} {
        --guard-surface: #fff;
        --guard-text: #202124;
        --guard-muted: #535963;
        --guard-line: #dce1e8;
        --guard-accent: #0b57d0;
        --guard-on-accent: #fff;
        --guard-accent-hover: #0849b4;
        --guard-tonal: #e9f0ff;
        color-scheme: light;
        position: fixed;
        inset: 0;
        width: min(440px, calc(100% - 32px));
        max-width: none;
        max-height: calc(100dvh - 32px);
        box-sizing: border-box;
        overflow: auto;
        overscroll-behavior: contain;
        margin: auto;
        padding: 28px;
        border: 1px solid var(--guard-line);
        border-radius: 24px;
        background: var(--guard-surface);
        color: var(--guard-text);
        box-shadow: 0 8px 32px rgba(31, 41, 55, .12), 0 1px 4px rgba(31, 41, 55, .06);
        font: 14px/1.6 Roboto, "Segoe UI", "Malgun Gothic", sans-serif;
        text-align: start;
      }
      #${OVERLAY_ID}::backdrop { background: #edf0f5; }
      html:is(:has(#css-darkmode), [data-theme="dark"], :has(> body.dark)) #${OVERLAY_ID} {
        --guard-surface: #25282d;
        --guard-text: #e8eaed;
        --guard-muted: #bdc1c6;
        --guard-line: #454950;
        --guard-accent: #a8c7fa;
        --guard-on-accent: #062e6f;
        --guard-accent-hover: #c2d8fc;
        --guard-tonal: #303e54;
        color-scheme: dark;
      }
      html:is(:has(#css-darkmode), [data-theme="dark"], :has(> body.dark)) #${OVERLAY_ID}::backdrop { background: #191b1f; }
      #${OVERLAY_ID} .dcb-access-context { display: flex; align-items: center; gap: 12px; }
      #${OVERLAY_ID} .dcb-access-icon {
        width: 44px; height: 44px; flex: none; border-radius: 14px;
        display: grid; place-items: center; background: var(--guard-tonal); color: var(--guard-accent);
      }
      #${OVERLAY_ID} .dcb-access-icon::before, #${OVERLAY_ID} .dcb-access-icon::after {
        content: ""; grid-area: 1 / 1; box-sizing: border-box; border: 2px solid currentColor;
      }
      #${OVERLAY_ID} .dcb-access-icon::before { width: 12px; height: 11px; border-radius: 7px 7px 0 0; transform: translateY(-5px); }
      #${OVERLAY_ID} .dcb-access-icon::after { width: 20px; height: 14px; border-radius: 4px; background: var(--guard-tonal); transform: translateY(4px); }
      #${OVERLAY_ID} .dcb-access-id { min-width: 0; font-size: 12px; color: var(--guard-muted); }
      #${OVERLAY_ID} .dcb-access-id bdi { display: block; font: 600 14px/1.4 ui-monospace, Consolas, monospace; color: var(--guard-text); overflow-wrap: anywhere; }
      #${OVERLAY_ID} h1 { margin: 22px 0 8px; font-family: inherit; font-size: 24px; font-weight: 600; line-height: 1.4; letter-spacing: -.03em; color: var(--guard-text); }
      #${OVERLAY_ID} p { margin: 0; font: inherit; color: var(--guard-muted); word-break: keep-all; overflow-wrap: anywhere; }
      #${OVERLAY_ID} .dcb-access-actions, #${OVERLAY_ID} .dcb-access-manage { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      #${OVERLAY_ID} .dcb-access-actions { justify-content: flex-end; margin-top: 26px; }
      #${OVERLAY_ID} .dcb-access-manage { margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--guard-line); }
      #${OVERLAY_ID} .dcb-access-btn {
        appearance: none; min-height: 40px; padding: 0 16px; border: 1px solid var(--guard-line); border-radius: 20px;
        font: inherit; font-weight: 600; background: transparent; color: var(--guard-accent); cursor: pointer;
      }
      #${OVERLAY_ID} .dcb-access-btn:hover { background: var(--guard-tonal); }
      #${OVERLAY_ID} .dcb-access-btn.primary { background: var(--guard-accent); border-color: transparent; color: var(--guard-on-accent); }
      #${OVERLAY_ID} .dcb-access-btn.primary:hover { background: var(--guard-accent-hover); }
      #${OVERLAY_ID} .dcb-access-manage button { min-height: 36px; padding: 0 8px; border-color: transparent; font-size: 13px; color: var(--guard-muted); }
      #${OVERLAY_ID} button:focus-visible { outline: 2px solid var(--guard-accent); outline-offset: 2px; }
      @media (max-width: 400px) {
        #${OVERLAY_ID} { padding: 22px; border-radius: 20px; }
        #${OVERLAY_ID} .dcb-access-actions button { flex: 1 1 auto; }
      }
    `;

    (document.head || document.documentElement).appendChild(st);
  }

  function showAccessDialog(gid, mode, seconds = 0) {
    ensureStyle();
    cleanupLegacyInlineStyles();
    document.documentElement.classList.add(BLOCKED_CLASS);

    let dialog = document.getElementById(OVERLAY_ID);
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = OVERLAY_ID;
      dialog.dataset.dcbOwned = "access-guard";
      dialog.setAttribute("aria-labelledby", "dcb-access-title");
      dialog.setAttribute("aria-describedby", "dcb-access-id dcb-access-desc");
      dialog.addEventListener("cancel", (event) => event.preventDefault());
      (document.body || document.documentElement).appendChild(dialog);
    }

    const previousAction = dialog.contains(document.activeElement) && document.activeElement.dataset.act;
    const builtin = isBuiltinDcbestBlocked(gid);
    let reason = "내 차단 목록에 등록되어 있습니다.";
    if (builtin) {
      reason = settings.userBlockedSet.has(norm(gid))
        ? "내 차단 목록과 실시간베스트 차단 설정이 모두 적용됐습니다."
        : "실시간베스트 차단 설정이 켜져 있습니다.";
    }

    let nextStep = "";
    if (mode === "smart") nextStep = "<br>‘이번만 보기’는 이 탭에만 적용됩니다.";
    if (mode === "redirect") nextStep = `<br><span role="timer"><span data-seconds>${seconds}</span>초 후 디시 메인으로 이동합니다.</span>`;

    dialog.innerHTML = `
      <div class="dcb-access-context">
        <span class="dcb-access-icon" aria-hidden="true"></span>
        <div id="dcb-access-id" class="dcb-access-id">갤러리 ID<bdi>${escapeHtml(gid)}</bdi></div>
      </div>
      <h1 id="dcb-access-title">차단된 갤러리입니다</h1>
      <p id="dcb-access-desc">${reason}${nextStep}</p>
      <div class="dcb-access-actions">
        ${mode === "smart" ? '<button type="button" class="dcb-access-btn" data-act="allow-once">이번만 보기</button>' : ""}
        <button type="button" class="dcb-access-btn primary" data-act="home" autofocus>${mode === "redirect" ? "지금 메인으로 이동" : "디시 메인으로 이동"}</button>
      </div>
      <div class="dcb-access-manage">${getUnblockButtonHtml(gid)}</div>
    `;

    dialog.onclick = (event) => {
      const action = event.target.closest("button[data-act]")?.dataset.act;
      if (action === "home") goSafePage();
      if (action === "unblock") unblockGallery(gid);
      if (action === "disable-dcbest") disableBuiltinDcbestBlock();
      if (action === "allow-once") {
        addTempAllow(gid);
        clearBlockedOverlay();
        window.dispatchEvent(new CustomEvent("dcb-access-allow-once", { detail: { gid } }));
      }
    };

    if (!dialog.open) dialog.showModal();
    else {
      const target = Array.from(dialog.querySelectorAll("button")).find((btn) => btn.dataset.act === previousAction);
      (target || dialog.querySelector("[data-act=home]")).focus({ preventScroll: true });
    }
    return dialog;
  }

  function showRedirectOverlay(gid, seconds) {
    let left = Math.max(1, Math.ceil(Number(seconds) || 1));
    const counter = showAccessDialog(gid, "redirect", left).querySelector("[data-seconds]");
    clearRedirectTimer();
    redirectTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearRedirectTimer();
        goSafePage();
      } else {
        counter.textContent = String(left);
      }
    }, 1000);
  }

  function clearBlockedOverlay() {
    clearRedirectTimer();

    document.documentElement.classList.remove(BLOCKED_CLASS);

    const ov = document.getElementById(OVERLAY_ID);
    if (ov) {
      ov.close();
      ov.remove();
    }

    cleanupLegacyInlineStyles();
  }

  function goSafePage() {
    if (lastRedirectHref === location.href) return;
    lastRedirectHref = location.href;
    try {
      location.replace(REDIRECT_URL);
    } catch {
      location.href = REDIRECT_URL;
    }
  }

  function applyBlockMode(gid) {
    if (settings.blockMode === "smart") {
      if (isTempAllowed(gid)) {
        clearBlockedOverlay();
        return;
      }

      clearRedirectTimer();
      showAccessDialog(gid, "smart");
      return;
    }

    if (settings.blockMode === "redirect") {
      if (settings.delay <= 0) {
        goSafePage();
        return;
      }

      showRedirectOverlay(gid, settings.delay);
      return;
    }

    clearRedirectTimer();
    showAccessDialog(gid, "block");
  }

  function enforceAccess() {
    const gid = getGalleryIdFromUrl(location.href);

    if (!settings.enabled) {
      lastRedirectHref = "";
      clearBlockedOverlay();
      return;
    }

    if (!gid || !isBlockedGallery(gid)) {
      lastRedirectHref = "";
      clearBlockedOverlay();
      return;
    }

    applyBlockMode(gid);
  }

  function loadSettingsThenEnforce() {
    try {
      globalThis.DCBRuntimeSettingsCache.get(DEFAULTS, (conf) => {
        const gEnabled =
          typeof conf.galleryBlockEnabled === "boolean"
            ? conf.galleryBlockEnabled
            : !!conf.enabled;

        settings.enabled = !!gEnabled;
        settings.blockMode = String(conf.blockMode || "smart");
        settings.delay = clampDelay(conf.delay);
        settings.builtinDcbestBlockEnabled = conf.builtinDcbestBlockEnabled !== false;
        const userBlockedIds = getUserBlockedGalleryIds(conf.blockedIds);
        settings.userBlockedSet = new Set(userBlockedIds);
        settings.blockedSet = new Set(
          getAllBlockedGalleryIds(conf.blockedIds, settings.builtinDcbestBlockEnabled)
        );

        enforceAccess();
      });
    } catch {
      settings.enabled = true;
      settings.userBlockedSet = new Set();
      settings.builtinDcbestBlockEnabled = true;
      settings.blockedSet = new Set([BUILTIN_DCBEST_ID].map(extractGalleryId));
      enforceAccess();
    }
  }

  function bindStorageChange() {
    try {
      (globalThis.DCBRuntimeSettingsCache?.onChanged || chrome.storage.onChanged).addListener((changes, area) => {
        if (area !== "sync") return;

        const important =
          changes.galleryBlockEnabled ||
          changes.builtinDcbestBlockEnabled ||
          changes.enabled ||
          changes.blockMode ||
          changes.blockedIds ||
          changes.delay;

        if (important) {
          loadSettingsThenEnforce();
        }
      });
    } catch {}
  }

  function patchHistory() {
    const rawPushState = history.pushState;
    const rawReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const ret = rawPushState.apply(this, args);
      queueMicrotask(loadSettingsThenEnforce);
      return ret;
    };

    history.replaceState = function (...args) {
      const ret = rawReplaceState.apply(this, args);
      queueMicrotask(loadSettingsThenEnforce);
      return ret;
    };

    window.addEventListener("popstate", loadSettingsThenEnforce, true);
  }

  function interceptClicks() {
    document.addEventListener(
      "click",
      (e) => {
        if (!settings.enabled) return;

        const a = e.target.closest?.("a[href]");
        if (!a) return;

        const gid = getGalleryIdFromUrl(a.href);
        if (!gid || !isBlockedGallery(gid)) return;

        if (settings.blockMode === "smart") {
          /*
            스마트 모드는 실제 대상 페이지로 이동시킨 뒤 그 페이지에서
            경고/이번만 보기 UI를 보여준다. 여기서 막으면 사용자가
            같은 링크를 두 번 눌러야 하는 문제가 생긴다.
          */
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        applyBlockMode(gid);
      },
      true
    );
  }

  function boot() {
    ensureStyle();
    cleanupLegacyInlineStyles();
    loadSettingsThenEnforce();
    bindStorageChange();
    patchHistory();
    interceptClicks();
  }

  boot();
})();
