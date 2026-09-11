const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Run against a real layout engine; fixtures deliberately retain DC's conflicting styles.
const source = fs.readFileSync(path.join(__dirname, '../src/content/core/content_script.js'), 'utf8');
const previewSource = source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/, `
  window.previewTest = { renderPreview, normalizeDcMedia, stripUnsafe, dcMoviePlayerUrl, dcMovieMediaUrl,
    loadPreviewMovie, dcPollFrameUrl, normalizePreviewPollFrame, loadPreviewPoll, renderLoading, closePreview, openPreview,
    previewUrlFromTarget, isWeakPreviewData, mergePreviewData, buildCommentsHTML, commentRecordsToHtml, summarizeHiddenComments };
})();`);
const articleUrl = 'https://gall.dcinside.com/board/view/?id=fixture&no=10';
const listUrl = 'https://gall.dcinside.com/board/lists/?id=fixture';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body><button id="origin">원래 게시글</button></body></html>' }));
  await page.goto(listUrl);
  await page.evaluate(() => {
    window.previewEnabled = true;
    window.PREVIEW_COMMENT_DEBUG = false;
    window.testSettings = {};
    window.settingListeners = [];
    window.chrome = { storage: {
      sync: { get: (defaults, done) => done({ ...defaults, ...window.testSettings }) },
      local: { get: (defaults, done) => done(defaults) },
      onChanged: { addListener: (listener) => window.settingListeners.push(listener) }
    } };
  });
  await page.addScriptTag({ content: previewSource });
  await page.addStyleTag({ content: '.usertxt { width:1500px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .comment_wrap p { height:20px; }' });
  const previewContextTargets = await page.evaluate(() => {
    const row = document.createElement('table');
    row.innerHTML = `<tbody><tr class="ub-content">
      <td class="gall_tit"><a class="preview-title" href="/board/view/?id=fixture&no=77">테스트 글</a></td>
      <td class="gall_writer ub-writer" data-nick="안도노" data-uid="sunblock6891" data-ip="" data-loc="list">
        <div class="addbox"><span class="nickname in" title="안도노"><em>안도노</em></span><a class="writer_nikcon"><img title="sunblock68** : 갤로그로 이동합니다."></a></div>
      </td>
      <td class="gall_date">09.12</td>
    </tr></tbody>`;
    document.body.appendChild(row);
    const title = row.querySelector('.preview-title');
    const writer = row.querySelector('.gall_writer');
    const nickname = row.querySelector('.nickname em');
    const nikcon = row.querySelector('.writer_nikcon img');
    const date = row.querySelector('.gall_date');
    const result = {
      title: window.previewTest.previewUrlFromTarget(title),
      writer: window.previewTest.previewUrlFromTarget(writer),
      nickname: window.previewTest.previewUrlFromTarget(nickname),
      nikcon: window.previewTest.previewUrlFromTarget(nikcon),
      date: window.previewTest.previewUrlFromTarget(date)
    };
    row.remove();
    return result;
  });
  assert.equal(previewContextTargets.title, 'https://gall.dcinside.com/board/view/?id=fixture&no=77', 'title right-click still resolves the preview URL');
  assert.equal(previewContextTargets.date, 'https://gall.dcinside.com/board/view/?id=fixture&no=77', 'non-author list cells can still open the preview');
  assert.equal(previewContextTargets.writer, '', 'writer cell is reserved for user-block actions');
  assert.equal(previewContextTargets.nickname, '', 'writer nickname does not trigger page preview');
  assert.equal(previewContextTargets.nikcon, '', 'gallog icon inside writer cell does not trigger page preview');
  const sanitized = await page.evaluate((base) => {
    const doc = new DOMParser().parseFromString('<div class="sanitizer-fixture"></div>', 'text/html');
    const root = doc.querySelector('.sanitizer-fixture');
    root.innerHTML = `<script>parent.document.body.dataset.sanitizerProbe = 'script'</script>
      <object data="https://example.test/active"></object><embed src="https://example.test/active">
      <base href="https://example.test/"><meta http-equiv="refresh" content="0;url=https://example.test/">
      <link rel="stylesheet" href="https://example.test/style.css"><form action="https://example.test/"><input name="secret"></form>
      <iframe class="srcdoc-frame"></iframe><iframe class="script-frame" src="java&#x09;script:parent.document.body.dataset.sanitizerProbe='url'"></iframe>
      <a class="script-link" href="javascript:document.body.dataset.sanitizerProbe='link'" onclick="document.body.dataset.sanitizerProbe='handler'">unsafe link</a>
      <svg><a class="svg-link" xlink:href="javascript:document.body.dataset.sanitizerProbe='svg'">unsafe svg link</a></svg>
      <svg><a href="https://example.test/"><animate attributeName="href" values="javascript:document.body.dataset.sanitizerProbe='animated'"></animate>animated link</a></svg>
      <math><mtext><a href="javascript:document.body.dataset.sanitizerProbe='math'">math link</a></mtext></math>
      <img class="unsafe-image" src="data:image/svg+xml,unsafe" onerror="document.body.dataset.sanitizerProbe='image'">
      <img class="safe-image" src="/dccon.php?no=123"><video class="safe-video" poster="//dcimg.dcinside.com/poster.jpg"><source src="/uploads/movie.mp4"></video>
      <iframe class="safe-player" id="movieIcon123" src="/board/movie/movie_view?no=123&amp;token=keep"></iframe>
      <a class="safe-link" href="/board/view/?id=fixture&amp;no=11">safe link</a>`;
    root.querySelector('.srcdoc-frame').setAttribute('srcdoc', '<script>parent.document.body.dataset.sanitizerProbe = "srcdoc"</script>');
    window.previewTest.stripUnsafe(root, base);
    const result = {
      activeNodes: root.querySelectorAll('script,object,embed,base,meta,link,form,svg,math').length,
      srcdoc: root.querySelector('[srcdoc]') !== null,
      handlers: [...root.querySelectorAll('*')].some(node => [...node.attributes].some(attr => /^on/i.test(attr.name))),
      executableUrls: [...root.querySelectorAll('.script-frame,.script-link,.svg-link,.unsafe-image')]
        .some(node => node.hasAttribute('src') || node.hasAttribute('href') || node.hasAttribute('xlink:href')),
      image: root.querySelector('.safe-image').getAttribute('src'),
      video: root.querySelector('.safe-video source').getAttribute('src'),
      poster: root.querySelector('.safe-video').getAttribute('poster'),
      player: root.querySelector('.safe-player').getAttribute('src'),
      playerId: root.querySelector('.safe-player').id,
      link: root.querySelector('.safe-link').getAttribute('href')
    };
    const host = document.createElement('div');
    host.className = 'sanitizer-fixture-host';
    host.innerHTML = root.innerHTML;
    document.body.appendChild(host);
    host.querySelector('.script-link').click();
    return result;
  }, articleUrl);
  assert.deepEqual(sanitized, {
    activeNodes: 0, srcdoc: false, handlers: false, executableUrls: false,
    image: 'https://gall.dcinside.com/dccon.php?no=123',
    video: 'https://gall.dcinside.com/uploads/movie.mp4',
    poster: 'https://dcimg.dcinside.com/poster.jpg',
    player: 'https://gall.dcinside.com/board/movie/movie_view?no=123&token=keep',
    playerId: 'movieIcon123', link: 'https://gall.dcinside.com/board/view/?id=fixture&no=11'
  }, 'sanitization removes active HTML and executable URLs while preserving safe media and links');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.body.dataset.sanitizerProbe), undefined, 'sanitized HTML never executes against the parent page after insertion');
  await page.locator('.sanitizer-fixture-host').evaluate(node => node.remove());
  const mediaCases = [
    ['image only', '<img src="https://dcimg.dcinside.com/viewimage.php?id=photo">', false],
    ['video only', '<video controls src="https://dcm1.dcinside.co.kr/viewmovie.php?key=valid&type=mp4"></video>', false],
    ['video source only', '<video controls><source src="/uploads/movie.mp4" type="video/mp4"></video>', false],
    ['video with placeholder-like filename', '<video controls src="/uploads/loading.mp4"></video>', false],
    ['external iframe only', '<iframe src="https://www.youtube.com/embed/video123"></iframe>', false],
    ['native iframe only', '<iframe src="https://gall.dcinside.com/board/movie/movie_view?no=123"></iframe>', false],
    ['empty', '<p><br></p>', true],
    ['missing video source', '<video controls poster="https://dcimg.dcinside.com/poster.jpg"></video>', true],
    ['blank iframe', '<iframe src="about:blank"></iframe>', true],
    ['invalid movie ID', '<iframe src="https://gall.dcinside.com/board/movie/movie_view?no="></iframe>', true],
    ['empty image', '<img src="">', true],
    ['loading placeholder', '<img src="https://nstatic.dcinside.com/images/loading.gif">', true],
    ['deleted placeholder', '<img src="https://nstatic.dcinside.com/images/video_deleted.png" alt="삭제된 동영상">', true],
    ['broken image', '<img class="dcbpv-img-broken" src="https://dcimg.dcinside.com/photo.jpg">', true],
    ['script scheme', '<iframe src="javascript:alert(1)"></iframe>', true],
    ['embedded data', '<video src="data:video/mp4;base64,AA=="></video>', true],
    ['local file', '<img src="file:///private/image.jpg">', true],
    ['credential URL', '<img src="https://name:secret@example.com/photo.jpg">', true]
  ];
  const mediaResults = await page.evaluate(({ cases, url }) => cases.map(([name, articleHTML]) => [name,
    window.previewTest.isWeakPreviewData({ title: '미디어 게시글', articleHTML, url })
  ]), { cases: mediaCases, url: articleUrl });
  assert.deepEqual(mediaResults, mediaCases.map(([name, _html, weak]) => [name, weak]), 'media-only articles are valid without accepting empty or unsafe media');
  const mergedMedia = await page.evaluate((url) => {
    const primary = { title: '사진', url, articleHTML: '<img src="/images/noimg.png">', commentsHTML: '<p>댓글 유지</p>' };
    const backup = { title: '사진', url, articleHTML: '<img src="https://dcimg.dcinside.com/photo.jpg">' };
    return window.previewTest.mergePreviewData(primary, backup);
  }, articleUrl);
  assert.equal(mergedMedia.articleHTML, '<img src="https://dcimg.dcinside.com/photo.jpg">', 'valid media-only fallback replaces a placeholder');
  assert.equal(mergedMedia.commentsHTML, '<p>댓글 유지</p>');
  const data = {
    url: articleUrl, fetchedUrl: articleUrl, title: '길고 긴 댓글과 영상 미리보기 검증', writerHTML: '',
    articleHTML: '<p>본문의 내용입니다.</p>', counts: { up: '1', down: '0' }, commentTitle: '댓글 3개',
    commentsHTML: `<div class="dcbpv-comment-list">${['일반 댓글입니다. '.repeat(80), 'a'.repeat(1500), '답글 내용입니다. '.repeat(80)].map((text, index) => `<div class="dcbpv-comment-item${index === 2 ? ' reply' : ''}"><div class="dcbpv-comment-meta"><strong>${'긴닉네임'.repeat(30)}</strong><span>09.11 15:15:03</span></div><div class="dcbpv-comment-body"><div class="comment_wrap"><p class="usertxt">${text}</p></div></div></div>`).join('')}</div>`
  };
  for (const width of [1100, 540, 360]) {
    await page.setViewportSize({ width, height: 820 });
    await page.evaluate((fixture) => window.previewTest.renderPreview(fixture), data);
    await page.waitForTimeout(220);
    const layout = await page.evaluate(() => {
      const overlay = document.querySelector('#dcb-preview-overlay');
      const scroller = overlay.querySelector('.dcbpv-scroll');
      const cards = [...overlay.querySelectorAll('.dcbpv-comment-item')];
      return {
        overflow: scroller.scrollWidth > scroller.clientWidth + 1,
        commentsOverflow: cards.some((card) => card.scrollWidth > card.clientWidth + 1),
        footerVisible: overlay.querySelector('.dcbpv-actions').getBoundingClientRect().bottom <= innerHeight,
        wrapped: cards.every((card) => card.querySelector('.usertxt').getBoundingClientRect().height > 50),
        withinViewport: overlay.querySelector('.dcbpv-panel').getBoundingClientRect().right <= innerWidth
      };
    });
    assert.deepEqual(layout, { overflow: false, commentsOverflow: false, footerVisible: true, wrapped: true, withinViewport: true }, `${width}px layout`);
  }

  const normalized = await page.evaluate((base) => {
    const root = document.createElement('div');
    root.innerHTML = '<iframe id="movie_iframe_0" src="https://gall.dcinside.com/board/movie/movie_view?no=5345087&token=keep"></iframe><video src="/clip.mp4" autoplay loop muted></video><video class="dccon" src="/dccon.mp4"></video>';
    window.previewTest.normalizeDcMedia(root, base);
    window.previewTest.stripUnsafe(root, base);
    window.previewTest.normalizeDcMedia(root, base);
    const frame = root.querySelector('iframe');
    const videos = [...root.querySelectorAll('video')];
    return { src: frame.src, id: frame.id, wrappers: root.querySelectorAll('.dcbpv-movie-wrap').length,
      video: videos.map((video) => ({ controls: video.controls, autoplay: video.autoplay, loop: video.loop, muted: video.muted })),
      invalid: window.previewTest.dcMovieMediaUrl('javascript:alert(1)', base),
      unrelated: window.previewTest.dcMovieMediaUrl('https://evil.example/video.mp4', base) };
  }, articleUrl);
  assert.equal(normalized.src, 'https://gall.dcinside.com/board/movie/movie_view?no=5345087&token=keep');
  assert.equal(normalized.id, 'movieIcon5345087');
  assert.equal(normalized.wrappers, 1, 'media normalization is idempotent');
  assert.deepEqual(normalized.video, [
    { controls: true, autoplay: false, loop: false, muted: false },
    { controls: false, autoplay: true, loop: true, muted: true }
  ]);
  assert.equal(normalized.invalid, '');
  assert.equal(normalized.unrelated, '');

  const nativeMovie = await page.evaluate(async (base) => {
    const realFetch = window.fetch;
    let request;
    window.fetch = async (url, options) => {
      request = { url, referrer: options.referrer };
      return new Response('<video id="dc_mv" poster="https://dcm1.dcinside.co.kr/preview.jpg"><source src="https://dcm1.dcinside.co.kr/viewmovie.php?key=preserve&amp;type=mp4" type="video/mp4"></video>');
    };
    const wrapper = document.createElement('div');
    wrapper.className = 'dcbpv-movie-wrap';
    wrapper.innerHTML = '<iframe src="https://gall.dcinside.com/board/movie/movie_view?no=5345087&token=keep"></iframe>';
    document.body.append(wrapper);
    await window.previewTest.loadPreviewMovie(wrapper, base);
    const video = wrapper.querySelector('video');
    const result = { request, src: video?.src, controls: video?.controls, autoplay: video?.autoplay, iframeRemoved: !wrapper.querySelector('iframe') };
    video.dispatchEvent(new Event('error'));
    result.errorRestoresPlayer = !!wrapper.querySelector('iframe');
    wrapper.remove();
    window.fetch = realFetch;
    return result;
  }, articleUrl);
  assert.equal(nativeMovie.request.referrer, articleUrl);
  assert.match(nativeMovie.request.url, /no=5345087&token=keep/);
  assert.equal(nativeMovie.src, 'https://dcm1.dcinside.co.kr/viewmovie.php?key=preserve&type=mp4');
  assert.equal(nativeMovie.controls, true);
  assert.equal(nativeMovie.autoplay, false);
  assert.equal(nativeMovie.iframeRemoved, true);
  assert.equal(nativeMovie.errorRestoresPlayer, true);
  let nativePlayerRequest;
  await page.route('**/board/movie/movie_view?no=2468', async (route) => {
    if (route.request().resourceType() === 'fetch') nativePlayerRequest = route.request().headers();
    await route.fulfill({ contentType: 'text/html', body: '' });
  });
  const missingMediaFallback = await page.evaluate(async (base) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'dcbpv-movie-wrap';
    wrapper.innerHTML = '<iframe src="https://gall.dcinside.com/board/movie/movie_view?no=2468"></iframe>';
    document.body.append(wrapper);
    await window.previewTest.loadPreviewMovie(wrapper, base);
    const result = { originalPlayer: !!wrapper.querySelector('iframe'), fabricatedVideo: !!wrapper.querySelector('video') };
    wrapper.remove();
    return result;
  }, articleUrl);
  assert.equal(nativePlayerRequest?.referer, articleUrl, 'the browser sends the original article referrer on native player fetch');
  assert.deepEqual(missingMediaFallback, { originalPlayer: true, fabricatedVideo: false }, 'an empty player response keeps the original iframe');

  const pollData = {
    ...data,
    title: '투표 iframe 미리보기 검증',
    articleHTML: '<p><iframe name="pollFrame" width="459" height="437" src="https://gall.dcinside.com/board/poll/vote?no=2337944" referrerpolicy="unsafe-url" scrolling="no"></iframe></p>',
    commentsHTML: '<div class="dcbpv-comment-list"></div>'
  };
  const pollResult = await page.evaluate(async ({ fixture, article }) => {
    const realFetch = window.fetch;
    const requests = [];
    window.fetch = async (url, options = {}) => {
      requests.push({ url: String(url), referrer: options.referrer || '' });
      return new Response(`<!doctype html><html><body><div class="vote"><button id="poll-hydrated" type="button">투표하기</button></div><script>document.body.dataset.pollScript = 'ready';</script></body></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });
    };
    window.previewTest.renderPreview(fixture);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const frame = document.querySelector('#dcb-preview-overlay iframe.dcbpv-poll-frame');
    const rect = frame?.getBoundingClientRect();
    let innerReady = false;
    let scriptReady = false;
    try {
      innerReady = !!frame?.contentDocument?.querySelector('#poll-hydrated');
      scriptReady = frame?.contentDocument?.body?.dataset?.pollScript === 'ready';
    } catch (_) {}
    const result = {
      requests,
      scrolling: frame?.getAttribute('scrolling') || '',
      referrerPolicy: frame?.referrerPolicy || '',
      hydrated: frame?.dataset?.dcbpvPollHydrated === '1',
      width: rect?.width || 0,
      height: rect?.height || 0,
      aspectRatio: frame ? getComputedStyle(frame).aspectRatio : '',
      innerReady,
      scriptReady
    };
    window.fetch = realFetch;
    return result;
  }, { fixture: pollData, article: articleUrl });
  assert.equal(pollResult.requests[0]?.referrer, articleUrl, 'poll HTML is fetched with the original article as Referer');
  assert.match(pollResult.requests[0]?.url || '', /\/board\/poll\/vote\?no=2337944/);
  assert.equal(pollResult.scrolling, 'auto', 'poll iframe keeps controls reachable instead of clipping a fixed no-scroll frame');
  assert.equal(pollResult.referrerPolicy, 'unsafe-url');
  assert.equal(pollResult.hydrated, true, 'poll iframe is rehydrated with the article-referrer response');
  assert.equal(pollResult.innerReady, true, 'rehydrated poll content remains interactive HTML');
  assert.equal(pollResult.scriptReady, true, 'the native poll script context executes inside the same-origin frame');
  assert.ok(pollResult.height > pollResult.width * 0.7, 'poll iframe preserves its tall vote layout instead of being forced to 16:9');
  assert.equal(pollResult.aspectRatio, 'auto', 'poll iframe opts out of generic media aspect ratio');

  const packageMetadata = await page.evaluate((base) => {
    const doc = new DOMParser().parseFromString(`<div id="root"><div class="cmt_info" data-package-idx="8877"><div class="gall_writer" data-nick="tester"></div><div class="date_time">09.11 19:00:00</div><div class="cmt_txtbox"><div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">텍스트콘</p></div></div></div></div>`, 'text/html');
    const fromDom = window.previewTest.buildCommentsHTML(doc, doc.querySelector('#root'), base);
    const fromRecord = window.previewTest.commentRecordsToHtml([{
      name: 'tester',
      reg_date: '09.11 19:00:00',
      dccon_package_idx: '9988',
      memo: '<div class="coment_dccon_txt"><p class="txtcon_txt">레코드 텍스트콘</p></div>'
    }], base);
    return { fromDom, fromRecord };
  }, articleUrl);
  assert.match(packageMetadata.fromDom, /data-package-idx="8877"/, 'preview preserves DOM dccon package metadata for selective group blocking');
  assert.match(packageMetadata.fromRecord, /data-package-idx="9988"/, 'preview preserves comment-record dccon package metadata for selective group blocking');

  const textconData = { ...data, commentsHTML: '<div class="dcbpv-comment-item"><div class="dcbpv-comment-body"><div class="coment_dccon_txt cbg_3b4890"><p class="txtcon_txt ctxt_ffffff">탄약까지 사라진다면</p></div></div></div>' };
  await page.evaluate((fixture) => {
    window.testSettings.hideDccon = true;
    window.testSettings.hideTextCon = false;
    window.previewTest.renderPreview(fixture);
  }, textconData);
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.dcbpv-comment-item').isVisible(), false, 'hideDccon hides textcon as part of all DCCons');
  await page.evaluate(() => {
    window.testSettings.hideDccon = false;
    window.testSettings.hideTextCon = true;
    window.settingListeners.forEach((listener) => listener({
      hideDccon: { newValue: false, oldValue: true },
      hideTextCon: { newValue: true, oldValue: false }
    }, 'sync'));
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.dcbpv-comment-item').isVisible(), false, 'hideTextCon keeps textcon hidden after global DCCon hiding is turned off');
  await page.evaluate(() => {
    window.testSettings.hideTextCon = false;
    window.settingListeners.forEach((listener) => listener({ hideTextCon: { newValue: false, oldValue: true } }, 'sync'));
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.dcbpv-comment-item').isVisible(), true, 'turning hideTextCon off restores textcon');
  const textconLayout = await page.evaluate(() => {
    const body = document.querySelector('.dcbpv-comment-body');
    const textcon = body?.querySelector('.coment_dccon_txt');
    if (!body || !textcon) return null;
    const bodyRect = body.getBoundingClientRect();
    const textconRect = textcon.getBoundingClientRect();
    return { bodyWidth: bodyRect.width, textconWidth: textconRect.width, display: getComputedStyle(textcon).display };
  });
  assert.ok(textconLayout, 'textcon remains in the preview DOM');
  assert.equal(textconLayout.display, 'inline-block', 'preview keeps textcon shrink-wrapped instead of stretching it like a block');
  assert.ok(textconLayout.textconWidth < textconLayout.bodyWidth * 0.75, 'short textcon does not expand across the comment row');

  const observerStabilityData = {
    ...data,
    commentsHTML: '<div class="dcbpv-comment-list"><div class="dcbpv-comment-item"><div class="dcbpv-comment-body">일반 댓글</div></div></div>'
  };
  await page.evaluate((fixture) => {
    window.testSettings.hideDccon = true;
    window.testSettings.hideTextCon = false;
    window.previewTest.renderPreview(fixture);
  }, observerStabilityData);
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const body = document.querySelector('.dcbpv-comment-body');
    const img = document.createElement('img');
    img.src = 'https://dcimg5.dcinside.com/dccon.php?no=dynamic';
    body.append(img);
  });
  await page.waitForTimeout(220);
  const summaryBefore = await page.evaluate(() => {
    const summary = document.querySelector('.dcbpv-filter-summary');
    if (!summary) return null;
    summary.dataset.stabilityProbe = 'keep';
    return { text: summary.textContent, count: document.querySelectorAll('.dcbpv-filter-summary').length };
  });
  assert.deepEqual(summaryBefore, { text: '차단 설정에 따라 댓글 1개를 숨겼습니다.', count: 1 });
  await page.waitForTimeout(500);
  const summaryAfter = await page.evaluate(() => ({
    marker: document.querySelector('.dcbpv-filter-summary')?.dataset?.stabilityProbe || '',
    count: document.querySelectorAll('.dcbpv-filter-summary').length
  }));
  assert.deepEqual(summaryAfter, { marker: 'keep', count: 1 }, 'DCCon observer settles without repeatedly recreating the summary DOM');

  await page.evaluate(() => { window.previewTest.closePreview(); document.querySelector('#origin').focus(); window.previewTest.renderLoading(); });
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dcb-preview-overlay').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'origin');
  const closedRequest = await page.evaluate(async (url) => {
    let finish;
    window.chrome.runtime = { sendMessage: (_message, callback) => { finish = callback; } };
    const pending = window.previewTest.openPreview(url);
    window.previewTest.closePreview();
    finish({ ok: true, text: '<div class="write_div">늦게 도착한 본문</div>', finalUrl: url });
    await pending;
    return !document.querySelector('#dcb-preview-overlay');
  }, articleUrl);
  assert.equal(closedRequest, true, 'an aborted request never reopens the dialog');
  await page.evaluate((fixture) => window.previewTest.renderPreview(fixture), data);
  await page.locator('[data-act="share"]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#dcb-preview-overlay').contains(document.activeElement)), true);
  if (process.env.PREVIEW_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.PREVIEW_SCREENSHOT_DIR, { recursive: true });
    const screenshotData = { ...data, title: '미리보기에서 긴 댓글도 편하게 읽기', articleHTML: '<p>본문, 댓글, 동영상을 한 곳에서 확인할 수 있습니다.</p>', commentsHTML: `<div class="dcbpv-comment-list">${[false, true].map((reply) => `<div class="dcbpv-comment-item${reply ? ' reply' : ''}"><div class="dcbpv-comment-meta"><strong>${reply ? '글쓴이' : 'ㅇㅇ'}</strong><span>09.11 15:15:03</span></div><div class="dcbpv-comment-body"><p class="usertxt">${'긴 댓글도 화면 너비에 맞춰 자연스럽게 줄바꿈됩니다. 원문 보기와 공유 버튼은 스크롤 위치에 관계없이 사용할 수 있습니다. '.repeat(4)}</p></div></div>`).join('')}</div>` };
    for (const width of [1100, 360]) {
      await page.setViewportSize({ width, height: 820 });
      await page.evaluate((fixture) => window.previewTest.renderPreview(fixture), screenshotData);
      await page.waitForTimeout(220);
      await page.screenshot({ path: path.join(process.env.PREVIEW_SCREENSHOT_DIR, `preview-${width}.png`) });
    }
  }
  assert.deepEqual(errors, [], 'no uncaught page errors');
  await browser.close();
  console.log('Preview regression checks passed: sanitization, responsive layouts, movie and poll embeds, stable DCCon filtering, textcon toggle, dialog focus and close.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
