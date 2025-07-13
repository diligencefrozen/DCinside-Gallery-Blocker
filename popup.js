/* popup.js */

const toggle      = document.getElementById("toggle");
const openOptions = document.getElementById("openOptions");

const delayNum    = document.getElementById("delayNum");   // 숫자 입력
const delayRange  = document.getElementById("delayRange"); // 슬라이더

/* ────────── 초기 상태 로드 ────────── */
chrome.storage.sync.get({ enabled: true, delay: 5 }, ({ enabled, delay }) => {
  toggle.checked  = enabled;
  delayNum.value  = delay;
  delayRange.value = delay;
});

/* ────────── ON / OFF 기능 ────────── */
toggle.addEventListener("change", () =>
  chrome.storage.sync.set({ enabled: toggle.checked })
);

/* ────────── 지연 시간 동기화 함수 ────────── */
function updateDelay(raw) {
  /* 0 ~ 10 초, 0.5 초 단위로 고정 */
  const num = Math.min(10, Math.max(0, parseFloat(raw) || 0));
  delayNum.value   = num;
  delayRange.value = num;
  chrome.storage.sync.set({ delay: num });
}

/* 숫자 입력 ↔ 슬라이더 양방향 바인딩 */
delayNum .addEventListener("input", e => updateDelay(e.target.value));
delayRange.addEventListener("input", e => updateDelay(e.target.value));

/* ────────── 외부 탭에서 설정 변경 시 실시간 반영 ────────── */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.enabled) toggle.checked = changes.enabled.newValue;
  if (changes.delay) {
    const d = changes.delay.newValue;
    delayNum.value = d;
    delayRange.value = d;
  }
});

/* ────────── 옵션 페이지 열기 ────────── */
openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
