const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const fixtureUrl = 'https://gall.dcinside.com/board/lists/?id=button_test';
const fixture = `<!doctype html><meta charset="utf-8">
  <style>
    body,button {font:12px Arial,sans-serif}
    button {background:transparent;border:0}
    .gall_issuebox button {color:#333}
  </style>
  <header class="page_head"><div class="fl">갤러리</div>
  <div class="gall_issuebox"><button class="issue_setting">설정</button></div></header>`;
const native = '#dcb-gallery-quick-block-native';
const floating = '#dcb-gallery-quick-block-floating';
const position = '#quickBlockButtonPosition';
const positions = ['right-top', 'right-middle', 'right-bottom', 'left-top', 'left-middle', 'left-bottom'];
const key = 'quickBlockButtonPosition';
const stamp = 'quickBlockButtonPositionSavedAt';

async function openProfile(profile) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('chrome-extension:')) return route.continue();
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const origin = 'chrome-extension://' + new URL(worker.url()).host;
    const options = await context.newPage();
    await options.goto(origin + '/src/ui/options/options.html');
    await options.waitForFunction(async () =>
      (await chrome.storage.local.get('dcbSettingsBatchV1')).dcbSettingsBatchV1?.phase === 'committed');
    const gallery = await context.newPage();
    await gallery.goto(fixtureUrl);
    const popup = await context.newPage();
    await gallery.bringToFront();
    await popup.goto(origin + '/src/ui/popup/popup.html');
    return { context, gallery, options, popup };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function checkPlacement({ gallery, popup, options }, value) {
  for (const ui of [popup, options]) {
    await ui.waitForFunction(([id, expected]) => document.querySelector(id).value === expected, [position, value]);
  }
  await gallery.waitForFunction(([native, floating, expected]) => {
    const buttons = document.querySelectorAll(`${native},${floating}`);
    if (expected === 'hidden') return buttons.length === 0;
    const selector = expected.endsWith('-top') ? native : floating;
    return buttons.length === 1 && document.querySelector(selector)?.dataset.position === expected;
  }, [native, floating, value]);
}

async function importBackup(options, payload) {
  const imported = options.waitForEvent('dialog').then(async dialog => {
    const message = dialog.message();
    await dialog.accept();
    assert.equal(message, '백업을 불러왔습니다.');
  });
  await options.locator('#importFile').setInputFiles({
    name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload))
  });
  await imported;
}

test('page button follows both settings UIs, themes, backup restore and browser restart', async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-quick-block-'));
  let pages;
  try {
    pages = await openProfile(profile);
    const { options, popup, gallery } = pages;
    const choose = (ui, value) => ui.locator(position).selectOption(value, { force: true });
    const pageButton = gallery.locator('.dcb-gqb-action');
    await checkPlacement(pages, 'right-top');

    for (const dark of [false, true]) {
      if (dark) await gallery.evaluate(() => {
        const style = document.createElement('style');
        style.id = 'css-darkmode';
        style.textContent = 'body{background:#222}.gall_issuebox button{color:#ccc}';
        document.head.append(style);
      });
      const readStyle = el => {
        const s = getComputedStyle(el);
        return [s.color, s.fontFamily, s.fontSize, s.fontWeight, s.backgroundColor, s.borderTopWidth, s.boxShadow];
      };
      assert.deepEqual(await pageButton.evaluate(readStyle), await gallery.locator('.issue_setting').evaluate(readStyle));
      await pageButton.hover();
      assert.equal(await pageButton.evaluate(el => getComputedStyle(el).textDecorationLine), 'underline');
      await choose(options, 'left-bottom');
      await checkPlacement(pages, 'left-bottom');
      assert.equal(await gallery.locator(floating).evaluate(el => getComputedStyle(el).backgroundColor),
        dark ? 'rgb(37, 37, 37)' : 'rgb(255, 255, 255)');
      await choose(popup, 'hidden');
      await checkPlacement(pages, 'hidden');
      await choose(popup, 'right-top');
      await checkPlacement(pages, 'right-top');
    }

    await pageButton.click();
    await gallery.locator('#dcb-access-guard-overlay').waitFor();
    await choose(options, 'hidden');
    await checkPlacement(pages, 'hidden');
    await gallery.reload();
    await gallery.locator('#dcb-access-guard-overlay').waitFor();
    await checkPlacement(pages, 'hidden');
    await choose(popup, 'left-middle');
    await checkPlacement(pages, 'left-middle');
    await pageButton.filter({ hasText: '차단 해제' }).waitFor();
    await pageButton.evaluate(el => el.click());
    await gallery.locator('#dcb-access-guard-overlay').waitFor({ state: 'detached' });
    await pageButton.click();
    await gallery.locator('#dcb-access-guard-overlay').waitFor();
    await choose(popup, 'hidden');
    await checkPlacement(pages, 'hidden');
    const popupButton = popup.locator('#blockCurrentGalleryBtn');
    await popup.waitForFunction(() => document.querySelector('#blockCurrentGalleryBtn').textContent === '차단 해제');
    await popupButton.evaluate(el => el.click());
    await gallery.locator('#dcb-access-guard-overlay').waitFor({ state: 'detached' });

    const download = options.waitForEvent('download');
    await options.locator('#exportBtn').evaluate(el => el.click());
    const backup = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
    for (const area of ['sync', 'local']) assert.equal(backup.storage[area][key], 'hidden');
    assert.ok(backup.storage.sync[stamp] > 0);
    assert.equal(backup.storage.sync[stamp], backup.storage.local[stamp]);
    for (const value of positions) {
      await choose(options, value);
      await checkPlacement(pages, value);
    }
    await importBackup(options, { data: { [key]: 'left-top' } });
    await checkPlacement(pages, 'left-top');
    backup.storage.sync[key] = 'left-bottom';
    backup.storage.local[stamp] = backup.storage.sync[stamp] + 1;
    await importBackup(options, backup);
    await checkPlacement(pages, 'hidden');
    await choose(popup, 'right-middle');
    await checkPlacement(pages, 'right-middle');
    backup.storage.sync[key] = 'hidden';
    backup.storage.local[key] = 'right-bottom';
    backup.storage.local[stamp] = 0;
    await importBackup(options, backup);
    await checkPlacement(pages, 'hidden');

    await pages.context.close();
    pages = await openProfile(profile);
    await checkPlacement(pages, 'hidden');
    await pages.gallery.goto(fixtureUrl.replace('button_test', 'dcbest'));
    await pages.gallery.locator('#dcb-access-guard-overlay').waitFor();
    await choose(pages.options, 'right-top');
    await checkPlacement(pages, 'right-top');
    const builtinButton = pages.gallery.locator('.dcb-gqb-action:disabled').filter({ hasText: '실시간베스트 차단됨' });
    await builtinButton.waitFor({ state: 'attached' });
    assert.equal(await builtinButton.evaluate(el => getComputedStyle(el).opacity), '0.6');
  } finally {
    await pages?.context.close();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 });
  }
});
