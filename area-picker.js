/*****************************************************************
 * area-picker.js — 우클릭 메뉴 기반 영역 숨기기
 *****************************************************************/
(function () {
  const TOAST_ID = "dcb-area-picker-toast";
  const STYLE_ID = "dcb-area-picker-style";
  const OVERLAY_ID = "dcb-area-picker-overlay";
  const GUIDE_ID = "dcb-area-picker-guide";

  const ROOT_HOST = location.hostname;
  const PAGE_CONFIG = getPageConfig();

  let lastContextElement = null;
  let lastContextAt = 0;
  let activePicker = null;

  function getPageConfig() {
    if (ROOT_HOST === "www.dcinside.com") {
      return {
        storageKey: "removeSelectors",
        enabledKey: "hideMainEnabled",
        pageLabel: "메인 페이지"
      };
    }

    if (ROOT_HOST === "search.dcinside.com") {
      return {
        storageKey: "removeSelectorsSearch",
        enabledKey: "hideSearchEnabled",
        pageLabel: "검색 페이지"
      };
    }

    return {
      storageKey: "removeSelectorsGall",
      enabledKey: "hideGallEnabled",
      pageLabel: "갤러리 페이지"
    };
  }

  function isExtensionUi(el) {
    return !!(
      el &&
      el.closest &&
      el.closest(`#${TOAST_ID}, #${OVERLAY_ID}, #${GUIDE_ID}, .dcb-quick-gallery-block, .dcb-quick-gallery-block-floating`)
    );
  }

  function cssEscape(value) {
    const raw = String(value || "");
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(raw);
    }

    return raw.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeQueryAll(selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (_) {
      return [];
    }
  }

  function isUnsafeTarget(el) {
    if (!(el instanceof Element)) return true;
    if (isExtensionUi(el)) return true;

    const tag = el.tagName.toLowerCase();
    if (["html", "body", "head", "script", "style", "meta", "link"].includes(tag)) {
      return true;
    }

    return false;
  }

  const preferredBlockSelector = [
    "ins.kakao_ad_area",
    "iframe",
    "aside",
    "section.right_content",
    "section.left_content",
    "section.center_content",
    ".right_content > div",
    ".left_content > div",
    ".center_content > div",
    ".time_best",
    ".issue_wrap",
    ".issuebox",
    ".concept_wrap",
    ".integrate_cont",
    ".power_link",
    ".ad_premium",
    ".banner",
    ".top_banner",
    ".bottom_banner",
    ".dccon_shop",
    ".login_box",
    ".visit_bookmark",
    ".gall_exposure",
    ".gall_issuebox",
    "article",
    "section",
    "li",
    "tr",
    "td",
    "th"
  ].join(",");

  function getBlockTarget(start) {
    if (!(start instanceof Element)) return null;
    if (isExtensionUi(start)) return null;

    const preferred = start.closest(preferredBlockSelector);

    if (preferred && !isUnsafeTarget(preferred)) {
      const rect = preferred.getBoundingClientRect();
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);

      // 너무 작은 inline 요소 대신 실제 시각 블록을 고른다.
      if (area >= 30 || ["LI", "TR", "SECTION", "ARTICLE", "ASIDE", "IFRAME", "INS"].includes(preferred.tagName)) {
        return preferred;
      }
    }

    let el = start;
    while (el && el instanceof Element && !isUnsafeTarget(el)) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const display = style.display || "";
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);

      if (
        area >= 120 &&
        display !== "inline" &&
        display !== "contents" &&
        !["A", "SPAN", "B", "I", "EM", "STRONG"].includes(el.tagName)
      ) {
        return el;
      }

      el = el.parentElement;
    }

    return null;
  }

  const ignoredClasses = new Set([
    "on", "off", "active", "selected", "sel", "open", "close", "show", "hide",
    "clear", "fl", "fr", "blind", "sp_img", "new", "inner", "box", "txt", "tit",
    "left", "right", "top", "bottom", "small", "large"
  ]);

  function goodClasses(el) {
    return Array.from(el.classList || [])
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .filter((v) => !v.startsWith("dcb-"))
      .filter((v) => !ignoredClasses.has(v))
      .filter((v) => !/^ui-/.test(v))
      .filter((v) => !/^logClass$/.test(v))
      .slice(0, 4);
  }

  function hasStableId(id) {
    if (!id) return false;
    if (/^google_ads_iframe_|^aswift_|^ad_iframe_|^kakao_ad_/i.test(id)) return true;
    return !/(^|[-_])\d{7,}($|[-_])/.test(id);
  }

  function nthOfType(el) {
    if (!el.parentElement) return 1;
    const tag = el.tagName;
    let index = 1;
    for (const child of el.parentElement.children) {
      if (child === el) return index;
      if (child.tagName === tag) index += 1;
    }
    return index;
  }

  function simplePart(el, { allowId = true, forceNth = false } = {}) {
    const tag = el.tagName.toLowerCase();

    if (allowId && hasStableId(el.id)) {
      return `#${cssEscape(el.id)}`;
    }

    const classes = goodClasses(el);
    let part = tag;

    if (classes.length) {
      part += classes.map((c) => `.${cssEscape(c)}`).join("");
    }

    const dataAdUnit = el.getAttribute("data-ad-unit");
    if (tag === "ins" && dataAdUnit) {
      part += `[data-ad-unit="${cssEscape(dataAdUnit)}"]`;
    }

    if (forceNth || (!classes.length && !dataAdUnit)) {
      part += `:nth-of-type(${nthOfType(el)})`;
    }

    return part;
  }

  function directSelectorCandidates(el) {
    const tag = el.tagName.toLowerCase();
    const candidates = [];

    if (hasStableId(el.id)) {
      candidates.push(`#${cssEscape(el.id)}`);
    }

    const dataAdUnit = el.getAttribute("data-ad-unit");
    if (tag === "ins" && dataAdUnit) {
      candidates.push(`ins[data-ad-unit="${cssEscape(dataAdUnit)}"]`);
    }

    const classes = goodClasses(el);
    if (classes.length) {
      candidates.push(`${tag}${classes.map((c) => `.${cssEscape(c)}`).join("")}`);
      candidates.push(`.${cssEscape(classes[0])}`);
    }

    return candidates;
  }

  function scoreSelector(selector, target) {
    const matches = safeQueryAll(selector);
    if (!matches.includes(target)) return -1;

    let score = 1000;
    score -= selector.length;

    if (matches.length === 1) score += 420;
    else if (matches.length <= 5) score += 220 - matches.length * 10;
    else if (matches.length <= 20) score += 60 - matches.length;
    else score -= matches.length;

    if (/^#/.test(selector)) score += 80;
    if (/\.ad|banner|kakao_ad|power_link|issuebox|time_best|integrate_cont/.test(selector)) score += 55;
    if (/:nth-of-type/.test(selector)) score -= 45;
    if (/^li($|[:.])|^tr($|[:.])/.test(selector)) score -= 15;

    return score;
  }

  function buildSelector(el) {
    const candidates = [];

    for (const direct of directSelectorCandidates(el)) {
      candidates.push(direct);
    }

    const parts = [];
    let curr = el;
    let depth = 0;

    while (curr && curr instanceof Element && curr !== document.body && curr !== document.documentElement && depth < 6) {
      parts.unshift(simplePart(curr, { allowId: depth > 0, forceNth: depth === 0 && !goodClasses(curr).length && !curr.id }));
      const selector = parts.join(" > ");
      candidates.push(selector);

      if (hasStableId(curr.id) && depth > 0) {
        break;
      }

      curr = curr.parentElement;
      depth += 1;
    }

    const unique = Array.from(new Set(candidates.filter(Boolean)));
    const scored = unique
      .map((selector) => ({ selector, score: scoreSelector(selector, el) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.selector || simplePart(el, { forceNth: true });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID},
      #${GUIDE_ID},
      #${TOAST_ID},
      #${TOAST_ID} * {
        box-sizing: border-box;
      }

      #${OVERLAY_ID} {
        position: fixed;
        z-index: 2147483645;
        pointer-events: none;
        border: 2px solid #111827;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.08);
        box-shadow:
          0 0 0 99999px rgba(15, 23, 42, 0.08),
          0 18px 48px rgba(15, 23, 42, 0.18);
        transition: top 70ms ease, left 70ms ease, width 70ms ease, height 70ms ease;
      }

      #${GUIDE_ID} {
        position: fixed;
        left: 50%;
        top: 18px;
        z-index: 2147483646;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: min(520px, calc(100vw - 32px));
        padding: 10px 13px;
        border: 1px solid rgba(226, 232, 240, 0.96);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.97);
        color: #0f172a;
        box-shadow:
          0 18px 46px rgba(15, 23, 42, 0.16),
          0 2px 10px rgba(15, 23, 42, 0.05);
        backdrop-filter: blur(12px) saturate(1.08);
        -webkit-backdrop-filter: blur(12px) saturate(1.08);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: -0.01em;
        user-select: none;
      }

      #${GUIDE_ID} .dcb-area-picker-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 34px;
        height: 22px;
        padding: 0 8px;
        border: 1px solid rgba(148, 163, 184, 0.78);
        border-bottom-width: 2px;
        border-radius: 8px;
        background: #ffffff;
        color: #020617;
        font-size: 11px;
        font-weight: 900;
        line-height: 1;
      }

      #${TOAST_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        width: min(410px, calc(100vw - 40px));
        padding: 14px;
        border: 1px solid rgba(226, 232, 240, 0.95);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.97);
        color: #0f172a;
        box-shadow:
          0 22px 60px rgba(15, 23, 42, 0.18),
          0 2px 10px rgba(15, 23, 42, 0.06);
        backdrop-filter: blur(12px) saturate(1.08);
        -webkit-backdrop-filter: blur(12px) saturate(1.08);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
        transform: translateY(8px);
        opacity: 0;
        pointer-events: auto;
        transition: opacity 150ms ease, transform 150ms ease;
      }

      #${TOAST_ID}.show {
        transform: translateY(0);
        opacity: 1;
      }

      #${TOAST_ID} .dcb-area-toast-row {
        display: flex;
        gap: 11px;
        align-items: flex-start;
      }

      #${TOAST_ID} .dcb-area-toast-icon {
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

      #${TOAST_ID}.error .dcb-area-toast-icon {
        background: #dc2626;
      }

      #${TOAST_ID} .dcb-area-toast-title {
        margin: 0;
        color: #020617;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.35;
        letter-spacing: -0.02em;
      }

      #${TOAST_ID} .dcb-area-toast-desc {
        margin: 3px 0 0;
        color: #64748b;
        font-size: 12px;
        font-weight: 650;
        line-height: 1.5;
        letter-spacing: -0.01em;
      }

      #${TOAST_ID} .dcb-area-toast-selector {
        display: block;
        margin-top: 6px;
        color: #0f172a;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.35;
        word-break: break-all;
      }

      #${TOAST_ID} .dcb-area-toast-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }

      #${TOAST_ID} button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 7px 10px;
        background: #0f172a;
        color: #ffffff;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: -0.01em;
        cursor: pointer;
      }

      #${TOAST_ID} button.secondary {
        background: #f1f5f9;
        color: #0f172a;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function showToast({ title, desc, selector = "", variant = "success", undo } = {}) {
    ensureStyle();

    const prev = document.getElementById(TOAST_ID);
    if (prev) prev.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = variant;

    const selectorHtml = selector
      ? `<span class="dcb-area-toast-selector">${escapeHtml(selector)}</span>`
      : "";

    toast.innerHTML = `
      <div class="dcb-area-toast-row">
        <span class="dcb-area-toast-icon">${variant === "error" ? "!" : "✓"}</span>
        <div>
          <p class="dcb-area-toast-title">${escapeHtml(title || "")}</p>
          <p class="dcb-area-toast-desc">${escapeHtml(desc || "")}</p>
          ${selectorHtml}
          ${undo ? `
            <div class="dcb-area-toast-actions">
              <button type="button" data-dcb-area-undo>되돌리기</button>
              <button type="button" class="secondary" data-dcb-area-close>닫기</button>
            </div>
          ` : ""}
        </div>
      </div>
    `;

    const close = () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 170);
    };

    const closeBtn = toast.querySelector("[data-dcb-area-close]");
    if (closeBtn) closeBtn.addEventListener("click", close);

    const undoBtn = toast.querySelector("[data-dcb-area-undo]");
    if (undoBtn && undo) {
      undoBtn.addEventListener("click", () => {
        undo();
        close();
      });
    }

    (document.body || document.documentElement).appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      if (document.body?.contains(toast)) close();
    }, undo ? 6500 : 2600);
  }

  function hideBySelectorNow(selector) {
    safeQueryAll(selector).forEach((el) => {
      if (isExtensionUi(el) || isUnsafeTarget(el)) return;
      el.setAttribute("data-dcb-area-hidden", "1");
      el.style.setProperty("display", "none", "important");
    });
  }

  function unhideBySelectorNow(selector) {
    safeQueryAll(selector).forEach((el) => {
      if (el.getAttribute("data-dcb-area-hidden") === "1") {
        el.removeAttribute("data-dcb-area-hidden");
        el.style.removeProperty("display");
      }
    });
  }

  function storageGet(defaults) {
    return new Promise((resolve) => chrome.storage.sync.get(defaults, resolve));
  }

  function storageSet(patch) {
    return new Promise((resolve) => chrome.storage.sync.set(patch, resolve));
  }

  async function removeSelector(selector) {
    const current = await storageGet({ [PAGE_CONFIG.storageKey]: [] });
    const list = Array.isArray(current[PAGE_CONFIG.storageKey])
      ? current[PAGE_CONFIG.storageKey]
      : [];
    await storageSet({
      [PAGE_CONFIG.storageKey]: list.filter((item) => String(item || "").trim() !== selector)
    });
    unhideBySelectorNow(selector);
  }

  async function saveAndHide(target, source = "picker") {
    if (isUnsafeTarget(target)) {
      startPicker();
      return { ok: false, reason: "UNSAFE_TARGET" };
    }

    const selector = buildSelector(target);
    if (!selector) {
      showToast({
        title: "영역을 찾지 못했습니다",
        desc: "다시 한 번 더 정확한 영역 위에서 시도해 주세요.",
        variant: "error"
      });
      return { ok: false, reason: "NO_SELECTOR" };
    }

    const current = await storageGet({
      [PAGE_CONFIG.storageKey]: [],
      [PAGE_CONFIG.enabledKey]: true
    });

    const prev = Array.isArray(current[PAGE_CONFIG.storageKey])
      ? current[PAGE_CONFIG.storageKey].map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    const alreadyExists = prev.includes(selector);
    const next = alreadyExists ? prev : [...prev, selector];

    await storageSet({
      [PAGE_CONFIG.storageKey]: next,
      [PAGE_CONFIG.enabledKey]: true
    });

    hideBySelectorNow(selector);

    showToast({
      title: alreadyExists ? "이미 숨김 처리된 영역입니다" : "영역 숨김 완료",
      desc: `${PAGE_CONFIG.pageLabel} 숨김 목록에 저장했습니다. 옵션 화면에서 언제든 해제할 수 있습니다.`,
      selector,
      undo: () => removeSelector(selector)
    });

    return {
      ok: true,
      selector,
      storageKey: PAGE_CONFIG.storageKey,
      source
    };
  }

  function drawOverlay(target) {
    ensureStyle();

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      (document.body || document.documentElement).appendChild(overlay);
    }

    const rect = target.getBoundingClientRect();
    overlay.style.top = `${Math.round(rect.top)}px`;
    overlay.style.left = `${Math.round(rect.left)}px`;
    overlay.style.width = `${Math.round(rect.width)}px`;
    overlay.style.height = `${Math.round(rect.height)}px`;
  }

  function ensureGuide() {
    ensureStyle();

    let guide = document.getElementById(GUIDE_ID);
    if (guide) return guide;

    guide = document.createElement("div");
    guide.id = GUIDE_ID;
    guide.innerHTML = `
      <span>숨길 영역을 클릭하세요</span>
      <span class="dcb-area-picker-key">Click</span>
      <span>저장</span>
      <span class="dcb-area-picker-key">Esc</span>
      <span>취소</span>
    `;
    (document.body || document.documentElement).appendChild(guide);
    return guide;
  }

  function stopPicker() {
    if (!activePicker) return;

    document.removeEventListener("mousemove", activePicker.onMove, true);
    document.removeEventListener("click", activePicker.onClick, true);
    document.removeEventListener("contextmenu", activePicker.onContextMenu, true);
    document.removeEventListener("keydown", activePicker.onKeyDown, true);

    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(GUIDE_ID)?.remove();
    activePicker = null;
  }

  function startPicker(initialTarget) {
    stopPicker();
    ensureGuide();

    let current = initialTarget && !isUnsafeTarget(initialTarget)
      ? initialTarget
      : null;

    if (current) drawOverlay(current);

    const onMove = (event) => {
      const target = getBlockTarget(event.target);
      if (!target || target === current) return;
      current = target;
      drawOverlay(current);
    };

    const onClick = (event) => {
      const target = current || getBlockTarget(event.target);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      stopPicker();
      saveAndHide(target, "picker");
    };

    const onContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      stopPicker();
      showToast({
        title: "영역 선택 취소",
        desc: "아무 영역도 숨기지 않았습니다.",
        variant: "success"
      });
    };

    activePicker = { onMove, onClick, onContextMenu, onKeyDown };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function handleContextMenu(event) {
    if (isExtensionUi(event.target)) return;

    const target = getBlockTarget(event.target);
    lastContextElement = target;
    lastContextAt = Date.now();
  }

  document.addEventListener("contextmenu", handleContextMenu, { capture: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "dcb.areaPicker.blockContextTarget" && message?.type !== "dcb.areaPicker.start") {
      return;
    }

    const targetIsFresh =
      lastContextElement &&
      document.documentElement.contains(lastContextElement) &&
      Date.now() - lastContextAt < 15000;

    if (message.type === "dcb.areaPicker.start" || !targetIsFresh || isUnsafeTarget(lastContextElement)) {
      startPicker(targetIsFresh ? lastContextElement : null);
      sendResponse?.({ ok: true, mode: "picker" });
      return true;
    }

    saveAndHide(lastContextElement, "contextMenu")
      .then((res) => sendResponse?.(res))
      .catch((error) => {
        showToast({
          title: "영역 숨김 실패",
          desc: error?.message || String(error),
          variant: "error"
        });
        sendResponse?.({ ok: false, reason: "ERROR", message: error?.message || String(error) });
      });

    return true;
  });
})();
