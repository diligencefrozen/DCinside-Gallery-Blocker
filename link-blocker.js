/*****************************************************************
 * link-blocker.js
 *
 * 역할:
 * - 현재 페이지 안에 노출된 차단 갤러리 링크/최근방문/사이드바/카드 요소를 숨긴다.
 * - access-guard.js의 "이번만 보기"는 페이지 접근에만 적용한다.
 * - 따라서 이 파일은 dcb-temp-allow를 절대 참조하지 않는다.
 *****************************************************************/

(() => {
  "use strict";

  const BUILTIN = ["dcbest"];
  const STYLE_ID = "dcb-link-blocker-style";
  const HIDDEN_CLASS = "dcb-blocked-hidden";
  const HIDDEN_ATTR = "data-dcb-hidden";
  const HIDDEN_GID_ATTR = "data-dcb-hidden-gid";
  const LINK_HIDDEN_ATTR = "data-dcb-link-hidden";

  const SPECIAL_BLOCK_RULES = {
    dcbest: [
      "#time_best_head_tab",
      ".btn_dcbest_rank_tab",
      "[id^='dcbest_list_page_']",
      ".main_tab_real_time_best",
      "a.allview_go[href*='id=dcbest']",
      "a.concept_imgbox[href*='id=dcbest']",
      "a.concept_txtbox[href*='id=dcbest']",
      "li:has(a.concept_imgbox[href*='id=dcbest'])",
      "li:has(a.concept_txtbox[href*='id=dcbest'])",
      ".content_box:has(a[href*='id=dcbest'])",
      ".txt_box:has(a[href*='id=dcbest'])",
      ".thumb_txt:has(a[href*='id=dcbest'])",
      ".issue_content:has(a[href*='id=dcbest'])",
      ".box:has(a[href*='id=dcbest'])",
      ".newvisit_list li.lately_gall_dcbest",
      ".newvisit_list li:has(a[href*='id=dcbest'])",
      ".newvisit_list li:has([data-id='dcbest'])"
    ]
  };

  let gBlockEnabled = true;
  let linkWarnEnabled = true;
  let blockedSet = new Set(BUILTIN);
  let observer = null;
  let scanTimer = null;
  let isApplying = false;

  function norm(v) {
    return String(v || "").trim().toLowerCase();
  }

  function isElement(v) {
    return v instanceof Element;
  }

  function isDcInsideHost(hostname) {
    const host = norm(hostname);
    return host === "dcinside.com" || host.endsWith(".dcinside.com");
  }

  function isPlainGalleryId(v) {
    return /^[a-z0-9_-]+$/i.test(String(v || "").trim());
  }

  function escapeCss(v) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(v));
    }

    return String(v).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  /*
    사용자가 차단 목록에 아래 형태 중 무엇을 넣어도 갤러리 ID만 추출한다.

    1) dcbest
    2) asdf12
    3) id=asdf12
    4) https://gall.dcinside.com/board/lists?id=dcbest
    5) https://gall.dcinside.com/mgallery/board/lists?id=asdf12
  */
  function extractGalleryId(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";

    if (/^id\s*=/i.test(raw)) {
      return norm(raw.replace(/^id\s*=\s*/i, "").split(/[&#?\s]/)[0]);
    }

    if (isPlainGalleryId(raw)) {
      return norm(raw);
    }

    try {
      const url = new URL(raw, location.href);

      if (!isDcInsideHost(url.hostname)) {
        return "";
      }

      const qsId = url.searchParams.get("id");
      if (qsId) return norm(qsId);

      const pathMatch = url.pathname.match(/^\/(?:mgallery|mini|person)\/([^/?#]+)/i);
      if (pathMatch && pathMatch[1]) {
        return norm(pathMatch[1]);
      }

      return "";
    } catch {
      return norm(raw)
        .replace(/^id\s*=\s*/i, "")
        .split(/[?#&\s]/)[0]
        .trim();
    }
  }

  function normalizeBlockedIds(blockedIds) {
    const userIds = Array.isArray(blockedIds)
      ? blockedIds.map(extractGalleryId).filter(Boolean)
      : [];

    return new Set([
      ...BUILTIN.map(extractGalleryId).filter(Boolean),
      ...userIds
    ]);
  }

  function isBlockedGallery(gid) {
    gid = norm(gid);
    return !!gid && blockedSet.has(gid);
  }

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
        gBlockEnabled = typeof galleryBlockEnabled === "boolean"
          ? galleryBlockEnabled
          : !!enabled;

        blockedSet = normalizeBlockedIds(blockedIds);
        linkWarnEnabled = !!lwarn;

        if (typeof cb === "function") cb();
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
      blockedSet = normalizeBlockedIds(chg.blockedIds.newValue || []);
    }

    if (chg.linkWarnEnabled) {
      linkWarnEnabled = !!chg.linkWarnEnabled.newValue;
    }

    applyLinkWarnings({ reset: true });
  });

  /* ───── 스타일 주입 ───── */

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .${HIDDEN_CLASS} {
          display: none !important;
          visibility: hidden !important;
        }
      `;

      const parent = document.head || document.documentElement;
      if (parent) parent.appendChild(style);
    }

    return style;
  }

  /* ───── 이전 숨김 초기화 ───── */

  function resetHiddenState() {
    document.querySelectorAll(`.${HIDDEN_CLASS}[${HIDDEN_ATTR}="1"]`).forEach(el => {
      el.classList.remove(HIDDEN_CLASS);
      el.removeAttribute(HIDDEN_ATTR);
      el.removeAttribute(HIDDEN_GID_ATTR);
    });

    document.querySelectorAll(`a[${LINK_HIDDEN_ATTR}="1"]`).forEach(link => {
      link.removeAttribute(LINK_HIDDEN_ATTR);
      link.classList.remove("dcb-blocked-link", "dcb-blocked-link-clickable");
      link.style.pointerEvents = "";
      link.onclick = null;
    });
  }

  function hideNode(el, gid) {
    if (!isElement(el)) return;

    if (
      el === document.documentElement ||
      el === document.body ||
      el === document.head
    ) {
      return;
    }

    el.classList.add(HIDDEN_CLASS);
    el.setAttribute(HIDDEN_ATTR, "1");
    el.setAttribute(HIDDEN_GID_ATTR, norm(gid));
  }

  function markLinkBlocked(link) {
    if (!isElement(link)) return;

    link.setAttribute(LINK_HIDDEN_ATTR, "1");
    link.classList.remove("dcb-blocked-link", "dcb-blocked-link-clickable");
    link.style.pointerEvents = "none";
    link.onclick = null;
  }

  /* ───── 숨길 대상 찾기 ───── */

  function getHideTarget(el) {
    if (!isElement(el)) return null;

    const recentVisitItem = el.closest(
      [
        ".newvisit_list li",
        ".visit_bookmark li",
        "li[class*='lately_gall_']"
      ].join(",")
    );

    if (recentVisitItem) return recentVisitItem;

    return (
      el.closest(
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
          ".concept_imgbox",
          ".concept_txtbox",
          ".box"
        ].join(",")
      ) || el
    );
  }

  function extractIdFromLatelyClass(el) {
    if (!isElement(el)) return "";

    for (const cls of el.classList) {
      const match = cls.match(/^lately_gall_(.+)$/i);
      if (match && match[1]) {
        return norm(match[1]);
      }
    }

    return "";
  }

  function getGalleryIdFromElement(el) {
    if (!isElement(el)) return "";

    const candidates = [
      el.getAttribute("data-id"),
      el.getAttribute("data-gall-id"),
      el.getAttribute("data-gallery-id"),
      el.getAttribute("data-gid"),
      el.getAttribute("section"),
      el.getAttribute("depth3")
    ];

    for (const value of candidates) {
      const gid = extractGalleryId(value);
      if (gid) return gid;
    }

    const classId = extractIdFromLatelyClass(el);
    if (classId) return classId;

    const dataChild = el.querySelector?.(
      [
        "[data-id]",
        "[data-gall-id]",
        "[data-gallery-id]",
        "[data-gid]",
        "[section]",
        "[depth3]"
      ].join(",")
    );

    if (dataChild) {
      const childId = getGalleryIdFromElement(dataChild);
      if (childId) return childId;
    }

    const link = el.querySelector?.("a[href]");
    if (link) {
      return extractGalleryId(link.getAttribute("href"));
    }

    return "";
  }

  /* ───── 링크/최근방문/부속 UI 차단 ───── */

  function blockGalleryLinks() {
    const links = document.querySelectorAll("a[href]");

    links.forEach(link => {
      const gid = extractGalleryId(link.getAttribute("href"));
      if (!isBlockedGallery(gid)) return;

      const hideTarget = getHideTarget(link);
      if (hideTarget) {
        hideNode(hideTarget, gid);
      }

      markLinkBlocked(link);
    });
  }

  function blockRecentVisitItems() {
    const items = document.querySelectorAll(
      [
        ".newvisit_list li",
        ".visit_bookmark li",
        "li[class*='lately_gall_']"
      ].join(",")
    );

    items.forEach(item => {
      const gid = getGalleryIdFromElement(item);
      if (!isBlockedGallery(gid)) return;

      hideNode(item, gid);
    });
  }

  function blockDataIdElements() {
    const nodes = document.querySelectorAll(
      [
        ".btn_visit_del[data-id]",
        "button[data-id]",
        "[data-id][data-gtype]",
        "[data-id]",
        "[data-gall-id]",
        "[data-gallery-id]",
        "[data-gid]",
        "[section]",
        "[depth3]"
      ].join(",")
    );

    nodes.forEach(node => {
      const gid = getGalleryIdFromElement(node);
      if (!isBlockedGallery(gid)) return;

      const hideTarget = getHideTarget(node);
      if (hideTarget) {
        hideNode(hideTarget, gid);
      }
    });
  }

  function applySpecialBlocks() {
    for (const gid of blockedSet) {
      const selectors = SPECIAL_BLOCK_RULES[gid];

      if (Array.isArray(selectors)) {
        selectors.forEach(selector => {
          try {
            document.querySelectorAll(selector).forEach(el => {
              hideNode(el, gid);
            });
          } catch {
            /*
              일부 브라우저/페이지 문맥에서 :has() selector가 실패해도
              전체 차단 기능이 죽지 않도록 무시한다.
            */
          }
        });
      }

      const safeGid = escapeCss(gid);

      [
        `.newvisit_list li.lately_gall_${safeGid}`,
        `li.lately_gall_${safeGid}`
      ].forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            hideNode(el, gid);
          });
        } catch {}
      });
    }
  }

  function applyLinkWarnings(options = {}) {
    if (isApplying) return;

    isApplying = true;

    try {
      ensureStyle();

      if (options.reset !== false) {
        resetHiddenState();
      }

      if (!gBlockEnabled || !linkWarnEnabled) {
        resetHiddenState();
        return;
      }

      blockGalleryLinks();
      blockRecentVisitItems();
      blockDataIdElements();
      applySpecialBlocks();
    } finally {
      isApplying = false;
    }
  }

  /* ───── 동적 콘텐츠 대응 ───── */

  function scheduleApplyLinkWarnings() {
    if (scanTimer) return;

    scanTimer = setTimeout(() => {
      scanTimer = null;
      applyLinkWarnings({ reset: true });
    }, 80);
  }

  function startObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    observer = new MutationObserver(() => {
      if (!isApplying) scheduleApplyLinkWarnings();
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          if (document.body && observer) {
            observer.observe(document.body, {
              childList: true,
              subtree: true
            });
          }
        },
        { once: true }
      );
    }
  }

  /*
    access-guard.js에서 "이번만 보기"를 누른 직후 발생시키는 이벤트.
    이 이벤트를 받으면 임시 허용 여부와 무관하게 즉시 요소 차단을 다시 적용한다.
  */
  window.addEventListener(
    "dcb-access-allow-once",
    () => {
      applyLinkWarnings({ reset: true });
      setTimeout(() => applyLinkWarnings({ reset: true }), 0);
      setTimeout(() => applyLinkWarnings({ reset: true }), 120);
    },
    true
  );

  /* ───── 초기 실행 ───── */

  syncSettings(() => {
    applyLinkWarnings({ reset: true });
    startObserver();
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        applyLinkWarnings({ reset: true });
        startObserver();
      },
      { once: true }
    );
  } else {
    applyLinkWarnings({ reset: true });
    startObserver();
  }
})();
