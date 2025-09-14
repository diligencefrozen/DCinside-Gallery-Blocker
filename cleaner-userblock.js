/*****************************************************************
 * cleaner-userblock.js 
 *****************************************************************/
(() => {
  const STYLE_ID = 'dcb-userblock-style';

  const DEFAULTS = {
    // 사용자 차단
    userBlockEnabled: true,
    blockedUids: [],          // ['회원UID', '118.235' 같은 IP 프리픽스]
    includeGray: true,        // .block-disable 숨김
    hideDCGray: undefined,    // 구버전 호환

    // 도배(반복/중복) 차단
    spamBlockEnabled: true,   // OFF면 도배 감지/차단 전혀 안 함
  };

  /* 댓글 루트 (#focus_cmt + 이미지댓글 .comment_wrap) */
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

    /* 안내 (차단/도배 공통) */
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

    // 1) 표준/이미지댓글 공통: li.ub-content 내부
    qAllInRoots('.cmt_list li.ub-content').forEach(li => {
      const writer = li.querySelector('.gall_writer'); if(!writer) return;
      const body = findCommentBody(li) || findBodyFromInfo(li.querySelector('.cmt_info')||li);
      if (!body) return;
      items.push({ container: li, writer, body });
    });

    // 2) li 밖에 독립적인 .cmt_info (이미지댓글 케이스)
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

  /* ===== 도배(반복/중복) 감지 ===== */
  // ① 한 댓글 내부 반복/문자런/웃음 누적 ② 서로 다른 댓글 간 “내용 중복(교차 중복)”
  const LINE_REPEAT_THRESHOLD = 3;   // 같은 줄 3회 이상
  const CHAR_RUN_THRESHOLD    = 30;  // 동일 문자 30연속
  const LAUGH_SUM_THRESHOLD   = 24;  // ㅋㅋ/ㅎㅎ/ww/笑/草/哈/呵 등 누적 24자+
  const DUP_MIN_CHARS         = 40;  // “교차 중복”으로 볼 최소 길이(문자 수)

  function normalizeHtmlToLines(html){
    return html.split(/<br\s*\/?>|[\r\n]+/ig)
               .map(s => s.replace(/<[^>]+>/g,'').trim())
               .filter(Boolean);
  }
  function countMaxDuplicate(lines){
    const cnt = Object.create(null);
    let max = 0;
    for (const ln of lines){
      const key = ln.toLowerCase();
      max = Math.max(max, (cnt[key] = (cnt[key]||0)+1));
    }
    return max;
  }
  function laughScore(text){
    const m = text.match(/[ㅋㅎㅠㅜwW笑草哈呵泣]+/gu);
    return m ? m.join('').length : 0;
  }
  function getOriginalPlainText(bodyEl){
    const srcHtml = bodyEl.dataset?.dcbOriginal || bodyEl.innerHTML || '';
    const text = srcHtml.replace(/<[^>]+>/g,' ').replace(/\u200b/g,'').trim();
    return text;
  }
  function normalizeForDup(text){
    return text
      .replace(/-+\s*dc\s*app\s*$/i,'') // “- dc App” 꼬리표 제거
      .replace(/\s+/g,' ')
      .trim()
      .toLowerCase();
  }

  function looksSpammySingle(bodyEl){
    const html = bodyEl.dataset?.dcbOriginal || bodyEl.innerHTML || '';
    const text = getOriginalPlainText(bodyEl);
    if (!text) return false;

    // 1) 같은 줄 반복
    const lines = normalizeHtmlToLines(html);
    if (lines.length >= LINE_REPEAT_THRESHOLD && countMaxDuplicate(lines) >= LINE_REPEAT_THRESHOLD)
      return true;

    // 2) 동일 문자 장문 반복
    if (/([^\s])\1{29,}/u.test(text)) return true;

    // 3) 웃음/감탄류 누적 과다
    if (laughScore(text) >= LAUGH_SUM_THRESHOLD) return true;

    return false;
  }

  function maskSpam(item, masked, label='도배된 댓글입니다'){
    const { container, body } = item;
    if (masked){
      if (!body.dataset.dcbOriginal) body.dataset.dcbOriginal = body.innerHTML;
      body.innerHTML = `<span class="dcb-label">${label}</span>`;
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

    // 스팸 OFF → 스팸만 복원(사용자 차단은 유지)
    if (!enabled){
      items.forEach(item => {
        if (item.container.classList.contains('dcb-spammed')) maskSpam(item,false);
      });
      return;
    }

    // 1) 한 댓글 내부 패턴(라인 반복/문자런/웃음 과다)
    items.forEach(item => {
      if (item.container.classList.contains('dcb-masked')) return; // 사용자 차단 우선
      const isSpam = looksSpammySingle(item.body);
      maskSpam(item, isSpam, '도배된 댓글입니다');
    });

    // 2) 서로 다른 댓글 간 “내용 중복” 탐지 (첫 1개만 남기고 2번째부터 마스킹)
    const seen = new Map(); // key -> count
    items.forEach(item => {
      if (item.container.classList.contains('dcb-masked')) return; // 사용자 차단 우선
      const plain = getOriginalPlainText(item.body);
      const key   = normalizeForDup(plain);
      if (!key || key.length < DUP_MIN_CHARS) return;

      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);

      if (n >= 2){ // 두 번째부터 도배 처리
        maskSpam(item, true, '도배 행위가 감지된 댓글입니다');
      } else {
        // 한 댓글 내부 규칙으로 막혀있었다면 풀어줌(첫 원본은 보이도록)
        if (item.container.classList.contains('dcb-spammed')) {
          maskSpam(item, false);
        }
      }
    });
  }

  /* ===== 전체 적용 ===== */
  function apply(){
    chrome.storage.sync.get(DEFAULTS, raw=>{
      const conf = migrate(raw);
      ensureStyle().textContent = buildCss(conf);
      
      // 1) 사용자 차단
      if (!conf.userBlockEnabled){
        applyUserBlock([]); // 모두 복원
      } else {
        const tokens = (conf.blockedUids||[]).map(s=>String(s).trim()).filter(Boolean);
        applyUserBlock(tokens);
      }
      
      // 2) 도배 차단은 "사용자 차단 ON"이어야 동작
      const spamEnabled = !!(conf.userBlockEnabled && conf.spamBlockEnabled);
      applySpam(spamEnabled);
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
