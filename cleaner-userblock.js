/*****************************************************************
 * cleaner-userblock.js  
 *****************************************************************/
(() => {
  const STYLE_ID = 'dcb-userblock-style';

  const DEFAULTS = {
    userBlockEnabled: true,
    blockedUids: [],          // ['회원UID', '118.235' 같은 IP 프리픽스]
    includeGray: true,
    hideDCGray: undefined
  };

  const cssEscape = s => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const isIpToken = s => /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s||'').trim());

  function ensureStyle(){
    let el = document.getElementById(STYLE_ID);
    if(!el){
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  function migrate(conf){
    if (typeof conf.userBlockEnabled !== 'boolean' && typeof conf.hideDCGray === 'boolean') {
      conf.userBlockEnabled = conf.hideDCGray;
      chrome.storage.sync.set({ userBlockEnabled: conf.userBlockEnabled });
    }
    return conf;
  }

  function buildCss(conf){
    const { userBlockEnabled, includeGray, blockedUids } = conf;
    if (!userBlockEnabled) return '';

    const lines = [];
    if (includeGray) lines.push('.block-disable{display:none!important}');

    const uids=[]; const ips=[];
    (blockedUids||[]).forEach(t=>{
      const s = String(t||'').trim(); if(!s) return;
      (isIpToken(s) ? ips : uids).push(s);
    });

    // 목록(리스트) 항목은 통째로 숨김
    const addRulesForAttr = (attr) => {
      lines.push(
        `.gall_list tr.ub-content:has(.gall_writer${attr}){display:none!important}`,
        `.gall_list li.ub-content:has(.gall_writer${attr}){display:none!important}`
      );
    };
    uids.forEach(u => addRulesForAttr(`[data-uid="${cssEscape(u)}"]`));
    ips .forEach(p => addRulesForAttr(`[data-ip^="${cssEscape(p)}"]`));

    // 안내 UI(우측 정렬, 슬림)
    lines.push(`
      .dcb-blocked-wrap{display:block;text-align:right}
      .dcb-badge{
        display:inline-flex;align-items:center;gap:6px;
        padding:4px 8px;border:1px dashed rgba(224,49,49,.45);
        border-radius:6px;background:rgba(224,49,49,.08);color:#e03131;
        font-size:12px;font-weight:700;line-height:1.45
      }
      .dcb-toggle{
        padding:2px 8px;border:1px solid currentColor;border-radius:6px;
        background:transparent;color:#e03131;font-size:11px;cursor:pointer
      }
      .dcb-rehide{margin-top:6px;text-align:right}
      .dcb-rehide .dcb-toggle{border-color:#666;color:#666}
    `);

    return lines.join('\n');
  }

  /* ===== 댓글 본문 탐색 ===== */
  function findCommentBody(container){
    return (
      container.querySelector('.cmt_txtbox') ||
      container.querySelector('.comment_box') ||
      container.querySelector('.cmt_txt') ||
      container.querySelector('p.usertxt') ||
      container.querySelector('.usertxt.ub-word') ||
      container.querySelector('.ub-word') ||
      null
    );
  }

  function findBodyFromInfo(infoEl){
    let p = infoEl.parentElement;
    let cand = findCommentBody(p||infoEl);
    if (cand) return cand;

    let sib = infoEl.nextElementSibling;
    for (let i=0; i<3 && sib; i++, sib = sib.nextElementSibling){
      if (sib.matches?.('.cmt_txtbox, .comment_box, .cmt_txt, .ub-word, p.usertxt, .usertxt.ub-word')) return sib;
      const inner = sib.querySelector?.('.cmt_txtbox, .comment_box, .cmt_txt, .ub-word, p.usertxt, .usertxt.ub-word');
      if (inner) return inner;
    }
    return null;
  }

  function getCommentItems(){
    const items = [];
    const seen = new Set();

    // 일반/이미지 댓글 li
    document.querySelectorAll('#focus_cmt .cmt_list li.ub-content, #container .cmt_list li.ub-content, li[id^="img_comment_li_"]').forEach(li=>{
      const info = li.querySelector('.cmt_info');
      const no = info?.getAttribute('data-no') || '';
      if (no && seen.has(no)) return;

      const writer = li.querySelector('.gall_writer'); if(!writer) return;
      const body = findCommentBody(li) || (info && findBodyFromInfo(info)); if (!body) return;

      items.push({ container: li, writer, body });
      if (no) seen.add(no);
    });

    // li 없이 .cmt_info만 있는 케이스
    document.querySelectorAll('#focus_cmt .cmt_info, #container .cmt_info').forEach(info=>{
      if (info.closest('li.ub-content')) return;
      const no = info.getAttribute('data-no') || '';
      if (no && seen.has(no)) return;

      const writer = info.querySelector('.gall_writer'); if(!writer) return;
      const body = findBodyFromInfo(info); if(!body) return;

      items.push({ container: info, writer, body });
      if (no) seen.add(no);
    });

    return items;
  }

  /* ===== 보기/숨기기 렌더 ===== */
  function renderHidden(body){
    body.setAttribute('data-dcb-body', '1');
    body.innerHTML =
      `<div class="dcb-blocked-wrap">
         <span class="dcb-badge">차단된 댓글입니다
           <button class="dcb-toggle" type="button" data-dcb-act="show">보기</button>
         </span>
       </div>`;
  }
  function renderShown(body){
    body.setAttribute('data-dcb-body', '1');
    body.innerHTML =
      body.dataset.dcbOriginal +
      `<div class="dcb-rehide">
         <button class="dcb-toggle" type="button" data-dcb-act="hide">숨기기</button>
       </div>`;
  }

  function maskOne(item, masked){
    const { container, body } = item;
    if (masked){
      if (!body.dataset.dcbOriginal){
        body.dataset.dcbOriginal = body.innerHTML;
      }
      if (body.dataset.dcbOpen === '1') renderShown(body);
      else renderHidden(body);
      container.classList.add('dcb-masked');
    }else{
      if (body.dataset.dcbOriginal){
        body.innerHTML = body.dataset.dcbOriginal;
        delete body.dataset.dcbOriginal;
      }
      body.removeAttribute('data-dcb-open');
      body.removeAttribute('data-dcb-body');
      container.classList.remove('dcb-masked');
    }
  }

  // 보기/숨기기 (본문 기준으로 토글) — 이벤트 위임
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.dcb-toggle');
    if (!btn) return;

    const act = btn.dataset.dcbAct;
    // 버튼에서 가장 가까운 본문 노드 탐색
    const body =
      btn.closest('[data-dcb-body="1"]') ||
      btn.closest('.cmt_txtbox, .comment_box, .cmt_txt, p.usertxt, .usertxt.ub-word, .ub-word');
    if (!body || !body.dataset.dcbOriginal) return;

    if (act === 'show'){
      body.dataset.dcbOpen = '1';
      renderShown(body);
    }else{
      body.dataset.dcbOpen = '0';
      renderHidden(body);
    }
    e.preventDefault();
  }, true);

  function applyMask(tokens){
    const isIp = t => /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(t);
    const items = getCommentItems();

    if (!tokens.length){
      items.forEach(item => maskOne(item,false));
      return;
    }

    items.forEach(item=>{
      const uid = item.writer.getAttribute('data-uid') || '';
      const ip  = item.writer.getAttribute('data-ip')  || '';
      let masked = false;
      for (const t of tokens){
        if (isIp(t)) { if (ip && ip.startsWith(t)) { masked = true; break; } }
        else         { if (uid && uid === t)      { masked = true; break; } }
      }
      maskOne(item, masked);
    });
  }

  function apply(){
    chrome.storage.sync.get(DEFAULTS, raw=>{
      const conf = migrate(raw);
      ensureStyle().textContent = buildCss(conf);

      if (!conf.userBlockEnabled){
        applyMask([]); // 복원
        return;
      }
      const tokens = (conf.blockedUids||[]).map(s=>String(s).trim()).filter(Boolean);
      applyMask(tokens);
    });
  }

  // 초기 적용
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once:true });
  } else {
    apply();
  }

  // 동적 로딩 대응
  let raf = 0;
  const mo = new MutationObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(apply);
  });
  const startMO = () => {
    if (document.body) mo.observe(document.body, { childList:true, subtree:true });
    else document.addEventListener('DOMContentLoaded', startMO, { once:true });
  };
  startMO();

  // 설정 변경 즉시 반영
  chrome.storage.onChanged.addListener((changes, area)=>{
    if (area !== 'sync') return;
    if (changes.userBlockEnabled || changes.blockedUids || changes.includeGray || changes.hideDCGray){
      apply();
    }
  });
})();
