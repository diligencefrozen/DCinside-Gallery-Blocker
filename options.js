/* options.js */

/* ───── 상수 ───── */
const builtinBlocked = ["dcbest"]; // 기본 차단

const recommendedIds = [
  "4year_university","alliescon","asdf12","canada","centristconservatis",
  "colonialism","disease","divination_new1","ehxoeh","employment",
  "escapekorea","escapekoreagall","foreversolo","immovables","iphone",
  "jpjobngm","leejaemyung","m_entertainer_new1","minjudang","neostock",
  "newtheory","nobirthgall","singlebungle1472","smartphone",
  "thesingularity","w_entertainer","loveconsultation"
].map(s => s.toLowerCase());

/* 메인 페이지 추천 숨김 */
const recSelectors = [
  "div#dna_content.content.news_con",
  "div.content.concept_con",
  "div.content_box.dcmedia",
  "div.content_box.new_gall",
  "div.time_best",
  "div.trend.vote",
];

/* 갤러리 페이지 추천 숨김 */
const recGallSelectors = [
  "div.ad_bottom_list[style]",
  "div.content_box.r_recommend[data-rand]",
  "div.content_box.r_timebest"
];

/* 검색(combine) 페이지 추천 숨김 */
const recSearchSelectors = [
  "div.content_box.r_only_daum",
  "div.content_box.r_recommend",
  "div.content_box.r_timebest",
  "div.integrate_cont.news_result",
  "section.left_content"
];

/* 백업 범위 및 기본값 */
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
/* 갤러리 ID */
const newIdInput = document.getElementById("newId");
const addBtn     = document.getElementById("addBtn");
const listEl     = document.getElementById("list");
const recList    = document.getElementById("recList");
const addAllRec  = document.getElementById("addAllRec");
/* 메인 셀렉터 */
const newSel     = document.getElementById("newSel");
const addSelBtn  = document.getElementById("addSelBtn");
const addRecSel  = document.getElementById("addRecSel");
const selList    = document.getElementById("selList");
/* 갤러리 셀렉터 */
const newGallSel     = document.getElementById("newGallSel");
const addGallSelBtn  = document.getElementById("addGallSelBtn");
const addRecGallSel  = document.getElementById("addRecGallSel");
const gallSelList    = document.getElementById("gallSelList");
/* 검색 셀렉터 */
const newSearchSel     = document.getElementById("newSearchSel");
const addSearchSelBtn  = document.getElementById("addSearchSelBtn");
const addRecSearchSel  = document.getElementById("addRecSearchSel");
const searchSelList    = document.getElementById("searchSelList");
/* 사용자 차단(UID) */
const userBlockEl = document.getElementById("userBlockEnabled");
const uidInput    = document.getElementById("uidInput");
const addUidBtn   = document.getElementById("addUidBtn");
const uidListEl   = document.getElementById("uidList");
const previewEnabledEl = document.getElementById("previewEnabled");
/* 댓글 숨기기 */
const hideCommentEl    = document.getElementById("hideComment");
const hideImgCommentEl = document.getElementById("hideImgComment");
const hideDcconEl      = document.getElementById("hideDccon");
/* 비회원 게시물 숨기기 */
const hideAnonymousEl  = document.getElementById("hideAnonymousEnabled");
/* 백업/복원 */
const exportBtn    = document.getElementById("exportBtn");
const importBtn    = document.getElementById("importBtn");
const importFileEl = document.getElementById("importFile");

/* ───── 공통 유틸 ───── */
const norm = s => s.trim().toLowerCase();
const sanitizeUid = s => String(s || "").trim().replace(/\s+/g, "");

