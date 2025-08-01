/*****************************************************************
 * cleaner-comment.js 
 *****************************************************************/

const STYLE_ID = "dcb-hide-comment-style";

/* 글마다 달라지는 id 를 포괄하도록 일반화한 셀렉터 모음 */
const COMMENT_SELECTORS = [
  /* 댓글 컨테이너 */
  '[id^="comment_wrap_"]',
  '[id^="comment_li_"]',
  '#focus_cmt',

  /* 댓글 목록 / 입력창 공통 클래스 */
  '.comment_box',
  '.comment_count',
  '.cmt_write_box',
  '.reply_box',
  '.comment_list_wrap'
];

function applySelectors(on) {
  let st = document.getElementById(STYLE_ID);

  if (on) {
    if (!st) {
      st = document.createElement("style");
      st.id = STYLE_ID;
      document.documentElement.appendChild(st);
    }
    st.textContent = COMMENT_SELECTORS
      .map(s => `${s}{display:none!important}`)  // CSS 숨김
      .join("\n");

    /* 이미 렌더된 노드도 삭제 */
    COMMENT_SELECTORS.forEach(sel =>
      document.querySelectorAll(sel).forEach(el => el.remove()));
  } else if (st) {
    /** 숨김 OFF → style 제거 */
    st.remove();
  }
}

let observer;

function startObserver(on) {
  if (observer) observer.disconnect();
  if (!on) return;

  observer = new MutationObserver(() =>
    COMMENT_SELECTORS.forEach(sel =>
      document.querySelectorAll(sel).forEach(el => el.remove()))
  );
  observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
  chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
    applySelectors(hideComment);
    if (document.body) startObserver(hideComment);
    else addEventListener("DOMContentLoaded", () => startObserver(hideComment), { once: true });
  });
}

/* 스토리지 변경 반영 */
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "sync" && c.hideComment) init();
});

init();
