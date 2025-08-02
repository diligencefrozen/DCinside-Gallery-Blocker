/*****************************************************************
 * cleaner-comment.js 
 *****************************************************************/
(() => {
  const SEL       = 'div#focus_cmt.view_comment[tabindex]';
  const STYLE_ID  = 'dcb-hide-comment-style';
  const CSS_RULE  = `${SEL}{display:none !important}`;

  let styleNode = null;

  function addStyle() {
    if (styleNode) return;          // 이미 있음
    styleNode          = document.createElement('style');
    styleNode.id       = STYLE_ID;
    styleNode.textContent = CSS_RULE;
    (document.head || document.documentElement).appendChild(styleNode);
  }

  function removeStyle() {
    if (!styleNode) styleNode = document.getElementById(STYLE_ID);
    if (styleNode)   styleNode.remove();
    styleNode = null;
  }

  function apply(hide) {
    hide ? addStyle() : removeStyle();
  }

  chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
    apply(hideComment);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.hideComment) {
      apply(changes.hideComment.newValue);
    }
  });
})();
