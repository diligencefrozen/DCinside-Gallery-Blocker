/*****************************************************************
 * cleaner-comment.js 
 *****************************************************************/
(() => {
  const SEL       = 'div#focus_cmt.view_comment[tabindex]';
  const STYLE_ID  = 'dcb-hide-comment-style';
  const CSS_RULE  = `${SEL}{display:none !important}`;

  let styleNode = null;

  /** 스타일 노드를 삽입해 댓글을 숨김 */
  function addStyle() {
    if (styleNode) return;          // 이미 있음
    styleNode          = document.createElement('style');
    styleNode.id       = STYLE_ID;
    styleNode.textContent = CSS_RULE;
    (document.head || document.documentElement).appendChild(styleNode);
  }

  /** 스타일 노드를 제거해 댓글을 다시 표시 */
  function removeStyle() {
    if (!styleNode) styleNode = document.getElementById(STYLE_ID);
    if (styleNode)   styleNode.remove();
    styleNode = null;
  }

  /** 현재 설정값(hideComment)에 맞춰 적용 */
  function apply(hide) {
    hide ? addStyle() : removeStyle();
  }

  /* 초기 적용 */
  chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
    apply(hideComment);
  });

  /* 팝업 토글 등 설정 변경 실시간 반영 */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.hideComment) {
      apply(changes.hideComment.newValue);
    }
  });
})();
