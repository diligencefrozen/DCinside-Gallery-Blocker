/* popup.js */

/* ───────── DOM ───────── */
const toggle = document.getElementById("toggle");
const builtinDcbestBlockToggle = document.getElementById("builtinDcbestBlockEnabled");
const blockModeSel = document.getElementById("blockMode");
const quickBlockButtonPositionSel = document.getElementById("quickBlockButtonPosition");
const blockModeHint = document.getElementById("blockModeHint");
const hideCmtToggle = document.getElementById("hideComment");
const hideImgCmtToggle = document.getElementById("hideImgComment");
const hideDcconToggle = document.getElementById("hideDccon");
const previewToggle = document.getElementById("previewEnabled");
const autoRefreshToggle = document.getElementById("autoRefreshEnabled");
const autoRefreshIntervalNum = document.getElementById("autoRefreshIntervalNum");
const autoRefreshIntervalRange = document.getElementById("autoRefreshIntervalRange");
const delayNum = document.getElementById("delayNum");
const delayRange = document.getElementById("delayRange");
const openOptionsBtn = document.getElementById("openOptions");
const compactListToggle = document.getElementById("compactListEnabled");
const dcDarkModeToggle = document.getElementById("dcDarkMode");
const dcThemeStatus = document.getElementById("dcThemeStatus");
const quickGalleryPanel = document.getElementById("quickGalleryPanel");
const currentGalleryIdEl = document.getElementById("currentGalleryId");
const blockCurrentGalleryBtn = document.getElementById("blockCurrentGalleryBtn");
const blockCurrentGalleryStatus = document.getElementById("blockCurrentGalleryStatus");

const keywordBlockToggle = document.getElementById("keywordBlockEnabled");
const keywordInput = document.getElementById("keywordInput");
const addKeywordBtn = document.getElementById("addKeywordBtn");
const keywordListEl = document.getElementById("keywordList");
const keywordListCountEl = document.getElementById("keywordListCount");
const keywordTargetListTitle = document.getElementById("keywordTargetListTitle");
const keywordTargetViewTitle = document.getElementById("keywordTargetViewTitle");
const keywordTargetViewBody = document.getElementById("keywordTargetViewBody");
const keywordTargetComments = document.getElementById("keywordTargetComments");

const userBlockEl = document.getElementById("userBlockEnabled") || document.getElementById("hideDCGray");
const userBlockTriggerModeEl = document.getElementById("userBlockTriggerMode");
const userBlockHoverHintEl = document.getElementById("userBlockHoverHintEnabled");
const userBlockHoverHintRow = document.getElementById("userBlockHoverHintRow") || userBlockHoverHintEl?.closest?.(".row");
const userBlockModeGuide = document.getElementById("userBlockModeGuide");
const userBlockModeSubGuide = document.getElementById("userBlockModeSubGuide");
const uidInput = document.getElementById("uidInput");
const addUidBtn = document.getElementById("addUidBtn");
const uidListEl = document.getElementById("uidList");
const uidListCountEl = document.getElementById("uidListCount");
const clearUidListBtn = document.getElementById("clearUidListBtn");

const toggleHideMain = document.getElementById("toggleHideMain");
const toggleHideGall = document.getElementById("toggleHideGall");
const toggleHideSearch = document.getElementById("toggleHideSearch");

const toggleUidBadge = document.getElementById("toggleUidBadge");
const hideAnonymousToggle = document.getElementById("hideAnonymousEnabled");
const gamemecaBlockToggle = document.getElementById("gamemecaBlockEnabled");
const doryBlockToggle = document.getElementById("doryBlockEnabled");
const noticeBlockToggle = document.getElementById("noticeBlockEnabled");
const delaySection = document.getElementById("delaySection");

/* 독립 이용자 메모 */
const userMemoEnabledToggle = document.getElementById("userMemoEnabled");
const exportUserMemoBtn = document.getElementById("exportUserMemoBtn");
const importUserMemoBtn = document.getElementById("importUserMemoBtn");
const importUserMemoFile = document.getElementById("importUserMemoFile");
const userMemoTransferStatus = document.getElementById("userMemoTransferStatus");
const userMemoList = document.getElementById("userMemoList");
const refreshUserMemoListBtn = document.getElementById("refreshUserMemoListBtn");

/* ───────── defaults ───────── */
const DEFAULTS = {
  enabled: true,
  galleryBlockEnabled: undefined,
  builtinDcbestBlockEnabled: true,
  blockMode: "smart",
  quickBlockButtonPosition: "right-top",
  hideComment: false,
  hideImgComment: false,
  hideDccon: false,
  previewEnabled: false,

  keywordBlockEnabled: false,
  blockedKeywords: [],
  keywordBlockTargets: {
    listTitle: true,
    viewTitle: true,
    viewBody: true,
    comments: true
  },

  autoRefreshEnabled: false,
  autoRefreshInterval: 60,
  delay: 5,

  userBlockEnabled: true,
  userBlockTriggerMode: "instant",
  userBlockHoverHintEnabled: true,
  blockedUids: [],
  hideDCGray: undefined,

  hideMainEnabled: true,
  hideGallEnabled: true,
  hideSearchEnabled: true,

  showUidBadge: false,
  hideAnonymousEnabled: false,
  gamemecaBlockEnabled: true,
  doryBlockEnabled: true,
  noticeBlockEnabled: true,
  linkWarnEnabled: true,

  userMemoEnabled: true,
  compactListEnabled: false,
  blockedIds: [],

  dcbFontFamily: "Noto Sans KR",
  dcbFontCustomFamily: "",
  dcbFontScale: 100,
  dcbApplyFontToDc: true
};

let userBlockEnabledState = true;
let userBlockTriggerModeState = "instant";
let userBlockHoverHintEnabledState = true;

/* ───────── util ───────── */
function setChecked(el, value) {
  if (el) el.checked = !!value;
}

function setValue(el, value) {
  if (el) el.value = value;
}

