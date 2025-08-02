/*****************************************************************
 * cleaner-comment.js 
 *****************************************************************/
(() => {
  const SELS = [
    'div#focus_cmt.view_comment[tabindex]',
    'span.reply_num'
  ];
  const STYLE_ID = 'dcb-hide-comment-style';
  const CSS_RULE = `${SELS.join(',')}{display:none !important}`;

  let styleNode = null;

  const addStyle    = () => {
    if (styleNode) return;
    styleNode = document.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.textContent = CSS_RULE;
    (document.head || document.documentElement).appendChild(styleNode);
  };
  const removeStyle = () => {
    if (!styleNode) styleNode = document.getElementById(STYLE_ID);
    if (styleNode)   styleNode.remove();
    styleNode = null;
  };

  const apply = hide => hide ? addStyle() : removeStyle();

  chrome.storage.sync.get({ hideComment: false }, ({ hideComment }) => {
    apply(hideComment);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.hideComment) {
      apply(changes.hideComment.newValue);
    }
  });
})();
