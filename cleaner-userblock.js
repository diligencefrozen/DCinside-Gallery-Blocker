/*****************************************************************
 * cleaner-userblock.js 
 *****************************************************************/
(() => {
  const STYLE_ID = 'dcb-userblock-style';

  const DEFAULTS = {
    userBlockEnabled: true,   // 마스터 토글
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
    if (!userBlockEnabled) return ''; // OFF면 완전 무효화

    const uids = [];
    const ips  = [];

    (blockedUids || []).forEach(raw => {
      const token = String(raw || '').trim();
      if (!token) return;
      (isIpToken(token) ? ips : uids).push(token);
    });

    const lines = [];

    // 1) 시스템 회색처리 숨김
    if (includeGray) lines.push('.block-disable{display:none!important}');

    // 2) 회원 UID 차단
    uids.forEach(uid => {
      const u = cssEscape(uid);
      // 목록/댓글 아이템 컨테이너 숨김
      CONTAINERS.forEach(c =>
        lines.push(`${c}:has(.gall_writer[data-uid="${u}"]){display:none!important}`)
      );
      // 뷰 페이지(본문/댓글) 숨김
      lines.push(
        `#container:has(.gall_writer[data-uid="${u}"]) .view_content_wrap{display:none!important}`,
        `#container:has(.gall_writer[data-uid="${u}"]) #focus_cmt{display:none!important}`
      );
    });

    // 3) 비회원 IP 프리픽스 차단 (data-ip^="118.235")
    ips.forEach(prefix => {
      const p = cssEscape(prefix);
      CONTAINERS.forEach(c =>
        lines.push(`${c}:has(.gall_writer[data-ip^="${p}"]){display:none!important}`)
      );
      lines.push(
        `#container:has(.gall_writer[data-ip^="${p}"]) .view_content_wrap{display:none!important}`,
        `#container:has(.gall_writer[data-ip^="${p}"]) #focus_cmt{display:none!important}`
      );
    });

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
