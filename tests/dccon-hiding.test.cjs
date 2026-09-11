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

async function fixture(html, hideDccon = true) {
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.abort());
  await page.setContent(html);
  await page.evaluate((enabled) => {
    const listeners = [];
    window.chrome = {
      storage: {
        sync: { get: (_defaults, callback) => callback({ hideDccon: enabled }) },
        onChanged: { addListener: (listener) => listeners.push(listener) }
      }
    };
    window.setHideDccon = (next) => {
      listeners.forEach((listener) => listener({ hideDccon: { newValue: next } }, 'sync'));
    };
  }, hideDccon);
  await page.addScriptTag({ path: path.join(__dirname, '../src/content/dccon/cleaner-dccon.js') });
  return page;
}

async function display(page, selector) {
  return page.locator(selector).evaluate((node) => getComputedStyle(node).display);
}

test('hides textcon comment rows, replies, and standalone textcons without hiding normal text', async () => {
  const page = await fixture(`
    <div class="cmt_info" id="textcon"><div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">탄약까지 사라진다면</p></div></div>
    <ul><li id="reply_1"><div class="comment_dccon_txt"><p>답글 텍스트콘</p></div></li></ul>
    <div class="cmt_info" id="plain"><p>탄약까지 사라진다면</p></div>
    <article><p class="txtcon_txt" id="standalone">본문 텍스트콘</p></article>
  `);
  try {
    assert.equal(await display(page, '#textcon'), 'none');
    assert.equal(await display(page, '#reply_1'), 'none');
    assert.equal(await display(page, '#standalone'), 'none');
    assert.notEqual(await display(page, '#plain'), 'none');
    await page.evaluate(() => window.setHideDccon(false));
    for (const selector of ['#textcon', '#reply_1', '#standalone']) {
      assert.notEqual(await display(page, selector), 'none');
    }
    assert.equal(await page.locator('[data-dcb-dccon-hidden]').count(), 0);
    await page.evaluate(() => window.setHideDccon(true));
    assert.equal(await display(page, '#textcon'), 'none');
  } finally {
    await page.close();
  }
});

test('handles inserted preview textcons and content that becomes a textcon after loading', async () => {
  const page = await fixture('<div id="preview"></div><div class="cmt_info" id="late"><p id="late-text">텍스트콘 로딩</p></div>');
  try {
    await page.evaluate(() => {
      const row = document.createElement('div');
      row.className = 'dcbpv-comment-item';
      row.id = 'preview-textcon';
      row.innerHTML = '<div class="coment_dccon_txt"><p class="txtcon_txt">미리보기 텍스트콘</p></div>';
      document.querySelector('#preview').appendChild(row);
      document.querySelector('#late-text').className = 'txtcon_txt';
    });
    await page.waitForFunction(() => ['preview-textcon', 'late'].every((id) =>
      document.getElementById(id).getAttribute('data-dcb-dccon-hidden') === 'true'));
    assert.equal(await display(page, '#preview-textcon'), 'none');
    assert.equal(await display(page, '#late'), 'none');
    await page.evaluate(() => window.setHideDccon(false));
    assert.notEqual(await display(page, '#preview-textcon'), 'none');
    assert.notEqual(await display(page, '#late'), 'none');
  } finally {
    await page.close();
  }
});

test('still hides image and video dccons and preserves separate selective blocks when disabled', async () => {
  const page = await fixture(`
    <div class="cmt_info" id="image-row"><div class="comment_dccon"><img src="https://example.invalid/dccon.php?no=1"></div></div>
    <div class="cmt_info" id="video-row"><div class="coment_dccon_img"><video></video></div></div>
    <article><video class="written_dccon" id="body-video"></video></article>
    <div class="cmt_info dcb-selective-dccon-hidden" data-dcb-selective-dccon-hidden="true" style="display:none!important" id="selective"><div class="coment_dccon_txt"><p class="txtcon_txt">개별 차단</p></div></div>
  `);
  try {
    for (const selector of ['#image-row', '#video-row', '#body-video', '#selective']) {
      assert.equal(await display(page, selector), 'none');
    }
    await page.evaluate(() => window.setHideDccon(false));
    for (const selector of ['#image-row', '#video-row', '#body-video']) {
      assert.notEqual(await display(page, selector), 'none');
    }
    assert.equal(await display(page, '#selective'), 'none');
  } finally {
    await page.close();
  }
});

test('does not hide existing or newly inserted textcons while the setting is off', async () => {
  const page = await fixture('<div class="cmt_info" id="row"><div class="coment_dccon_txt"><p class="txtcon_txt">텍스트콘</p></div></div>', false);
  try {
    assert.notEqual(await display(page, '#row'), 'none');
    assert.notEqual(await display(page, '.txtcon_txt'), 'none');
    await page.evaluate(() => {
      const row = document.querySelector('#row').cloneNode(true);
      row.id = 'added';
      document.body.appendChild(row);
    });
    assert.notEqual(await display(page, '#added'), 'none');
    assert.equal(await page.locator('#dcb-hide-dccon-style').count(), 0);
  } finally {
    await page.close();
  }
});
