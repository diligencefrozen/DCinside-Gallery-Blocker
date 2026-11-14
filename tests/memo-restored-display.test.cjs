const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');

for(const [engine,type] of Object.entries({chromium,firefox}))test(engine+' restored memo stays visible after author redraw',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1000,height:600}});page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"><style>body{padding:32px;font:14px Arial,sans-serif;color:#27344b}.gallview_head{padding-bottom:24px;border-bottom:1px solid #ddd}.gall_date{margin-left:12px;color:#667085}.cmt_list{padding:24px 0;list-style:none}.nickname em{font-style:normal}</style></head><body><div class="gallview_head"><h2>복원된 메모 표시 검사</h2><div class="gall_writer" data-uid="fixturemember" data-nick="테스트 작성자" data-loc="view"><div class="fl"><span class="nickname"><em>테스트 작성자</em></span><span class="writer_nikcon"></span><span class="gall_date">2026.11.14 12:34:56</span></div></div></div><ul class="cmt_list"><li><div class="cmt_info"><span class="gall_writer" data-uid="fixturemember"><span class="nickname"><em>테스트 작성자</em></span></span><p>합성 댓글</p></div></li></ul></body></html>'}));
  await page.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1');
  await page.evaluate(()=>{
    const listeners=[];window.store={userMemos:{}};window.writes=0;
    const get=data=>async(keys,cb)=>{const out={...keys,...structuredClone(data)};cb?.(out);return out;};
    window.chrome={storage:{local:{get:get(store)},sync:{get:get({userMemoEnabled:true})},onChanged:{addListener:f=>listeners.push(f)}},runtime:{onMessage:{addListener(){}},sendMessage:async()=>{writes++;return {ok:true}}}};
    window.restore=memos=>{store.userMemos=memos;for(const f of listeners)f({userMemos:{newValue:structuredClone(memos)}},'local')};
  });
  await require('./helpers/content-runtime.cjs')(page);
  await page.addStyleTag({path:'src/content/appearance/writer-layout.css'});
  for(const f of ['src/content/user/writer-layout.js','src/content/user/user-memo.js'])await page.addScriptTag({path:f});
  const badge=page.locator('.gallview_head .dcb-user-memo-trigger');
  await badge.waitFor();
  assert.equal(await badge.innerText(),'📝');
  await page.evaluate(()=>restore({'uid:fixturemember':{memo:'복원된 테스트 메모',color:'#506e9c'}}));
  await page.waitForFunction(()=>[...document.querySelectorAll('.dcb-memo-value')].every(n=>n.textContent==='복원된 테스트 메모'));
  await badge.click();
  assert.equal(await page.locator('#dcb-user-memo-textarea').inputValue(),'복원된 테스트 메모');
  await page.locator('#dcb-user-memo-modal [data-act=close]').last().click();
  // A site/feature redraw can reuse the trigger but restore its old icon child.
  // The data signature still matches the saved memo, so checking only the child
  // class used to skip the repair even on an explicit refresh.
  await badge.evaluate(b=>{b.firstElementChild.textContent='📝';b.dataset.dcbMemoMode='icon';});
  await page.evaluate(()=>DCBUserMemo.refresh());
  await page.waitForFunction(()=>document.querySelector('.gallview_head .dcb-memo-value').textContent==='복원된 테스트 메모');
  assert.equal(await badge.getAttribute('data-dcb-memo-mode'),'text');
  // Text-node changes also need a targeted repair, without a full document scan.
  await badge.evaluate(b=>{b.firstElementChild.firstChild.data='📝';});
  await page.waitForFunction(()=>document.querySelector('.gallview_head .dcb-memo-value').textContent==='복원된 테스트 메모');
  await page.evaluate(()=>restore({'uid:fixturemember':{memo:'새 전체 메모'},'gallery:fixture:uid:fixturemember':{memo:'이 갤러리 메모'}}));
  await page.waitForFunction(()=>document.querySelector('.gallview_head .dcb-memo-value').textContent==='이 갤러리 메모');
  await page.evaluate(()=>restore({'uid:fixturemember':{memo:'새 전체 메모'}}));
  await page.waitForFunction(()=>document.querySelector('.gallview_head .dcb-memo-value').textContent==='새 전체 메모');
  await page.evaluate(()=>{window.memoMutations=0;window.mo=new MutationObserver(rs=>memoMutations+=rs.length);mo.observe(document.querySelector('.gallview_head'),{subtree:true,childList:true,characterData:true});});
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>memoMutations),0);
  assert.equal(await page.evaluate(()=>writes),0,'display repair must not write storage');
  fs.mkdirSync('test-results/memo-display',{recursive:true});
  await page.screenshot({path:`test-results/memo-display/${engine}.png`});
  await page.evaluate(()=>restore({}));
  await page.waitForFunction(()=>document.querySelector('.gallview_head .dcb-memo-value').textContent==='📝');
  assert.deepEqual(errors,[]);
});
