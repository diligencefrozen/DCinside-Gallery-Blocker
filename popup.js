/* popup.js */

/* ───────── DOM ───────── */
const toggle = document.getElementById("toggle");
const blockModeSel = document.getElementById("blockMode");
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

const keywordBlockToggle = document.getElementById("keywordBlockEnabled");
const keywordInput = document.getElementById("keywordInput");
const addKeywordBtn = document.getElementById("addKeywordBtn");
const keywordListEl = document.getElementById("keywordList");
const keywordTargetListTitle = document.getElementById("keywordTargetListTitle");
const keywordTargetViewTitle = document.getElementById("keywordTargetViewTitle");
const keywordTargetViewBody = document.getElementById("keywordTargetViewBody");
const keywordTargetComments = document.getElementById("keywordTargetComments");

const userBlockEl = document.getElementById("userBlockEnabled") || document.getElementById("hideDCGray");
const uidInput = document.getElementById("uidInput");
const addUidBtn = document.getElementById("addUidBtn");
const uidListEl = document.getElementById("uidList");

const toggleHideMain = document.getElementById("toggleHideMain");
const toggleHideGall = document.getElementById("toggleHideGall");
const toggleHideSearch = document.getElementById("toggleHideSearch");

const toggleUidBadge = document.getElementById("toggleUidBadge");
const hideAnonymousToggle = document.getElementById("hideAnonymousEnabled");
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
  blockMode: "smart",
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
  blockedUids: [],
  hideDCGray: undefined,

  hideMainEnabled: true,
  hideGallEnabled: true,
  hideSearchEnabled: true,

  showUidBadge: false,
  hideAnonymousEnabled: false,
  linkWarnEnabled: true,

  userMemoEnabled: true,
  compactListEnabled: false
};

/* ───────── util ───────── */
function setChecked(el, value) {
  if (el) el.checked = !!value;
}

function setValue(el, value) {
  if (el) el.value = value;
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
  if (!uidInput || !addUidBtn) return;
  uidInput.disabled = !!disabled;
  addUidBtn.disabled = !!disabled;
  const op = disabled ? 0.5 : 1;
  uidInput.style.opacity = op;
  addUidBtn.style.opacity = op;
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

/* ───────── UID 차단 목록 ───────── */
function renderUidList(list) {
  if (!uidListEl) return;

  uidListEl.innerHTML = "";
  const uids = Array.isArray(list) ? list : [];

  if (!uids.length) {
    const li = document.createElement("li");
    li.className = "row";
    li.style.justifyContent = "space-between";
    li.innerHTML = `<span class="muted">등록된 유저 아이디와 아이피가 없습니다.</span>`;
    uidListEl.appendChild(li);
    return;
  }

  uids.forEach((uid, idx) => {
    const li = document.createElement("li");
    li.className = "row";
    li.style.justifyContent = "space-between";
    li.innerHTML = `<code>${uid}</code> <button class="btn btn-danger" data-idx="${idx}">삭제</button>`;
    uidListEl.appendChild(li);
  });
}

function saveUidList(mutator) {
  chrome.storage.sync.get(DEFAULTS, (conf) => {
    const list = Array.isArray(conf.blockedUids) ? conf.blockedUids.slice() : [];
    mutator(list);
    const uniq = Array.from(new Set(list.map(sanitizeUid).filter(Boolean)));
    chrome.storage.sync.set({ blockedUids: uniq }, () => renderUidList(uniq));
  });
}

/* ───────── 키워드 차단 목록 ───────── */
function renderKeywordList(list) {
  if (!keywordListEl) return;

  keywordListEl.innerHTML = "";
  const keywords = Array.isArray(list) ? list : [];

  if (!keywords.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="muted">등록된 키워드가 없습니다.</span>`;
    keywordListEl.appendChild(li);
    return;
  }

  keywords.forEach((keyword, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <code>${keyword}</code>
      <button class="btn btn-danger" data-keyword-idx="${idx}">삭제</button>
    `;
    keywordListEl.appendChild(li);
  });
}

