const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {chromium,firefox}=require('playwright');

function queueFixture(cache={}) {
  const memory={dcbImageAccountSignalCache:cache};
  let message,alarmHandler,alarm,now=1800000000000;
  const calls=[];
  const chrome={runtime:{onMessage:{addListener:f=>message=f}},
    storage:{sync:{get:async()=>({dcbShowWriterActivity:true})},local:{get:async()=>structuredClone(memory),set:async p=>Object.assign(memory,structuredClone(p))}},
    alarms:{onAlarm:{addListener:f=>alarmHandler=f},get:async()=>alarm,create:async(_,a)=>alarm={scheduledTime:a.when},clear:async()=>alarm=null},
    tabs:{query:async()=>[{id:3},{id:4}],sendMessage:async(id,m)=>{calls.push([id,m.uid]);return id===3?{available:false,reason:'NO_TOKEN',retryAt:now+3600000}:{available:true,checkedAt:now}}}};
  const restart=()=>vm.runInNewContext(fs.readFileSync('src/background/activity-queue.js','utf8'),{chrome,Date:class extends Date {static now(){return now}},Math});
  restart();
  return {memory,calls,restart,now,alarm:()=>alarm,
    register:uids=>new Promise(resolve=>message({type:'dcb.activityCandidates',uids},{url:'https://gall.dcinside.com/',tab:{id:3}},resolve)),
    async wake(){alarm=null;alarmHandler({name:'dcb-activity-recheck'});await new Promise(r=>setImmediate(r));}};
}
test('alarm uses another visible tab without a token and preserves the refresh deadline across restart',async()=>{
  const f=queueFixture();await f.register(['user0','user1']);await f.wake();
  assert.deepEqual(f.calls,[[3,'user0'],[4,'user0']]);
  assert.equal(f.memory.dcbActivityPendingV1[0].next,f.now+6*3600000);
  assert.equal(f.memory.dcbActivityPendingV1[1].next,f.now,'no-token tab must not postpone other UIDs');
  f.restart();await f.wake();assert.deepEqual(f.calls.slice(2),[[3,'user1'],[4,'user1']]);
});
test('alarm skips a completed shared lookup and sleeps instead of querying it again',async()=>{
  const f=queueFixture();await f.register(['user0']);
  f.memory.dcbImageAccountSignalCache.user0={checkedAt:f.now,posts:3,comments:4};
  await f.wake();assert.equal(f.calls.length,0);
  assert.equal(f.alarm().scheduledTime,f.now+6*3600000);
});
test('cached missing token does not prevent a different tab from completing the UID',async()=>{
  const f=queueFixture({user0:{checkedAt:1800000000000,unavailable:true,reason:'NO_TOKEN',expiresAt:1800003600000}});
  await f.register(['user0']);await f.wake();assert.equal(f.calls.length,2);
  assert.equal(f.memory.dcbActivityPendingV1[0].next,f.now+6*3600000);
});

