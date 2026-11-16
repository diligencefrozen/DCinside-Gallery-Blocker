const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, firefox} = require('playwright');

const options = fs.readFileSync('src/ui/options/options.html', 'utf8');
const section = options.slice(options.indexOf('<section class="card" id="settingsDcRecords">'), options.indexOf('<section class="card support-card">'));
async function enterManual(page) {
  await page.locator('#memoImportFormat').selectOption('native');
  await page.locator('#recordsNativeManual').evaluate(node=>node.open=true);
  await page.locator('#recordsNativeStart').click();
}
const escape = value => value.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const panel = (name, values) => `<div class="${name}">${name === 'part_setting' ? '<span id="sel_gall_name" data-id="fixture" data-gtype="M"></span>' : ''}<div class="setting_onoff"><button class="on"><span class="blind">on</span></button></div>${['word','id','nick','ip'].map(type => `<div class="set_cont"><input name="${type}"><ul class="block_list word">${(values[type] || []).map(value=>`<li><span class="block_word">${escape(value)}</span></li>`).join('')}</ul></div>`).join('')}</div>`;
const nativeHtml = `<div id="user_block">${panel('all_setting',{word:['금지 단어','금지 단어'],id:['nativefixture'],nick:['검토닉'],ip:['192.0','192.0.2.3']})}${panel('part_setting',{word:['갤러리 단어'],id:['galleryfixture']})}</div><div id="user_memo_config"><div class="tab_menubox"><button class="all on">전체</button><button>현재</button></div><div id="user_memo_table"><span class="user_memo_count">1</span><ul class="memo_list"><li><input class="chk_um_list" value="memoowner-새 메모 &amp; &lt;특수&gt;"><span class="nik icon">memoowner</span><span class="mone" style="color:#123456">-새 메모 &amp; &lt;특수&gt;</span></li></ul></div></div>`;

