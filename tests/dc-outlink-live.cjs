// Explicit live smoke check. Uses only isolated browser profiles, public pages
// and the real DC OutLink handler; no login credentials are accessed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { createHash } = require("node:crypto");
const { chromium, firefox } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results", "dc-outlink-live");
fs.mkdirSync(output, { recursive: true });
const urls = [
  "https://gall.dcinside.com/board/lists/?id=programming",
  "https://gall.dcinside.com/mgallery/board/lists/?id=indiegame",
  "https://gall.dcinside.com/mini/board/lists/?id=golf",
  "https://gall.dcinside.com/person/board/lists/?id=iu"
];
const probe = () => {
  if (!window.OutLink?.renderOutLinkWarning) throw Error("No OutLink handler");
  document.getElementById("dcb-outlink-probe-root")?.remove();
  const box = document.createElement("div");
  box.id = "dcb-outlink-probe-root";
  box.style.cssText = "position:fixed;left:20px;top:20px;z-index:2147483647;background:white;padding:20px";
  const anchor = document.createElement("a");
  anchor.id = "dcb-outlink-probe";
  anchor.href = "https://example.com/?dcb-outlink-check";
  anchor.target = "_blank";
  anchor.textContent = "DCB external-link smoke test";
  box.append(anchor); document.body.append(box);
  OutLink.renderOutLinkWarning("#dcb-outlink-probe-root");
  return true;
};

async function chromiumCheck() {
  const baselineBrowser = await chromium.launch({ headless: true });
  try {
    const page = await baselineBrowser.newPage();
    await page.goto(urls[0], { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.OutLink?.toggleWarning);
    await page.evaluate(() => { localStorage.removeItem("outlink_warning"); OutLink.applyWarningCheckboxState(); });
    await page.evaluate(probe);
    await page.locator("#dcb-outlink-probe").click();
    await page.waitForSelector("#outlink_warning_layer");
    await page.screenshot({ path: path.join(output, "chromium-baseline-warning.png") });
  } finally { await baselineBrowser.close(); }
  const context = await chromium.launchPersistentContext("", {
    headless: true,
    executablePath: chromium.executablePath(),
    args: ["--load-extension=" + root, "--disable-extensions-except=" + root]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    assert.ok(worker.url().includes("chrome-extension://"));
    const page = await context.newPage();
    const rows = [];
    for (const url of urls) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.dcbOutlinkState === "off");
      await page.evaluate(() => { const c=document.getElementById("chk_outlink"); c.checked=true; OutLink.toggleWarning(c); });
      assert.equal(await page.locator("#chk_outlink").isChecked(), false);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.dcbOutlinkState === "off");
      await page.evaluate(probe);
      const opened = context.waitForEvent("page");
      await page.locator("#dcb-outlink-probe").click();
      const popup = await opened;
      await popup.waitForLoadState("domcontentloaded");
      assert.ok(popup.url().startsWith("https://example.com/"));
      assert.equal(await page.locator("#outlink_warning_layer").count(), 0);
      rows.push({ url, state: await page.evaluate(() => document.documentElement.dataset.dcbOutlinkState), destination: popup.url(), checked: await page.locator("#chk_outlink").isChecked() });
      await popup.close();
    }
    await page.screenshot({ path: path.join(output, "chromium-off.png") });
    return { engine: "Chromium", installed: true, baselineWarning: true, rows };
  } finally { await context.close(); }
}

