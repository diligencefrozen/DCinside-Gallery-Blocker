const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, firefox } = require("playwright");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/content/core/dc-outlink-off.js"), "utf8");

// Models the observed PC site's private cache and public setter, including a
// delayed initial read. A link really navigates unless the site's warning
// handler prevents it; the extension must not intercept that navigation.
const site = `<!doctype html><div id="settings" hidden><input type="checkbox" id="chk_outlink" checked onclick="OutLink.toggleWarning(this)"></div>
<a id="external" href="https://example.com/dcb-outlink-test" target="_blank">external</a>
<script>
localStorage.setItem('unrelated','keep'); window.writes=0; window.calls=0;
(function(){let cache=false, initialized=false;
function toggleWarning(el){ window.calls++; if(!initialized)return true; if(el.checked){localStorage.removeItem('outlink_warning'); cache=false;}else{localStorage.setItem('outlink_warning','N'); cache=true; window.writes++;}return true; }
function applyWarningCheckboxState(){const value=localStorage.getItem('outlink_warning');cache=value==='N';document.getElementById('chk_outlink').checked=!cache;}
function init(){initialized=true;applyWarningCheckboxState();}
window.siteStaleRead=()=>{cache=false;document.getElementById('chk_outlink').checked=true;};
window.OutLink={init,toggleWarning,applyWarningCheckboxState};OutLink.init();
document.addEventListener('click',e=>{if(e.target.id==='external'&&!cache){e.preventDefault();let n=document.createElement('div');n.id='outlink_warning_layer';document.body.append(n);}});
})();
</script>`;

for (const [name, engine] of [["Chromium", chromium], ["Firefox", firefox]]) {
  test(`${name}: force DC warning OFF, preserve navigation, repair site ON/reload/stale cache`, async t => {
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ content: source });
    await page.route("https://gall.dcinside.com/**", route => route.fulfill({ contentType: "text/html", body: site }));
    await page.route("https://example.com/**", route => route.fulfill({ contentType: "text/html", body: "arrived" }));
    await page.goto("https://gall.dcinside.com/board/view/?id=fixture&no=1");
    await page.waitForFunction(() => document.documentElement.dataset.dcbOutlinkState === "off");
    assert.equal(await page.locator("#settings").isVisible(), false, "no settings popup was opened");
    assert.equal(await page.locator("#chk_outlink").isChecked(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem("unrelated")), "keep");
    await page.evaluate(() => { document.getElementById("settings").hidden = false; });
    await page.locator("#chk_outlink").click();
    assert.equal(await page.locator("#chk_outlink").isChecked(), false);
    await page.evaluate(() => { document.getElementById("settings").hidden = true; });
    assert.equal(await page.evaluate(() => localStorage.getItem("outlink_warning")), "N");
    await page.evaluate(() => {
      localStorage.removeItem("outlink_warning");
      window.dispatchEvent(new StorageEvent("storage", { key: "outlink_warning", newValue: null }));
    });
    assert.equal(await page.evaluate(() => localStorage.getItem("outlink_warning")), "N");
    await page.evaluate(() => { siteStaleRead(); localStorage.removeItem("outlink_warning"); });
    const opened = context.waitForEvent("page");
    await page.locator("#external").click();
    const popup = await opened;
    await popup.waitForLoadState();
    assert.equal(popup.url(), "https://example.com/dcb-outlink-test");
    assert.equal(await page.locator("#outlink_warning_layer").count(), 0);
    await popup.close();
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.dcbOutlinkState === "off");
    assert.equal(await page.locator("#chk_outlink").isChecked(), false);
    // Re-injection, repeated same object assignment and benign DOM mutations
    // must not grow listeners, recursively wrap the setter or spin a loop.
    await page.evaluate(source);
    await page.evaluate(() => { OutLink=OutLink; for(let i=0;i<200;i++)document.body.append(document.createElement("i")); });
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => writes);
    await page.evaluate(() => OutLink.toggleWarning({checked:true}));
    assert.equal(await page.evaluate(() => writes), before + 1);
  });

  test(`${name}: unsupported host and inaccessible storage never report success`, async t => {
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.addInitScript({ content: source });
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><p>test</p>" }));
    await page.goto("https://example.com/");
    assert.equal(await page.evaluate(() => window.__DCB_OUTLINK_OFF__), undefined);
    await page.goto("https://gall.dcinside.com/test");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.dcbOutlinkState), "unsupported");
    await page.evaluate(() => {
      Object.defineProperty(window, "localStorage", { get() { throw Error("Storage denied"); } });
      OutLink={toggleWarning(){ throw Error("Storage denied"); }};
    });
    await page.waitForFunction(() => document.documentElement.dataset.dcbOutlinkState === "failed");
    assert.match(await page.evaluate(() => document.documentElement.dataset.dcbOutlinkReason), /Storage denied/);
  });
}

test("static MAIN entry covers the verified PC host in Chrome and Firefox", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const entry = manifest.content_scripts.find(item => item.js.includes("src/content/core/dc-outlink-off.js"));
  assert.deepEqual(entry.matches, ["*://gall.dcinside.com/*"]);
  assert.equal(entry.run_at, "document_start");
  assert.equal(entry.world, "MAIN");
  assert.equal(entry.all_frames, false);
  assert.doesNotMatch(source, /document\.cookie|fetch\(|XMLHttpRequest|preventDefault\(|stopPropagation\(/);
});
