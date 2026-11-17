const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');const {setTimeout:delay}=require('node:timers/promises');
const {chromium,firefox}=require('playwright');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'test-results/native-private-context');fs.mkdirSync(artifacts,{recursive:true});

// Synthetic records are written only to a new disposable test browser profile.
// Production import still reads the website; it never writes its source keys.
async function exercisePrivateImport(){
  const api=globalThis.browser||chrome,bridge='https://gall.dcinside.com/_js/crossDomainStorage.html';
  const wait=async predicate=>{for(let i=0;i<200;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,100))}throw Error('private import timeout')};
  await wait(()=>typeof DCBNativeRecordContext!=='undefined'&&typeof DCBNativeAuto!=='undefined');
  const own=await api.windows.getCurrent(),normal=await api.tabs.create({windowId:own.id,url:bridge,active:false});
  let privateWindow;
  const result={};
  const raw=marker=>({block_all:JSON.stringify({on:1,word:marker+'단어',id:marker+'uid',nick:'',ip:''}),block_parts:'{}',user_memo:JSON.stringify({0:{pcode:{[marker+'uid']:{memo:marker+'메모',color:'#123456'}},ip:{}}})});
  const ready=async tab=>{await wait(async()=>{const t=await api.tabs.get(tab.id);return t.status==='complete'&&t.url===bridge});return tab};
  const inject=async(tab,func,args=[])=>{const rows=await api.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func,args,world:'ISOLATED'});if(rows[0]?.error)throw Error(rows[0].error.message);return rows[0]?.result};
  try{
    privateWindow=await api.windows.create({incognito:true,url:bridge,focused:false});
    const privateTab=privateWindow.tabs?.[0]||(await api.tabs.query({windowId:privateWindow.id}))[0];
    if(!privateTab?.incognito||normal.incognito)throw Error('test browser modes are not distinct');
    await ready(normal);await ready(privateTab);
    for(const [tab,marker]of [[normal,'regularfixture'],[privateTab,'privatefixture']])await inject(tab,data=>{for(const [key,value]of Object.entries(data))localStorage.setItem(key,value)},[raw(marker)]);
    const read=async tab=>inject(tab,()=>Object.fromEntries(['block_all','block_parts','user_memo'].map(key=>[key,localStorage.getItem(key)])));
    const beforeRegular=await read(normal),beforePrivate=await read(privateTab);
    if(beforeRegular.block_all===beforePrivate.block_all)throw Error('browser site storage is not isolated');
    const beforeTabs=(await api.tabs.query({})).map(tab=>tab.id).sort((a,b)=>a-b);
    const beforeMemos=JSON.stringify((await api.storage.local.get('userMemos')).userMemos||{});
    for(const [mode,marker,other]of [['regular','regularfixture','privatefixture'],['private','privatefixture','regularfixture']]){
      const select=document.getElementById('recordsNativeContext');select.value=mode;select.dispatchEvent(new Event('change'));
      document.getElementById('recordsNativeAuto').click();
      await wait(()=>!document.getElementById('recordsNativeAuto').disabled);
      const progress=document.getElementById('recordsNativeProgress'),status=document.getElementById('recordsNativeProgressText').textContent;
      if(progress.value!==100)throw Error(mode+': '+status);
      const rows=document.getElementById('officialMemoRows').textContent;
      if(!rows.includes(marker)||rows.includes(other))throw Error('wrong source mode in '+mode+' preview');
      if(mode==='private'&&!document.getElementById('recordsNativeContextHelp').textContent.includes('확장 저장소에 남습니다'))throw Error('private persistence is undisclosed');
      result[mode]={complete:true,correctRecords:true,label:status.includes(mode==='private'?'시크릿':'일반'),previewOnly:JSON.stringify((await api.storage.local.get('userMemos')).userMemos||{})===beforeMemos};
    }
    if(JSON.stringify((await api.tabs.query({})).map(tab=>tab.id).sort((a,b)=>a-b))!==JSON.stringify(beforeTabs))throw Error('import leaked its helper tab');
    result.sourceUnchanged=JSON.stringify(beforeRegular)===JSON.stringify(await read(normal))&&JSON.stringify(beforePrivate)===JSON.stringify(await read(privateTab));
    if(!result.sourceUnchanged||!result.regular.previewOnly||!result.private.previewOnly)throw Error('preview changed stored records');
    return JSON.stringify(result);
  }finally{await api.tabs.remove(normal.id).catch(()=>{});if(privateWindow)await api.windows.remove(privateWindow.id).catch(()=>{});}
}

