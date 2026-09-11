/* Optional integration test: build/fetch the detector before running this file. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const files = [];
const errors = [];
const outsideRequests = [];
let browser;
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (!/^\/(?:vendor\/detector\/|models\/conflict\/|src\/offscreen\/detection\.html$)/.test(pathname) || pathname.includes('..')) {
    response.writeHead(404).end();
    return;
  }
  const file = path.join(root, pathname);
  if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
  files.push(pathname);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' }[path.extname(file)] || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': fs.statSync(file).size,
    'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'"
  });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const localChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || (fs.existsSync(localChrome) ? localChrome : undefined) });
  const page = await browser.newPage();
  await page.clock.install();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(message.text());
  });
  await page.context().route('**/*', route => {
    if (!route.request().url().startsWith(origin + '/')) {
      outsideRequests.push(route.request().url());
      route.abort();
    } else route.continue();
  });
  await page.addInitScript(({ origin }) => {
    window.inferenceListener = null;
    window.chrome = { runtime: {
      id: 'local-runtime-test', getURL: file => new URL(file, origin + '/').href,
      onMessage: { addListener(listener) { window.inferenceListener = listener; } }
    } };
    window.requestInference = (items, sender) => new Promise(resolve => {
      const result = window.inferenceListener({ type: 'DCB_INFERENCE', target: 'detection-offscreen', items }, sender || {
        id: chrome.runtime.id, url: chrome.runtime.getURL('src/background/background.js')
      }, resolve);
      if (result !== true) resolve({ ignored: true });
    });
  }, { origin });
  await page.goto(origin + '/src/offscreen/detection.html');
  await page.waitForFunction(() => typeof window.inferenceListener === 'function');
  const invalid = await page.evaluate(() => requestInference([{ title: 'bad', body: 'bad' }]));
  assert.deepEqual(invalid, { ok: false, error: 'invalid-request' });
  const rejected = await page.evaluate(() => requestInference([{ kind: 'comment', title: '', body: '본문' }], {
    id: chrome.runtime.id, url: 'https://gall.dcinside.com/board/view/?id=test', tab: { id: 1 }
  }));
  assert.deepEqual(rejected, { ignored: true });
  const popupRejected = await page.evaluate(() => requestInference([{ kind: 'comment', title: '', body: '본문' }], {
    id: chrome.runtime.id, url: chrome.runtime.getURL('src/ui/popup/popup.html')
  }));
  assert.deepEqual(popupRejected, { ignored: true });
  assert.equal(files.some(file => file.endsWith('.onnx')), false, 'invalid/unauthorized requests never load the model');

  const start = Date.now();
  const first = await page.evaluate(() => requestInference([
    { kind: 'post', title: '오늘 산책', body: '날씨가 좋아서 공원에 다녀왔습니다. 모두 좋은 하루 보내세요.' },
    { kind: 'comment', title: '오늘 뉴스', body: '너 같은 쓰레기들은 입 다물고 꺼져라. 개소리하지 마.' }
  ]));
  assert.equal(first.ok, true, JSON.stringify({ first, errors }));
  assert.equal(first.results.length, 2);
  for (const item of first.results) assert.ok(Number.isFinite(item.score) && item.score >= 0 && item.score <= 1);
  const firstMs = Date.now() - start;
  const cachedStart = Date.now();
  const cached = await page.evaluate(() => requestInference([
    { kind: 'post', title: '오늘 산책', body: '날씨가 좋아서 공원에 다녀왔습니다. 모두 좋은 하루 보내세요.' },
    { kind: 'comment', title: '오늘 뉴스', body: '너 같은 쓰레기들은 입 다물고 꺼져라. 개소리하지 마.' }
  ]));
  assert.deepEqual(cached, first);
  const cachedMs = Date.now() - cachedStart;
  const longStart = Date.now();
  const long = await page.evaluate(() => requestInference([
    { kind: 'comment', title: '긴 댓글', body: '내용이 길어도 정해진 토큰 길이 안에서 분석합니다. '.repeat(200).slice(0, 6000) },
    { kind: 'comment', title: '', body: '' }
  ]));
  assert.equal(long.ok, true, JSON.stringify({ long, errors }));
  assert.ok(long.results.every(item => Number.isFinite(item.score) && item.score >= 0 && item.score <= 1));
  assert.equal(files.filter(file => file.endsWith('/model.onnx')).length, 1, 'reuse one model session');
  assert.ok(files.some(file => file.endsWith('/inference-worker.js')), 'inference executes in the packaged dedicated worker');
  assert.equal(outsideRequests.length, 0, 'all code, model, and tokenizer resources are local');
  const longMs = Date.now() - longStart;
  const idleClose = page.workers()[0].waitForEvent('close');
  await page.clock.fastForward(5 * 60_000 + 1);
  await idleClose;
  assert.equal(page.workers().length, 0, 'idle worker is terminated to release model memory and cached text');
  const timeoutWorker = page.waitForEvent('worker');
  await page.evaluate(() => {
    window.timeoutResult = null;
    requestInference([{ kind: 'post', title: '시간 제한', body: '검증' }]).then(result => { window.timeoutResult = result; });
  });
  const timeoutClose = (await timeoutWorker).waitForEvent('close');
  await page.clock.fastForward(90_001);
  await timeoutClose;
  assert.deepEqual(await page.evaluate(() => window.timeoutResult), { ok: false, error: 'model-timeout' });
  assert.equal(page.workers().length, 0, 'a timed-out worker is terminated');
  const recovered = await page.evaluate(() => requestInference([{ kind: 'comment', title: '', body: '시간 제한 이후에도 정상적으로 분석합니다.' }]));
  assert.equal(recovered.ok, true, 'a timeout does not leave the queue stuck');
  assert.equal(outsideRequests.length, 0);
  console.log(JSON.stringify({ ok: true, firstMs, cachedMs, longMs, first, long, idleCleanup: true, timeoutRecovery: true, files, warnings: errors }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
