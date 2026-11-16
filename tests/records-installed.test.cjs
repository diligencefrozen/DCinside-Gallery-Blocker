const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const net=require("node:net");
const {spawn}=require("node:child_process");
const {setTimeout:delay}=require("node:timers/promises");
const {chromium,firefox}=require("playwright");

async function exercise(autoLive=false){
  const api=globalThis.browser || chrome;
  if(document.readyState==="loading")await new Promise(resolve=>document.addEventListener("DOMContentLoaded",resolve,{once:true}));
  const wait=async (predicate,attempts=160)=>{
    for(let i=0;i<attempts;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,50))}
    throw Error("Timed out waiting for records UI");
  };
  const el=id=>document.getElementById(id);
  await wait(()=>typeof DCBOfficialMemos!=="undefined" && typeof sendUserBlockMutation==="function");
  await api.storage.local.set({userMemos:{"uid:fixture1":{memo:"기존"}}});
  el("memoImportFormat").value="text";
  el("memoImportFormat").dispatchEvent(new Event("change"));
  el("recordsKind").value="auto";
  el("recordsKind").dispatchEvent(new Event("change"));
  el("recordsPaste").value="fixture1-충돌\n192.0-샘플, !\n예시닉\nuid:testuser";
  el("recordsPaste").dispatchEvent(new Event("input"));
  await wait(()=>el("officialMemoPreview").textContent.includes("차단 2건"));
  if(!el("officialMemoApply").disabled)throw Error("Missing confirmation");
  el("recordsConfirm").click();
  el("officialMemoApply").click();
  await wait(()=>!el("officialMemoUndo").hidden && !el("officialMemoUndo").disabled);
  const after=await api.storage.local.get("userMemos");
  if(after.userMemos["uid:fixture1"].memo!=="기존" || after.userMemos["ip:192.0"].memo!=="샘플, !")throw Error("Memo merge");
  const tokens=await DCBUserBlockStore.getAllTokensReadOnly();
  if(!tokens.includes("nick-exact:예시닉")||!tokens.includes("testuser"))throw Error("Block merge");
  after.userMemos["ip:192.0"].memo="수동 수정";
  await Promise.all([patchUserMemos([["ip:192.0",after.userMemos["ip:192.0"]]]),patchUserMemos([["uid:parallel",{memo:"동시 편집"}]])]);
  await sendUserBlockMutation("dcb.userBlockRemove",{token:"testuser"});
  await sendUserBlockMutation("dcb.userBlockAdd",{token:"testuser"});
  el("officialMemoUndo").click();
  await wait(()=>el("officialMemoUndo").hidden);
  const remaining=await DCBUserBlockStore.getAllTokensReadOnly();
  if(remaining.length!==1 || remaining[0]!=="testuser" || (await api.storage.local.get("userMemos")).userMemos["ip:192.0"].memo!=="수동 수정")throw Error("Undo removed a manual edit");
  if ((await api.storage.local.get("userMemos")).userMemos["uid:parallel"].memo!=="동시 편집") throw Error("Concurrent memo lost");
  const backup = parseBackupPayload({format:"dcb-records",version:1,userMemos:after.userMemos,blockedUids:tokens});
  if(Object.keys(backup.sync).length || backup.blockedUids.length !== 2) throw Error("Backup expanded scope");
  // Exercise the same new native payload on both installed browser engines.
  // All data is synthetic; this never reads or writes the real website.
  await api.storage.sync.set({blockedKeywords:["기존 단어"],userBlockEnabled:false,keywordBlockEnabled:false,userMemoEnabled:false});
  const nativeBlock=(targetType,value,extra={})=>({kind:"block",source:"dc-native",scope:"global",galleryId:"",galleryType:"",enabled:true,targetType,value,...extra});
  const nativeRecords=[
    nativeBlock("uid","nativeuser",{identityVerified:true,nativeTargetType:"id"}),
    nativeBlock("nick","원본닉"),nativeBlock("ip","198.51"),nativeBlock("keyword","네이티브 단어"),
    nativeBlock("uid","nativememo",{kind:"memo",identityVerified:true,memo:"원문 <>&\" ' 메모",color:"#123abc"}),
    nativeBlock("keyword","갤러리 규칙",{scope:"gallery",galleryId:"example",galleryType:"M"}),
    nativeBlock("keyword","디시에서 OFF",{enabled:false})
  ];
  const applied=await sendUserBlockMutation("dcb.recordsImport",{nativeRecords});
  if(!applied.ok || applied.blockCount!==3 || applied.memoCount!==1 || applied.keywordCount!==1 || applied.heldCount!==2)
    throw Error("Native import counts: "+JSON.stringify(applied));
  const imported=await api.storage.local.get(["userMemos","dcbRecordsImportUndo"]);
  if(imported.userMemos["uid:nativememo"].memo!=="원문 <>&\" ' 메모" || imported.userMemos["uid:nativememo"].color!=="#123abc")
    throw Error("Native memo text/color changed");
  const repeated=await sendUserBlockMutation("dcb.recordsImport",{nativeRecords});
  if(!repeated.ok || repeated.blockCount+repeated.memoCount+repeated.keywordCount+repeated.nativeCount!==0 ||
      (await api.storage.local.get("dcbRecordsImportUndo")).dcbRecordsImportUndo.id!==imported.dcbRecordsImportUndo.id)
    throw Error("Native duplicate import replaced undo");
  const settings=await api.storage.sync.get(["blockedKeywords","userBlockEnabled","keywordBlockEnabled","userMemoEnabled"]);
  if(settings.blockedKeywords.join("|")!=="기존 단어|네이티브 단어" || settings.userBlockEnabled || settings.keywordBlockEnabled || settings.userMemoEnabled)
    throw Error("Native import changed activation or promoted held rules");
  const undoneNative=await sendUserBlockMutation("dcb.recordsUndo");
  if(!undoneNative.ok || undoneNative.blockCount!==3 || undoneNative.memoCount!==1 || undoneNative.keywordCount!==1)
    throw Error("Native undo counts: "+JSON.stringify(undoneNative));
  if((await DCBUserBlockStore.getAllTokensReadOnly()).join("|")!=="testuser" ||
      (await api.storage.sync.get("blockedKeywords")).blockedKeywords.join("|")!=="기존 단어" ||
      (await api.storage.local.get("userMemos")).userMemos["uid:nativememo"])
    throw Error("Native undo damaged existing records");
  if(autoLive){
    const before=JSON.stringify((await api.storage.local.get('userMemos')).userMemos);
    const execute=chrome.scripting.executeScript.bind(chrome.scripting),diagnostics=[];
    chrome.scripting.executeScript=async args=>{const result=await execute(args);diagnostics.push(result.map(item=>({frameId:item.frameId,href:item.result?.href,error:item.error?.message,kind:typeof item.result})));return result;};
    el('recordsNativeAuto').click();
    await wait(()=>!el('recordsNativeAuto').disabled,400);
    chrome.scripting.executeScript=execute;
    if(el('recordsNativeProgress').value!==100)throw Error('Automatic native read: '+el('recordsNativeProgressText').textContent+' '+JSON.stringify(diagnostics));
    if(JSON.stringify((await api.storage.local.get('userMemos')).userMemos)!==before)throw Error('Automatic preview changed extension data');
    if((await api.tabs.query({url:'https://gall.dcinside.com/_js/crossDomainStorage.html'})).length)throw Error('Automatic read left its source tab open');
    const probe=await api.tabs.create({url:'https://gall.dcinside.com/_js/crossDomainStorage.html',active:false});
    try {
      await wait(async()=>{const tab=await api.tabs.get(probe.id);return tab.status==='complete'&&tab.url==='https://gall.dcinside.com/_js/crossDomainStorage.html';},400);
      const results=await api.scripting.executeScript({target:{tabId:probe.id,frameIds:[0]},func:DCBNativeCollector.collect,world:'ISOLATED'});
      if(!results[0]?.result?.issues?.some(issue=>issue.code==='MODAL_NOT_OPEN'))throw Error('Manual DOM collector did not return its result');
    } finally {await api.tabs.remove(probe.id);}
  }
  return true;
}
const root=path.resolve(process.env.DCB_EXTENSION_ROOT || path.join(__dirname,".."));
const artifacts=path.join(__dirname,"../test-results");
test("Chromium popup explains records import and opens the dedicated screen",async t=>{
  const context=await chromium.launchPersistentContext("",{executablePath:chromium.executablePath(),viewport:{width:440,height:850},args:["--load-extension="+root,"--disable-extensions-except="+root]});
  t.after(()=>context.close());
  const worker=context.serviceWorkers()[0]||await context.waitForEvent("serviceworker");
  const p=await context.newPage();
  await p.goto("chrome-extension://"+new URL(worker.url()).hostname+"/src/ui/popup/popup.html");
  const entry=p.locator('#openDcRecords');
  if(!await entry.isVisible())await p.getByText('화면 · 편의',{exact:true}).click();
  await entry.scrollIntoViewIfNeeded();
  fs.mkdirSync(artifacts,{recursive:true});
  await p.screenshot({path:path.join(artifacts,'records-popup.png')});
  const opened=context.waitForEvent('page');await entry.click();
  const options=await opened;await options.waitForLoadState();
  assert.ok(options.url().endsWith('options.html#settingsDcRecords'));
});

