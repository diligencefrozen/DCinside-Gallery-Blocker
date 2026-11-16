// A page/long-panel top button, stacked above existing bottom-right controls.
(() => {
  "use strict";
  if (!["gall.dcinside.com","m.dcinside.com"].includes(location.hostname) || window.top !== window ||
      globalThis.__DCB_SITE_SCROLL_TOP__) return;
  if (location.hostname === "gall.dcinside.com" && !/^\/(?:mgallery\/|mini\/|person\/)?board\/(?:lists|view)/.test(location.pathname)) return;
  globalThis.__DCB_SITE_SCROLL_TOP__ = true;
  const init = () => {
    const host = document.createElement("div");
    host.id = "dcb-site-scroll-top"; host.dataset.dcbOwned = "scroll-top";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;width:44px;height:44px;z-index:2147483000;display:none";
    const shadow = host.attachShadow({mode:"open"});
    const style = document.createElement("style");
    style.textContent = "button{box-sizing:border-box;width:44px;height:44px;border:1px solid #617eff;border-radius:50%;background:#263761;color:white;font:26px system-ui;cursor:pointer;box-shadow:0 3px 12px #0005}button:hover{background:#3553a0}button:focus-visible{outline:3px solid #8ab4ff;outline-offset:3px}@media(prefers-reduced-motion:reduce){button{scroll-behavior:auto}}";
    const button = document.createElement("button");
    button.type = "button"; button.textContent = "↑"; button.setAttribute("aria-label","맨 위로 이동"); button.title = "맨 위로 이동";
    shadow.append(style,button); document.body.append(host);
    let active = document.scrollingElement, frame = 0, timer = 0, dirty = true, candidates = [], movingUntil = 0;
    const root = () => document.scrollingElement || document.documentElement;
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    function update() {
      frame = 0;
      const page = root();
      const activeRect = active?.getBoundingClientRect?.();
      if (!active?.isConnected || (active !== page && (!activeRect || activeRect.height < 100 || activeRect.bottom <= 0 || activeRect.top >= innerHeight))) active = page;
      let target = active;
      const far = node => node.scrollTop > Math.min(400, Math.max(160, (node === page ? innerHeight : node.clientHeight) * .65));
      if (!far(target) && target !== page && far(page)) target = page;
      const shown = far(target) && target.scrollHeight > (target === page ? innerHeight : target.clientHeight) + 160;
      if (!shown) { if (host.style.display !== "none") host.style.display = "none"; return; }
      if (dirty) {
        const found = new Set(document.querySelectorAll('#dcb-auto-refresh-countdown,#dcb-gallery-quick-block-floating,[data-dcb-floating],[id*="float"],[id*="fixed"],[class*="float"],[class*="fixed"],[class*="sticky"],[style*="position:fixed"],[style*="position: fixed"]'));
        // Also discover native fixed bars whose names reveal no positioning.
        const positions = new Map();
        for (const x of [innerWidth-18,innerWidth-38,innerWidth-58]) for (const distance of [10,40,80,140,220]) {
          for (const hit of document.elementsFromPoint(x,innerHeight-distance).slice(0,6)) {
            let node=hit;
            for (let depth=0;node && node!==document.body && depth<4;depth++,node=node.parentElement) {
              if (node===host || host.contains(node)) break;
              if (!positions.has(node)) positions.set(node,getComputedStyle(node).position);
              if (["fixed","sticky"].includes(positions.get(node))) {found.add(node);break;}
            }
          }
        }
        candidates = [...found].slice(0,300);
        dirty = false;
      }
      let bottom = 16;
      const left = innerWidth - 60, right = innerWidth - 16;
      for (const node of candidates) {
        if (!node.isConnected || node === host || host.contains(node)) continue;
        const css = getComputedStyle(node);
        if (!["fixed","sticky"].includes(css.position) || css.display === "none" || css.visibility === "hidden" || Number(css.opacity) === 0) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.height < innerHeight * .6 && rect.top > innerHeight * .4 &&
            rect.top < innerHeight && rect.bottom > 0 && rect.left < right + 8 && rect.right > left - 8)
          bottom = Math.max(bottom, Math.ceil(innerHeight - rect.top + 10));
      }
      // If a large stack consumes this corner, hide rather than cover controls.
      if (bottom + 44 > innerHeight - 16) { host.style.display = "none"; return; }
      if (host.style.bottom !== bottom + "px") host.style.bottom = bottom + "px";
      if (host.style.display !== "block") host.style.display = "block";
      const title = target === page ? "맨 위로 이동" : "현재 목록 맨 위로 이동";
      if (button.title !== title) { button.title = title; button.setAttribute("aria-label",title); }
      host._scrollTarget = target;
      if (performance.now()<movingUntil) schedule();
    }
    button.addEventListener("click", () => {
      const target = host._scrollTarget || root();
      const options = {top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"};
      if (target === root()) window.scrollTo(options); else target.scrollTo(options);
    });
    document.addEventListener("scroll", event => {
      const target = event.target === document ? root() : event.target;
      if (target instanceof HTMLElement && (target === root() || (target.clientHeight >= 160 && target.scrollHeight > target.clientHeight + 160))) active = target;
      schedule();
    }, {capture:true,passive:true});
    window.addEventListener("resize", () => {dirty=true;schedule();}, {passive:true});
    document.addEventListener("dcb-auto-refresh-ui-change", () => {dirty=true;schedule();});
    document.addEventListener("transitionrun", event => {
      if (event.target===host || host.contains(event.target)) return;
      if (candidates.some(node=>node===event.target || node.contains(event.target))) {movingUntil=performance.now()+1000;schedule();}
    },true);
    document.addEventListener("transitionend", () => {dirty=true;schedule();},true);
    const observer = new MutationObserver(changes => {
      if (changes.every(change => change.target === host || host.contains(change.target))) return;
      dirty = true;
      const floating = node => node instanceof HTMLElement && node!==host && ["fixed","sticky"].includes(getComputedStyle(node).position);
      if (changes.some(change => floating(change.target) || [...change.addedNodes].slice(0,8).some(floating))) {
        clearTimeout(timer);timer=0;schedule();return;
      }
      if (!timer) timer = setTimeout(() => {timer=0;schedule();},100);
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["style","class","hidden"]});
    schedule();
  };
  if (document.body) init(); else document.addEventListener("DOMContentLoaded",init,{once:true});
})();
