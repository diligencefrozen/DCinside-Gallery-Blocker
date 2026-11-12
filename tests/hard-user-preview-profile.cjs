/* Windows, isolated Firefox BiDi / Chromium preview benchmark. */
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium, firefox } = require('playwright');
const { setTimeout: delay } = require('node:timers/promises');
const assert = require('node:assert/strict');
const nativeDocument = require('./helpers/native-preview-document.cjs');

async function run() {
  const [extension, input, output, soak = '0'] = process.argv.slice(2);
  const useChrome = process.argv.includes('--chromium');
  const backup = require('./helpers/synthetic-profile-backup.cjs')(JSON.parse(await fs.readFile(input, 'utf8')));
  const manifest = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'));
  const id = manifest.browser_specific_settings.gecko.id;
  const uuid = 'e5723cfe-f725-46c3-b818-589b91c9627f';
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-firefox-profile-'));
  // Use the official options import transaction in a disposable test add-on.
  // BiDi cannot navigate an ordinary tab directly to a moz-extension URL.
  const staged = path.join(profile,'fixture-extension');
  await fs.mkdir(staged);
  for (const file of ['manifest.json','src','icons','options','models','vendor','licenses']) {
    await fs.cp(path.join(extension,file),path.join(staged,file),{recursive:true});
  }
  await fs.appendFile(path.join(staged,'src/background/background-entry.js'),
    '\n(globalThis.browser||chrome).runtime.onInstalled.addListener(()=>(globalThis.browser||chrome).runtime.openOptionsPage());\n');
  const fixtureUrl='https://gall.dcinside.com/board/lists/?id=dcbfixture';
  const restore=async function(snapshot,url,multipleTabs,waitForRoutes,groups){
    const api=globalThis.browser||chrome;
    while(waitForRoutes && !(await api.storage.session.get('fixtureRoutesReady')).fixtureRoutesReady)
      await new Promise(resolve=>setTimeout(resolve,50));
    while (!(await api.storage.local.get('dcbSettingsBatchV1')).dcbSettingsBatchV1?.phase?.includes('committed'))
      await new Promise(resolve=>setTimeout(resolve,100));
    const {sync,local,blockedUids}=parseBackupPayload(snapshot);
    await commitBackupImportCaches(sync,local,blockedUids);
    const stored=await api.storage.sync.get(Object.keys(sync));
    for(const key of Object.keys(sync)) if(typeof sync[key]==='boolean' && stored[key]!==sync[key]) throw Error('Restore mismatch '+key);
    const nativeSamples=[];
    if(groups){
      const nativeUrl=url.replace('/lists/','/view/')+'&no=777';
      const variants=[
        ['restored',{}],
        ['without-ai',{dcbTextDetection:{...sync.dcbTextDetection,enabled:false}}],
        ['without-account',{dcbImageAccountRules:{...sync.dcbImageAccountRules,enabled:false}}],
        ['without-author-ui',{showUidBadge:false,showMemberIpInfo:false,userMemoEnabled:false}],
        ['without-font',{dcbApplyFontToDc:false}],['without-keywords',{keywordHideEnabled:false}],
        ['without-preview',{previewEnabled:false}],['without-refresh',{autoRefreshEnabled:false}]
      ];
      for(const [group,patch] of variants){
        await api.storage.sync.set({...sync,...patch});
        const native=await api.tabs.create({url:nativeUrl});
        try{
          for(let i=0;i<100;i++){if((await api.tabs.get(native.id)).status==='complete')break;await new Promise(r=>setTimeout(r,50));}
          await new Promise(r=>setTimeout(r,900));
          const [{result}]=await api.scripting.executeScript({target:{tabId:native.id},func:async()=>{
            const rows=document.querySelectorAll('.cmt_list li').length;
            let changes=0;const mo=new MutationObserver(r=>changes+=r.length);
            mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
            const frames=[],start=performance.now();let previous=start;
            await new Promise(resolve=>requestAnimationFrame(function tick(now){
              frames.push(now-previous);previous=now;scrollBy(0,16);
              if(now-start<1800)requestAnimationFrame(tick);else resolve();
            }));
            mo.disconnect();frames.sort((a,b)=>a-b);
            return {rows,mutations:changes,p95:frames[Math.ceil(frames.length*.95)-1],slow:frames.filter(ms=>ms>50).length};
          }});
          if(result?.rows!==500)throw Error('Invalid native gallery fixture');
          nativeSamples.push({group,...result});
        }finally{await api.tabs.remove(native.id);}
      }
      await api.storage.sync.set(sync);
      await api.storage.local.set({fixtureGroupResults:nativeSamples});
    }
    await api.tabs.create({url});
    if(multipleTabs)await api.tabs.create({url:url+'&page=2',active:false});
  };
  await fs.appendFile(path.join(staged,'src/ui/options/options.js'),
    '\n;('+restore.toString()+')('+JSON.stringify(backup)+','+JSON.stringify(fixtureUrl)+','+(Number(soak)>0)+','+useChrome+','+process.argv.includes('--groups')+');\n');
  await fs.appendFile(path.join(staged,'src/content/core/content_script.js'),
    '\ndocument.documentElement.dataset.fixturePreviewReady="1";\n'+
    (process.argv.includes('--groups') ? 'chrome.storage.local.get("fixtureGroupResults").then(({fixtureGroupResults})=>{if(fixtureGroupResults)document.documentElement.dataset.fixtureGroups=JSON.stringify(fixtureGroupResults)});' : ''));
  const loader=path.join(staged,'src/content/core/feature-loader.js');
  const elapsed='const elapsed = performance.now() - started;';
  const loaderSource=await fs.readFile(loader,'utf8');
  assert.ok(loaderSource.includes(elapsed));
  await fs.writeFile(loader,loaderSource.replace(elapsed,elapsed+`
        const root=document.documentElement;
        const samples=JSON.parse(root.dataset.fixtureBatches||'[]');
        samples.push({batch,ms:Math.round(elapsed),features:injected.length});
        root.dataset.fixtureBatches=JSON.stringify(samples);`));
  const server = net.createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise(r => server.close(r));
  const prefs = { 'extensions.webextensions.uuids': JSON.stringify({[id]:uuid}),
    'browser.shell.checkDefaultBrowser':false, 'browser.startup.homepage_override.mstone':'ignore',
    'datareporting.policy.dataSubmissionEnabled':false };
  await fs.writeFile(path.join(profile, 'user.js'), Object.entries(prefs).map(([k,v])=>'user_pref('+JSON.stringify(k)+','+JSON.stringify(v)+');').join('\n'));
  let chromeContext;
  const child = useChrome ? null : spawn(process.env.FIREFOX_BINARY || firefox.executablePath(),
    ['-headless','-no-remote','-profile',profile,'--remote-debugging-port',String(port),'about:blank'],
    {windowsHide:true,stdio:'ignore',env:{...process.env,...(process.env.DCB_GECKO_PROFILE?{MOZ_PROFILER_STARTUP:'1',MOZ_PROFILER_SHUTDOWN:path.resolve(process.env.DCB_GECKO_PROFILE),MOZ_PROFILER_STARTUP_FILTERS:'GeckoMain',MOZ_PROFILER_STARTUP_INTERVAL:'2'}:{})}});
  const closed = child && new Promise(r=>child.once('exit',r));
  let ws, seq=0;
  const pending = new Map();
  function command(method,params) {
    const id=++seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timed out '+method));},method==='script.evaluate'?180000:30000);
      pending.set(id,msg=>{clearTimeout(timer);msg.error?reject(Error(method+' '+msg.message)):resolve(msg.result)});
      ws.send(JSON.stringify({id,method,params}));
    });
  }
  const list=Array.from({length:100},(_,i)=>'<tr class="ub-content"><td class="gall_tit"><a href="/board/view/?id=dcbfixture&no='+(i+1)+'">Fixture '+i+'</a></td></tr>').join('');
  const rows=n=>Array.from({length:n},(_,i)=>'<div class="cmt_info" data-no="'+(i+1)+'"><span class="gall_writer" data-nick="Tester" data-uid="fixture'+i+'"></span><div class="cmt_txtbox"><p class="usertxt">Ordinary fixture '+i+'</p></div></div>').join('');
  const article=n=>'<article class="gallview"><header class="gallview_head"><span class="title_subject">Fixture</span><span class="gall_writer" data-uid="fixture0" data-nick="Tester"></span></header><div class="write_div">'+('<p>Fixture article content for the preview. </p>'.repeat(130))+'</div><div id="comment_wrap">'+rows(n)+'</div></article>';
  const nativeArticle='<article><h3 class="title_subject">Fixture</h3><div class="write_div">Fixture article.</div><div class="comment_wrap"><ul class="cmt_list">'+
    Array.from({length:500},(_,i)=>`<li class="ub-content" id="comment_li_${i+1}"><div class="cmt_info" data-no="${i+1}"><div class="cmt_nickbox"><span class="gall_writer" data-uid="fixture${i}" data-nick="Tester"><span class="nickname"><em>Tester</em></span><span class="writer_nikcon"></span></span></div><div class="cmt_txtbox"><p class="usertxt">Ordinary fixture comment ${i}.</p></div></div></li>`).join('')+'</ul></div></article>';
  let count=50,reads=0;
  try{
    // Firefox BiDi does not intercept the extension background's fetch. Serve
    // fixture articles at that transport boundary, using the real message path.
    const bg=path.join(staged,'src/background/background.js');
    const needle="  if (!['dcb.fetchText','dcb.cancelFetch'].includes(msg?.type)) return;";
    const original=await fs.readFile(bg,'utf8');
    assert.ok(original.includes(needle));
    const fixtures=Object.fromEntries([[1,50],[3,500],[5,2000]].map(([no,n])=>[no,article(n)]));
    for(let no=81;no<=84;no++)fixtures[no]=article(2);
    await fs.writeFile(bg,original.replace(needle,()=>needle+'\n  if(msg.type==="dcb.fetchText" && msg.url.includes("dcbfixture")) {const u=new URL(msg.url);const text=fixtureArticles[u.searchParams.get("no")||u.pathname.split("/").pop()]; sendResponse({ok:true,status:200,text,finalUrl:msg.url});return;}')+'\nconst fixtureArticles='+JSON.stringify(fixtures)+';\n');
    let tab, evalIn, version;
    const wait=async(ctx,expression)=>{for(let i=0;i<160;i++){try{if(await evalIn(ctx,expression))return;}catch{}await delay(100)}throw Error('Timed out: '+expression)};
    if(useChrome){
      chromeContext=await chromium.launchPersistentContext('',{headless:true,executablePath:chromium.executablePath(),args:['--disable-extensions-except='+staged,'--load-extension='+staged]});
      await chromeContext.route(/^https?:/,route=>{
        const url=new URL(route.request().url()),fixture=url.searchParams.get('id')==='dcbfixture';
        if(fixture)reads++;
        const no=Number(url.searchParams.get('no'));
        const body=no>=81&&no<=84?nativeDocument(url.href,false):no===777?nativeArticle:'<table class="gall_list"><tbody>'+list+'</tbody></table>';
        return route.fulfill({status:fixture?200:404,contentType:'text/html; charset=utf-8',body:fixture?body:''});
      });
      const worker=chromeContext.serviceWorkers()[0]||await chromeContext.waitForEvent('serviceworker');
      await worker.evaluate(()=>chrome.storage.session.set({fixtureRoutesReady:true}));
      const pageAt=()=>chromeContext.pages().find(p=>p.url()===fixtureUrl);
      for(let i=0;i<(process.argv.includes('--groups')?1500:160)&&!pageAt();i++)await delay(100);
      tab=pageAt();assert.ok(tab,'Chromium restored fixture tab');
      if(await tab.locator('tr.ub-content').count()!==100) await tab.reload({waitUntil:'domcontentloaded'});
      evalIn=(page,expression)=>page.evaluate(expression);
      version=chromeContext.browser().version();
    }else{
    for(let i=0;i<100;i++){try{ws=new WebSocket('ws://127.0.0.1:'+port+'/session');await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});break;}catch{await delay(100)}}
    ws.onmessage=e=>{const msg=JSON.parse(e.data);if(pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);return;}
      if(msg.method==='log.entryAdded' && ['error','warn'].includes(msg.params.level))
        console.log('Firefox',String(msg.params.text).slice(0,180));
      if(msg.method==='network.beforeRequestSent'&&msg.params.isBlocked){
        const req=msg.params.request;const url=new URL(req.url);
        const isFixture=url.searchParams.get('id')==='dcbfixture'||url.pathname.includes('/dcbfixture/');
        if(isFixture)reads++;
        const no=Number(url.searchParams.get('no'));
        const body=isFixture?(url.pathname.includes('lists')?'<table class="gall_list"><tbody>'+list+'</tbody></table>':no>=81&&no<=84?nativeDocument(url.href,false):no===777?nativeArticle:article(count)):'';
        void command('network.provideResponse',{request:req.request,statusCode:isFixture?200:404,headers:[{name:'Content-Type',value:{type:'string',value:'text/html; charset=utf-8'}}],body:{type:'string',value:body}}).catch(()=>{});
      }};
    const session=await command('session.new',{capabilities:{alwaysMatch:{}}});
    await command('session.subscribe',{events:['network.beforeRequestSent','log.entryAdded']});
    await command('network.addIntercept',{phases:['beforeRequestSent'],urlPatterns:['http','https'].map(protocol=>({type:'pattern',protocol}))});
    await command('webExtension.install',{extensionData:{type:'path',path:staged}});
    version=session.capabilities.browserVersion;
    evalIn=async(context,expression)=>{
      const res=await command('script.evaluate',{target:{context},expression,awaitPromise:true});
      if(res.type==='exception')throw Error(res.exceptionDetails.text);return res.result.value;
    };

    for(let i=0;i<(process.argv.includes('--groups')?1500:150)&&!tab;i++){
      const tree=await command('browsingContext.getTree',{});
      tab=tree.contexts.find(item=>item.url===fixtureUrl)?.context;
      if(!tab)await delay(150);
    }
    assert.ok(tab,'Restored fixture tab must open');
    console.log('Firefox backup restored');
    }
    await wait(tab,'document.querySelectorAll("tr.ub-content").length===100');
    let nativeGroups=[];
    if(process.argv.includes('--groups')){
      await wait(tab,'!!document.documentElement.dataset.fixtureGroups');
      nativeGroups=JSON.parse(await evalIn(tab,'document.documentElement.dataset.fixtureGroups'));
    }
    await wait(tab,'document.documentElement.dataset.fixturePreviewReady==="1"');
    const samples=[];
    const effects=[];
    for(count of [50,500,2000]){
      console.log('Measuring',count,'comments');
      for(let i=0;i<7;i++){
        const index=count===50?0:count===500?2:4;
        await evalIn(tab, 'performance.mark("preview-begin");true');
        await evalIn(tab,'window.dcbStart=performance.now();document.querySelectorAll(".gall_tit a")['+index+'].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));true');
        try { await wait(tab,'!!document.querySelector(".dcbpv-article")'); }
        catch(e){console.log('reads',reads,'overlay',await evalIn(tab,'document.querySelector("#dcb-preview-overlay")?.textContent.slice(0,200)'));throw e;}
        samples.push(JSON.parse(await evalIn(tab,'JSON.stringify({ms:Math.round(performance.now()-dcbStart),rows:document.querySelectorAll(".dcbpv-comment-item").length,frames:document.querySelectorAll("#dcb-preview-overlay iframe").length})')).valueOf());
        Object.assign(samples.at(-1),{count,phase:i===0?'cold':'warm'});
        if(i===6){
          const start=Date.now();
          await evalIn(tab,'document.querySelector(".dcbpv-comments").scrollIntoView();true');
          await wait(tab,'document.querySelectorAll(".dcbpv-comment-item").length>='+Math.min(count,80));
          samples.at(-1).commentWaitMs=Date.now()-start;
          if (count===2000 && process.argv.includes('--effects')) {
            for (const blur of [true,false,false,true]) {
              const measure = async function(blur) {
                const overlay=document.querySelector("#dcb-preview-overlay"),scroll=overlay.querySelector(".dcbpv-scroll");
                overlay.style.backdropFilter=blur?'':'none';
                const top=scroll.scrollTop, frames=[];
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                let prev=performance.now(), start=prev;
                await new Promise(resolve=>{function tick(now){
                  frames.push(now-prev);prev=now;
                  scroll.scrollTop=top+Math.round(40*Math.sin((now-start)/250));
                  if(now-start<1500)requestAnimationFrame(tick);else resolve();
                }requestAnimationFrame(tick)});
                scroll.scrollTop=top;overlay.style.removeProperty('backdrop-filter');
                frames.sort((a,b)=>a-b);
                return JSON.stringify({blur,p95Ms:frames[Math.ceil(frames.length*.95)-1],slowFrames:frames.filter(x=>x>50).length});
              };
              effects.push(JSON.parse(await evalIn(tab,'('+measure.toString()+')('+blur+')')));
            }
          }
        }
        await evalIn(tab,'performance.mark("preview-end");true');
        await fs.writeFile(output,JSON.stringify({browser:version,reads,samples},null,2));
        await evalIn(tab,'document.querySelector("#dcb-preview-overlay [data-act=close]").click();true');
        assert.equal(await evalIn(tab,'document.querySelectorAll("#dcb-preview-overlay iframe").length'),0);
      }
    }
    const batches=JSON.parse(await evalIn(tab,'document.documentElement.dataset.fixtureBatches||"[]"'));
    const editors=[];
    if(process.argv.includes('--editors')){
      for(const [i,board] of ['','mgallery/','mini/','person/'].entries()){
        const url='/'+board+'board/view/?id=dcbfixture&no='+(81+i);
        for(const phase of ['cold','warm']){
          await evalIn(tab,`document.querySelector('.gall_tit a').href=${JSON.stringify(url)};document.querySelector('.gall_tit a').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));true`);
          await wait(tab,'!!document.querySelector(".dcbpv-article")');
          const start=Date.now();
          await evalIn(tab,`{const toggle=document.querySelector('[data-act=compose]');if(toggle.getAttribute('aria-expanded')==='false')toggle.click();const input=document.querySelector('.dcbpv-resume-input');if(input)input.dispatchEvent(new Event('focus'));}true`);
          const editor='document.querySelector("iframe[data-dcbpv-compose-frame]")?.contentDocument?.querySelector("#dcbpv-native-editor textarea")';
          await wait(tab,'!!('+editor+')');
          editors.push({board:board||'main',phase,readyMs:Date.now()-start,frames:await evalIn(tab,'document.querySelectorAll("iframe[data-dcbpv-compose-frame]").length')});
          await evalIn(tab,`{const input=${editor};input.value='합성 초안';input.dispatchEvent(new Event('input',{bubbles:true}));}true`);
          await evalIn(tab,'document.querySelector("#dcb-preview-overlay [data-act=close]").click();true');
          assert.equal(await evalIn(tab,'document.querySelectorAll("iframe[data-dcbpv-compose-frame]").length'),0);
        }
      }
    }
    const result={browser:version,reads,samples,effects,nativeGroups,batches,editors};
    await fs.writeFile(output,JSON.stringify(result,null,2));console.log('Preview samples',samples.length);
    if(Number(soak)>0){const end=Date.now()+Number(soak)*60000;
      result.soakSamples=[];
      if(useChrome) {
        for(const page of chromeContext.pages().filter(p=>p.url().startsWith(fixtureUrl))){
          if(await page.locator('tr.ub-content').count()!==100) await page.reload({waitUntil:'domcontentloaded'});
          assert.equal(await page.locator('tr.ub-content').count(),100);
        }
      }
      while(Date.now()<end){
        await delay(Math.min(60000,end-Date.now()));
        const tabs=useChrome?chromeContext.pages().filter(p=>p.url().startsWith(fixtureUrl)):
          (await command('browsingContext.getTree',{})).contexts.filter(p=>p.url.startsWith(fixtureUrl)).map(p=>p.context);
        const pages=[];
        for(const target of tabs){
          pages.push(JSON.parse(await evalIn(target,'JSON.stringify({hidden:document.hidden,rows:document.querySelectorAll("tr.ub-content").length,nodes:document.getElementsByTagName("*").length,frames:document.querySelectorAll("iframe[data-dcbpv-compose-frame]").length,heap:performance.memory?.usedJSHeapSize})')));
        }
        result.soakSamples.push({at:Date.now(),pages,reads});
        await fs.writeFile(output,JSON.stringify(result,null,2));
      }
      result.soakMinutes=Number(soak);result.remainingFrames=await evalIn(tab,'document.querySelectorAll("iframe[data-dcbpv-compose-frame]").length');
      await fs.writeFile(output,JSON.stringify(result,null,2));}
  }finally{
    if(ws?.readyState===1){await command('browser.close',{}).catch(()=>{});ws.close();}
    if(chromeContext)await chromeContext.close();
    if(child){await Promise.race([closed,delay(10000)]);if(child.exitCode===null)child.kill();await closed;}
    await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}
run().catch(e=>{console.error(e.message);process.exitCode=1});
