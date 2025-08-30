/*****************************************************************
 * cleaner-userblock.js  
 *****************************************************************/
(() => {
  const STYLE_ID = 'dcb-userblock-style';

  const DEFAULTS = {
    userBlockEnabled: true,   // 마스터 
    blockedUids: [],          // 예: ['my0j4zrxn648', '118.235'] 
    includeGray: true,        // 회색(.block-disable)도 함께 숨김
    // 구버전 호환(과거 hideDCGray → userBlockEnabled)
    hideDCGray: undefined
  };

  const CONTAINERS = ['li.ub-content','tr.ub-content','.ub-content'];

  const cssEscape = s => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const isIpToken = s => /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s||'').trim()); // '118.235', '118.235.1', '118.235.1.2' 등

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
    if (!userBlockEnabled) return ''; // OFF면 완전 비활성

    const lines = [];
    if (includeGray) lines.push('.block-disable{display:none!important}');

    const uids = [];
    const ips  = [];
    (blockedUids || []).forEach(raw => {
      const token = String(raw || '').trim();
      if (!token) return;
      (isIpToken(token) ? ips : uids).push(token);
    });

    const addRulesForAttr = (attr) => {
      // 1) 목록/리스트 항목 숨김 (글/댓글 미리보기 컨테이너)
      CONTAINERS.forEach(c =>
        lines.push(`${c}:has(.gall_writer${attr}){display:none!important}`)
      );

      // 2) 게시글 본문: "글쓴이"가 차단 대상일 때만 본문 숨김
      //    댓글 작성자 때문에 본문이 사라지지 않도록 컨테이너를 좁힘
      lines.push(`.view_content_wrap:has(.gall_writer${attr}){display:none!important}`);

      // 3) 댓글: 해당 작성자의 댓글 '항목'만 숨김
      lines.push(`#focus_cmt .cmt_list li.ub-content:has(.gall_writer${attr}){display:none!important}`);
    };

    uids.forEach(u => addRulesForAttr(`[data-uid="${cssEscape(u)}"]`));
    ips .forEach(p => addRulesForAttr(`[data-ip^="${cssEscape(p)}"]`));

    return lines.join('');
  }

  function apply() {
    chrome.storage.sync.get(DEFAULTS, raw => {
      const conf = migrate(raw);
      ensureStyle().textContent = buildCss(conf); // OFF면 빈 문자열 → 즉시 복원
    });
  }

  // 초기 적용
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }

  // 설정 변경 즉시 반영
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.userBlockEnabled || changes.blockedUids || changes.includeGray || changes.hideDCGray) {
      apply();
    }
  });
})();
