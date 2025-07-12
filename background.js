chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (cfg) => {
    // 이미 값이 있으면 건드리지 않음
    if (cfg.initialized) return;

    chrome.storage.sync.set({
      enabled: true,
      delay: 5, // 초
      blocked: [
        /* 여기에 차단할 갤러리 id를 문자열로 추가 */
        "examplegallery1",
        "examplegallery2"
      ],
      initialized: true
    });
  });
});