for (const [name, engine] of Object.entries({chromium, firefox})) test(name + ' native import reads explicitly, previews holds, merges twice and undoes without enabling filters', async t => {
  const browser = await engine.launch({executablePath:engine.executablePath()}); t.after(()=>browser.close());
  const context = await browser.newContext();
  await context.route('https://gall.dcinside.com/**', route=>route.fulfill({contentType:'text/html; charset=utf-8',body:nativeHtml}));
  await context.route('https://options.fixture.test/**', route=>route.fulfill({contentType:'text/html; charset=utf-8',body:options.match(/<style>[\s\S]*?<\/style>/)[0]+'<style>body{color:white;background:#111;--fg:white;font:14px system-ui} .card{max-width:700px} [hidden]{display:none!important}</style>'+section}));
  const native = await context.newPage(); await native.goto('https://gall.dcinside.com/mgallery/board/lists/?id=fixture');
  const before = await native.locator('body').innerHTML();
  const page = await context.newPage(); await page.goto('https://options.fixture.test/');
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  let injections=0;
  await page.exposeFunction('nativeTabInfo',()=>({id:8,windowId:2,url:native.url(),title:'<img src=x> 합성 페이지'}));
  await page.exposeFunction('nativeInjection',async files=>{
    injections++;
    if(!await native.evaluate(()=>typeof DCBNativeCollector!=='undefined')) await native.addScriptTag({path:'src/content/dc-native-records-collector.js'});
    return [{frameId:0,result:await native.evaluate(()=>DCBNativeCollector.collect())}];
  });
  await page.evaluate(()=>{
    window.memory={local:{userMemos:{'uid:memoowner':{memo:'기존 메모',color:'#999999'}}},sync:{blockedKeywords:['기존 단어'],userBlockEnabled:false,keywordBlockEnabled:false,userMemoEnabled:false}};
    const area=name=>({
      get:async keys=>{
        const state=structuredClone(memory[name]);
        if(keys===null || keys===undefined) return state;
        const defaults=typeof keys==='object'&&!Array.isArray(keys)?keys:{};
        return Object.fromEntries((typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys)).filter(key=>Object.hasOwn(state,key)||Object.hasOwn(defaults,key)).map(key=>[key,Object.hasOwn(state,key)?state[key]:defaults[key]]));
      },
      set:async patch=>Object.assign(memory[name],structuredClone(patch)),
      remove:async keys=>{for(const key of typeof keys==='string'?[keys]:keys)delete memory[name][key];}
    });
    window.chrome={runtime:{},storage:{local:area('local'),sync:area('sync')},tabs:{query:async()=>[await nativeTabInfo()],get:async()=>nativeTabInfo()},scripting:{executeScript:async args=>nativeInjection(!!args.files)}};
    window.getUserMemos=async()=>(await chrome.storage.local.get({userMemos:{}})).userMemos;
    window.getStoredUidList=()=>DCBUserBlockStore.getAllTokensReadOnly();
    window.sendUserBlockMutation=(type,payload)=>DCBUserBlockStore.importRecords(payload,type==='dcb.recordsUndo');
    window.renderMemoList=async()=>{};window.refreshUidList=()=>{};
  });
  await page.addScriptTag({path:'src/shared/storage/user-block-store.js'});
  await page.addScriptTag({path:'src/ui/options/official-memos.js'});
  await page.addScriptTag({path:'src/content/dc-native-records-collector.js'});
  await page.addScriptTag({path:'src/ui/options/dc-records-import.js'});
  assert.equal(injections,0);
  await enterManual(page);
  await page.waitForFunction(()=>document.querySelector('#recordsNativeTab').options.length===1);
  assert.equal(await page.locator('#settingsDcRecords .dcb-records-steps>li').first().evaluate(node=>getComputedStyle(node).display),'list-item');
  assert.equal(injections,0,'Entering the screen does not read the website');
  assert.equal(await page.locator('#recordsNativeTab img').count(),0);
  await page.locator('#recordsNativeRead').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('보류 3건'));
  assert.match(await page.locator('#officialMemoPreview').textContent(),/충돌 1건.*중복 1건/);
  assert.match(await page.locator('#officialMemoRows').innerText(),/IP.*192\.0\.2\.3.*보류/);
  fs.mkdirSync('test-results/native-records',{recursive:true});
  await page.locator('#settingsDcRecords').screenshot({path:`test-results/native-records/${name}-preview.png`});
  assert.equal(await page.locator('#officialMemoApply').isDisabled(),true);
  await page.evaluate(()=>document.querySelector('#recordsNativeTab').dispatchEvent(new Event('change')));
  await page.evaluate(()=>{const checkbox=document.querySelector('#recordsConfirm');checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));});
  assert.equal(await page.locator('#officialMemoApply').isDisabled(),true,'Changing the source invalidates its previous snapshot');
  await page.locator('#recordsNativeRead').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('보류 3건'));
  await page.locator('#recordsConfirm').check();
  assert.equal(await page.locator('#officialMemoApply').isEnabled(),true);
  await page.locator('#recordsNativeRefresh').click();
  await page.waitForFunction(()=>!document.querySelector('#officialMemoPreview').textContent.includes('적용 가능'));
  assert.equal(await page.locator('#officialMemoApply').isDisabled(),true,'Refreshing the page list invalidates an existing snapshot even when its tab stays selected');
  assert.equal(await page.locator('#recordsNativeTab').inputValue(),'8');
  await page.locator('#recordsNativeRead').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('보류 3건'));
  await page.locator('#recordsConfirm').check(); await page.locator('#officialMemoApply').click();
  await page.waitForFunction(()=>!document.querySelector('#officialMemoUndo').hidden&&!document.querySelector('#officialMemoUndo').disabled);
  let saved=await page.evaluate(async()=>({tokens:await getStoredUidList(),...memory}));
  assert.deepEqual(new Set(saved.tokens),new Set(['nativefixture','nick-exact:검토닉','192.0']));
  assert.deepEqual(saved.sync.blockedKeywords,['기존 단어','금지 단어']);
  assert.equal(saved.local.userMemos['uid:memoowner'].memo,'기존 메모');
  assert.equal(saved.sync.keywordBlockEnabled,false);assert.equal(saved.sync.userBlockEnabled,false);assert.equal(saved.sync.userMemoEnabled,false);
  const journalId=saved.local.dcbRecordsImportUndo.id;
  await page.locator('#recordsNativeRead').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('기존') || document.querySelector('#officialMemoPreview').textContent.includes('적용 가능'));
  await page.locator('#recordsConfirm').check();await page.locator('#officialMemoApply').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('가져옴'));
  assert.equal(await page.evaluate(()=>memory.local.dcbRecordsImportUndo.id),journalId,'A duplicate import keeps the last meaningful undo');
  await page.locator('#officialMemoUndo').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoUndo').hidden);
  saved=await page.evaluate(async()=>({tokens:await getStoredUidList(),...memory}));
  assert.deepEqual(saved.tokens,[]);assert.deepEqual(saved.sync.blockedKeywords,['기존 단어']);
  assert.equal(await native.locator('body').innerHTML(),before);
  await native.locator('#user_block').evaluate(node=>node.style.display='none');
  await native.locator('#user_memo_config').evaluate(node=>node.style.display='none');
  await page.locator('#recordsNativeRead').click();
  await page.waitForFunction(()=>document.querySelector('#recordsNativeStatus').textContent.includes('목록 창 열기 필요'));
  assert.doesNotMatch(await page.locator('#recordsNativeStatus').innerText(),/직접 읽기 실패/);
  assert.equal(await page.locator('#officialMemoApply').isDisabled(),true);
  assert.deepEqual(errors,[]);
  await page.setViewportSize({width:420,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});

