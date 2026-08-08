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
      buttons.push('<button type="button" class="dcb-access-btn" data-act="unblock">차단 해제</button>');
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

    chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
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
      html.${BLOCKED_CLASS},
      html.${BLOCKED_CLASS} body {
        overflow: hidden !important;
      }

      #${OVERLAY_ID} {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 24px !important;
        box-sizing: border-box !important;
        background:
          radial-gradient(circle at top, rgba(59,130,246,.18), transparent 34%),
          rgba(15,23,42,.96) !important;
        color: #f8fafc !important;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      #${OVERLAY_ID} .dcb-access-card {
        width: min(460px, calc(100vw - 32px)) !important;
        padding: 28px !important;
        border: 1px solid rgba(148,163,184,.28) !important;
        border-radius: 22px !important;
        background: rgba(15,23,42,.88) !important;
        box-shadow: 0 28px 80px rgba(0,0,0,.4) !important;
        text-align: center !important;
        box-sizing: border-box !important;
      }

      #${OVERLAY_ID} .dcb-access-icon {
        width: 44px !important;
        height: 44px !important;
        margin: 0 auto 14px !important;
        border-radius: 999px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(239,68,68,.14) !important;
        border: 1px solid rgba(248,113,113,.35) !important;
        color: #fecaca !important;
        font-size: 22px !important;
        font-weight: 800 !important;
      }

      #${OVERLAY_ID} .dcb-access-title {
        margin: 0 0 8px !important;
        font-size: 20px !important;
        font-weight: 800 !important;
        letter-spacing: -0.02em !important;
        line-height: 1.3 !important;
      }

      #${OVERLAY_ID} .dcb-access-desc {
        margin: 0 0 18px !important;
        color: #cbd5e1 !important;
        font-size: 14px !important;
        line-height: 1.6 !important;
      }

      #${OVERLAY_ID} .dcb-access-id {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        max-width: 100% !important;
        margin-bottom: 18px !important;
        padding: 5px 10px !important;
        border-radius: 999px !important;
        background: rgba(148,163,184,.12) !important;
        border: 1px solid rgba(148,163,184,.2) !important;
        color: #e2e8f0 !important;
        font-size: 12px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      #${OVERLAY_ID} .dcb-access-actions {
        display: flex !important;
        justify-content: center !important;
        gap: 8px !important;
        flex-wrap: wrap !important;
      }

      #${OVERLAY_ID} .dcb-access-btn {
        appearance: none !important;
        border: 1px solid rgba(148,163,184,.26) !important;
        border-radius: 12px !important;
        padding: 9px 13px !important;
        background: rgba(255,255,255,.06) !important;
        color: #f8fafc !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
      }

      #${OVERLAY_ID} .dcb-access-btn.primary {
        background: #3b82f6 !important;
        border-color: #3b82f6 !important;
        color: #fff !important;
      }
    `;

    (document.head || document.documentElement).appendChild(st);
  }

  function mountOverlay(ov) {
    const mount = () => {
      if (document.body) {
        document.body.appendChild(ov);
      } else {
        document.documentElement.appendChild(ov);
      }
    };

    mount();
  }

  function getOrCreateOverlay() {
    ensureStyle();
    cleanupLegacyInlineStyles();

    document.documentElement.classList.add(BLOCKED_CLASS);

    let ov = document.getElementById(OVERLAY_ID);
    if (!ov) {
      ov = document.createElement("div");
      ov.id = OVERLAY_ID;
      mountOverlay(ov);
    }

    return ov;
  }

  function showBlockedOverlay(gid) {
    const ov = getOrCreateOverlay();

    ov.innerHTML = `
      <div class="dcb-access-card" role="dialog" aria-modal="true" aria-labelledby="dcb-access-title">
        <div class="dcb-access-icon">!</div>
        <h1 id="dcb-access-title" class="dcb-access-title">차단된 갤러리입니다</h1>
        <p class="dcb-access-desc">
          하드 모드가 적용되어 이 갤러리 접근이 차단되었습니다.
          검색, 외부 링크, 주소창 입력, 북마크로 접근해도 차단됩니다.
        </p>
        <div class="dcb-access-id" title="${escapeHtml(gid)}">ID: ${escapeHtml(gid)}</div>
        <div class="dcb-access-actions">
          <button type="button" class="dcb-access-btn primary" data-act="home">디시 메인으로 이동</button>
          ${getUnblockButtonHtml(gid)}
        </div>
      </div>
    `;

    ov.onclick = (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");

      if (act === "home") {
        goSafePage();
        return;
      }

      if (act === "unblock") {
        unblockGallery(gid);
        return;
      }

      if (act === "disable-dcbest") {
        disableBuiltinDcbestBlock();
      }
    };
  }

  function showRedirectOverlay(gid, seconds) {
    const ov = getOrCreateOverlay();
    const safeGid = escapeHtml(gid);

    const render = (left) => {
      ov.innerHTML = `
        <div class="dcb-access-card" role="dialog" aria-modal="true" aria-labelledby="dcb-access-title">
          <div class="dcb-access-icon">!</div>
          <h1 id="dcb-access-title" class="dcb-access-title">차단된 갤러리입니다</h1>
          <p class="dcb-access-desc">
            초보 모드가 적용되어 ${Math.max(0, left)}초 후 디시 메인으로 이동합니다.
          </p>
          <div class="dcb-access-id" title="${safeGid}">ID: ${safeGid}</div>
          <div class="dcb-access-actions">
            <button type="button" class="dcb-access-btn primary" data-act="home">지금 이동</button>
            ${getUnblockButtonHtml(gid)}
          </div>
        </div>
      `;
    };

    let left = Math.max(1, Math.ceil(Number(seconds) || 1));
    render(left);

    ov.onclick = (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");

      if (act === "home") {
        goSafePage();
        return;
      }

      if (act === "unblock") {
        unblockGallery(gid);
        return;
      }

      if (act === "disable-dcbest") {
        disableBuiltinDcbestBlock();
      }
    };

    clearRedirectTimer();
    redirectTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearRedirectTimer();
        goSafePage();
        return;
      }
      render(left);
    }, 1000);
  }

  function showSmartOverlay(gid) {
    const ov = getOrCreateOverlay();

    ov.innerHTML = `
      <div class="dcb-access-card" role="dialog" aria-modal="true" aria-labelledby="dcb-access-title">
        <div class="dcb-access-icon">!</div>
        <h1 id="dcb-access-title" class="dcb-access-title">차단된 갤러리입니다</h1>
        <p class="dcb-access-desc">
          스마트 모드가 적용되어 접근 전에 한 번 더 확인합니다.
          이번 세션에서만 허용하거나 디시 메인으로 이동할 수 있습니다.
        </p>
        <div class="dcb-access-id" title="${escapeHtml(gid)}">ID: ${escapeHtml(gid)}</div>
        <div class="dcb-access-actions">
          <button type="button" class="dcb-access-btn primary" data-act="home">디시 메인으로 이동</button>
          <button type="button" class="dcb-access-btn" data-act="allow-once">이번만 보기</button>
          ${getUnblockButtonHtml(gid)}
        </div>
      </div>
    `;

    ov.onclick = (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");

      if (act === "home") {
        goSafePage();
        return;
      }

      if (act === "unblock") {
        unblockGallery(gid);
        return;
      }

      if (act === "disable-dcbest") {
        disableBuiltinDcbestBlock();
        return;
      }

      if (act === "allow-once") {
        addTempAllow(gid);
        clearBlockedOverlay();

        /*
          이번만 보기는 현재 차단 갤러리 페이지 접근만 허용한다.
          페이지 안의 차단 갤러리 링크/최근방문/사이드바 요소는
          link-blocker.js가 계속 숨겨야 하므로 즉시 재스캔 이벤트를 보낸다.
        */
        try {
          window.dispatchEvent(
            new CustomEvent("dcb-access-allow-once", {
              detail: { gid }
            })
          );
        } catch {}
      }
    };
  }

  function clearBlockedOverlay() {
    clearRedirectTimer();

    document.documentElement.classList.remove(BLOCKED_CLASS);

    const ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.remove();

    cleanupLegacyInlineStyles();
  }

  function goSafePage() {
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
      showSmartOverlay(gid);
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
    showBlockedOverlay(gid);
  }

  function enforceAccess() {
    const gid = getGalleryIdFromUrl(location.href);

    if (!settings.enabled) {
      clearBlockedOverlay();
      return;
    }

    if (!gid || !isBlockedGallery(gid)) {
      clearBlockedOverlay();
      return;
    }

    applyBlockMode(gid);
  }

  function loadSettingsThenEnforce() {
    try {
      chrome.storage.sync.get(DEFAULTS, (conf) => {
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
      chrome.storage.onChanged.addListener((changes, area) => {
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
