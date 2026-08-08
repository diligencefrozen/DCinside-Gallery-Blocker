/* dc-theme-bridge.js
 * Connects the extension toggle to the page theme switch.
 * Important: the page theme function is a toggle, not a setter.
 * This bridge detects the visible theme state and switches only when needed.
 */
(() => {
  if (window.__DCB_DC_THEME_BRIDGE__) return;
  window.__DCB_DC_THEME_BRIDGE__ = true;

  const LAST_STATE_KEY = "dcbDcLastThemeState";
  const MESSAGE_GET = "DCB_DC_THEME_GET_STATE";
  const MESSAGE_SET = "DCB_DC_THEME_SET_STATE";

  let applying = false;
  let manualSyncTimer = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function getPageThemeToggle() {
    const selectors = [
      "a.darkonoff[onclick*='darkmode']",
      ".darkmodebox a[onclick*='darkmode']",
      "a.menu_link[onclick*='darkmode']",
      "a[onclick='darkmode()']",
      "a[onclick*='darkmode()']"
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }

    return null;
  }

  function getToggleHintState() {
    const toggle = getPageThemeToggle();
    if (!toggle) return null;

    const text = normalizeText([
      toggle.textContent,
      toggle.getAttribute("aria-label"),
      toggle.getAttribute("title")
    ].join(" "));

    const icon = toggle.querySelector("em, i, span");
    const classText = normalizeText([
      toggle.className,
      icon && icon.className
    ].join(" "));

    // The page theme button usually describes the next action.
    // "야간모드" / dark icon means the current page is still Light.
    if (/야간\s*모드|다크\s*모드|dark\s*mode|night\s*mode/.test(text)) {
      if (!/주간\s*모드|라이트\s*모드|light\s*mode|day\s*mode|해제|끄기|off/.test(text)) {
        return false;
      }
    }

    // If it offers Day/Light mode, the current page is Dark.
    if (/주간\s*모드|라이트\s*모드|light\s*mode|day\s*mode/.test(text)) {
      return true;
    }

    if (/icon_[a-z]*dark|icon_tdark|icon_sdark/.test(classText)) return false;
    if (/icon_[a-z]*light|icon_tlight|icon_slight/.test(classText)) return true;

    return null;
  }

  function parseRgb(color) {
    const match = String(color || "").match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;

    const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.slice(0, 3).some((num) => Number.isNaN(num))) return null;

    const alpha = parts.length >= 4 ? parts[3] : 1;
    if (alpha === 0) return null;

    return parts.slice(0, 3);
  }

  function luminance(rgb) {
    if (!rgb) return null;
    return (rgb[0] * 0.2126) + (rgb[1] * 0.7152) + (rgb[2] * 0.0722);
  }

  function getVisibleThemeState() {
    const candidates = [
      document.body,
      document.querySelector("#container"),
      document.querySelector(".left_content"),
      document.querySelector(".view_content_wrap"),
      document.querySelector(".view_content"),
      document.querySelector(".gall_listwrap"),
      document.querySelector(".wrap_inner"),
      document.querySelector(".dcwrap"),
      document.querySelector("#top")
    ].filter(Boolean);

    let darkVotes = 0;
    let lightVotes = 0;

    for (const node of candidates) {
      const bg = parseRgb(window.getComputedStyle(node).backgroundColor);
      const lum = luminance(bg);
      if (lum === null) continue;

      if (lum <= 90) darkVotes += 1;
      else if (lum >= 180) lightVotes += 1;
    }

    if (lightVotes || darkVotes) {
      // A single blue/black navigation bar should not make a visibly Light page
      // look Dark. Content-area Light votes win ties.
      if (lightVotes >= darkVotes) return false;
      return true;
    }

    return null;
  }

  function readCurrentThemeState() {
    // The visible page colors are the most reliable signal after toggling.
    // Some pages keep the theme button text as
    // "야간모드" even after the page has visibly switched to Dark.
    const byVisibleColor = getVisibleThemeState();
    if (typeof byVisibleColor === "boolean") return byVisibleColor;

    const byToggle = getToggleHintState();
    if (typeof byToggle === "boolean") return byToggle;

    // Do not trust html.darkmode by itself. On some DC pages it exists while the page is visibly Light.
    return false;
  }

  function isDark() {
    return readCurrentThemeState();
  }

  function canAttemptPageThemeToggle() {
    return /(^|\.)dcinside\.com$/i.test(location.hostname) && !!document.documentElement;
  }

  function injectPageThemeToggleOnce() {
    const script = document.createElement("script");
    script.textContent = `(() => { try { if (typeof darkmode === "function") darkmode(); } catch (e) {} })();`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  }

  function clickPageThemeToggleOnce() {
    const toggle = getPageThemeToggle();
    if (toggle) {
      toggle.click();
      return true;
    }

    injectPageThemeToggleOnce();
    return true;
  }

  function detectSource() {
    if (typeof getVisibleThemeState() === "boolean") return "visible-color";
    if (typeof getToggleHintState() === "boolean") return "page-toggle";
    return "fallback-light";
  }

  function statePayload() {
    return {
      available: !!getPageThemeToggle() || canAttemptPageThemeToggle(),
      isDark: isDark(),
      isApplying: applying,
      source: detectSource(),
      url: location.href
    };
  }

  function rememberState() {
    chrome.storage.local.set({
      [LAST_STATE_KEY]: {
        isDark: isDark(),
        source: detectSource(),
        url: location.href,
        updatedAt: Date.now()
      }
    });
  }

  async function waitForDesiredState(desired, timeout = 1800) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      // Re-check actual rendered colors first. This prevents the popup toggle
      // from bouncing back when the page button text lags behind.
      const byVisibleColor = getVisibleThemeState();
      if (typeof byVisibleColor === "boolean" && byVisibleColor === desired) return true;

      if (isDark() === desired) return true;
      await sleep(50);
    }

    const byVisibleColor = getVisibleThemeState();
    if (typeof byVisibleColor === "boolean") return byVisibleColor === desired;
    return isDark() === desired;
  }

  async function applyDcTheme(desired) {
    desired = !!desired;

    const waitStarted = Date.now();
    while (applying && Date.now() - waitStarted < 1600) {
      await sleep(50);
    }

    if (applying) return statePayload();

    applying = true;
    try {
      const before = isDark();
      let clicked = false;

      if (before !== desired) {
        clicked = clickPageThemeToggleOnce();
        await waitForDesiredState(desired);
      }

      rememberState();

      const payload = statePayload();
      payload.requestedState = desired;
      payload.clicked = clicked;

      // If the page button label still reports the old state right after
      // the click, keep the popup switch locked to the user's requested state.
      // The next popup open will re-read the actual rendered page state.
      if (clicked && payload.isDark !== desired) {
        payload.isDark = desired;
        payload.source = "requested-after-toggle";
      }

      return payload;
    } finally {
      applying = false;
    }
  }

  function syncManualThemeToggle() {
    window.clearTimeout(manualSyncTimer);
    manualSyncTimer = window.setTimeout(rememberState, 120);
  }

  function observeThemeSignals() {
    const observer = new MutationObserver(syncManualThemeToggle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });

    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || (message.type !== MESSAGE_GET && message.type !== MESSAGE_SET)) return false;

    if (message.type === MESSAGE_GET) {
      rememberState();
      sendResponse(statePayload());
      return true;
    }

    applyDcTheme(!!message.enabled).then(sendResponse);
    return true;
  });

  observeThemeSignals();
  rememberState();
})();
