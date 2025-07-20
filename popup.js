/* popup.js
*/

/* ───────── DOM ───────── */
const toggle       = document.getElementById("toggle");     // 전체 ON/OFF
const blockModeSel = document.getElementById("blockMode");  // 리다이렉트,완전차단
const delayNum     = document.getElementById("delayNum");   // 숫자 입력
const delayRange   = document.getElementById("delayRange"); // 슬라이더
const openOptions  = document.getElementById("openOptions");

/* ───────── util ───────── */
function lockDelay(disabled){
  delayNum.disabled   = disabled;
  delayRange.disabled = disabled;
  delayNum.style.opacity   = disabled ? .5 : 1;
  delayRange.style.opacity = disabled ? .5 : 1;
}

/* ───────── 초기 로드 ───────── */
chrome.storage.sync.get(
  { enabled:true, blockMode:"redirect", delay:5 },
  ({ enabled, blockMode, delay })=>{
    toggle.checked       = enabled;
    blockModeSel.value   = blockMode;
    delayNum.value       = delay;
    delayRange.value     = delay;
    lockDelay(blockMode === "block");
  }
);

/* ───────── ON/OFF ───────── */
toggle.onchange = e =>
  chrome.storage.sync.set({ enabled: e.target.checked });

/* ───────── blockMode 변경 ───────── */
blockModeSel.onchange = e=>{
  const mode = e.target.value;                     // "redirect" | "block"
  chrome.storage.sync.set({ blockMode: mode });
  lockDelay(mode === "block");
};

/* ───────── 지연 시간 동기화 ───────── */
function updateDelay(val){
  const num = Math.max(0, Math.min(10, parseFloat(val)||0));
  delayNum.value   = num;
  delayRange.value = num;
  chrome.storage.sync.set({ delay: num });
}
delayNum  .oninput = e => updateDelay(e.target.value);
delayRange.oninput = e => updateDelay(e.target.value);

/* ───────── 외부 변경 실시간 반영 ───────── */
chrome.storage.onChanged.addListener((c,a)=>{
  if(a!=="sync") return;
  if(c.enabled)     toggle.checked   = c.enabled.newValue;
  if(c.blockMode){
    blockModeSel.value = c.blockMode.newValue;
    lockDelay(c.blockMode.newValue === "block");
  }
  if(c.delay){
    delayNum.value   = c.delay.newValue;
    delayRange.value = c.delay.newValue;
  }
});

/* ───────── 옵션 페이지 열기 ───────── */
openOptions.onclick = () => chrome.runtime.openOptionsPage();
