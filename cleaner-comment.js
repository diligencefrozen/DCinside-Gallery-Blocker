/*****************************************************************
 * cleaner-comment.js 
 *****************************************************************/
(() => {
  const SEL      = 'div#focus_cmt.view_comment[tabindex]';
  const STYLE_ID = 'dcb-hide-comment-style';
  const CSS      = `${SEL}{display:none!important}`;

  /** <style> 주입 ― 존재하지 않으면 새로 삽입 */
  function ensureStyle() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  /** 이미 붙어 있는 댓글 노드 제거 */
  function purge() {
    document.querySelectorAll(SEL).forEach(el => el.remove());
  }

  /** DOM 변화를 감시해 댓글이 재삽입되면 곧바로 제거 */
  function watch() {
    new MutationObserver(() => purge())
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  /** 진입 지점 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureStyle(); purge(); watch();
    }, { once: true });
  } else {
    ensureStyle(); purge(); watch();
  }
})();
