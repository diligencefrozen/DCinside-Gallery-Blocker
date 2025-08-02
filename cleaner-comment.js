/*****************************************************************
 * cleaner-comment.js  — 댓글 영역만 깔끔히 숨김
 *****************************************************************/

const STYLE_ID = "dcb-hide-comment-style";
const SEL = "div#focus_cmt.view_comment[tabindex]";

function apply(hide) {
  let styleEl = document.getElementById(STYLE_ID);
  if (hide) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.documentElement.appendChild(styleEl);
    }
    styleEl.textContent = `${SEL}{display:none !important}`;
    removeNodes();
  } else if (styleEl) {
    styleEl.remove();
  }
}

function removeNodes() {
  document.querySelectorAll(SEL).forEach(el => el.remove());
}

let observer;
function watch(hide) {
  if (observer) observer.disconnect();
  if (!hide) return;
  observer = new MutationObserver(removeNodes);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function init() {
  chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
    apply(hideComment);
    if (document.documentElement) {
      watch(hideComment);
    } else {
      addEventListener("DOMContentLoaded", () => watch(hideComment), { once: true });
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && "hideComment" in changes) init();
});

init();
