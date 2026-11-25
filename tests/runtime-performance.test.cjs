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

test('bulk list updates read each title once and share recovery style lookups', async t => {
  const baseline = process.env.DCB_LIST_BASELINE;
  const script = path => baseline
    ? require('node:child_process').execFileSync('git', ['show', baseline + ':' + path], {encoding:'utf8'})
    : source(path);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<table class="gall_list"><tbody></tbody></table>');
  await page.evaluate(() => {
    window.subscriptions = new Map();
    window.DCBDomMutationBus = {subscribe(id, handler) { subscriptions.set(id,handler); return () => {}; }};
    window.chrome = {runtime:{onMessage:{addListener(){}},sendMessage(_msg,cb){cb?.({ok:true});}}, storage:{onChanged:{addListener(){}}}};
    window.DCBRuntimeSettingsCache = {get(defaults, cb) { cb({...defaults,blockedIds:['example']}); }};
    window.DCBKeywordMatcher = {prepareCategories:()=>[],prepareKeywords:()=>[],findKeyword:()=>null};
  });
  for (const path of ['src/shared/block-stats.js','src/content/list/list-filter.js']) await page.addScriptTag({content:script(path)});
  const result = await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    const body=document.querySelector('tbody');
    body.innerHTML=Array.from({length:500},(_,i)=>'<tr data-no="'+i+'"><td class="gall_tit"><a href="https://gall.dcinside.com/board/view/?id=example&no='+i+'">제목</a></td></tr>').join('');
    const rows=[...body.rows], records=rows.map(row=>({type:'childList',target:body,addedNodes:[row],removedNodes:[]}));
    let reads=0, styleLookups=0, containsCalls=0;
    const query=Element.prototype.querySelector, contains=Node.prototype.contains, byId=document.getElementById.bind(document);
    Element.prototype.querySelector=function(selector){if(selector==='.gall_subject') reads++;return query.call(this,selector);};
    Node.prototype.contains=function(node){containsCalls++;return contains.call(this,node);};
    document.getElementById=id=>{if(id.startsWith('dcb-hide-'))styleLookups++;return byId(id);};
    const started=performance.now();
    subscriptions.get('list-filter')(records);
    await new Promise(requestAnimationFrame);
    subscriptions.get('block-stats')(rows.map(target=>({type:'attributes',target})));
    return {reads,containsCalls,styleLookups,ms:Math.round(performance.now()-started),hidden:body.querySelectorAll('[data-dcb-list-hidden="galleries"]').length};
  });
  console.log({baseline:baseline||'working',...result});
  assert.equal(result.hidden,500);
  if (!baseline) {
    assert.equal(result.reads,500);
    assert.ok(result.containsCalls<1000);
    assert.ok(result.styleLookups<=4);
  }
  await page.evaluate(()=>{
    const list=document.createElement('ul');
    list.innerHTML='<li id="comment_li_1">기존 댓글</li>';
    const container=document.createElement('div');
    container.innerHTML='<style id="dcb-hide-comment-style">.cmt_list{display:none}</style>';
    document.body.append(list,container);
    subscriptions.get('block-stats')([{type:'childList',target:document.body,addedNodes:[container]}]);
  });
  await page.waitForFunction(()=>DCBBlockStats.snapshot().byCategory.comments===1);
});

test('queued read marks share storage writes and recover after a failed write', async () => {
  const background=source('src/background/background.js');
  const script=background.slice(background.indexOf('let readPostsWriteQueue'),background.indexOf('chrome.runtime.onMessage.addListener'));
  let stored={}, reads=0, writes=0, fail=false;
  const context={chrome:{storage:{local:{
    async get(){reads++;return {dcbReadPosts:structuredClone(stored)};},
    async set(data){writes++;if(fail)throw Error('storage unavailable');stored=data.dcbReadPosts;}
  }}}};
  vm.runInNewContext(script,context);
  const mark=context.markReadIdentity;
  await Promise.all(Array.from({length:50},(_,i)=>mark('gallery:fixture:'+i)));
  assert.deepEqual([reads,writes,Object.keys(stored).length],[1,1,50]);
  await mark('gallery:fixture:1');
  assert.equal(writes,1);
  fail=true;
  await assert.rejects(mark('gallery:fixture:50'),/storage unavailable/);
  fail=false;
  await mark('gallery:fixture:50');
  assert.equal(Object.keys(stored).length,51);
});
