// gallery-quick-block.js
// 현재 보고 있는 DCinside 갤러리를 페이지 안에서 바로 차단하는 미니멀 버튼을 추가한다.
(() => {
  "use strict";

  const STYLE_ID = "dcb-gallery-quick-block-style";
  const NATIVE_ID = "dcb-gallery-quick-block-native";
  const FLOAT_ID = "dcb-gallery-quick-block-floating";
  const AUTO_REFRESH_COUNTDOWN_ID = "dcb-auto-refresh-countdown";
  const RIGHT_BOTTOM_OFFSET_PROP = "--dcb-gqb-right-bottom-offset";
  const BUILTIN_DCBEST_ID = "dcbest";
  const QUICK_BLOCK_POSITION_DEFAULT = "right-top";
  const QUICK_BLOCK_POSITION_KEY = "quickBlockButtonPosition";
  const QUICK_BLOCK_POSITION_SAVED_AT_KEY = "quickBlockButtonPositionSavedAt";
  const QUICK_BLOCK_POSITIONS = new Set([
    "right-top",
    "right-middle",
    "right-bottom",
    "left-top",
    "left-middle",
    "left-bottom",
    "hidden"
  ]);
  const NATIVE_TOP_POSITIONS = new Set(["right-top", "left-top"]);
  let autoRefreshEnabledForOffset = false;
  let autoRefreshOffsetRaf = 0;
  let placementRevision = 0;

  function norm(v) {
    return String(v || "").trim().toLowerCase();
  }

  function normalizeQuickBlockPosition(value) {
    const key = norm(value);
    return QUICK_BLOCK_POSITIONS.has(key) ? key : QUICK_BLOCK_POSITION_DEFAULT;
  }

  function toTimestamp(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function pickStoredQuickBlockPosition(syncConf = {}, localConf = {}) {
    const syncPos = normalizeQuickBlockPosition(syncConf[QUICK_BLOCK_POSITION_KEY]);
    const localRaw = String(localConf[QUICK_BLOCK_POSITION_KEY] || "").trim();
    const localValid = QUICK_BLOCK_POSITIONS.has(norm(localRaw));
    const localPos = localValid ? normalizeQuickBlockPosition(localRaw) : "";

    const syncAt = toTimestamp(syncConf[QUICK_BLOCK_POSITION_SAVED_AT_KEY]);
    const localAt = toTimestamp(localConf[QUICK_BLOCK_POSITION_SAVED_AT_KEY]);

    if (localPos && localAt > syncAt) return localPos;
    return syncPos || localPos || QUICK_BLOCK_POSITION_DEFAULT;
  }

  function getStoredQuickBlockPosition(callback) {
    const syncDefaults = {
      [QUICK_BLOCK_POSITION_KEY]: QUICK_BLOCK_POSITION_DEFAULT,
      [QUICK_BLOCK_POSITION_SAVED_AT_KEY]: 0
    };
    const localDefaults = {
      [QUICK_BLOCK_POSITION_KEY]: "",
      [QUICK_BLOCK_POSITION_SAVED_AT_KEY]: 0
    };

    globalThis.DCBRuntimeSettingsCache.get(syncDefaults, (syncConf = {}) => {
      chrome.storage.local.get(localDefaults, (localConf = {}) => {
        callback(pickStoredQuickBlockPosition(syncConf, localConf));
      });
    });
  }

  function isDcInsideHost(hostname) {
    const host = norm(hostname);
    return host === "dcinside.com" || host.endsWith(".dcinside.com");
  }

  function isPlainGalleryId(v) {
    return /^[a-z0-9_-]+$/i.test(String(v || "").trim());
  }

  function extractGalleryId(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";

    if (/^id\s*=/i.test(raw)) {
      return norm(raw.replace(/^id\s*=\s*/i, "").split(/[&#?\s]/)[0]);
    }

    if (isPlainGalleryId(raw)) {
      return norm(raw);
    }

    try {
      const url = new URL(raw, location.href);

      if (!isDcInsideHost(url.hostname)) {
        return "";
      }

      const qsId = url.searchParams.get("id");
      if (qsId) return norm(qsId);

      const pathMatch = url.pathname.match(/^\/(?:mgallery|mini|person)\/([^/?#]+)/i);
      if (pathMatch && pathMatch[1]) return norm(pathMatch[1]);

      return "";
    } catch (_) {
      return norm(raw)
        .replace(/^id\s*=\s*/i, "")
        .split(/[?#&\s]/)[0]
        .trim();
    }
  }

  function getCurrentGalleryId() {
    return extractGalleryId(location.href);
  }

  function getUserBlockedGallerySet(blockedIds = []) {
    const userIds = Array.isArray(blockedIds) ? blockedIds : [];
    return new Set(userIds.map(extractGalleryId).filter(Boolean));
  }

  function getBuiltinGallerySet(builtinDcbestBlockEnabled = true) {
    return new Set(
      (builtinDcbestBlockEnabled === false ? [] : [BUILTIN_DCBEST_ID])
        .map(extractGalleryId)
        .filter(Boolean)
    );
  }

  function getBlockedGallerySet(blockedIds = [], builtinDcbestBlockEnabled = true) {
    return new Set([
      ...getBuiltinGallerySet(builtinDcbestBlockEnabled),
      ...getUserBlockedGallerySet(blockedIds)
    ]);
  }

  function getGalleryBlockState(gid, blockedIds = [], builtinDcbestBlockEnabled = true) {
    const id = extractGalleryId(gid);
    const userBlocked = getUserBlockedGallerySet(blockedIds).has(id);
    const builtinBlocked = getBuiltinGallerySet(builtinDcbestBlockEnabled).has(id);
    return {
      userBlocked,
      builtinBlocked,
      blocked: userBlocked || builtinBlocked
    };
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${NATIVE_ID}{
        display:inline-flex;
        align-items:center;
        vertical-align:middle;
        box-sizing:border-box;
        max-width:100%;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
        line-height:1;
      }
      #${NATIVE_ID}.dcb-gqb-native-right{
        margin-right:8px;
      }
      #${NATIVE_ID}.dcb-gqb-native-left{
        margin-left:10px;
      }
      #${NATIVE_ID} .dcb-gqb-action{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        height:24px;
        min-width:0;
        box-sizing:border-box;
        padding:0 10px;
        border:1px solid #abb4cf;
        border-radius:6px;
        background:#fff;
        color:#29367c;
        font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
        white-space:nowrap;
        cursor:pointer;
        box-shadow:0 1px 2px rgba(15,23,42,.07);
      }
      #${NATIVE_ID} .dcb-gqb-action:enabled:hover{
        background:#eef1fa;
        border-color:#8692b8;
      }
      #${NATIVE_ID} .dcb-gqb-action:disabled{
        border-color:#cbd5e1;
        background:#f1f5f9;
        color:#64748b;
        cursor:not-allowed;
        box-shadow:none;
      }
      .page_head #${NATIVE_ID}{
        position:relative;
        top:-1px;
      }
      .page_head .fl #${NATIVE_ID}{
        float:none;
      }
      #${FLOAT_ID}{
        position:fixed;
        z-index:2147483647;
        display:flex;
        align-items:center;
        gap:6px;
        box-sizing:border-box;
        max-width:min(320px, calc(100vw - 24px));
        padding:7px 8px;
        border:1px solid rgba(41,54,124,.23);
        border-radius:10px;
        background:rgba(255,255,255,.96);
        color:#111827;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
        font-size:12px;
        line-height:1.25;
        box-shadow:0 3px 10px rgba(15,23,42,.09);
        backdrop-filter:blur(8px);
        transition:top .18s ease,right .18s ease,bottom .18s ease,left .18s ease,transform .18s ease;
      }
      #${FLOAT_ID}.dcb-gqb-pos-right-top{top:12px;right:12px;bottom:auto;left:auto;transform:none;}
      #${FLOAT_ID}.dcb-gqb-pos-right-middle{top:50%;right:12px;bottom:auto;left:auto;transform:translateY(-50%);}
      #${FLOAT_ID}.dcb-gqb-pos-right-bottom{top:auto;right:12px;bottom:var(${RIGHT_BOTTOM_OFFSET_PROP}, 12px);left:auto;transform:none;}
      #${FLOAT_ID}.dcb-gqb-pos-left-top{top:12px;right:auto;bottom:auto;left:12px;transform:none;}
      #${FLOAT_ID}.dcb-gqb-pos-left-middle{top:50%;right:auto;bottom:auto;left:12px;transform:translateY(-50%);}
      #${FLOAT_ID}.dcb-gqb-pos-left-bottom{top:auto;right:auto;bottom:12px;left:12px;transform:none;}
      #${FLOAT_ID} .dcb-gqb-floating-id{
        overflow:hidden;
        max-width:108px;
        padding:2px 6px;
        border-radius:4px;
        background:#eef2ff;
        color:#29367c;
        font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        font-size:11px;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      #${FLOAT_ID} .dcb-gqb-action{
        flex:0 0 auto;
        height:24px;
        padding:0 9px;
        border:1px solid #29367c;
        border-radius:6px;
        background:#29367c;
        color:#fff;
        font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
        cursor:pointer;
      }
      #${FLOAT_ID} .dcb-gqb-action:enabled:hover{
        filter:brightness(.96);
      }
      #${FLOAT_ID} .dcb-gqb-action:disabled{
        border-color:#cbd5e1;
        background:#e2e8f0;
        color:#64748b;
        cursor:not-allowed;
      }
      @media (max-width: 640px){
        #${FLOAT_ID}{
          max-width:calc(100vw - 16px);
          padding:6px 7px;
        }
        #${FLOAT_ID}.dcb-gqb-pos-right-top{top:8px;right:8px;}
        #${FLOAT_ID}.dcb-gqb-pos-right-middle{right:8px;}
        #${FLOAT_ID}.dcb-gqb-pos-right-bottom{right:8px;bottom:var(${RIGHT_BOTTOM_OFFSET_PROP}, 8px);}
        #${FLOAT_ID}.dcb-gqb-pos-left-top{top:8px;left:8px;}
        #${FLOAT_ID}.dcb-gqb-pos-left-middle{left:8px;}
        #${FLOAT_ID}.dcb-gqb-pos-left-bottom{left:8px;bottom:8px;}
        #${FLOAT_ID} .dcb-gqb-floating-id{display:none;}
      }
      :is(#${NATIVE_ID}, #${FLOAT_ID}) button:focus-visible{
        outline:1px solid currentColor;
        outline-offset:2px;
      }
      :is(html:has(#css-darkmode), html[data-theme="dark"], body.dark) #${NATIVE_ID} .dcb-gqb-action{
        background:#292d34;
        color:#c8ced8;
        border-color:#4b525e;
        box-shadow:0 1px 3px rgba(0,0,0,.12);
      }
      :is(html:has(#css-darkmode), html[data-theme="dark"], body.dark) #${NATIVE_ID} .dcb-gqb-action:enabled:hover{
        background:#383e48;
        color:#e0e4ea;
      }
      :is(html:has(#css-darkmode), html[data-theme="dark"], body.dark) #${FLOAT_ID}{
        background:rgba(38,41,47,.96);
        color:#c8ced8;
        border-color:#444a54;
        box-shadow:0 3px 10px rgba(0,0,0,.12);
      }
      :is(html:has(#css-darkmode), html[data-theme="dark"], body.dark) #${FLOAT_ID} .dcb-gqb-floating-id{
        background:#323741;
        color:#b9c2d0;
      }
      :is(html:has(#css-darkmode), html[data-theme="dark"], body.dark) #${FLOAT_ID} .dcb-gqb-action{
        background:#39414e;
        color:#d4dbe4;
        border-color:#505866;
      }
      :is(html:has(#css-darkmode), html[data-theme="dark"], body.dark) :is(#${NATIVE_ID}, #${FLOAT_ID}) .dcb-gqb-action:disabled{
        background:#2b2e33;
        color:#969ca6;
        border-color:#3e434b;
        box-shadow:none;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function createActionButton(gid) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dcb-gqb-action";
    btn.textContent = "현재 갤러리 차단";
    btn.title = `현재 갤러리를 차단합니다: ${gid}`;
    btn.addEventListener("click", () => toggleGalleryBlocked(gid));
    return btn;
  }

  function removeNativeButton() {
    const native = document.getElementById(NATIVE_ID);
    if (native) native.remove();
  }

  function removeFloatingButton() {
    const floating = document.getElementById(FLOAT_ID);
    if (floating) floating.remove();
  }

  function findNativeMount(position) {
    if (position === "right-top") {
      return (
        document.querySelector(".page_head .gall_issuebox") ||
        document.querySelector(".gall_issuebox") ||
        document.querySelector(".page_head .fr")
      );
    }

    if (position === "left-top") {
      return (
        document.querySelector(".page_head .fl") ||
        document.querySelector(".page_head h2") ||
        document.querySelector(".page_head")
      );
    }

    return null;
  }

  function renderNativeButton(gid, position) {
    removeNativeButton();

    const mount = findNativeMount(position);
    if (!mount) return false;

    const native = document.createElement("span");
    native.id = NATIVE_ID;
    native.className = position === "right-top" ? "dcb-gqb-native-right" : "dcb-gqb-native-left";
    native.dataset.position = position;
    native.appendChild(createActionButton(gid));

    if (position === "right-top") {
      mount.insertBefore(native, mount.firstChild);
    } else {
      mount.appendChild(native);
    }

    return true;
  }

  function applyFloatingPosition(position) {
    const floating = document.getElementById(FLOAT_ID);
    if (!floating) return;

    const normalized = normalizeQuickBlockPosition(position);
    QUICK_BLOCK_POSITIONS.forEach((key) => {
      floating.classList.remove(`dcb-gqb-pos-${key}`);
    });
    floating.classList.add(`dcb-gqb-pos-${normalized}`);
    floating.dataset.position = normalized;
  }


  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function updateAutoRefreshOverlapOffset() {
    autoRefreshOffsetRaf = 0;

    const floating = document.getElementById(FLOAT_ID);
    if (!floating) return;

    if (floating.dataset.position !== "right-bottom" || !autoRefreshEnabledForOffset) {
      floating.style.removeProperty(RIGHT_BOTTOM_OFFSET_PROP);
      return;
    }

    const countdown = document.getElementById(AUTO_REFRESH_COUNTDOWN_ID);
    if (!isElementVisible(countdown)) {
      floating.style.removeProperty(RIGHT_BOTTOM_OFFSET_PROP);
      return;
    }

    const rect = countdown.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const bottomGap = Math.max(0, viewportHeight - rect.bottom);
    const safeGap = window.matchMedia && window.matchMedia("(max-width: 640px)").matches ? 10 : 12;
    const offset = Math.ceil(rect.height + bottomGap + safeGap);

    floating.style.setProperty(RIGHT_BOTTOM_OFFSET_PROP, `${Math.max(offset, 48)}px`);
  }

  function scheduleAutoRefreshOverlapOffsetUpdate() {
    if (autoRefreshOffsetRaf) return;
    autoRefreshOffsetRaf = window.requestAnimationFrame(updateAutoRefreshOverlapOffset);
  }

  function initAutoRefreshOverlapOffset() {
    globalThis.DCBRuntimeSettingsCache.get({ autoRefreshEnabled: false }, ({ autoRefreshEnabled }) => {
      autoRefreshEnabledForOffset = !!autoRefreshEnabled;
      scheduleAutoRefreshOverlapOffsetUpdate();
    });

    document.addEventListener("dcb-auto-refresh-ui-change", scheduleAutoRefreshOverlapOffsetUpdate, { passive: true });
    window.addEventListener("resize", scheduleAutoRefreshOverlapOffsetUpdate, { passive: true });
  }

  function renderFloatingButton(gid, position = QUICK_BLOCK_POSITION_DEFAULT) {
    removeFloatingButton();

    const floating = document.createElement("div");
    floating.id = FLOAT_ID;

    const idEl = document.createElement("code");
    idEl.className = "dcb-gqb-floating-id";
    idEl.textContent = gid;
    idEl.title = gid;

    floating.appendChild(idEl);
    floating.appendChild(createActionButton(gid));

    (document.body || document.documentElement).appendChild(floating);
    applyFloatingPosition(position);
    scheduleAutoRefreshOverlapOffsetUpdate();
  }

  function syncQuickBlockPlacement(gid, position) {
    const normalized = normalizeQuickBlockPosition(position);

    if (normalized === "hidden") {
      removeNativeButton();
      removeFloatingButton();
      return;
    }

    ensureStyle();
    if (NATIVE_TOP_POSITIONS.has(normalized)) {
      removeFloatingButton();
      const mounted = renderNativeButton(gid, normalized);
      if (!mounted) renderFloatingButton(gid, normalized);
    } else {
      removeNativeButton();
      renderFloatingButton(gid, normalized);
    }

    refreshBlockState(gid);
  }

  function refreshBlockState(gid) {
    globalThis.DCBRuntimeSettingsCache.get(
      { blockedIds: [], builtinDcbestBlockEnabled: true },
      ({ blockedIds, builtinDcbestBlockEnabled }) => {
        setAllQuickBlockButtonsState(getGalleryBlockState(gid, blockedIds, builtinDcbestBlockEnabled));
      }
    );
  }

  function setAllQuickBlockButtonsState({ userBlocked = false, builtinBlocked = false, busy = false } = {}) {
    const gid = getCurrentGalleryId();
    const buttons = document.querySelectorAll(`#${NATIVE_ID} .dcb-gqb-action, #${FLOAT_ID} .dcb-gqb-action`);

    buttons.forEach((btn) => {
      if (busy) {
        btn.disabled = true;
        btn.textContent = "처리 중…";
        return;
      }

      if (userBlocked) {
        btn.disabled = false;
        btn.textContent = "차단 해제";
        btn.title = gid ? `현재 갤러리 차단을 해제합니다: ${gid}` : "현재 갤러리 차단을 해제합니다.";
        return;
      }

      if (builtinBlocked) {
        btn.disabled = true;
        btn.textContent = "실시간베스트 차단됨";
        btn.title = gid ? `실시간베스트 차단 설정으로 막힌 갤러리입니다: ${gid}` : "실시간베스트 차단 설정으로 막힌 갤러리입니다.";
        return;
      }

      btn.disabled = false;
      btn.textContent = "현재 갤러리 차단";
      btn.title = gid ? `현재 갤러리를 차단합니다: ${gid}` : "현재 갤러리를 차단합니다.";
    });
  }

  function toggleGalleryBlocked(gid) {
    const id = extractGalleryId(gid);
    if (!id) return;

    setAllQuickBlockButtonsState({ busy: true });

    globalThis.DCBRuntimeSettingsCache.get({ blockedIds: [], builtinDcbestBlockEnabled: true }, ({ blockedIds, builtinDcbestBlockEnabled }) => {
      const prev = Array.isArray(blockedIds) ? blockedIds : [];
      const normalized = prev.map(extractGalleryId).filter(Boolean);
      const state = getGalleryBlockState(id, prev, builtinDcbestBlockEnabled);

      if (state.userBlocked) {
        const next = normalized.filter((blockedId) => blockedId !== id);

        chrome.storage.sync.set({ blockedIds: next }, () => {
          if (chrome.runtime.lastError) {
            setAllQuickBlockButtonsState(state);
            return;
          }

          setAllQuickBlockButtonsState({ userBlocked: false, builtinBlocked: state.builtinBlocked });
        });
        return;
      }

      if (state.builtinBlocked) {
        setAllQuickBlockButtonsState({ userBlocked: false, builtinBlocked: true });
        return;
      }

      const next = Array.from(new Set([...normalized, id]));

      chrome.storage.sync.set({ blockedIds: next }, () => {
        if (chrome.runtime.lastError) {
          setAllQuickBlockButtonsState({ userBlocked: false, builtinBlocked: false });
          return;
        }

        setAllQuickBlockButtonsState({ userBlocked: true, builtinBlocked: false });
      });
    });
  }

  function render() {
    const gid = getCurrentGalleryId();
    if (!gid) return;

    const revision = ++placementRevision;
    getStoredQuickBlockPosition((position) => {
      if (revision === placementRevision) syncQuickBlockPlacement(gid, position);
    });
  }

  function scheduleRender() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  scheduleRender();
  initAutoRefreshOverlapOffset();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "dcb.quickBlock.setPosition") return;

    const gid = getCurrentGalleryId();
    if (!gid) {
      sendResponse?.({ ok: false, reason: "NO_GALLERY_ID" });
      return true;
    }

    const position = normalizeQuickBlockPosition(message.position);
    // Another tab may have saved a newer position while this message was in flight.
    render();
    sendResponse?.({ ok: true, position });
    return true;
  });

  (globalThis.DCBRuntimeSettingsCache?.onChanged || chrome.storage.onChanged).addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;

    if (area === "sync" && changes.autoRefreshEnabled) {
      autoRefreshEnabledForOffset = !!changes.autoRefreshEnabled.newValue;
      scheduleAutoRefreshOverlapOffsetUpdate();
    }

    const gid = getCurrentGalleryId();
    if (!gid) return;

    if (changes[QUICK_BLOCK_POSITION_KEY] || changes[QUICK_BLOCK_POSITION_SAVED_AT_KEY]) {
      render();
    }

    if (area === "sync" && (changes.blockedIds || changes.builtinDcbestBlockEnabled)) {
      refreshBlockState(gid);
    }
  });
})();
