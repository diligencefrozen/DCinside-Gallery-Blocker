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

const BACKUP_KEYS = [
  "blockedIds", "removeSelectors", "removeSelectorsGall", "removeSelectorsSearch",
  "userBlockEnabled", "blockedUids", "hideComment", "hideImgComment", "hideDccon",
  "hideMainEnabled", "hideGallEnabled", "hideSearchEnabled",
  "enabled", "galleryBlockEnabled", "blockMode", "autoRefreshEnabled",
  "autoRefreshInterval", "delay", "showUidBadge", "linkWarnEnabled", "hideDCGray",
  "previewEnabled", "hideAnonymousEnabled"
];

const BACKUP_DEFAULTS = {
  blockedIds: [],
  removeSelectors: [],
  removeSelectorsGall: [],
  removeSelectorsSearch: [],
  userBlockEnabled: true,
  blockedUids: [],
  hideComment: false,
  hideImgComment: false,
  hideDccon: false,
  hideMainEnabled: true,
  hideGallEnabled: true,
  hideSearchEnabled: true,
  enabled: true,
  galleryBlockEnabled: undefined,
  blockMode: "smart",
  autoRefreshEnabled: false,
  autoRefreshInterval: 60,
  delay: 5,
  showUidBadge: true,
  linkWarnEnabled: true,
  hideDCGray: undefined,
  previewEnabled: false,
  hideAnonymousEnabled: false
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
const uidInput = document.getElementById("uidInput");
const addUidBtn = document.getElementById("addUidBtn");
const uidListEl = document.getElementById("uidList");

const previewEnabledEl = document.getElementById("previewEnabled");
const hideCommentEl = document.getElementById("hideComment");
const hideImgCommentEl = document.getElementById("hideImgComment");
const hideDcconEl = document.getElementById("hideDccon");
const hideAnonymousEl = document.getElementById("hideAnonymousEnabled");

const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFileEl = document.getElementById("importFile");

/* 메모 관리 DOM */
const memoSearchInput = document.getElementById("memoSearchInput");
const refreshMemoListBtn = document.getElementById("refreshMemoListBtn");
const exportUserMemoBtn = document.getElementById("exportUserMemoBtn");
const importUserMemoBtn = document.getElementById("importUserMemoBtn");
const importUserMemoFile = document.getElementById("importUserMemoFile");
const memoList = document.getElementById("memoList");
const userMemoStatus = document.getElementById("userMemoStatus");

/* ───── 공통 유틸 ───── */
const norm = s => String(s || "").trim().toLowerCase();
const sanitizeUid = s => String(s || "").trim().replace(/\s+/g, "");

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

function sanitizeImport(raw) {
  const body = raw && typeof raw === "object"
    ? (raw.data && typeof raw.data === "object" ? raw.data : raw)
    : null;

  if (!body || typeof body !== "object") throw new Error("invalid");

  const patch = {};
  BACKUP_KEYS.forEach(k => {
    if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k];
  });
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

function exportSettings() {
  chrome.storage.sync.get(BACKUP_DEFAULTS, snapshot => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: snapshot
    };
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`dcb-settings-${ts}.json`, payload);
  });
}

function importSettingsFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const patch = sanitizeImport(parsed);
      chrome.storage.sync.set(patch, () => {
        alert("백업을 불러왔습니다. 페이지를 새로고침합니다.");
        location.reload();
      });
    } catch (err) {
      console.error("[DCB] backup import failed", err);
      alert("백업 파일을 불러오지 못했습니다. JSON 형식을 확인하세요.");
    }
  };
  reader.readAsText(file);
}

/* ───── 갤러리 차단 ───── */
function renderUser(ids) {
  listEl.innerHTML = "";
  const vis = ids.filter(id => !builtinBlocked.includes(id));
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
  recList.innerHTML = "";
  recommendedIds.forEach(id => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    const already = blocked.includes(id);
    btn.textContent = already ? "✓ 추가됨" : "추가";
    btn.disabled = already;
    btn.className = already ? "added" : "";
    if (!already) btn.onclick = () => updateBlocked([...blocked, id]);
    li.textContent = id + " ";
    li.appendChild(btn);
    recList.appendChild(li);
  });
}

function renderSel(arr, targetUl, key) {
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
  chrome.storage.sync.set({ [key]: uniq }, () => renderSel(uniq, targetUl, key));
}

/* ───── 사용자 차단(UID) ───── */
function lockUserBlockUI(disabled) {
  if (!uidInput || !addUidBtn) return;
  uidInput.disabled = addUidBtn.disabled = !!disabled;
  const op = disabled ? 0.5 : 1;
  uidInput.style.opacity = addUidBtn.style.opacity = op;
}

