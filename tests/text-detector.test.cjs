const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const path = require('node:path');
const { chromium } = require('playwright');

let browser;
before(async () => {
  browser = await chromium.launch({ headless: true,
    ...(process.env.DCB_TEST_BROWSER ? { executablePath: process.env.DCB_TEST_BROWSER } : {}) });
});
after(async () => { await browser?.close(); });

async function fixture(html, settings = { enabled: true }) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await page.route('**/*', (route) => route.abort());
  await page.setContent(html);
  await page.evaluate((initial) => {
    const listeners = [];
    const resolveRequests = [];
    window.requests = [];
    window.detectionSettings = initial;
    window.chrome = {
      storage: {
        sync: { get: (_defaults, callback) => callback({ dcbTextDetection: initial }) },
        onChanged: { addListener: (listener) => listeners.push(listener) }
      },
      runtime: {
        sendMessage: (message) => {
          window.requests.push(structuredClone(message));
          return new Promise((resolve) => resolveRequests.push(resolve));
        }
      }
    };
    window.resolveRequest = (index, response) => resolveRequests[index](response);
    window.setDetection = (value) => {
      window.detectionSettings = { ...window.detectionSettings, ...value };
      listeners.forEach((listener) => listener({ dcbTextDetection: { newValue: window.detectionSettings } }, 'sync'));
    };
    window.fetch = () => { throw new Error('The content detector must not fetch externally'); };
  }, settings);
  for (const file of ['src/shared/detection-config.js', 'src/content/detection/text-detector.js']) {
    await page.addScriptTag({ path: path.join(__dirname, '..', file) });
  }
  return page;
}

async function waitRequests(page, count) {
  await page.waitForFunction((expected) => window.requests.length >= expected, count);
  return page.evaluate(() => window.requests);
}

async function respond(page, index, score = 0.95) {
  await page.evaluate(({ index, score }) => {
    window.resolveRequest(index, { ok: true, results: window.requests[index].items.map(() => ({ score })) });
  }, { index, score });
}

const placeholderSelector = '[data-dcb-text-detection-placeholder]';

test('is opt in and sends only bounded text from post and comment bodies', async () => {
  const page = await fixture(`
    <h2 class="title_subject">현재 게시글 제목입니다<span class="gall_writer">작성자 비밀 아이디</span></h2>
    <article class="write_div" style="height:35px;overflow:hidden">게시글 본문입니다.
      <span class="gall_writer">본문 작성자 메타데이터</span><button>버튼을 누르십시오</button>
      <span hidden>숨겨진 비밀 메타데이터</span><textarea>작성 중인 비밀 댓글</textarea>
    </article>
    <div class="cmt_info"><div class="cmt_txtbox"><p class="usertxt" id="comment">댓글 본문을 확인하는 내용입니다.</p></div></div>
    <div class="cmt_info"><div class="cmt_txtbox"><div class="coment_dccon_txt"><p class="txtcon_txt">이 텍스트콘은 모델에 보내지 않습니다</p></div></div></div>
    <div class="cmt_info"><p class="usertxt">짧아요</p></div>
    <form><div class="write_div">전송하면 안 되는 편집 중인 게시글입니다.</div><p class="reply_txt">작성 중인 댓글입니다.</p></form>
    <div class="comment_txt" contenteditable="true">편집 중인 입력 값입니다.</div>
  `, { enabled: false });
  try {
    await page.waitForTimeout(260);
    assert.equal(await page.evaluate(() => window.requests.length), 0);
    await page.evaluate(() => window.setDetection({ enabled: true }));
    const messages = await waitRequests(page, 1);
    assert.equal(messages[0].type, 'DCB_DETECT_TEXT');
    assert.equal(messages[0].items.length, 2);
    assert.deepEqual(messages[0].items.map((item) => item.kind), ['post', 'comment']);
    assert.equal(messages[0].items[0].body, '게시글 본문입니다.');
    assert.equal(messages[0].items[0].title, '현재 게시글 제목입니다');
    const payload = JSON.stringify(messages);
    for (const omitted of ['비밀', '메타데이터', '텍스트콘', '짧아요', '입력 값', '작성 중인', '버튼']) {
      assert.ok(!payload.includes(omitted), `Unexpected model input: ${omitted}`);
    }
    await respond(page, 0);
    await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 2, placeholderSelector);
    assert.deepEqual(await page.locator(placeholderSelector).evaluateAll(nodes => nodes.map(node => node.dataset.dcbTextDetectionLabel).sort()),
      ['공격적 표현이 있는 게시글을 가렸습니다', '공격적 표현이 있는 댓글을 가렸습니다'].sort());
    assert.equal(await page.locator('#comment').getAttribute('data-dcb-text-detection-hidden'), '1');
    assert.equal(await page.locator('#comment').evaluate((node) => getComputedStyle(node).display), 'none');
    await page.locator(`${placeholderSelector} button`).last().click();
    assert.notEqual(await page.locator('#comment').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator(placeholderSelector).count(), 1);

    await page.evaluate(() => {
      document.querySelector('.title_subject').textContent = '제'.repeat(800);
      document.querySelector('.write_div').textContent = '본문 '.repeat(3000);
    });
    const next = await waitRequests(page, 2);
    const post = next[1].items.find((item) => item.kind === 'post');
    assert.equal(post.title.length, 500);
    assert.equal(post.body.length, 6000);
  } finally { await page.close(); }
});

