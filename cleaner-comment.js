/*****************************************************************
 * cleaner-comment.js 
 *****************************************************************/

const STYLE_ID = "dcb-hide-comment-style";

const CMT_SELECTORS = [
  "div#focus_cmt.view_comment[tabindex]",
  "span.reply_num"
];

function apply(hide) {
  let style = document.getElementById(STYLE_ID);

  if (hide) {
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }
    style.textContent = CMT_SELECTORS
      .map(sel => `${sel}{display:none !important}`)
      .join("\n");

    /* 이미 있는 노드도 즉시 제거 */
    CMT_SELECTORS.forEach(sel =>
      document.querySelectorAll(sel).forEach(el => el.remove())
    );
  } else if (style) {
    style.remove();                                      // 숨김 OFF → 원복
  }
}

let obs;
function watch(hide) {
  if (obs) obs.disconnect();
  if (!hide) return;

  obs = new MutationObserver(() =>
    CMT_SELECTORS.forEach(sel =>
      document.querySelectorAll(sel).forEach(el => el.remove()))
  );
  obs.observe(document.body, { childList: true, subtree: true });
}

function init() {
  chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
    apply(hideComment);
    if (document.body) watch(hideComment);
    else addEventListener("DOMContentLoaded", () => watch(hideComment), { once: true });
  });
}

chrome.storage.onChanged.addListener((c, a) => {
  if (a === "sync" && c.hideComment) init();
});

init();
