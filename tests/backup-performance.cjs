// Opt-in isolated MV3 profile. The user's backup stays outside the repository.
// DCB_BACKUP_PATH=<file> node tests/backup-performance.cjs [--groups]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const extension = process.env.DCB_EXTENSION_ROOT || root;
const input = process.env.DCB_BACKUP_PATH;
const label = process.env.DCB_PROFILE_LABEL || 'backup';
assert.ok(input, 'Set DCB_BACKUP_PATH to the backup being measured');
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const backup = require('./helpers/synthetic-profile-backup.cjs')(JSON.parse(fs.readFileSync(input, 'utf8')));
const expected = Object.entries(backup.storage.sync).filter(([, value]) => typeof value === 'boolean');
for (const key of ['dcbImageAccountRules', 'dcbTextDetection']) {
  for (const [field, value] of Object.entries(backup.storage.sync[key] || {})) {
    if (typeof value === 'boolean') expected.push([key + '.' + field, value]);
  }
}
const results = [], requests = { activity: 0, other: 0 };
const fixtureUrl = 'https://gall.dcinside.com/board/view/?id=dcbperf_fixture&no=1';
const writer = i => `<span class="gall_writer ub-writer" data-uid="profilefixture${i}" data-nick="Author ${i}" data-ip="175.124"><span class="nickname"><em>Author ${i}</em></span><span class="ip">(175.124)</span></span>`;
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Backup performance</title><style>
body{font:14px Arial;margin:20px}.gallview_head{padding:12px}.write_div{line-height:1.8}
.cmt_info{display:flex;border-bottom:1px solid #ddd;padding:10px;min-height:65px}
.cmt_nickbox{width:152px;flex-shrink:0;margin-right:30px}.cmt_txtbox{width:800px;min-width:0}
.usertxt{line-height:1.7;margin:0}
</style></head><body><div class="gallview_head"><h3 class="title_subject">Backup performance</h3>${writer(0)}</div>
<div class="write_div"><p>Public fixture article body. ${'Ordinary content. '.repeat(25)}</p></div>
<div class="view_comment"><div id="comment_wrap_1" class="comment_wrap"><ul class="cmt_list">
${Array.from({ length: 500 }, (_, i) => `<li class="ub-content" id="comment_li_${i + 1}" data-no="${i + 1}"><div class="cmt_info" data-no="${i + 1}"><div class="cmt_nickbox">${writer(i + 1)}</div><div class="cmt_txtbox"><p class="usertxt ub-word">A calm fixture comment number ${i + 1}. ${'Ordinary content. '.repeat(8)}</p></div></div></li>`).join('')}
</ul></div></div></body></html>`;

async function sample(context, page, phase, scroll = false) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const before = await metrics();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  try {
    const stats = await page.evaluate(async scroll => {
      let mutations = 0;
      const frames = [], longTasks = [];
      const observer = new MutationObserver(records => { mutations += records.length; });
      observer.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
      const performanceObserver = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => e.duration)));
      performanceObserver.observe({ type: 'longtask' });
      const start = performance.now();
      const initialTop = window.scrollY;
      let previous = start;
      await new Promise(resolve => {
        function tick(now) {
          frames.push(now - previous);
          previous = now;
          if (scroll) window.scrollBy(0, 18);
          if (now - start < 2000) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      observer.disconnect();
      performanceObserver.disconnect();
      if (scroll) window.scrollTo(0, initialTop);
      frames.sort((a, b) => a - b);
      return { mutations, observedMs: Math.round(performance.now() - start), frames: frames.length, frameP95Ms: frames[Math.ceil(frames.length * .95) - 1],
        longTasks: longTasks.length, maxLongTaskMs: Math.max(0, ...longTasks),
        nodes: document.querySelectorAll('*').length,
        memoControls: document.querySelectorAll('.dcb-user-memo-trigger').length,
        detectionBadges: document.querySelectorAll('[data-dcb-text-detection-placeholder]').length };
    }, scroll);
    const after = await metrics();
    const row = { phase, ...stats, taskMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000),
      layoutMs: Math.round((after.LayoutDuration - before.LayoutDuration) * 1000),
      styleMs: Math.round((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000),
      requests: { ...requests } };
    results.push(row);
    console.log(JSON.stringify(row));
  } finally {
    const { profile } = await cdp.send('Profiler.stop');
    for (const node of profile.nodes) {
      try {
        const url = new URL(node.callFrame.url);
        node.callFrame.url = url.protocol === 'chrome-extension:' ? url.protocol + '//' + url.host + url.pathname
          : ['http:', 'https:'].includes(url.protocol) ? url.origin + url.pathname : '';
      }
      catch (_) { node.callFrame.url = ''; }
    }
    fs.writeFileSync(path.join(root, `test-results/${label}-${phase}.cpuprofile`), JSON.stringify(profile));
    await cdp.detach();
  }
}

(async () => {
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, 'test-results/backup-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1100, height: 850 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionOrigin = 'chrome-extension://' + new URL(worker.url()).hostname;
    await worker.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        const data = await chrome.storage.local.get('dcbSettingsBatchV1');
        if (data.dcbSettingsBatchV1?.phase === 'committed') return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Installation did not finish');
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.href === fixtureUrl) return route.fulfill({ contentType: 'text/html', body: fixture });
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.hostname === 'gallog.dcinside.com') requests.activity++;
      else requests.other++;
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    });
    const page = await context.newPage();
    await page.goto(fixtureUrl);
    await page.waitForTimeout(1500);
    await sample(context, page, 'default');
    const options = await context.newPage();
    await options.goto(extensionOrigin + '/src/ui/options/options.html');
    const imported = options.waitForEvent('dialog', { timeout: 20000 }).then(async dialog => {
      const success = dialog.message() === '백업을 불러왔습니다.';
      await dialog.accept();
      return success;
    });
    await options.locator('#importFile').setInputFiles({
      name: 'performance-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))
    });
    assert.equal(await imported, true, 'Backup must restore through the options UI');
    const mismatch = await worker.evaluate(async expected => {
      const current = await chrome.storage.sync.get([...new Set(expected.map(([key]) => key.split('.')[0]))]);
      return expected.filter(([key, value]) => key.split('.').reduce((data, part) => data?.[part], current) !== value).map(([key]) => key);
    }, expected);
    assert.deepEqual(mismatch, [], 'Explicit backup switches must be preserved');
    await options.close();
    await page.bringToFront();
    await page.waitForTimeout(800);
    await sample(context, page, 'restored-open-tab');
    await page.reload();
    await page.waitForTimeout(1500);
    await sample(context, page, 'restored-reload');
    await sample(context, page, 'restored-scroll', true);
    if (process.argv.includes('--groups')) {
      const sync = backup.storage.sync;
      for (const [name, off] of [
        ['without-ai', { dcbTextDetection: { ...sync.dcbTextDetection, enabled: false } }],
        ['without-account', { dcbImageAccountRules: { ...sync.dcbImageAccountRules, enabled: false } }],
        ['without-author-ui', { dcbApplyFontToDc: false, showUidBadge: false, showMemberIpInfo: false, userMemoEnabled: false }],
        ['without-keyword-hide', { keywordHideEnabled: false }]
      ]) {
        await worker.evaluate(patch => chrome.storage.sync.set(patch), { ...sync, ...off });
        await page.waitForTimeout(800);
        await sample(context, page, name);
      }
    }
    const status = await worker.evaluate(() => chrome.storage.session.get('dcbDetectionStatus'));
    const detection = status.dcbDetectionStatus;
    fs.writeFileSync(path.join(root, `test-results/${label}.json`), JSON.stringify({
      fixture: true, comments: 500, credentialMetadataOmitted: true, results,
      detectionState: detection?.state, enabledSwitches: expected.filter(([, value]) => value).map(([key]) => key)
    }, null, 2));
  } finally { await context.close(); }
})().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
