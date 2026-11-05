const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('playwright');

const source = file => fs.readFileSync(file, 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('only feature switches rebuild the injection plan', async () => {
  const settings = { blockedIds: Array(1000).fill('gallery'), dcbTextDetection: {enabled: false} };
  const reads = [], injected = [];
  let change;
  const context = {
    location: new URL('https://gall.dcinside.com/board/view/?id=fixture&no=1'),
    performance, console, requestAnimationFrame: queueMicrotask,
    requestIdleCallback: queueMicrotask, setTimeout: queueMicrotask,
    DCBStartupScheduler: {schedule: (_, work) => queueMicrotask(work)},
    chrome: {runtime: {sendMessage: async ({features}) => {
      injected.push(...features);
      return {ok: true, features};
    }}},
    DCBRuntimeSettingsCache: {
      get: async keys => {
        reads.push(keys);
        return Object.fromEntries(keys.map(key => [key, settings[key]]));
      },
      onChanged: {addListener: listener => { change = listener; }}
    }
  };
  vm.runInNewContext(source('src/content/core/feature-loader.js'), context);
  await tick();
  assert.ok(injected.includes('preview'));
  assert.equal(reads[0].includes('blockedIds'), false);
  for (let i = 0; i < 100; i++) {
    change({blockedIds: {newValue: ['gallery'+i]}}, 'sync');
  }
  change({dcbTextDetection: {oldValue: {enabled: false}, newValue: {enabled: false, posts: true}}}, 'sync');
  await tick();
  assert.equal(reads.length, 1);
  settings.dcbTextDetection = {enabled: true};
  change({dcbTextDetection: {oldValue: {enabled: false}, newValue: settings.dcbTextDetection}}, 'sync');
  await tick();
  assert.equal(reads.length, 2);
  assert.deepEqual(injected.filter(id => id === 'text-detector'), ['text-detector']);
  assert.equal(new Set(injected).size, injected.length);
});

test('overlapping settings restores keep changes made during both reads', async () => {
  const hot = 'dcbRuntimeSettingsHotCacheV1', batch = 'dcbSettingsBatchV1';
  const pending = [], delivered = [];
  let epoch = 0, changed, message, scalarClones = 0;
  const context = {
    console, setTimeout, queueMicrotask,
    structuredClone(value) {
      if (typeof value !== 'object') scalarClones++;
      return structuredClone(value);
    },
    DCBStartupScheduler: {schedule: (_, work) => queueMicrotask(work)},
    chrome: {
      runtime: {onMessage: {addListener: fn => { message = fn; }}},
      storage: {onChanged: {addListener: fn => { changed = fn; }}, local: {
        get(keys) {
          if (Array.isArray(keys) && keys[0] === 'rules') {
            return new Promise(resolve => pending.push(resolve));
          }
          return Promise.resolve({
            [hot]: {version: 1, data: {enabled: true, nested: {value: 1}}},
            [batch]: {phase: 'committed', epoch: String(++epoch), localKeys: ['rules']}
          });
        }
      }}
    }
  };
  vm.runInNewContext(source('src/shared/runtime-settings-cache.js'), context);
  const cache = context.DCBRuntimeSettingsCache;
  await cache.ready;
  cache.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.rules) delivered.push(changes.rules.newValue);
  });
  const copy = await cache.get(['enabled','nested']);
  copy.nested.value = 2;
  assert.equal((await cache.get('nested')).nested.value, 1);
  assert.equal(scalarClones, 0);
  message({type: 'dcb:settings-batch-committed', epoch: '2'});
  message({type: 'dcb:settings-batch-committed', epoch: '3'});
  await tick();
  assert.equal(pending.length, 2);
  changed({rules: {oldValue: 'old', newValue: 'latest'}}, 'local');
  for (const finish of pending) {
    finish({rules: 'stale'});
    await tick();
  }
  assert.deepEqual(delivered, ['latest','latest','latest']);
});

test('list startup scans 500 rows once and preserves newer history on restore', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({contentType: 'text/html', body:
      '<table class="gall_list">'+Array.from({length:500},(_,i)=>'<tr data-no="'+(i+1)+'"><td>row</td></tr>').join('')+'</table>'}));
    await page.addInitScript({content: `
      window.scans = 0; window.pending = [];
      const original = document.querySelectorAll.bind(document);
      document.querySelectorAll = selector => {
        if (selector === '.gall_list tr[data-no]') scans++;
        return original(selector);
      };
      window.chrome = {storage:{
        local:{get:()=>new Promise(resolve=>pending.push(()=>resolve({dcbReadPosts:{'gallery:fixture:1':1}})))},
        sync:{get:async()=>({readPostsHighlightEnabled:true})},
        onChanged:{addListener:fn=>window.changed=fn}
      }};
      ${source('src/content/list/read-posts.js')}
    `});
    await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
    await page.evaluate(() => pending.shift()());
    await page.waitForFunction(()=>document.querySelector('tr[data-no="1"]').classList.contains('dcb-read-post'));
    assert.equal(await page.evaluate(()=>scans), 1);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
      changed({dcbReadPosts:{newValue:{'gallery:fixture:2':10}}},'local');
      pending.shift()();
    });
    await tick();
    assert.deepEqual(await page.locator('.dcb-read-post').evaluateAll(rows=>rows.map(row=>row.dataset.no)), ['2']);
    assert.equal(await page.evaluate(()=>scans), 2);
  } finally { await browser.close(); }
});
