// Resume a user-requested modified click after asynchronous activity checks.
// tabs.create avoids turning a verified Ctrl/middle click into a blocked popup.
(() => {
  function parse(value, kind) {
    try {
      if (typeof value !== "string" || value.length > 4096) return null;
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || url.hostname !== "gall.dcinside.com" ||
          !new RegExp("^/(?:mgallery/|mini/|person/)?board/" + kind + "/?$").test(url.pathname) ||
          !/^[a-z0-9_]{1,80}$/i.test(url.searchParams.get("id") || "")) return null;
      if (kind === "view" && !/^\d{1,20}$/.test(url.searchParams.get("no") || "")) return null;
      return url;
    } catch (_) { return null; }
  }
  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if (message?.type !== "dcb.activityOpen") return;
    const source = parse(sender?.url,"lists"), target = parse(message.url,"view");
    if (sender?.id !== chrome.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !source || !target) {
      reply({ok:false});return;
    }
    (async () => {
      const tab = await chrome.tabs.get(sender.tab.id), current = parse(tab.url,"lists");
      source.hash = "";
      if (current) current.hash = "";
      if (!current || current.href !== source.href) return {ok:false};
      if (message.newWindow === true) await chrome.windows.create({url:target.href,focused:true,incognito:tab.incognito===true});
      else await chrome.tabs.create({url:target.href,windowId:tab.windowId,openerTabId:tab.id,active:message.active!==false});
      return {ok:true};
    })().then(reply,()=>reply({ok:false}));
    return true;
  });
})();
