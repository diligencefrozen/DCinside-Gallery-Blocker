const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium, firefox } = require('playwright');

const listUrl = 'https://gall.dcinside.com/board/lists/?id=dcbest';
const cardSelector = '.dcb-activity-navigation-status';
const artifacts = path.join(__dirname, '../test-results/activity-navigation-card');

async function fixture(browser, { narrow = false } = {}) {
  const context = await browser.newContext({ viewport: { width: narrow ? 520 : 1180, height: 740 },
    colorScheme: narrow ? 'dark' : 'light', reducedMotion: narrow ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:24px;color:#293247;background:#f6f7fb;font:12px/1.6 Arial,sans-serif}
    main{max-width:1080px;margin:auto;padding:22px;background:white;border:1px solid #dce2ed;border-radius:12px}h1{font-size:21px;margin:0 0 8px}p{color:#69768c;margin:0 0 24px}
    table{width:100%;table-layout:fixed;border-collapse:collapse}th{height:32px;font-weight:400;color:#64718a;background:#f4f6fa}
    td{height:34px;border-bottom:1px solid #e5e9f1;padding:6px 4px;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .gall_tit>a{display:inline-block;max-width:calc(100% - 38px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;color:inherit;text-decoration:none}
    .gall_tit>a.reply_numbox{max-width:none;color:#657aa5;margin-left:4px;font-size:11px}.gall_writer{font-size:11px;color:#6d7990}
    .dcb-dcbest-analysis-indicator{display:inline-flex;align-items:center;gap:5px;margin-left:6px;padding:2px 7px;border-radius:999px;border:1px solid #467ddc3d;background:#467ddc12;color:#416fbd;font-size:10px;line-height:15px;white-space:nowrap;vertical-align:middle}
    .dcb-dcbest-analysis-spinner{width:9px;height:9px;flex:none;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%}
    @media(max-width:650px){body{margin:10px}main{padding:12px}h1{font-size:19px}.gall_tit>a{max-width:calc(100% - 30px)}}
    @media(prefers-color-scheme:dark){body{background:#101724;color:#e7edf8}main{background:#182234;border-color:#35435b}th{background:#202d42;color:#aebbd3}td{border-color:#35425b}p,.gall_writer{color:#a1b0c9}.dcb-dcbest-analysis-indicator{color:#a9c7ff;background:#8baeff12}}
  </style></head><body><main><h1>실시간 베스트</h1><p>원출처 확인 안내와 작성자 활동 확인을 함께 표시합니다.</p>
  <table class="gall_list"><colgroup><col style="width:6%"><col style="width:52%"><col style="width:18%"><col style="width:12%"><col style="width:12%"></colgroup>
  <thead><tr><th>번호</th><th>제목</th><th>작성자</th><th>조회</th><th>추천</th></tr></thead><tbody>
  <tr class="ub-content" data-no="10" id="before"><td>10</td><td class="gall_tit"><a href="/board/view/?id=dcbest&no=10">이전 게시글은 그대로 볼 수 있어요</a></td><td class="gall_writer ub-writer" data-uid="">이전 작성자</td><td>1,284</td><td>23</td></tr>
  <tr class="ub-content" data-no="11" id="selected"><td>11</td><td class="gall_tit ub-word" id="titleCell"><a id="postLink" href="/board/view/?id=dcbest&no=11">${narrow ? '실베 게시글 제목' : '사진과 댓글이 많은 실시간 베스트 게시글 제목입니다'}</a><a class="reply_numbox" href="/board/view/?id=dcbest&no=11#comment">[125]</a><span class="dcb-dcbest-analysis-indicator is-visible" data-state="analyzing" data-dcb-owned="dcbest-source"><span class="dcb-dcbest-analysis-spinner"></span><span class="dcb-dcbest-analysis-label">${narrow ? '출처 미확인' : '원출처 분석 중'}</span></span></td><td class="gall_writer ub-writer" data-uid="newuser" data-nick="활동 확인 회원">활동 확인 회원</td><td>28,592</td><td>482</td></tr>
  <tr class="ub-content" data-no="12" id="after"><td>12</td><td class="gall_tit"><a href="/board/view/?id=dcbest&no=12">다음 게시글과 겹치지 않아야 해요</a></td><td class="gall_writer ub-writer" data-uid="">다음 작성자</td><td>8,350</td><td>57</td></tr>
  </tbody></table></main></body></html>` }));
  await page.goto(listUrl);
  await page.evaluate(() => {
    const settings = { enabled: true, blockPosts: true, blockComments: true, display: false, holdWhileChecking: false };
    const cache = new Map(), inflight = new Map();
    window.activityCalls = 0;
    window.activityRelays = [];
    window.DCBAccountActivityFilter = {
      ready: async () => {}, isReady: () => true, getSettings: () => ({ ...settings }),
      peek: uid => cache.get(uid) || null,
      evaluate(uid) {
        if (cache.has(uid)) return Promise.resolve(cache.get(uid));
        if (inflight.has(uid)) return inflight.get(uid);
        activityCalls++;
        const request = new Promise(resolve => {
          window.resolveActivity = result => { cache.set(uid, result); resolve(result); };
        });
        inflight.set(uid, request);return request;
      },
      flushCache: async () => {}
    };
    window.DCBRuntimeSettingsCache = { peek: () => ({ dcbImageAccountRules: settings }) };
    window.chrome = { runtime: { id: 'activity-card-fixture', onMessage: { addListener() {} },
      sendMessage(message, callback) {
        if (message.type === 'dcb.activityOpen') activityRelays.push(message);
        const result = { ok: true };queueMicrotask(() => callback?.(result));return Promise.resolve(result);
      }
    } };
  });
  await page.addScriptTag({ path: path.join(__dirname, '../src/content/user/account-activity-blocker.js') });
  await page.waitForFunction(() => activityCalls === 1);
  return { page, context, errors };
}

async function assertNativeColumns(page) {
  const geometry = await page.evaluate(selector => {
    const card = document.querySelector(selector), cell = document.querySelector('#titleCell');
    const box = node => { const r = node.getBoundingClientRect();return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    return { card: box(card), cell: box(cell), author: box(document.querySelector('#selected .gall_writer')),
      source: box(document.querySelector('.dcb-dcbest-analysis-indicator')), next: box(document.querySelector('#after')),
      controls: [...card.querySelectorAll('button')].map(box), position: getComputedStyle(card).position,
      documentFits: document.documentElement.scrollWidth <= innerWidth };
  }, cardSelector);
  assert.equal(geometry.position, 'static');
  assert.equal(geometry.documentFits, true);
  assert.ok(geometry.card.left >= geometry.cell.left && geometry.card.right <= geometry.cell.right + 1, JSON.stringify(geometry));
  assert.ok(geometry.source.bottom <= geometry.card.top + 1, 'source badge retains its own line above the activity card');
  assert.ok(geometry.source.left >= geometry.cell.left && geometry.source.right <= geometry.cell.right + 1, 'source badge stays readable within its native title cell');
  assert.ok(geometry.card.right <= geometry.author.left + 1, 'activity card stays out of the author column');
  assert.ok(geometry.card.bottom <= geometry.next.top + 1, 'the next list row flows below the card');
  for (const button of geometry.controls) {
    assert.ok(button.left >= geometry.card.left && button.right <= geometry.card.right + 1);
    assert.ok(button.top >= geometry.card.top && button.bottom <= geometry.card.bottom + 1);
  }
}

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  test(`${name}: activity status card separates source badges, columns and adjacent rows`, async () => {
    const browser = await engine.launch({ executablePath: engine.executablePath() });
    const f = await fixture(browser);
    try {
      const originalNextTop = await f.page.locator('#after').evaluate(node => node.getBoundingClientRect().top);
      await f.page.locator('#postLink').click();
      await f.page.locator(`${cardSelector}[data-state="checking"]`).waitFor();
      await f.page.waitForTimeout(220);
      assert.equal(await f.page.locator('#postLink').getAttribute('aria-busy'), 'true');
      assert.equal(await f.page.locator('.dcb-activity-navigation-copy').getAttribute('aria-live'), 'polite');
      assert.equal(await f.page.locator(cardSelector).evaluate(node => getComputedStyle(node).animationDuration), '0.18s');
      await assertNativeColumns(f.page);
      await fs.mkdir(artifacts, { recursive: true });
      await f.page.screenshot({ path: path.join(artifacts, `${name}-pending.png`) });
      await f.page.evaluate(() => resolveActivity({ available: false, shouldHide: false, reason: 'BUDGET' }));
      await f.page.locator(`${cardSelector}[data-state="unavailable"]`).waitFor();
      await assertNativeColumns(f.page);
      assert.equal(await f.page.getByRole('button', { name: '확인 없이 열기', exact: true }).count(), 1);
      assert.match(await f.page.locator('.dcb-activity-navigation-detail').textContent(), /제목을 다시 눌러/);
      await f.page.screenshot({ path: path.join(artifacts, `${name}-unavailable.png`) });
      await f.page.locator('#postLink').focus();
      await f.page.keyboard.press('Enter');
      await f.page.locator(`${cardSelector}[data-state="unavailable"]`).waitFor();
      assert.equal(await f.page.evaluate(() => activityCalls), 1, 'retry presentation retains the cached verdict and request budget');
      const cancel = f.page.getByRole('button', { name: '취소', exact: true });
      await f.page.locator('#postLink').focus();
      await f.page.keyboard.press('Tab'); // Native reply-count link.
      await f.page.keyboard.press('Tab'); // Bypass.
      await f.page.keyboard.press('Tab'); // Cancel.
      assert.equal(await cancel.evaluate(node => document.activeElement === node), true);
      assert.equal(await cancel.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
      await cancel.press('Enter');
      assert.equal(await f.page.locator(cardSelector).count(), 0);
      assert.equal(await f.page.locator('#postLink').evaluate(node => document.activeElement === node), true);
      assert.equal(await f.page.locator('#postLink').getAttribute('aria-busy'), null);
      assert.equal(await f.page.locator('.dcb-dcbest-analysis-label').textContent(), '원출처 분석 중');
      assert.equal(await f.page.locator('#after').evaluate(node => node.getBoundingClientRect().top), originalNextTop);
      assert.deepEqual(f.errors, []);
    } finally { await f.context.close();await browser.close(); }
  });

  test(`${name}: dark narrow activity card supports reduced motion and keyboard bypass`, async () => {
    const browser = await engine.launch({ executablePath: engine.executablePath() });
    const f = await fixture(browser, { narrow: true });
    try {
      await f.page.locator('#postLink').click({ modifiers: ['Control'] });
      await f.page.evaluate(() => resolveActivity({ available: false, shouldHide: false, reason: 'NO_TOKEN' }));
      await f.page.locator(`${cardSelector}[data-state="unavailable"]`).waitFor();
      await assertNativeColumns(f.page);
      assert.equal(await f.page.locator(cardSelector).evaluate(node => getComputedStyle(node).animationName), 'none');
      const bypass = f.page.getByRole('button', { name: '확인 없이 열기', exact: true });
      assert.equal(await bypass.evaluate(node => getComputedStyle(node).transitionDuration), '0s');
      await f.page.locator('#postLink').focus();
      await f.page.keyboard.press('Tab');
      await f.page.keyboard.press('Tab');
      assert.equal(await bypass.evaluate(node => document.activeElement === node), true);
      await fs.mkdir(artifacts, { recursive: true });
      await f.page.screenshot({ path: path.join(artifacts, `${name}-narrow-dark.png`) });
      await bypass.press('Enter');
      await f.page.waitForFunction(() => activityRelays.length === 1 && !document.querySelector('.dcb-activity-navigation-status'));
      assert.equal(await f.page.evaluate(() => activityCalls), 1);
      assert.equal(f.page.url(), listUrl);
      assert.deepEqual(f.errors, []);
    } finally { await f.context.close();await browser.close(); }
  });
}
