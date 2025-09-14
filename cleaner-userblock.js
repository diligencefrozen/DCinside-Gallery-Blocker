/*****************************************************************
 * cleaner-userblock.js  — 사용자 차단 + 다국어 도배(반복) 마스킹
 *****************************************************************/
(() => {
  const STYLE_ID = 'dcb-userblock-style';

  const DEFAULTS = {
    // 사용자 차단
    userBlockEnabled: true,
    blockedUids: [],          // ['회원UID', '118.235' 같은 IP 프리픽스]
    includeGray: true,        // .block-disable 숨김
    hideDCGray: undefined,    // 구버전 호환

    // 도배(반복) 차단
    spamBlockEnabled: true,   // ← OFF면 도배 감지/차단 전혀 안 함
  };

  /* 댓글이 존재하는 루트 컨테이너들 (#focus_cmt + 이미지댓글 .comment_wrap) */
  const COMMENT_ROOTS = ['#focus_cmt', '.comment_wrap'];

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

    const lines = [];
    if (includeGray) lines.push('.block-disable{display:none!important}');

    /* 공통 안내 라벨 스타일 (차단/도배 둘 다 사용) */
    lines.push(`
      .dcb-label{
        display:block; margin:6px 0 8px; padding:8px 10px;
        background:rgba(224,49,49,.08); color:#e03131;
        border:1px dashed rgba(224,49,49,.45); border-radius:6px;
        font-size:12px; font-weight:700; line-height:1.45;
        white-space:pre-wrap; word-break:break-word;
      }
    `);

    if (!userBlockEnabled) return lines.join('\n');

    // 목록(리스트)에서 차단 작성자 항목 숨김
    const uids=[]; const ips=[];
    (blockedUids||[]).forEach(t=>{
      const s = String(t||'').trim(); if(!s) return;
      (isIpToken(s) ? ips : uids).push(s);
    });

    const addRulesForAttr = (attr) => {
      lines.push(
        `.gall_list tr.ub-content:has(.gall_writer${attr}){display:none!important}`,
        `.gall_list li.ub-content:has(.gall_writer${attr}){display:none!important}`
      );
    };
    uids.forEach(u => addRulesForAttr(`[data-uid="${cssEscape(u)}"]`));
    ips .forEach(p => addRulesForAttr(`[data-ip^="${cssEscape(p)}"]`));

    return lines.join('\n');
  }

  /* ===== 루트 내 쿼리 유틸 ===== */
  const qAllInRoots = (selector) => {
    const out = [];
    COMMENT_ROOTS.forEach(rootSel => {
      document.querySelectorAll(rootSel).forEach(root => {
        root.querySelectorAll(selector).forEach(n => out.push(n));
      });
    });
    return out;
  };

  /* ===== 댓글 본문 탐색 ===== */
  function findCommentBody(container){
    return (
      container.querySelector('.cmt_txtbox') ||
      container.querySelector('.comment_box') ||
      container.querySelector('.cmt_txt') ||
      container.querySelector('.ub-word') ||
      container.querySelector('.usertxt') ||
      null
    );
  }
  function findBodyFromInfo(infoEl){
    let p = infoEl.parentElement;
    let cand = findCommentBody(p||infoEl);
    if (cand) return cand;

    let sib = infoEl.nextElementSibling;
    for (let i=0; i<3 && sib; i++, sib = sib.nextElementSibling){
      if (sib.matches?.('.cmt_txtbox, .comment_box, .cmt_txt, .ub-word, .usertxt')) return sib;
      const inner = sib.querySelector?.('.cmt_txtbox, .comment_box, .cmt_txt, .ub-word, .usertxt');
      if (inner) return inner;
    }
    return null;
  }

  function getCommentItems(){
    const items = [];

    // 1) 표준/이미지댓글 공통: li.ub-content 안에서 수집
    qAllInRoots('.cmt_list li.ub-content').forEach(li => {
      const writer = li.querySelector('.gall_writer'); if(!writer) return;
      const body = findCommentBody(li) || findBodyFromInfo(li.querySelector('.cmt_info')||li);
      if (!body) return;
      items.push({ container: li, writer, body });
    });

    // 2) li 밖에 독립적으로 놓인 .cmt_info (이미지 댓글에서 자주 등장)
    qAllInRoots('.cmt_info').forEach(info => {
      if (info.closest('li.ub-content')) return; // 1)에서 처리됨
      const writer = info.querySelector('.gall_writer'); if(!writer) return;
      const body = findBodyFromInfo(info); if(!body) return;
      items.push({ container: info, writer, body });
    });

    return items;
  }

  /* ===== 사용자 차단 마스킹 ===== */
  function maskBlocked(item, masked){
    const { container, body } = item;
    if (masked){
      if (!body.dataset.dcbOriginal) body.dataset.dcbOriginal = body.innerHTML;
      body.innerHTML = `<span class="dcb-label">차단된 댓글입니다</span>`;
      container.classList.add('dcb-masked');
    }else{
      if (container.classList.contains('dcb-masked') && body.dataset.dcbOriginal){
        body.innerHTML = body.dataset.dcbOriginal; delete body.dataset.dcbOriginal;
      }
      container.classList.remove('dcb-masked');
    }
  }

  function applyUserBlock(tokens){
    const isIp = t => /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(t);
    const items = getCommentItems();
    if (!tokens.length){ items.forEach(i=>maskBlocked(i,false)); return; }
    items.forEach(item=>{
      const w = item.writer;
      const uid = w.getAttribute('data-uid') || '';
      const ip  = w.getAttribute('data-ip')  || '';
      let masked = false;
      for (const t of tokens){
        if (isIp(t)) { if (ip && ip.startsWith(t)) { masked = true; break; } }
        else         { if (uid && uid === t)      { masked = true; break; } }
      }
      maskBlocked(item, masked);
    });
  }

  /* ===== 도배(반복) 감지 (다국어 대응) ===== */
  // 기준값(필요시 변경 가능)
  const LINE_REPEAT_THRESHOLD = 3;  // 같은 줄이 3회 이상 반복
  const CHAR_RUN_THRESHOLD    = 30; // 동일문자 30연속
  const LAUGH_SUM_THRESHOLD   = 24; // ㅋㅋ/ㅎㅎ/ww/笑/草/哈/呵 등 누적 24자 이상

  function normalizeHtmlToLines(html){
    return html.split(/<br\s*\/?>|[\r\n]+/ig)
               .map(s => s.replace(/<[^>]+>/g,'').trim())
               .filter(Boolean);
  }

  function countMaxDuplicate(lines){
    const cnt = Object.create(null);
    let max = 0;
    for (const ln of lines){
      const key = ln.toLowerCase(); // 케이스 무시
      max = Math.max(max, (cnt[key] = (cnt[key]||0)+1));
    }
    return max;
  }

  function laughScore(text){
    // 한/일/중/영 “웃음”/연장 기호 계열
    // ㅋ,ㅎ,ㅠ,ㅜ, w/W, 笑, 草, 哈, 呵, 泣 같은 흔한 감탄/웃음류를 포함
    const m = text.match(/[ㅋㅎㅠㅜwW笑草哈呵泣]+/gu);
    if (!m) return 0;
    return m.join('').length;
  }

  function looksSpammy(bodyEl){
    const html = bodyEl.innerHTML || '';
    const text = (bodyEl.textContent || '').replace(/\u200b/g,'').trim();
    if (!text) return false;

    // 1) 같은 줄 반복
    const lines = normalizeHtmlToLines(html);
    if (lines.length >= LINE_REPEAT_THRESHOLD && countMaxDuplicate(lines) >= LINE_REPEAT_THRESHOLD)
      return true;

    // 2) 동일 문자 장문 반복 (모든 언어의 비공백 문자)
    if (/([^\s])\1{29,}/u.test(text)) return true;

    // 3) 웃음/감탄류 누적 과다
    if (laughScore(text) >= LAUGH_SUM_THRESHOLD) return true;

    return false;
  }

  function maskSpam(item, masked){
    const { container, body } = item;
    if (masked){
      if (!body.dataset.dcbOriginal) body.dataset.dcbOriginal = body.innerHTML;
      body.innerHTML = `<span class="dcb-label">도배된 댓글입니다</span>`;
      container.classList.add('dcb-spammed');
    }else{
      if (container.classList.contains('dcb-spammed') && body.dataset.dcbOriginal){
        body.innerHTML = body.dataset.dcbOriginal; delete body.dataset.dcbOriginal;
      }
      container.classList.remove('dcb-spammed');
    }
  }

  function applySpam(enabled){
    const items = getCommentItems();
    if (!enabled){
      // 스팸만 복원(사용자 차단 dcb-masked 는 유지)
      items.forEach(item => { if (item.container.classList.contains('dcb-spammed')) maskSpam(item,false); });
      return;
    }
    items.forEach(item => {
      if (item.container.classList.contains('dcb-masked')) return; // 사용자 차단이 우선
      maskSpam(item, looksSpammy(item.body));
    });
  }

  /* ===== 전체 적용 ===== */
  function apply(){
    chrome.storage.sync.get(DEFAULTS, raw=>{
      const conf = migrate(raw);
      ensureStyle().textContent = buildCss(conf);

      // 1) 사용자 차단
      if (!conf.userBlockEnabled){
        applyUserBlock([]);            // 모두 복원
      } else {
        const tokens = (conf.blockedUids||[]).map(s=>String(s).trim()).filter(Boolean);
        applyUserBlock(tokens);
      }

      // 2) 도배 차단(다국어)
      applySpam(!!conf.spamBlockEnabled);
    });
  }

  // 초기 적용
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once:true });
  } else {
    apply();
  }

  // 동적 로딩 대응 (이미지댓글 페이징/새로고침 포함)
  const mo = new MutationObserver(() => apply());
  const startMO = () => {
    if (document.body) mo.observe(document.body, { childList:true, subtree:true });
    else document.addEventListener('DOMContentLoaded', startMO, { once:true });
  };
  startMO();

  // 설정 변경 즉시 반영
  chrome.storage.onChanged.addListener((changes, area)=>{
    if (area !== 'sync') return;
    if (
      changes.userBlockEnabled || changes.blockedUids ||
      changes.includeGray || changes.hideDCGray ||
      changes.spamBlockEnabled
    ){
      apply();
    }
  });
})();
