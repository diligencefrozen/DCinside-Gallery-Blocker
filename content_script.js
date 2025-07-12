(async () => {
  /** 차단된 갤러리 ID 가져오기 */
  function getGalleryId() {
    try {
      const url = new URL(location.href);
      return url.searchParams.get("id");
    } catch {
      return null;
    }
  }

  const { blockedIds = [] } = await chrome.storage.sync.get("blockedIds");
  const gid = getGalleryId();
  if (!gid || !blockedIds.includes(gid)) return;

  /** 리다이렉트까지 대기 시간 (초 단위) */
  const delaySeconds = 5;
  const redirectUrl = "https://www.dcinside.com";

  document.documentElement.innerHTML = ""; // 깜빡임 방지

  const style = document.createElement("style");
  style.textContent = `
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      background: #111;
      color: #f1f1f1;
      font-family: Inter, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #block-message {
      text-align: center;
      max-width: 500px;
      line-height: 1.6;
    }
    #block-message h1 {
      font-size: 1.8rem;
      margin-bottom: 0.5rem;
      color: #ff4c4c;
    }
    #block-message p {
      font-size: 1rem;
      color: #ccc;
    }
    #block-message code {
      background: #333;
      padding: 0.2em 0.4em;
      border-radius: 4px;
      font-size: 0.9rem;
    }
  `;

  const div = document.createElement("div");
  div.id = "block-message";
  div.innerHTML = `
    <h1>차단된 갤러리입니다</h1>
    <p>이 갤러리(<code>${gid}</code>)는 차단 목록에 포함되어 있습니다.</p>
    <p><strong>${delaySeconds}초 후</strong> 디시인사이드 메인 페이지로 이동합니다...</p>
  `;

  document.head.appendChild(style);
  document.body.appendChild(div);

  setTimeout(() => {
    location.href = redirectUrl;
  }, delaySeconds * 1000);
})();
