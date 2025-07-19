/* cleaner-search.js */
const STYLE_ID = "dcb-search-clean-style";

function apply(list){
  let st = document.getElementById(STYLE_ID);
  if(!st){ st = document.createElement("style"); st.id = STYLE_ID; document.documentElement.appendChild(st); }
  st.textContent = list.map(s=>`${s}{display:none!important}`).join("\n");
  list.forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.remove()));
}
function observe(list){
  const ob = new MutationObserver(()=>list.forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.remove())));
  ob.observe(document.body,{childList:true,subtree:true});
}
function init(){
  chrome.storage.sync.get({ removeSelectorsSearch: [] }, ({ removeSelectorsSearch })=>{
    const arr = removeSelectorsSearch.map(s=>s.trim()).filter(Boolean);
    apply(arr);
    if(document.body) observe(arr); else addEventListener("DOMContentLoaded",()=>observe(arr),{once:true});
  });
}
chrome.storage.onChanged.addListener((c,a)=>{ if(a==="sync" && c.removeSelectorsSearch) init(); });
init();