test('Chromium installed import reads different real normal/private site stores', {timeout:60000},async t=>{
  const profile=fs.mkdtempSync(path.join(artifacts,'chromium-'));
  const options={headless:true,executablePath:chromium.executablePath(),args:['--load-extension='+root,'--disable-extensions-except='+root]};
  let context=await chromium.launchPersistentContext(profile,options);t.after(()=>context?.close());
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
  // Use the actual extension-manager switch only in this isolated profile.
  // Incognito permission is never changed by the production extension.
  const manager=await context.newPage();await manager.goto('chrome://extensions/?id='+id);
  await manager.locator('#allow-incognito #crToggle').click();
  // This Chromium build leaves command-line unpacked extensions reloading
  // after the switch. Restart only this fixture to finish applying it.
  await context.close();context=await chromium.launchPersistentContext(profile,options);
  const settings=await context.newPage();await settings.goto('chrome://extensions/?id='+id);
  const enabled=settings.locator('extensions-detail-view #enableToggle');
  if(await enabled.getAttribute('aria-pressed')!=='true')await enabled.click();
  await settings.waitForFunction(()=>document.querySelector('extensions-manager')?.shadowRoot.querySelector('extensions-detail-view')?.data?.state==='ENABLED');
  const page=await context.newPage();await page.goto('chrome-extension://'+id+'/src/ui/options/options.html#settingsDcRecords');
  assert.equal(await page.evaluate(()=>new Promise(resolve=>chrome.extension.isAllowedIncognitoAccess(resolve))),true,'fixture private permission enabled');
  const result=JSON.parse(await page.evaluate(exercisePrivateImport));fs.writeFileSync(path.join(artifacts,'chromium.json'),JSON.stringify(result,null,2));assert.equal(result.sourceUnchanged,true);
});

test('Firefox installed import reads different real normal/private site stores', {timeout:60000},async t=>{
  const profile=fs.mkdtempSync(path.join(artifacts,'firefox-')),fixture=path.join(profile,'extension');fs.mkdirSync(fixture);
  for(const item of ['manifest.json','src','icons','vendor','models','licenses'])fs.cpSync(path.join(root,item),path.join(fixture,item),{recursive:true});
  fs.appendFileSync(path.join(fixture,'src/background/background-entry.js'),'\nbrowser.runtime.onInstalled.addListener(()=>browser.runtime.openOptionsPage());');
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const child=spawn(firefox.executablePath(),['-headless','-no-remote','-profile',profile,'--remote-debugging-port',String(port),'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws,seq=0;const pending=new Map(),closed=new Promise(resolve=>child.once('exit',resolve));
  t.after(async()=>{ws?.close();if(child.exitCode===null)child.kill();await closed});
  for(let i=0;i<100;i++){try{ws=new WebSocket('ws://127.0.0.1:'+port+'/session');await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});break}catch{await delay(100)}}
  ws.onmessage=event=>{const message=JSON.parse(event.data);pending.get(message.id)?.(message);pending.delete(message.id)};
  const command=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},40000);pending.set(id,message=>{clearTimeout(timer);message.error?reject(Error(message.message)):resolve(message.result)});ws.send(JSON.stringify({id,method,params}))});
  await command('session.new',{capabilities:{alwaysMatch:{}}});
  await command('webExtension.install',{extensionData:{type:'path',path:fixture},'moz:allowPrivateBrowsing':true});
  let tab;for(let i=0;i<100&&!tab;i++){tab=(await command('browsingContext.getTree',{})).contexts.find(c=>c.url.includes('options.html'));if(!tab)await delay(100)}assert.ok(tab,'fixture extension options opened');
  const response=await command('script.evaluate',{target:{context:tab.context},expression:'('+exercisePrivateImport.toString()+')()',awaitPromise:true});
  assert.equal(response.type,'success',response.exceptionDetails?.text);const result=JSON.parse(response.result.value);fs.writeFileSync(path.join(artifacts,'firefox.json'),JSON.stringify(result,null,2));assert.equal(result.sourceUnchanged,true);
  await command('browser.close',{});
});
