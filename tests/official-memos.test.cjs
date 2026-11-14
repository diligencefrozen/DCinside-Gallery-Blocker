const test=require('node:test');
const assert=require('node:assert/strict');

require('../src/ui/options/official-memos.js');
const {parse,parseText}=globalThis.DCBOfficialMemos;
// Anonymous synthetic entries exported with the two official web interfaces.
const pc='eyJ1c2VyTWVtb0xpc3QiOlt7ImdhbGxlcnlJZCI6ImJnMyIsInZhbHVlIjpbImZpeHR1cmV1c2VyIl0sIm1lbW8iOlsi6rCk65+s66asIOuplOuqqCJdLCJjb2xvciI6WyIjOTk5OTk5Il19LHsiZ2FsbGVyeUlkIjoiIiwidmFsdWUiOlsiZml4dHVyZXVzZXIiXSwibWVtbyI6WyLtlanshLEg66mU66qoIl0sImNvbG9yIjpbIiM5OTk5OTkiXX1dfQ==';
const mobile='eyJ1c2VyTWVtb0xpc3QiOlt7ImdhbGxlcnlJZCI6IiIsIm1lbW8iOlsiXHVkNTY5XHVjMTMxIFx1YmE1NFx1YmFhOCJdLCJ2YWx1ZSI6WyJmaXh0dXJldXNlciJdLCJjb2xvciI6WyIjMzM2Njk5Il19LHsiZ2FsbGVyeUlkIjoiZGUiLCJtZW1vIjpbIlx1YWMyNFx1YjdlY1x1YjlhYyBcdWJhNTRcdWJhYTgiXSwidmFsdWUiOlsiZml4dHVyZXVzZXIiXSwiY29sb3IiOlsiIzEyMzQ1NiJdfV0sImFwcFNldHRpbmdMaXN0IjpbeyJrZXkiOiJzZXR0aW5ncyIsInZhbHVlIjpbXX1dLCJ1bmlxdWUiOiJkY2luc2lkZSIsInZlcnNpb24iOjR9';
test('official desktop and mobile exports retain global and gallery-specific identities',()=>{
  for(const [source,gallery] of [[pc,'bg3'],[mobile,'de']]){
    const {entries,invalid}=parse(source);
    assert.equal(invalid,0);
    assert.equal(entries.size,2);
    assert.equal(entries.get('uid:fixtureuser').memo,'합성 메모');
    assert.equal(entries.get('gallery:'+gallery+':uid:fixtureuser').memo,'갤러리 메모');
    assert.equal(entries.get('gallery:'+gallery+':uid:fixtureuser').scope,gallery);
  }
});
test('unrecognized scope, file shape or version cannot silently become global memos',()=>{
  const data=JSON.parse(Buffer.from(mobile,'base64'));
  const encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64');
  assert.throws(()=>parse(encode({...data,version:99})));
  assert.throws(()=>parse(encode({userMemos:{}})));
  const [group]=data.userMemoList;
  for(const field of [{galleryId:null},{color:[]},{galleryId:'../x'}])
    assert.throws(()=>parse(encode({userMemoList:[{...group,...field}]})));
  assert.equal(parse(encode({userMemoList:[group,group]})).duplicates,1);
});
test('review flags ambiguous lines and preserves explicit identifiers and memo punctuation',()=>{
  const {entries,duplicates,badLines}=parseText('sample-user\t한글-메모\r\n192.0.2.10-테스트 메모\n닉네임\nsample-user-ambiguous\n192.0.2.10-중복','sample');
  assert.equal(entries.get('gallery:sample:uid:sample-user').memo,'한글-메모');
  assert.equal(entries.get('gallery:sample:ip:192.0.2.10').ip,'192.0.2.10');
  assert.equal(duplicates,1);
  assert.deepEqual(badLines,[3,4]);
});