function renderUidList(uids) {
  uidListEl.innerHTML = "";
  if (!uids || !uids.length) {
    uidListEl.innerHTML = '<li class="note" style="background:transparent;padding:0">등록된 유저 아이디가 없습니다.</li>';
    return;
  }

  uids.forEach((uid, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<code>${uid}</code>`;
    const del = document.createElement("button");
    del.textContent = "삭제";
    del.onclick = () => saveUidList(list => { list.splice(idx, 1); });
    li.appendChild(del);
    uidListEl.appendChild(li);
  });
}

function saveUidList(mutator) {
  chrome.storage.sync.get({ blockedUids: [] }, ({ blockedUids }) => {
    const list = Array.isArray(blockedUids) ? blockedUids.slice() : [];
    mutator(list);
    const uniq = Array.from(new Set(list.map(sanitizeUid).filter(Boolean)));
    chrome.storage.sync.set({ blockedUids: uniq }, () => renderUidList(uniq));
  });
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

/* ───── 이벤트 ───── */
if (exportBtn) exportBtn.onclick = () => exportSettings();

if (importBtn && importFileEl) {
  importBtn.onclick = () => importFileEl.click();
  importFileEl.onchange = () => {
    const [file] = importFileEl.files || [];
    importSettingsFromFile(file);
    importFileEl.value = "";
  };
}

addBtn.onclick = () => {
  const id = norm(newIdInput.value);
  if (!id || builtinBlocked.includes(id)) return;

  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
    if (!blockedIds.map(norm).includes(id)) updateBlocked([...blockedIds, id]);
    newIdInput.value = "";
  });
};
newIdInput.addEventListener("keyup", e => { if (e.key === "Enter") addBtn.onclick(); });

addAllRec.onclick = () =>
  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) =>
    updateBlocked([...new Set([...blockedIds, ...recommendedIds])]));

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
newSel.addEventListener("keyup", e => { if (e.key === "Enter") addSelBtn.onclick(); });

addRecSel.onclick = () =>
  chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) =>
    updateSel([...new Set([...removeSelectors, ...recSelectors])], "removeSelectors", selList));

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
newGallSel.addEventListener("keyup", e => { if (e.key === "Enter") addGallSelBtn.onclick(); });

addRecGallSel.onclick = () =>
  chrome.storage.sync.get({ removeSelectorsGall: [] }, ({ removeSelectorsGall }) =>
    updateSel([...new Set([...removeSelectorsGall, ...recGallSelectors])], "removeSelectorsGall", gallSelList));

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
newSearchSel.addEventListener("keyup", e => { if (e.key === "Enter") addSearchSelBtn.onclick(); });

addRecSearchSel.onclick = () =>
  chrome.storage.sync.get({ removeSelectorsSearch: [] }, ({ removeSelectorsSearch }) =>
    updateSel([...new Set([...removeSelectorsSearch, ...recSearchSelectors])], "removeSelectorsSearch", searchSelList));

if (userBlockEl) {
  userBlockEl.addEventListener("change", e => {
    const on = !!e.target.checked;
    lockUserBlockUI(!on);
    chrome.storage.sync.set({ userBlockEnabled: on });
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
    saveUidList(list => { list.splice(idx, 1); });
  });
}

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

/* 메모 관리 이벤트 */
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
    blockedUids: [],
    hideComment: false,
    hideImgComment: false,
    hideDccon: false,
    previewEnabled: false,
    hideAnonymousEnabled: false,
    hideDCGray: undefined
  },
  ({ blockedIds, removeSelectors, removeSelectorsGall, removeSelectorsSearch, userBlockEnabled, blockedUids, hideComment, hideImgComment, hideDccon, previewEnabled, hideAnonymousEnabled, hideDCGray }) => {
    if (typeof userBlockEnabled !== "boolean" && typeof hideDCGray === "boolean") {
      userBlockEnabled = hideDCGray;
      chrome.storage.sync.set({ userBlockEnabled });
    }

    renderUser(blockedIds.map(norm));
    renderRec(blockedIds.map(norm));
    renderSel(removeSelectors, selList, "removeSelectors");
    renderSel(removeSelectorsGall, gallSelList, "removeSelectorsGall");
    renderSel(removeSelectorsSearch, searchSelList, "removeSelectorsSearch");

    if (userBlockEl) {
      userBlockEl.checked = !!userBlockEnabled;
      lockUserBlockUI(!userBlockEnabled);
    }
    renderUidList(blockedUids || []);

    if (hideCommentEl) hideCommentEl.checked = !!hideComment;
    if (hideImgCommentEl) hideImgCommentEl.checked = !!hideImgComment;
    if (hideDcconEl) hideDcconEl.checked = !!hideDccon;
    if (previewEnabledEl) previewEnabledEl.checked = !!previewEnabled;
    if (hideAnonymousEl) hideAnonymousEl.checked = !!hideAnonymousEnabled;
  }
);

renderMemoList();

/* 다른 탭/팝업 변경 반영 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.blockedIds) {
      const ids = (changes.blockedIds.newValue || []).map(norm);
      renderUser(ids);
      renderRec(ids);
    }
    if (changes.removeSelectors) renderSel(changes.removeSelectors.newValue || [], selList, "removeSelectors");
    if (changes.removeSelectorsGall) renderSel(changes.removeSelectorsGall.newValue || [], gallSelList, "removeSelectorsGall");
    if (changes.removeSelectorsSearch) renderSel(changes.removeSelectorsSearch.newValue || [], searchSelList, "removeSelectorsSearch");

    if (changes.userBlockEnabled && userBlockEl) {
      userBlockEl.checked = !!changes.userBlockEnabled.newValue;
      lockUserBlockUI(!changes.userBlockEnabled.newValue);
    }
    if (changes.blockedUids) renderUidList(changes.blockedUids.newValue || []);

    if (changes.hideComment && hideCommentEl) hideCommentEl.checked = !!changes.hideComment.newValue;
    if (changes.hideImgComment && hideImgCommentEl) hideImgCommentEl.checked = !!changes.hideImgComment.newValue;
    if (changes.hideDccon && hideDcconEl) hideDcconEl.checked = !!changes.hideDccon.newValue;
    if (changes.previewEnabled && previewEnabledEl) previewEnabledEl.checked = !!changes.previewEnabled.newValue;
    if (changes.hideAnonymousEnabled && hideAnonymousEl) hideAnonymousEl.checked = !!changes.hideAnonymousEnabled.newValue;
  }

  if (area === "local" && changes.userMemos) {
    renderMemoList();
  }
});
