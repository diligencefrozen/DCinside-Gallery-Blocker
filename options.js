/* options.js */

/* ───── 상수 ───── */
const builtinBlocked = ["dcbest"];

const recommendedIds = [
  "4year_university","alliescon","asdf12","canada","centristconservatis",
  "colonialism","disease","divination_new1","ehxoeh","employment",
  "escapekorea","escapekoreagall","foreversolo","immovables","iphone",
  "jpjobngm","leejaemyung","m_entertainer_new1","minjudang","neostock",
  "newtheory","nobirthgall","singlebungle1472","smartphone",
  "thesingularity","w_entertainer","loveconsultation"
].map(s => s.toLowerCase());

const recSelectors = [
  "div#dna_content.content.news_con",
  "div.content.concept_con",
  "div.content_box.dcmedia",
  "div.content_box.new_gall",
  "div.time_best",
  "div.trend.vote"
];

const recGallSelectors = [
  "div.ad_bottom_list[style]",
  "div.content_box.r_recommend[data-rand]",
  "div.content_box.r_timebest",
  "div.content_box.r_dcmedia"
];

const recSearchSelectors = [
  "div.content_box.r_only_daum",
  "div.content_box.r_recommend",
  "div.content_box.r_timebest",
  "div.integrate_cont.news_result",
  "section.left_content",
  "section.right_content"
];

const KEYWORD_DEFAULT_TARGETS = {
  listTitle: true,
  viewTitle: true,
  viewBody: true,
  comments: true
};

const IMAGE_BLOCK_CONFIG_KEY = "dcbImageBlockConfig";
const IMAGE_BLOCK_RECORD_KEY = "dcbImageBlockRecords";
const IMAGE_BLOCK_CONFIG_DEFAULT = {
  enabled: false,
  toolbar: false,
  blurAnonymous: false,
  blurSemi: false,
  blurNew: false,
  blurFixed: false,
  blurManager: false,
  normalPost: false,
  recommendedPost: false,
  skipSmall: false,
  minWidth: 160,
  minHeight: 160,
  tallImage: false,
  maxHeight: 1200,
  shortcuts: false,
  hideBlockedNotice: false
};

const BACKUP_KEYS = [
  "blockedIds", "removeSelectors", "removeSelectorsGall", "removeSelectorsSearch",
  "userBlockEnabled", "userBlockTriggerMode", "userBlockHoverHintEnabled", "blockedUids", "hideComment", "hideImgComment", "hideDccon",
  "hideMainEnabled", "hideGallEnabled", "hideSearchEnabled",
  "enabled", "galleryBlockEnabled", "builtinDcbestBlockEnabled", "blockMode", "quickBlockButtonPosition", "quickBlockButtonPositionSavedAt", "autoRefreshEnabled",
  "autoRefreshInterval", "delay", "showUidBadge", "linkWarnEnabled", "hideDCGray",
  "previewEnabled", "hideAnonymousEnabled", "gamemecaBlockEnabled", "doryBlockEnabled", "noticeBlockEnabled", "compactListEnabled",
  "userMemoEnabled", "userMemos",
  IMAGE_BLOCK_CONFIG_KEY, IMAGE_BLOCK_RECORD_KEY,
  "keywordBlockEnabled", "blockedKeywords", "keywordBlockTargets",
  "keywordHideEnabled", "hiddenKeywords", "keywordHideTargets",
  "dcbFontFamily", "dcbFontCustomFamily", "dcbFontScale", "dcbApplyFontToDc"
];

const BACKUP_DEFAULTS = {
  blockedIds: [],
  removeSelectors: [],
  removeSelectorsGall: [],
  removeSelectorsSearch: [],
  userBlockEnabled: true,
  userBlockTriggerMode: "instant",
  userBlockHoverHintEnabled: true,
  blockedUids: [],
  hideComment: false,
  hideImgComment: false,
  hideDccon: false,
  hideMainEnabled: true,
  hideGallEnabled: true,
  hideSearchEnabled: true,
  enabled: true,
  galleryBlockEnabled: undefined,
  builtinDcbestBlockEnabled: true,
  blockMode: "smart",
  quickBlockButtonPosition: "right-top",
  quickBlockButtonPositionSavedAt: 0,
  autoRefreshEnabled: false,
  autoRefreshInterval: 60,
  delay: 5,
  showUidBadge: false,
  linkWarnEnabled: true,
  hideDCGray: undefined,
  previewEnabled: false,
  hideAnonymousEnabled: false,
  gamemecaBlockEnabled: true,
  doryBlockEnabled: true,
  noticeBlockEnabled: true,
  compactListEnabled: false,
  userMemoEnabled: true,
  userMemos: {},
  [IMAGE_BLOCK_CONFIG_KEY]: IMAGE_BLOCK_CONFIG_DEFAULT,
  [IMAGE_BLOCK_RECORD_KEY]: {},
  keywordBlockEnabled: false,
  blockedKeywords: [],
  keywordBlockTargets: KEYWORD_DEFAULT_TARGETS,
  keywordHideEnabled: false,
  hiddenKeywords: [],
  keywordHideTargets: KEYWORD_DEFAULT_TARGETS,
  dcbFontFamily: "Noto Sans KR",
  dcbFontCustomFamily: "",
  dcbFontScale: 100,
  dcbApplyFontToDc: true
};

/* ───── DOM 캐시 ───── */
const newIdInput = document.getElementById("newId");
const addBtn = document.getElementById("addBtn");
const listEl = document.getElementById("list");
const recList = document.getElementById("recList");
const addAllRec = document.getElementById("addAllRec");

const newSel = document.getElementById("newSel");
const addSelBtn = document.getElementById("addSelBtn");
const addRecSel = document.getElementById("addRecSel");
const selList = document.getElementById("selList");

const newGallSel = document.getElementById("newGallSel");
const addGallSelBtn = document.getElementById("addGallSelBtn");
const addRecGallSel = document.getElementById("addRecGallSel");
const gallSelList = document.getElementById("gallSelList");

const newSearchSel = document.getElementById("newSearchSel");
const addSearchSelBtn = document.getElementById("addSearchSelBtn");
const addRecSearchSel = document.getElementById("addRecSearchSel");
const searchSelList = document.getElementById("searchSelList");

const userBlockEl = document.getElementById("userBlockEnabled");
const userBlockTriggerModeEl = document.getElementById("userBlockTriggerMode");
const userBlockHoverHintEl = document.getElementById("userBlockHoverHintEnabled");
const userBlockHoverHintRow = document.getElementById("userBlockHoverHintRow") || userBlockHoverHintEl?.closest?.(".row");
const optionUserBlockModeTitle = document.getElementById("optionUserBlockModeTitle");
const optionUserBlockModeText = document.getElementById("optionUserBlockModeText");
const optionUserBlockModeSub = document.getElementById("optionUserBlockModeSub");
const uidInput = document.getElementById("uidInput");
const addUidBtn = document.getElementById("addUidBtn");
const uidListEl = document.getElementById("uidList");

const galleryBlockEnabledEl = document.getElementById("galleryBlockEnabled");
const builtinDcbestBlockEnabledEl = document.getElementById("builtinDcbestBlockEnabled");
const blockModeEl = document.getElementById("blockMode");
const quickBlockButtonPositionEl = document.getElementById("quickBlockButtonPosition");
const blockModeHintEl = document.getElementById("blockModeHint");
const delayNumEl = document.getElementById("delayNum");
const delayRangeEl = document.getElementById("delayRange");
const delaySectionEl = document.getElementById("delaySection");
const autoRefreshEnabledEl = document.getElementById("autoRefreshEnabled");
const autoRefreshIntervalNumEl = document.getElementById("autoRefreshIntervalNum");
const autoRefreshIntervalRangeEl = document.getElementById("autoRefreshIntervalRange");
const toggleHideMainEl = document.getElementById("toggleHideMain");
const toggleHideGallEl = document.getElementById("toggleHideGall");
const toggleHideSearchEl = document.getElementById("toggleHideSearch");
const toggleUidBadgeEl = document.getElementById("toggleUidBadge");
const compactListEnabledEl = document.getElementById("compactListEnabled");
const userMemoEnabledEl = document.getElementById("userMemoEnabled");

const previewEnabledEl = document.getElementById("previewEnabled");
const hideCommentEl = document.getElementById("hideComment");
const hideImgCommentEl = document.getElementById("hideImgComment");
const hideDcconEl = document.getElementById("hideDccon");
const hideAnonymousEl = document.getElementById("hideAnonymousEnabled");
const gamemecaBlockEnabledEl = document.getElementById("gamemecaBlockEnabled");
const doryBlockEnabledEl = document.getElementById("doryBlockEnabled");
const noticeBlockEnabledEl = document.getElementById("noticeBlockEnabled");

const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFileEl = document.getElementById("importFile");

const optionDcDarkModeToggle = document.getElementById("optionDcDarkMode");
const optionDcThemeStatus = document.getElementById("optionDcThemeStatus");
const optionDcThemeRefresh = document.getElementById("optionDcThemeRefresh");

/* 메모 관리 DOM */
const memoSearchInput = document.getElementById("memoSearchInput");
const refreshMemoListBtn = document.getElementById("refreshMemoListBtn");
const exportUserMemoBtn = document.getElementById("exportUserMemoBtn");
const importUserMemoBtn = document.getElementById("importUserMemoBtn");
const importUserMemoFile = document.getElementById("importUserMemoFile");
const memoList = document.getElementById("memoList");
const userMemoStatus = document.getElementById("userMemoStatus");

