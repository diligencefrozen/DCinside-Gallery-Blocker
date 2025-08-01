/*****************************************************************
 * cleaner-comment.js – 모든 프레임에서 #focus_cmt 숨김
 *****************************************************************/
const STYLE_ID = "dcb-hide-comment-style";
const HIDE = "#focus_cmt{display:none!important}";

function apply(hide){
  let tag = document.getElementById(STYLE_ID);
  if(hide){
    if(!tag){
      tag = document.createElement("style");
      tag.id = STYLE_ID;
      tag.textContent = HIDE;
      document.documentElement.appendChild(tag);
    }
  }else if(tag){
    tag.remove();
  }
}

function init(){
  chrome.storage.sync.get({ hideComment:false }, ({ hideComment })=>{
    apply(hideComment);
  });
}

chrome.storage.onChanged.addListener((c,a)=>{
  if(a==="sync" && c.hideComment) init();
});
init();