for (const [name, engine] of Object.entries({chromium, firefox})) test(name + ' tab picker requires a choice among existing pages and selects a newly opened page explicitly',async t=>{
  const browser=await engine.launch({executablePath:engine.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.setContent('<style>[hidden]{display:none!important}</style>'+section);
  await page.evaluate(()=>{
    window.mockTabs=[
      {id:11,windowId:1,index:0,title:'첫 번째 갤러리',url:'https://gall.dcinside.com/board/lists/?id=first'},
      {id:22,windowId:1,index:1,title:'두 번째 갤러리',url:'https://gall.dcinside.com/mgallery/board/lists/?id=second'},
      {id:99,windowId:1,index:2,title:'다른 출처',url:'https://gall.dcinside.com.attacker.example/board/lists/?id=other'}
    ];
    window.injections=0;window.createdTabId=33;
    window.chrome={
      runtime:{},storage:{local:{get:async()=>({})},sync:{get:async()=>({blockedKeywords:[]})}},
      tabs:{
        query:async()=>structuredClone(mockTabs),
        get:async id=>structuredClone(mockTabs.find(tab=>tab.id===id)),
        create:async({url})=>{const tab={id:createdTabId,windowId:1,index:3,title:'새 갤러리',url};mockTabs.push(tab);return structuredClone(tab);}
      },
      scripting:{executeScript:async()=>{injections++;throw Error('A page must be selected before injection');}}
    };
    window.getUserMemos=async()=>({});window.getStoredUidList=async()=>[];
    window.DCBUserBlockStore={makeBlockKey:value=>value};
  });
  await page.addScriptTag({path:'src/ui/options/official-memos.js'});
  await page.addScriptTag({path:'src/ui/options/dc-records-import.js'});
  await enterManual(page);
  await page.waitForFunction(()=>document.querySelector('#recordsNativeTab').options.length===3);
  assert.equal(await page.locator('#recordsNativeTab').inputValue(),'','Several pages must not silently select the first one');
  assert.deepEqual(await page.locator('#recordsNativeTab option').evaluateAll(options=>options.map(option=>option.value)),['','11','22']);
  await page.locator('#recordsNativeRead').click();
  await page.waitForFunction(()=>!document.querySelector('#recordsNativeRead').disabled&&document.querySelector('#recordsNativeStatus').textContent.includes('선택'));
  assert.equal(await page.evaluate(()=>injections),0);
  await page.locator('#recordsNativeTab').selectOption('22');
  await page.locator('#recordsNativeRefresh').click();
  await page.waitForFunction(()=>document.querySelector('#recordsNativeTab').value==='22');
  await page.locator('#recordsNativeOpen').click();
  await page.waitForFunction(()=>document.querySelector('#recordsNativeTab').value==='33');
  assert.equal(await page.evaluate(()=>mockTabs.find(tab=>tab.id===33).url),'https://gall.dcinside.com/board/lists/?id=programming');
  assert.equal(await page.evaluate(()=>injections),0,'Opening or selecting a page never reads its records');
});

test('Chromium installed native import uses top-frame scripting and background storage',async t=>{
  const root=path.resolve(__dirname,'..');
  const context=await chromium.launchPersistentContext('',{executablePath:chromium.executablePath(),args:['--load-extension='+root,'--disable-extensions-except='+root]});
  t.after(()=>context.close());
  const listHtml='<table class="gall_list"><tbody><tr class="ub-content" id="native-keyword-row"><td class="gall_tit"><a href="/board/view/?id=fixture&no=1">금지 단어</a></td><td class="gall_writer" data-uid="otherwriter" data-nick="다른작성자"></td></tr></tbody></table>';
  const viewHtml='<h3 class="title_subject">시험 글</h3><div class="write_div">본문</div><ul class="cmt_list">'+[
    ['blocked-user','nativefixture','일반 댓글'],['blocked-keyword','otherwriter','금지 단어'],['memo-comment','memoowner','허용 댓글']
  ].map(([id,uid,text])=>`<li class="ub-content" id="${id}"><div class="cmt_info"><div class="cmt_nickbox"><span class="gall_writer ub-writer" data-uid="${uid}" data-nick="작성자"><span class="nickname"><em>작성자</em></span></span></div><p class="usertxt">${text}</p></div></li>`).join('')+'</ul>';
  await context.route('https://gall.dcinside.com/**',async route=>{
    if(new URL(route.request().url()).searchParams.get('id')==='programming')await new Promise(resolve=>setTimeout(resolve,800));
    await route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().includes('/board/view')?viewHtml:nativeHtml+listHtml});
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const page=await context.newPage();
  await page.goto('chrome-extension://'+new URL(worker.url()).hostname+'/src/ui/options/options.html#settingsDcRecords');
  await page.waitForFunction(async()=>(await chrome.storage.local.get('dcbSettingsBatchV1')).dcbSettingsBatchV1?.phase==='committed');
  await page.evaluate(()=>chrome.storage.sync.set({userBlockEnabled:true,keywordBlockEnabled:true,userMemoEnabled:true,noticeBlockEnabled:false,galleryBlockEnabled:false,doryBlockEnabled:false,dcbShowWriterActivity:false,keywordBlockTargets:{listTitle:true,viewTitle:false,viewBody:false,comments:true}}));
  const native=await context.newPage();await native.goto('https://gall.dcinside.com/mgallery/board/lists/?id=fixture');
  await enterManual(page);
  await page.waitForFunction(()=>document.querySelector('#recordsNativeTab').options.length===1);
  assert.equal(await page.locator('#settingsDcRecords .dcb-records-steps>li').first().evaluate(node=>getComputedStyle(node).display),'list-item');
  await page.locator('#recordsNativeRead').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('보류 3건'));
  fs.mkdirSync('test-results/native-records',{recursive:true});
  await page.locator('#settingsDcRecords').screenshot({path:'test-results/native-records/installed-preview.png'});
  const view=await context.newPage();await view.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1');
  await page.locator('#recordsConfirm').check();await page.locator('#officialMemoApply').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('가져옴'));
  assert.ok((await page.evaluate(()=>getStoredUidList())).includes('nativefixture'));
  assert.ok((await page.evaluate(()=>chrome.storage.sync.get('blockedKeywords'))).blockedKeywords.includes('금지 단어'));
  assert.equal((await page.evaluate(()=>getUserMemos()))['uid:memoowner'].memo,'새 메모 & <특수>');
  await native.locator('#native-keyword-row[data-dcb-list-hidden]').waitFor({state:'attached'});
  await view.locator('#blocked-user.dcb-userblock-hidden').waitFor({state:'attached'});
  await view.locator('#blocked-keyword[data-dcb-keyword-hidden]').waitFor({state:'attached'});
  await view.locator('#memo-comment [data-full-memo="새 메모 & <특수>"]').waitFor({state:'attached'});
  await page.locator('#officialMemoUndo').click();await page.waitForFunction(()=>document.querySelector('#officialMemoUndo').hidden);
  assert.deepEqual(await page.evaluate(()=>getStoredUidList()),[]);
  await native.locator('#native-keyword-row:not([data-dcb-list-hidden])').waitFor({state:'attached'});
  await view.locator('#blocked-user:not(.dcb-userblock-hidden)').waitFor({state:'attached'});
  await view.locator('#blocked-keyword:not([data-dcb-keyword-hidden])').waitFor({state:'attached'});
  const opened=context.waitForEvent('page');
  await page.locator('#recordsNativeOpen').click();
  const created=await opened;
  await created.waitForURL('https://gall.dcinside.com/board/lists/?id=programming');
  await created.waitForLoadState('domcontentloaded');
  const createdId=await page.evaluate(async()=>{
    const tabs=await chrome.tabs.query({url:'https://gall.dcinside.com/*'});
    return tabs.find(tab=>new URL(tab.url).searchParams.get('id')==='programming')?.id;
  });
  assert.equal(await page.locator('#recordsNativeTab').inputValue(),String(createdId),'A newly opened page remains the selected source even when its navigation response is delayed');
});
