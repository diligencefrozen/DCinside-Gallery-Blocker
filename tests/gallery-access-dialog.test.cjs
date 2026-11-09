const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const guard = path.resolve(__dirname, '../src/content/gallery/access-guard.js');
const home = 'https://www.dcinside.com/';
const url = id => 'https://gall.dcinside.com/board/lists/?id=' + encodeURIComponent(id);

test('gallery access dialog respects block modes, keyboard focus and the site theme', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 860, height: 520}});
    await page.route('**/*', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>갤러리</title><button id="behind">게시글 열기</button>'
    }));
    await page.addInitScript(() => {
      window.guardSettings = { blockedIds: ['programming'], blockMode: 'smart' };
      window.DCBRuntimeSettingsCache = {
        get(defaults, done) { done({ ...defaults, ...guardSettings }); },
        onChanged: { addListener() {} }
      };
      window.chrome = {
        runtime: {},
        storage: {sync: {set(patch, done) { Object.assign(guardSettings, patch); done(); }}}
      };
    });
    const enter = async (id, settings = {}) => {
      await page.goto(url(id));
      await page.evaluate(patch => Object.assign(guardSettings, patch), settings);
      await page.addScriptTag({path: guard});
    };
    const dialog = page.getByRole('dialog', { name: '차단된 갤러리입니다' });
    const action = value => dialog.locator(`[data-act="${value}"]`);
    await enter('programming');
    assert.equal(await dialog.evaluate(el => el.matches(':modal')), true);
    await page.keyboard.press('Escape');
    await page.locator('#behind').evaluate(el => el.focus());
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await dialog.getByRole('heading').click();
    await page.emulateMedia({colorScheme: 'dark'});
    const surface = () => dialog.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(await surface(), 'rgb(255, 255, 255)');
    if (process.env.DCB_ACCESS_SCREENSHOTS) {
      await page.screenshot({ path: path.join(process.env.DCB_ACCESS_SCREENSHOTS, 'gallery-access-light.png') });
    }
    await page.emulateMedia({colorScheme: 'light'});
    await page.evaluate(() => {
      const sheet = document.createElement('style');
      sheet.id = 'css-darkmode';
      document.head.append(sheet);
    });
    assert.equal(await surface(), 'rgb(37, 40, 45)');
    await page.setViewportSize({width: 360, height: 540});
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    if (process.env.DCB_ACCESS_SCREENSHOTS) {
      await page.screenshot({ path: path.join(process.env.DCB_ACCESS_SCREENSHOTS, 'gallery-access-dark.png') });
    }
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#behind').evaluate(el => el === document.activeElement), false);
    await action('allow-once').click();
    await dialog.waitFor({state: 'detached'});
    assert.deepEqual(await page.evaluate(() => guardSettings.blockedIds), ['programming']);
    await enter('programming');
    assert.equal(await dialog.count(), 0, 'same tab retains the temporary exception');
    await enter('programming', {blockMode: 'block'});
    assert.equal(await action('allow-once').count(), 0);
    await action('unblock').click();
    await dialog.waitFor({state: 'detached'});
    assert.deepEqual(await page.evaluate(() => guardSettings.blockedIds), []);

    await enter('dcbest', {blockedIds: ['dcbest']});
    assert.match(await dialog.textContent(), /모두 적용/);
    await action('unblock').click();
    assert.equal(await action('unblock').count(), 0);
    await action('disable-dcbest').click();
    await dialog.waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => guardSettings.builtinDcbestBlockEnabled), false);

    await page.clock.install();
    await enter('programming', {blockMode: 'redirect', delay: 3});
    await action('unblock').focus();
    await page.clock.runFor(1000);
    assert.equal(await dialog.locator('[data-seconds]').textContent(), '2');
    assert.equal(await action('unblock').evaluate(el => el === document.activeElement), true);
    await page.clock.runFor(2000);
    await page.waitForURL(home);
    await enter('dcbest');
    await action('home').click();
    await page.waitForURL(home);
  } finally {
    await browser.close();
  }
});
