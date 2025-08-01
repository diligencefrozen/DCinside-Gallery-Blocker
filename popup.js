/* popup.js */

/* ───────── DOM ───────── */
const toggle         = document.getElementById("toggle");       // ON/OFF
const blockModeSel   = document.getElementById("blockMode");    // 초보,하드모드
const hideCmtToggle  = document.getElementById("hideComment");  // 댓글 숨김
const delayNum       = document.getElementById("delayNum");     // 숫자 입력
const delayRange     = document.getElementById("delayRange");   // 슬라이더
const openOptionsBtn = document.getElementById("openOptions");

/* ───────── util ───────── */
function lockDelay(disabled){
  delayNum.disabled   = disabled;
  delayRange.disabled = disabled;
  const op = disabled ? 0.5 : 1;
  delayNum.style.opacity = delayRange.style.opacity = op;
}

/* ───────── 초기 로드 ───────── */
chrome.storage.sync.get(
  { enabled:true, blockMode:"redirect", hideComment:false, delay:5 },
  ({ enabled, blockMode, hideComment, delay })=>{
    toggle.checked      = enabled;
    blockModeSel.value  = blockMode;
    hideCmtToggle.checked = hideComment;
    delayNum.value      = delay;
    delayRange.value    = delay;
    lockDelay(blockMode === "block");
  }
);

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
});

/* 옵션 페이지 열기 */
openOptionsBtn.onclick = () => chrome.runtime.openOptionsPage();
