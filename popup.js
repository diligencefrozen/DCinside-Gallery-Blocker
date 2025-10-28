/* popup.js */

/* ───────── DOM ───────── */
const toggle         = document.getElementById("toggle");       // 갤러리 차단 ON/OFF 
const blockModeSel   = document.getElementById("blockMode");    // 스마트, 초보(redirect), 하드(block)
const blockModeHint  = document.getElementById("blockModeHint");// 모드 설명
const hideCmtToggle  = document.getElementById("hideComment");  // 일반 댓글 숨김
const hideImgCmtToggle = document.getElementById("hideImgComment"); // 이미지 댓글 숨김
const hideDcconToggle = document.getElementById("hideDccon");   // 디시콘 숨김
const delayNum       = document.getElementById("delayNum");     // 숫자 입력
const delayRange     = document.getElementById("delayRange");   
const openOptionsBtn = document.getElementById("openOptions");

// 사용자 차단 + UID 관리 UI
const userBlockEl = document.getElementById("userBlockEnabled") || document.getElementById("hideDCGray");
const uidInput    = document.getElementById("uidInput");
const addUidBtn   = document.getElementById("addUidBtn");
const uidListEl   = document.getElementById("uidList");

// 페이지 숨김 
const toggleHideMain   = document.getElementById("toggleHideMain");
const toggleHideGall   = document.getElementById("toggleHideGall");
const toggleHideSearch = document.getElementById("toggleHideSearch");

// 닉네임 옆 회원 ID 표시
const toggleUidBadge   = document.getElementById("toggleUidBadge");

/* ───────── util ───────── */
function lockDelay(disabled){
  delayNum.disabled   = disabled;
  delayRange.disabled = disabled;
  const op = disabled ? 0.5 : 1;
  delayNum.style.opacity = delayRange.style.opacity = op;
}

function updateBlockModeHint(mode){
  if(!blockModeHint) return;
  const hints = {
    smart: "✨ 경고 화면 표시 후 선택 가능 (추천)",
    redirect: "⏱️ 카운트다운 후 자동 리다이렉트",
    block: "🚫 완전 차단 (네트워크 레벨)"
  };
  blockModeHint.textContent = hints[mode] || "";
}

function lockUserBlockUI(disabled){
  if (!uidInput || !addUidBtn) return;
  uidInput.disabled = addUidBtn.disabled = !!disabled;
  const op = disabled ? 0.5 : 1;
  uidInput.style.opacity = addUidBtn.style.opacity = op;
}

const DEFAULTS = {
  // 갤러리 차단(차단 규칙/DNR, 리다이렉트 오버레이)만 제어하는 마스터 키
  enabled: true,

  blockMode: "smart",       // 기본 스마트 모드
  hideComment: false,
  hideImgComment: true,     // 이미지 댓글 기본 숨김
  hideDccon: false,         // 디시콘 숨기기
  delay: 5,

  // 사용자 차단
  userBlockEnabled: true,   // 마스터 토글
  blockedUids: [],
  // 마이그레이션용(과거 키)
  hideDCGray: undefined,

  // 페이지 숨김 마스터
  hideMainEnabled:   true,
  hideGallEnabled:   true,
  hideSearchEnabled: true,

  // ★ 닉네임 옆 회원 ID 표시
  showUidBadge: true,

  // 링크 경고 표시
  linkWarnEnabled: true
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

/* ───────── 초기 로드 ───────── */
chrome.storage.sync.get(DEFAULTS, (conf)=>{
  // 과거 hideDCGray → userBlockEnabled 로 1회 이행
  if (typeof conf.userBlockEnabled !== "boolean" && typeof conf.hideDCGray === "boolean") {
    conf.userBlockEnabled = conf.hideDCGray;
    chrome.storage.sync.set({ userBlockEnabled: conf.userBlockEnabled });
  }

  const {
    enabled, blockMode, hideComment, hideImgComment, hideDccon, delay,
    userBlockEnabled, blockedUids,
    hideMainEnabled, hideGallEnabled, hideSearchEnabled,
    showUidBadge
  } = conf;

  // 기본 토글/입력값
  toggle.checked        = enabled;
  blockModeSel.value    = blockMode;
  updateBlockModeHint(blockMode);
  hideCmtToggle.checked = hideComment;
  hideImgCmtToggle.checked = hideImgComment;
  hideDcconToggle.checked = hideDccon;
  delayNum.value        = delay;
  delayRange.value      = delay;
  lockDelay(blockMode === "block");

  // 사용자 차단
  if (userBlockEl) {
    userBlockEl.checked = !!userBlockEnabled;
    lockUserBlockUI(!userBlockEnabled); // OFF면 입력/추가 비활성화
  }
  renderUidList(blockedUids);

  // 페이지 숨김 마스터
  if (toggleHideMain)   toggleHideMain.checked   = !!hideMainEnabled;
  if (toggleHideGall)   toggleHideGall.checked   = !!hideGallEnabled;
  if (toggleHideSearch) toggleHideSearch.checked = !!hideSearchEnabled;

  // 닉네임 옆 회원 ID 표시
  if (toggleUidBadge)   toggleUidBadge.checked   = !!showUidBadge;
});

/* ───────── 이벤트 바인딩 ───────── */
/* 갤러리 차단 ON/OFF (다른 기능엔 영향 없음) */
toggle.onchange = (e) => {
  chrome.storage.sync.set({ enabled: !!e.target.checked });
};

/* 차단 방식 변경 */
blockModeSel.onchange = e => {
  const mode = e.target.value;              // smart | redirect | block
  chrome.storage.sync.set({ blockMode: mode });
  updateBlockModeHint(mode);
  lockDelay(mode === "block");
};

/* 댓글 숨기기 ON/OFF */
hideCmtToggle.onchange = e =>
  chrome.storage.sync.set({ hideComment: e.target.checked });

/* 이미지 댓글 숨기기 ON/OFF */
hideImgCmtToggle.onchange = e =>
  chrome.storage.sync.set({ hideImgComment: e.target.checked });

/* 디시콘 숨기기 ON/OFF */
hideDcconToggle.onchange = e =>
  chrome.storage.sync.set({ hideDccon: e.target.checked });

/* 지연 시간 숫자 ↔ storage */
function updateDelay(v){
  const num = Math.max(0, Math.min(10, parseFloat(v)||0));
  delayNum.value = delayRange.value = num;
  chrome.storage.sync.set({ delay: num });
}
delayNum.oninput   = e => updateDelay(e.target.value);
delayRange.oninput = e => updateDelay(e.target.value);

/* 사용자 차단  */
if (userBlockEl) {
  userBlockEl.onchange = e => {
    const on = !!e.target.checked;
    lockUserBlockUI(!on);
    chrome.storage.sync.set({ userBlockEnabled: on });
  };
}

/* UID 추가 */
if (addUidBtn && uidInput) {
  addUidBtn.onclick = () => {
    const v = sanitizeUid(uidInput.value);
    if (!v) return;
    saveUidList(list => list.push(v));
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

/* UID 삭제 (이벤트 위임) */
if (uidListEl) {
  uidListEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-idx]");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    saveUidList(list => { list.splice(idx, 1); });
  });
}