test('rejects stale text and settings results and removes an existing badge on text edits', async () => {
  const page = await fixture('<div class="cmt_info"><p class="usertxt" id="body">처음 작성된 댓글 본문입니다.</p></div>');
  try {
    await waitRequests(page, 1);
    await page.evaluate(() => { document.querySelector('#body').textContent = '새롭게 수정된 댓글 본문입니다.'; });
    await respond(page, 0);
    const messages = await waitRequests(page, 2);
    assert.equal(await page.locator(placeholderSelector).count(), 0);
    assert.equal(messages[1].items[0].body, '새롭게 수정된 댓글 본문입니다.');
    await respond(page, 1);
    await page.waitForSelector(placeholderSelector);
    await page.evaluate(() => { document.querySelector('#body').textContent = '세 번째로 변경한 댓글 내용입니다.'; });
    assert.equal(await page.locator(placeholderSelector).count(), 0);
    await waitRequests(page, 3);
    await page.evaluate(() => window.setDetection({ enabled: false }));
    await respond(page, 2);
    await page.waitForTimeout(260);
    assert.equal(await page.locator(placeholderSelector).count(), 0);
    assert.equal(await page.evaluate(() => window.requests.length), 3);
    await page.evaluate(() => window.setDetection({ enabled: true }));
    await waitRequests(page, 4);
    await respond(page, 3);
    await page.waitForSelector(placeholderSelector);
    await page.evaluate(() => window.setDetection({ comments: false }));
    assert.equal(await page.locator(placeholderSelector).count(), 0);
  } finally { await page.close(); }
});

test('discovers dynamic preview comments with the preview title and waits for offscreen comments', async () => {
  const page = await fixture(`
    <h2 class="title_subject">원래 페이지 제목입니다</h2><div id="host"></div>
    <div class="cmt_info" style="margin-top:2200px"><p class="usertxt" id="far">아직 화면에 들어오지 않은 댓글입니다.</p></div>
    <div class="cmt_info" hidden><p class="usertxt">숨겨진 댓글은 분석하지 않습니다.</p></div>
  `, { enabled: true, posts: false });
  try {
    await page.waitForTimeout(260);
    assert.equal(await page.evaluate(() => window.requests.length), 0);
    await page.evaluate(() => {
      document.querySelector('#host').innerHTML = '<div id="dcb-preview-overlay"><h3 class="dcbpv-title">미리보기 게시글 제목입니다</h3><article class="dcbpv-article">게시글 분석 설정은 꺼져 있습니다.</article><div class="dcbpv-comment-item" data-uid="private-account"><div class="dcbpv-comment-meta">작성자 이름과 아이디</div><div class="dcbpv-comment-body"><p class="usertxt">동적으로 삽입된 미리보기 댓글입니다.</p></div></div></div>';
    });
    const messages = await waitRequests(page, 1);
    assert.equal(messages[0].items.length, 1);
    assert.equal(messages[0].items[0].title, '미리보기 게시글 제목입니다');
    assert.equal(messages[0].items[0].kind, 'comment');
    assert.equal(messages[0].items[0].body, '동적으로 삽입된 미리보기 댓글입니다.');
    await respond(page, 0);
    await page.waitForSelector(`#dcb-preview-overlay ${placeholderSelector}`);
    await page.locator('#far').scrollIntoViewIfNeeded();
    const later = await waitRequests(page, 2);
    assert.equal(later[1].items.length, 1);
    assert.equal(later[1].items[0].body, '아직 화면에 들어오지 않은 댓글입니다.');
  } finally { await page.close(); }
});

