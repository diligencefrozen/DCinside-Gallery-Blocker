/*****************************************************************
 * cleaner-comment.js – 댓글 영역 전체 숨김
 *****************************************************************/
const STYLE_ID = "dcb-comment-hide-style";
const CMT_SELECTORS = [
  /* 기본 댓글 박스들 */
  "#comment_li_3046673 > div",
  "#comment_wrap_941305 > div.comment_count",
  "#comment_wrap_941305 > div.comment_box",
  "#focus_cmt > div.cmt_write_box.clear"
  /* 필요 시 추가 */
];

function apply(list){
  let st = document.getElementById(STYLE_ID);
  if(!st){
    st = document.createElement("style");
    st.id = STYLE_ID;
    document.documentElement.appendChild(st);
  }
  st.textContent = list.map(s=>`${s}{display:none!important}`).join("\n");
  list.forEach(sel=>document.querySelectorAll(sel).forEach(e=>e.remove()));
}

function observe(list){
  const ob = new MutationObserver(()=>list.forEach(sel=>
    document.querySelectorAll(sel).forEach(e=>e.remove())));
  ob.observe(document.body,{childList:true,subtree:true});
}

function init(){
  chrome.storage.sync.get({ hideComment:false }, ({ hideComment })=>{
    const list = hideComment ? CMT_SELECTORS : [];
    apply(list);
    if(document.body) observe(list); else
      addEventListener("DOMContentLoaded",()=>observe(list),{once:true});
  });
}
chrome.storage.onChanged.addListener((c,a)=>{
  if(a==="sync" && c.hideComment) init();
});
init();
