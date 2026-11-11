const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
require('../src/shared/keyword-matcher.js');

const off = { profanity: false, politics: false, poll: false, promotion: false, hate: false };
const targets = { listTitle: true, viewTitle: true, viewBody: true, comments: true };

test('category rules handle Korean variants independently of literal user keywords', () => {
  const { prepareCategories, prepareKeywords, findKeyword } = globalThis.DCBKeywordMatcher;
  const examples = {
    profanity: ['욕설', '시１발', 'ㅆㅂ!', '미친새끼'],
    politics: ['정치', '대통령실', '국민의힘', '더불어민주당', '국회에서'],
    poll: ['투표', '갤투는?', '설문\t조사', '인기투표'],
    promotion: ['광고·홍보', '오픈채팅 문의', '추천인코드'],
    hate: ['혐오 표현', '장애충', '한녀충']
  };
  assert.deepEqual(prepareCategories(off), []);
  assert.deepEqual(prepareCategories({ politics: 'true', extra: true }), []);
  for (const [id, [label, ...samples]] of Object.entries(examples)) {
    const active = prepareCategories({ [id]: true });
    assert.equal(active.length, 1);
    assert.equal(active[0], prepareCategories({ [id]: true })[0]);
    for (const sample of samples) assert.equal(findKeyword(sample, active)?.label, label, sample);
  }
  const all = prepareCategories(Object.fromEntries(Object.keys(off).map(id => [id, true])));
  for (const safe of ['시발점', '시발 열차', '병신년', '시바견', 'ㄱㅅㅂ', '대선배', '정당한 요구', '정당 방위',
    '측정치', '국민의 힘으로', '제품 리뷰 가격 정보', '할머니와 장애인', '지역 주민 설문지 디자인']) {
    assert.equal(findKeyword(safe, all), null, safe);
  }
  const manual = prepareKeywords(['Ａ  B', 'a b', 'ㅅㅂ']);
  assert.equal(manual.length, 2);
  assert.equal(findKeyword('xxa\tBxx', manual).label, 'A  B');
  assert.equal(findKeyword('ㄱㅅㅂ', manual).label, 'ㅅㅂ'.normalize('NFKC'));
  assert.equal(findKeyword('ㅅㅂ', all.concat(manual)).label, '욕설');
});