/* 키워드 차단 DOM */
const optionKeywordBlockEnabled = document.getElementById("optionKeywordBlockEnabled");
const optionKeywordInput = document.getElementById("optionKeywordInput");
const optionAddKeywordBtn = document.getElementById("optionAddKeywordBtn");
const optionKeywordList = document.getElementById("optionKeywordList");
const optionKeywordStatus = document.getElementById("optionKeywordStatus");

const keywordTargetListTitle = document.getElementById("keywordTargetListTitle");
const keywordTargetViewTitle = document.getElementById("keywordTargetViewTitle");
const keywordTargetViewBody = document.getElementById("keywordTargetViewBody");
const keywordTargetComments = document.getElementById("keywordTargetComments");

/* ───── 공통 유틸 ───── */
const norm = s => String(s || "").trim().toLowerCase();
const sanitizeUid = s => String(s || "").trim().replace(/\s+/g, "");

let userBlockEnabledState = true;
let userBlockTriggerModeState = "instant";
let userBlockHoverHintEnabledState = true;

function setChecked(el, value) {
  if (el) el.checked = !!value;
}

function setValue(el, value) {
  if (el) el.value = value;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getGalleryBlockEnabled(conf = {}) {
  return typeof conf.galleryBlockEnabled === "boolean"
    ? conf.galleryBlockEnabled
    : !!conf.enabled;
}

const QUICK_BLOCK_POSITION_VALUES = new Set([
  "right-top",
  "right-middle",
  "right-bottom",
  "left-top",
  "left-middle",
  "left-bottom"
]);

const QUICK_BLOCK_POSITION_KEY = "quickBlockButtonPosition";
const QUICK_BLOCK_POSITION_SAVED_AT_KEY = "quickBlockButtonPositionSavedAt";

function normalizeQuickBlockPosition(value) {
  const key = String(value || "").trim().toLowerCase();
  return QUICK_BLOCK_POSITION_VALUES.has(key) ? key : "right-top";
}

function quickBlockPositionTimestamp(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function pickQuickBlockPosition(syncConf = {}, localConf = {}) {
  const syncPos = normalizeQuickBlockPosition(syncConf[QUICK_BLOCK_POSITION_KEY]);
  const localRaw = String(localConf[QUICK_BLOCK_POSITION_KEY] || "").trim();
  const localValid = QUICK_BLOCK_POSITION_VALUES.has(localRaw.toLowerCase());
  const localPos = localValid ? normalizeQuickBlockPosition(localRaw) : "";
  const syncAt = quickBlockPositionTimestamp(syncConf[QUICK_BLOCK_POSITION_SAVED_AT_KEY]);
  const localAt = quickBlockPositionTimestamp(localConf[QUICK_BLOCK_POSITION_SAVED_AT_KEY]);

  if (localPos && localAt > syncAt) return localPos;
  return syncPos || localPos || "right-top";
}

function findGalleryTabs(callback) {
  if (!chrome.tabs || !chrome.tabs.query) {
    callback([]);
    return;
  }

  chrome.tabs.query({ url: "*://gall.dcinside.com/*" }, (tabs) => {
    if (chrome.runtime.lastError) {
      callback([]);
      return;
    }
    callback(Array.isArray(tabs) ? tabs : []);
  });
}

function broadcastQuickBlockPosition(position) {
  if (!chrome.tabs || !chrome.tabs.sendMessage) return;

  findGalleryTabs((tabs) => {
    tabs.forEach((tab) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, {
        type: "dcb.quickBlock.setPosition",
        position
      }, () => void chrome.runtime.lastError);
    });
  });
}

function saveQuickBlockButtonPosition(value) {
  const position = normalizeQuickBlockPosition(value);
  const patch = {
    [QUICK_BLOCK_POSITION_KEY]: position,
    [QUICK_BLOCK_POSITION_SAVED_AT_KEY]: Date.now()
  };

  setValue(quickBlockButtonPositionEl, position);
  chrome.storage.sync.set(patch);
  if (chrome.storage.local) chrome.storage.local.set(patch);
  broadcastQuickBlockPosition(position);
}

function refreshQuickBlockButtonPositionControl() {
  if (!quickBlockButtonPositionEl) return;

  const syncDefaults = {
    [QUICK_BLOCK_POSITION_KEY]: "right-top",
    [QUICK_BLOCK_POSITION_SAVED_AT_KEY]: 0
  };
  const localDefaults = {
    [QUICK_BLOCK_POSITION_KEY]: "",
    [QUICK_BLOCK_POSITION_SAVED_AT_KEY]: 0
  };

  chrome.storage.sync.get(syncDefaults, (syncConf = {}) => {
    if (!chrome.storage.local) {
      setValue(quickBlockButtonPositionEl, normalizeQuickBlockPosition(syncConf[QUICK_BLOCK_POSITION_KEY]));
      return;
    }

    chrome.storage.local.get(localDefaults, (localConf = {}) => {
      setValue(quickBlockButtonPositionEl, pickQuickBlockPosition(syncConf, localConf));
    });
  });
}

function lockDelay(disabled) {
  const nodes = [delayNumEl, delayRangeEl];
  const op = disabled ? 0.55 : 1;

  nodes.forEach((el) => {
    if (!el) return;
    el.disabled = !!disabled;
    el.style.opacity = op;
  });
}

function updateBlockModeHint(mode) {
  const hints = {
    smart: "✨ 경고 화면을 보여주고 이번만 보기 선택을 제공합니다.",
    redirect: "⏱️ 설정한 시간 후 디시 메인으로 자동 이동합니다.",
    block: "🚫 페이지 로드 전 네트워크 단계에서 완전히 차단합니다."
  };

  if (blockModeHintEl) {
    blockModeHintEl.textContent = hints[mode] || "차단 방식을 선택하세요.";
  }

  if (delaySectionEl) {
    delaySectionEl.style.display = mode === "redirect" ? "flex" : "none";
  }

  lockDelay(mode !== "redirect");
}


/* ───── 옵션 페이지: 다크모드 ───── */
let optionDcThemeApplying = false;
let optionDcThemeSeq = 0;
let optionDcThemeOptimisticUntil = 0;
let optionDcThemeOptimisticState = null;

function setOptionDcThemeStatus(text, isError = false) {
  if (!optionDcThemeStatus) return;
  optionDcThemeStatus.textContent = text || "";
  optionDcThemeStatus.style.color = isError ? "#ffb4b4" : "#8b9bb4";
}

function setOptionDcThemeBusy(isBusy) {
  optionDcThemeApplying = !!isBusy;
  if (!optionDcDarkModeToggle) return;
  optionDcDarkModeToggle.disabled = !!isBusy;
  const switchEl = optionDcDarkModeToggle.closest(".switch");
  if (switchEl) switchEl.classList.toggle("is-busy", !!isBusy);
}

function isDcInsideTab(tab) {
  try {
    const host = new URL((tab && tab.url) || "").hostname;
    return /(^|\.)dcinside\.com$/i.test(host);
  } catch (_) {
    return false;
  }
}

function lockOptionDcThemeUi(state, duration = 2600) {
  optionDcThemeOptimisticState = !!state;
  optionDcThemeOptimisticUntil = Date.now() + duration;
  setChecked(optionDcDarkModeToggle, optionDcThemeOptimisticState);
}

function shouldKeepOptionDcThemeState() {
  return optionDcThemeOptimisticState !== null && Date.now() < optionDcThemeOptimisticUntil;
}

function clearOptionDcThemeLock() {
  optionDcThemeOptimisticState = null;
  optionDcThemeOptimisticUntil = 0;
}

function applyOptionDcThemeUi(isDark) {
  setChecked(optionDcDarkModeToggle, !!isDark);
  setOptionDcThemeStatus(isDark ? "Current · Dark" : "Current · Light");
}

function findDcInsideTab(callback) {
  if (!chrome.tabs || !chrome.tabs.query) {
    callback(null, "탭 접근 불가");
    return;
  }

  const url = [
    "*://gall.dcinside.com/*",
    "*://www.dcinside.com/*"
  ];

  chrome.tabs.query({ url }, (tabs) => {
    if (chrome.runtime.lastError) {
      callback(null, chrome.runtime.lastError.message);
      return;
    }

    const list = Array.isArray(tabs) ? tabs.filter(isDcInsideTab) : [];
    const selected =
      list.find(tab => tab.active && tab.currentWindow) ||
      list.find(tab => tab.active) ||
      list[0] ||
      null;

    callback(selected, selected ? null : "열린 DC 탭 없음");
  });
}

function sendOptionDcThemeMessage(message, callback) {
  findDcInsideTab((tab, findError) => {
    if (!tab || !tab.id) {
      callback(null, findError || "열린 DC 탭 없음", null);
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        callback(null, chrome.runtime.lastError.message, tab);
        return;
      }
      callback(response || null, null, tab);
    });
  });
}

