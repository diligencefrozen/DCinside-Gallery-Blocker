const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,firefox}=require('playwright');
require('../src/shared/dc-native-records.js');
const bridge='https://gall.dcinside.com/_js/crossDomainStorage.html';
const rule=(on,word)=>({on,word,id:'nativefixture',nick:'시험닉',ip:'192.0'});
const raw={block_all:JSON.stringify(rule(1,'전역 단어')),block_parts:JSON.stringify({foo:rule(0,'갤 단어'),'mini^MI':rule(1,'미니 단어')}),user_memo:JSON.stringify({0:{pcode:{memoowner:{memo:'특수 <>& 메모',color:'#123456'}},ip:{}},foo:{pcode:{memoowner:{memo:'갤 메모',color:'#654321'}}},onlymemo:{ip:{'192.0':{memo:'IP 메모',color:''}}}})};
const snapshot=()=>({source:'dc-native',schema:'dc-pc-local-20261116',href:bridge,raw:structuredClone(raw)});

test('automatic parser enumerates every stored scope, retains OFF and native memo ID scopes',async()=>{
  const progress=[];const result=await DCBNativeRecords.parse(snapshot(),p=>progress.push(p));
  assert.equal(result.records.length,15);assert.equal(result.coverage.galleries,3);
  assert.equal(result.records.filter(r=>r.scope==='gallery'&&r.kind==='memo').length,2);
  assert.ok(result.records.some(r=>r.galleryId==='foo'&&r.enabled===false&&r.kind==='block'));
  assert.ok(result.records.some(r=>r.galleryId==='mini'&&r.galleryType==='MI'));
  assert.equal(result.records.find(r=>r.galleryId==='onlymemo').color,'#999999');
  assert.ok(result.records.filter(r=>r.kind==='memo').every(r=>r.nativeScopeModel==='gallery-id'));
  assert.equal(progress.at(-1).completed,progress.at(-1).total);
  const bad=snapshot();bad.raw.block_parts='[1]';await assert.rejects(DCBNativeRecords.parse(bad),/목록 구조/);
  const empty=snapshot();empty.raw={block_all:null,block_parts:null,user_memo:null};
  assert.equal((await DCBNativeRecords.parse(empty)).records.length,0);
  const changed=snapshot();changed.raw.user_memo=JSON.stringify({foo:{unknownType:{x:{memo:'검토'}}}});
  assert.equal((await DCBNativeRecords.parse(changed)).coverage.complete,false);
  await assert.rejects(DCBNativeRecords.parse(snapshot(),()=>{throw Error('cancel')}),/cancel/);
});