test('an unpacked extension synchronizes categories, re-filters open pages and restores backups', async t => {
  const root = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext('', {
    headless: true, executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const origin = 'chrome-extension://' + new URL(worker.url()).hostname;
  const board = 'https://gall.dcinside.com/board/';
  const article = `<article class="gallview"><header class="gallview_head"><h3 class="title_subject">인기투표</h3>
    <span class="gall_writer" data-nick="작성자" data-uid="test"></span></header>
    <div class="write_div">국회의원 소식입니다. 오늘 열린 행사 소식을 전합니다.</div>
    <div id="comment_wrap"><ul class="cmt_list"><li class="ub-content" id="comment_li_1">
    <div class="cmt_info" data-no="1"><div class="gall_writer" data-nick="회원" data-uid="reader"></div>
    <div class="cmt_txtbox"><p class="usertxt">인기투표 해주세요</p></div></div></li></ul></div></article>`;
  const list = '<table class="gall_list"><tbody>' + ['인기투표', '수동등록', '오늘 소식'].map((title, i) =>
    `<tr class="ub-content" id="row${i}"><td class="gall_tit"><a href="/board/view/?id=fixture&no=${i+1}">${title}</a></td></tr>`).join('') + '</tbody></table>';
  await context.route(/^https?:/, route => {
    const url = route.request().url();
    if (!url.startsWith(board)) return route.abort();
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: url.includes('/lists/') ? list : article });
  });
  const options = await context.newPage();
  await options.goto(origin + '/src/ui/options/options.html');
  await options.waitForFunction(async () => {
    const state = await chrome.storage.local.get('dcbKeywordSettingsHotCacheV1');
    return !!state.dcbKeywordSettingsHotCacheV1 && !document.querySelector('#keywordBlockCategories input:checked');
  });
  await options.evaluate(targets => chrome.storage.sync.set({
    keywordBlockEnabled: true, blockedKeywords: ['수동등록'], keywordBlockTargets: targets,
    keywordHideEnabled: true, hiddenKeywords: ['직접숨김'], keywordHideTargets: targets,
    userBlockEnabled: false, galleryBlockEnabled: false, doryBlockEnabled: false, hideComment: false,
    showMemberIpInfo: false, hideAnonymousEnabled: false, hideForeignIpEnabled: false
  }), targets);
  const popup = await context.newPage();
  await popup.goto(origin + '/src/ui/popup/popup.html');
  const clickFlag = (page, id, field = 'keywordBlockCategories') => page.evaluate(([key, field]) =>
    document.querySelector(`#${field} input[value="${key}"]`).click(), [id, field]);
  const hideField = 'keywordHideCategories';
  for (const page of [options, popup]) await page.waitForFunction(() =>
    document.querySelectorAll('.keyword-categories input:enabled').length === 10);
  await Promise.all([clickFlag(options, 'poll'), clickFlag(popup, 'politics'),
    clickFlag(popup, 'promotion', hideField), clickFlag(options, 'poll', hideField)]);
  for (const page of [options, popup]) await page.waitForFunction(() =>
    document.querySelectorAll('#keywordBlockCategories input:checked').length === 2 &&
    document.querySelectorAll('#keywordHideCategories input:checked').length === 2);
  const enabled = { ...off, politics: true, poll: true };
  const hideFlags = { ...off, promotion: true, poll: true };
  await options.waitForFunction(async () => {
    const { dcbKeywordSettingsHotCacheV1: hot } = await chrome.storage.local.get('dcbKeywordSettingsHotCacheV1');
    return hot?.data.keywordBlockCategories?.politics && hot.data.keywordBlockCategories.poll
      && hot.data.keywordHideCategories?.promotion && hot.data.keywordHideCategories.poll;
  });
  const download = options.waitForEvent('download');
  await options.evaluate(() => exportSettings());
  const backup = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
  assert.deepEqual(backup.storage.sync.keywordBlockCategories, enabled);
  assert.deepEqual(backup.storage.sync.keywordHideCategories, hideFlags);
  assert.deepEqual(backup.storage.sync.hiddenKeywords, ['직접숨김']);
  assert.deepEqual(backup.storage.sync.blockedKeywords, ['수동등록']);

  const gallery = await context.newPage();
  await gallery.goto(board + 'lists/?id=fixture');
  const attached = (page, selector) => page.locator(selector).first().waitFor({ state: 'attached', timeout: 10000 });
  await attached(gallery, '#row0[data-dcb-list-keyword="투표"]');
  await attached(gallery, '#row1[data-dcb-list-keyword="수동등록"]');
  const view = await context.newPage();
  await view.goto(board + 'view/?id=fixture&no=1');
  await attached(view, '#dcb-keyword-article-overlay[data-block-key^="title:category:poll"]');
  await attached(view, '#comment_li_1[data-dcb-keyword-match="투표"]');
  // Supply deterministic HTML to the preview's existing fetch bridge in its
  // isolated world. The context-menu handler, parsing and filters are real.
  await options.evaluate(async ({ url, article }) => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [article], func: html => {
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (message, ...args) => message?.type === 'dcb.fetchText'
        ? args[0]({ ok: true, status: 200, finalUrl: message.url, text: html }) : send(message, ...args);
    } });
  }, { url: gallery.url(), article });
  await gallery.locator('#row2 a').click({ button: 'right' });
  await attached(gallery, '.dcbpv-article .dcbpv-filter-chip');
  await attached(gallery, '.dcbpv-comment-item[data-dcbpv-blocked-label="투표"]');
  assert.equal(await gallery.locator('.dcbpv-filter-reveal').count(), 0);
  await options.evaluate(targets => chrome.storage.sync.set({ keywordBlockTargets: { ...targets, viewTitle: false, comments: false } }), targets);
  await attached(view, '#dcb-keyword-article-overlay[data-block-key^="body:category:politics"]');
  await attached(view, '#comment_li_1:not([data-dcb-keyword-match])');
  await attached(gallery, '.dcbpv-comment-item[data-dcbpv-blocked-reason="keyword-hide"]');
  await attached(gallery, '.dcbpv-article .dcbpv-filter-chip[title="정치"]');
  await clickFlag(popup, 'poll');
  await attached(gallery, '#row0:not([data-dcb-list-hidden])');
  await attached(gallery, '#row0[data-dcb-keyword-soft-match="투표"]');
  assert.equal(await gallery.locator('#row1').getAttribute('data-dcb-list-keyword'), '수동등록');
  await options.evaluate(() => chrome.storage.sync.set({ keywordBlockEnabled: false }));
  await attached(view, 'html:not(.dcb-keyword-article-blocked)');
  await attached(gallery, '#row1:not([data-dcb-list-hidden])');
  await attached(view, '.write_div[data-dcb-keyword-soft-match="투표"]');
  await attached(view, '#comment_li_1[data-dcb-keyword-soft-match="투표"]');
  await gallery.locator('[data-dcbpv-reveal="article"]').click();
  assert.match(await gallery.locator('.dcbpv-article').innerText(), /국회의원/);
  await gallery.locator('[data-dcbpv-reveal^="comment-"]').click();
  await attached(gallery, '.dcbpv-comment-item:not(.dcbpv-filter-hidden)');
  await view.locator('[data-dcb-keyword-soft-placeholder]:has(+ #comment_li_1) button').click();
  assert.equal(await view.locator('#comment_li_1').isVisible(), true);
  await options.evaluate(() => chrome.storage.sync.set({ keywordHideEnabled: false }));
  await attached(gallery, '#row0:not([data-dcb-keyword-soft-hidden])');
  await attached(view, '.write_div:not([data-dcb-keyword-soft-hidden])');

  const restore = payload => options.evaluate(async raw => {
    const { sync, local, blockedUids } = parseBackupPayload(raw);
    await commitBackupImportCaches(sync, local, blockedUids);
    return chrome.storage.sync.get(['keywordBlockCategories', 'keywordHideCategories', 'blockedKeywords']);
  }, payload);
  assert.deepEqual(await restore({ data: { blockedKeywords: ['구버전'] } }),
    { keywordBlockCategories: off, keywordHideCategories: off, blockedKeywords: ['구버전'] });
  assert.deepEqual(await restore(backup), { keywordBlockCategories: enabled, keywordHideCategories: hideFlags, blockedKeywords: ['수동등록'] });
  await gallery.reload();
  await attached(gallery, '#row0[data-dcb-list-keyword="투표"]');
});