function refreshOptionDcThemeState() {
  if (!optionDcDarkModeToggle || optionDcThemeApplying || shouldKeepOptionDcThemeState()) return;

  const seq = ++optionDcThemeSeq;
  setOptionDcThemeStatus("Checking DC tab…");

  sendOptionDcThemeMessage({ type: "DCB_DC_THEME_GET_STATE" }, (state) => {
    if (seq !== optionDcThemeSeq || optionDcThemeApplying || shouldKeepOptionDcThemeState()) return;

    if (!state || !state.available) {
      setChecked(optionDcDarkModeToggle, false);
      setOptionDcThemeStatus("Open a DC tab first", false);
      return;
    }

    applyOptionDcThemeUi(!!state.isDark);
  });
}

function updateDelay(value) {
  const num = clampNumber(value, 0, 10, 5);
  setValue(delayNumEl, num);
  setValue(delayRangeEl, num);
  chrome.storage.sync.set({ delay: num });
}

function updateAutoRefreshInterval(value) {
  const num = Math.round(clampNumber(value, 10, 600, 60) / 10) * 10;
  setValue(autoRefreshIntervalNumEl, num);
  setValue(autoRefreshIntervalRangeEl, num);
  chrome.storage.sync.set({ autoRefreshInterval: num });
}

function sanitizeText(v, max = 80) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isValidColor(v) {
  return /^#[0-9a-fA-F]{6}$/.test(String(v || ""));
}

function formatDate(ts) {
  const n = Number(ts) || 0;
  if (!n) return "-";

  const d = new Date(n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function normalizeImageBlockConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const enabled = source.enabled === true;
  return {
    ...IMAGE_BLOCK_CONFIG_DEFAULT,
    ...source,
    enabled,
    toolbar: enabled,
    blurAnonymous: enabled,
    blurSemi: enabled,
    blurNew: enabled,
    blurFixed: enabled,
    blurManager: enabled,
    normalPost: enabled,
    recommendedPost: enabled,
    skipSmall: false,
    tallImage: false,
    shortcuts: false,
    hideBlockedNotice: false,
    minWidth: IMAGE_BLOCK_CONFIG_DEFAULT.minWidth,
    minHeight: IMAGE_BLOCK_CONFIG_DEFAULT.minHeight,
    maxHeight: IMAGE_BLOCK_CONFIG_DEFAULT.maxHeight
  };
}

function normalizeImageBlockRecords(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeImport(raw) {
  const body = raw && typeof raw === "object"
    ? (raw.data && typeof raw.data === "object" ? raw.data : raw)
    : null;

  if (!body || typeof body !== "object") throw new Error("invalid");

  const patch = {};

  BACKUP_KEYS.forEach(k => {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      patch[k] = body[k];
    }
  });

  if (Object.prototype.hasOwnProperty.call(patch, QUICK_BLOCK_POSITION_KEY)) {
    patch[QUICK_BLOCK_POSITION_KEY] = normalizeQuickBlockPosition(patch[QUICK_BLOCK_POSITION_KEY]);

    if (Object.prototype.hasOwnProperty.call(patch, QUICK_BLOCK_POSITION_SAVED_AT_KEY)) {
      patch[QUICK_BLOCK_POSITION_SAVED_AT_KEY] = quickBlockPositionTimestamp(patch[QUICK_BLOCK_POSITION_SAVED_AT_KEY]);
    } else {
      patch[QUICK_BLOCK_POSITION_SAVED_AT_KEY] = Date.now();
    }
  }

  if (!Object.keys(patch).length) throw new Error("empty");

  return patch;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildBackupSnapshot(syncSnapshot = {}, localSnapshot = {}) {
  const snapshot = { ...BACKUP_DEFAULTS, ...syncSnapshot };
  const localPos = String(localSnapshot[QUICK_BLOCK_POSITION_KEY] || "").trim();
  const hasLocalQuickBlockPosition = QUICK_BLOCK_POSITION_VALUES.has(localPos.toLowerCase());

  if (hasLocalQuickBlockPosition || Object.prototype.hasOwnProperty.call(syncSnapshot, QUICK_BLOCK_POSITION_KEY)) {
    const syncAt = quickBlockPositionTimestamp(syncSnapshot[QUICK_BLOCK_POSITION_SAVED_AT_KEY]);
    const localAt = quickBlockPositionTimestamp(localSnapshot[QUICK_BLOCK_POSITION_SAVED_AT_KEY]);
    const position = pickQuickBlockPosition(syncSnapshot, localSnapshot);

    snapshot[QUICK_BLOCK_POSITION_KEY] = position;
    snapshot[QUICK_BLOCK_POSITION_SAVED_AT_KEY] = Math.max(syncAt, localAt, 0);
  }

  return snapshot;
}

async function exportSettings() {
  try {
    const syncSnapshot = await chrome.storage.sync.get(BACKUP_DEFAULTS);
    const localSnapshot = chrome.storage.local
      ? await chrome.storage.local.get({
          [QUICK_BLOCK_POSITION_KEY]: "",
          [QUICK_BLOCK_POSITION_SAVED_AT_KEY]: 0,
          userMemos: {},
          [IMAGE_BLOCK_CONFIG_KEY]: null,
          [IMAGE_BLOCK_RECORD_KEY]: {}
        })
      : {};

    const blockedUids = globalThis.DCBUserBlockStore?.getAllTokens
      ? await DCBUserBlockStore.getAllTokens()
      : [];

    const snapshot = buildBackupSnapshot(syncSnapshot, localSnapshot);
    snapshot.blockedUids = blockedUids;
    snapshot.userMemos = normalizeImportedMemoObject(localSnapshot.userMemos || {});
    snapshot[IMAGE_BLOCK_CONFIG_KEY] = normalizeImageBlockConfig(
      localSnapshot[IMAGE_BLOCK_CONFIG_KEY] || syncSnapshot[IMAGE_BLOCK_CONFIG_KEY]
    );
    snapshot[IMAGE_BLOCK_RECORD_KEY] = normalizeImageBlockRecords(localSnapshot[IMAGE_BLOCK_RECORD_KEY]);

    const payload = {
      version: 4,
      exportedAt: new Date().toISOString(),
      data: snapshot
    };

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`dcb-settings-${ts}.json`, payload);
  } catch (err) {
    console.error("[DCB] backup export failed", err);
    alert("백업 파일을 만들지 못했습니다. 확장 프로그램을 다시 로드한 뒤 시도하세요.");
  }
}

function importSettingsFromFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const patch = sanitizeImport(parsed);
      const quickBlockPatch = {};
      const hasBlockedUids = Object.prototype.hasOwnProperty.call(patch, "blockedUids");
      const blockedUidsPatch = hasBlockedUids && Array.isArray(patch.blockedUids)
        ? patch.blockedUids
        : null;
      const hasUserMemos = Object.prototype.hasOwnProperty.call(patch, "userMemos");
      const userMemosPatch = hasUserMemos
        ? normalizeImportedMemoObject(patch.userMemos || {})
        : null;
      const hasImageBlockConfig = Object.prototype.hasOwnProperty.call(patch, IMAGE_BLOCK_CONFIG_KEY);
      const imageBlockConfigPatch = hasImageBlockConfig
        ? normalizeImageBlockConfig(patch[IMAGE_BLOCK_CONFIG_KEY])
        : null;
      const hasImageBlockRecords = Object.prototype.hasOwnProperty.call(patch, IMAGE_BLOCK_RECORD_KEY);
      const imageBlockRecordsPatch = hasImageBlockRecords
        ? normalizeImageBlockRecords(patch[IMAGE_BLOCK_RECORD_KEY])
        : null;

      delete patch.blockedUids;
      delete patch.userMemos;
      delete patch[IMAGE_BLOCK_RECORD_KEY];
      if (hasImageBlockConfig) patch[IMAGE_BLOCK_CONFIG_KEY] = imageBlockConfigPatch;

      if (Object.prototype.hasOwnProperty.call(patch, QUICK_BLOCK_POSITION_KEY)) {
        quickBlockPatch[QUICK_BLOCK_POSITION_KEY] = patch[QUICK_BLOCK_POSITION_KEY];
        quickBlockPatch[QUICK_BLOCK_POSITION_SAVED_AT_KEY] = quickBlockPositionTimestamp(
          patch[QUICK_BLOCK_POSITION_SAVED_AT_KEY]
        ) || Date.now();
      }

      const syncKeys = Object.keys(patch);
      if (syncKeys.length) {
        await chrome.storage.sync.set(patch);
      }

      if (chrome.storage.local && Object.keys(quickBlockPatch).length) {
        await chrome.storage.local.set(quickBlockPatch);
      }

      if (hasUserMemos && chrome.storage.local) {
        await chrome.storage.local.set({ userMemos: userMemosPatch || {} });
      }

      if (hasImageBlockConfig && chrome.storage.local) {
        await chrome.storage.local.set({ [IMAGE_BLOCK_CONFIG_KEY]: imageBlockConfigPatch || IMAGE_BLOCK_CONFIG_DEFAULT });
      }

      if (hasImageBlockRecords && chrome.storage.local) {
        await chrome.storage.local.set({ [IMAGE_BLOCK_RECORD_KEY]: imageBlockRecordsPatch || {} });
      }

      if (hasBlockedUids && globalThis.DCBUserBlockStore?.setAllTokens) {
        await DCBUserBlockStore.setAllTokens(blockedUidsPatch || []);
      }

      if (quickBlockPatch[QUICK_BLOCK_POSITION_KEY]) {
        broadcastQuickBlockPosition(quickBlockPatch[QUICK_BLOCK_POSITION_KEY]);
      }

      alert("백업을 불러왔습니다. 페이지를 새로고침합니다.");
      location.reload();
    } catch (err) {
      console.error("[DCB] backup import failed", err);
      alert("백업 파일을 불러오지 못했습니다. JSON 형식을 확인하세요.");
    }
  };

  reader.readAsText(file);
}