test("Chromium installed records import writes both stores and selectively undoes",async t=>{
  const context=await chromium.launchPersistentContext("",{executablePath:chromium.executablePath(),args:["--load-extension="+root,"--disable-extensions-except="+root]});
  t.after(()=>context.close());
  const worker=context.serviceWorkers()[0]||await context.waitForEvent("serviceworker");
  const p=await context.newPage();
  await p.goto("chrome-extension://"+new URL(worker.url()).hostname+"/src/ui/options/options.html#settingsDcRecords");
  const downloads=[];p.on('download',d=>downloads.push(d.suggestedFilename()));
  assert.equal(await p.evaluate(exercise,!!process.env.DCB_TEST_NATIVE_AUTO_LIVE),true);
  assert.deepEqual(downloads,[],"Import and undo must not trigger an automatic backup download");
  fs.mkdirSync(artifacts,{recursive:true});
  await p.locator("#settingsDcRecords").screenshot({path:path.join(artifacts,"records-chromium.png")});
});
test("Firefox installed records import writes both stores and selectively undoes",async t=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"dcb-records-test-"));
  const server=net.createServer();
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const port=server.address().port; await new Promise(r=>server.close(r));
  const fixture=path.join(profile,"fixture");fs.mkdirSync(fixture);
  for(const item of ["manifest.json","src","icons","vendor","models","licenses"])fs.cpSync(path.join(root,item),path.join(fixture,item),{recursive:true});
  fs.appendFileSync(path.join(fixture,"src/background/background-entry.js"),'\nbrowser.runtime.onInstalled.addListener(()=>browser.runtime.openOptionsPage());');
  fs.writeFileSync(path.join(profile,"user.js"),[
    'user_pref("browser.download.folderList",2);',
    'user_pref("browser.download.dir",'+JSON.stringify(profile)+');',
    'user_pref("browser.download.alwaysOpenPanel",false);',
    'user_pref("browser.helperApps.neverAsk.saveToDisk","application/json");'
  ].join("\n"));
  const child=spawn(firefox.executablePath(),["-headless","-no-remote","-profile",profile,"--remote-debugging-port",String(port),"about:blank"],{windowsHide:true,stdio:"ignore"});
  let ws;let seq=0;const pending=new Map();
  const closed=new Promise(resolve=>child.once("exit",resolve));
  t.after(async()=>{ws?.close();if(child.exitCode===null)child.kill();await closed;fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:150})});
  for(let i=0;i<100;i++){try{ws=new WebSocket("ws://127.0.0.1:"+port+"/session");await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});break}catch{await delay(100)}}
  ws.onmessage=event=>{const m=JSON.parse(event.data);pending.get(m.id)?.(m);pending.delete(m.id)};
  function command(method,params){
    const id=++seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error(method+" timeout")),30000);
      pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(m.message)):resolve(m.result)});
      ws.send(JSON.stringify({id,method,params}));
    });
  }
  await command("session.new",{capabilities:{alwaysMatch:{}}});
  const install=()=>command("webExtension.install",{extensionData:{type:"path",path:fixture}});
  await install();
  let tab;
  for(let i=0;i<100&&!tab;i++){
    tab=(await command("browsingContext.getTree",{})).contexts.find(c=>c.url.includes("options.html"));
    if(!tab)await delay(100);
  }
  assert.ok(tab,"installed extension opened options");
  const r=await command("script.evaluate",{target:{context:tab.context},expression:"("+exercise.toString()+")("+Boolean(process.env.DCB_TEST_NATIVE_AUTO_LIVE)+")",awaitPromise:true});
  assert.equal(r.result?.value,true,r.exceptionDetails?.text);
  assert.deepEqual(fs.readdirSync(profile).filter(name=>/^dcb-records-before-import-.*\.json/.test(name)),[]);
  await command("script.evaluate",{target:{context:tab.context},expression:'document.getElementById("settingsDcRecords").scrollIntoView()',awaitPromise:false});

  // Verify a new options document independently of the previous in-memory UI.
  // Optional runtime-reload probe also exercises the Firefox debugging bridge.
  if (process.env.DCB_TEST_FIREFOX_RELOAD) {
    await command("script.evaluate",{target:{context:tab.context},awaitPromise:false,
      expression:'setTimeout(()=>browser.runtime.reload(),50); true'});
    await delay(1000);
  }
  await command("browsingContext.reload",{context:tab.context,wait:"complete"});
  const saved=await command("script.evaluate",{target:{context:tab.context},awaitPromise:true,
    expression:'(async()=> (await DCBUserBlockStore.getAllTokensReadOnly()).includes("testuser") && (await chrome.storage.local.get("userMemos")).userMemos["ip:192.0"].memo === "수동 수정")()'});
  assert.equal(saved.result?.value,true,saved.exceptionDetails?.text);
  const screenshot=await command("browsingContext.captureScreenshot",{context:tab.context});
  fs.writeFileSync(path.join(artifacts,"records-firefox.png"),Buffer.from(screenshot.data,"base64"));
  await command("browser.close",{});
});
