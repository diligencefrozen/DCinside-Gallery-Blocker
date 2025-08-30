/*****************************************************************
 * cleaner-userblock.js 
 *****************************************************************/
(() => {
  const STYLE_ID = 'dcb-userblock-style';

  const DEFAULTS = {
    userBlockEnabled: true,   // 마스터
    blockedUids: [],          // 예: ['my0j4zrxn648', '118.235']
    includeGray: true,        // 회색(.block-disable)도 숨김
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

    const uids = [];
    const ips  = [];
    (blockedUids || []).forEach(raw => {
      const token = String(raw || '').trim();
      if (!token) return;
      (isIpToken(token) ? ips : uids).push(token);
    });

    // 댓글 placeholder 공통 스타일
    lines.push(`
      /* 댓글 본문을 숨기고 안내문을 표시 (헤더/작성자/시간은 유지) */
      #focus_cmt .cmt_list li.ub-content.dcb-masked .cmt_txtbox{display:none!important}
      #focus_cmt .cmt_list li.ub-content.dcb-masked .cmt_info::after{
        content:'차단된 댓글';
        display:block; margin:6px 0 8px; padding:8px 10px;
        background:rgba(0,0,0,.06); color:#666; border-radius:6px;
        font-size:12px; line-height:1.4;
      }
    `);

    // 속성 조합으로 규칙 생성
    const addRulesForAttr = (attr) => {
      /* 1) 목록(리스트)은 완전히 제거 */
      lines.push(
        `.gall_list tr.ub-content:has(.gall_writer${attr}){display:none!important}`,
        `.gall_list li.ub-content:has(.gall_writer${attr}){display:none!important}`
      );

      /* 2) 게시글 본문: '글쓴이'가 차단 대상일 때만 본문 숨김
            (댓글 작성자 때문에 본문이 사라지지 않도록 범위를 .view_content_wrap 으로 제한) */
      lines.push(`.view_content_wrap:has(.gall_writer${attr}){display:none!important}`);

      /* 3) 댓글: 항목(li)은 남기고 본문만 숨김 + 안내문 표기 */
      lines.push(
        `#focus_cmt .cmt_list li.ub-content:has(.gall_writer${attr}){position:relative}`,
        `#focus_cmt .cmt_list li.ub-content:has(.gall_writer${attr}){/**/}`
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

  // 동적 로딩 댓글 대응
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
