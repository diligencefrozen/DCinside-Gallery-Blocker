const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
let browser;
before(async () => {
  const localChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || (fs.existsSync(localChrome) ? localChrome : undefined)
  });
});
after(async () => { await browser?.close(); });

async function openFixture(settings = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { font:14px Arial; } nav { font:12px monospace; }
    .gall_list { width:100%; table-layout:fixed; } .gall_tit { font-size:13px; }
    .title_subject { font-size:20px; } .write_div { font-size:16px; line-height:24px; }
    .write_div p { font-size:1em; } .write_div span { font-size:1em; }
    .cmt_txtbox { width:400px; font-size:13px; line-height:20px; }
    .dcbpv-html { font-size:14px; } .dcbpv-comment-body { font-size:13px; }
    .icon-reply { font-family:monospace; font-size:11px; }
    #inlineButton { font:12px Arial; width:65px; height:24px; }
  </style><nav id="navigation">갤러리 메뉴 <button id="navButton">검색</button></nav>
  <table class="gall_list"><tr><td id="listTitle" class="gall_tit"><a id="listLink">게시글 제목 <span id="listSpan">중첩</span></a></td></tr></table>
  <h3 class="title_subject" id="viewTitle">게시글 제목</h3>
  <div class="write_div" id="post"><p id="paragraph">본문 <span id="nested">중첩된 글자</span></p>
    <p id="authored" style="font-size:20px">작성자가 정한 큰 글자</p>
    <span class="icon-reply" id="icon">↳</span><button id="inlineButton">버튼</button>
    <div class="coment_dccon_txt"><p class="txtcon_txt" id="textcon">텍스트콘</p></div>
  </div>
  <div class="cmt_txtbox" id="comment"><p class="ub-word" id="memo">댓글 <span id="memoSpan">내용</span></p></div>
  <div class="dcbpv-html" id="previewBody"><p id="previewParagraph">미리보기 본문</p></div>
  <div class="dcbpv-comment-body" id="previewComment">미리보기 댓글</div>`);
  await page.evaluate(initial => {
    const listeners = [];
    window.testStore = { ...initial };
    window.testReads = [];
    window.deferReads = false;
    window.chrome = { runtime: {}, storage: {
      sync: {
        get(defaults, callback) {
          const snapshot = { ...defaults, ...window.testStore };
          if (window.deferReads) window.testReads.push(() => callback(snapshot));
          else callback(snapshot);
        },
        set(patch, callback) { window.setSettings(patch); callback?.(); }
      },
      onChanged: { addListener(fn) { listeners.push(fn); } }
    } };
    window.setSettings = patch => {
      const changes = {};
      for (const [key, value] of Object.entries(patch)) {
        changes[key] = { oldValue: window.testStore[key], newValue: value };
        window.testStore[key] = value;
      }
      listeners.forEach(listener => listener(changes, 'sync'));
    };
  }, settings);
  await page.addScriptTag({ path: path.join(root, 'src/content/appearance/font-config.js') });
  return page;
}

async function readAppearance(page, ids) {
  return page.evaluate(ids => Object.fromEntries(ids.map(id => {
    const node = document.getElementById(id);
    const css = getComputedStyle(node);
    return [id, { size: parseFloat(css.fontSize), family: css.fontFamily, line: css.lineHeight, width: node.getBoundingClientRect().width, style: node.getAttribute('style') }];
  })), ids);
}

test('fonts stay opt-in; OFF fully restores page text and preserves controls and icons', async () => {
  const page = await openFixture();
  try {
    const ids = ['post', 'paragraph', 'nested', 'authored', 'listTitle', 'listLink', 'listSpan', 'viewTitle', 'comment', 'memo', 'memoSpan', 'previewBody', 'previewParagraph', 'previewComment', 'navigation', 'navButton', 'icon', 'inlineButton', 'textcon'];
    const before = await readAppearance(page, ids);
    await page.addScriptTag({ path: path.join(root, 'src/content/appearance/font-manager.js') });
    assert.equal(await page.locator('#dcb-page-font-style').count(), 0);
    assert.deepEqual(await readAppearance(page, ids), before);

    await page.evaluate(() => setSettings({ dcbApplyFontToDc: true, dcbFontScale: 140, dcbFontFamily: 'Nanum Gothic' }));
    const scaled = await readAppearance(page, ids);
    for (const id of ids.slice(0, 14)) {
      assert.ok(Math.abs(scaled[id].size - before[id].size * 1.4) < 0.03, `${id} scales once from the native size`);
      assert.ok(scaled[id].family.includes('Nanum Gothic'));
    }
    for (const id of ids.slice(14)) assert.deepEqual(scaled[id], before[id], `${id} retains native appearance`);

    await page.evaluate(() => setSettings({ dcbFontScale: 120 }));
    const resized = await readAppearance(page, ['post', 'nested', 'memoSpan']);
    assert.equal(resized.post.size, 19.2);
    assert.equal(resized.nested.size, 19.2);
    assert.equal(resized.memoSpan.size, 15.6);

    await page.evaluate(() => setSettings({ dcbApplyFontToDc: false }));
    assert.equal(await page.locator('#dcb-page-font-style, #dcb-page-google-font, [data-dcb-font-size], [data-dcb-font-keep]').count(), 0);
    assert.deepEqual(await readAppearance(page, ids), before);
  } finally { await page.close(); }
});

test('dynamic comments and changed inline sizes scale from their native size', async () => {
  const page = await openFixture({ dcbApplyFontToDc: true, dcbFontScale: 130 });
  try {
    await page.addScriptTag({ path: path.join(root, 'src/content/appearance/font-manager.js') });
    await page.evaluate(() => {
      document.getElementById('comment').insertAdjacentHTML('beforeend', '<p id="added">새 댓글 <span id="addedSpan">중첩</span></p>');
      document.getElementById('authored').style.fontSize = '24px';
    });
    await page.waitForFunction(() => document.getElementById('addedSpan').hasAttribute('data-dcb-font-size'));
    const result = await readAppearance(page, ['added', 'addedSpan', 'authored']);
    assert.equal(result.added.size, 16.9);
    assert.equal(result.addedSpan.size, 16.9);
    assert.equal(result.authored.size, 31.2);
    assert.ok(parseFloat(result.authored.line) >= result.authored.size * 1.5, 'larger author text keeps sufficient line spacing');
    await page.evaluate(() => setSettings({ dcbApplyFontToDc: false }));
    assert.equal((await readAppearance(page, ['authored'])).authored.size, 24);
  } finally { await page.close(); }
});

test('writers and native user menus inside reading content retain their appearance', async () => {
  const page = await openFixture();
  try {
    await page.locator('#comment').evaluate(node => {
      node.insertAdjacentHTML('beforeend', `
        <div class="cmt_nickbox" id="authorBox">
          <span class="ub-writer" id="nestedWriter">
            <span class="nickname" id="nestedNickname"><em id="nestedName">긴 작성자 이름입니다</em></span>
            <span class="ip" id="nestedIp">(175.124)</span>
            <span class="dc-member-ip-chip" id="nestedCarrier">SKB</span>
            <span class="dcb-writer-tools" id="nestedTools"><button id="nestedMemo">메모 추가</button></span>
            <ul class="user_data_list" id="writerMenu"><li><a class="usertxt" id="writerMenuLink">갤로그 가기</a></li></ul>
          </span>
        </div>
        <ul class="user_data_list" id="separateMenu"><li><a id="separateMenuLink">사용자 차단</a></li></ul>
        <span class="dcb-writer-tools" id="separateTools"><span id="separateToolLabel">작성자 도구</span></span>
        <span class="dc-member-ip-chip" id="separateCarrier">KT</span>`);
    });
    await page.locator('#previewBody').evaluate(node => {
      node.insertAdjacentHTML('beforeend', '<span class="gall_writer" id="previewWriter"><span class="nickname" id="previewNickname">미리보기 작성자</span></span>');
    });
    const authorIds = [
      'authorBox', 'nestedWriter', 'nestedNickname', 'nestedName', 'nestedIp',
      'nestedCarrier', 'nestedTools', 'nestedMemo', 'writerMenu', 'writerMenuLink',
      'separateMenu', 'separateMenuLink', 'separateTools', 'separateToolLabel',
      'separateCarrier', 'previewWriter', 'previewNickname'
    ];
    const typography = async () => page.evaluate(ids => Object.fromEntries(ids.map(id => {
      const css = getComputedStyle(document.getElementById(id));
      return [id, { size: css.fontSize, family: css.fontFamily, line: css.lineHeight }];
    })), authorIds);
    const original = await typography();
    await page.addScriptTag({ path: path.join(root, 'src/content/appearance/font-manager.js') });
    await page.evaluate(() => setSettings({ dcbApplyFontToDc: true, dcbFontScale: 140, dcbFontFamily: 'Nanum Gothic' }));
    assert.deepEqual(await typography(), original, 'author identity, badges and menus retain native typography');
    const scaled = await readAppearance(page, ['memo', 'previewParagraph']);
    assert.equal(scaled.memo.size, 18.2, 'the surrounding comment still scales');
    assert.equal(scaled.previewParagraph.size, 19.6, 'the surrounding preview still scales');
    assert.equal(await page.locator('#writerMenuLink[data-dcb-font-size]').count(), 0, 'a reading class inside a user menu remains excluded');
    await page.evaluate(() => setSettings({ dcbApplyFontToDc: false }));
    assert.deepEqual(await typography(), original);
    assert.equal(await page.locator('[data-dcb-font-size], [data-dcb-font-keep]').count(), 0);
  } finally { await page.close(); }
});

test('a stale asynchronous storage response cannot re-enable a disabled font', async () => {
  const page = await openFixture({ dcbApplyFontToDc: true });
  try {
    await page.evaluate(() => { window.deferReads = true; });
    await page.addScriptTag({ path: path.join(root, 'src/content/appearance/font-manager.js') });
    await page.evaluate(() => {
      setSettings({ dcbApplyFontToDc: false });
      window.testReads[1]();
      window.testReads[0]();
    });
    assert.equal(await page.locator('#dcb-page-font-style, [data-dcb-font-size]').count(), 0);
  } finally { await page.close(); }
});

test('controls preview only the sample and reset restores opt-in defaults', async () => {
  const page = await openFixture({ dcbApplyFontToDc: true, dcbFontFamily: 'Nanum Gothic', dcbFontScale: 140 });
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', `<section>
        <select id="dcbFontFamily"></select><input id="dcbFontCustomFamily">
        <input type="range" id="dcbFontScale"><output id="dcbFontScaleValue"></output>
        <input type="checkbox" id="dcbApplyFontToDc"><p id="dcbFontHint"></p>
        <a id="dcbGoogleFontsLink">글꼴 찾기</a><p id="dcbFontPreview">가나다 123</p>
        <button id="dcbFontReset">기본값 복원</button>
      </section>`);
    });
    const original = await readAppearance(page, ['navigation', 'navButton']);
    await page.addScriptTag({ path: path.join(root, 'src/ui/shared/font-ui.js') });
    assert.deepEqual(await readAppearance(page, ['navigation', 'navButton']), original);
    const sample = await readAppearance(page, ['dcbFontPreview']);
    assert.equal(sample.dcbFontPreview.size, 19.6);
    assert.ok(sample.dcbFontPreview.family.includes('Nanum Gothic'));
    await page.locator('#dcbFontReset').click();
    assert.equal(await page.locator('#dcbApplyFontToDc').isChecked(), false);
    assert.equal(await page.locator('#dcbFontScale').inputValue(), '100');
    assert.deepEqual(await page.evaluate(() => window.testStore), {
      dcbApplyFontToDc: false, dcbFontFamily: 'Noto Sans KR', dcbFontScale: 100, dcbFontCustomFamily: ''
    });
    assert.deepEqual(await readAppearance(page, ['navigation', 'navButton']), original);
  } finally { await page.close(); }
});
