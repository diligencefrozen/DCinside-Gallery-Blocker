// Opt-in, isolated guest profile, actual MV3 extension and native site scripts.
// No submission: writing endpoints are aborted, and any attempt fails the run.
// DCB_LIVE_READONLY=1 node tests/preview-live-readonly.cjs [--runs=5]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),extension=process.env.DCB_EXTENSION_ROOT||root;
const runs=Number(process.argv.find(a=>a.startsWith('--runs='))?.split('=')[1]||1);
const label=process.env.DCB_PROFILE_LABEL||'after';
const profileLive=process.argv.includes('--profile-live');
const traceLive=profileLive&&process.argv.includes('--trace-live');
const realList=process.argv.includes('--real-list');
const withoutBackdrop=process.argv.includes('--without-backdrop');
if(profileLive)assert.match(label,/^[a-zA-Z0-9_-]{1,80}$/);
const best=process.argv.includes('--dcbest');
const article=process.env.DCB_ARTICLE_URL||(best?'https://gall.dcinside.com/board/view/?id=dcbest&no=475940&_dcbest=4&page=1':'https://gall.dcinside.com/mgallery/board/view/?id=asdf12&no=83075&page=1');
const articleUrl=new URL(article);
assert.equal(articleUrl.origin,'https://gall.dcinside.com');
assert.match(articleUrl.pathname,/^\/(?:mgallery\/|mini\/|person\/)?board\/view\/$/);
assert.match(articleUrl.searchParams.get('id'),/^[a-zA-Z0-9_]+$/);
assert.match(articleUrl.searchParams.get('no'),/^[1-9]\d*$/);
const listUrl=articleUrl.origin+articleUrl.pathname.replace('/view/','/lists/')+'?id='+articleUrl.searchParams.get('id');
if(process.env.DCB_LIVE_READONLY!=='1')throw new Error('Set DCB_LIVE_READONLY=1 to allow live read-only requests.');
assert.ok(Number.isInteger(runs)&&runs>=1&&runs<=5);
const rows=[],network=[],errors=[],dialogs=[],checks={};let blockedWrites=0;
const native=[];
const liveProfile={samples:[],files:[],observerScope:'MAIN-world callbacks only; isolated extension observers are not wrapped'};