test('bounds batches, caches repeat text, and does not reclassify its own badges', async () => {
  const html = Array.from({ length: 10 }, (_, index) => `<div class="cmt_info"><p class="usertxt" id="comment-${index}">서로 다른 댓글 본문을 테스트합니다 ${index}.</p></div>`).join('');
  const page = await fixture(html);
  try {
    for (let index = 0; index < 3; index++) {
      const messages = await waitRequests(page, index + 1);
      assert.equal(messages[index].items.length, index === 2 ? 2 : 4);
      await respond(page, index);
    }
    await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 10, placeholderSelector);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.requests.length), 3);
    await page.evaluate(() => {
      const replacement = document.createElement('p');
      replacement.className = 'usertxt';
      replacement.id = 'replacement';
      replacement.textContent = '서로 다른 댓글 본문을 테스트합니다 0.';
      document.querySelector('#comment-0').replaceWith(replacement);
    });
    await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 10, placeholderSelector);
    assert.equal(await page.evaluate(() => window.requests.length), 3);
    await page.evaluate(() => window.setDetection({ enabled: false }));
    assert.equal(await page.locator(placeholderSelector).count(), 0);
  } finally { await page.close(); }
});

test('keeps 1000-comment pages lazy and keeps the warning box inside the native comment column', async () => {
  const rows = Array.from({ length: 1000 }, (_, index) => `<li class="ub-content"><div class="cmt_info" style="height:28px"><div class="cmt_nickbox" style="float:left;width:150px">작성자${index}</div><div class="cmt_txtbox" style="float:left;width:700px"><p class="usertxt">대량 댓글 성능 확인을 위한 충분히 긴 댓글 본문 ${index} 입니다.</p></div></div></li>`).join('');
  const page = await fixture(`<ul class="cmt_list">${rows}</ul>`, { enabled: true, posts: false, comments: true });
  try {
    const messages = await waitRequests(page, 1);
    assert.ok(messages[0].items.length <= 4, 'only one bounded viewport batch starts immediately');
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.requests.length), 1, 'offscreen comments are not eagerly queued while the first batch is pending');
    await respond(page, 0);
    await page.waitForSelector(placeholderSelector);
    const bounds = await page.locator(placeholderSelector).first().evaluate(node => {
      const box = node.getBoundingClientRect();
      const textBox = node.closest('.cmt_txtbox').getBoundingClientRect();
      const author = node.closest('.cmt_info').querySelector('.cmt_nickbox').getBoundingClientRect();
      return { box: { left: box.left, right: box.right }, textBox: { left: textBox.left, right: textBox.right }, author: { right: author.right } };
    });
    assert.ok(bounds.box.left >= bounds.textBox.left - 1 && bounds.box.right <= bounds.textBox.right + 1,
      'soft warning stays inside the comment text column');
    assert.ok(bounds.author.right <= bounds.textBox.left + 1, 'warning does not push or overlap the author column');
  } finally { await page.close(); }
});

test('pauses unavailable or malformed inference rather than repeatedly sending requests', async () => {
  for (const result of [{ ok: false, error: 'runtime-unavailable' }, { ok: true, results: [{ score: 99 }] }]) {
    const page = await fixture('<div class="cmt_info"><p class="usertxt">모델 오류 처리 확인용 댓글입니다.</p></div>');
    try {
      await waitRequests(page, 1);
      await page.evaluate((response) => window.resolveRequest(0, response), result);
      await page.evaluate(() => {
        const row = document.createElement('div');
        row.className = 'cmt_info';
        row.innerHTML = '<p class="usertxt">추가된 댓글에서도 반복 요청하지 않습니다.</p>';
        document.body.appendChild(row);
      });
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.requests.length), 1);
      assert.equal(await page.locator(placeholderSelector).count(), 0);
    } finally { await page.close(); }
  }
});
