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

/* ───────── util ───────── */
function lockDelay(disabled) {
  delayNum.disabled = disabled;
  delayRange.disabled = disabled;
  const op = disabled ? 0.5 : 1;
  delayNum.style.opacity = delayRange.style.opacity = op;
}

function updateBlockModeHint(mode) {
  if (!blockModeHint) return;
  const hints = {
    smart: "✨ 경고 화면 표시 후 선택 가능 (추천)",
    redirect: "⏱️ 카운트다운 후 자동 리다이렉트",
    block: "🚫 완전 차단 (네트워크 레벨)"
  };
  blockModeHint.textContent = hints[mode] || "";

  if (delaySection) {
    delaySection.style.display = mode === "redirect" ? "block" : "none";
  }
}

function lockUserBlockUI(disabled) {
  if (!uidInput || !addUidBtn) return;
  uidInput.disabled = addUidBtn.disabled = !!disabled;
  const op = disabled ? 0.5 : 1;
  uidInput.style.opacity = addUidBtn.style.opacity = op;
}

function setMemoTransferStatus(text, isError = false) {
  if (!userMemoTransferStatus) return;
  userMemoTransferStatus.textContent = text || "";
  userMemoTransferStatus.style.color = isError ? "#ff8d8d" : "#9dd6a5";
}

const DEFAULTS = {
  enabled: true,
  blockMode: "smart",
  hideComment: false,
  hideImgComment: false,
  hideDccon: false,
  previewEnabled: false,
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

  /* 독립 이용자 메모 */
  userMemoEnabled: true
};

function sanitizeUid(s) {
  return String(s || "").trim().replace(/\s+/g, "");
}

function renderUidList(list) {
  if (!uidListEl) return;
  uidListEl.innerHTML = "";
  (list || []).forEach((uid, idx) => {
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

function normalizeImportedMemoObject(raw) {
  const source =
    raw && typeof raw === "object"
      ? (raw.userMemos && typeof raw.userMemos === "object" ? raw.userMemos : raw)
      : {};

  const next = {};

  Object.entries(source).forEach(([key, value]) => {
    if (!key || !value || typeof value !== "object") return;

    const memo = String(value.memo ?? "").trim();
    if (!memo) return;

    const color = /^#[0-9a-fA-F]{6}$/.test(String(value.color || ""))
      ? String(value.color)
      : "#999999";

    next[String(key)] = {
      memo: memo.slice(0, 80),
      color,
      nickname: String(value.nickname || "").trim().slice(0, 60),
      uid: String(value.uid || "").trim().slice(0, 80),
      ip: String(value.ip || "").trim().slice(0, 80),
      updatedAt: Number(value.updatedAt) || Date.now()
    };
  });

  return next;
}

/* ───────── 초기 로드 ───────── */
chrome.storage.sync.get(DEFAULTS, (conf) => {
  if (typeof conf.userBlockEnabled !== "boolean" && typeof conf.hideDCGray === "boolean") {
    conf.userBlockEnabled = conf.hideDCGray;
    chrome.storage.sync.set({ userBlockEnabled: conf.userBlockEnabled });
  }

  const {
    enabled, blockMode, hideComment, hideImgComment, hideDccon, delay,
    previewEnabled, autoRefreshEnabled, autoRefreshInterval,
    userBlockEnabled, blockedUids,
    hideMainEnabled, hideGallEnabled, hideSearchEnabled,
    showUidBadge, hideAnonymousEnabled, userMemoEnabled
  } = conf;

  toggle.checked = enabled;
  blockModeSel.value = blockMode;
  updateBlockModeHint(blockMode);
  hideCmtToggle.checked = hideComment;
  hideImgCmtToggle.checked = hideImgComment;
  hideDcconToggle.checked = hideDccon;
  if (previewToggle) previewToggle.checked = !!previewEnabled;
  autoRefreshToggle.checked = autoRefreshEnabled;
  autoRefreshIntervalNum.value = autoRefreshInterval;
  autoRefreshIntervalRange.value = autoRefreshInterval;
  delayNum.value = delay;
  delayRange.value = delay;

  if (userBlockEl) {
    userBlockEl.checked = !!userBlockEnabled;
    lockUserBlockUI(!userBlockEnabled);
  }
  renderUidList(blockedUids);

  if (toggleHideMain) toggleHideMain.checked = !!hideMainEnabled;
  if (toggleHideGall) toggleHideGall.checked = !!hideGallEnabled;
  if (toggleHideSearch) toggleHideSearch.checked = !!hideSearchEnabled;
  if (toggleUidBadge) toggleUidBadge.checked = !!showUidBadge;
  if (hideAnonymousToggle) hideAnonymousToggle.checked = !!hideAnonymousEnabled;
  if (userMemoEnabledToggle) userMemoEnabledToggle.checked = !!userMemoEnabled;
});

/* ───────── 이벤트 바인딩 ───────── */
toggle.onchange = (e) => {
  chrome.storage.sync.set({ enabled: !!e.target.checked });
};

blockModeSel.onchange = (e) => {
  const mode = e.target.value;
  chrome.storage.sync.set({ blockMode: mode });
  updateBlockModeHint(mode);
};

hideCmtToggle.onchange = (e) =>
  chrome.storage.sync.set({ hideComment: e.target.checked });

hideImgCmtToggle.onchange = (e) =>
  chrome.storage.sync.set({ hideImgComment: e.target.checked });

hideDcconToggle.onchange = (e) =>
  chrome.storage.sync.set({ hideDccon: e.target.checked });

if (previewToggle) {
  previewToggle.onchange = (e) => {
    chrome.storage.sync.set({ previewEnabled: !!e.target.checked });
  };
}

autoRefreshToggle.onchange = (e) =>
  chrome.storage.sync.set({ autoRefreshEnabled: e.target.checked });

function updateAutoRefreshInterval(v) {
  const num = Math.max(10, Math.min(600, parseInt(v, 10) || 60));
  autoRefreshIntervalNum.value = autoRefreshIntervalRange.value = num;
  chrome.storage.sync.set({ autoRefreshInterval: num });
}
autoRefreshIntervalNum.oninput = (e) => updateAutoRefreshInterval(e.target.value);
autoRefreshIntervalRange.oninput = (e) => updateAutoRefreshInterval(e.target.value);

function updateDelay(v) {
  const num = Math.max(0, Math.min(10, parseFloat(v) || 0));
  delayNum.value = delayRange.value = num;
  chrome.storage.sync.set({ delay: num });
}
delayNum.oninput = (e) => updateDelay(e.target.value);
delayRange.oninput = (e) => updateDelay(e.target.value);

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
    saveUidList((list) => { list.splice(idx, 1); });
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
        });
      });
    } catch (err) {
      setMemoTransferStatus("가져오기 실패 · JSON 형식을 확인해 주세요.", true);
    } finally {
      importUserMemoFile.value = "";
    }
  });
}

