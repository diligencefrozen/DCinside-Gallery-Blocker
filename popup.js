/* popup.js */

/* ───────── DOM ───────── */
const toggle         = document.getElementById("toggle");       // ON/OFF
const blockModeSel   = document.getElementById("blockMode");    // 초보,하드모드
const hideCmtToggle  = document.getElementById("hideComment");  // 댓글 숨김
const delayNum       = document.getElementById("delayNum");     // 숫자 입력
const delayRange     = document.getElementById("delayRange");   // 슬라이더
const openOptionsBtn = document.getElementById("openOptions");

// 사용자 차단 + UID 관리 UI
const userBlockEl = document.getElementById("userBlockEnabled") || document.getElementById("hideDCGray");
const uidInput    = document.getElementById("uidInput");
const addUidBtn   = document.getElementById("addUidBtn");
const uidListEl   = document.getElementById("uidList");

/* ───────── util ───────── */
function lockDelay(disabled){
  delayNum.disabled   = disabled;
  delayRange.disabled = disabled;
  const op = disabled ? 0.5 : 1;
  delayNum.style.opacity = delayRange.style.opacity = op;
}

function lockUserBlockUI(disabled){
  if (!uidInput || !addUidBtn) return;
  uidInput.disabled = addUidBtn.disabled = !!disabled;
  const op = disabled ? 0.5 : 1;
  uidInput.style.opacity = addUidBtn.style.opacity = op;
}

const DEFAULTS = {
  enabled: true,
  blockMode: "redirect",    // redirect | block
  hideComment: false,
  delay: 5,
  // ✅ 새 키들
  userBlockEnabled: true,   // 마스터 토글
  blockedUids: [],
  // ⬇ 마이그레이션용(과거 키)
  hideDCGray: undefined
};

function sanitizeUid(s) {
  // 공백 제거, 기본적으로 영숫자/밑줄/하이픈 권장
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
  // 🔁 과거 hideDCGray → userBlockEnabled 로 1회 이행
  if (typeof conf.userBlockEnabled !== "boolean" && typeof conf.hideDCGray === "boolean") {
    conf.userBlockEnabled = conf.hideDCGray;
    chrome.storage.sync.set({ userBlockEnabled: conf.userBlockEnabled });
  }

  const { enabled, blockMode, hideComment, delay, userBlockEnabled, blockedUids } = conf;

  toggle.checked        = enabled;
  blockModeSel.value    = blockMode;
  hideCmtToggle.checked = hideComment;
  delayNum.value        = delay;
  delayRange.value      = delay;
  lockDelay(blockMode === "block");

  if (userBlockEl) {
    userBlockEl.checked = !!userBlockEnabled;
    lockUserBlockUI(!userBlockEnabled); // OFF면 입력/추가 비활성화
  }
  renderUidList(blockedUids);
});

/* ───────── 이벤트 바인딩 ───────── */
/* 전체 ON/OFF */
toggle.onchange = e => chrome.storage.sync.set({ enabled: e.target.checked });

/* 차단 방식 변경 */
blockModeSel.onchange = e => {
  const mode = e.target.value;              // redirect | block
  chrome.storage.sync.set({ blockMode: mode });
  lockDelay(mode === "block");
};

/* 댓글 숨기기 ON/OFF */
hideCmtToggle.onchange = e =>
  chrome.storage.sync.set({ hideComment: e.target.checked });

/* 지연 시간 숫자/슬라이더 ↔ storage */
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

/* 스토리지 외부 변경 반영 */
chrome.storage.onChanged.addListener((c,a)=>{
  if(a!=="sync") return;
  if(c.enabled)      toggle.checked       = c.enabled.newValue;
  if(c.blockMode){
    blockModeSel.value = c.blockMode.newValue;
    lockDelay(c.blockMode.newValue === "block");
  }
  if(c.hideComment)  hideCmtToggle.checked = c.hideComment.newValue;
  if(c.delay){
    delayNum.value   = c.delay.newValue;
    delayRange.value = c.delay.newValue;
  }
  if (c.userBlockEnabled && userBlockEl) {
    userBlockEl.checked = !!c.userBlockEnabled.newValue;
    lockUserBlockUI(!c.userBlockEnabled.newValue);
  }
  if (c.blockedUids)  renderUidList(c.blockedUids.newValue || []);
});

/* 옵션 페이지 열기 */
openOptionsBtn.onclick = () => chrome.runtime.openOptionsPage();
