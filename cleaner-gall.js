/* cleaner-gall.js */
const STYLE_ID = "dcb-gall-clean-style";

function apply(selectors){
  /* <style> 태그 주입 */
  let style = document.getElementById(STYLE_ID);
  if(!style){
    style = document.createElement("style"); style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  style.textContent = selectors.map(s=>`${s}{display:none!important}`).join("\n");

  selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.remove()));
}

function observe(selectors){
  const ob = new MutationObserver(()=>selectors.forEach(
    sel=>document.querySelectorAll(sel).forEach(el=>el.remove())
  ));
  ob.observe(document.body,{childList:true,subtree:true});
}

function init(){
  chrome.storage.sync.get({removeSelectorsGall:[]},({removeSelectorsGall})=>{
    apply(removeSelectorsGall);
    observe(removeSelectorsGall);
  });
}
chrome.storage.onChanged.addListener((c,a)=>{
  if(a==="sync" && c.removeSelectorsGall) init();
});
init();
