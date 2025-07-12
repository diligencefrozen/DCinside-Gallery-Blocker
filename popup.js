const toggle = document.getElementById("toggle");
const openOptions = document.getElementById("openOptions");

/* 현재 상태 불러오기 */
chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
  toggle.checked = enabled;
});

/* 토글 ON/OFF */
toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});

/* 옵션 페이지 열기 */
openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
