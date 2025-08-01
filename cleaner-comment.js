/*****************************************************************
 * cleaner-comment.js 
 *****************************************************************/

const STYLE_ID = "dcb-hide-comment-style";

/* ▶ 최신 DOM: <div id="focus_cmt" class="view_comment" tabindex="0">… */
const CMT_SEL = "div#focus_cmt.view_comment[tabindex]";

/* style 주입 / 제거 */
function apply(hide) {
  let tag = document.getElementById(STYLE_ID);

  if (hide) {
    if (!tag) {
      tag = document.createElement("style");
      tag.id = STYLE_ID;
      document.documentElement.appendChild(tag);
    }
    tag.textContent = `${CMT_SEL}{display:none !important}`;
    document.querySelectorAll(CMT_SEL).forEach(el => el.remove());
  } else if (tag) {
    tag.remove();
  }
}

/* 동적 댓글 로딩 대응 */
let ob;
function watch(hide) {
  if (ob) ob.disconnect();
  if (!hide) return;
  ob = new MutationObserver(() =>
    document.querySelectorAll(CMT_SEL).forEach(el => el.remove()));
  ob.observe(document.body, { childList: true, subtree: true });
}

/* 초기 + 토글 변경 시 */
function init() {
  chrome.storage.sync.get({ hideComment:false }, ({ hideComment }) => {
    apply(hideComment);
    if (document.body) watch(hideComment);
    else addEventListener("DOMContentLoaded", () => watch(hideComment), { once:true });
  });
}

chrome.storage.onChanged.addListener((c,a)=>{
  if (a === "sync" && c.hideComment) init();
});

init();
