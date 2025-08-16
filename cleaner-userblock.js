/*****************************************************************
 * cleaner-userblock.js
 *****************************************************************/

(() => {
  const STYLE_ID = 'dcb-userblock-style';

  // 기본값: DC 회색처리 숨김 ON, 사용자 차단 목록 비어 있음
  const DEFAULTS = {
    hideDCGray: true,            // gall.dcinside.com##.block-disable 
    blockedUids: []              // 예: ['my0j4zrxn648', 'dfsss']
  };

  // 차단 CSS 생성
  function buildCss({ hideDCGray, blockedUids }) {
    const lines = [];

    // 1) DC 시스템 차단(회색) 요소 전역 숨김
    //    uBO 필터 "gall.dcinside.com##.block-disable"와 동일한 효과
    if (hideDCGray) {
      lines.push('.block-disable{display:none!important}');
    }

    // 2) 사용자 UID별 숨김 (글 목록/댓글/뷰 페이지)
    // - 공통 컨테이너 후보: li.ub-content, tr.ub-content (디시가 자주 쓰는 것.)
    // - 댓글: ul.cmt_list > li.ub-content
    // - 뷰 페이지 본문/댓글: #container 내부에서 작성자 UID가 매칭되면 본문/댓글 블럭 숨김
    const containers = [
      'li.ub-content',
      'tr.ub-content',
      '.ub-content'
    ];

    blockedUids.forEach((raw) => {
      const uid = String(raw || '').trim();
      if (!uid) return;

      // 목록/댓글: "컨테이너 :has(.gall_writer[data-uid=\"UID\"])"
      containers.forEach(c =>
        lines.push(`${c}:has(.gall_writer[data-uid="${cssEscape(uid)}"]){display:none!important}`)
      );

      // 뷰 페이지: 작성자가 차단 UID면 본문/댓글 감춤
      lines.push(
        `#container:has(.gall_writer[data-uid="${cssEscape(uid)}"]) .view_content_wrap{display:none!important}`,
        `#container:has(.gall_writer[data-uid="${cssEscape(uid)}"]) #focus_cmt{display:none!important}`
      );
    });

    return lines.join('');
  }

  // 간단한 CSS attribute 값 이스케이프
  function cssEscape(s) {
    // 큰따옴표/역슬래시만 처리 (속성 선택자에서 안전)
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

  function apply() {
    chrome.storage.sync.get(DEFAULTS, (conf) => {
      const styleEl = ensureStyle();
      styleEl.textContent = buildCss(conf);
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
    if (changes.hideDCGray || changes.blockedUids) apply();
  });
})();
