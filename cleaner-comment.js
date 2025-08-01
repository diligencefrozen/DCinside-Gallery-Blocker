/*****************************************************************
 * cleaner-comment.js  
 *****************************************************************/

const STYLE_ID = "dcb-hide-comment-style";

/**
 * 2025‑08 디시인사이드 신,구 댓글 DOM 선택자 집합
 * 필요 시 클래스/ID를 추가하여 유지보수
 */
const CMT_SELECTORS = [
  /* (구) 2024 이전 구조 */
  "div#focus_cmt.view_comment[tabindex]",
  "span.reply_num",

  /* (신) 2024‑12 이후 React 기반 구조 */
  "div.comment_box",
  "div.comment_view",
  "div.comment_wrap",
  "section.comment_area",
  "div.comment_list",
  "div.comment_write",

  /* 기타 변형 */
  "div#comment_area",
  "div[id^='reple']",            // reple0, reple_write …
  "iframe[src*='forms/comment']"  // 댓글 iframe (백업 대비)
];

/**
 * 스타일 삽입 및 기존 노드 즉시 제거
 * @param {boolean} hide
 */
function apply(hide) {
  let styleEl = document.getElementById(STYLE_ID);

  if (hide) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.documentElement.appendChild(styleEl);
    }

    /* display:none !important로 숨김 */
    styleEl.textContent = CMT_SELECTORS
      .map(sel => `${sel}{display:none !important}`)
      .join("\n");

    /* 이미 렌더된 노드 즉시 제거 */
    removeNodes();
  } else if (styleEl) {
    styleEl.remove(); // 숨김 OFF → 원복
  }
}

/** 선택자에 해당하는 노드 제거 */
function removeNodes() {
  CMT_SELECTORS.forEach(sel =>
    document.querySelectorAll(sel).forEach(el => el.remove())
  );
}

let observer;
/**
 * 댓글 DOM이 동적으로 추가될 때 제거
 * @param {boolean} hide
 */
function watch(hide) {
  if (observer) observer.disconnect();
  if (!hide) return;

  observer = new MutationObserver(removeNodes);
  observer.observe(document.body, { childList: true, subtree: true });
}

/** 초기화 */
function init() {
  chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
    apply(hideComment);

    if (document.body) {
      watch(hideComment);
    } else {
      window.addEventListener(
        "DOMContentLoaded",
        () => watch(hideComment),
        { once: true }
      );
    }
  });
}

/* 스토리지 변경 시 재초기화 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && "hideComment" in changes) {
    init();
  }
});

init();
