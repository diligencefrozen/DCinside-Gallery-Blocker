const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const bootstrapSource = fs.readFileSync(
  path.join(__dirname, '../src/content/core/critical-filter-bootstrap.js'),
  'utf8'
);

const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div id="sentinel">page body stays visible</div>
  <table class="gall_list"><tbody>
    <tr id="allowed" class="ub-content" data-no="1"><td class="gall_num">1</td><td class="gall_writer" data-uid="allowed"><span class="nickname">허용</span></td></tr>
    <tr id="uid" class="ub-content" data-no="2"><td class="gall_num">2</td><td class="gall_writer" data-uid="blocked-user"><span class="nickname">UID</span></td></tr>
    <tr id="ip" class="ub-content" data-no="3"><td class="gall_num">3</td><td class="gall_writer" data-ip="118.235.12.1"><span class="nickname">IP</span></td></tr>
    <tr id="nick" class="ub-content" data-no="4"><td class="gall_num">4</td><td class="gall_writer" data-nick="나쁜 닉네임"><span class="nickname">나쁜 닉네임</span></td></tr>
    <tr id="notice" class="ub-content" data-no="5"><td class="gall_num">설문</td><td class="gall_writer" data-nick="운영자"><span class="nickname">운영자</span></td></tr>
  </tbody></table>
  <script>
    globalThis.paintSamples = [];
    const sample = () => {
      const read = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const style = getComputedStyle(el);
        return { display: style.display, visibility: style.visibility };
      };
      paintSamples.push({
        time: performance.now(),
        rootPending: document.documentElement.classList.contains('dcb-filter-pending'),
        body: getComputedStyle(document.body).visibility,
        allowed: read('allowed'), uid: read('uid'), ip: read('ip'), nick: read('nick'), notice: read('notice')
      });
      if (performance.now() < 700) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  </script>
</body></html>`;

async function openScenario(browser, { enabled = true, delay = 350 } = {}) {
  const page = await browser.newPage();
  await page.addInitScript({ content: `
    (() => {
      const listeners = [];
      globalThis.chrome = {
        storage: {
          sync: {
            get(defaults) {
              return new Promise((resolve) => setTimeout(() => resolve({
                ...(defaults || {}), userBlockEnabled: ${enabled}, noticeBlockEnabled: ${enabled}
              }), ${delay}));
            }
          },
          local: {
            get(defaults) {
              return new Promise((resolve) => setTimeout(() => resolve({
                ...(defaults || {}), blockedUids: ['blocked-user', '118.235', 'nick:나쁜']
              }), ${delay}));
            }
          },
          onChanged: { addListener(fn) { listeners.push(fn); } }
        }
      };
    })();
    ${bootstrapSource}
  ` });
  await page.route('https://gall.dcinside.com/board/lists*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: html
  }));
  await page.goto('https://gall.dcinside.com/board/lists?id=test');
  return page;
}

test('critical list filters shield only candidate rows until storage is ready', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openScenario(browser);
    await page.waitForTimeout(100);
    const early = await page.evaluate(() => ({
      pending: document.documentElement.classList.contains('dcb-filter-pending'),
      body: getComputedStyle(document.body).visibility,
      sentinel: getComputedStyle(document.querySelector('#sentinel')).visibility,
      allowed: getComputedStyle(document.querySelector('#allowed')).visibility,
      blocked: getComputedStyle(document.querySelector('#uid')).visibility
    }));
    assert.equal(early.pending, true);
    assert.equal(early.body, 'visible');
    assert.equal(early.sentinel, 'visible');
    assert.equal(early.allowed, 'hidden');
    assert.equal(early.blocked, 'hidden');

    await page.waitForFunction(() => globalThis.DCBCriticalFilter?.getSnapshot().phase === 'ready');
    const final = await page.evaluate(() => {
      const display = (id) => getComputedStyle(document.getElementById(id)).display;
      return {
        pending: document.documentElement.classList.contains('dcb-filter-pending'),
        allowed: display('allowed'), uid: display('uid'), ip: display('ip'),
        nick: display('nick'), notice: display('notice'), samples: paintSamples
      };
    });
    assert.equal(final.pending, false);
    assert.notEqual(final.allowed, 'none');
    for (const id of ['uid', 'ip', 'nick', 'notice']) assert.equal(final[id], 'none', id);
    for (const sample of final.samples) {
      for (const id of ['uid', 'ip', 'nick', 'notice']) {
        const state = sample[id];
        if (!state) continue;
        assert.ok(state.display === 'none' || state.visibility === 'hidden', `${id} flashed at ${sample.time}ms`);
      }
      assert.equal(sample.body, 'visible');
    }

    await page.evaluate(() => {
      const tbody = document.querySelector('.gall_list tbody');
      tbody.insertAdjacentHTML('beforeend', '<tr id="dynamic" class="ub-content" data-no="6"><td>6</td><td class="gall_writer" data-uid="blocked-user">동적</td></tr>');
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('#dynamic').evaluate((el) => getComputedStyle(el).display), 'none');

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.DCBCriticalFilter?.getSnapshot().phase === 'ready');
    assert.equal(await page.locator('#uid').evaluate((el) => getComputedStyle(el).display), 'none');
    await page.close();
  } finally {
    await browser.close();
  }
});

test('critical list filters fail open when both switches are off', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openScenario(browser, { enabled: false, delay: 80 });
    await page.waitForFunction(() => globalThis.DCBCriticalFilter?.getSnapshot().phase === 'ready');
    for (const id of ['allowed', 'uid', 'ip', 'nick', 'notice']) {
      assert.notEqual(await page.locator(`#${id}`).evaluate((el) => getComputedStyle(el).display), 'none', id);
    }
  } finally {
    await browser.close();
  }
});

test('critical bootstrap is first in the manifest and uses document_start', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  const entry = manifest.content_scripts[0];
  assert.equal(entry.run_at, 'document_start');
  assert.equal(entry.all_frames, false);
  assert.deepEqual(entry.js, [
    'src/shared/storage/user-block-store.js',
    'src/content/core/critical-filter-bootstrap.js'
  ]);
});
