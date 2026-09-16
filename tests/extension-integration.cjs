/* Actual unpacked MV3 extension; browser profile and test data are isolated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const resultsDir = path.join(root, 'test-results');
const downloadedChrome = path.join(resultsDir, 'browsers/chromium-1234/chrome-win64/chrome.exe');
const executablePath = process.env.BROWSER_EXECUTABLE || (fs.existsSync(downloadedChrome) ? downloadedChrome : chromium.executablePath());
const errors = [];
const intercepted = [];
let context;

async function until(check, description, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}; errors=${JSON.stringify(errors)}`);
}

(async () => {
  fs.mkdirSync(resultsDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(resultsDir, 'extension-profile-'));
  context = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath, viewport: { width: 1080, height: 900 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  const recordPage = page => {
    page.on('pageerror', error => errors.push({ page: page.url(), error: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ page: page.url(), error: message.text() });
    });
  };
  context.pages().forEach(recordPage);
  context.on('page', recordPage);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 30_000 });
  const extensionId = new URL(worker.url()).hostname;
  const extensionOrigin = `chrome-extension://${extensionId}`;
  const start = Date.now();
  const defaults = await until(async () => {
    const values = await worker.evaluate(() => chrome.storage.sync.get(['previewEnabled', 'dcbApplyFontToDc']));
    return typeof values.dcbApplyFontToDc === 'boolean' ? values : null;
  }, 'installation defaults');
  assert.deepEqual(defaults, { previewEnabled: true, dcbApplyFontToDc: false });

  const commentText = '내용이 길어도 정해진 토큰 길이 안에서 분석합니다. '.repeat(200).slice(0, 6000);
  const fixture = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>긴 댓글</title>
    <style>body{font:14px Arial;padding:25px;color:#111;background:#fff}.write_div{padding:12px;border:1px solid #ddd}
    .cmt_txtbox{margin:16px 0;padding:12px;max-width:850px}.usertxt{max-height:170px;overflow:auto;line-height:1.7}</style>
    <main><div class="gallview_head"><h3 class="title_subject">긴 댓글</h3></div>
    <div class="write_div">날씨가 좋아서 공원에 다녀왔습니다. 모두 좋은 하루 보내세요.</div>
    <ul class="cmt_list"><li class="ub-content" data-no="1"><div class="cmt_info">
    <div class="cmt_txtbox"><p class="usertxt" id="fixture-comment">${commentText}</p></div></div></li></ul></main></html>`;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(extensionOrigin)) return route.continue();
    intercepted.push(url);
    if (url.startsWith('https://gall.dcinside.com/board/view/')) {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
    }
    if (url.includes('fonts.googleapis.com')) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await worker.evaluate(async () => {
    globalThis.testDetectionMessages = [];
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (message?.type === 'DCB_DETECT_TEXT') testDetectionMessages.push({ sender: { id: sender.id, url: sender.url, tabId: sender.tab?.id }, count: message.items?.length });
    });
    await chrome.storage.sync.set({
      enabled: false, galleryBlockEnabled: false, builtinDcbestBlockEnabled: false, userBlockEnabled: false,
      hideDCGray: false, showMemberIpInfo: false, showUidBadge: false, userMemoEnabled: false,
      hideMainEnabled: false, hideGallEnabled: false, hideSearchEnabled: false,
      gamemecaBlockEnabled: false, doryBlockEnabled: false, noticeBlockEnabled: false,
      dcbTextDetection: { enabled: true, posts: true, comments: true, sensitivity: 'sensitive' }
    });
  });
  const dc = await context.newPage();
  await dc.goto('https://gall.dcinside.com/board/view/?id=codex_fixture&no=1');
  await until(async () => {
    const value = await worker.evaluate(() => chrome.storage.session.get('dcbDetectionStatus'));
    if (value.dcbDetectionStatus?.state === 'error') throw new Error(`Actual extension inference failed: ${JSON.stringify(value)}`);
    return value.dcbDetectionStatus?.state === 'ready';
  }, 'visible page inference ready', 90_000);
  await dc.locator('[data-dcb-text-detection-placeholder]').waitFor({ timeout: 10_000 });
  const hiddenCount = await dc.locator('[data-dcb-text-detection-hidden="1"]').count();
  assert.ok(hiddenCount > 0);
  assert.equal(await dc.locator('[data-dcb-text-detection-placeholder]').first().getAttribute('data-dcb-text-detection-label'), '공격적 표현이 있는 댓글을 가렸습니다');
  assert.equal(await worker.evaluate(() => chrome.offscreen.hasDocument()), true);

  const cdp = await context.newCDPSession(dc);
  const worlds = [];
  cdp.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
  await cdp.send('Runtime.enable');
  let contentWorld;
  for (const world of worlds) {
    const value = await cdp.send('Runtime.evaluate', { expression: 'globalThis.chrome?.runtime?.id || null', contextId: world.id, returnByValue: true });
    if (value.result.value === extensionId) { contentWorld = world; break; }
  }
  assert.ok(contentWorld, 'real extension content script isolated world exists');
  const message = { type: 'DCB_DETECT_TEXT', items: [{ kind: 'comment', title: '긴 댓글', body: commentText }] };
  const scoreResponse = await cdp.send('Runtime.evaluate', {
    expression: `chrome.runtime.sendMessage(${JSON.stringify(message)})`, contextId: contentWorld.id, awaitPromise: true, returnByValue: true
  });
  assert.equal(scoreResponse.result.value?.ok, true, JSON.stringify(scoreResponse));
  const score = scoreResponse.result.value.results[0].score;
  assert.ok(Number.isFinite(score) && score >= 0 && score <= 1);
  const seen = await worker.evaluate(() => globalThis.testDetectionMessages);
  assert.ok(seen.some(item => item.sender.id === extensionId && Number.isInteger(item.sender.tabId) && item.sender.url.startsWith('https://gall.dcinside.com/')));

  const popup = await context.newPage();
  await popup.goto(extensionOrigin + '/src/ui/popup/popup.html');
  await popup.locator('[data-detection-status]').filter({ hasText: '분석 준비 완료' }).waitFor();
  assert.equal(await popup.locator('[data-detection-field="enabled"]').isChecked(), true);
  await popup.screenshot({ path: path.join(resultsDir, 'extension-popup.png'), fullPage: true });
  const options = await context.newPage();
  await options.goto(extensionOrigin + '/src/ui/options/options.html');
  await options.locator('[data-detection-status]').filter({ hasText: '분석 준비 완료' }).waitFor();
  assert.equal(await options.locator('[data-detection-field="enabled"]').isChecked(), true);
  await options.locator('[data-text-detection-settings]').screenshot({ path: path.join(resultsDir, 'extension-options-detection.png') });
  await popup.locator('[data-text-detection-settings] label.switch').click();
  await until(async () => (await worker.evaluate(() => chrome.storage.sync.get('dcbTextDetection'))).dcbTextDetection?.enabled === false, 'popup toggle storage update');
  await until(async () => await dc.locator('[data-dcb-text-detection-placeholder]').count() === 0, 'detected-content placeholders removed on OFF');
  assert.equal(await dc.locator('[data-dcb-text-detection-hidden="1"]').count(), 0);
  await until(async () => !(await worker.evaluate(() => chrome.offscreen.hasDocument())), 'offscreen released on OFF');
  await options.locator('[data-detection-status]').filter({ hasText: '꺼짐' }).waitFor();
  const disabled = await cdp.send('Runtime.evaluate', {
    expression: `chrome.runtime.sendMessage(${JSON.stringify(message)})`, contextId: contentWorld.id, awaitPromise: true, returnByValue: true
  });
  assert.deepEqual(disabled.result.value, { ok: false, error: 'disabled' });

  // Verify the manifest-delivered author stylesheet alongside real storage updates.
  await dc.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', `<div class="cmt_info"><div class="cmt_nickbox" style="width:133px;font:12px Arial">
      <span id="fixture-author" class="gall_writer ub-writer" data-uid="long_account_identifier_for_author_layout" data-nick="긴닉네임" data-ip="175.124">
        <span class="nickname" style="display:inline-flex"><em style="max-width:84px">긴닉네임이댓글본문으로넘어가지않습니다</em><span class="ip" style="font:11px Tahoma">(175.124)</span></span>
      </span></div></div>`);
  });
  await worker.evaluate(() => chrome.storage.sync.set({
    showUidBadge: true, userMemoEnabled: true, showMemberIpInfo: true,
    dcbApplyFontToDc: true, dcbFontScale: 140
  }));
  await dc.locator('#fixture-author .dcb-user-memo-trigger').waitFor();
  await dc.locator('#fixture-author .dcb-uid-badge').waitFor();
  await dc.locator('#fixture-author .dc-member-ip-chip').waitFor();
  await until(async () => dc.locator('#fixture-comment').evaluate(node => parseFloat(getComputedStyle(node).fontSize) > 19), 'body font resized');
  const authorLayout = await dc.locator('#fixture-author').evaluate(writer => {
    const bounds = writer.getBoundingClientRect();
    const tools = writer.querySelector('.dcb-writer-tools');
    const elements = writer.querySelectorAll('.nickname, .ip, .dc-member-ip-chip, .dcb-uid-badge, .dcb-user-memo-trigger');
    return {
      width: bounds.width, wrap: getComputedStyle(tools).flexWrap,
      withinColumn: [...elements].every(node => {
        const rect = node.getBoundingClientRect();
        return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
      }),
      authorFont: getComputedStyle(writer.querySelector('em')).fontSize,
      ipFont: getComputedStyle(writer.querySelector('.ip')).fontSize
    };
  });
  assert.deepEqual(authorLayout, { width: 133, wrap: 'wrap', withinColumn: true, authorFont: '12px', ipFont: '11px' });
  assert.deepEqual(errors, [], `unexpected page errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ ok: true, extensionId, installationDefaults: defaults, elapsedMs: Date.now() - start,
    visibleBadgeCount: badgeCount, score, contentMessages: seen.length, sender: seen[0].sender,
    popupAndOptions: true, disableCleanup: true, authorLayout, profile, intercepted }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await context?.close(); });
