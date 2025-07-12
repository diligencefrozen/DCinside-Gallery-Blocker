(async () => {
  /** 현재 탭 URL 파싱 → 갤러리 id 추출 */
  function extractGalleryId(url) {
    try {
      const u = new URL(url);
      return u.hostname === "gall.dcinside.com" ? u.searchParams.get("id") : null;
    } catch {
      return null;
    }
  }

  /** DOM 참조 */
  const titleEl = document.getElementById("title");
  const btnEl   = document.getElementById("toggleBtn");
  const linkEl  = document.getElementById("openOptions");

  /* 현재 탭 가져오기 */
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const gid = extractGalleryId(tab.url || "");

  /* 옵션 페이지 열기 링크 */
  linkEl.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  /* 차단 목록 로드 */
  const store = await chrome.storage.sync.get("blockedIds");
  const blockedIds = store.blockedIds || [];

  /* 현재 페이지가 갤러리일 때만 토글 활성화 */
  if (gid) {
    titleEl.textContent = `갤러리 ID: ${gid}`;

    const isBlocked = blockedIds.includes(gid);
    setBtnState(isBlocked);
    btnEl.disabled = false;

    btnEl.addEventListener("click", async () => {
      const idx = blockedIds.indexOf(gid);
      if (idx === -1) {
        blockedIds.push(gid);
      } else {
        blockedIds.splice(idx, 1);
      }
      await chrome.storage.sync.set({ blockedIds });
      chrome.runtime.sendMessage({ type: "blockedIdsChanged", data: blockedIds });
      setBtnState(idx === -1); 
    });

  } else {
    titleEl.textContent = "갤러리 페이지가 아님";
    btnEl.style.display = "none";
  }

  function setBtnState(blocked) {
    if (blocked) {
      btnEl.textContent = "✅ 차단 해제";
      btnEl.classList.add("remove");
    } else {
      btnEl.textContent = "🚫 차단 추가";
      btnEl.classList.remove("remove");
    }
  }
})();