function normalizeUserBlockTriggerMode(v) {
  return v === "contextMenu" ? "contextMenu" : "instant";
}

function applyUserBlockHoverHintControl() {
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

function updateUserBlockModeGuide(mode) {
  const normalized = normalizeUserBlockTriggerMode(mode);

  if (userBlockModeGuide) {
    userBlockModeGuide.innerHTML = normalized === "contextMenu"
      ? '<strong>구 방식:</strong> 작성자 닉네임, 갤로그 아이콘, 메모 버튼 위에서 우클릭한 뒤 브라우저 메뉴의 “이 사용자 차단하기”를 누르면 차단됩니다.'
      : '<strong>즉시 차단:</strong> 작성자 닉네임, 갤로그 아이콘, 메모 버튼 위에서 우클릭하면 UID/IP가 바로 차단 목록에 저장됩니다.';
  }

  if (userBlockModeSubGuide) {
    userBlockModeSubGuide.textContent = normalized === "contextMenu"
      ? '이 방식은 실수 방지를 위해 한 번 더 메뉴를 선택합니다. 닉네임 안내 팝업은 표시하지 않습니다.'
      : '글 제목, 본문, 댓글 내용 영역에서는 사용자 차단이 실행되지 않습니다. 안내 팝업은 필요할 때만 켤 수 있습니다.';
  }
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

function normalizeQuickBlockPosition(value) {
  const key = String(value || "").trim().toLowerCase();
  return QUICK_BLOCK_POSITION_VALUES.has(key) ? key : "right-top";
}

function lockDelay(disabled) {
  if (!delayNum || !delayRange) return;
  delayNum.disabled = !!disabled;
  delayRange.disabled = !!disabled;
  const op = disabled ? 0.5 : 1;
  delayNum.style.opacity = op;
  delayRange.style.opacity = op;
}

function updateBlockModeHint(mode) {
  if (blockModeHint) {
    const hints = {
      smart: "✨ 경고 화면 표시 후 선택 가능 (추천)",
      redirect: "⏱️ 카운트다운 후 자동 리다이렉트",
      block: "🚫 완전 차단 (네트워크 레벨)"
    };
    blockModeHint.textContent = hints[mode] || "";
  }

  if (delaySection) {
    delaySection.style.display = mode === "redirect" ? "block" : "none";
  }

  lockDelay(mode !== "redirect");
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

  applyUserBlockHoverHintControl();
}

function lockKeywordBlockUI(disabled) {
  const nodes = [
    keywordInput,
    addKeywordBtn,
    keywordTargetListTitle,
    keywordTargetViewTitle,
    keywordTargetViewBody,
    keywordTargetComments
  ];

  const op = disabled ? 0.5 : 1;

  nodes.forEach((el) => {
    if (!el) return;
    el.disabled = !!disabled;
    el.style.opacity = op;
  });
}

function setMemoTransferStatus(text, isError = false) {
  if (!userMemoTransferStatus) return;
  userMemoTransferStatus.textContent = text || "";
  userMemoTransferStatus.style.color = isError ? "#ff8d8d" : "#9dd6a5";
}

function sanitizeUid(s) {
  return String(s || "").trim().replace(/\s+/g, "");
}

function sanitizeKeyword(v) {
  return String(v || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function sanitizeText(v, max = 80) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
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
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function isDcInsideHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  return host === "dcinside.com" || host.endsWith(".dcinside.com");
}

function isPlainGalleryId(v) {
  return /^[a-z0-9_-]+$/i.test(String(v || "").trim());
}

function normalizeGalleryId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  if (/^id\s*=/i.test(raw)) {
    return raw.replace(/^id\s*=\s*/i, "").split(/[&#?\s]/)[0].trim().toLowerCase();
  }

  if (isPlainGalleryId(raw)) {
    return raw.toLowerCase();
  }

  try {
    const url = new URL(raw);

    if (!isDcInsideHost(url.hostname)) {
      return "";
    }

    const qsId = url.searchParams.get("id");
    if (qsId) return qsId.trim().toLowerCase();

    const pathMatch = url.pathname.match(/^\/(?:mgallery|mini|person)\/([^/?#]+)/i);
    if (pathMatch && pathMatch[1]) return pathMatch[1].trim().toLowerCase();

    return "";
  } catch (_) {
    return raw
      .toLowerCase()
      .replace(/^id\s*=\s*/i, "")
      .split(/[?#&\s]/)[0]
      .trim();
  }
}

const BUILTIN_GALLERY_IDS = ["dcbest"];

function getUserBlockedGallerySet(blockedIds = []) {
  const userIds = Array.isArray(blockedIds) ? blockedIds : [];
  return new Set(userIds.map(normalizeGalleryId).filter(Boolean));
}

function getBuiltinGallerySet(builtinDcbestBlockEnabled = true) {
  return new Set(
    (builtinDcbestBlockEnabled === false ? [] : BUILTIN_GALLERY_IDS)
      .map(normalizeGalleryId)
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
  const id = normalizeGalleryId(gid);
  const userBlocked = getUserBlockedGallerySet(blockedIds).has(id);
  const builtinBlocked = getBuiltinGallerySet(builtinDcbestBlockEnabled).has(id);
  return {
    userBlocked,
    builtinBlocked,
    blocked: userBlocked || builtinBlocked
  };
}

let currentGalleryIdForPopup = "";

function setQuickGalleryStatus(text, isError = false) {
  if (!blockCurrentGalleryStatus) return;
  blockCurrentGalleryStatus.textContent = text || "";
  blockCurrentGalleryStatus.style.color = isError ? "#ffb4b4" : "#9dd6a5";
}

function setQuickGalleryButtonState({ gid = "", userBlocked = false, builtinBlocked = false, isDcPage = false } = {}) {
  currentGalleryIdForPopup = gid;

  if (currentGalleryIdEl) {
    currentGalleryIdEl.textContent = gid || "감지 안 됨";
    currentGalleryIdEl.title = gid || "";
  }

  if (!blockCurrentGalleryBtn) return;

  if (!gid) {
    blockCurrentGalleryBtn.disabled = true;
    blockCurrentGalleryBtn.textContent = "현재 갤러리 차단";
    setQuickGalleryStatus(
      isDcPage
        ? "이 페이지에서는 갤러리 ID를 찾지 못했습니다."
        : "갤러리 페이지에서 팝업을 열면 바로 차단할 수 있습니다.",
      isDcPage
    );
    return;
  }

  if (userBlocked) {
    blockCurrentGalleryBtn.disabled = false;
    blockCurrentGalleryBtn.textContent = "차단 해제";
    setQuickGalleryStatus(`${gid} 갤러리가 차단되어 있습니다. 한 번 더 누르면 해제됩니다.`);
    return;
  }

  if (builtinBlocked) {
    blockCurrentGalleryBtn.disabled = true;
    blockCurrentGalleryBtn.textContent = "실시간베스트 차단됨";
    setQuickGalleryStatus(`${gid} 갤러리는 실시간베스트 차단 설정으로 막혀 있습니다.`);
    return;
  }

  blockCurrentGalleryBtn.disabled = false;
  blockCurrentGalleryBtn.textContent = "현재 갤러리 차단";
  setQuickGalleryStatus(`ID를 찾을 필요 없이 ${gid} 갤러리를 바로 차단합니다.`);
}

function refreshQuickGalleryState() {
  if (!quickGalleryPanel || !chrome.tabs || !chrome.tabs.query) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    const url = tab && tab.url ? String(tab.url) : "";
    let isDcPage = false;

    try {
      isDcPage = isDcInsideHost(new URL(url).hostname);
    } catch (_) {
      isDcPage = false;
    }

    const gid = normalizeGalleryId(url);

    if (!gid) {
      setQuickGalleryButtonState({ gid: "", isDcPage });
      return;
    }

    chrome.storage.sync.get(
      { blockedIds: [], builtinDcbestBlockEnabled: true },
      ({ blockedIds, builtinDcbestBlockEnabled }) => {
        setQuickGalleryButtonState({
          gid,
          ...getGalleryBlockState(gid, blockedIds, builtinDcbestBlockEnabled),
          isDcPage
        });
      }
    );
  });
}

function toggleCurrentGalleryBlocked() {
  const gid = normalizeGalleryId(currentGalleryIdForPopup);
  if (!gid || !blockCurrentGalleryBtn) return;

  blockCurrentGalleryBtn.disabled = true;
  setQuickGalleryStatus("처리 중…");

  chrome.storage.sync.get({ blockedIds: [], builtinDcbestBlockEnabled: true }, ({ blockedIds, builtinDcbestBlockEnabled }) => {
    const prev = Array.isArray(blockedIds) ? blockedIds : [];
    const normalized = prev.map(normalizeGalleryId).filter(Boolean);
    const state = getGalleryBlockState(gid, prev, builtinDcbestBlockEnabled);

    if (state.userBlocked) {
      const next = normalized.filter((blockedId) => blockedId !== gid);

      chrome.storage.sync.set({ blockedIds: next }, () => {
        if (chrome.runtime.lastError) {
          blockCurrentGalleryBtn.disabled = false;
          setQuickGalleryStatus("저장 실패: 확장 프로그램 저장소 상태를 확인해 주세요.", true);
          return;
        }

        setQuickGalleryButtonState({
          gid,
          userBlocked: false,
          builtinBlocked: state.builtinBlocked,
          isDcPage: true
        });
        setQuickGalleryStatus(`${gid} 갤러리 차단을 해제했습니다.`);
      });
      return;
    }

    if (state.builtinBlocked) {
      setQuickGalleryButtonState({ gid, userBlocked: false, builtinBlocked: true, isDcPage: true });
      return;
    }

    const next = Array.from(new Set([...normalized, gid]));

    chrome.storage.sync.set({ blockedIds: next }, () => {
      if (chrome.runtime.lastError) {
        blockCurrentGalleryBtn.disabled = false;
        setQuickGalleryStatus("저장 실패: 확장 프로그램 저장소 상태를 확인해 주세요.", true);
        return;
      }

      setQuickGalleryButtonState({ gid, userBlocked: true, builtinBlocked: false, isDcPage: true });
      setQuickGalleryStatus(`${gid} 갤러리를 차단 목록에 추가했습니다.`);
    });
  });
}


/* ───────── 다크모드 브리지 ───────── */
let dcThemeApplying = false;
let dcThemeRequestSeq = 0;
let dcThemeOptimisticUntil = 0;
let dcThemeOptimisticState = null;

function isDcInsideUrl(url) {
  try {
    const host = new URL(url || "").hostname;
    return /(^|\.)dcinside\.com$/i.test(host);
  } catch (_) {
    return false;
  }
}

function setDcThemeStatus(text, isError = false) {
  if (!dcThemeStatus) return;
  dcThemeStatus.textContent = text || "";
  dcThemeStatus.style.color = isError ? "#ffb4b4" : "#94a3b8";
}

function setDcThemeBusy(isBusy) {
  dcThemeApplying = !!isBusy;
  if (!dcDarkModeToggle) return;
  dcDarkModeToggle.disabled = !!isBusy;
  const switchEl = dcDarkModeToggle.closest(".switch");
  if (switchEl) switchEl.classList.toggle("is-busy", !!isBusy);
}

function lockDcThemeUi(state, duration = 1800) {
  dcThemeOptimisticState = !!state;
  dcThemeOptimisticUntil = Date.now() + duration;
  setChecked(dcDarkModeToggle, dcThemeOptimisticState);
}

function shouldKeepOptimisticThemeState() {
  return dcThemeOptimisticState !== null && Date.now() < dcThemeOptimisticUntil;
}

function clearDcThemeOptimisticLock() {
  dcThemeOptimisticState = null;
  dcThemeOptimisticUntil = 0;
}

function applyDcThemeStateToUi(isDark) {
  setChecked(dcDarkModeToggle, !!isDark);
  setDcThemeStatus(isDark ? "Current · Dark" : "Current · Light");
}

function sendDcThemeMessage(message, callback) {
  if (!chrome.tabs || !chrome.tabs.query) {
    callback(null, "활성 탭 접근 불가", null);
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      callback(null, chrome.runtime.lastError.message, null);
      return;
    }

    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      callback(null, "활성 탭 없음", null);
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


function clearLegacyDcThemePreference() {
  if (!chrome.storage || !chrome.storage.sync) return;
  chrome.storage.sync.remove("dcbDcDarkMode");
}

function refreshDcThemeState() {
  if (!dcDarkModeToggle || dcThemeApplying || shouldKeepOptimisticThemeState()) return;

  const seq = ++dcThemeRequestSeq;
  setDcThemeStatus("Checking…");

  sendDcThemeMessage({ type: "DCB_DC_THEME_GET_STATE" }, (state) => {
    if (seq !== dcThemeRequestSeq || dcThemeApplying || shouldKeepOptimisticThemeState()) return;

    if (!state || !state.available) {
      setChecked(dcDarkModeToggle, false);
      setDcThemeStatus("DC page only", false);
      return;
    }

    applyDcThemeStateToUi(!!state.isDark);
  });
}

/* ───────── UID 차단 목록 ───────── */
function getUidTokenKind(token) {
  const text = String(token || "").trim();
  return /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(text) ? "IP" : "UID";
}

function renderUidList(list) {
  if (!uidListEl) return;

  uidListEl.innerHTML = "";
  const uids = Array.isArray(list) ? list : [];

  if (uidListCountEl) uidListCountEl.textContent = `${uids.length}개`;
  if (clearUidListBtn) clearUidListBtn.disabled = !uids.length;

  if (!uids.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="uid-empty">등록된 유저 아이디와 아이피가 없습니다.</span>`;
    uidListEl.appendChild(li);
    return;
  }

  uids.forEach((uid, idx) => {
    const li = document.createElement("li");

    const left = document.createElement("span");
    left.className = "uid-list-left";

    const kind = document.createElement("span");
    kind.className = "uid-kind";
    kind.textContent = getUidTokenKind(uid);

    const code = document.createElement("code");
    code.textContent = uid;

    const btn = document.createElement("button");
    btn.className = "btn btn-danger";
    btn.type = "button";
    btn.dataset.idx = String(idx);
    btn.textContent = "삭제";

    left.append(kind, code);
    li.append(left, btn);
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

/* ───────── 키워드 차단 목록 ───────── */
function renderKeywordList(list) {
  if (!keywordListEl) return;

  keywordListEl.replaceChildren();
  keywordListEl.removeAttribute("hidden");
  keywordListEl.style.display = "flex";

  const keywords = normalizeKeywordList(list);
  keywordListEl.classList.toggle("is-empty", !keywords.length);
  keywordListEl.classList.toggle("has-keywords", keywords.length > 0);

  if (keywordListCountEl) {
    keywordListCountEl.textContent = `${keywords.length}개`;
  }

  if (!keywords.length) {
    const li = document.createElement("li");
    li.className = "keyword-empty";
    li.textContent = "등록된 차단 키워드가 없습니다.";
    keywordListEl.appendChild(li);
    return;
  }

  keywords.forEach((keyword, idx) => {
    const li = document.createElement("li");

    const code = document.createElement("code");
    code.textContent = keyword;
    code.title = keyword;

    const btn = document.createElement("button");
    btn.className = "btn btn-danger";
    btn.type = "button";
    btn.dataset.keywordIdx = String(idx);
    btn.textContent = "삭제";

    li.append(code, btn);
    keywordListEl.appendChild(li);
  });
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

function refreshKeywordBlockState() {
  if (!chrome.storage || !chrome.storage.sync) return;

  chrome.storage.sync.get(
    {
      keywordBlockEnabled: DEFAULTS.keywordBlockEnabled,
      blockedKeywords: DEFAULTS.blockedKeywords,
      keywordBlockTargets: DEFAULTS.keywordBlockTargets
    },
    (conf) => {
      if (chrome.runtime && chrome.runtime.lastError) return;

      setChecked(keywordBlockToggle, !!conf.keywordBlockEnabled);
      renderKeywordTargets(conf.keywordBlockTargets || DEFAULTS.keywordBlockTargets);
      lockKeywordBlockUI(!conf.keywordBlockEnabled);
      renderKeywordList(conf.blockedKeywords || []);
    }
  );
}

function saveKeywordList(mutator) {
  chrome.storage.sync.get(DEFAULTS, (conf) => {
    const list = Array.isArray(conf.blockedKeywords) ? conf.blockedKeywords.slice() : [];
    mutator(list);

    const uniq = normalizeKeywordList(list);

    chrome.storage.sync.set({ blockedKeywords: uniq }, () => renderKeywordList(uniq));
  });
}

function normalizeKeywordTargets(targets = {}) {
  const src = targets && typeof targets === "object" ? targets : {};

  /*
    popup/options/keyword-blocker.js가 같은 저장 키(keywordBlockTargets)를 공유한다.
    일부 사용자의 기존 저장값이 부분 객체로 남아 있어도 false 값이 기본값 true로 덮이지 않도록
    boolean 여부를 명확히 확인해서 병합한다.
  */
  return {
    listTitle:
      typeof src.listTitle === "boolean"
        ? src.listTitle
        : DEFAULTS.keywordBlockTargets.listTitle,
    viewTitle:
      typeof src.viewTitle === "boolean"
        ? src.viewTitle
        : DEFAULTS.keywordBlockTargets.viewTitle,
    viewBody:
      typeof src.viewBody === "boolean"
        ? src.viewBody
        : DEFAULTS.keywordBlockTargets.viewBody,
    comments:
      typeof src.comments === "boolean"
        ? src.comments
        : DEFAULTS.keywordBlockTargets.comments
  };
}

function renderKeywordTargets(targets = {}) {
  const merged = normalizeKeywordTargets(targets);

  setChecked(keywordTargetListTitle, merged.listTitle);
  setChecked(keywordTargetViewTitle, merged.viewTitle);
  setChecked(keywordTargetViewBody, merged.viewBody);
  setChecked(keywordTargetComments, merged.comments);
}

function getKeywordTargetsFromUI() {
  return normalizeKeywordTargets({
    listTitle: keywordTargetListTitle ? !!keywordTargetListTitle.checked : true,
    viewTitle: keywordTargetViewTitle ? !!keywordTargetViewTitle.checked : true,
    viewBody: keywordTargetViewBody ? !!keywordTargetViewBody.checked : true,
    comments: keywordTargetComments ? !!keywordTargetComments.checked : true
  });
}

function saveKeywordTargets() {
  const next = getKeywordTargetsFromUI();

  // popup은 수명이 짧으므로 먼저 현재 화면을 확정 상태로 고정한다.
  renderKeywordTargets(next);

  chrome.storage.sync.set(
    {
      keywordBlockTargets: next
    },
    () => {
      if (chrome.runtime.lastError) {
        console.warn("[DCB] keywordBlockTargets save failed:", chrome.runtime.lastError.message);

        // 저장 실패 시 실제 저장값을 다시 읽어 UI와 저장소 상태를 맞춘다.
        chrome.storage.sync.get({ keywordBlockTargets: DEFAULTS.keywordBlockTargets }, (conf) => {
          renderKeywordTargets(conf.keywordBlockTargets);
        });
      }
    }
  );
}

/* ───────── 이용자 메모 ───────── */
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

    const color = /^#[0-9a-fA-F]{6}$/.test(String(value.color || ""))
      ? String(value.color)
      : "#999999";

    next[String(key)] = {
      memo,
      color,
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

async function renderPopupMemoList() {
  if (!userMemoList) return;

  const userMemos = await getUserMemos();
  const rows = Object.entries(userMemos)
    .sort((a, b) => (Number(b[1].updatedAt) || 0) - (Number(a[1].updatedAt) || 0))
    .slice(0, 8);

  userMemoList.innerHTML = "";

  if (!rows.length) {
    const li = document.createElement("li");
    li.textContent = "저장된 이용자 메모가 없습니다.";
    userMemoList.appendChild(li);
    return;
  }

  rows.forEach(([key, item]) => {
    const li = document.createElement("li");

    const top = document.createElement("div");
    top.className = "user-memo-top";

    const chips = [
      item.uid ? `아이디: ${item.uid}` : "",
      item.ip ? `아이피: ${item.ip}` : "",
      item.nickname ? `닉네임: ${item.nickname}` : ""
    ].filter(Boolean);

    chips.forEach((text) => {
      const chip = document.createElement("span");
      chip.className = "user-memo-chip";
      chip.textContent = text;
      top.appendChild(chip);
    });

    const body = document.createElement("div");
    body.className = "user-memo-body";
    body.textContent = sanitizeText(item.memo, 80) || "(빈 메모)";

    const actions = document.createElement("div");
    actions.className = "user-memo-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-danger";
    deleteBtn.textContent = "삭제";

    deleteBtn.addEventListener("click", async () => {
      const next = await getUserMemos();
      delete next[key];
      await setUserMemos(next);
      renderPopupMemoList();
    });

    actions.appendChild(deleteBtn);
    li.appendChild(top);
    li.appendChild(body);
    li.appendChild(actions);
    userMemoList.appendChild(li);
  });
}

/* ───────── 초기 로드 ───────── */
chrome.storage.sync.get(DEFAULTS, (conf) => {
  if (typeof conf.userBlockEnabled !== "boolean" && typeof conf.hideDCGray === "boolean") {
    conf.userBlockEnabled = conf.hideDCGray;
    chrome.storage.sync.set({ userBlockEnabled: conf.userBlockEnabled });
  }

  const {
    enabled,
    galleryBlockEnabled,
    builtinDcbestBlockEnabled,
    blockMode,
    quickBlockButtonPosition,
    hideComment,
    hideImgComment,
    hideDccon,
    previewEnabled,
    keywordBlockEnabled,
    blockedKeywords,
    keywordBlockTargets,
    autoRefreshEnabled,
    autoRefreshInterval,
    delay,
    userBlockEnabled,
    userBlockTriggerMode,
    userBlockHoverHintEnabled,
    blockedUids,
    hideMainEnabled,
    hideGallEnabled,
    hideSearchEnabled,
    showUidBadge,
    hideAnonymousEnabled,
    gamemecaBlockEnabled,
    doryBlockEnabled,
    noticeBlockEnabled,
    userMemoEnabled,
    compactListEnabled
  } = conf;

  setChecked(toggle, getGalleryBlockEnabled({ galleryBlockEnabled, enabled }));
  setChecked(builtinDcbestBlockToggle, builtinDcbestBlockEnabled !== false);
  setValue(blockModeSel, blockMode);
  setValue(quickBlockButtonPositionSel, normalizeQuickBlockPosition(quickBlockButtonPosition));
  updateBlockModeHint(blockMode);

  setChecked(hideCmtToggle, hideComment);
  setChecked(hideImgCmtToggle, hideImgComment);
  setChecked(hideDcconToggle, hideDccon);
  setChecked(previewToggle, previewEnabled);

  setChecked(keywordBlockToggle, keywordBlockEnabled);
  renderKeywordTargets(keywordBlockTargets);
  lockKeywordBlockUI(!keywordBlockEnabled);
  renderKeywordList(blockedKeywords);
  refreshKeywordBlockState();

  setChecked(autoRefreshToggle, autoRefreshEnabled);
  setValue(autoRefreshIntervalNum, autoRefreshInterval);
  setValue(autoRefreshIntervalRange, autoRefreshInterval);
  setValue(delayNum, delay);
  setValue(delayRange, delay);

  userBlockEnabledState = userBlockEnabled !== false;
  userBlockTriggerModeState = normalizeUserBlockTriggerMode(userBlockTriggerMode);
  userBlockHoverHintEnabledState = userBlockHoverHintEnabled !== false;

  setChecked(userBlockEl, userBlockEnabledState);
  setValue(userBlockTriggerModeEl, userBlockTriggerModeState);
  updateUserBlockModeGuide(userBlockTriggerModeState);
  lockUserBlockUI(!userBlockEnabledState);
  refreshUidList();

  setChecked(toggleHideMain, hideMainEnabled);
  setChecked(toggleHideGall, hideGallEnabled);
  setChecked(toggleHideSearch, hideSearchEnabled);
  setChecked(toggleUidBadge, showUidBadge);
  setChecked(hideAnonymousToggle, hideAnonymousEnabled);
  setChecked(gamemecaBlockToggle, gamemecaBlockEnabled);
  setChecked(doryBlockToggle, doryBlockEnabled);
  setChecked(noticeBlockToggle, noticeBlockEnabled);
  setChecked(userMemoEnabledToggle, userMemoEnabled);
  setChecked(compactListToggle, compactListEnabled);
  setChecked(dcDarkModeToggle, false);
  clearLegacyDcThemePreference();
  refreshDcThemeState();
  refreshQuickGalleryState();
});

/* ───────── 이벤트 바인딩 ───────── */
if (toggle) {
  toggle.onchange = (e) => {
    const on = !!e.target.checked;
    chrome.storage.sync.set({ galleryBlockEnabled: on, enabled: on });
  };
}

if (builtinDcbestBlockToggle) {
  builtinDcbestBlockToggle.onchange = (e) => {
    chrome.storage.sync.set({ builtinDcbestBlockEnabled: !!e.target.checked });
  };
}

if (blockCurrentGalleryBtn) {
  blockCurrentGalleryBtn.addEventListener("click", toggleCurrentGalleryBlocked);
}


if (dcDarkModeToggle) {
  dcDarkModeToggle.onchange = (e) => {
    if (dcThemeApplying) {
      if (shouldKeepOptimisticThemeState()) setChecked(dcDarkModeToggle, dcThemeOptimisticState);
      return;
    }

    const requested = !!e.target.checked;
    const seq = ++dcThemeRequestSeq;

    // Optimistic lock: the page result is correct, so do not let a stale
    // GET response or a late page-button hint bounce the switch back.
    lockDcThemeUi(requested, 2600);
    setDcThemeBusy(true);
    setDcThemeStatus(requested ? "Switching to dark…" : "Switching to light…");

    sendDcThemeMessage({ type: "DCB_DC_THEME_SET_STATE", enabled: requested }, (state, error, tab) => {
      if (seq !== dcThemeRequestSeq) return;
      setDcThemeBusy(false);

      if (!state || !state.available) {
        if (isDcInsideUrl(tab && tab.url)) {
          // DC may reload or rebuild the page while darkmode() is being applied.
          // Keep the user's requested visual state instead of flashing back.
          applyDcThemeStateToUi(requested);
          window.setTimeout(() => {
            if (seq === dcThemeRequestSeq) clearDcThemeOptimisticLock();
          }, 2600);
          return;
        }

        clearDcThemeOptimisticLock();
        setChecked(dcDarkModeToggle, false);
        setDcThemeStatus(error ? "DC page only" : "DC page only", false);
        return;
      }

      const isDark = typeof state.requestedState === "boolean"
        ? !!state.requestedState
        : requested;

      applyDcThemeStateToUi(isDark);
      window.setTimeout(() => {
        if (seq === dcThemeRequestSeq) clearDcThemeOptimisticLock();
      }, 2600);
    });
  };
}

if (blockModeSel) {
  blockModeSel.onchange = (e) => {
    const mode = e.target.value;
    chrome.storage.sync.set({ blockMode: mode });
    updateBlockModeHint(mode);
  };
}

if (quickBlockButtonPositionSel) {
  quickBlockButtonPositionSel.onchange = (e) => {
    chrome.storage.sync.set({
      quickBlockButtonPosition: normalizeQuickBlockPosition(e.target.value)
    });
  };
}

if (hideCmtToggle) {
  hideCmtToggle.onchange = (e) => chrome.storage.sync.set({ hideComment: !!e.target.checked });
}

if (hideImgCmtToggle) {
  hideImgCmtToggle.onchange = (e) => chrome.storage.sync.set({ hideImgComment: !!e.target.checked });
}

if (hideDcconToggle) {
  hideDcconToggle.onchange = (e) => chrome.storage.sync.set({ hideDccon: !!e.target.checked });
}

if (previewToggle) {
  previewToggle.onchange = (e) => chrome.storage.sync.set({ previewEnabled: !!e.target.checked });
}

if (keywordBlockToggle) {
  keywordBlockToggle.onchange = (e) => {
    const on = !!e.target.checked;
    lockKeywordBlockUI(!on);
    chrome.storage.sync.set({ keywordBlockEnabled: on });
  };
}

if (addKeywordBtn && keywordInput) {
  addKeywordBtn.onclick = () => {
    const keyword = sanitizeKeyword(keywordInput.value);
    if (!keyword) return;

    saveKeywordList((list) => list.push(keyword));
    keywordInput.value = "";
    keywordInput.focus();
  };

  keywordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addKeywordBtn.click();
    }
  });
}

if (keywordListEl) {
  keywordListEl.addEventListener("click", (e) => {
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

  // input은 change보다 먼저 발생하므로 popup을 바로 닫아도 저장 누락 가능성을 줄인다.
  el.addEventListener("input", saveKeywordTargets);
  el.addEventListener("change", saveKeywordTargets);
});

if (autoRefreshToggle) {
  autoRefreshToggle.onchange = (e) => chrome.storage.sync.set({ autoRefreshEnabled: !!e.target.checked });
}

function updateAutoRefreshInterval(v) {
  const num = Math.max(10, Math.min(600, parseInt(v, 10) || 60));
  setValue(autoRefreshIntervalNum, num);
  setValue(autoRefreshIntervalRange, num);
  chrome.storage.sync.set({ autoRefreshInterval: num });
}

if (autoRefreshIntervalNum) {
  autoRefreshIntervalNum.oninput = (e) => updateAutoRefreshInterval(e.target.value);
}
if (autoRefreshIntervalRange) {
  autoRefreshIntervalRange.oninput = (e) => updateAutoRefreshInterval(e.target.value);
}

function updateDelay(v) {
  const num = Math.max(0, Math.min(10, parseFloat(v) || 0));
  setValue(delayNum, num);
  setValue(delayRange, num);
  chrome.storage.sync.set({ delay: num });
}

if (delayNum) {
  delayNum.oninput = (e) => updateDelay(e.target.value);
}
if (delayRange) {
  delayRange.oninput = (e) => updateDelay(e.target.value);
}

if (userBlockEl) {
  userBlockEl.onchange = (e) => {
    const on = !!e.target.checked;
    lockUserBlockUI(!on);
    chrome.storage.sync.set({ userBlockEnabled: on });
  };
}

if (userBlockTriggerModeEl) {
  userBlockTriggerModeEl.onchange = (e) => {
    const mode = normalizeUserBlockTriggerMode(e.target.value);
    userBlockTriggerModeState = mode;
    updateUserBlockModeGuide(mode);
    applyUserBlockHoverHintControl();
    chrome.storage.sync.set({ userBlockTriggerMode: mode });
  };
}

if (userBlockHoverHintEl) {
  userBlockHoverHintEl.onchange = (e) => {
    userBlockHoverHintEnabledState = !!e.target.checked;
    chrome.storage.sync.set({ userBlockHoverHintEnabled: userBlockHoverHintEnabledState });
  };
}

if (addUidBtn && uidInput) {
  addUidBtn.onclick = () => {
    const v = sanitizeUid(uidInput.value);
    if (!v) return;

    saveUidList((list) => list.push(v));
    uidInput.value = "";
    uidInput.focus();
  };

  uidInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUidBtn.click();
    }
  });
}

if (uidListEl) {
  uidListEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-idx]");
    if (!btn) return;

    const idx = Number(btn.dataset.idx);
    saveUidList((list) => {
      list.splice(idx, 1);
    });
  });
}

if (clearUidListBtn) {
  clearUidListBtn.addEventListener("click", async () => {
    try {
      if (globalThis.DCBUserBlockStore?.clearAllTokens) {
        await DCBUserBlockStore.clearAllTokens();
      } else {
        await chrome.storage.local.set({ blockedUids: [] });
      }
      renderUidList([]);
    } catch (err) {
      console.warn("[DCB] uid list clear failed", err);
      alert("사용자 차단 목록을 초기화하지 못했습니다. 확장 프로그램을 다시 로드한 뒤 시도해 주세요.");
    }
  });
}

if (toggleHideMain) {
  toggleHideMain.onchange = (e) => chrome.storage.sync.set({ hideMainEnabled: !!e.target.checked });
}
if (toggleHideGall) {
  toggleHideGall.onchange = (e) => chrome.storage.sync.set({ hideGallEnabled: !!e.target.checked });
}
if (toggleHideSearch) {
  toggleHideSearch.onchange = (e) => chrome.storage.sync.set({ hideSearchEnabled: !!e.target.checked });
}
if (toggleUidBadge) {
  toggleUidBadge.onchange = (e) => chrome.storage.sync.set({ showUidBadge: !!e.target.checked });
}
if (hideAnonymousToggle) {
  hideAnonymousToggle.onchange = (e) => chrome.storage.sync.set({ hideAnonymousEnabled: !!e.target.checked });
}
if (gamemecaBlockToggle) {
  gamemecaBlockToggle.onchange = (e) => chrome.storage.sync.set({ gamemecaBlockEnabled: !!e.target.checked });
}
if (doryBlockToggle) {
  doryBlockToggle.onchange = (e) => chrome.storage.sync.set({ doryBlockEnabled: !!e.target.checked });
}
if (noticeBlockToggle) {
  noticeBlockToggle.onchange = (e) => chrome.storage.sync.set({ noticeBlockEnabled: !!e.target.checked });
}
if (userMemoEnabledToggle) {
  userMemoEnabledToggle.onchange = (e) => chrome.storage.sync.set({ userMemoEnabled: !!e.target.checked });
}
if (compactListToggle) {
  compactListToggle.onchange = (e) => chrome.storage.sync.set({ compactListEnabled: !!e.target.checked });
}

/* ───────── 이용자 메모 JSON ───────── */
if (exportUserMemoBtn) {
  exportUserMemoBtn.onclick = () => {
    chrome.storage.local.get({ userMemos: {} }, ({ userMemos }) => {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        userMemos: userMemos || {}
      };
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadJson(`dcb-user-memos-${stamp}.json`, payload);
      setMemoTransferStatus(`내보내기 완료 · ${Object.keys(userMemos || {}).length}건`);
    });
  };
}

if (importUserMemoBtn && importUserMemoFile) {
  importUserMemoBtn.onclick = () => importUserMemoFile.click();

  importUserMemoFile.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = normalizeImportedMemoObject(parsed);

      chrome.storage.local.get({ userMemos: {} }, ({ userMemos }) => {
        const merged = {
          ...(userMemos || {}),
          ...imported
        };
        chrome.storage.local.set({ userMemos: merged }, () => {
          setMemoTransferStatus(`가져오기 완료 · ${Object.keys(imported).length}건 반영`);
          renderPopupMemoList();
        });
      });
    } catch (err) {
      setMemoTransferStatus("가져오기 실패 · JSON 형식을 확인해 주세요.", true);
    } finally {
      importUserMemoFile.value = "";
    }
  });
}

if (refreshUserMemoListBtn) {
  refreshUserMemoListBtn.addEventListener("click", () => {
    renderPopupMemoList();
  });
}

function dcbPopupRefreshKeywordState() {
  refreshKeywordBlockState();
  document.dispatchEvent(new CustomEvent("dcb:keyword-hide-ui-refresh"));
}

window.addEventListener("focus", dcbPopupRefreshKeywordState);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) dcbPopupRefreshKeywordState();
});

/* ───────── 스토리지 외부 변경 반영 ───────── */
chrome.storage.onChanged.addListener((c, a) => {
  if (a === "sync") {
    if (c.blockedIds || c.builtinDcbestBlockEnabled) refreshQuickGalleryState();
    if (c.builtinDcbestBlockEnabled && builtinDcbestBlockToggle) {
      setChecked(builtinDcbestBlockToggle, c.builtinDcbestBlockEnabled.newValue !== false);
    }
    if (c.galleryBlockEnabled || c.enabled) {
      chrome.storage.sync.get({ galleryBlockEnabled: undefined, enabled: true }, (conf) => {
        setChecked(toggle, getGalleryBlockEnabled(conf));
      });
    }
    if (c.blockMode) {
      setValue(blockModeSel, c.blockMode.newValue);
      updateBlockModeHint(c.blockMode.newValue);
    }
    if (c.quickBlockButtonPosition) {
      setValue(quickBlockButtonPositionSel, normalizeQuickBlockPosition(c.quickBlockButtonPosition.newValue));
    }
    if (c.hideComment) setChecked(hideCmtToggle, c.hideComment.newValue);
    if (c.hideImgComment) setChecked(hideImgCmtToggle, c.hideImgComment.newValue);
    if (c.hideDccon) setChecked(hideDcconToggle, c.hideDccon.newValue);
    if (c.previewEnabled) setChecked(previewToggle, c.previewEnabled.newValue);

    if (c.keywordBlockEnabled) {
      setChecked(keywordBlockToggle, c.keywordBlockEnabled.newValue);
      lockKeywordBlockUI(!c.keywordBlockEnabled.newValue);
    }
    if (c.blockedKeywords) renderKeywordList(c.blockedKeywords.newValue || []);
    if (c.keywordBlockTargets) renderKeywordTargets(c.keywordBlockTargets.newValue || DEFAULTS.keywordBlockTargets);

    if (c.autoRefreshEnabled) setChecked(autoRefreshToggle, c.autoRefreshEnabled.newValue);
    if (c.autoRefreshInterval) {
      setValue(autoRefreshIntervalNum, c.autoRefreshInterval.newValue);
      setValue(autoRefreshIntervalRange, c.autoRefreshInterval.newValue);
    }
    if (c.delay) {
      setValue(delayNum, c.delay.newValue);
      setValue(delayRange, c.delay.newValue);
    }
    if (c.userBlockEnabled) {
      userBlockEnabledState = c.userBlockEnabled.newValue !== false;
      setChecked(userBlockEl, userBlockEnabledState);
      lockUserBlockUI(!userBlockEnabledState);
    }
    if (c.userBlockTriggerMode) {
      const mode = normalizeUserBlockTriggerMode(c.userBlockTriggerMode.newValue);
      userBlockTriggerModeState = mode;
      setValue(userBlockTriggerModeEl, mode);
      updateUserBlockModeGuide(mode);
      applyUserBlockHoverHintControl();
    }
    if (c.userBlockHoverHintEnabled) {
      userBlockHoverHintEnabledState = c.userBlockHoverHintEnabled.newValue !== false;
      applyUserBlockHoverHintControl();
    }
    if (c.blockedUids) refreshUidList();
    if (c.hideMainEnabled) setChecked(toggleHideMain, c.hideMainEnabled.newValue);
    if (c.hideGallEnabled) setChecked(toggleHideGall, c.hideGallEnabled.newValue);
    if (c.hideSearchEnabled) setChecked(toggleHideSearch, c.hideSearchEnabled.newValue);
    if (c.showUidBadge) setChecked(toggleUidBadge, c.showUidBadge.newValue);
    if (c.hideAnonymousEnabled) setChecked(hideAnonymousToggle, c.hideAnonymousEnabled.newValue);
    if (c.gamemecaBlockEnabled) setChecked(gamemecaBlockToggle, c.gamemecaBlockEnabled.newValue);
    if (c.doryBlockEnabled) setChecked(doryBlockToggle, c.doryBlockEnabled.newValue);
    if (c.noticeBlockEnabled) setChecked(noticeBlockToggle, c.noticeBlockEnabled.newValue);
    if (c.userMemoEnabled) setChecked(userMemoEnabledToggle, c.userMemoEnabled.newValue);
    if (c.compactListEnabled) setChecked(compactListToggle, c.compactListEnabled.newValue);
  }

  if (a === "local" && globalThis.DCBUserBlockStore?.isRelevantChange?.(c)) {
    refreshUidList(80);
  }

  if (a === "local" && c.userMemos) {
    const count = Object.keys(c.userMemos.newValue || {}).length;
    setMemoTransferStatus(`메모 저장소 갱신 · 현재 ${count}건`);
    renderPopupMemoList();
  }
});

renderPopupMemoList();

if (openOptionsBtn) {
  openOptionsBtn.onclick = () => chrome.runtime.openOptionsPage();
}

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

  const sendToActivePage = (action) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !/^https?:\/\/gall\.dcinside\.com\//.test(tab.url || "")) {
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
  ui.list?.addEventListener("click", () => sendToActivePage("dcb.imageBlock.openList"));

  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === "sync" || area === "local") && changes[CONFIG_KEY]) render(applyOneClick(changes[CONFIG_KEY].newValue));
  });

  load();
})();
