/* MV3 service worker ― 아이콘 클릭 시 옵션 페이지 열기 */
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
