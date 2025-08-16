/*****************************************************************
 * cleaner-userblock.js
 *****************************************************************/
(() => {
  const STYLE_ID = 'dcb-userblock-style';

  const DEFAULTS = {
    userBlockEnabled: true,   // ← 마스터 
    blockedUids: [],          // 예: ['my0j4zrxn648', 'dfsss']
    includeGray: true,        // 회색(.block-disable)도 함께 숨김
    // 구버전 호환용(마이그레이션)
    hideDCGray: undefined
  };

  function cssEscape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

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
      conf.userBlockEnabled = conf.hideDCGray; // 예전 토글을 마스터로 승격
      chrome.storage.sync.set({ userBlockEnabled: conf.userBlockEnabled });
    }
    return conf;
  }

  function buildCss(conf) {
    const { userBlockEnabled, includeGray, blockedUids } = conf;
    if (!userBlockEnabled) return ''; // 🔒 OFF면 완전 무효화

    const lines = [];

    // 1) 시스템 회색처리 숨김
    if (includeGray) lines.push('.block-disable{display:none!important}');

    // 2) UID별 숨김 (목록/댓글/뷰)
    const containers = ['li.ub-content', 'tr.ub-content', '.ub-content'];

    (blockedUids || []).forEach(raw => {
      const uid = String(raw || '').trim();
      if (!uid) return;

      // 목록/댓글 컨테이너
      containers.forEach(c =>
        lines.push(`${c}:has(.gall_writer[data-uid="${cssEscape(uid)}"]){display:none!important}`)
      );

      // 뷰 페이지 본문/댓글
      lines.push(
        `#container:has(.gall_writer[data-uid="${cssEscape(uid)}"]) .view_content_wrap{display:none!important}`,
        `#container:has(.gall_writer[data-uid="${cssEscape(uid)}"]) #focus_cmt{display:none!important}`
      );
    });

    return lines.join('');
  }

  function apply() {
    chrome.storage.sync.get(DEFAULTS, (raw) => {
      const conf = migrate(raw);
      const css = buildCss(conf);
      const styleEl = ensureStyle();
      styleEl.textContent = css; // OFF면 빈 문자열 → 즉시 복원
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
    if (changes.userBlockEnabled || changes.blockedUids || changes.includeGray) apply();
  });
})();
