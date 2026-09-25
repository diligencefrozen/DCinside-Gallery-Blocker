const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.DCB_TEST_BROWSER ? { executablePath: process.env.DCB_TEST_BROWSER } : {}) });
});
after(async () => {
  if (!browser) return;
  await Promise.race([
    browser.close(),
    new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref?.(); })
  ]);
});

async function fixture(kind) {
  const page = await browser.newPage({ viewport: { width: kind === 'popup' ? 400 : 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const listeners = [];
    const values = {};
    window.savedSettings = values;
    window.chrome = {
      runtime: { sendMessage: async () => ({ state: 'idle' }) },
      storage: {
        sync: {
          get(defaults, callback) { const result = { ...defaults, ...values }; if (callback) callback(result); return Promise.resolve(result); },
          set(patch, callback) { Object.assign(values, patch); const changes = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, { newValue: value }])); listeners.forEach(fn => fn(changes, 'sync')); callback?.(); return Promise.resolve(); }
        },
        onChanged: { addListener: fn => listeners.push(fn) }
      }
    };
    window.runtimeStatus = (state, details = {}) => listeners.forEach(fn => fn({ dcbDetectionStatus: { newValue: { state, ...details } } }, 'session'));
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://reading.test') return route.fulfill({ contentType: 'text/css', body: '' });
    const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
    let body = fs.readFileSync(path.join(root, relative), 'utf8');
    if (relative.endsWith('.html')) {
      body = body.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (tag, src) => /(?:font-config|font-ui|detection-config|text-detection-ui)\.js$/.test(src) ? tag : '');
    }
    await route.fulfill({ contentType: relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : 'text/html', body });
  });
  await page.goto(`http://reading.test/src/ui/${kind}/${kind}.html`);
  await page.waitForFunction(() => document.querySelector('#dcbFontFamily')?.options.length > 0);
  return { page, errors };
}

for (const kind of ['popup', 'options']) {
  test(`${kind}: Korean reading controls fit, restore defaults, and sync detection settings`, async () => {
    const { page, errors } = await fixture(kind);
    try {
      assert.equal(await page.locator('#dcbApplyFontToDc').isChecked(), false);
      assert.equal(await page.locator('[data-detection-field="enabled"]').isChecked(), false);
      assert.equal(await page.locator('[data-detection-field="sensitivity"]').isDisabled(), true);
      assert.equal(await page.locator('.dcb-detection-card').getAttribute('data-detection-state'), 'READY');
      assert.match(await page.locator('[data-detection-model]').innerText(), /1\.0\.0.*확장에 포함됨/);
      await page.locator('[data-detection-field="enabled"] + .slider').click();
      await page.locator('[data-detection-field="sensitivity"]').selectOption('sensitive');
      assert.equal(await page.evaluate(() => savedSettings.dcbTextDetection.sensitivity), 'sensitive');
      await page.evaluate(() => runtimeStatus('limited', { mode: 'basic', reason: 'model-unavailable' }));
      assert.match(await page.locator('[data-detection-status]').innerText(), /기본 감지 사용 중/);
      assert.match(await page.locator('[data-detection-status]').innerText(), /비-AI 규칙/);
      assert.equal(await page.locator('.dcb-detection-card').getAttribute('data-detection-state'), 'FALLBACK');
      await page.evaluate(() => runtimeStatus('error'));
      assert.match(await page.locator('[data-detection-status]').innerText(), /시작하지 못/);
      assert.equal(await page.locator('.dcb-detection-card').getAttribute('data-detection-state'), 'ERROR');
      await page.locator('[data-detection-field="enabled"] + .slider').click();
      assert.match(await page.locator('[data-detection-status]').innerText(), /꺼짐/);
      const output = path.join(root, 'test-results');
      fs.mkdirSync(output, { recursive: true });
      await page.locator('.dcb-detection-card').screenshot({ path: path.join(output, `${kind}-detection-settings.png`) });
      if (kind === 'popup') {
        await page.evaluate(() => {
          document.querySelectorAll('[data-popup-panel]').forEach(panel => { panel.hidden = panel.dataset.popupPanel !== 'display'; });
        });
      }
      await page.locator('#dcbApplyFontToDc + .slider').click();
      await page.locator('#dcbFontScale').fill('140');
      await page.locator('#dcbFontScale').dispatchEvent('change');
      await page.locator('#dcbFontReset').click();
      assert.equal(await page.locator('#dcbApplyFontToDc').isChecked(), false);
      assert.equal(await page.locator('#dcbFontScale').inputValue(), '100');
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.font-panel, .font-card, .dcb-detection-card')].some(node => node.scrollWidth > node.clientWidth + 1));
      assert.equal(overflow, false);
      assert.deepEqual(errors, []);
      await page.locator(kind === 'popup' ? '.font-panel' : '.font-card').screenshot({ path: path.join(output, `${kind}-font-settings.png`) });
    } finally { await page.close(); }
  });
}
