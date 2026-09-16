const assert = require('node:assert/strict');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { chromium } = require('playwright');

let browser;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.DCB_TEST_BROWSER ? { executablePath: process.env.DCB_TEST_BROWSER } : {})
  });
});

after(async () => { await browser?.close(); });

async function fixture(html, packagePayload = null) {
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body></body></html>'
  }));
  await page.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1');
  await page.evaluate(({ markup, payload }) => {
    document.body.innerHTML = markup;
    const storageListeners = [];
    const runtimeListeners = [];
    const localData = {};

    window.__dcbLocalData = localData;
    window.__dcbRuntimeListeners = runtimeListeners;
    window.chrome = {
      storage: {
        local: {
          get: async (defaults = {}) => ({ ...defaults, ...localData }),
          set: async (patch) => {
            const changes = {};
            Object.entries(patch || {}).forEach(([key, value]) => {
              changes[key] = { oldValue: localData[key], newValue: value };
              localData[key] = value;
            });
            storageListeners.forEach((listener) => listener(changes, 'local'));
          }
        },
        onChanged: { addListener: (listener) => storageListeners.push(listener) }
      },
      runtime: {
        onMessage: { addListener: (listener) => runtimeListeners.push(listener) }
      }
    };

    window.fetch = async () => {
      if (!payload) return new Response('error', { status: 404 });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
  }, { markup: html, payload: packagePayload });

  await page.addScriptTag({ path: path.join(__dirname, '../src/shared/storage/dccon-block-store.js') });
  await page.addScriptTag({ path: path.join(__dirname, '../src/content/dccon/dccon-blocker.js') });
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-dcb-selective-dccon-loading'));
  return page;
}

async function invokeContextBlock(page, selector, mode) {
  await page.locator(selector).dispatchEvent('contextmenu', { button: 2 });
  return page.evaluate((nextMode) => new Promise((resolve) => {
    const listener = window.__dcbRuntimeListeners.at(-1);
    listener({ type: 'dcb.dcconBlockContext', mode: nextMode }, {}, resolve);
  }), mode);
}

