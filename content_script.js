// content_script.js
(async () => {
  function getGalleryId() {
    try {
      const u = new URL(location.href);
      return u.searchParams.get("id");
    } catch {
      return null;
    }
  }

  const { blockedIds = [] } = await chrome.storage.sync.get("blockedIds");
  const gid = getGalleryId();
  if (!gid || !blockedIds.includes(gid)) return;

  /* 곧바로 메인으로 보내기 */
  location.replace("https://www.dcinside.com");   // 뒤로 가도 다시 안 들어옴
})();
