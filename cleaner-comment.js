/*****************************************************************
 * cleaner-comment.js – 댓글 영역(#focus_cmt) 숨김
 *****************************************************************/

const STYLE_ID = "dcb-hide-comment-style";
const CMT_SEL  = "#focus_cmt";                   // 댓글 전체 

function apply(on) {
  let st = document.getElementById(STYLE_ID);

  if (on) {
    if (!st) {
      st = document.createElement("style");
      st.id = STYLE_ID;
      document.documentElement.appendChild(st);
    }
    st.textContent = `${CMT_SEL}{display:none!important}`;
    document.querySelectorAll(CMT_SEL).forEach(el => el.remove());
  } else if (st) {
    st.remove();                                 // 숨김 OFF → <style> 제거
  }
}

let ob;
function startObserver(on) {
  if (ob) ob.disconnect();
  if (!on) return;
  ob = new MutationObserver(() =>
    document.querySelectorAll(CMT_SEL).forEach(el => el.remove()));
  ob.observe(document.body, { childList: true, subtree: true });
}

function init() {
  chrome.storage.sync.get({ hideComment:false }, ({ hideComment }) => {
    apply(hideComment);
    if (document.body) startObserver(hideComment);
    else addEventListener("DOMContentLoaded", () => startObserver(hideComment), { once:true });
  });
}

chrome.storage.onChanged.addListener((c,a)=>{
  if(a==="sync" && c.hideComment) init();
});

init();
