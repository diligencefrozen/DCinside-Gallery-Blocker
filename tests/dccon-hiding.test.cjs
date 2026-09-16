const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const path = require('node:path');
const { chromium } = require('playwright');

let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.DCB_TEST_BROWSER ? { executablePath: process.env.DCB_TEST_BROWSER } : {})
  });
});
after(async () => { await browser?.close(); });

async function fixture(html, initial = {}) {
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.abort());
  await page.setContent(html);
  await page.evaluate((settings) => {
    const listeners = [];
    window.testDcconSettings = { hideDccon: false, hideTextCon: false, ...settings };
    window.chrome = {
      storage: {
        sync: {
          get: (defaults, callback) => callback({ ...defaults, ...window.testDcconSettings })
        },
        onChanged: { addListener: (listener) => listeners.push(listener) }
      }
    };
    window.setDcconSettings = (next) => {
      const changes = {};
      for (const [key, value] of Object.entries(next || {})) {
        const oldValue = window.testDcconSettings[key];
        window.testDcconSettings[key] = value;
        changes[key] = { oldValue, newValue: value };
      }
      listeners.forEach((listener) => listener(changes, 'sync'));
    };
  }, initial);
  await page.addScriptTag({ path: path.join(__dirname, '../src/content/dccon/cleaner-dccon.js') });
  return page;
}

async function display(page, selector) {
  return page.locator(selector).evaluate((node) => getComputedStyle(node).display);
}

test('textcon hiding is independent and off by default', async () => {
  const page = await fixture(`
    <div class="cmt_info" id="textcon"><div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">탄약까지 사라진다면</p></div></div>
    <div class="cmt_info" id="image-row"><div class="comment_dccon"><img src="https://example.invalid/dccon.php?no=1"></div></div>
    <div class="cmt_info" id="plain"><p>일반 댓글</p></div>
  `);
  try {
    assert.notEqual(await display(page, '#textcon'), 'none', 'textcon is visible by default');
    assert.notEqual(await display(page, '#image-row'), 'none', 'media DCCon is visible by default');
    assert.notEqual(await display(page, '#plain'), 'none');
    assert.equal(await page.locator('#dcb-hide-textcon-style').count(), 0);
  } finally {
    await page.close();
  }
});

test('hideTextCon hides only textcons and restores them when disabled', async () => {
  const page = await fixture(`
    <div class="cmt_info" id="textcon"><div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">텍스트콘</p></div></div>
    <ul><li id="reply_1"><div class="comment_dccon_txt"><p>답글 텍스트콘</p></div></li></ul>
    <article><p class="txtcon_txt" id="standalone">본문 텍스트콘</p></article>
    <div class="cmt_info" id="image-row"><div class="comment_dccon"><img src="https://example.invalid/dccon.php?no=1"></div></div>
  `, { hideTextCon: true });
  try {
    for (const selector of ['#textcon', '#reply_1', '#standalone']) {
      assert.equal(await display(page, selector), 'none');
    }
    assert.notEqual(await display(page, '#image-row'), 'none', 'media DCCon stays visible when only textcons are hidden');
    assert.equal(await page.locator('#dcb-hide-textcon-style').count(), 1);
    assert.equal(await page.locator('#dcb-hide-dccon-style').count(), 0);

    await page.evaluate(() => window.setDcconSettings({ hideTextCon: false }));
    for (const selector of ['#textcon', '#reply_1', '#standalone']) {
      assert.notEqual(await display(page, selector), 'none');
    }
  } finally {
    await page.close();
  }
});

test('hideDccon hides all DCCons including textcons', async () => {
  const page = await fixture(`
    <div class="cmt_info" id="textcon"><div class="coment_dccon_txt"><p class="txtcon_txt">텍스트콘</p></div></div>
    <div class="cmt_info" id="wrapped-textcon"><div class="comment_dccon"><div class="coment_dccon_txt"><p class="txtcon_txt">감싼 텍스트콘</p></div></div></div>
    <div class="cmt_info" id="image-row"><div class="comment_dccon"><img src="https://example.invalid/dccon.php?no=1"></div></div>
    <div class="cmt_info" id="video-row"><div class="coment_dccon_img"><video src="https://example.invalid/dccon/video.mp4"></video></div></div>
    <article><video class="written_dccon" id="body-video"></video></article>
  `, { hideDccon: true });
  try {
    for (const selector of ['#image-row', '#video-row', '#body-video']) {
      assert.equal(await display(page, selector), 'none');
    }
    assert.equal(await display(page, '#textcon'), 'none', 'global DCCon hiding includes textcons');
    assert.equal(await display(page, '#wrapped-textcon'), 'none', 'wrapped textcons also follow global DCCon hiding');
    assert.equal(await page.locator('#dcb-hide-dccon-style').count(), 1);
    assert.equal(await page.locator('#dcb-hide-textcon-style').count(), 1);
  } finally {
    await page.close();
  }
});

test('dynamic textcons follow textcon-only and global DCCon settings', async () => {
  const page = await fixture('<div id="preview"></div>', { hideTextCon: true, hideDccon: false });
  try {
    await page.evaluate(() => {
      const row = document.createElement('div');
      row.className = 'dcbpv-comment-item';
      row.id = 'preview-textcon';
      row.innerHTML = '<div class="coment_dccon_txt"><p class="txtcon_txt">미리보기 텍스트콘</p></div>';
      document.querySelector('#preview').appendChild(row);
    });
    await page.waitForFunction(() => document.getElementById('preview-textcon')?.getAttribute('data-dcb-dccon-hidden') === 'true');
    assert.equal(await display(page, '#preview-textcon'), 'none');

    await page.evaluate(() => window.setDcconSettings({ hideTextCon: false }));
    assert.notEqual(await display(page, '#preview-textcon'), 'none');

    await page.evaluate(() => {
      window.setDcconSettings({ hideDccon: true });
      const row = document.createElement('div');
      row.id = 'second-textcon';
      row.className = 'cmt_info';
      row.innerHTML = '<div class="comment_dccon_txt"><p class="txtcon_txt">두 번째 텍스트콘</p></div>';
      document.body.appendChild(row);
    });
    await page.waitForTimeout(180);
    assert.equal(await display(page, '#second-textcon'), 'none', 'global DCCon hiding also captures later textcons');
  } finally {
    await page.close();
  }
});

test('selective textcon blocks remain hidden even when both global toggles are off', async () => {
  const page = await fixture(`
    <div class="cmt_info dcb-selective-dccon-hidden" data-dcb-selective-dccon-hidden="true" style="display:none!important" id="selective">
      <div class="coment_dccon_txt"><p class="txtcon_txt">개별 차단</p></div>
    </div>
  `);
  try {
    assert.equal(await display(page, '#selective'), 'none');
    await page.evaluate(() => window.setDcconSettings({ hideDccon: true, hideTextCon: true }));
    assert.equal(await display(page, '#selective'), 'none');
    await page.evaluate(() => window.setDcconSettings({ hideDccon: false, hideTextCon: false }));
    assert.equal(await display(page, '#selective'), 'none');
  } finally {
    await page.close();
  }
});
