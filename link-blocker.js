/*****************************************************************
 * link-blocker.js  
 *****************************************************************/

(() => {
  const BUILTIN = ["dcbest"];
  const STYLE_ID = "dcb-link-blocker-style";
  const TEMP_ALLOW_KEY = "dcb-temp-allow";

  let gBlockEnabled = true;
  let blockedSet = new Set(BUILTIN);
  let linkWarnEnabled = true; // 링크 경고 기능 ON/OFF

  /* ───── 설정 동기화 ───── */
  function syncSettings(cb) {
    chrome.storage.sync.get(
      {
        galleryBlockEnabled: undefined,
        enabled: true,
        blockedIds: [],
        linkWarnEnabled: true
      },
      ({ galleryBlockEnabled, enabled, blockedIds, linkWarnEnabled: lwarn }) => {
        const en = (typeof galleryBlockEnabled === "boolean") ? galleryBlockEnabled : !!enabled;
        gBlockEnabled = en;
        blockedSet = new Set([...BUILTIN, ...blockedIds.map(x => String(x).trim().toLowerCase())]);
        linkWarnEnabled = !!lwarn;
        cb && cb();
      }
    );
  }

  chrome.storage.onChanged.addListener((chg, area) => {
    if (area !== "sync") return;
    if (chg.galleryBlockEnabled) gBlockEnabled = !!chg.galleryBlockEnabled.newValue;
    else if (chg.enabled) gBlockEnabled = !!chg.enabled.newValue;
    if (chg.blockedIds) blockedSet = new Set([...BUILTIN, ...chg.blockedIds.newValue.map(x => String(x).trim().toLowerCase())]);
    if (chg.linkWarnEnabled) linkWarnEnabled = !!chg.linkWarnEnabled.newValue;
    applyLinkWarnings();
  });

  /* ───── 임시 허용 체크 ───── */
  function isTempAllowed(gid) {
    try {
      const allowed = sessionStorage.getItem(TEMP_ALLOW_KEY);
      return allowed && JSON.parse(allowed).includes(gid);
    } catch { return false; }
  }

  /* ───── 갤러리 ID 추출 (링크 href에서) ───── */
  function extractGalleryId(url) {
    try {
      const u = new URL(url, location.href);
      // ?id=xxx
      const qsId = u.searchParams.get("id");
      if (qsId) return qsId.trim().toLowerCase();
      // /mgallery/foo 또는 /mini/bar
      const m = u.pathname.match(/\/(?:mgallery|mini)\/([^\/?#]+)/);
      return m ? m[1].trim().toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /* ───── 스타일 주입 ───── */
  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        /* 차단된 링크 시각적 표시 */
        a.dcb-blocked-link {
          position: relative;
          opacity: 0.5;
          filter: grayscale(80%);
          pointer-events: none; /* 클릭 방지 */
        }
        a.dcb-blocked-link::before {
          content: "🚫";
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 32px;
          z-index: 10;
          text-shadow: 0 0 8px rgba(0,0,0,0.8);
          pointer-events: none;
        }
        a.dcb-blocked-link::after {
          content: "차단됨";
          position: absolute;
          top: 4px;
          left: 4px;
          background: rgba(224,49,49,0.95);
          color: #fff;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          z-index: 11;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          pointer-events: none;
        }
        /* 클릭 가능하도록 오버레이 추가 (설명용) */
        a.dcb-blocked-link-clickable {
          position: relative;
          opacity: 0.6;
          filter: grayscale(60%);
          outline: 2px dashed rgba(224,49,49,0.6);
          outline-offset: -2px;
        }
        a.dcb-blocked-link-clickable::after {
          content: "⚠️ 차단됨";
          position: absolute;
          top: 4px;
          left: 4px;
          background: rgba(224,49,49,0.95);
          color: #fff;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          z-index: 11;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          pointer-events: none;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
    return style;
  }

  /* ───── 링크 스캔 & 마킹 ───── */
  function applyLinkWarnings() {
    if (!gBlockEnabled || !linkWarnEnabled) {
      // 비활성화 시 모든 마킹 제거
      document.querySelectorAll("a.dcb-blocked-link, a.dcb-blocked-link-clickable").forEach(a => {
        a.classList.remove("dcb-blocked-link", "dcb-blocked-link-clickable");
        a.style.pointerEvents = "";
        a.onclick = null;
      });
      return;
    }

    ensureStyle();

    // 갤러리 링크 선택 (gall.dcinside.com 링크)
    const links = document.querySelectorAll('a[href*="gall.dcinside.com"]');
    
    links.forEach(link => {
      const gid = extractGalleryId(link.href);
      if (!gid) return;

      const isBlocked = blockedSet.has(gid);
      const isTempOk = isTempAllowed(gid);

      // 이미 처리된 링크는 스킵 (성능)
      if (isBlocked && !isTempOk) {
        if (link.classList.contains("dcb-blocked-link-clickable")) return;
        
        link.classList.add("dcb-blocked-link-clickable");
        link.style.pointerEvents = "auto"; // 클릭 가능하게
        
        // 클릭 시 경고 다이얼로그
        link.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const msg = `⚠️ 차단된 갤러리\n\n"${gid}" 갤러리는 차단 목록에 있습니다.\n\n그래도 방문하시겠습니까?`;
          if (confirm(msg)) {
            // 사용자가 확인하면 이동
            location.href = link.href;
          }
          return false;
        };
      } else {
        // 차단 해제되었거나 임시 허용된 경우
        link.classList.remove("dcb-blocked-link", "dcb-blocked-link-clickable");
        link.style.pointerEvents = "";
        link.onclick = null;
      }
    });
  }

  /* ───── 동적 콘텐츠 대응 ───── */
  const observer = new MutationObserver(() => applyLinkWarnings());
  
  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, { childList: true, subtree: true });
      }, { once: true });
    }
  }

  /* ───── 초기 실행 ───── */
  syncSettings(() => {
    applyLinkWarnings();
    startObserver();
  });

  // 페이지 로드 완료 후에도 한 번 더 실행
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLinkWarnings, { once: true });
  } else {
    applyLinkWarnings();
  }
})();