/* ───────── 스토리지 외부 변경 반영 ───────── */
chrome.storage.onChanged.addListener((c, a) => {
  if (a === "sync") {
    if (c.enabled) toggle.checked = c.enabled.newValue;
    if (c.blockMode) {
      blockModeSel.value = c.blockMode.newValue;
      updateBlockModeHint(c.blockMode.newValue);
    }
    if (c.hideComment) hideCmtToggle.checked = c.hideComment.newValue;
    if (c.hideImgComment) hideImgCmtToggle.checked = c.hideImgComment.newValue;
    if (c.hideDccon) hideDcconToggle.checked = c.hideDccon.newValue;
    if (c.previewEnabled && previewToggle) {
      previewToggle.checked = !!c.previewEnabled.newValue;
    }
    if (c.autoRefreshEnabled) autoRefreshToggle.checked = c.autoRefreshEnabled.newValue;
    if (c.autoRefreshInterval) {
      autoRefreshIntervalNum.value = c.autoRefreshInterval.newValue;
      autoRefreshIntervalRange.value = c.autoRefreshInterval.newValue;
    }
    if (c.delay) {
      delayNum.value = c.delay.newValue;
      delayRange.value = c.delay.newValue;
    }
    if (c.userBlockEnabled && userBlockEl) {
      userBlockEl.checked = !!c.userBlockEnabled.newValue;
      lockUserBlockUI(!c.userBlockEnabled.newValue);
    }
    if (c.blockedUids) renderUidList(c.blockedUids.newValue || []);
    if (c.hideMainEnabled && toggleHideMain) toggleHideMain.checked = !!c.hideMainEnabled.newValue;
    if (c.hideGallEnabled && toggleHideGall) toggleHideGall.checked = !!c.hideGallEnabled.newValue;
    if (c.hideSearchEnabled && toggleHideSearch) toggleHideSearch.checked = !!c.hideSearchEnabled.newValue;
    if (c.showUidBadge && toggleUidBadge) toggleUidBadge.checked = !!c.showUidBadge.newValue;
    if (c.hideAnonymousEnabled && hideAnonymousToggle) hideAnonymousToggle.checked = !!c.hideAnonymousEnabled.newValue;
    if (c.userMemoEnabled && userMemoEnabledToggle) userMemoEnabledToggle.checked = !!c.userMemoEnabled.newValue;
  }

  if (a === "local" && c.userMemos) {
    const count = Object.keys(c.userMemos.newValue || {}).length;
    setMemoTransferStatus(`메모 저장소 갱신 · 현재 ${count}건`);
  }

  (() => {
  const userMemoList = document.getElementById("userMemoList");
  const refreshUserMemoListBtn = document.getElementById("refreshUserMemoListBtn");

  if (!userMemoList) return;

  function sanitizeText(v, max = 80) {
    return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
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

  if (refreshUserMemoListBtn) {
    refreshUserMemoListBtn.addEventListener("click", () => {
      renderPopupMemoList();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.userMemos) {
      renderPopupMemoList();
    }
  });

  renderPopupMemoList();
})();

(() => {
  const userMemoList = document.getElementById("userMemoList");
  const refreshUserMemoListBtn = document.getElementById("refreshUserMemoListBtn");

  if (!userMemoList) return;

  function sanitizeText(v, max = 80) {
    return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
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

  if (refreshUserMemoListBtn) {
    refreshUserMemoListBtn.addEventListener("click", () => {
      renderPopupMemoList();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.userMemos) {
      renderPopupMemoList();
    }
  });

  renderPopupMemoList();
})();

});

openOptionsBtn.onclick = () => chrome.runtime.openOptionsPage();