test('options preview preserves existing memos, commits gallery scope, and undoes only unchanged imports', async t => {
  const path=require('node:path');
  const {chromium}=require('playwright');
  const root=path.resolve(__dirname,'..');
  const context=await chromium.launchPersistentContext('',{executablePath:chromium.executablePath(),headless:true,args:['--disable-extensions-except='+root,'--load-extension='+root]});
  t.after(()=>context.close());
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const page=await context.newPage();
  await page.goto('chrome-extension://'+new URL(worker.url()).hostname+'/src/ui/options/options.html');
  await page.waitForFunction(async()=>(await chrome.storage.local.get('dcbSettingsBatchV1')).dcbSettingsBatchV1?.phase==='committed');
  await page.evaluate(()=>chrome.storage.local.set({userMemos:{'uid:fixtureuser':{memo:'기존'}}}));
  await page.locator('#settingsDcRecords').scrollIntoViewIfNeeded();
  const importFile=async()=>{
    await page.locator('#memoImportFormat').selectOption('web');
    await page.locator('#officialMemoFile').setInputFiles({name:'dcbackup_PC_fixture.dcdata',mimeType:'application/octet-stream',buffer:Buffer.from(pc)});
    await page.waitForFunction(()=>!document.querySelector('#officialMemoApply').disabled);
  };
  const memos=()=>page.evaluate(async()=>(await chrome.storage.local.get('userMemos')).userMemos);
  await importFile();
  assert.match(await page.locator('#officialMemoPreview').textContent(),/충돌 1건/);
  await page.locator('#officialMemoApply').click();
  await page.waitForFunction(()=>!document.querySelector('#officialMemoUndo').hidden);
  assert.equal((await memos())['uid:fixtureuser'].memo,'기존');
  assert.equal((await memos())['gallery:bg3:uid:fixtureuser'].memo,'갤러리 메모');
  // Confirm that masking a name changes only its painted label. Both memo
  // resolution and the cached activity verdict must still see the native UID.
  await page.evaluate(async()=>{
    await chrome.storage.local.set({dcbImageAccountSignalCache:{fixtureuser:{checkedAt:Date.now(),posts:71,comments:83}}});
    await chrome.storage.sync.set({dcbMaskWriterNames:'all',dcbShowWriterActivity:true,userMemoEnabled:true,
      dcbImageAccountRules:{enabled:true,blockComments:true},hideComment:false,doryBlockEnabled:false});
  });
  await context.route('https://gall.dcinside.com/board/view/**',route=>route.fulfill({contentType:'text/html',body:
    '<div class="write_div">Fixture</div><ul class="cmt_list"><li class="ub-content" id="comment_li_1"><div class="cmt_info"><div class="cmt_nickbox"><span class="gall_writer" data-uid="fixtureuser" data-nick="Original"><span class="nickname"><em>Original</em></span><span class="writer_nikcon"></span></span></div><p class="usertxt">Fixture</p></div></li></ul>'}));
  const view=await context.newPage();await view.goto('https://gall.dcinside.com/board/view/?id=bg3&no=1');
  await view.waitForSelector('[data-full-memo="갤러리 메모"]',{state:'attached'});
  await view.waitForSelector('[data-dcb-writer-activity="글 71 · 댓 83"]',{state:'attached'});
  assert.deepEqual(await view.locator('.gall_writer').first().evaluate(w=>[
    getComputedStyle(w.querySelector('.nickname'),'::before').content,w.dataset.uid,w.dataset.nick,w.querySelector('.nickname em').textContent
  ]),['"ㅇㅇ"','fixtureuser','Original','Original']);
  await view.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1');
  await view.waitForSelector('[data-full-memo="기존"]',{state:'attached'});
  await view.close();
  await page.locator('#officialMemoUndo').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoUndo').hidden);
  assert.deepEqual(await memos(),{'uid:fixtureuser':{memo:'기존'}});
  await importFile();
  await page.locator('#officialMemoReplace').check();
  await page.locator('#officialMemoApply').click();
  await page.waitForFunction(()=>!document.querySelector('#officialMemoUndo').hidden);
  await page.evaluate(async()=>{const {userMemos}=await chrome.storage.local.get('userMemos');userMemos['uid:fixtureuser'].memo='가져온 뒤 수정';await chrome.storage.local.set({userMemos})});
  await page.locator('#officialMemoUndo').click();
  await page.waitForFunction(()=>document.querySelector('#officialMemoUndo').hidden);
  assert.equal((await memos())['uid:fixtureuser'].memo,'가져온 뒤 수정');
});