for(const [name,type] of Object.entries({chromium,firefox}))test(name+' automatic reader accesses only verified keys, with no modal or site writes',async t=>{
  const browser=await type.launch({executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<p>Storage bridge</p>'}));await page.goto(bridge);
  await page.evaluate(data=>{
    for(const [key,value]of Object.entries(data))localStorage.setItem(key,value);
    localStorage.setItem('private-unrelated','untouched');window.reads=[];window.writes=0;
    const get=Storage.prototype.getItem;Storage.prototype.getItem=function(key){reads.push(key);return get.call(this,key)};
    Storage.prototype.setItem=()=>{writes++;throw Error('site write forbidden')};
  },raw);
  await page.addScriptTag({path:'src/content/dc-native-records-auto.js'});
  const result=await page.evaluate(()=>DCBNativeAuto.read());assert.deepEqual(result.raw,raw);
  assert.deepEqual(await page.evaluate(()=>reads),['block_all','block_parts','user_memo','block_all','block_parts','user_memo']);
  assert.equal(await page.evaluate(()=>writes),0);
  await page.goto('https://gall.dcinside.com.attacker.example/');await page.addScriptTag({path:'src/content/dc-native-records-auto.js'});
  await assert.rejects(page.evaluate(()=>DCBNativeAuto.read()),/출처/);
});

test('installed automatic import needs no existing DC page and closes its background tab',async t=>{
  const root=path.resolve(__dirname,'..');
  const context=await chromium.launchPersistentContext('',{executablePath:chromium.executablePath(),args:['--load-extension='+root,'--disable-extensions-except='+root]});t.after(()=>context.close());
  await context.route(bridge,async route=>{await new Promise(r=>setTimeout(r,350));await route.fulfill({contentType:'text/html',body:'<p>Storage bridge</p>'})});
  await context.addInitScript(({origin,raw})=>{if(location.href===origin)for(const [key,value]of Object.entries(raw))localStorage.setItem(key,value);},{origin:bridge,raw});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const page=await context.newPage();
  await page.goto('chrome-extension://'+new URL(worker.url()).hostname+'/src/ui/options/options.html#settingsDcRecords');
  await page.waitForFunction(async()=>(await chrome.storage.local.get('dcbSettingsBatchV1')).dcbSettingsBatchV1?.phase==='committed');
  await page.evaluate(()=>chrome.storage.sync.set({userBlockEnabled:false,keywordBlockEnabled:false,userMemoEnabled:false}));
  const ids=await page.evaluate(async()=>(await chrome.tabs.query({})).map(t=>t.id));
  await page.locator('#recordsNativeAuto').click();
  await page.locator('#recordsNativeProgressField').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#recordsNativeProgress').value===100&&!document.querySelector('#recordsNativeAuto').disabled);
  assert.match(await page.locator('#recordsNativeProgressText').innerText(),/불러오기 완료.*갤러리 3개.*15건/);
  assert.equal(await page.locator('#recordsNativeManual').count(),0);
  assert.deepEqual(await page.evaluate(async()=>(await chrome.tabs.query({})).map(t=>t.id)),ids);
  assert.deepEqual(await page.evaluate(()=>getUserMemos()),{});
  assert.equal(await page.locator('#officialMemoApply').isDisabled(),true);
  fs.mkdirSync('test-results/native-auto',{recursive:true});
  await page.locator('#settingsDcRecords').screenshot({path:'test-results/native-auto/preview.png'});
  await page.locator('#recordsConfirm').check();await page.locator('#officialMemoApply').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('가져옴'));
  const state=await page.evaluate(async()=>({memos:await getUserMemos(),tokens:await getStoredUidList(),sync:await chrome.storage.sync.get(['blockedKeywords','userBlockEnabled','keywordBlockEnabled'])}));
  assert.equal(state.memos['gallery:foo:uid:memoowner'].memo,'갤 메모');
  assert.equal(state.memos['gallery:onlymemo:ip:192.0'].memo,'IP 메모');
  assert.equal(state.tokens.length,3);assert.ok(state.sync.blockedKeywords.includes('전역 단어'));assert.equal(state.sync.keywordBlockEnabled,false);
  await page.locator('#officialMemoUndo').click();await page.waitForFunction(()=>document.querySelector('#officialMemoUndo').hidden);
  assert.deepEqual(await page.evaluate(()=>getUserMemos()),{});
});

for(const [name,type] of Object.entries({chromium,firefox}))test(name+' automatic import cancellation and wrong origin preserve data and clean up owned tabs',async t=>{
  const browser=await type.launch({executablePath:type.executablePath()});t.after(()=>browser.close());const page=await browser.newPage();
  const html=fs.readFileSync('src/ui/options/options.html','utf8');const section=html.slice(html.indexOf('<section class="card" id="settingsDcRecords">'),html.indexOf('<section class="card support-card">'));
  await page.setContent('<style>[hidden]{display:none!important}</style>'+section);
  await page.evaluate(()=>{
    window.mode='loading';window.removed=[];window.injections=0;
    window.chrome={storage:{local:{get:async()=>({})}},tabs:{create:async()=>({id:42}),get:async()=>({id:42,status:mode==='loading'?'loading':'complete',url:'https://attacker.example/'}),remove:async id=>removed.push(id)},scripting:{executeScript:async()=>{injections++;throw Error('must not inject')}}};
    window.getUserMemos=async()=>({});window.getStoredUidList=async()=>[];
  });
  await page.addScriptTag({path:'src/ui/options/dc-records-import.js'});
  await page.locator('#recordsNativeAuto').click();await page.locator('#recordsNativeCancel').click();
  await page.waitForFunction(()=>!document.querySelector('#recordsNativeAuto').disabled);
  assert.match(await page.locator('#recordsNativeProgressText').innerText(),/중지했습니다/);
  assert.equal(await page.evaluate(()=>injections),0);assert.deepEqual(await page.evaluate(()=>removed),[42]);
  await page.evaluate(()=>mode='wrong');await page.locator('#recordsNativeAuto').click();
  await page.waitForFunction(()=>!document.querySelector('#recordsNativeAuto').disabled);
  assert.match(await page.locator('#recordsNativeProgressText').innerText(),/출처/);
  assert.equal(await page.evaluate(()=>injections),0);assert.equal(await page.locator('#officialMemoApply').isDisabled(),true);
});
