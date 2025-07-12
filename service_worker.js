const DEFAULT_BLOCKED = ["dcbest"];

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await chrome.storage.sync.set({ blockedIds: DEFAULT_BLOCKED });
    console.log("[DGB] 기본 차단 목록 초기화:", DEFAULT_BLOCKED);
  }
});

// 옵션 페이지 → “blockedIdsChanged” 메시지 처리
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "blockedIdsChanged" && Array.isArray(msg.data)) {
    chrome.storage.sync.set({ blockedIds: msg.data }).then(() =>
      sendResponse({ ok: true })
    );
    // keep the message channel open
    return true;
  }
});