/* 페이지 숨김 마스터 저장 */
if (toggleHideMain)   toggleHideMain.onchange   = e => chrome.storage.sync.set({ hideMainEnabled:   !!e.target.checked });
if (toggleHideGall)   toggleHideGall.onchange   = e => chrome.storage.sync.set({ hideGallEnabled:   !!e.target.checked });
if (toggleHideSearch) toggleHideSearch.onchange = e => chrome.storage.sync.set({ hideSearchEnabled: !!e.target.checked });

/* 닉네임 옆 회원 ID 표시 저장 */
if (toggleUidBadge)   toggleUidBadge.onchange   = e => chrome.storage.sync.set({ showUidBadge: !!e.target.checked });

/* 스토리지 외부 변경 반영 */
chrome.storage.onChanged.addListener((c,a)=>{
  if(a!=="sync") return;
  if(c.enabled)      toggle.checked       = c.enabled.newValue;
  if(c.blockMode){
    blockModeSel.value = c.blockMode.newValue;
    updateBlockModeHint(c.blockMode.newValue);
    lockDelay(c.blockMode.newValue === "block");
  }
  if(c.hideComment)  hideCmtToggle.checked = c.hideComment.newValue;
  if(c.hideImgComment) hideImgCmtToggle.checked = c.hideImgComment.newValue;
  if(c.hideDccon) hideDcconToggle.checked = c.hideDccon.newValue;
  if(c.delay){
    delayNum.value   = c.delay.newValue;
    delayRange.value = c.delay.newValue;
  }
  if (c.userBlockEnabled && userBlockEl) {
    userBlockEl.checked = !!c.userBlockEnabled.newValue;
    lockUserBlockUI(!c.userBlockEnabled.newValue);
  }
  if (c.blockedUids)  renderUidList(c.blockedUids.newValue || []);

  // 외부 변경 반영 (페이지 숨김)
  if (c.hideMainEnabled   && toggleHideMain)   toggleHideMain.checked   = !!c.hideMainEnabled.newValue;
  if (c.hideGallEnabled   && toggleHideGall)   toggleHideGall.checked   = !!c.hideGallEnabled.newValue;
  if (c.hideSearchEnabled && toggleHideSearch) toggleHideSearch.checked = !!c.hideSearchEnabled.newValue;

  // 닉네임 옆 회원 ID 표시
  if (c.showUidBadge && toggleUidBadge)        toggleUidBadge.checked   = !!c.showUidBadge.newValue;
});

/* 옵션 페이지 열기 */
openOptionsBtn.onclick = () => chrome.runtime.openOptionsPage();
