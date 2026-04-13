/*****************************************************************
 * link-blocker.js
 *****************************************************************/

(() => {
  const BUILTIN = ["dcbest"];
  const STYLE_ID = "dcb-link-blocker-style";
  const TEMP_ALLOW_KEY = "dcb-temp-allow";
  const HIDDEN_CLASS = "dcb-blocked-hidden";

  const SPECIAL_BLOCK_RULES = {
  dcbest: [
    "#time_best_head_tab",          // 헤더 전체
    ".btn_dcbest_rank_tab",         // 혹시 헤더 밖에 분리되어 있어도 추가 차단
    "[id^='dcbest_list_page_']",    // 페이징 관련
    ".main_tab_real_time_best",     // 실시간 베스트 / 실베라이트 탭
    "a.allview_go[href*='id=dcbest']"
  ]
};

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
        const en = (typeof galleryBlockEnabled === "boolean")
          ? galleryBlockEnabled
          : !!enabled;

        gBlockEnabled = en;
        blockedSet = new Set([
          ...BUILTIN,
          ...blockedIds.map(x => String(x).trim().toLowerCase())
        ]);
        linkWarnEnabled = !!lwarn;
        cb && cb();
      }
    );
  }

  chrome.storage.onChanged.addListener((chg, area) => {
    if (area !== "sync") return;

    if (chg.galleryBlockEnabled) {
      gBlockEnabled = !!chg.galleryBlockEnabled.newValue;
    } else if (chg.enabled) {
      gBlockEnabled = !!chg.enabled.newValue;
    }

    if (chg.blockedIds) {
      blockedSet = new Set([
        ...BUILTIN,
        ...chg.blockedIds.newValue.map(x => String(x).trim().toLowerCase())
      ]);
    }

    if (chg.linkWarnEnabled) {
      linkWarnEnabled = !!chg.linkWarnEnabled.newValue;
    }

    applyLinkWarnings();
  });

  /* ───── 임시 허용 체크 ───── */
  function isTempAllowed(gid) {
    try {
      const allowed = sessionStorage.getItem(TEMP_ALLOW_KEY);
      return allowed && JSON.parse(allowed).includes(gid);
    } catch {
      return false;
    }
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

  /* ───── 숨길 대상 찾기 ───── */
  function getHideTarget(link) {
    if (!link || !(link instanceof Element)) return null;

    return (
      link.closest(
        [
          "li",
          "tr",
          ".visit_bookmark li",
          ".rank_list li",
          ".rank_txt li",
          ".gall_issuebox li",
          ".hotlive_list li",
          ".content_box",
          ".txt_box",
          ".thumb_txt",
          ".issue_content",
          ".box"
        ].join(",")
      ) || link
    );
  }

  /* ───── 스타일 주입 ───── */
  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .${HIDDEN_CLASS}{
          display:none !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
    return style;
  }

  /* ───── 이전 숨김 초기화 ───── */
  function resetHiddenState() {
    document.querySelectorAll(`.${HIDDEN_CLASS}[data-dcb-hidden="1"]`).forEach(el => {
      el.classList.remove(HIDDEN_CLASS);
      el.removeAttribute("data-dcb-hidden");
      el.removeAttribute("data-dcb-hidden-gid");
    });

    document.querySelectorAll('a[data-dcb-link-hidden="1"]').forEach(link => {
      link.removeAttribute("data-dcb-link-hidden");
      link.classList.remove("dcb-blocked-link", "dcb-blocked-link-clickable");
      link.style.pointerEvents = "";
      link.onclick = null;
    });
  }

  /* ───── 링크 스캔 & 숨김 ───── */
  function applyLinkWarnings() {
    ensureStyle();
    resetHiddenState();

    if (!gBlockEnabled || !linkWarnEnabled) {
      return;
    }

    // 갤러리 링크 선택 (gall.dcinside.com 링크)
    const links = document.querySelectorAll('a[href*="gall.dcinside.com"]');

    links.forEach(link => {
      const gid = extractGalleryId(link.href);
      if (!gid) return;

      const isBlocked = blockedSet.has(gid);
      const isTempOk = isTempAllowed(gid);
      
      if (!(isBlocked && !isTempOk)) return;

      const hideTarget = getHideTarget(link);
      if (hideTarget) {
        hideNode(hideTarget, gid);
      }
      
      link.setAttribute("data-dcb-link-hidden", "1");
      link.classList.remove("dcb-blocked-link", "dcb-blocked-link-clickable");
      link.style.pointerEvents = "none";
      link.onclick = null;
    });

    // 링크 외 부속 UI 차단
    applySpecialBlocks();
  }

  function hideNode(el, gid) {
    if (!el || !(el instanceof Element)) return;
    
    el.classList.add(HIDDEN_CLASS);
    el.setAttribute("data-dcb-hidden", "1");
    el.setAttribute("data-dcb-hidden-gid", gid);
  }
  
  function applySpecialBlocks() {
    for (const gid of blockedSet) {
      if (isTempAllowed(gid)) continue;
      
      const selectors = SPECIAL_BLOCK_RULES[gid];
      if (!selectors) continue;
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          hideNode(el, gid);
        });
      });
    }
  }

  /* ───── 동적 콘텐츠 대응 ───── */
  const observer = new MutationObserver(() => applyLinkWarnings());

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          observer.observe(document.body, { childList: true, subtree: true });
        },
        { once: true }
      );
    }
  }

  /* ───── 초기 실행 ───── */
  syncSettings(() => {
    applyLinkWarnings();
    startObserver();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLinkWarnings, { once: true });
  } else {
    applyLinkWarnings();
  }
})();
