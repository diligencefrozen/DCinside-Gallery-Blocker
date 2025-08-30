/*****************************************************************
 * cleaner-userblock.js  
 *****************************************************************/
(() => {
  const STYLE_ID = 'dcb-userblock-style';

  const DEFAULTS = {
    userBlockEnabled: true,   // 마스터 
    blockedUids: [],          // 예: ['my0j4zrxn648', '118.235']
    includeGray: true,        // .block-disable 숨김
    // 구버전 호환
    hideDCGray: undefined
  };

  const cssEscape = s => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const isIpToken = s => /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s||'').trim()); // 118.235 / 118.235.1 / 118.235.1.2

  function ensureStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  // 구키 → 신키 1회 이행
  function migrate(conf) {
    if (typeof conf.userBlockEnabled !== 'boolean' && typeof conf.hideDCGray === 'boolean') {
      conf.userBlockEnabled = conf.hideDCGray;
      chrome.storage.sync.set({ userBlockEnabled: conf.userBlockEnabled });
    }
    return conf;
  }

  function buildCss(conf) {
    const { userBlockEnabled, includeGray, blockedUids } = conf;
    if (!userBlockEnabled) return ''; // OFF면 비활성

    const lines = [];
    if (includeGray) lines.push('.block-disable{display:none!important}');

    // 댓글: 본문 숨기고 빨간 안내문으로 대체 (헤더/시간/작성자는 유지)
    lines.push(`
      #focus_cmt .cmt_list li.ub-content.dcb-masked .cmt_txtbox{display:none!important}
      #focus_cmt .cmt_list li.ub-content.dcb-masked .cmt_info::after{
        content:'차단된 댓글입니다';
        display:block; margin:6px 0 8px; padding:8px 10px;
        background:rgba(224,49,49,.08); color:#e03131; border-radius:6px;
        font-size:12px; line-height:1.4; font-weight:700;
        border:1px dashed rgba(224,49,49,.45);
      }
    `);

    // 차단 토큰 분류
    const uids = [];
    const ips  = [];
    (blockedUids || []).forEach(raw => {
      const token = String(raw || '').trim();
      if (!token) return;
      (isIpToken(token) ? ips : uids).push(token);
    });

    // 속성 조합으로 규칙 생성
    const addRulesForAttr = (attr) => {
      // 목록(리스트)은 통째로 숨김
      lines.push(
        `.gall_list tr.ub-content:has(.gall_writer${attr}){display:none!important}`,
        `.gall_list li.ub-content:has(.gall_writer${attr}){display:none!important}`
      );

      // 댓글: li 자체는 유지(위 CSS의 dcb-masked로 안내문 표시)
      lines.push(
        `#focus_cmt .cmt_list li.ub-content:has(.gall_writer${attr}){position:relative}`
      );

    };

    uids.forEach(u => addRulesForAttr(`[data-uid="${cssEscape(u)}"]`));
    ips .forEach(p => addRulesForAttr(`[data-ip^="${cssEscape(p)}"]`));

    return lines.join('\n');
  }

  // 댓글 li에 dcb-masked 클래스를 실제 부착(위 CSS가 확실히 적용되도록)
  function markMaskedComments(tokens) {
    if (!tokens.length) return;
    const isIp = t => /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(t);

    document.querySelectorAll('#focus_cmt .cmt_list li.ub-content').forEach(li => {
      const writer = li.querySelector('.gall_writer');
      if (!writer) return;
      const uid = writer.getAttribute('data-uid') || '';
      const ip  = writer.getAttribute('data-ip')  || '';
      let masked = false;

      for (const t of tokens) {
        if (isIp(t)) { if (ip && ip.startsWith(t)) { masked = true; break; } }
        else         { if (uid && uid === t)      { masked = true; break; } }
      }
      li.classList.toggle('dcb-masked', masked);
    });
  }

  function apply() {
    chrome.storage.sync.get(DEFAULTS, raw => {
      const conf = migrate(raw);
      ensureStyle().textContent = buildCss(conf);

      if (!conf.userBlockEnabled) return;
      const tokens = (conf.blockedUids || []).map(s => String(s).trim()).filter(Boolean);
      markMaskedComments(tokens);
    });
  }

  // 초기 적용
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }

  // 동적 로딩 대응
  const mo = new MutationObserver(() => apply());
  const startMO = () => {
    if (document.body) mo.observe(document.body, { childList:true, subtree:true });
    else document.addEventListener('DOMContentLoaded', startMO, { once:true });
  };
  startMO();

  // 설정 변경 즉시 반영
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.userBlockEnabled || changes.blockedUids || changes.includeGray || changes.hideDCGray) {
      apply();
    }
  });
})();
