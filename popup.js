/* popup.js */

/* ───────── DOM ───────── */
const toggle         = document.getElementById("toggle");       // ON/OFF
const blockModeSel   = document.getElementById("blockMode");    // 초보,하드모드
const hideCmtToggle  = document.getElementById("hideComment");  // 댓글 숨김
const delayNum       = document.getElementById("delayNum");     // 숫자 입력
const delayRange     = document.getElementById("delayRange");   // 슬라이더
const openOptionsBtn = document.getElementById("openOptions");

// NEW: 시스템 회색(.block-disable) 숨김 + UID 차단 UI
const hideDCGrayEl = document.getElementById("hideDCGray");
const uidInput     = document.getElementById("uidInput");
const addUidBtn    = document.getElementById("addUidBtn");
const uidListEl    = document.getElementById("uidList");

/* ───────── util ───────── */
function lockDelay(disabled){
  delayNum.disabled   = disabled;
  delayRange.disabled = disabled;
  const op = disabled ? 0.5 : 1;
  delayNum.style.opacity = delayRange.style.opacity = op;
}

const DEFAULTS = {
  enabled: true,
  blockMode: "redirect",    // redirect | block
  hideComment: false,
  delay: 5,
  // NEW
  hideDCGray: true,
  blockedUids: []
};

function sanitizeUid(s) {
  // 양끝 공백 제거 + 공백 제거, 기본적으로 영숫자/밑줄/하이픈만 권장
  return String(s || "").trim().replace(/\s+/g, "");
}

function renderUidList(list) {
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
  const { enabled, blockMode, hideComment, delay, hideDCGray, blockedUids } = conf;

  toggle.checked        = enabled;
  blockModeSel.value    = blockMode;
  hideCmtToggle.checked = hideComment;
  delayNum.value        = delay;
  delayRange.value      = delay;
  lockDelay(blockMode === "block");

  // NEW
  if (hideDCGrayEl) hideDCGrayEl.checked = !!hideDCGray;
  if (uidListEl)    renderUidList(blockedUids);
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

/* NEW: 회색(.block-disable) 숨김 토글 */
if (hideDCGrayEl) {
  hideDCGrayEl.onchange = e =>
    chrome.storage.sync.set({ hideDCGray: !!e.target.checked });
}

/* NEW: UID 추가 */
if (addUidBtn && uidInput) {
  addUidBtn.onclick = () => {
    const v = sanitizeUid(uidInput.value);
    if (!v) return;
    saveUidList(list => list.push(v));
    uidInput.value = "";
    uidInput.focus();
  };
  // Enter로 추가
  uidInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUidBtn.click();
    }
  });
}

/* NEW: UID 삭제 (이벤트 위임) */
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
  // NEW
  if (c.hideDCGray && hideDCGrayEl) hideDCGrayEl.checked = !!c.hideDCGray.newValue;
  if (c.blockedUids && uidListEl)  renderUidList(c.blockedUids.newValue || []);
});

/* 옵션 페이지 열기 */
openOptionsBtn.onclick = () => chrome.runtime.openOptionsPage();
