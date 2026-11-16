const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium, firefox } = require('playwright');
const installContentRuntime = require('./helpers/content-runtime.cjs');

const placeholder = '[data-dcb-text-detection-placeholder="1"]';
const artifactDir = path.join(__dirname, '../test-results/ai-filter-ui');

async function fixture(browser, { mode = 'model', reducedMotion = 'no-preference', width = 1080 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 840 }, reducedMotion });
  await page.route('**/*', route => route.abort());
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6fa;color:#232a3a;font:14px/1.6 system-ui,sans-serif}
    main{max-width:840px;margin:44px auto;padding:28px;background:white;border:1px solid #e2e6ef;border-radius:16px}
    h1{font-size:23px;margin:0 0 10px}h2{font-size:15px;margin:30px 0 12px}.context{color:#758098;font-size:12px}
    .write_div{margin:24px 0}.cmt_info{display:flex;gap:16px;padding:16px 0;border-top:1px solid #e6e9f0}
    .gall_writer{width:70px;flex:none;font-size:12px;color:#627087}.cmt_txtbox{flex:1;min-width:0}.usertxt{margin:0}
    @media(max-width:600px){main{margin:16px 10px;padding:16px}.cmt_info{gap:10px}.gall_writer{width:48px}}
    @media(prefers-color-scheme:dark){body{background:#101722;color:#eef2fa}main{background:#172131;border-color:#35425a}}
  </style></head><body><main>
    <span class="context">디시갤 차단기 · 표현 필터</span><h1 class="title_subject">게시글 제목과 작성자 정보는 그대로 보여요</h1>
    <article id="original-post" class="write_div"><p>필터가 감지한 원래 게시글 본문입니다. 원문은 이 위치에 그대로 보존됩니다.</p></article>
    <h2>댓글</h2><div class="cmt_info"><span class="gall_writer">작성자</span><div class="cmt_txtbox"><p id="original-comment" class="usertxt">필터가 감지한 원래 댓글 본문입니다. 내용을 확인하려면 원문 보기를 누릅니다.</p></div></div>
  </main></body></html>`);
  await page.evaluate(({ mode }) => {
    const settings = { enabled: true, posts: true, comments: true, sensitivity: 'balanced' };
    window.detectRequests = [];
    window.storageWrites = [];
    window.chrome = {
      storage: {
        sync: { get: (_keys, callback) => { const value = { dcbTextDetection: settings }; callback?.(value); return Promise.resolve(value); } },
        local: { get: async defaults => defaults, set: async value => window.storageWrites.push(value) },
        onChanged: { addListener() {} }
      },
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async message => {
          if (message.type !== 'DCB_DETECT_TEXT') return { ok: true };
          window.detectRequests.push(structuredClone(message));
          return { ok: true, mode, results: message.items.map(() => ({ score: .98 })) };
        }
      }
    };
    window.fetch = () => { throw new Error('Content text must never be sent to an external service'); };
  }, { mode });
  await installContentRuntime(page);
  for (const file of ['src/shared/detection-config.js', 'src/content/detection/text-detector.js']) {
    await page.addScriptTag({ path: path.join(__dirname, '..', file) });
  }
  await page.waitForFunction(selector => document.querySelectorAll(selector).length === 2, placeholder);
  return page;
}

for (const [engineName, engine] of Object.entries({ chromium, firefox })) {
  test(`${engineName}: clear AI presentation, original reveal and stable rerender`, async () => {
    const browser = await engine.launch({ headless: true, executablePath: engine.executablePath() });
    const page = await fixture(browser);
    try {
      assert.deepEqual(await page.locator('.dcb-text-detection-badge').allTextContents(), ['AI 필터', 'AI 필터']);
      assert.deepEqual(await page.locator('.dcb-text-detection-title').allTextContents(), ['AI가 가린 게시글', 'AI가 가린 댓글']);
      assert.equal(await page.locator('[data-dcb-text-detection-hidden="1"]').count(), 2);
      assert.match(await page.locator('#original-post').textContent(), /원래 게시글/);
      assert.match(await page.locator('#original-comment').textContent(), /원래 댓글/);
      assert.equal(await page.locator(placeholder).first().getAttribute('role'), 'note');
      assert.match(await page.locator(placeholder).first().getAttribute('aria-label'), /가능성/);
      assert.match(await page.locator(placeholder).first().getAttribute('title'), /틀릴 수/);
      assert.equal(await page.locator(placeholder).first().evaluate(node => getComputedStyle(node).animationDuration), '0.22s');
      await page.waitForTimeout(280);
      await page.evaluate(selector => {
        window.placeholderBefore = document.querySelector(selector);
        window.placeholderMutations = 0;
        window.renderObserver = new MutationObserver(changes => { window.placeholderMutations += changes.length; });
        window.renderObserver.observe(window.placeholderBefore, { attributes: true, childList: true, subtree: true });
        window.requestsBefore = window.detectRequests.length;
        document.dispatchEvent(new CustomEvent('dcb-preview-content', { detail: { root: document.body } }));
        document.dispatchEvent(new Event('scroll'));
      }, placeholder);
      await page.waitForTimeout(220);
      assert.deepEqual(await page.evaluate(selector => ({
        same: window.placeholderBefore === document.querySelector(selector),
        mutations: window.placeholderMutations,
        reclassified: window.detectRequests.length - window.requestsBefore
      }), placeholder), { same: true, mutations: 0, reclassified: 0 });

      const button = page.getByRole('button', { name: '댓글 원문 이번만 보기' });
      await button.focus();
      assert.equal(await button.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
      await fs.mkdir(artifactDir, { recursive: true });
      await page.screenshot({ path: path.join(artifactDir, `${engineName}-model.png`) });
      await button.press('Enter');
      assert.equal(await page.locator(placeholder).count(), 1);
      assert.equal(await page.locator('#original-comment').getAttribute('data-dcb-text-detection-hidden'), null);
      assert.notEqual(await page.locator('#original-comment').evaluate(node => getComputedStyle(node).display), 'none');
      await page.evaluate(() => {
        const comment = document.querySelector('#original-comment');
        comment.replaceWith(comment.cloneNode(true));
      });
      await page.waitForTimeout(200);
      assert.equal(await page.locator(placeholder).count(), 1, 'show once survives a comment rerender');
      assert.equal(await page.locator('#original-comment').getAttribute('data-dcb-text-detection-hidden'), null);
    } finally { await page.close(); await browser.close(); }
  });

  test(`${engineName}: basic fallback is labelled honestly and reduced motion fits narrow comments`, async () => {
    const browser = await engine.launch({ headless: true, executablePath: engine.executablePath() });
    const page = await fixture(browser, { mode: 'basic', reducedMotion: 'reduce', width: 420 });
    try {
      assert.deepEqual(await page.locator('.dcb-text-detection-badge').allTextContents(), ['기본 표현 필터', '기본 표현 필터']);
      assert.deepEqual(await page.locator('.dcb-text-detection-title').allTextContents(), ['공격적 표현 감지로 가린 게시글', '공격적 표현 감지로 가린 댓글']);
      assert.equal(await page.locator('[data-dcb-text-detection-mode="model"]').count(), 0);
      assert.match(await page.locator(placeholder).first().getAttribute('title'), /기본 표현 규칙/);
      for (const box of await page.locator(placeholder).all()) {
        const result = await box.evaluate(node => {
          const rect = node.getBoundingClientRect(), parent = node.parentElement.getBoundingClientRect();
          return { fits: rect.left >= parent.left - 1 && rect.right <= parent.right + 1, animation: getComputedStyle(node).animationName };
        });
        assert.equal(result.fits, true);
        assert.equal(result.animation, 'none');
      }
      assert.equal(await page.locator('.dcb-text-detection-show').first().evaluate(node => getComputedStyle(node).transitionDuration), '0s');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.emulateMedia({ colorScheme: 'dark' });
      assert.equal(await page.locator(placeholder).first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(25, 36, 59)');
      await fs.mkdir(artifactDir, { recursive: true });
      await page.screenshot({ path: path.join(artifactDir, `${engineName}-basic-reduced-motion.png`) });
    } finally { await page.close(); await browser.close(); }
  });

  test(`${engineName}: unknown inference mode does not claim AI`, async () => {
    const browser = await engine.launch({ headless: true, executablePath: engine.executablePath() });
    const page = await fixture(browser, { mode: null });
    try {
      assert.deepEqual(await page.locator('.dcb-text-detection-badge').allTextContents(), ['표현 필터', '표현 필터']);
      assert.equal(await page.locator('[data-dcb-text-detection-mode="unknown"]').count(), 2);
    } finally { await page.close(); await browser.close(); }
  });
}
