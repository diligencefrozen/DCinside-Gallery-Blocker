// Page/long-panel top and article comments shortcuts above bottom-right controls.
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
    style.textContent = ".controls{display:flex;flex-direction:column;gap:8px}button{box-sizing:border-box;width:44px;height:44px;border:1px solid #617eff;border-radius:50%;background:#263761;color:white;font:26px system-ui;cursor:pointer;box-shadow:0 3px 12px #0005}button[hidden],.comments-count[hidden]{display:none!important}button.comments{font-size:12px;font-weight:700;padding:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;line-height:1.15}.comments-count{font-size:11px;max-width:38px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}button:hover{background:#3553a0}button:focus-visible{outline:3px solid #8ab4ff;outline-offset:3px}@media(prefers-reduced-motion:reduce){button{scroll-behavior:auto}}";
    const button = document.createElement("button");
    button.type = "button"; button.textContent = "↑"; button.setAttribute("aria-label","맨 위로 이동"); button.title = "맨 위로 이동";
    const comments = document.createElement("button");
    comments.type = "button"; comments.className = "comments";
    const commentLabel = document.createElement("span"); commentLabel.textContent = "댓글";
    const commentCount = document.createElement("span"); commentCount.className = "comments-count"; commentCount.hidden = true;
    comments.append(commentLabel,commentCount);
    comments.title = "댓글로 이동"; comments.setAttribute("aria-label","댓글로 이동"); comments.hidden = true;
    const controls = document.createElement("div"); controls.className = "controls";
    controls.append(button,comments); shadow.append(style,controls); document.body.append(host);
    let active = document.scrollingElement, frame = 0, timer = 0, dirty = true, candidates = [], movingUntil = 0;
    const root = () => document.scrollingElement || document.documentElement;
    const isView = () => location.hostname === "m.dcinside.com" || /^\/(?:mgallery\/|mini\/|person\/)?board\/view(?:\/|$)/.test(location.pathname);
    const updatedTotals = new WeakSet();
    function commentTarget() {
      if (!isView()) return null;
      const no = new URL(location.href).searchParams.get("no");
      const matches = node => {
        if (!node || node.closest('[data-dcb-owned], #dcb-preview-overlay, .dcbpv-overlay, [hidden]')) return false;
        const idNo = node.id.match(/^comment_wrap_(\d+)$/)?.[1], dataNo = node.getAttribute("data-article-no");
        if (no && ((idNo && idNo !== no) || (dataNo && dataNo !== no))) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
      };
      if (no && /^\d+$/.test(no)) {
        const exact = document.getElementById("comment_wrap_"+no);
        if (matches(exact)) return exact;
        const scoped = document.querySelector('.comment_wrap[data-article-no="'+no+'"]');
        if (matches(scoped)) return scoped;
      }
      const fallback = [...document.querySelectorAll(".comment_wrap, #comment_wrap")].filter(matches);
      return fallback.length === 1 ? fallback[0] : null;
    }
    function commentTotal(target) {
      if (!target) return null;
      const parse = value => {
        const text = String(value || "").replace(/\s/g, "");
        if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
        const count = Number(text.replaceAll(",", ""));
        return Number.isSafeInteger(count) && count >= 0 ? count : null;
      };
      const no = new URL(location.href).searchParams.get("no") || target.getAttribute("data-article-no") || target.id.match(/^comment_wrap_(\d+)$/)?.[1];
      const own = node => node.closest(".comment_wrap, #comment_wrap, [id^=comment_wrap_]") === target && !node.closest("#dcb-preview-overlay, .dcbpv-overlay, [data-dcb-owned]");
      const byId = no && document.getElementById("comment_total_" + no);
      const named = byId && own(byId) ? [byId] : [...target.querySelectorAll('[id^="comment_total_"]')].filter(own);
      if (no) {
        const exact = named.find(node => node.id === "comment_total_" + no);
        if (exact) {
          const count = parse(exact.textContent);
          // Native comment.js writes total_cnt here, including a confirmed zero.
          // The initial article HTML can already contain "0" before that write.
          const loaded = target.classList.contains("show") && target.dataset.articleNo === no && target.hasAttribute("data-comment-cnt");
          if (count === 0 && !updatedTotals.has(exact) && !loaded) {
            const form = document.getElementById("_view_form_");
            if (form?.elements.namedItem("gallery_no")?.value === no && !form.closest("[data-dcb-owned],#dcb-preview-overlay")) {
              // The article response includes its count even on empty threads
              // where the site never requests a separate comment list.
              return parse(form.elements.namedItem("comment_cnt")?.value);
            }
            return null;
          }
          return count;
        }
        // A named count for another article must not become this one's total.
        if (named.length) return null;
      } else if (named.length === 1) return parse(named[0].textContent);
      else if (named.length) return null;
      const header = [...target.querySelectorAll(".comment_count")].find(own);
      if (!header) return null;
      const legacy = header.querySelector("#comment_total");
      if (legacy) return parse(legacy.textContent);
      const text = header.textContent.match(/전체\s*댓글\s*([\d,]+)\s*개/);
      return text ? parse(text[1]) : null;
    }
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
      const comment = commentTarget();
      button.hidden = !shown; comments.hidden = !comment;
      host._commentTarget = comment;
      const total = commentTotal(comment), countText = total === null ? "" : total.toLocaleString("ko-KR");
      commentCount.hidden = total === null;
      if (commentCount.textContent !== countText) commentCount.textContent = countText;
      const commentTitle = total === null ? "댓글로 이동" : "댓글로 이동 · 전체 " + countText + "개";
      if (comments.title !== commentTitle) {comments.title = commentTitle;comments.setAttribute("aria-label",commentTitle);}
      if (!shown && !comment) { if (host.style.display !== "none") host.style.display = "none"; return; }
      const height = shown && comment ? 96 : 44;
      if (host.style.height !== height+"px") host.style.height = height+"px";
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
      if (bottom + height > innerHeight - 16) { host.style.display = "none"; return; }
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
    comments.addEventListener("click", () => {
      const target = commentTarget();
      if (!target) {schedule();return;}
      target.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
    });
    document.addEventListener("scroll", event => {
      const target = event.target === document ? root() : event.target;
      if (target instanceof HTMLElement && (target === root() || (target.clientHeight >= 160 && target.scrollHeight > target.clientHeight + 160))) active = target;
      schedule();
    }, {capture:true,passive:true});
    window.addEventListener("resize", () => {dirty=true;schedule();}, {passive:true});
    window.addEventListener("popstate", schedule);
    document.addEventListener("dcb-auto-refresh-ui-change", () => {dirty=true;schedule();});
    document.addEventListener("transitionrun", event => {
      if (event.target===host || host.contains(event.target)) return;
      if (candidates.some(node=>node===event.target || node.contains(event.target))) {movingUntil=performance.now()+1000;schedule();}
    },true);
    document.addEventListener("transitionend", () => {dirty=true;schedule();},true);
    const observer = new MutationObserver(changes => {
      if (changes.every(change => change.target === host || host.contains(change.target))) return;
      let totalsOnly = true;
      for (const change of changes) {
        const node = change.target.nodeType === Node.TEXT_NODE ? change.target.parentElement : change.target;
        if (node?.id?.startsWith("comment_total_") && change.type !== "attributes") updatedTotals.add(node);
        else totalsOnly = false;
      }
      if (totalsOnly) { schedule(); return; }
      dirty = true;
      const floating = node => node instanceof HTMLElement && node!==host && ["fixed","sticky"].includes(getComputedStyle(node).position);
      if (changes.some(change => floating(change.target) || [...change.addedNodes].slice(0,8).some(floating))) {
        clearTimeout(timer);timer=0;schedule();return;
      }
      if (!timer) timer = setTimeout(() => {timer=0;schedule();},100);
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["style","class","hidden","data-article-no","data-comment-cnt"]});
    schedule();
  };
  if (document.body) init(); else document.addEventListener("DOMContentLoaded",init,{once:true});
})();