/* ───── 키워드 차단 관리 ───── */
function sanitizeKeyword(v) {
  return String(v || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function setKeywordStatus(text, isError = false) {
  if (!optionKeywordStatus) return;

  optionKeywordStatus.textContent = text || "";
  optionKeywordStatus.style.color = isError ? "#ff8d8d" : "#9dd6a5";
}

function normalizeKeywordList(list) {
  const seen = new Set();
  const out = [];

  (Array.isArray(list) ? list : []).forEach((raw) => {
    const keyword = sanitizeKeyword(raw);
    const key = keyword.toLowerCase();

    if (!keyword || seen.has(key)) return;

    seen.add(key);
    out.push(keyword);
  });

  return out;
}

function getKeywordTargetsFromUI() {
  return {
    listTitle: keywordTargetListTitle ? !!keywordTargetListTitle.checked : true,
    viewTitle: keywordTargetViewTitle ? !!keywordTargetViewTitle.checked : true,
    viewBody: keywordTargetViewBody ? !!keywordTargetViewBody.checked : true,
    comments: keywordTargetComments ? !!keywordTargetComments.checked : true
  };
}

function renderKeywordTargets(targets = {}) {
  const merged = {
    ...KEYWORD_DEFAULT_TARGETS,
    ...(targets || {})
  };

  if (keywordTargetListTitle) keywordTargetListTitle.checked = !!merged.listTitle;
  if (keywordTargetViewTitle) keywordTargetViewTitle.checked = !!merged.viewTitle;
  if (keywordTargetViewBody) keywordTargetViewBody.checked = !!merged.viewBody;
  if (keywordTargetComments) keywordTargetComments.checked = !!merged.comments;
}

function renderKeywordList(list) {
  if (!optionKeywordList) return;

  const keywords = normalizeKeywordList(list);
  optionKeywordList.innerHTML = "";

  if (!keywords.length) {
    const li = document.createElement("li");
    li.className = "keyword-empty";
    li.textContent = "등록된 차단 키워드가 없습니다.";
    optionKeywordList.appendChild(li);
    setKeywordStatus("");
    return;
  }

  keywords.forEach((keyword, idx) => {
    const li = document.createElement("li");

    const code = document.createElement("code");
    code.textContent = keyword;

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "삭제";
    del.dataset.keywordIdx = String(idx);

    li.appendChild(code);
    li.appendChild(del);
    optionKeywordList.appendChild(li);
  });

  setKeywordStatus(`현재 ${keywords.length}개의 키워드가 차단 리스트에 등록되어 있습니다.`);
}

function saveKeywordList(mutator) {
  chrome.storage.sync.get(
    {
      blockedKeywords: []
    },
    ({ blockedKeywords }) => {
      const list = Array.isArray(blockedKeywords)
        ? blockedKeywords.slice()
        : [];

      mutator(list);

      const next = normalizeKeywordList(list);

      chrome.storage.sync.set(
        {
          blockedKeywords: next
        },
        () => {
          renderKeywordList(next);
          setKeywordStatus(`차단 키워드 ${next.length}개 저장 완료`);
        }
      );
    }
  );
}

function saveKeywordTargets() {
  const next = getKeywordTargetsFromUI();

  chrome.storage.sync.set(
    {
      keywordBlockTargets: next
    },
    () => {
      setKeywordStatus("키워드 차단 대상 설정 저장 완료");
    }
  );
}

function lockKeywordOptionUI(disabled) {
  const nodes = [
    optionKeywordInput,
    optionAddKeywordBtn,
    keywordTargetListTitle,
    keywordTargetViewTitle,
    keywordTargetViewBody,
    keywordTargetComments
  ];

  nodes.forEach((el) => {
    if (!el) return;
    el.disabled = !!disabled;
    el.style.opacity = disabled ? 0.55 : 1;
  });
}

/* ───── 갤러리 차단 ───── */
function renderUser(ids) {
  if (!listEl) return;

  listEl.innerHTML = "";

  const vis = ids.map(norm).filter(Boolean);

  if (!vis.length) {
    listEl.innerHTML = '<p class="note">아직 추가된 갤러리가 없습니다.</p>';
    return;
  }

  vis.sort().forEach(id => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${id}</span>`;

    const del = document.createElement("button");
    del.textContent = "삭제";
    del.onclick = () =>
      chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) =>
        updateBlocked(blockedIds.filter(x => norm(x) !== id)));

    li.appendChild(del);
    listEl.appendChild(li);
  });
}

function renderRec(blocked) {
  if (!recList) return;

  recList.innerHTML = "";

  recommendedIds.forEach(id => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    const already = blocked.includes(id);

    btn.textContent = already ? "✓ 추가됨" : "추가";
    btn.disabled = already;
    btn.className = already ? "added" : "";

    if (!already) {
      btn.onclick = () => updateBlocked([...blocked, id]);
    }

    li.textContent = id + " ";
    li.appendChild(btn);
    recList.appendChild(li);
  });
}

function renderSel(arr, targetUl, key) {
  if (!targetUl) return;

  targetUl.innerHTML = "";

  if (!arr.length) {
    targetUl.innerHTML = '<p class="note">숨길 영역이 없습니다.</p>';
    return;
  }

  arr.forEach(sel => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${sel}</span>`;

    const del = document.createElement("button");
    del.textContent = "삭제";
    del.onclick = () =>
      chrome.storage.sync.get({ [key]: [] }, store =>
        updateSel(store[key].filter(s => s !== sel), key, targetUl));

    li.appendChild(del);
    targetUl.appendChild(li);
  });
}

function updateBlocked(next) {
  const uniq = [...new Set(next.map(norm))];

  chrome.storage.sync.set({ blockedIds: uniq }, () => {
    renderUser(uniq);
    renderRec(uniq);
  });
}

function updateSel(list, key, targetUl) {
  const uniq = [...new Set(list.map(s => s.trim()).filter(Boolean))];

  chrome.storage.sync.set({ [key]: uniq }, () => {
    renderSel(uniq, targetUl, key);
  });
}

/* ───── 사용자 차단(UID) ───── */
function normalizeUserBlockTriggerMode(v) {
  return v === "contextMenu" ? "contextMenu" : "instant";
}

function applyOptionUserBlockHoverHintControl() {
  if (!userBlockHoverHintEl) return;

  const mode = normalizeUserBlockTriggerMode(userBlockTriggerModeState);
  const isInstantMode = mode === "instant";
  const disabled = !userBlockEnabledState;

  if (userBlockHoverHintRow) {
    userBlockHoverHintRow.style.display = isInstantMode ? "" : "none";
  }

  userBlockHoverHintEl.checked = isInstantMode && userBlockHoverHintEnabledState !== false;
  userBlockHoverHintEl.disabled = disabled || !isInstantMode;
  userBlockHoverHintEl.style.opacity = disabled ? 0.5 : 1;
  userBlockHoverHintEl.title = "우클릭 즉시 차단 모드에서만 표시됩니다.";
}

function updateOptionUserBlockModeGuide(mode) {
  const normalized = normalizeUserBlockTriggerMode(mode);

  if (optionUserBlockModeTitle) {
    optionUserBlockModeTitle.textContent = normalized === "contextMenu"
      ? "구 방식: 우클릭 메뉴에서 한 번 더 선택해 차단합니다."
      : "즉시 차단: 우클릭 한 번으로 UID/IP를 차단합니다.";
  }

  if (optionUserBlockModeText) {
    optionUserBlockModeText.innerHTML = normalized === "contextMenu"
      ? "<strong>닉네임, 갤로그 아이콘, 메모 버튼</strong> 위에서 우클릭한 뒤 브라우저 메뉴의 “이 사용자 차단하기”를 누르세요."
      : "<strong>닉네임, 갤로그 아이콘, 메모 버튼</strong> 위에서 우클릭하세요. UID가 있으면 UID로, UID가 없는 유동닉은 IP 앞자리로 저장됩니다.";
  }

  if (optionUserBlockModeSub) {
    optionUserBlockModeSub.textContent = normalized === "contextMenu"
      ? "이 모드에서는 닉네임 안내 팝업 옵션을 숨기고, 실제 팝업도 표시하지 않습니다."
      : "글 제목, 본문, 댓글 내용 영역에서는 사용자 차단이 실행되지 않습니다. 즉시 차단 안내 팝업은 아래 옵션으로 켜거나 끌 수 있습니다.";
  }
}

function lockUserBlockUI(disabled) {
  userBlockEnabledState = !disabled;

  const nodes = [uidInput, addUidBtn, userBlockTriggerModeEl];
  const op = disabled ? 0.5 : 1;

  nodes.forEach((el) => {
    if (!el) return;
    el.disabled = !!disabled;
    el.style.opacity = op;
  });

  applyOptionUserBlockHoverHintControl();
}

function renderUidList(uids) {
  if (!uidListEl) return;

  uidListEl.innerHTML = "";

  if (!uids || !uids.length) {
    uidListEl.innerHTML =
      '<li class="note" style="background:transparent;padding:0">등록된 유저 아이디가 없습니다.</li>';
    return;
  }

  uids.forEach((uid, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<code>${uid}</code>`;

    const del = document.createElement("button");
    del.textContent = "삭제";
    del.onclick = () => saveUidList(list => {
      list.splice(idx, 1);
    });

    li.appendChild(del);
    uidListEl.appendChild(li);
  });
}

let uidListRefreshTimer = null;

async function getStoredUidList() {
  if (globalThis.DCBUserBlockStore?.getAllTokens) {
    return DCBUserBlockStore.getAllTokens();
  }

  const data = await chrome.storage.local.get({ blockedUids: [] });
  return Array.isArray(data.blockedUids) ? data.blockedUids : [];
}

async function setStoredUidList(list) {
  if (globalThis.DCBUserBlockStore?.setAllTokens) {
    return DCBUserBlockStore.setAllTokens(list);
  }

  const uniq = Array.from(new Set((Array.isArray(list) ? list : []).map(sanitizeUid).filter(Boolean)));
  await chrome.storage.local.set({ blockedUids: uniq });
  return uniq;
}

function refreshUidList(delay = 0) {
  if (uidListRefreshTimer) clearTimeout(uidListRefreshTimer);

  uidListRefreshTimer = setTimeout(async () => {
    uidListRefreshTimer = null;

    try {
      renderUidList(await getStoredUidList());
    } catch (err) {
      console.warn("[DCB] uid list refresh failed", err);
    }
  }, delay);
}

async function saveUidList(mutator) {
  try {
    const list = await getStoredUidList();

    mutator(list);

    const uniq = Array.from(new Set(list.map(sanitizeUid).filter(Boolean)));
    const saved = await setStoredUidList(uniq);

    renderUidList(saved);
  } catch (err) {
    console.warn("[DCB] uid list save failed", err);
    alert("사용자 차단 목록을 저장하지 못했습니다. 확장 프로그램을 다시 로드한 뒤 시도해 주세요.");
  }
}

/* ───── 이용자 메모 관리 ───── */
function setMemoStatus(text, isError = false) {
  if (!userMemoStatus) return;

  userMemoStatus.textContent = text || "";
  userMemoStatus.style.color = isError ? "#ff8d8d" : "#9dd6a5";
}

function normalizeImportedMemoObject(raw) {
  const source =
    raw && typeof raw === "object"
      ? (raw.userMemos && typeof raw.userMemos === "object" ? raw.userMemos : raw)
      : {};

  const next = {};

  Object.entries(source).forEach(([key, value]) => {
    if (!key || !value || typeof value !== "object") return;

    const memo = sanitizeText(value.memo, 80);
    if (!memo) return;

    next[String(key)] = {
      memo,
      color: isValidColor(value.color) ? value.color : "#999999",
      nickname: sanitizeText(value.nickname, 60),
      uid: sanitizeText(value.uid, 80),
      ip: sanitizeText(value.ip, 80),
      updatedAt: Number(value.updatedAt) || Date.now()
    };
  });

  return next;
}

function getUserMemos() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ userMemos: {} }, ({ userMemos }) => {
      resolve(userMemos || {});
    });
  });
}

function setUserMemos(next) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ userMemos: next }, resolve);
  });
}

function memoMatchesFilter(key, item, query) {
  if (!query) return true;

  const q = query.toLowerCase();

  const haystack = [
    key,
    item.nickname || "",
    item.uid || "",
    item.ip || "",
    item.memo || ""
  ].join(" ").toLowerCase();

  return haystack.includes(q);
}

async function renderMemoList() {
  if (!memoList) return;

  const all = await getUserMemos();
  const query = memoSearchInput ? memoSearchInput.value.trim() : "";

  const rows = Object.entries(all)
    .sort((a, b) => (Number(b[1].updatedAt) || 0) - (Number(a[1].updatedAt) || 0))
    .filter(([key, item]) => memoMatchesFilter(key, item, query));

  memoList.innerHTML = "";

  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "memo-empty";
    li.textContent = query ? "검색 결과가 없습니다." : "저장된 이용자 메모가 없습니다.";
    memoList.appendChild(li);
    return;
  }

  rows.forEach(([key, item]) => {
    const li = document.createElement("li");
    li.className = "memo-card";

    const meta = document.createElement("div");
    meta.className = "memo-meta";

    const chips = [
      item.uid ? `아이디: ${item.uid}` : "",
      item.ip ? `아이피: ${item.ip}` : "",
      item.nickname ? `닉네임: ${item.nickname}` : "",
      `저장키: ${key}`,
      `수정: ${formatDate(item.updatedAt)}`
    ].filter(Boolean);

    chips.forEach((text) => {
      const chip = document.createElement("span");
      chip.className = "memo-chip";
      chip.textContent = text;
      meta.appendChild(chip);
    });

    const textarea = document.createElement("textarea");
    textarea.value = item.memo || "";

    const bottom = document.createElement("div");
    bottom.className = "memo-bottom";

    const color = document.createElement("input");
    color.type = "color";
    color.className = "memo-color";
    color.value = isValidColor(item.color) ? item.color : "#999999";

    const actions = document.createElement("div");
    actions.className = "memo-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "저장";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "삭제";

    saveBtn.addEventListener("click", async () => {
      const memo = sanitizeText(textarea.value, 80);
      const next = await getUserMemos();

      if (!memo) {
        delete next[key];
        await setUserMemos(next);
        setMemoStatus(`빈 메모는 삭제 처리됨 · ${key}`);
        renderMemoList();
        return;
      }

      next[key] = {
        ...(next[key] || {}),
        memo,
        color: isValidColor(color.value) ? color.value : "#999999",
        nickname: sanitizeText(item.nickname, 60),
        uid: sanitizeText(item.uid, 80),
        ip: sanitizeText(item.ip, 80),
        updatedAt: Date.now()
      };

      await setUserMemos(next);
      setMemoStatus(`저장 완료 · ${key}`);
      renderMemoList();
    });

    deleteBtn.addEventListener("click", async () => {
      const next = await getUserMemos();
      delete next[key];
      await setUserMemos(next);
      setMemoStatus(`삭제 완료 · ${key}`);
      renderMemoList();
    });

    actions.appendChild(saveBtn);
    actions.appendChild(deleteBtn);

    bottom.appendChild(color);
    bottom.appendChild(actions);

    li.appendChild(meta);
    li.appendChild(textarea);
    li.appendChild(bottom);

    memoList.appendChild(li);
  });
}

/* ───── 이벤트: 키워드 차단 ───── */
if (optionKeywordBlockEnabled) {
  optionKeywordBlockEnabled.addEventListener("change", (e) => {
    const on = !!e.target.checked;

    lockKeywordOptionUI(!on);

    chrome.storage.sync.set(
      {
        keywordBlockEnabled: on
      },
      () => {
        setKeywordStatus(
          on ? "키워드 차단 모드가 켜졌습니다." : "키워드 차단 모드가 꺼졌습니다."
        );
      }
    );
  });
}

if (optionAddKeywordBtn && optionKeywordInput) {
  optionAddKeywordBtn.addEventListener("click", () => {
    const keyword = sanitizeKeyword(optionKeywordInput.value);

    if (!keyword) {
      setKeywordStatus("추가할 키워드를 입력하세요.", true);
      return;
    }

    saveKeywordList((list) => {
      list.push(keyword);
    });

    optionKeywordInput.value = "";
    optionKeywordInput.focus();
  });

  optionKeywordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      optionAddKeywordBtn.click();
    }
  });
}

if (optionKeywordList) {
  optionKeywordList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-keyword-idx]");
    if (!btn) return;

    const idx = Number(btn.dataset.keywordIdx);

    saveKeywordList((list) => {
      list.splice(idx, 1);
    });
  });
}

[
  keywordTargetListTitle,
  keywordTargetViewTitle,
  keywordTargetViewBody,
  keywordTargetComments
].forEach((el) => {
  if (!el) return;
  el.addEventListener("change", saveKeywordTargets);
});

/* ───── 이벤트: 백업/복원 ───── */
if (exportBtn) {
  exportBtn.onclick = () => exportSettings();
}

if (importBtn && importFileEl) {
  importBtn.onclick = () => importFileEl.click();

  importFileEl.onchange = () => {
    const [file] = importFileEl.files || [];
    importSettingsFromFile(file);
    importFileEl.value = "";
  };
}

/* ───── 이벤트: 갤러리 차단 ───── */
if (addBtn && newIdInput) {
  addBtn.onclick = () => {
    const id = norm(newIdInput.value);
    if (!id) return;

    chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
      if (!blockedIds.map(norm).includes(id)) {
        updateBlocked([...blockedIds, id]);
      }

      newIdInput.value = "";
    });
  };

  newIdInput.addEventListener("keyup", e => {
    if (e.key === "Enter") addBtn.onclick();
  });
}

if (addAllRec) {
  addAllRec.onclick = () =>
    chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) =>
      updateBlocked([...new Set([...blockedIds, ...recommendedIds])]));
}

/* ───── 이벤트: 메인 페이지 셀렉터 ───── */
if (addSelBtn && newSel) {
  addSelBtn.onclick = () => {
    const sel = newSel.value.trim();
    if (!sel) return;

    chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) => {
      if (!removeSelectors.includes(sel)) {
        updateSel([...removeSelectors, sel], "removeSelectors", selList);
      }

      newSel.value = "";
    });
  };

  newSel.addEventListener("keyup", e => {
    if (e.key === "Enter") addSelBtn.onclick();
  });
}

if (addRecSel) {
  addRecSel.onclick = () =>
    chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) =>
      updateSel([...new Set([...removeSelectors, ...recSelectors])], "removeSelectors", selList));
}

/* ───── 이벤트: 갤러리 페이지 셀렉터 ───── */
if (addGallSelBtn && newGallSel) {
  addGallSelBtn.onclick = () => {
    const sel = newGallSel.value.trim();
    if (!sel) return;

    chrome.storage.sync.get({ removeSelectorsGall: [] }, ({ removeSelectorsGall }) => {
      if (!removeSelectorsGall.includes(sel)) {
        updateSel([...removeSelectorsGall, sel], "removeSelectorsGall", gallSelList);
      }

      newGallSel.value = "";
    });
  };

  newGallSel.addEventListener("keyup", e => {
    if (e.key === "Enter") addGallSelBtn.onclick();
  });
}

if (addRecGallSel) {
  addRecGallSel.onclick = () =>
    chrome.storage.sync.get({ removeSelectorsGall: [] }, ({ removeSelectorsGall }) =>
      updateSel([...new Set([...removeSelectorsGall, ...recGallSelectors])], "removeSelectorsGall", gallSelList));
}

/* ───── 이벤트: 검색 페이지 셀렉터 ───── */
if (addSearchSelBtn && newSearchSel) {
  addSearchSelBtn.onclick = () => {
    const sel = newSearchSel.value.trim();
    if (!sel) return;

    chrome.storage.sync.get({ removeSelectorsSearch: [] }, ({ removeSelectorsSearch }) => {
      if (!removeSelectorsSearch.includes(sel)) {
        updateSel([...removeSelectorsSearch, sel], "removeSelectorsSearch", searchSelList);
      }

      newSearchSel.value = "";
    });
  };

  newSearchSel.addEventListener("keyup", e => {
    if (e.key === "Enter") addSearchSelBtn.onclick();
  });
}

if (addRecSearchSel) {
  addRecSearchSel.onclick = () =>
    chrome.storage.sync.get({ removeSelectorsSearch: [] }, ({ removeSelectorsSearch }) =>
      updateSel([...new Set([...removeSelectorsSearch, ...recSearchSelectors])], "removeSelectorsSearch", searchSelList));
}

/* ───── 이벤트: 사용자 차단 ───── */
if (userBlockEl) {
  userBlockEl.addEventListener("change", e => {
    const on = !!e.target.checked;
    lockUserBlockUI(!on);
    chrome.storage.sync.set({ userBlockEnabled: on });
  });
}

if (userBlockTriggerModeEl) {
  userBlockTriggerModeEl.addEventListener("change", e => {
    const mode = normalizeUserBlockTriggerMode(e.target.value);
    userBlockTriggerModeState = mode;
    updateOptionUserBlockModeGuide(mode);
    applyOptionUserBlockHoverHintControl();
    chrome.storage.sync.set({ userBlockTriggerMode: mode });
  });
}

if (userBlockHoverHintEl) {
  userBlockHoverHintEl.addEventListener("change", e => {
    userBlockHoverHintEnabledState = !!e.target.checked;
    chrome.storage.sync.set({ userBlockHoverHintEnabled: userBlockHoverHintEnabledState });
  });
}

if (addUidBtn && uidInput) {
  addUidBtn.addEventListener("click", () => {
    const v = sanitizeUid(uidInput.value);
    if (!v) return;

    saveUidList(list => list.push(v));

    uidInput.value = "";
    uidInput.focus();
  });

  uidInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUidBtn.click();
    }
  });
}

if (uidListEl) {
  uidListEl.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const idx = Array.from(uidListEl.children).indexOf(btn.parentElement);
    if (idx < 0) return;

    saveUidList(list => {
      list.splice(idx, 1);
    });
  });
}

/* ───── 이벤트: 접근 차단/자동 새로고침/표시 옵션 ───── */
if (galleryBlockEnabledEl) {
  galleryBlockEnabledEl.addEventListener("change", (e) => {
    const on = !!e.target.checked;
    chrome.storage.sync.set({ galleryBlockEnabled: on, enabled: on });
  });
}

if (builtinDcbestBlockEnabledEl) {
  builtinDcbestBlockEnabledEl.addEventListener("change", (e) => {
    chrome.storage.sync.set({ builtinDcbestBlockEnabled: !!e.target.checked });
  });
}

if (blockModeEl) {
  blockModeEl.addEventListener("change", (e) => {
    const mode = e.target.value;
    chrome.storage.sync.set({ blockMode: mode });
    updateBlockModeHint(mode);
  });
}

if (quickBlockButtonPositionEl) {
  const onQuickBlockPositionInput = (e) => saveQuickBlockButtonPosition(e.target.value);
  quickBlockButtonPositionEl.addEventListener("change", onQuickBlockPositionInput);
  quickBlockButtonPositionEl.addEventListener("input", onQuickBlockPositionInput);
}

if (delayNumEl) {
  delayNumEl.addEventListener("input", (e) => updateDelay(e.target.value));
}

if (delayRangeEl) {
  delayRangeEl.addEventListener("input", (e) => updateDelay(e.target.value));
}

if (autoRefreshEnabledEl) {
  autoRefreshEnabledEl.addEventListener("change", (e) => {
    chrome.storage.sync.set({ autoRefreshEnabled: !!e.target.checked });
  });
}

if (autoRefreshIntervalNumEl) {
  autoRefreshIntervalNumEl.addEventListener("input", (e) => updateAutoRefreshInterval(e.target.value));
}

if (autoRefreshIntervalRangeEl) {
  autoRefreshIntervalRangeEl.addEventListener("input", (e) => updateAutoRefreshInterval(e.target.value));
}

if (toggleHideMainEl) {
  toggleHideMainEl.addEventListener("change", (e) => {
    chrome.storage.sync.set({ hideMainEnabled: !!e.target.checked });
  });
}

if (toggleHideGallEl) {
  toggleHideGallEl.addEventListener("change", (e) => {
    chrome.storage.sync.set({ hideGallEnabled: !!e.target.checked });
  });
}

if (toggleHideSearchEl) {
  toggleHideSearchEl.addEventListener("change", (e) => {
    chrome.storage.sync.set({ hideSearchEnabled: !!e.target.checked });
  });
}

if (toggleUidBadgeEl) {
  toggleUidBadgeEl.addEventListener("change", (e) => {
    chrome.storage.sync.set({ showUidBadge: !!e.target.checked });
  });
}

if (compactListEnabledEl) {
  compactListEnabledEl.addEventListener("change", (e) => {
    chrome.storage.sync.set({ compactListEnabled: !!e.target.checked });
  });
}

if (userMemoEnabledEl) {
  userMemoEnabledEl.addEventListener("change", (e) => {
    chrome.storage.sync.set({ userMemoEnabled: !!e.target.checked });
  });
}

/* ───── 이벤트: 댓글/미리보기/비회원 ───── */
if (hideCommentEl) {
  hideCommentEl.addEventListener("change", e => {
    chrome.storage.sync.set({ hideComment: !!e.target.checked });
  });
}

if (hideImgCommentEl) {
  hideImgCommentEl.addEventListener("change", e => {
    chrome.storage.sync.set({ hideImgComment: !!e.target.checked });
  });
}

if (hideDcconEl) {
  hideDcconEl.addEventListener("change", e => {
    chrome.storage.sync.set({ hideDccon: !!e.target.checked });
  });
}

if (previewEnabledEl) {
  previewEnabledEl.addEventListener("change", e => {
    chrome.storage.sync.set({ previewEnabled: !!e.target.checked });
  });
}

if (hideAnonymousEl) {
  hideAnonymousEl.addEventListener("change", e => {
    chrome.storage.sync.set({ hideAnonymousEnabled: !!e.target.checked });
  });
}

if (gamemecaBlockEnabledEl) {
  gamemecaBlockEnabledEl.addEventListener("change", e => {
    chrome.storage.sync.set({ gamemecaBlockEnabled: !!e.target.checked });
  });
}

if (doryBlockEnabledEl) {
  doryBlockEnabledEl.addEventListener("change", e => {
    chrome.storage.sync.set({ doryBlockEnabled: !!e.target.checked });
  });
}

if (noticeBlockEnabledEl) {
  noticeBlockEnabledEl.addEventListener("change", e => {
    chrome.storage.sync.set({ noticeBlockEnabled: !!e.target.checked });
  });
}

/* ───── 이벤트: 다크모드 ───── */
if (optionDcThemeRefresh) {
  optionDcThemeRefresh.addEventListener("click", () => {
    clearOptionDcThemeLock();
    refreshOptionDcThemeState();
  });
}

if (optionDcDarkModeToggle) {
  optionDcDarkModeToggle.addEventListener("change", (e) => {
    if (optionDcThemeApplying) {
      if (shouldKeepOptionDcThemeState()) setChecked(optionDcDarkModeToggle, optionDcThemeOptimisticState);
      return;
    }

    const requested = !!e.target.checked;
    const seq = ++optionDcThemeSeq;
    lockOptionDcThemeUi(requested, 2600);
    setOptionDcThemeBusy(true);
    setOptionDcThemeStatus(requested ? "Switching to dark…" : "Switching to light…");

    sendOptionDcThemeMessage({ type: "DCB_DC_THEME_SET_STATE", enabled: requested }, (state, error, tab) => {
      if (seq !== optionDcThemeSeq) return;
      setOptionDcThemeBusy(false);

      if (!state || !state.available) {
        if (isDcInsideTab(tab)) {
          applyOptionDcThemeUi(requested);
          window.setTimeout(() => {
            if (seq === optionDcThemeSeq) clearOptionDcThemeLock();
          }, 2600);
          return;
        }

        clearOptionDcThemeLock();
        setChecked(optionDcDarkModeToggle, false);
        setOptionDcThemeStatus("Open a DC tab first", false);
        return;
      }

      const isDark = typeof state.requestedState === "boolean" ? !!state.requestedState : requested;
      applyOptionDcThemeUi(isDark);
      window.setTimeout(() => {
        if (seq === optionDcThemeSeq) clearOptionDcThemeLock();
      }, 2600);
    });
  });
}

/* ───── 이벤트: 메모 관리 ───── */
if (memoSearchInput) {
  memoSearchInput.addEventListener("input", () => {
    renderMemoList();
  });
}

if (refreshMemoListBtn) {
  refreshMemoListBtn.addEventListener("click", () => {
    renderMemoList();
    setMemoStatus("목록 새로고침 완료");
  });
}

if (exportUserMemoBtn) {
  exportUserMemoBtn.addEventListener("click", async () => {
    const userMemos = await getUserMemos();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    downloadJson(`dcb-user-memos-${stamp}.json`, {
      version: 1,
      exportedAt: new Date().toISOString(),
      userMemos
    });

    setMemoStatus(`내보내기 완료 · ${Object.keys(userMemos).length}건`);
  });
}

if (importUserMemoBtn && importUserMemoFile) {
  importUserMemoBtn.addEventListener("click", () => {
    importUserMemoFile.click();
  });

  importUserMemoFile.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = normalizeImportedMemoObject(parsed);
      const current = await getUserMemos();

      const merged = {
        ...current,
        ...imported
      };

      await setUserMemos(merged);

      setMemoStatus(`가져오기 완료 · ${Object.keys(imported).length}건 반영`);
      renderMemoList();
    } catch (err) {
      console.error("[DCB] memo import failed", err);
      setMemoStatus("가져오기 실패 · JSON 형식을 확인해 주세요.", true);
    } finally {
      importUserMemoFile.value = "";
    }
  });
}

/* ───── 초기 로드 ───── */
chrome.storage.sync.get(
  {
    blockedIds: [],
    removeSelectors: [],
    removeSelectorsGall: [],
    removeSelectorsSearch: [],
    userBlockEnabled: true,
    userBlockTriggerMode: "instant",
    userBlockHoverHintEnabled: true,
    blockedUids: [],
    enabled: true,
    galleryBlockEnabled: undefined,
    builtinDcbestBlockEnabled: true,
    blockMode: "smart",
    quickBlockButtonPosition: "right-top",
    quickBlockButtonPositionSavedAt: 0,
    autoRefreshEnabled: false,
    autoRefreshInterval: 60,
    delay: 5,
    hideMainEnabled: true,
    hideGallEnabled: true,
    hideSearchEnabled: true,
    showUidBadge: false,
    compactListEnabled: false,
    userMemoEnabled: true,
    hideComment: false,
    hideImgComment: false,
    hideDccon: false,
    previewEnabled: false,
    hideAnonymousEnabled: false,
    gamemecaBlockEnabled: true,
    doryBlockEnabled: true,
    noticeBlockEnabled: true,
    hideDCGray: undefined,

    keywordBlockEnabled: false,
    blockedKeywords: [],
    keywordBlockTargets: KEYWORD_DEFAULT_TARGETS,
    dcbFontFamily: "Noto Sans KR",
    dcbFontCustomFamily: "",
    dcbApplyFontToDc: true
  },
  ({
    blockedIds,
    removeSelectors,
    removeSelectorsGall,
    removeSelectorsSearch,
    userBlockEnabled,
    userBlockTriggerMode,
    userBlockHoverHintEnabled,
    blockedUids,
    enabled,
    galleryBlockEnabled,
    builtinDcbestBlockEnabled,
    blockMode,
    quickBlockButtonPosition,
    autoRefreshEnabled,
    autoRefreshInterval,
    delay,
    hideMainEnabled,
    hideGallEnabled,
    hideSearchEnabled,
    showUidBadge,
    compactListEnabled,
    userMemoEnabled,
    hideComment,
    hideImgComment,
    hideDccon,
    previewEnabled,
    hideAnonymousEnabled,
    gamemecaBlockEnabled,
    doryBlockEnabled,
    noticeBlockEnabled,
    hideDCGray,

    keywordBlockEnabled,
    blockedKeywords,
    keywordBlockTargets
  }) => {
    if (typeof userBlockEnabled !== "boolean" && typeof hideDCGray === "boolean") {
      userBlockEnabled = hideDCGray;
      chrome.storage.sync.set({ userBlockEnabled });
    }

    renderUser((blockedIds || []).map(norm));
    renderRec((blockedIds || []).map(norm));
    renderSel(removeSelectors || [], selList, "removeSelectors");
    renderSel(removeSelectorsGall || [], gallSelList, "removeSelectorsGall");
    renderSel(removeSelectorsSearch || [], searchSelList, "removeSelectorsSearch");

    userBlockEnabledState = userBlockEnabled !== false;
    userBlockTriggerModeState = normalizeUserBlockTriggerMode(userBlockTriggerMode);
    userBlockHoverHintEnabledState = userBlockHoverHintEnabled !== false;

    if (userBlockEl) {
      userBlockEl.checked = userBlockEnabledState;
    }

    if (userBlockTriggerModeEl) {
      userBlockTriggerModeEl.value = userBlockTriggerModeState;
    }

    updateOptionUserBlockModeGuide(userBlockTriggerModeState);
    lockUserBlockUI(!userBlockEnabledState);

    refreshUidList();

    setChecked(galleryBlockEnabledEl, getGalleryBlockEnabled({ galleryBlockEnabled, enabled }));
    setChecked(builtinDcbestBlockEnabledEl, builtinDcbestBlockEnabled !== false);
    setValue(blockModeEl, blockMode || "smart");
    setValue(quickBlockButtonPositionEl, normalizeQuickBlockPosition(quickBlockButtonPosition));
    refreshQuickBlockButtonPositionControl();
    updateBlockModeHint(blockMode || "smart");
    setChecked(autoRefreshEnabledEl, autoRefreshEnabled);
    setValue(autoRefreshIntervalNumEl, autoRefreshInterval);
    setValue(autoRefreshIntervalRangeEl, autoRefreshInterval);
    setValue(delayNumEl, delay);
    setValue(delayRangeEl, delay);
    setChecked(toggleHideMainEl, hideMainEnabled);
    setChecked(toggleHideGallEl, hideGallEnabled);
    setChecked(toggleHideSearchEl, hideSearchEnabled);
    setChecked(toggleUidBadgeEl, showUidBadge);
    setChecked(compactListEnabledEl, compactListEnabled);
    setChecked(userMemoEnabledEl, userMemoEnabled);

    if (hideCommentEl) hideCommentEl.checked = !!hideComment;
    if (hideImgCommentEl) hideImgCommentEl.checked = !!hideImgComment;
    if (hideDcconEl) hideDcconEl.checked = !!hideDccon;
    if (previewEnabledEl) previewEnabledEl.checked = !!previewEnabled;
    if (hideAnonymousEl) hideAnonymousEl.checked = !!hideAnonymousEnabled;
    if (gamemecaBlockEnabledEl) gamemecaBlockEnabledEl.checked = gamemecaBlockEnabled !== false;
    if (doryBlockEnabledEl) doryBlockEnabledEl.checked = doryBlockEnabled !== false;
    if (noticeBlockEnabledEl) noticeBlockEnabledEl.checked = noticeBlockEnabled !== false;

    if (optionKeywordBlockEnabled) {
      optionKeywordBlockEnabled.checked = !!keywordBlockEnabled;
      lockKeywordOptionUI(!keywordBlockEnabled);
    }

    renderKeywordTargets(keywordBlockTargets || KEYWORD_DEFAULT_TARGETS);
    renderKeywordList(blockedKeywords || []);
    refreshOptionDcThemeState();
  }
);

renderMemoList();

/* 다른 탭/팝업 변경 반영 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && globalThis.DCBUserBlockStore?.isRelevantChange?.(changes)) {
    refreshUidList(80);
    return;
  }

  if (area === "sync") {
    if (changes.blockedIds) {
      const ids = (changes.blockedIds.newValue || []).map(norm);
      renderUser(ids);
      renderRec(ids);
    }

    if (changes.removeSelectors) {
      renderSel(changes.removeSelectors.newValue || [], selList, "removeSelectors");
    }

    if (changes.removeSelectorsGall) {
      renderSel(changes.removeSelectorsGall.newValue || [], gallSelList, "removeSelectorsGall");
    }

    if (changes.removeSelectorsSearch) {
      renderSel(changes.removeSelectorsSearch.newValue || [], searchSelList, "removeSelectorsSearch");
    }

    if (changes.userBlockEnabled && userBlockEl) {
      userBlockEnabledState = changes.userBlockEnabled.newValue !== false;
      userBlockEl.checked = userBlockEnabledState;
      lockUserBlockUI(!userBlockEnabledState);
    }

    if (changes.userBlockTriggerMode) {
      const mode = normalizeUserBlockTriggerMode(changes.userBlockTriggerMode.newValue);
      userBlockTriggerModeState = mode;
      if (userBlockTriggerModeEl) userBlockTriggerModeEl.value = mode;
      updateOptionUserBlockModeGuide(mode);
      applyOptionUserBlockHoverHintControl();
    }

    if (changes.userBlockHoverHintEnabled && userBlockHoverHintEl) {
      userBlockHoverHintEnabledState = changes.userBlockHoverHintEnabled.newValue !== false;
      applyOptionUserBlockHoverHintControl();
    }

    if (changes.blockedUids) {
      refreshUidList();
    }

    if (changes.builtinDcbestBlockEnabled && builtinDcbestBlockEnabledEl) {
      setChecked(builtinDcbestBlockEnabledEl, changes.builtinDcbestBlockEnabled.newValue !== false);
    }

    if ((changes.galleryBlockEnabled || changes.enabled) && galleryBlockEnabledEl) {
      chrome.storage.sync.get({ galleryBlockEnabled: undefined, enabled: true }, (conf) => {
        setChecked(galleryBlockEnabledEl, getGalleryBlockEnabled(conf));
      });
    }

    if (changes.blockMode) {
      setValue(blockModeEl, changes.blockMode.newValue);
      updateBlockModeHint(changes.blockMode.newValue || "smart");
    }

    if (changes.quickBlockButtonPosition || changes.quickBlockButtonPositionSavedAt) {
      refreshQuickBlockButtonPositionControl();
    }

    if (changes.delay) {
      setValue(delayNumEl, changes.delay.newValue);
      setValue(delayRangeEl, changes.delay.newValue);
    }

    if (changes.autoRefreshEnabled) {
      setChecked(autoRefreshEnabledEl, changes.autoRefreshEnabled.newValue);
    }

    if (changes.autoRefreshInterval) {
      setValue(autoRefreshIntervalNumEl, changes.autoRefreshInterval.newValue);
      setValue(autoRefreshIntervalRangeEl, changes.autoRefreshInterval.newValue);
    }

    if (changes.hideMainEnabled) setChecked(toggleHideMainEl, changes.hideMainEnabled.newValue);
    if (changes.hideGallEnabled) setChecked(toggleHideGallEl, changes.hideGallEnabled.newValue);
    if (changes.hideSearchEnabled) setChecked(toggleHideSearchEl, changes.hideSearchEnabled.newValue);
    if (changes.showUidBadge) setChecked(toggleUidBadgeEl, changes.showUidBadge.newValue);
    if (changes.compactListEnabled) setChecked(compactListEnabledEl, changes.compactListEnabled.newValue);
    if (changes.userMemoEnabled) setChecked(userMemoEnabledEl, changes.userMemoEnabled.newValue);

    if (changes.hideComment && hideCommentEl) {
      hideCommentEl.checked = !!changes.hideComment.newValue;
    }

    if (changes.hideImgComment && hideImgCommentEl) {
      hideImgCommentEl.checked = !!changes.hideImgComment.newValue;
    }

    if (changes.hideDccon && hideDcconEl) {
      hideDcconEl.checked = !!changes.hideDccon.newValue;
    }

    if (changes.previewEnabled && previewEnabledEl) {
      previewEnabledEl.checked = !!changes.previewEnabled.newValue;
    }

    if (changes.hideAnonymousEnabled && hideAnonymousEl) {
      hideAnonymousEl.checked = !!changes.hideAnonymousEnabled.newValue;
    }

    if (changes.gamemecaBlockEnabled && gamemecaBlockEnabledEl) {
      gamemecaBlockEnabledEl.checked = changes.gamemecaBlockEnabled.newValue !== false;
    }

    if (changes.doryBlockEnabled && doryBlockEnabledEl) {
      doryBlockEnabledEl.checked = changes.doryBlockEnabled.newValue !== false;
    }

    if (changes.noticeBlockEnabled && noticeBlockEnabledEl) {
      noticeBlockEnabledEl.checked = changes.noticeBlockEnabled.newValue !== false;
    }

    if (changes.keywordBlockEnabled && optionKeywordBlockEnabled) {
      optionKeywordBlockEnabled.checked = !!changes.keywordBlockEnabled.newValue;
      lockKeywordOptionUI(!changes.keywordBlockEnabled.newValue);
    }

    if (changes.blockedKeywords) {
      renderKeywordList(changes.blockedKeywords.newValue || []);
    }

    if (changes.keywordBlockTargets) {
      renderKeywordTargets(changes.keywordBlockTargets.newValue || KEYWORD_DEFAULT_TARGETS);
    }
  }

  if (area === "local") {
    if (changes.quickBlockButtonPosition || changes.quickBlockButtonPositionSavedAt) {
      refreshQuickBlockButtonPositionControl();
    }
    if (changes.userMemos) {
      renderMemoList();
    }
  }
});

(() => {
  const CONFIG_KEY = "dcbImageBlockConfig";
  const DEFAULTS = Object.freeze({
    enabled: false,
    toolbar: false,
    blurAnonymous: false,
    blurSemi: false,
    blurNew: false,
    blurFixed: false,
    blurManager: false,
    normalPost: false,
    recommendedPost: false,
    skipSmall: false,
    minWidth: 160,
    minHeight: 160,
    tallImage: false,
    maxHeight: 1200,
    shortcuts: false,
    hideBlockedNotice: false
  });

  const ui = {
    enabled: document.getElementById("imageBlockEnabled"),
    status: document.getElementById("imageBlockStatus"),
    list: document.getElementById("openImageBlockList")
  };

  if (!ui.enabled && !ui.list) return;

  const applyOneClick = (value = {}) => {
    const on = value?.enabled === true;
    return {
      ...DEFAULTS,
      ...(value && typeof value === "object" ? value : {}),
      enabled: on,
      toolbar: on,
      blurAnonymous: on,
      blurSemi: on,
      blurNew: on,
      blurFixed: on,
      blurManager: on,
      normalPost: on,
      recommendedPost: on,
      skipSmall: false,
      tallImage: false,
      shortcuts: false,
      hideBlockedNotice: false,
      minWidth: DEFAULTS.minWidth,
      minHeight: DEFAULTS.minHeight,
      maxHeight: DEFAULTS.maxHeight
    };
  };

  const notice = (message, error = false) => {
    if (!ui.status) return;
    ui.status.textContent = message || "";
    ui.status.style.color = error ? "#ff9b9b" : "#9dd6a5";
  };

  const render = (state) => {
    if (ui.enabled) ui.enabled.checked = state.enabled === true;
  };

  const current = () => applyOneClick({ enabled: ui.enabled?.checked === true });

  const save = () => {
    const next = current();
    chrome.storage.sync.set({ [CONFIG_KEY]: next }, () => {
      if (chrome.runtime.lastError) {
        notice("저장하지 못했어요. 확장 프로그램을 새로고침한 뒤 다시 시도해 주세요.", true);
        return;
      }
      chrome.storage.local.set({ [CONFIG_KEY]: next });
      render(next);
      notice(next.enabled ? "이미지 차단을 켰어요. 모든 작성자 이미지에 바로 적용됩니다." : "이미지 차단을 껐어요. 필요할 때 다시 켜면 됩니다.");
    });
  };

  const load = () => {
    chrome.storage.sync.get({ [CONFIG_KEY]: DEFAULTS }, (data) => {
      const state = applyOneClick(data[CONFIG_KEY]);
      render(state);
      notice(state.enabled ? "이미지 차단 사용 중입니다. 모든 작성자 이미지에 적용됩니다." : "이미지 차단은 꺼져 있어요.");
    });
  };

  const findPage = (done) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const list = tabs || [];
      const active = list.find((tab) => tab.active && /^https?:\/\/gall\.dcinside\.com\//.test(tab.url || ""));
      const fallback = list.find((tab) => /^https?:\/\/gall\.dcinside\.com\//.test(tab.url || ""));
      done(active || fallback || null);
    });
  };

  const sendToPage = (action) => {
    findPage((tab) => {
      if (!tab?.id) {
        notice("DCInside 게시글 탭을 연 뒤 다시 눌러주세요.", true);
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          notice("현재 게시글에서 이미지 차단을 불러오지 못했어요. 페이지를 새로고침해 주세요.", true);
          return;
        }
        notice("차단 목록을 열었어요.");
      });
    });
  };

  ui.enabled?.addEventListener("change", save);
  ui.list?.addEventListener("click", () => sendToPage("dcb.imageBlock.openList"));

  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === "sync" || area === "local") && changes[CONFIG_KEY]) render(applyOneClick(changes[CONFIG_KEY].newValue));
  });

  load();
})();
