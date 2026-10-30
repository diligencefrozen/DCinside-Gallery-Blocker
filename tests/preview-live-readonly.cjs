// Opt-in, isolated guest profile, actual MV3 extension and native site scripts.
// No submission: writing endpoints are aborted, and any attempt fails the run.
// DCB_LIVE_READONLY=1 node tests/preview-live-readonly.cjs [--runs=5]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),extension=process.env.DCB_EXTENSION_ROOT||root;
const runs=Number(process.argv.find(a=>a.startsWith('--runs='))?.split('=')[1]||1);
const label=process.env.DCB_PROFILE_LABEL||'after';
const article='https://gall.dcinside.com/mgallery/board/view/?id=asdf12&no=83075&page=1';
if(process.env.DCB_LIVE_READONLY!=='1')throw new Error('Set DCB_LIVE_READONLY=1 to allow live read-only requests.');
assert.ok(Number.isInteger(runs)&&runs>=1&&runs<=5);
const rows=[],network=[],errors=[],dialogs=[],checks={};let blockedWrites=0;
(async()=>{
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
 for(let run=1;run<=runs;run++){
  const profile=fs.mkdtempSync(path.join(root,'test-results/live-readonly-'));
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1100,height:850},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  let page;
  try{
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
   await worker.evaluate(()=>chrome.storage.sync.set({previewEnabled:true}));
   await context.addInitScript(()=>{
    window.__dcbReadTiming={};
    document.addEventListener('DOMContentLoaded',()=>window.__dcbReadTiming.domReady=performance.now(),{once:true});
    window.addEventListener('load',()=>window.__dcbReadTiming.load=performance.now(),{once:true});
   });
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(/\/(?:comment_submit|comment_delete_submit|comment_delete|insert_icon|insert|vote)$/.test(u.pathname)){blockedWrites++;return route.abort();}
    // Only the entry list is a fixture. Article/comments/editor/list/images are live.
    if(u.pathname==='/mgallery/board/lists/'&&u.searchParams.get('id')==='asdf12')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><table><tr class="ub-content"><td class="gall_tit"><a id="article" href="${article}">Actual article</a></td></tr></table></body></html>`});
    return route.continue();
   });
   page=await context.newPage();
   page.on('pageerror',e=>errors.push({run,name:e.name,message:e.message.slice(0,150)}));
   page.on('console',async message=>{for(const arg of message.args()){const error=await arg.evaluate(v=>v instanceof Error?{message:v.message,stack:v.stack}:null).catch(()=>null);if(error)errors.push({run,consoleError:error});}});
   page.on('dialog',async d=>{dialogs.push(d.message().slice(0,100));await d.dismiss();});
   page.on('response',async r=>{const u=new URL(r.url());if(u.pathname.startsWith('/dccon/')){
    const item={run,path:u.pathname,status:r.status()};network.push(item);
    if(u.pathname==='/dccon/lists'){try{const d=await r.json();item.target=d.target;item.listSize=Array.isArray(d.list)?d.list.length:typeof d.list;item.fields=Object.fromEntries(Object.entries(d).map(([k,v])=>[k,typeof v==='string'?`string:${v.length}`:typeof v]));}catch(_){}}
   }});
   await page.goto('https://gall.dcinside.com/mgallery/board/lists/?id=asdf12');
   await page.waitForTimeout(1500);
   for(const phase of ['cold','warm']){
    const start=Date.now();await page.locator('#article').click({button:'right'});
    await page.locator('.dcbpv-title').waitFor({timeout:30000});const articleReadyMs=Date.now()-start;
    await page.locator('.dcbpv-composer').scrollIntoViewIfNeeded();const composerReachedMs=Date.now()-start;
    const f=page.frameLocator('iframe[data-dcbpv-compose-frame]');
    await f.locator('#dcbpv-native-editor').waitFor({state:'visible',timeout:30000});const editorReadyMs=Date.now()-start;
    const frameTiming=await f.locator('body').evaluate(()=>({
     ...window.__dcbReadTiming,
     navigation:performance.getEntriesByType('navigation').map(n=>({responseEnd:n.responseEnd,domInteractive:n.domInteractive,domComplete:n.domComplete,loadEnd:n.loadEventEnd}))[0]
    }));
    const input=f.locator('#dcbpv-native-editor textarea');const typeStart=Date.now();await input.fill('읽기 전용 입력 확인');const inputMs=Date.now()-typeStart;await input.fill('');
    const pickerStart=Date.now();await f.locator('.tx_dccon').click();
    const pickerOutcome=await Promise.race([
     f.locator('#div_con.dcbpv-picker-panel').waitFor({state:'visible',timeout:16000}).then(()=>'list'),
     f.locator('#dcbpv-picker-loading').filter({hasText:/올바른|실패|필요한|거절|목록이 없습니다|불러오지 못/}).waitFor({state:'visible',timeout:16000}).then(()=>'unavailable')
    ]);
    if(pickerOutcome==='unavailable'){
     rows.push({run,phase,articleReadyMs,composerReachedMs,editorReadyMs,inputMs,pickerOutcome,pickerStatusMs:Date.now()-pickerStart,frameTiming});
     checks.serverUnavailable=await f.locator('#dcbpv-picker-loading').textContent();
     if(run===1)await page.screenshot({path:path.join(root,`test-results/live-readonly-${label}-unavailable.png`)});
     await page.locator('#dcb-preview-overlay [data-act=close]').click();await page.waitForTimeout(250);continue;
    }
    const pickerMs=Date.now()-pickerStart,icons=await f.locator('#div_con .img_dccon:visible').count();assert.ok(icons>0);
    await f.locator('#div_con .img_dccon:visible img').first().evaluate(img=>new Promise((resolve,reject)=>{
     if(img.complete)return img.naturalWidth?resolve():reject(new Error('Image failed'));
     img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(new Error('Image failed')),{once:true});
    }));
    rows.push({run,phase,articleReadyMs,composerReachedMs,editorReadyMs,inputMs,pickerOutcome,pickerMs,firstImageMs:Date.now()-pickerStart,icons,frameTiming});
    if(run===1&&phase==='warm'){
     await f.locator('#dcbpv-picker-header button').click();await f.locator('.tx_dccon').click();
     await f.locator('#div_con.dcbpv-picker-panel').waitFor({state:'visible'});checks.reopened=true;
     checks.packages=await f.locator('#div_con .li_pack').count();assert.ok(checks.packages>1);
     await f.locator('#div_con .li_pack').nth(1).click();checks.packageIcons=await f.locator('#div_con .img_dccon:visible').count();assert.ok(checks.packageIcons>0);
     const recent=f.locator('#div_con .recent_li');
     if(await recent.count()){
      const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/dccon/lists');await recent.click();
      const r=await response;checks.recentStatus=r.status();checks.recentResult=await r.text()==='not_login'?'login-required':'response-received';
      await f.locator('#div_con .li_pack').nth(1).click();
     }
     const next=f.locator('#div_con .dccon_list_paging button:visible').last();
     if(await next.count()){await next.click();checks.pagination=true;}
     await f.locator('#div_con .img_dccon:visible').first().click();await f.locator('#dcbpv-selection').waitFor({state:'visible'});checks.attachment=true;
     await f.locator('.tx_txtcon').click();await f.locator('#div_txtcon.dcbpv-picker-panel').waitFor({state:'visible'});checks.textconSwitch=true;
     await f.locator('#dcbpv-picker-header button').click();
     await page.screenshot({path:path.join(root,`test-results/live-readonly-${label}.png`)});
    }
    await page.locator('#dcb-preview-overlay [data-act=close]').click();
    await page.waitForTimeout(250);
   }
  }catch(error){
   if(page){
    checks.failureState=await page.evaluate(()=>{
     const frame=document.querySelector('iframe[data-dcbpv-compose-frame]'),s=frame?.__dcbpvEditor,d=frame?.contentDocument;
     return {state:s?{open:s.pickerOpen,pending:s.pickerPending,dismissed:s.pickerDismissed,kind:s.pickerKind}:null,
      notice:d?.querySelector('#dcbpv-picker-loading')?.textContent,
      panels:[...d?.querySelectorAll('#div_con,#div_txtcon')||[]].map(n=>({id:n.id,display:n.style.display,computed:getComputedStyle(n).display,classes:n.className,icons:n.querySelectorAll('.img_dccon').length,inBox:!!n.closest('#dcbpv-native-editor'),parent:n.parentElement.className}))};
    }).catch(()=>null);
    await page.screenshot({path:path.join(root,`test-results/live-readonly-${label}-failure.png`)}).catch(()=>{});
   }throw error;
  }finally{await context.close();}
 }
 assert.equal(blockedWrites,0,'Selection must not attempt a write');
 if(checks.serverUnavailable)process.exitCode=2; // External availability is not a passing selection test.
})().catch(error=>{checks.failure=error.message;process.exitCode=1;}).finally(()=>{
 const summary={};for(const phase of ['cold','warm']){
  summary[phase]={};for(const key of ['articleReadyMs','editorReadyMs','inputMs','pickerMs','firstImageMs']){
   const values=rows.filter(r=>r.phase===phase&&Number.isFinite(r[key])).map(r=>r[key]).sort((a,b)=>a-b);
   summary[phase][key]={median:values[Math.floor(values.length/2)],p95:values[Math.ceil(values.length*.95)-1]};
  }
 }
 const output={runs,guest:true,hostListFixture:true,rows,summary,checks,blockedWrites,network,errors,dialogs};
 fs.writeFileSync(path.join(root,`test-results/live-readonly-${label}.json`),JSON.stringify(output,null,2));
 console.log(JSON.stringify({summary,checks,blockedWrites,errors}));
});