function sanitizeImport(raw){
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

function exportSettings(){
  chrome.storage.sync.get(BACKUP_DEFAULTS, snapshot => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: snapshot
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const ts   = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `dcb-settings-${ts}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  });
}

function importSettingsFromFile(file){
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const patch  = sanitizeImport(parsed);
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
function renderUser(ids){
  listEl.innerHTML = "";
  const vis = ids.filter(id => !builtinBlocked.includes(id));
  if (!vis.length){
    listEl.innerHTML = '<p class="note">아직 추가된 갤러리가 없습니다.</p>'; return;
  }
  vis.sort().forEach(id=>{
    const li = document.createElement("li");
    li.innerHTML = `<span>${id}</span>`;
    const del = document.createElement("button"); del.textContent = "삭제";
    del.onclick = () =>
      chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) =>
        updateBlocked(blockedIds.filter(x => norm(x) !== id)));
    li.appendChild(del); listEl.appendChild(li);
  });
}

/* ───── 추천 차단 렌더 ───── */
function renderRec(blocked){
  recList.innerHTML = "";
  recommendedIds.forEach(id=>{
    const li  = document.createElement("li");
    const btn = document.createElement("button");
    const already = blocked.includes(id);
    btn.textContent = already ? "✓ 추가됨" : "추가";
    btn.disabled = already; btn.className = already ? "added" : "";
    if (!already) btn.onclick = () => updateBlocked([...blocked, id]);
    li.textContent = id + " ";
    li.appendChild(btn); recList.appendChild(li);
  });
}

/* ───── 셀렉터 렌더 (공용) ───── */
function renderSel(arr, targetUl, key){
  targetUl.innerHTML = "";
  if (!arr.length){
    targetUl.innerHTML = '<p class="note">숨길 영역이 없습니다.</p>'; return;
  }
  arr.forEach(sel=>{
    const li = document.createElement("li");
    li.innerHTML = `<span>${sel}</span>`;
    const del = document.createElement("button"); del.textContent = "삭제";
    del.onclick = () =>
      chrome.storage.sync.get({ [key]: [] }, store =>
        updateSel(store[key].filter(s => s !== sel), key, targetUl));
    li.appendChild(del); targetUl.appendChild(li);
  });
}

/* ───── 저장 함수 ───── */
function updateBlocked(next){
  const uniq = [...new Set(next.map(norm))];
  chrome.storage.sync.set({ blockedIds: uniq }, () => {
    renderUser(uniq); renderRec(uniq);
  });
}
function updateSel(list, key, targetUl){
  const uniq = [...new Set(list.map(s => s.trim()).filter(Boolean))];
  chrome.storage.sync.set({ [key]: uniq }, () => renderSel(uniq, targetUl, key));
}

/* ───── 사용자 차단(UID) 렌더/저장 ───── */
function lockUserBlockUI(disabled){
  if (!uidInput || !addUidBtn) return;
  uidInput.disabled = addUidBtn.disabled = !!disabled;
  const op = disabled ? 0.5 : 1;
  uidInput.style.opacity = addUidBtn.style.opacity = op;
}

function renderUidList(uids){
  uidListEl.innerHTML = "";
  if (!uids || !uids.length){
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

function saveUidList(mutator){
  chrome.storage.sync.get({ blockedUids: [] }, ({ blockedUids }) => {
    const list = Array.isArray(blockedUids) ? blockedUids.slice() : [];
    mutator(list);
    const uniq = Array.from(new Set(list.map(sanitizeUid).filter(Boolean)));
    chrome.storage.sync.set({ blockedUids: uniq }, () => renderUidList(uniq));
  });
}

/* ───── 이벤트 ───── */
/* 백업/복원 */
if (exportBtn) exportBtn.onclick = () => exportSettings();
if (importBtn && importFileEl) {
  importBtn.onclick = () => importFileEl.click();
  importFileEl.onchange = () => {
    const [file] = importFileEl.files || [];
    importSettingsFromFile(file);
    importFileEl.value = "";
  };
}

/* 갤러리 ID */
addBtn.onclick = () => {
  const id = norm(newIdInput.value); if (!id || builtinBlocked.includes(id)) return;
  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
    if (!blockedIds.map(norm).includes(id)) updateBlocked([...blockedIds, id]);
    newIdInput.value = "";
  });
};
newIdInput.addEventListener("keyup", e => { if (e.key === "Enter") addBtn.onclick(); });
addAllRec.onclick = () =>
  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) =>
    updateBlocked([...new Set([...blockedIds, ...recommendedIds])]));

/* 메인 셀렉터 */
addSelBtn.onclick = () => {
  const sel = newSel.value.trim(); if (!sel) return;
  chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) => {
    if (!removeSelectors.includes(sel))
      updateSel([...removeSelectors, sel], "removeSelectors", selList);
    newSel.value = "";
  });
};
newSel.addEventListener("keyup", e => { if (e.key === "Enter") addSelBtn.onclick(); });
addRecSel.onclick = () =>
  chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) =>
    updateSel([...new Set([...removeSelectors, ...recSelectors])],
              "removeSelectors", selList));

/* 갤러리 셀렉터 */
addGallSelBtn.onclick = () => {
  const sel = newGallSel.value.trim(); if (!sel) return;
  chrome.storage.sync.get({ removeSelectorsGall: [] }, ({ removeSelectorsGall }) => {
    if (!removeSelectorsGall.includes(sel))
      updateSel([...removeSelectorsGall, sel], "removeSelectorsGall", gallSelList);
    newGallSel.value = "";
  });
};
newGallSel.addEventListener("keyup", e => { if (e.key === "Enter") addGallSelBtn.onclick(); });
addRecGallSel.onclick = () =>
  chrome.storage.sync.get({ removeSelectorsGall: [] }, ({ removeSelectorsGall }) =>
    updateSel([...new Set([...removeSelectorsGall, ...recGallSelectors])],
              "removeSelectorsGall", gallSelList));

/* 검색 셀렉터 */
addSearchSelBtn.onclick = () => {
  const sel = newSearchSel.value.trim(); if (!sel) return;
  chrome.storage.sync.get({ removeSelectorsSearch: [] }, ({ removeSelectorsSearch }) => {
    if (!removeSelectorsSearch.includes(sel))
      updateSel([...removeSelectorsSearch, sel], "removeSelectorsSearch", searchSelList);
    newSearchSel.value = "";
  });
};
newSearchSel.addEventListener("keyup", e => { if (e.key === "Enter") addSearchSelBtn.onclick(); });
addRecSearchSel.onclick = () =>
  chrome.storage.sync.get({ removeSelectorsSearch: [] }, ({ removeSelectorsSearch }) =>
    updateSel([...new Set([...removeSelectorsSearch, ...recSearchSelectors])],
              "removeSelectorsSearch", searchSelList));

/* 사용자 차단 토글 & UID 추가/삭제 */
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
    if (e.key === "Enter") { e.preventDefault(); addUidBtn.click(); }
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

/* 댓글 숨기기 토글 */
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
    const newValue = !!e.target.checked;
    console.log("[DCB] 미리보기 설정 변경:", newValue);
    chrome.storage.sync.set({ previewEnabled: newValue });
  });
}

/* 비회원 게시물 숨기기 토글 */
if (hideAnonymousEl) {
  hideAnonymousEl.addEventListener("change", e => {
    chrome.storage.sync.set({ hideAnonymousEnabled: !!e.target.checked });
  });
}

/* ───── 초기 로드 ───── */
chrome.storage.sync.get(
  {
    blockedIds: [],
    removeSelectors: [],
    removeSelectorsGall: [],
    removeSelectorsSearch: [],
    // 사용자 차단(UID)
    userBlockEnabled: true,
    blockedUids: [],
    // 댓글 숨기기
    hideComment: false,
    hideImgComment: false,   // 이미지 댓글 기본적으로 꺼짐
    hideDccon: false,        // 디시콘 숨기기
    // 페이지 미리보기
    previewEnabled: false,   // 기본값: 비활성화 (BACKUP_DEFAULTS와 일치)
    // 비회원 게시물 숨기기
    hideAnonymousEnabled: false,
    // 구버전 호환 (hideDCGray → userBlockEnabled)
    hideDCGray: undefined
  },
  ({ blockedIds, removeSelectors, removeSelectorsGall, removeSelectorsSearch, userBlockEnabled, blockedUids, hideComment, hideImgComment, hideDccon, previewEnabled, hideAnonymousEnabled, hideDCGray }) => {
    // 마이그레이션
    if (typeof userBlockEnabled !== "boolean" && typeof hideDCGray === "boolean") {
      userBlockEnabled = hideDCGray;
      chrome.storage.sync.set({ userBlockEnabled });
    }

    renderUser(blockedIds.map(norm));
    renderRec(blockedIds.map(norm));
    renderSel(removeSelectors,       selList,       "removeSelectors");
    renderSel(removeSelectorsGall,   gallSelList,   "removeSelectorsGall");
    renderSel(removeSelectorsSearch, searchSelList, "removeSelectorsSearch");

    if (userBlockEl) {
      userBlockEl.checked = !!userBlockEnabled;
      lockUserBlockUI(!userBlockEnabled);
    }
    renderUidList(blockedUids || []);
    
    // 댓글 숨기기 초기값
    if (hideCommentEl) hideCommentEl.checked = !!hideComment;
    if (hideImgCommentEl) hideImgCommentEl.checked = !!hideImgComment;
    if (hideDcconEl) hideDcconEl.checked = !!hideDccon;
    if (previewEnabledEl) {
      previewEnabledEl.checked = !!previewEnabled;
      console.log("[DCB] 초기 미리보기 설정:", !!previewEnabled);
    }
    
    // 비회원 게시물 숨기기 초기값
    if (hideAnonymousEl) hideAnonymousEl.checked = !!hideAnonymousEnabled;
  }
);

/* 다른 탭/팝업 변경 반영 */
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "sync") return;

  if (c.blockedIds) {
    const ids = (c.blockedIds.newValue || []).map(norm);
    renderUser(ids); renderRec(ids);
  }
  if (c.removeSelectors)       renderSel(c.removeSelectors.newValue || [],       selList,       "removeSelectors");
  if (c.removeSelectorsGall)   renderSel(c.removeSelectorsGall.newValue || [],   gallSelList,   "removeSelectorsGall");
  if (c.removeSelectorsSearch) renderSel(c.removeSelectorsSearch.newValue || [], searchSelList, "removeSelectorsSearch");

  if (c.userBlockEnabled && userBlockEl) {
    userBlockEl.checked = !!c.userBlockEnabled.newValue;
    lockUserBlockUI(!c.userBlockEnabled.newValue);
  }
  if (c.blockedUids) renderUidList(c.blockedUids.newValue || []);
  
  // 댓글 숨기기 변경 반영
  if (c.hideComment && hideCommentEl) {
    hideCommentEl.checked = !!c.hideComment.newValue;
  }
  if (c.hideImgComment && hideImgCommentEl) {
    hideImgCommentEl.checked = !!c.hideImgComment.newValue;
  }
  if (c.hideDccon && hideDcconEl) {
    hideDcconEl.checked = !!c.hideDccon.newValue;
  }
  if (c.previewEnabled && previewEnabledEl) {
    previewEnabledEl.checked = !!c.previewEnabled.newValue;
  }

  // 비회원 게시물 숨기기 변경 반영
  if (c.hideAnonymousEnabled && hideAnonymousEl) {
    hideAnonymousEl.checked = !!c.hideAnonymousEnabled.newValue;
  }
});