test('textcon can be individually blocked with a stable local fingerprint', async () => {
  const page = await fixture(`
    <div class="cmt_info" id="row-1">
      <div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">아...</p></div>
    </div>
  `);

  try {
    const result = await invokeContextBlock(page, '#row-1 .txtcon_txt', 'item');
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'item');
    assert.match(result.code, /^textcon_[a-z0-9]+_[a-z0-9]+$/);
    assert.equal(await page.locator('#row-1').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('#row-1 .coment_dccon_txt').evaluate((node) => getComputedStyle(node).display), 'none');

    const state = await page.evaluate(() => window.__dcbLocalData.dcbDcconBlockState);
    assert.equal(Object.keys(state.items).length, 1);
    assert.match(Object.values(state.items)[0].label, /^텍스트콘 · 아/);

    await page.evaluate(() => {
      const next = document.createElement('div');
      next.className = 'cmt_info';
      next.id = 'row-2';
      next.innerHTML = '<div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">아...</p></div>';
      document.body.appendChild(next);
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#row-2 .coment_dccon_txt')).display === 'none');
    assert.equal(await page.locator('#row-2').evaluate((node) => getComputedStyle(node).display), 'none');
  } finally {
    await page.close();
  }
});

test('textcon group block uses package_idx and also hides different textcons from the same package', async () => {
  const payload = {
    info: { package_idx: '321', title: '테스트 텍스트콘 묶음', icon_cnt: '2' },
    detail: [
      { path: 'abcdefghijklmnop1234', title: '첫 번째' },
      { path: 'qrstuvwxyzabcdef5678', title: '두 번째' }
    ]
  };
  const page = await fixture(`
    <div class="cmt_info" id="group-row-1" data-package-idx="321">
      <div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">첫 텍스트콘</p></div>
    </div>
  `, payload);

  try {
    const result = await invokeContextBlock(page, '#group-row-1 .txtcon_txt', 'group');
    assert.deepEqual(result, { ok: true, mode: 'group', packageIdx: '321', count: 2 });
    assert.equal(await page.locator('#group-row-1').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('#group-row-1 .coment_dccon_txt').evaluate((node) => getComputedStyle(node).display), 'none');

    const group = await page.evaluate(() => window.__dcbLocalData.dcbDcconBlockState.groups['321']);
    assert.equal(group.title, '테스트 텍스트콘 묶음');
    assert.ok(group.paths.some((code) => code.startsWith('textcon_')));

    await page.evaluate(() => {
      const next = document.createElement('div');
      next.className = 'cmt_info';
      next.id = 'group-row-2';
      next.dataset.packageIdx = '321';
      next.innerHTML = '<div class="coment_dccon_txt cbg_111111"><p class="txtcon_txt ctxt_eeeeee">서로 다른 텍스트콘</p></div>';
      document.body.appendChild(next);
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#group-row-2 .coment_dccon_txt')).display === 'none');
    assert.equal(await page.locator('#group-row-2').evaluate((node) => getComputedStyle(node).display), 'none');
  } finally {
    await page.close();
  }
});

test('group blocking fails safely when a textcon has no package identifier', async () => {
  const page = await fixture(`
    <div class="cmt_info" id="unknown-row">
      <div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">그룹 정보 없음</p></div>
    </div>
  `);

  try {
    const result = await invokeContextBlock(page, '#unknown-row .txtcon_txt', 'group');
    assert.equal(result.ok, false);
    assert.match(result.message, /그룹 정보를 찾지 못했습니다/);
    assert.notEqual(await page.locator('#unknown-row').evaluate((node) => getComputedStyle(node).display), 'none');
  } finally {
    await page.close();
  }
});

test('individual blocking compares the full DCCon code instead of a substring', async () => {
  const blockedCode = 'abcdefghijklmnop1234';
  const containingCode = `zz${blockedCode}yy`;
  const page = await fixture(`
    <div class="cmt_info" id="blocked-row" style="display:flex">
      <img class="written_dccon" id="blocked-dccon" style="display:inline-block" src="https://dcimg5.dcinside.com/dccon.php?no=${blockedCode}">
    </div>
    <div class="cmt_info" id="safe-row">
      <img class="written_dccon" id="safe-dccon" src="https://dcimg5.dcinside.com/dccon.php?no=${containingCode}">
    </div>
  `);

  try {
    const result = await invokeContextBlock(page, '#blocked-dccon', 'item');
    assert.deepEqual(result, { ok: true, mode: 'item', code: blockedCode });
    assert.equal(await page.locator('#blocked-row').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('#blocked-dccon').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.notEqual(
      await page.locator('#safe-row').evaluate((node) => getComputedStyle(node).display),
      'none',
      'a different code containing the blocked code remains visible'
    );
    assert.notEqual(await page.locator('#safe-dccon').evaluate((node) => getComputedStyle(node).display), 'none');

    await page.evaluate((code) => window.DCBDcconBlockStore.removeItem(code), blockedCode);
    await page.waitForFunction(() => (
      getComputedStyle(document.querySelector('#blocked-row')).display !== 'none'
      && getComputedStyle(document.querySelector('#blocked-dccon')).display !== 'none'
    ));
    assert.deepEqual(await page.locator('#blocked-row').evaluate((node) => ({
      display: node.style.getPropertyValue('display'),
      priority: node.style.getPropertyPriority('display'),
      marked: node.hasAttribute('data-dcb-selective-dccon-empty-row')
    })), { display: 'flex', priority: '', marked: false });
    assert.deepEqual(await page.locator('#blocked-dccon').evaluate((node) => ({
      display: node.style.getPropertyValue('display'),
      priority: node.style.getPropertyPriority('display'),
      marked: node.hasAttribute('data-dcb-selective-dccon-hidden')
    })), { display: 'inline-block', priority: '', marked: false });
  } finally {
    await page.close();
  }
});

test('metadata-only DCCon row hides, then follows dynamic meaningful content', async () => {
  const blockedCode = '62b5df2be09d3ca567b1c5bc12d46b394aa3b1058c6e4d0ca41648b650ef206ef8299a6ef74b36c7c827ab86da164c58217d5841ef07c97e86f6444c5022f3b03b27c3369d5acac71ad18c4b';
  const page = await fixture(`
    <div class="cmt_info clear" id="metadata-row" data-no="590888" data-article-no="146483">
      <div class="addbox">
        <div class="cmt_nickbox"><span class="gall_writer ub-writer"><span class="nickname"><em>편살즉영체</em></span></span></div>
        <div class="clear cmt_txtbox btn_reply_write_all" id="metadata-body">
          <div class="comment_dccon clear">
            <div class="coment_dccon_img"><img class="written_dccon" id="metadata-dccon" src="https://dcimg5.dcinside.com/dccon.php?no=${blockedCode}" alt="6"></div>
            <div class="coment_dccon_info clear dccon_over_box" style="display:none"><button type="button" reqpath="/dccon">디시콘 보기</button></div>
          </div>
        </div>
      </div>
      <div class="fr clear"><span class="date_time">2025.06.28 22:47:17</span><div class="cmt_mdf_del"><button>삭제</button></div></div>
    </div>
  `);

  try {
    const result = await invokeContextBlock(page, '#metadata-dccon', 'item');
    assert.deepEqual(result, { ok: true, mode: 'item', code: blockedCode });
    assert.equal(await page.locator('#metadata-row').evaluate((node) => getComputedStyle(node).display), 'none');

    await page.evaluate(() => {
      const text = document.createElement('p');
      text.id = 'dynamic-comment-text';
      text.className = 'usertxt';
      text.textContent = '디시콘과 함께 작성한 실제 댓글입니다.';
      document.querySelector('#metadata-body').appendChild(text);
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#metadata-row')).display !== 'none');
    assert.equal(await page.locator('#metadata-dccon').evaluate((node) => getComputedStyle(node).display), 'none');

    await page.locator('#dynamic-comment-text').evaluate((node) => { node.textContent = ''; });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#metadata-row')).display === 'none');

    await page.evaluate(() => {
      const attachment = document.createElement('img');
      attachment.id = 'dynamic-attachment';
      attachment.alt = '일반 첨부 이미지';
      attachment.src = 'https://example.invalid/ordinary-image.png';
      document.querySelector('#metadata-body').appendChild(attachment);
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#metadata-row')).display !== 'none');
    assert.notEqual(await page.locator('#dynamic-attachment').evaluate((node) => getComputedStyle(node).display), 'none');
  } finally {
    await page.close();
  }
});

test('a safe DCCon inserted after blocking remains visible', async () => {
  const blockedCode = 'blocked_dynamic_code_1234';
  const safeCode = 'unblocked_dynamic_code_5678';
  const page = await fixture(`
    <div class="cmt_info" id="dynamic-row">
      <div class="comment_dccon" id="dynamic-wrapper">
        <img class="written_dccon" id="dynamic-blocked" src="https://dcimg5.dcinside.com/dccon.php?no=${blockedCode}">
      </div>
    </div>
  `);

  try {
    const result = await invokeContextBlock(page, '#dynamic-blocked', 'item');
    assert.deepEqual(result, { ok: true, mode: 'item', code: blockedCode });
    assert.equal(await page.locator('#dynamic-blocked').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator('#dynamic-row').evaluate((node) => getComputedStyle(node).display), 'none');

    await page.evaluate((code) => {
      const safe = document.createElement('img');
      safe.id = 'dynamic-safe';
      safe.className = 'written_dccon';
      safe.src = `https://dcimg5.dcinside.com/dccon.php?no=${code}`;
      document.querySelector('#dynamic-wrapper').appendChild(safe);
    }, safeCode);

    await page.waitForTimeout(120);
    assert.notEqual(await page.locator('#dynamic-row').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.notEqual(await page.locator('#dynamic-safe').evaluate((node) => getComputedStyle(node).display), 'none');
  } finally {
    await page.close();
  }
});

test('individual blocking keeps unblocked sibling DCCons in the same row visible', async () => {
  const blockedCode = 'blocked_dccon_code_1234';
  const safeCode = 'unblocked_dccon_code_5678';
  const page = await fixture(`
    <div class="cmt_info" id="multi-dccon-row">
      <div class="comment_dccon">
        <img class="written_dccon" id="blocked-dccon" src="https://dcimg5.dcinside.com/dccon.php?no=${blockedCode}">
        <img class="written_dccon" id="safe-dccon" src="https://dcimg5.dcinside.com/dccon.php?no=${safeCode}">
      </div>
    </div>
  `);

  try {
    const result = await invokeContextBlock(page, '#blocked-dccon', 'item');
    assert.deepEqual(result, { ok: true, mode: 'item', code: blockedCode });
    assert.notEqual(
      await page.locator('#multi-dccon-row').evaluate((node) => getComputedStyle(node).display),
      'none',
      'the shared comment row must not be hidden when it contains another DCCon'
    );
    assert.equal(await page.locator('#blocked-dccon').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.notEqual(await page.locator('#safe-dccon').evaluate((node) => getComputedStyle(node).display), 'none');
  } finally {
    await page.close();
  }
});
