/* Shared reading-font controls. Settings menus keep their own stable typography. */
(() => {
  if (!window.DCBFont || !globalThis.chrome?.storage?.sync) return;

  const fontSelect = document.getElementById("dcbFontFamily");
  const customInput = document.getElementById("dcbFontCustomFamily");
  const fontScaleRange = document.getElementById("dcbFontScale");
  const fontScaleValue = document.getElementById("dcbFontScaleValue");
  const applyToDcToggle = document.getElementById("dcbApplyFontToDc");
  const fontHint = document.getElementById("dcbFontHint");
  const googleFontsLink = document.getElementById("dcbGoogleFontsLink");
  const resetButton = document.getElementById("dcbFontReset");
  const fontPreview = document.getElementById("dcbFontPreview");
  if (!fontSelect && !customInput && !fontScaleRange && !applyToDcToggle) return;

  let saveTimer = null;
  let requestVersion = 0;

  function ensureNode(id, tag) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement(tag);
      node.id = id;
      document.head.appendChild(node);
    }
    return node;
  }

  function setScaleValue(scale) {
    const safeScale = DCBFont.normalizeFontScale(scale);
    if (fontScaleRange) {
      fontScaleRange.min = DCBFont.MIN_FONT_SCALE;
      fontScaleRange.max = DCBFont.MAX_FONT_SCALE;
      fontScaleRange.step = 5;
      fontScaleRange.value = String(safeScale);
      fontScaleRange.setAttribute("aria-valuetext", `원래 글자 크기의 ${safeScale}%`);
    }
    if (fontScaleValue) fontScaleValue.textContent = `${safeScale}%`;
    return safeScale;
  }

  function showPreview(conf) {
    const family = DCBFont.getEffectiveFontFamily(conf);
    const scale = DCBFont.normalizeFontScale(conf.dcbFontScale);
    const link = ensureNode("dcb-ui-google-font", "link");
    link.rel = "stylesheet";
    const href = DCBFont.googleFontHref(family);
    if (link.getAttribute("href") !== href) link.href = href;
    ensureNode("dcb-ui-font-style", "style").textContent = `
      #dcbFontPreview {
        font-family:${DCBFont.cssFontStack(family)} !important;
        font-size:${14 * scale / 100}px !important;
        line-height:1.6; overflow-wrap:anywhere; white-space:normal;
      }
      #dcbFontFamily, #dcbFontCustomFamily { width:100%; min-width:0; min-height:36px; }
      #dcbFontScale { width:100%; min-width:0; }
      #dcbFontHint { display:block; white-space:normal; overflow-wrap:anywhere; line-height:1.5; }
    `;
    if (fontPreview) fontPreview.title = `${family} · ${scale}% 미리보기`;
    if (fontHint) {
      fontHint.textContent = conf.dcbApplyFontToDc === true
        ? `제목·본문·댓글에 ${scale}%로 적용 중. 끄면 원래 글꼴과 크기로 돌아갑니다.`
        : "디시 기본 글꼴 사용 중. 켜면 선택한 글꼴과 크기를 적용합니다.";
    }
  }

  function renderControls(settings, { force = false } = {}) {
    const conf = { ...DCBFont.STORAGE_DEFAULTS, ...settings };
    const selected = DCBFont.getSelectValue(conf);
    DCBFont.populateFontSelect(fontSelect, selected);
    if (customInput) {
      if (force || document.activeElement !== customInput) {
        customInput.value = selected === DCBFont.CUSTOM_FONT_VALUE && conf.dcbFontFamily !== DCBFont.CUSTOM_FONT_VALUE
          ? DCBFont.getEffectiveFontFamily(conf) : conf.dcbFontCustomFamily || "";
      }
      customInput.style.display = selected === DCBFont.CUSTOM_FONT_VALUE ? "block" : "none";
    }
    setScaleValue(conf.dcbFontScale);
    if (applyToDcToggle) applyToDcToggle.checked = conf.dcbApplyFontToDc === true;
    if (googleFontsLink) googleFontsLink.href = DCBFont.GOOGLE_FONTS_KOREAN_URL;
    showPreview(conf);
  }

  function getCurrentPatch() {
    return {
      dcbFontFamily: fontSelect?.value || DCBFont.DEFAULT_FONT_FAMILY,
      dcbFontCustomFamily: DCBFont.normalizeFontFamily(customInput?.value || ""),
      dcbFontScale: DCBFont.normalizeFontScale(fontScaleRange?.value || DCBFont.DEFAULT_FONT_SCALE),
      dcbApplyFontToDc: !!applyToDcToggle?.checked
    };
  }

  function persist(patch) {
    saveTimer = null;
    chrome.storage.sync.set(patch, () => {
      if (chrome.runtime?.lastError && fontHint) {
        fontHint.textContent = "글꼴 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }
    });
  }

  function saveFontSettings({ immediate = false } = {}) {
    ++requestVersion;
    const patch = getCurrentPatch();
    if (customInput) customInput.style.display = patch.dcbFontFamily === DCBFont.CUSTOM_FONT_VALUE ? "block" : "none";
    setScaleValue(patch.dcbFontScale);
    showPreview(patch);
    clearTimeout(saveTimer);
    if (immediate) persist(patch);
    else saveTimer = setTimeout(() => persist(patch), 180);
  }

  function loadControls() {
    const version = ++requestVersion;
    chrome.storage.sync.get(DCBFont.STORAGE_DEFAULTS, (conf) => {
      if (version === requestVersion && !chrome.runtime?.lastError) renderControls(conf);
    });
  }

  if (fontHint) {
    fontHint.setAttribute("role", "status");
    fontHint.setAttribute("aria-live", "polite");
  }
  fontSelect?.addEventListener("change", () => saveFontSettings({ immediate: true }));
  customInput?.addEventListener("input", () => saveFontSettings());
  customInput?.addEventListener("change", () => saveFontSettings({ immediate: true }));
  customInput?.addEventListener("blur", () => saveFontSettings({ immediate: true }));
  fontScaleRange?.addEventListener("input", () => saveFontSettings());
  fontScaleRange?.addEventListener("change", () => saveFontSettings({ immediate: true }));
  applyToDcToggle?.addEventListener("change", () => saveFontSettings({ immediate: true }));
  resetButton?.addEventListener("click", () => {
    ++requestVersion;
    clearTimeout(saveTimer);
    const defaults = { ...DCBFont.STORAGE_DEFAULTS };
    renderControls(defaults, { force: true });
    persist(defaults);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && Object.keys(DCBFont.STORAGE_DEFAULTS).some((key) => key in changes)) loadControls();
  });
  loadControls();
})();
