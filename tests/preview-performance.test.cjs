const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const source = fs.readFileSync(path.join(__dirname, '../src/content/core/content_script.js'), 'utf8');
const previewSource = source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/, `
  window.previewPerfTest = { openPreview, closePreview, previewPerformanceSnapshot, previewCacheKey,
    writePreviewCache, schedulePreviewOpen, cancelScheduledPreview };
})();`);

function articleUrl(id, no, suffix = '') {
  return `https://gall.dcinside.com/board/view/?id=${id}&no=${no}${suffix}`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' }));
    await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
    await page.evaluate(() => {
      window.previewEnabled = true;
      window.PREVIEW_COMMENT_DEBUG = false;
      window.__previewCalls = [];
      window.__previewDelays = {};
      window.__listenerCounts = {};
      window.__previewContentEvents = 0;
      const realAddEventListener = document.addEventListener.bind(document);
      document.addEventListener = (type, listener, options) => {
        window.__listenerCounts[type] = (window.__listenerCounts[type] || 0) + 1;
        return realAddEventListener(type, listener, options);
      };
      realAddEventListener('dcb-preview-content', () => { window.__previewContentEvents += 1; });
      const keyFromUrl = (value) => {
        const url = new URL(value);
        const parts = url.pathname.split('/').filter(Boolean);
        return url.searchParams.get('no') || parts.at(-1) || '';
      };
      const htmlFor = (value) => {
        const url = new URL(value);
        const parts = url.pathname.split('/').filter(Boolean);
        const no = keyFromUrl(value);
        const id = url.searchParams.get('id') || parts.at(-2) || 'fixture';
        return `<!doctype html><html><head><meta property="og:title" content="preview-${id}-${no}"></head><body>
          <article class="gallview"><header class="gallview_head"><span class="title_subject">preview-${id}-${no}</span><span class="gall_writer" data-nick="tester" data-uid="tester"></span></header>
          <div class="write_div"><p>preview body ${id}-${no} ${'content '.repeat(30)}</p><img src="https://dcimg.dcinside.com/${no}.jpg"></div>
          <div id="comment_wrap"><div class="cmt_info"><div class="gall_writer" data-nick="commenter" data-uid="commenter"></div><div class="cmt_txtbox"><p class="usertxt">comment ${no}</p></div></div></div></article>
        </body></html>`;
      };
      window.chrome = {
        runtime: {
          lastError: null,
          sendMessage(message, done) {
            if (message?.type !== 'dcb.fetchText') return done({ ok: false });
            const key = keyFromUrl(message.url);
            window.__previewCalls.push({ url: message.url, key });
            setTimeout(() => done({ ok: true, text: htmlFor(message.url), finalUrl: message.url, status: 200 }), window.__previewDelays[key] || 0);
          }
        },
        storage: {
          sync: { get: (defaults, done) => done(defaults) },
          local: { get: (defaults, done) => done(defaults) },
          onChanged: { addListener() {} }
        }
      };
    });
    await page.addScriptTag({ content: previewSource });

    const first = await page.evaluate(async (url) => {
      window.__previewDelays['201'] = 190;
      let overlayAdds = 0;
      let genericObserverPasses = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.id === 'dcb-preview-overlay') overlayAdds += 1;
          if (node.closest('[data-dcb-owned]')) continue;
          if (node.matches('.dcbpv-article') || node.querySelector('.dcbpv-article')) genericObserverPasses += 1;
        }
      });
      observer.observe(document.documentElement, { childList: true });
      const pending = window.previewPerfTest.openPreview(url);
      await new Promise((resolve) => setTimeout(resolve, 160));
      const loadingShell = document.querySelector('#dcb-preview-overlay');
      await pending;
      const contentShell = document.querySelector('#dcb-preview-overlay');
      observer.disconnect();
      return {
        calls: window.__previewCalls.length,
        overlayAdds,
        shellReused: loadingShell === contentShell,
        overlayOwned: contentShell?.dataset.dcbOwned || '',
        genericObserverPasses,
        previewContentEvents: window.__previewContentEvents,
        title: contentShell?.querySelector('.dcbpv-title')?.textContent || '',
        imageLoading: contentShell?.querySelector('.dcbpv-article img')?.loading || '',
        trace: window.previewPerfTest.previewPerformanceSnapshot().lastTrace
      };
    }, articleUrl('fixture', 201));
    assert.equal(first.calls, 1);
    assert.equal(first.overlayAdds, 1);
    assert.equal(first.shellReused, true);
    assert.equal(first.overlayOwned, 'preview');
    assert.equal(first.genericObserverPasses, 0, 'the general page observer skips extension-owned preview DOM');
    assert.ok(first.previewContentEvents >= 1, 'the preview-specific pipeline receives preview content');
    assert.equal(first.title, 'preview-fixture-201');
    assert.equal(first.imageLoading, 'lazy');
    assert.equal(first.trace.cacheHit, false);
    for (const phase of ['activationMs', 'fetchMs', 'parseMs', 'processMs', 'renderMs', 'imageMs', 'completedMs']) {
      assert.equal(typeof first.trace[phase], 'number', `${phase} is measured`);
      assert.ok(first.trace[phase] >= 0, `${phase} is non-negative`);
    }

    const cached = await page.evaluate(async (url) => {
      window.previewPerfTest.closePreview();
      const before = window.__previewCalls.length;
      await window.previewPerfTest.openPreview(url);
      return {
        additionalCalls: window.__previewCalls.length - before,
        title: document.querySelector('.dcbpv-title')?.textContent || '',
        snapshot: window.previewPerfTest.previewPerformanceSnapshot()
      };
    }, articleUrl('fixture', 201, '&page=99&utm_source=list'));
    assert.equal(cached.additionalCalls, 0, 'same article with list-only query parameters is a cache hit');
    assert.equal(cached.title, 'preview-fixture-201');
    assert.equal(cached.snapshot.cacheSize, 1);
    assert.equal(cached.snapshot.lastTrace.cacheHit, true);

    const sharedPending = await page.evaluate(async ({ firstUrl, secondUrl }) => {
      window.previewPerfTest.closePreview();
      window.__previewDelays['202'] = 80;
      const before = window.__previewCalls.length;
      await Promise.all([
        window.previewPerfTest.openPreview(firstUrl),
        window.previewPerfTest.openPreview(secondUrl)
      ]);
      return window.__previewCalls.length - before;
    }, { firstUrl: articleUrl('fixture', 202), secondUrl: articleUrl('fixture', 202, '&page=2') });
    assert.equal(sharedPending, 1, 'duplicate in-flight previews share one network request');

    const stale = await page.evaluate(async ({ a, b }) => {
      window.previewPerfTest.closePreview();
      window.__previewDelays['301'] = 180;
      window.__previewDelays['302'] = 10;
      const before = window.__previewCalls.length;
      const firstRequest = window.previewPerfTest.openPreview(a);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const secondRequest = window.previewPerfTest.openPreview(b);
      await Promise.all([firstRequest, secondRequest]);
      return {
        calls: window.__previewCalls.length - before,
        title: document.querySelector('.dcbpv-title')?.textContent || ''
      };
    }, { a: articleUrl('fixture', 301), b: articleUrl('fixture', 302) });
    assert.deepEqual(stale, { calls: 2, title: 'preview-fixture-302' }, 'late stale response never replaces the current preview');

    const rapid = await page.evaluate(async () => {
      window.previewPerfTest.closePreview();
      const host = document.createElement('table');
      host.innerHTML = `<tbody>${Array.from({ length: 10 }, (_, index) => `<tr class="ub-content"><td class="gall_tit"><a href="/board/view/?id=rapid&no=${401 + index}">row ${index}</a></td></tr>`).join('')}</tbody>`;
      document.body.append(host);
      const before = window.__previewCalls.length;
      let renders = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('.dcbpv-panel') || node.querySelector('.dcbpv-panel')) renders += 1;
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      host.querySelectorAll('a').forEach((link) => link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
      await new Promise((resolve) => setTimeout(resolve, 180));
      observer.disconnect();
      return {
        calls: window.__previewCalls.length - before,
        renders,
        title: document.querySelector('.dcbpv-title')?.textContent || '',
        contextListeners: window.__listenerCounts.contextmenu || 0
      };
    });
    assert.deepEqual(rapid, { calls: 1, renders: 1, title: 'preview-rapid-410', contextListeners: 1 }, 'ten rapid delegated activations only fetch and render the final target');

    const offAndDynamic = await page.evaluate(async () => {
      window.previewPerfTest.closePreview();
      const link = document.createElement('a');
      link.href = '/board/view/?id=dynamic&no=501';
      link.textContent = 'dynamic post';
      const row = document.createElement('div');
      row.className = 'gall_tit';
      row.append(link);
      document.body.append(row);
      const before = window.__previewCalls.length;
      window.previewEnabled = false;
      link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const disabledCalls = window.__previewCalls.length - before;
      window.previewEnabled = true;
      link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 140));
      return { disabledCalls, dynamicCalls: window.__previewCalls.length - before, title: document.querySelector('.dcbpv-title')?.textContent || '' };
    });
    assert.deepEqual(offAndDynamic, { disabledCalls: 0, dynamicCalls: 1, title: 'preview-dynamic-501' });

    const cancelled = await page.evaluate(async () => {
      window.previewPerfTest.closePreview();
      const link = document.createElement('a');
      link.href = '/board/view/?id=fixture&no=601';
      link.textContent = 'cancelled post';
      document.body.append(link);
      const before = window.__previewCalls.length;
      link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      window.previewPerfTest.closePreview();
      await new Promise((resolve) => setTimeout(resolve, 130));
      return { calls: window.__previewCalls.length - before, snapshot: window.previewPerfTest.previewPerformanceSnapshot() };
    });
    assert.equal(cancelled.calls, 0, 'closing preview clears the pending activation timer');
    assert.equal(cancelled.snapshot.activationPending, false);
    assert.equal(cancelled.snapshot.loadingPending, false);
    assert.equal(cancelled.snapshot.requestPending, false);

    const galleryTransition = await page.evaluate(async (url) => {
      const before = window.__previewCalls.length;
      await window.previewPerfTest.openPreview(url);
      return { calls: window.__previewCalls.length - before, title: document.querySelector('.dcbpv-title')?.textContent || '' };
    }, articleUrl('other-gallery', 201));
    assert.deepEqual(galleryTransition, { calls: 1, title: 'preview-other-gallery-201' }, 'gallery id is part of the cache key');

    const expired = await page.evaluate(async (url) => {
      window.previewPerfTest.closePreview();
      const realNow = Date.now;
      await window.previewPerfTest.openPreview(url);
      window.previewPerfTest.closePreview();
      const before = window.__previewCalls.length;
      const base = realNow();
      Date.now = () => base + 2 * 60 * 1000 + 1;
      try {
        await window.previewPerfTest.openPreview(url);
      } finally {
        Date.now = realNow;
      }
      return window.__previewCalls.length - before;
    }, articleUrl('fixture', 650));
    assert.equal(expired, 1, 'an expired preview is refreshed after a long stay');

    const cappedSize = await page.evaluate(() => {
      for (let index = 0; index < 40; index += 1) {
        const url = `https://gall.dcinside.com/board/view/?id=cap&no=${700 + index}`;
        window.previewPerfTest.writePreviewCache(url, { url, title: String(index) });
      }
      return window.previewPerfTest.previewPerformanceSnapshot().cacheSize;
    });
    assert.equal(cappedSize, 32, 'preview cache remains bounded');

    console.log('Preview performance checks passed: canonical LRU cache, shared in-flight request, stale guard, delegated activation coalescing, OFF/dynamic/close lifecycle.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