async function firefoxCheck() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dcb-outlink-live-"));
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const child = spawn(firefox.executablePath(), ["-headless", "-no-remote", "-profile", profile, "--remote-debugging-port", String(port), "about:blank"], { windowsHide: true, stdio: "ignore" });
  let ws, sequence = 0;
  const pending = new Map();
  const closed = new Promise(resolve => child.once("exit", resolve));
  try {
    for (let i = 0; i < 100; i++) {
      try { ws = new WebSocket("ws://127.0.0.1:" + port + "/session"); await new Promise((r,j) => { ws.onopen=r; ws.onerror=j; }); break; }
      catch { await delay(100); }
    }
    assert.ok(ws?.readyState === 1, "Firefox BiDi connected");
    ws.onmessage = event => { const m=JSON.parse(event.data); pending.get(m.id)?.(m); pending.delete(m.id); };
    const command = (method, params) => new Promise((resolve,reject) => {
      const id=++sequence, timer=setTimeout(() => { pending.delete(id); reject(Error(method+" timeout")); },30000);
      pending.set(id,m => { clearTimeout(timer); m.error?reject(Error(m.message)):resolve(m.result); });
      ws.send(JSON.stringify({id,method,params}));
    });
    await command("session.new", { capabilities: { alwaysMatch: {} } });
    const tab = (await command("browsingContext.getTree", {})).contexts[0];
    assert.ok(tab, "Firefox initial tab exists");
    const evaluate = async expression => {
      const r = await command("script.evaluate", { target:{context:tab.context}, expression, awaitPromise:true });
      if(r.exceptionDetails)throw Error(r.exceptionDetails.text);
      return r.result?.value;
    };
    const waitFor = async expression => { for(let i=0;i<100;i++){ if(await evaluate(expression))return; await delay(100); } throw Error("Firefox wait failed: "+expression); };
    // First verify the live site's warning in the same isolated profile before
    // installing the extension; no user settings are involved.
    await command("browsingContext.navigate", {context:tab.context,url:urls[0],wait:"interactive"});
    await waitFor("!!window.OutLink?.toggleWarning");
    await evaluate("localStorage.removeItem('outlink_warning');OutLink.applyWarningCheckboxState();("+probe.toString()+")()");
    await evaluate("document.getElementById('dcb-outlink-probe').click()");
    await waitFor("!!document.getElementById('outlink_warning_layer')");
    const baselineScreenshot = await command("browsingContext.captureScreenshot", {context:tab.context});
    fs.writeFileSync(path.join(output,"firefox-baseline-warning.png"),Buffer.from(baselineScreenshot.data,"base64"));
    await command("webExtension.install", {extensionData:{type:"path",path:root}});
    const rows=[];
    for(const url of urls){
      await command("browsingContext.navigate", {context:tab.context,url,wait:"interactive"});
      await waitFor("document.documentElement.dataset.dcbOutlinkState==='off'");
      await evaluate("document.getElementById('chk_outlink').checked=true;OutLink.toggleWarning(document.getElementById('chk_outlink'))");
      assert.equal(await evaluate("document.getElementById('chk_outlink').checked"),false);
      await command("browsingContext.reload",{context:tab.context,wait:"interactive"});
      await waitFor("document.documentElement.dataset.dcbOutlinkState==='off'");
      await evaluate("("+probe.toString()+")()");
      const before = new Set((await command("browsingContext.getTree",{})).contexts.map(c=>c.context));
      const rect = await evaluate("JSON.stringify((()=>{const r=document.getElementById('dcb-outlink-probe').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})())");
      const position=JSON.parse(rect);
      await command("input.performActions",{context:tab.context,actions:[{type:"pointer",id:"mouse",parameters:{pointerType:"mouse"},actions:[{type:"pointerMove",x:position.x,y:position.y},{type:"pointerDown",button:0},{type:"pointerUp",button:0}]}]});
      let opened;
      for(let i=0;i<100;i++){opened=(await command("browsingContext.getTree",{})).contexts.find(c=>!before.has(c.context)&&c.url.startsWith("https://example.com/"));if(opened)break;await delay(100);}
      assert.ok(opened,"External destination opened");
      assert.equal(await evaluate("!!document.getElementById('outlink_warning_layer')"),false);
      rows.push({url,state:await evaluate("document.documentElement.dataset.dcbOutlinkState"),destination:opened.url,checked:await evaluate("document.getElementById('chk_outlink').checked")});
      await command("browsingContext.close",{context:opened.context});
    }
    const screenshot=await command("browsingContext.captureScreenshot",{context:tab.context});
    fs.writeFileSync(path.join(output,"firefox-off.png"),Buffer.from(screenshot.data,"base64"));
    await command("browser.close",{});
    return {engine:"Firefox",installed:true,baselineWarning:true,rows};
  } finally {
    ws?.close(); if(child.exitCode===null)child.kill(); await closed;
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:150});
  }
}

(async () => {
  const scriptUrl="https://gall.dcinside.com/_js/minify/head_scripts_combined.min.js?v=1794465317";
  const bytes=Buffer.from(await(await fetch(scriptUrl)).arrayBuffer());
  const result={at:new Date().toISOString(),scriptUrl,sha256:createHash("sha256").update(bytes).digest("hex"),checks:[]};
  try {
    if(process.env.DCB_OUTLINK_LIVE_ENGINE!=="firefox")result.checks.push(await chromiumCheck());
    if(process.env.DCB_OUTLINK_LIVE_ENGINE!=="chromium")result.checks.push(await firefoxCheck());
  }
  finally { fs.writeFileSync(path.join(output,"result.json"),JSON.stringify(result,null,2)); }
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
