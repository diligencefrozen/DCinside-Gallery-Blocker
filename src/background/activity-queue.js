/* Persist deadlines, never the page token. A visible gallery tab owns the
   request so the existing account signal budget and cookie checks still apply. */
(() => {
  const key = "dcbActivityPendingV1", alarm = "dcb-activity-recheck";
  const refresh = 6 * 3600000, retention = 48 * 3600000;
  let serial = Promise.resolve();
  const enqueue = task => {
    const result = serial.then(task);
    serial = result.catch(() => {});
    return result;
  };
  async function enabled() {
    const s = await chrome.storage.sync.get(["dcbShowWriterActivity", "dcbImageAccountRules"]);
    return s.dcbShowWriterActivity === true || s.dcbImageAccountRules?.enabled === true;
  }
  async function load() {
    const data = await chrome.storage.local.get(key);
    const now = Date.now();
    return new Map((data[key] || []).filter(e => e.lastSeen > now - retention).map(e => [e.uid, e]));
  }
  async function schedule(queue) {
    if (!queue.size) { await chrome.alarms.clear(alarm); return; }
    const next = Math.max(Date.now() + 30000, Array.from(queue.values()).reduce((time, entry) => Math.min(time, entry.next), Infinity));
    const current = await chrome.alarms.get(alarm);
    if (!current || current.scheduledTime > next) await chrome.alarms.create(alarm, { when: next });
  }
  async function register(uids, tabId) {
    if (!await enabled()) return;
    const queue = await load(), now = Date.now();
    const {dcbImageAccountSignalCache: cache = {}} = await chrome.storage.local.get("dcbImageAccountSignalCache");
    for (const raw of uids) {
      if (typeof raw !== "string" || !/^[a-z\d._-]{2,64}$/i.test(raw)) continue;
      const uid = raw.toLowerCase(), previous = queue.get(uid);
      const cached = Object.hasOwn(cache,uid) ? cache[uid] : null;
      const due = cached?.unavailable ? cached.expiresAt : Number(cached?.checkedAt) + refresh;
      queue.set(uid, { uid, tabId, lastSeen: now, next: Math.max(previous?.next || now, Number(due) || 0), attempts: previous?.attempts || 0 });
    }
    await chrome.storage.local.set({ [key]: [...queue.values()] });
    await schedule(queue);
  }
  async function wake() {
    if (!await enabled()) { await chrome.storage.local.remove(key); await chrome.alarms.clear(alarm); return; }
    const queue = await load(), now = Date.now();
    const due = [...queue.values()].filter(e => e.next <= now).sort((a,b) => a.next - b.next);
    if (!due.length) { await schedule(queue); return; }
    const tabs = await chrome.tabs.query({active:true, url:"https://gall.dcinside.com/*"});
    for (const tab of tabs) {
      const entry = due.find(e => e.tabId === tab.id) || due[0];
      let result;
      try { result = await chrome.tabs.sendMessage(tab.id, {type:"dcb.activityRecheck", uid:entry.uid}, {frameId:0}); }
      catch { continue; }
      if (!result || result.inactive) continue;
      entry.attempts = result.available ? 0 : Math.min(entry.attempts + 1, 6);
      const delay = result.available ? refresh : Math.min(refresh, 60000 * 2 ** entry.attempts) + Math.random() * 15000;
      entry.next = Math.max(Number(result.retryAt) || 0, (result.available ? result.checkedAt || now : now) + delay);
      if (["BUDGET","COOLDOWN","NO_TOKEN","HTTP_403","HTTP_429","HTTP_503"].includes(result.reason)) {
        for (const item of due) item.next = Math.max(item.next, entry.next);
      }
      await chrome.storage.local.set({ [key]: [...queue.values()] });
      await schedule(queue);
      return;
    }
    // No eligible tab. Registration or tab activation will rearm this deadline.
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type !== "dcb.activityCandidates" || !sender.tab?.id ||
        !sender.url?.startsWith("https://gall.dcinside.com/") || !Array.isArray(msg.uids)) return;
    enqueue(() => register(msg.uids, sender.tab.id)).then(() => reply({ok:true}), () => reply({ok:false}));
    return true;
  });
  chrome.alarms.onAlarm.addListener(a => { if (a.name === alarm) void enqueue(wake); });
  function resume() { void enqueue(async () => { const queue = await load(); if (queue.size) await schedule(queue); }); }
  chrome.runtime.onStartup?.addListener(resume);
  chrome.tabs.onActivated?.addListener(info => {
    chrome.tabs.get(info.tabId).then(tab => {
      if (tab.url?.startsWith("https://gall.dcinside.com/")) resume();
    }).catch(() => {});
  });
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "sync" && (changes.dcbShowWriterActivity || changes.dcbImageAccountRules)) {
      void enqueue(async () => {
        if (!await enabled()) { await chrome.storage.local.remove(key); await chrome.alarms.clear(alarm); }
      });
    }
  });
})();