function diagnosticUrl(value){
 try{
  const url=new URL(value);
  if(url.protocol==='chrome-extension:')return url.protocol+'//'+url.host+url.pathname;
  return ['http:','https:'].includes(url.protocol)?url.origin+url.pathname:'';
 }catch(_){return '';}
}
function diagnosticCallFrame(frame){
 return {functionName:String(frame?.functionName||'').slice(0,160),scriptId:String(frame?.scriptId||''),
  url:diagnosticUrl(frame?.url||''),lineNumber:Number(frame?.lineNumber)||0,columnNumber:Number(frame?.columnNumber)||0};
}
function diagnosticTraceEvent(event){
 const safe={};
 for(const key of ['name','cat','ph','ts','dur','pid','tid','id'])if(event[key]!==undefined)safe[key]=event[key];
 const data=event.args?.data;
 if(data){
  const args={};
  if(data.url!==undefined||data.functionName!==undefined)Object.assign(args,diagnosticCallFrame(data));
  if(Array.isArray(data.stackTrace))args.stackTrace=data.stackTrace.map(diagnosticCallFrame);
  if(Object.keys(args).length)safe.args={data:args};
 }
 // Headers, request/response data, script source, DOM and arbitrary trace args
 // are omitted. CPU samples are saved separately with sanitized call frames.
 return safe;
}
function liveDiagnosticState(){
 const counters=win=>{
  const source=win?.__dcbReadonlyLiveStats;
  if(!source)return null;
  return {observerCallbacks:source.observerCallbacks,observerRecords:source.observerRecords,
   resizeEvents:source.resizeEvents,pickerMessages:source.pickerMessages,pickerHeightChanges:source.pickerHeightChanges};
 };
 const frame=document.querySelector('iframe[data-dcbpv-compose-frame]');
 let editor=null,composer=null;
 try{
  composer=counters(frame?.contentWindow);
  const state=frame?.__dcbpvEditor;
  if(state)editor={open:!!state.pickerOpen,pending:!!state.pickerPending,dismissed:!!state.pickerDismissed,
   kind:['dccon','txtcon'].includes(state.pickerKind)?state.pickerKind:null,
   frameHeight:Math.round(frame.getBoundingClientRect().height),
   selectionVisible:!!frame.contentDocument?.querySelector('#dcbpv-selection:not([hidden])')};
 }catch(_){/* A navigating editor has no readable counters yet. */}
 return {counters:{top:counters(window),composer},editor,
  media:{images:document.querySelectorAll('#dcb-preview-overlay img').length,videos:document.querySelectorAll('#dcb-preview-overlay video').length,
   frames:document.querySelectorAll('#dcb-preview-overlay iframe').length}};
}
async function startLiveDiagnostics(context,page,run){
 const cdp=await context.newCDPSession(page);
 let cpuStarted=false,traceStarted=false;
 try{
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');cpuStarted=true;
  if(traceLive){
   await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream'});
   traceStarted=true;
  }
 }catch(error){
  if(cpuStarted)await cdp.send('Profiler.stop').catch(()=>{});
  await cdp.detach().catch(()=>{});throw error;
 }
 const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
 return {
  async sample(name,durationMs,scroll=false){
   const before=await metric(),stateBefore=await page.evaluate(liveDiagnosticState);
   const frames=await page.evaluate(async({durationMs,scroll})=>{
    const scroller=document.querySelector('#dcb-preview-overlay .dcbpv-scroll');
    const initialTop=scroller?.scrollTop;
    const intervals=[],longTasks=[];
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(entry=>entry.duration)));
    observer.observe({type:'longtask'});
    const started=performance.now();let previous=started,animation=0;
    try{
     await new Promise(resolve=>{
      const timeout=setTimeout(resolve,durationMs+2000);
      function tick(now){
       intervals.push(now-previous);previous=now;
       if(scroll&&scroller){scroller.scrollTop+=18;if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight)scroller.scrollTop=0;}
       if(now-started<durationMs)animation=requestAnimationFrame(tick);
       else{clearTimeout(timeout);resolve();}
      }
      animation=requestAnimationFrame(tick);
     });
     intervals.sort((a,b)=>a-b);
     return {durationMs:Math.round(performance.now()-started),frames:intervals.length,
      frameP95Ms:intervals.length?Number(intervals[Math.ceil(intervals.length*.95)-1].toFixed(1)):null,
      slowFrames:intervals.filter(value=>value>50).length,longTasks:longTasks.length,
      maxLongTaskMs:Math.round(Math.max(0,...longTasks))};
    }finally{
     cancelAnimationFrame(animation);observer.disconnect();
     if(scroll&&scroller)scroller.scrollTop=initialTop;
    }
   },{durationMs,scroll});
   const after=await metric(),stateAfter=await page.evaluate(liveDiagnosticState),counterDelta={};
   for(const surface of ['top','composer']){
    const prior=stateBefore.counters[surface],next=stateAfter.counters[surface];
    counterDelta[surface]=prior&&next?Object.fromEntries(Object.keys(next).map(key=>[key,next[key]-prior[key]])):null;
   }
   liveProfile.samples.push({run,name,...frames,startedAt:before.Timestamp,endedAt:after.Timestamp,taskMs:Math.round((after.TaskDuration-before.TaskDuration)*1000),
    layoutMs:Math.round((after.LayoutDuration-before.LayoutDuration)*1000),styleMs:Math.round((after.RecalcStyleDuration-before.RecalcStyleDuration)*1000),
    counterDelta,stateBefore,stateAfter});
  },
  async finish(){
   try{
    if(cpuStarted){
     const {profile}=await cdp.send('Profiler.stop');cpuStarted=false;
     const output={nodes:profile.nodes.map(node=>({...node,callFrame:diagnosticCallFrame(node.callFrame)})),
      startTime:profile.startTime,endTime:profile.endTime,samples:profile.samples,timeDeltas:profile.timeDeltas};
     const file=`live-readonly-${label}-run${run}.cpuprofile`;
     fs.writeFileSync(path.join(root,'test-results',file),JSON.stringify(output));liveProfile.files.push(file);
    }
   }finally{
    try{
     if(traceStarted){
      const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
      await cdp.send('Tracing.end');traceStarted=false;
      const {stream}=await complete,chunks=[];let chunk;
      try{do{chunk=await cdp.send('IO.read',{handle:stream});chunks.push(chunk.data);}while(!chunk.eof);}
      finally{await cdp.send('IO.close',{handle:stream});}
      const trace=JSON.parse(chunks.join(''));
      const file=`live-readonly-${label}-run${run}.trace.json`;
      fs.writeFileSync(path.join(root,'test-results',file),JSON.stringify({traceEvents:trace.traceEvents.map(diagnosticTraceEvent)}));
      liveProfile.files.push(file);
     }
    }finally{
     await cdp.send('Profiler.disable').catch(()=>{});
     await cdp.send('Performance.disable').catch(()=>{});
     await cdp.detach().catch(()=>{});
    }
   }
  }
 };
}
// The original page only opens each picker. Its selection handler can post.
async function compareOriginal(context,run){
 const page=await context.newPage();
 try{
  await page.goto(article,{waitUntil:'domcontentloaded'});
  const text=page.locator('.tx_txtcon:visible').first();
  await text.click();
  const textVisible=await page.locator('#div_txtcon').isVisible();
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/dccon/lists',{timeout:5000}).catch(()=>null);
  await page.locator('.tx_dccon:visible').first().click();
  const r=await response;
  const data=r?await r.json().catch(()=>null):null;
  if(Array.isArray(data?.list)&&data.list.length)await page.locator('#div_con .img_dccon:visible').first().waitFor({timeout:5000}).catch(()=>{});
  native.push({run,textVisible,status:r?.status(),listSize:Array.isArray(data?.list)?data.list.length:null,
   panels:await page.locator('#div_con,#div_txtcon').evaluateAll(nodes=>nodes.map(n=>({id:n.id,parent:n.parentElement.tagName,display:getComputedStyle(n).display,icons:n.querySelectorAll('.img_dccon').length})))});
 }finally{await page.close();}
}
(async()=>{
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
 for(let run=1;run<=runs;run++){
  const profile=fs.mkdtempSync(path.join(root,'test-results/live-readonly-'));
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1100,height:850},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  let page,diagnostics;
  try{
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
   await worker.evaluate(async()=>{
    for(let i=0;i<100;i++){
     const scripts=await chrome.scripting.getRegisteredContentScripts();
     const stored=await chrome.storage.local.get('dcbSettingsBatchV1');
     if(stored.dcbSettingsBatchV1?.phase==='committed'&&scripts.some(s=>s.js?.includes('src/content/core/content_script.js')))return;
     await new Promise(resolve=>setTimeout(resolve,100));
    }throw new Error('Content profiles did not register');
   });
   // First-install defaults can race a test's settings write. Wait for their
   // transaction, then for the actual runtime snapshot to reflect the test.
   await worker.evaluate(async best=>{
    await chrome.storage.sync.set(best?{previewEnabled:true,builtinDcbestBlockEnabled:false}:{previewEnabled:true});
    for(let i=0;i<100;i++){
     const stored=await chrome.storage.local.get('dcbRuntimeSettingsHotCacheV1');
     const settings=stored.dcbRuntimeSettingsHotCacheV1?.data;
     if(settings?.previewEnabled&&(!best||settings.builtinDcbestBlockEnabled===false))return;
     await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error('Preview settings did not reach the runtime snapshot');
   },best);
   await context.addInitScript(()=>{
    window.__dcbReadTiming={};
    document.addEventListener('DOMContentLoaded',()=>window.__dcbReadTiming.domReady=performance.now(),{once:true});
    window.addEventListener('load',()=>window.__dcbReadTiming.load=performance.now(),{once:true});
   });
   if(profileLive&&run===1)await context.addInitScript(()=>{
    const stats=window.__dcbReadonlyLiveStats={observerCallbacks:0,observerRecords:0,resizeEvents:0,pickerMessages:0,pickerHeightChanges:0};
    const NativeObserver=window.MutationObserver;
    window.MutationObserver=class extends NativeObserver{
     constructor(callback){super((records,observer)=>{stats.observerCallbacks++;stats.observerRecords+=records.length;callback.call(observer,records,observer);});}
    };
    window.addEventListener('resize',()=>stats.resizeEvents++,{passive:true});
    let height=null;
    window.addEventListener('message',event=>{
     const data=event.data;
     if(event.source!==window||event.origin!==location.origin||data?.type!=='dcb.previewComment.event'||data.kind!=='picker')return;
     stats.pickerMessages++;
     if(Number.isFinite(data.height)&&data.height!==height){stats.pickerHeightChanges++;height=data.height;}
    });
   });
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(/\/(?:comment_submit|comment_delete_submit|comment_delete|insert_icon|insert|vote)\/?$/.test(u.pathname)){blockedWrites++;return route.abort();}
    // The optional real-list mode also keeps the site's underlying list intact.
    if(!realList&&u.href===listUrl)return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><table><tr class="ub-content"><td class="gall_tit"><a id="article" href="${article}">Actual article</a></td></tr></table></body></html>`});
    return route.continue();
   });
   page=await context.newPage();
   if(profileLive&&run===1)diagnostics=await startLiveDiagnostics(context,page,run);
   page.on('pageerror',e=>errors.push({run,name:e.name,message:e.message.slice(0,150)}));
   page.on('dialog',async d=>{dialogs.push(d.message().slice(0,100));await d.dismiss();});
   page.on('response',async r=>{const u=new URL(r.url());if(u.pathname.startsWith('/dccon/')){
    const item={run,path:u.pathname,status:r.status()};network.push(item);
    if(u.pathname==='/dccon/lists'){try{const d=await r.json();item.target=d.target;item.listSize=Array.isArray(d.list)?d.list.length:typeof d.list;item.fields=Object.fromEntries(Object.entries(d).map(([k,v])=>[k,typeof v==='string'?`string:${v.length}`:typeof v]));}catch(_){}}
   }});
   await page.goto(listUrl);
   // Wait for normal lazy injection, not a fixed delay that can miss startup.
   await worker.evaluate(async listUrl=>{
    const [tab]=await chrome.tabs.query({url:listUrl});
    for(let i=0;i<100;i++){
     const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>typeof previewEnabled==='boolean'});
     if(result.result)return;await new Promise(resolve=>setTimeout(resolve,100));
    }throw new Error('Preview content script did not initialize');
   },listUrl);
   if(realList){
    const found=await page.evaluate(article=>{
     const expected=new URL(article);
     const links=[...document.querySelectorAll('a[href]')].filter(anchor=>{
      try{
       const url=new URL(anchor.getAttribute('href'),location.href);
       return url.origin===expected.origin&&url.pathname===expected.pathname
        &&url.searchParams.get('id')===expected.searchParams.get('id')
        &&url.searchParams.get('no')===expected.searchParams.get('no');
      }catch(_){return false;}
     });
     const anchor=links.find(node=>node.closest('.gall_tit'))||links[0];
     if(!anchor)return false;
     anchor.id='article';return true;
    },article);
    assert.equal(found,true,'The target article is absent from the real list page');
   }
   if(withoutBackdrop)await page.addStyleTag({content:'#dcb-preview-overlay{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'});
   for(const phase of ['cold','warm']){
    // Sample both first ready frames independently of Playwright's later editor waits.
    await page.evaluate(()=>{
     window.__previewPaint={};
     document.addEventListener('contextmenu',()=>{
      const start=performance.now(),times=window.__previewPaint;
      function sample(){
       if(!times.articlePaintMs&&document.querySelector('.dcbpv-article')?.getClientRects().length)times.articlePaintMs=Math.round(performance.now()-start);
       const comments=document.querySelector('.dcbpv-comment-html');
       if(comments?.getClientRects().length&&!comments.querySelector('.dcbpv-inline-loading'))times.commentsReadyMs=Math.round(performance.now()-start);
       if(!times.commentsReadyMs&&performance.now()-start<30000&&times===window.__previewPaint)requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
     },{once:true,capture:true});
    });
    const start=Date.now();await page.locator('#article').click({button:'right'});
    await page.locator('.dcbpv-title').waitFor({timeout:30000});const articleReadyMs=Date.now()-start;
    // Explicit user opening starts the one editor even if late comments move
    // its slot below the viewport between scrolling and IntersectionObserver.
    const toggle=page.locator('[data-act=compose]');
    if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
    await toggle.click();
    await page.locator('.dcbpv-composer').scrollIntoViewIfNeeded();const composerReachedMs=Date.now()-start;
    const f=page.frameLocator('iframe[data-dcbpv-compose-frame]');
    await f.locator('#dcbpv-native-editor').waitFor({state:'visible',timeout:30000});const editorReadyMs=Date.now()-start;
    if(process.argv.includes('--probe-comment-read')){
     checks[phase+'Read']=await f.locator('body').evaluate(async()=>{
      const value=id=>document.getElementById(id)?.value;
      const url=new URL(location.href),id=url.searchParams.get('id'),no=url.searchParams.get('no');
      const out={turnstileMode:window._TS_CMT_?.mode,turnstileState:window.ts_cmt?.st,
       fields:Object.fromEntries(['e_s_n_o','cur_t','check_6','check_7','check_8','check_9','check_10','recommend','c_r_k_x_z'].map(id=>[id,value(id)!=null]))};
      try{
       const body=new URLSearchParams({id,no,cmt_id:id,cmt_no:no,focus_cno:'',focus_pno:'',e_s_n_o:value('e_s_n_o'),
        comment_page:'1',sort:'D',prevCnt:'0',_GALLTYPE_:value('_GALLTYPE_'),secret_article_key:value('secret_article_key')||'',clean:'',nptest:''});
       const response=await fetch('/board/comment/',{method:'POST',credentials:'include',cache:'no-store',redirect:'error',
        signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body});
       out.status=response.status;
       const text=await response.text();
       try{
        const data=JSON.parse(text);out.json=true;out.commentsType=Array.isArray(data.comments)?'array':data.comments===null?'null':typeof data.comments;
        out.count=Array.isArray(data.comments)?data.comments.length:0;out.totalType=typeof data.total_cnt;out.totalNumeric=Number.isFinite(Number(data.total_cnt));
       }catch(_){out.json=false;out.responseLength=text.length;}
      }catch(error){out.errorName=error.name;out.errorMessage=String(error.message).slice(0,120);}
      return out;
     });
    }
    if(diagnostics&&phase==='cold'){
     await diagnostics.sample('editor-idle',2000);
     await diagnostics.sample('editor-scroll',1800,true);
    }
    const frameTiming=await f.locator('body').evaluate(()=>({
     ...window.__dcbReadTiming,
     navigation:performance.getEntriesByType('navigation').map(n=>({responseEnd:n.responseEnd,domInteractive:n.domInteractive,domComplete:n.domComplete,loadEnd:n.loadEventEnd}))[0]
    }));
    const input=f.locator('#dcbpv-native-editor textarea');const typeStart=Date.now();await input.fill('읽기 전용 입력 확인');const inputMs=Date.now()-typeStart;await input.fill('');
    {
     await f.locator('.tx_txtcon').click();
     const panel=f.locator('#div_txtcon.dcbpv-picker-panel');
     await panel.locator('#txtcon_input').fill('첨부 확인');
     if(diagnostics&&phase==='cold')await diagnostics.sample('textcon-idle',2000);
     await panel.getByRole('button',{name:'작성창에 첨부',exact:true}).click();
     await f.locator('#dcbpv-selection .dcbpv-textcon').filter({hasText:'첨부 확인'}).waitFor({state:'visible'});
     checks.textAttachment=true;
    }
    const pickerStart=Date.now();await f.locator('.tx_dccon').click();
    const waitForPicker=()=>Promise.race([
     f.locator('#div_con.dcbpv-picker-panel').waitFor({state:'visible',timeout:16000}).then(()=>'list'),
     f.locator('#dcbpv-picker-loading').filter({hasText:/올바른|실패|필요한|거절|목록이 없습니다|불러오지 못/}).waitFor({state:'visible',timeout:16000}).then(()=>'unavailable')
    ]);
    let pickerOutcome=await waitForPicker();
    const retry=f.getByRole('button',{name:'패키지 다시 불러오기'});
    if(best&&pickerOutcome==='unavailable'&&await retry.isVisible()){
     await retry.click();
     pickerOutcome=await waitForPicker();
     checks.packageRetry=pickerOutcome;
    }
    if(pickerOutcome==='unavailable'){
     rows.push({run,phase,articleReadyMs,composerReachedMs,editorReadyMs,inputMs,pickerOutcome,pickerStatusMs:Date.now()-pickerStart,frameTiming,...await page.evaluate(()=>window.__previewPaint)});
     checks.serverUnavailable=await f.locator('#dcbpv-picker-loading').textContent();
     if(run===1)await page.screenshot({path:path.join(root,`test-results/live-readonly-${label}-unavailable.png`)});
     await page.locator('#dcb-preview-overlay [data-act=close]').click();await page.waitForTimeout(250);continue;
    }
    const pickerMs=Date.now()-pickerStart,icons=await f.locator('#div_con .img_dccon:visible').count();assert.ok(icons>0);
    await f.locator('#div_con .img_dccon:visible img').first().evaluate(img=>new Promise((resolve,reject)=>{
     if(img.complete)return img.naturalWidth?resolve():reject(new Error('Image failed'));
     img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(new Error('Image failed')),{once:true});
    }));
    rows.push({run,phase,articleReadyMs,composerReachedMs,editorReadyMs,inputMs,pickerOutcome,pickerMs,firstImageMs:Date.now()-pickerStart,icons,frameTiming,...await page.evaluate(()=>window.__previewPaint)});
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
     for(let cycle=0;cycle<3;cycle++){
      await f.locator('.tx_txtcon').click();
      const textPanel=f.locator('#div_txtcon.dcbpv-picker-panel');
      await textPanel.waitFor({state:'visible'});
      await textPanel.locator('#txtcon_input').fill('반복 첨부 '+cycle);
      await textPanel.locator('.color_section').first().locator('.btn_color').nth(1).click();
      await textPanel.locator('.color_section').nth(1).locator('.btn_color').nth(1).click();
      const colors=await textPanel.locator('.color_section [aria-pressed=true]').evaluateAll(nodes=>nodes.map(node=>node.dataset.color));
      await textPanel.locator('#btn_txtcon_submit').click();
      const card=f.locator('.dcbpv-textcon');
      await card.waitFor({state:'visible'});
      assert.equal(await card.evaluate((node,colors)=>{
       const probe=document.createElement('span');probe.style.backgroundColor='#'+colors[0];probe.style.color='#'+colors[1];
       return node.style.backgroundColor===probe.style.backgroundColor&&node.style.color===probe.style.color;
      },colors),true);
      await f.getByRole('button',{name:'첨부 취소'}).click();
      await f.locator('.tx_dccon').click();
      await f.locator('#div_con.dcbpv-picker-panel').waitFor({state:'visible'});
      await f.locator('#dcbpv-picker-header button').click();
     }
     checks.textconSwitch=true;checks.repeatedAttachment=3;checks.backgroundAndForeground=true;
     await page.screenshot({path:path.join(root,`test-results/live-readonly-${label}.png`)});
    }
    await page.locator('#dcb-preview-overlay [data-act=close]').click();
    await page.waitForTimeout(250);
   }
   await compareOriginal(context,run);
  }catch(error){
   if(page){
    checks.failureState=await page.evaluate(()=>{
     const frame=document.querySelector('iframe[data-dcbpv-compose-frame]'),s=frame?.__dcbpvEditor,d=frame?.contentDocument;
     return {frameCount:document.querySelectorAll('iframe[data-dcbpv-compose-frame]').length,composerStatus:document.querySelector('.dcbpv-composer [role=status]')?.textContent,state:s?{open:s.pickerOpen,pending:s.pickerPending,dismissed:s.pickerDismissed,kind:s.pickerKind}:null,
      notice:d?.querySelector('#dcbpv-picker-loading')?.textContent,
      panels:[...d?.querySelectorAll('#div_con,#div_txtcon')||[]].map(n=>({id:n.id,display:n.style.display,computed:getComputedStyle(n).display,classes:n.className,icons:n.querySelectorAll('.img_dccon').length,inBox:!!n.closest('#dcbpv-native-editor'),parent:n.parentElement.className}))};
    }).catch(()=>null);
    await page.screenshot({path:path.join(root,`test-results/live-readonly-${label}-failure.png`)}).catch(()=>{});
   }throw error;
  }finally{
   if(diagnostics)try{await diagnostics.finish();}
   catch(error){liveProfile.failure={stage:'profiler-finish',name:error.name};}
   await context.close();
  }
 }
 assert.equal(blockedWrites,0,'Selection must not attempt a write');
 if(checks.serverUnavailable)process.exitCode=2; // External availability is not a passing selection test.
})().catch(error=>{checks.failure=error.message;process.exitCode=1;}).finally(()=>{
 const summary={};for(const phase of ['cold','warm']){
  summary[phase]={};for(const key of ['articlePaintMs','commentsReadyMs','articleReadyMs','editorReadyMs','inputMs','pickerMs','firstImageMs']){
   const values=rows.filter(r=>r.phase===phase&&Number.isFinite(r[key])).map(r=>r[key]).sort((a,b)=>a-b);
   summary[phase][key]={median:values[Math.floor(values.length/2)],p95:values[Math.ceil(values.length*.95)-1]};
  }
 }
 const version=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8')).version;
 const output={version,article:{id:articleUrl.searchParams.get('id'),no:articleUrl.searchParams.get('no'),path:articleUrl.pathname},runs,guest:true,hostListFixture:!realList,backdropDisabled:withoutBackdrop,rows,native,summary,checks,blockedWrites,network,errors,dialogs,...(profileLive?{liveProfile}: {})};
 fs.writeFileSync(path.join(root,`test-results/live-readonly-${label}.json`),JSON.stringify(output,null,2));
 console.log(JSON.stringify({summary,checks,blockedWrites,errors}));
});
