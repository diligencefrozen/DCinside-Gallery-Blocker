// Keep the site's column widths and reserve room for the right sidebar.
(() => {
  const cache = globalThis.DCBRuntimeSettingsCache;
  const key = "contentCenteringEnabled";
  let sheet;
  function apply(enabled) {
    if (enabled !== true) {
      sheet?.remove();
      sheet = null;
      return;
    }
    if (sheet?.isConnected) return;
    sheet = document.createElement("style");
    sheet.textContent = `
      #top:is(.list_wrap,.view_wrap) > .wrap_inner:has(> #container) {
        width: auto;
        --dcb-board-width: 1050px;
        --dcb-reading-width: 728px;
        --dcb-visible-width: min(100%, 100vw);
      }
      #top.width1160 > .wrap_inner:has(> #container) {
        --dcb-board-width: 1160px;
        --dcb-reading-width: 840px;
      }
      #top.width1160.view_wrap > .wrap_inner:has(> #container .writing_view_box) {
        --dcb-reading-width: 900px;
      }
      #top:is(.list_wrap,.view_wrap) > .wrap_inner > #container {
        margin-inline-start: max(0px, min(calc((var(--dcb-visible-width) - var(--dcb-reading-width)) / 2), calc(var(--dcb-visible-width) - var(--dcb-board-width))));
        margin-inline-end: auto;
      }
    `;
    (document.head || document.documentElement).append(sheet);
  }
  cache.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[key]) apply(changes[key].newValue);
  });
  cache.get({ [key]: false }, values => apply(values[key]));
})();
