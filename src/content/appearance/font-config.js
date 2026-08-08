/*****************************************************************
 * font-config.js — Google Fonts 기반 공통 글꼴 설정
 *****************************************************************/
(() => {
  const DEFAULT_FONT_FAMILY = "Noto Sans KR";
  const DEFAULT_FONT_SCALE = 100;
  const MIN_FONT_SCALE = 90;
  const MAX_FONT_SCALE = 140;
  const CUSTOM_FONT_VALUE = "__custom__";
  const GOOGLE_FONTS_KOREAN_URL = "https://fonts.google.com/?query=korean&preview.script=Kore&preview.lang=ko_Kore";

  const FONT_CHOICES = [
    { value: DEFAULT_FONT_FAMILY, label: "Noto Sans Korean / Noto Sans KR" },
    { value: "Nanum Gothic", label: "나눔고딕 / Nanum Gothic" },
    { value: "Nanum Myeongjo", label: "나눔명조 / Nanum Myeongjo" },
    { value: "Noto Serif KR", label: "Noto Serif Korean / Noto Serif KR" },
    { value: "IBM Plex Sans KR", label: "IBM Plex Sans KR" },
    { value: "Gowun Dodum", label: "고운돋움 / Gowun Dodum" },
    { value: "Gowun Batang", label: "고운바탕 / Gowun Batang" },
    { value: "Hahmlet", label: "함렛 / Hahmlet" },
    { value: "Jua", label: "주아 / Jua" },
    { value: "Do Hyeon", label: "도현 / Do Hyeon" },
    { value: "Black Han Sans", label: "검은고딕 / Black Han Sans" },
    { value: "Poor Story", label: "Poor Story" },
    { value: "Gamja Flower", label: "감자꽃 / Gamja Flower" },
    { value: "Single Day", label: "Single Day" },
    { value: "Hi Melody", label: "Hi Melody" },
    { value: "Sunflower", label: "Sunflower" },
    { value: CUSTOM_FONT_VALUE, label: "직접 입력 — Google Fonts family name" }
  ];

  const STORAGE_DEFAULTS = {
    dcbFontFamily: DEFAULT_FONT_FAMILY,
    dcbFontCustomFamily: "",
    dcbFontScale: DEFAULT_FONT_SCALE,
    dcbApplyFontToDc: true
  };

  function normalizeFontFamily(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\n\r\t]/g, " ")
      .replace(/[;'{}<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function normalizeFontScale(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return DEFAULT_FONT_SCALE;

    const rounded = Math.round(raw / 5) * 5;
    return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, rounded));
  }

  function getEffectiveFontFamily(conf = {}) {
    const selected = normalizeFontFamily(conf.dcbFontFamily) || DEFAULT_FONT_FAMILY;

    if (selected === CUSTOM_FONT_VALUE) {
      return normalizeFontFamily(conf.dcbFontCustomFamily) || DEFAULT_FONT_FAMILY;
    }

    return selected;
  }

  function getSelectValue(conf = {}) {
    const selected = normalizeFontFamily(conf.dcbFontFamily) || DEFAULT_FONT_FAMILY;
    const known = FONT_CHOICES.some((item) => item.value === selected);
    return known ? selected : CUSTOM_FONT_VALUE;
  }

  function escapeCssString(value) {
    return normalizeFontFamily(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  function cssFontStack(fontFamily) {
    const safe = escapeCssString(fontFamily) || DEFAULT_FONT_FAMILY;
    return `"${safe}", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  }

  function googleFontHref(fontFamily) {
    const safe = normalizeFontFamily(fontFamily) || DEFAULT_FONT_FAMILY;
    const family = encodeURIComponent(safe).replace(/%20/g, "+");
    return `https://fonts.googleapis.com/css2?family=${family}:wght@400&display=swap`;
  }

  function populateFontSelect(select, selectedValue) {
    if (!select) return;

    if (!select.dataset.dcbFontPopulated) {
      select.innerHTML = "";

      FONT_CHOICES.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
      });

      select.dataset.dcbFontPopulated = "1";
    }

    select.value = selectedValue || DEFAULT_FONT_FAMILY;
  }

  window.DCBFont = {
    DEFAULT_FONT_FAMILY,
    DEFAULT_FONT_SCALE,
    MIN_FONT_SCALE,
    MAX_FONT_SCALE,
    CUSTOM_FONT_VALUE,
    GOOGLE_FONTS_KOREAN_URL,
    FONT_CHOICES,
    STORAGE_DEFAULTS,
    normalizeFontFamily,
    normalizeFontScale,
    getEffectiveFontFamily,
    getSelectValue,
    cssFontStack,
    googleFontHref,
    populateFontSelect
  };
})();