for(const [engine,type] of Object.entries({chromium,firefox}))test(engine+' completes shared and alarm results for every matching row without offscreen requests',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1100,height:500}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  await page.evaluate(()=>{
    document.cookie='ci_c=synthetic';window.candidates=new Set();window.signalCalls=0;window.mode='budget';window.listeners=[];window.messages=[];window.registrations=0;
    const later=window.setTimeout;window.setTimeout=(fn,ms,...args)=>later(fn,ms===30000?50:ms,...args);
    const settings={dcbShowWriterActivity:true,dcbImageAccountRules:{enabled:false}};
    window.local={dcbImageAccountSignalCache:{user99:{checkedAt:Date.now(),posts:7,comments:9}}};
    const get=store=>async(keys,cb)=>{const result={...keys,...store};cb?.(result);return result};
    window.chrome={runtime:{id:'fixture',onMessage:{addListener:f=>messages.push(f)},sendMessage(m,cb){
      if(m.type==='dcb.activityCandidates'){if(++registrations===1)return cb({ok:false});m.uids.forEach(u=>candidates.add(u));cb({ok:true})}
      else if(m.type==='dcb.accountSignal'){signalCalls++;cb(mode==='budget'?{ok:false,reason:'BUDGET',retryAfterMs:600000}:{ok:true,posts:31,comments:42});}
    }},storage:{sync:{get:get(settings)},local:{get:get(local),set:async p=>Object.assign(local,p)},onChanged:{addListener:f=>listeners.push(f)}}};
    window.DCBRuntimeSettingsCache={get:get(settings),onChanged:chrome.storage.onChanged};
    const writer=i=>`<span class="gall_writer" ${i%2?'data-user-id':'data-uid'}="user${i}">테스트 ${i}<i class="writer_nikcon"></i></span>`;
    document.body.innerHTML='<style>td{height:30px}table{width:100%}.cmt_info{height:40px}</style><table class="gall_list"><tbody>'+Array.from({length:100},(_,i)=>`<tr class="ub-content"><td class="gall_tit ub-word">글 ${i}</td><td>${writer(i)}</td></tr>`).join('')+'</tbody></table><ul class="cmt_list">'+Array.from({length:2000},(_,i)=>`<li><div class="cmt_info">${writer(i%100)}<div class="fr"></div></div></li>`).join('')+'</ul>';
  });
  await page.addStyleTag({path:'src/content/appearance/writer-layout.css'});
  for(const file of ['src/shared/dom-mutation-bus.js','src/content/user/writer-layout.js','src/content/image/image-account-filter.js','src/content/user/account-activity-blocker.js']) {
    let content=fs.readFileSync(file,'utf8');
    if(file.endsWith('account-activity-blocker.js'))content=content.replace(/\}\)\(\);\s*$/,'window.activityRetained=()=>[...writersByUid.values()].reduce((n,s)=>n+s.size,0);})();');
    await page.addScriptTag({content});
  }
  await page.waitForFunction(()=>candidates.size===100 && signalCalls===1);
  assert.equal(await page.evaluate(()=>registrations),2,'worker registration failure retries without new DOM mutations');
  assert.equal(await page.locator('[data-activity-owner="user99"][data-dcb-writer-activity="글 7 · 댓 9"]').count(),21,'cached offscreen UID in list and all repeated comments');
  assert.ok(await page.locator('[data-dcb-writer-activity="요청 대기"]').count()>0);
  // This row has never had a pending badge or a network request in this tab.
  await page.evaluate(()=>{
    const previous=local.dcbImageAccountSignalCache;
    local.dcbImageAccountSignalCache={...previous,user50:{checkedAt:Date.now(),posts:11,comments:22}};
    listeners.forEach(f=>f({dcbImageAccountSignalCache:{oldValue:previous,newValue:local.dcbImageAccountSignalCache}},'local'));
  });
  await page.waitForFunction(()=>document.querySelectorAll('[data-activity-owner="user50"][data-dcb-writer-activity="글 11 · 댓 22"]').length===21);
  assert.equal(await page.evaluate(()=>signalCalls),1);
  // Alarm response must update this document even without a storage change event.
  await page.evaluate(()=>{mode='success';return new Promise(resolve=>messages.forEach(f=>f({type:'dcb.activityRecheck',uid:'user80'},{id:'fixture'},resolve)))});
  assert.equal(await page.locator('[data-activity-owner="user80"][data-dcb-writer-activity="글 31 · 댓 42"]').count(),21);
  assert.equal(await page.evaluate(()=>signalCalls),2);
  await page.waitForTimeout(350);
  const idle=await page.evaluate(async()=>{let n=0;const o=new MutationObserver(rs=>n+=rs.length);o.observe(document.body,{subtree:true,childList:true,attributes:true});await new Promise(r=>setTimeout(r,200));n+=o.takeRecords().length;o.disconnect();return n});
  assert.equal(idle,0,'unchanged cached badges do not keep mutating the DOM');
  assert.equal(await page.locator('[data-activity-owner="user80"]').count(),21);
  await page.evaluate(()=>{document.querySelector('table').remove();document.querySelector('ul').remove()});
  await page.waitForFunction(()=>activityRetained()===0);
  assert.deepEqual(errors,[]);
});
