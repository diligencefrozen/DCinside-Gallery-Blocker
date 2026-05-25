/*****************************************************************
 * font-ui.js — popup/options 글꼴 UI
 *****************************************************************/
(() => {
  if (!window.DCBFont || !globalThis.chrome?.storage?.sync) return;

  const FONT_LINK_ID = "dcb-ui-google-font";
  const FONT_STYLE_ID = "dcb-ui-font-style";

  const fontSelect = document.getElementById("dcbFontFamily");
  const customInput = document.getElementById("dcbFontCustomFamily");
  const fontScaleRange = document.getElementById("dcbFontScale");
  const fontScaleValue = document.getElementById("dcbFontScaleValue");
  const applyToDcToggle = document.getElementById("dcbApplyFontToDc");
  const fontHint = document.getElementById("dcbFontHint");
  const googleFontsLink = document.getElementById("dcbGoogleFontsLink");

  if (!fontSelect && !customInput && !fontScaleRange && !applyToDcToggle) return;

  let saveTimer = null;

  function ensureFontLink() {
    let link = document.getElementById(FONT_LINK_ID);

    if (!link) {
      link = document.createElement("link");
      link.id = FONT_LINK_ID;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    return link;
  }

  function ensureFontStyle() {
    let style = document.getElementById(FONT_STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = FONT_STYLE_ID;
      document.head.appendChild(style);
    }

    return style;
  }

  function setScaleValue(scale) {
    const safeScale = DCBFont.normalizeFontScale(scale);

    if (fontScaleRange) {
      fontScaleRange.min = DCBFont.MIN_FONT_SCALE;
      fontScaleRange.max = DCBFont.MAX_FONT_SCALE;
      fontScaleRange.step = 5;
      fontScaleRange.value = String(safeScale);
    }

    if (fontScaleValue) {
      fontScaleValue.textContent = `${safeScale}%`;
    }

    return safeScale;
  }

  function applyUiFont(conf = {}) {
    const fontFamily = DCBFont.getEffectiveFontFamily(conf);
    const fontScale = DCBFont.normalizeFontScale(conf.dcbFontScale);
    const ratio = (fontScale / 100).toFixed(2);
    const stack = DCBFont.cssFontStack(fontFamily);

    ensureFontLink().href = DCBFont.googleFontHref(fontFamily);
    ensureFontStyle().textContent = `
      :root { --dcb-font-scale: ${ratio}; }

      html, body, button, input, select, textarea {
        font-family: ${stack} !important;
      }

      body {
        line-height: 1.55 !important;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }

      button, input, select, textarea {
        line-height: 1.45 !important;
      }

      #dcbFontFamily,
      #dcbFontCustomFamily {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 36px !important;
        font-size: clamp(13px, calc(14px * var(--dcb-font-scale)), 18px) !important;
      }

      #dcbFontScale {
        width: 100% !important;
        min-width: 0 !important;
      }

      #dcbFontScaleValue,
      #dcbFontHint {
        font-size: clamp(11px, calc(12px * var(--dcb-font-scale)), 15px) !important;
        line-height: 1.45 !important;
      }
    `;

    if (fontHint) {
      const isDefault = fontFamily === DCBFont.DEFAULT_FONT_FAMILY && fontScale === DCBFont.DEFAULT_FONT_SCALE;
      const applyToDc = conf.dcbApplyFontToDc !== false;
      fontHint.textContent = isDefault
        ? `기본값: Noto Sans Korean Regular 400 · ${fontScale}% · 디시 적용 ${applyToDc ? "ON" : "OFF"}`
        : `현재: ${fontFamily} Regular 400 · ${fontScale}% · 디시 적용 ${applyToDc ? "ON" : "OFF"}`;
    }
  }

  function renderControls(conf = {}) {
    const selectedValue = DCBFont.getSelectValue(conf);
    DCBFont.populateFontSelect(fontSelect, selectedValue);

    if (customInput) {
      if (document.activeElement !== customInput) {
        customInput.value = conf.dcbFontCustomFamily || "";
      }
      customInput.style.display = selectedValue === DCBFont.CUSTOM_FONT_VALUE ? "block" : "none";
    }

    setScaleValue(conf.dcbFontScale);

    if (applyToDcToggle) {
      applyToDcToggle.checked = conf.dcbApplyFontToDc !== false;
    }

    if (googleFontsLink) {
      googleFontsLink.href = DCBFont.GOOGLE_FONTS_KOREAN_URL;
    }

    applyUiFont(conf);
  }

  function getCurrentPatch() {
    const selected = fontSelect ? fontSelect.value : DCBFont.DEFAULT_FONT_FAMILY;
    const custom = DCBFont.normalizeFontFamily(customInput?.value || "");
    const scale = DCBFont.normalizeFontScale(fontScaleRange?.value || DCBFont.DEFAULT_FONT_SCALE);

    return {
      dcbFontFamily: selected,
      dcbFontCustomFamily: custom,
      dcbFontScale: scale,
      dcbApplyFontToDc: applyToDcToggle ? !!applyToDcToggle.checked : true
    };
  }

  function saveFontSettings({ immediate = false } = {}) {
    const patch = getCurrentPatch();

    if (customInput) {
      customInput.style.display = patch.dcbFontFamily === DCBFont.CUSTOM_FONT_VALUE ? "block" : "none";
    }

    setScaleValue(patch.dcbFontScale);
    applyUiFont(patch);

    if (saveTimer) clearTimeout(saveTimer);

    const persist = () => chrome.storage.sync.set(patch);

    if (immediate) persist();
    else saveTimer = setTimeout(persist, 120);
  }

  chrome.storage.sync.get(DCBFont.STORAGE_DEFAULTS, renderControls);

  if (fontSelect) {
    fontSelect.addEventListener("change", () => saveFontSettings({ immediate: true }));
  }

  if (customInput) {
    customInput.addEventListener("input", () => saveFontSettings());
    customInput.addEventListener("change", () => saveFontSettings({ immediate: true }));
    customInput.addEventListener("blur", () => saveFontSettings({ immediate: true }));
  }

  if (fontScaleRange) {
    fontScaleRange.addEventListener("input", () => saveFontSettings());
    fontScaleRange.addEventListener("change", () => saveFontSettings({ immediate: true }));
  }

  if (applyToDcToggle) {
    applyToDcToggle.addEventListener("change", () => saveFontSettings({ immediate: true }));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (
      changes.dcbFontFamily ||
      changes.dcbFontCustomFamily ||
      changes.dcbFontScale ||
      changes.dcbApplyFontToDc
    ) {
      chrome.storage.sync.get(DCBFont.STORAGE_DEFAULTS, renderControls);
    }
  });
})();