function saveKeywordList(mutator) {
  chrome.storage.sync.get(DEFAULTS, (conf) => {
    const list = Array.isArray(conf.blockedKeywords) ? conf.blockedKeywords.slice() : [];
    mutator(list);

    const seen = new Set();
    const uniq = [];

    list.forEach((item) => {
      const keyword = sanitizeKeyword(item);
      const key = keyword.toLowerCase();
      if (!keyword || seen.has(key)) return;
      seen.add(key);
      uniq.push(keyword);
    });

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
    blockMode,
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
    blockedUids,
    hideMainEnabled,
    hideGallEnabled,
    hideSearchEnabled,
    showUidBadge,
    hideAnonymousEnabled,
    userMemoEnabled,
    compactListEnabled
  } = conf;

  setChecked(toggle, enabled);
  setValue(blockModeSel, blockMode);
  updateBlockModeHint(blockMode);

  setChecked(hideCmtToggle, hideComment);
  setChecked(hideImgCmtToggle, hideImgComment);
  setChecked(hideDcconToggle, hideDccon);
  setChecked(previewToggle, previewEnabled);

  setChecked(keywordBlockToggle, keywordBlockEnabled);
  renderKeywordTargets(keywordBlockTargets);
  lockKeywordBlockUI(!keywordBlockEnabled);
  renderKeywordList(blockedKeywords);

  setChecked(autoRefreshToggle, autoRefreshEnabled);
  setValue(autoRefreshIntervalNum, autoRefreshInterval);
  setValue(autoRefreshIntervalRange, autoRefreshInterval);
  setValue(delayNum, delay);
  setValue(delayRange, delay);

  setChecked(userBlockEl, userBlockEnabled);
  lockUserBlockUI(!userBlockEnabled);
  renderUidList(blockedUids);

  setChecked(toggleHideMain, hideMainEnabled);
  setChecked(toggleHideGall, hideGallEnabled);
  setChecked(toggleHideSearch, hideSearchEnabled);
  setChecked(toggleUidBadge, showUidBadge);
  setChecked(hideAnonymousToggle, hideAnonymousEnabled);
  setChecked(userMemoEnabledToggle, userMemoEnabled);
  setChecked(compactListToggle, compactListEnabled);
});

/* ───────── 이벤트 바인딩 ───────── */
if (toggle) {
  toggle.onchange = (e) => {
    chrome.storage.sync.set({ enabled: !!e.target.checked });
  };
}

if (blockModeSel) {
  blockModeSel.onchange = (e) => {
    const mode = e.target.value;
    chrome.storage.sync.set({ blockMode: mode });
    updateBlockModeHint(mode);
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

/* ───────── 스토리지 외부 변경 반영 ───────── */
chrome.storage.onChanged.addListener((c, a) => {
  if (a === "sync") {
    if (c.enabled) setChecked(toggle, c.enabled.newValue);
    if (c.blockMode) {
      setValue(blockModeSel, c.blockMode.newValue);
      updateBlockModeHint(c.blockMode.newValue);
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
      setChecked(userBlockEl, c.userBlockEnabled.newValue);
      lockUserBlockUI(!c.userBlockEnabled.newValue);
    }
    if (c.blockedUids) renderUidList(c.blockedUids.newValue || []);
    if (c.hideMainEnabled) setChecked(toggleHideMain, c.hideMainEnabled.newValue);
    if (c.hideGallEnabled) setChecked(toggleHideGall, c.hideGallEnabled.newValue);
    if (c.hideSearchEnabled) setChecked(toggleHideSearch, c.hideSearchEnabled.newValue);
    if (c.showUidBadge) setChecked(toggleUidBadge, c.showUidBadge.newValue);
    if (c.hideAnonymousEnabled) setChecked(hideAnonymousToggle, c.hideAnonymousEnabled.newValue);
    if (c.userMemoEnabled) setChecked(userMemoEnabledToggle, c.userMemoEnabled.newValue);
    if (c.compactListEnabled) setChecked(compactListToggle, c.compactListEnabled.newValue);
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
