const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');
const files=['src/shared/dom-mutation-bus.js','src/content/image/image-account-filter.js','src/content/user/account-activity-blocker.js'];

test('activity profiles and Firefox bootstrap precede optional idle features',()=>{
  require('../src/background/content-script-profiles.js');
  for(const engine of ['chrome','firefox']) {
    const p=DCBContentScriptProfiles[engine].find(p=>p.js?.includes('src/content/user/account-activity-blocker.js'));
    assert.equal(p?.runAt,'document_start');
    assert.ok(p.js.indexOf('src/shared/runtime-settings-cache.js')<p.js.indexOf('src/content/image/image-account-filter.js'));
  }
  const bg=fs.readFileSync('src/background/background.js','utf8');
  assert.ok(bg.slice(bg.indexOf('function getDcbFirefoxBootstrapFiles'),bg.indexOf('chrome.runtime.onMessage.addListener',bg.indexOf('function getDcbFirefoxBootstrapFiles'))).includes('src/content/user/account-activity-blocker.js'));
});

for(const [engine,type] of Object.entries({chromium,firefox})) test(engine+' cached low activity is hidden before frame batching',async t=>{
  const b=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>b.close());
  const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><table class="gall_list"><tbody><tr id="low" class="ub-content"><td class="gall_writer" data-uid="lowuser">low</td></tr><tr id="allowed" class="ub-content"><td class="gall_writer" data-uid="okuser">ok</td></tr><tr id="unknown" class="ub-content"><td class="gall_writer" data-uid="newuser">new</td></tr><tr id="stale" class="ub-content"><td class="gall_writer" data-uid="staleuser">stale</td></tr></tbody></table><div class="view_content_wrap" id="article"><div class="gallview_head"><span class="gall_writer" data-uid="lowuser" data-loc="view">writer</span></div><div class="write_div">blocked article</div></div></body></html>'}));
  const init=()=>{
    window.requests=0;window.listeners=[];
    const now=Date.now(),cache={lowuser:{checkedAt:now,posts:0,comments:0},okuser:{checkedAt:now,posts:20,comments:30},staleuser:{checkedAt:now-25*3600000,posts:0,comments:0}};
    window.settings={dcbImageAccountRules:{enabled:true,cacheHours:24,blockPosts:true,blockComments:true,holdWhileChecking:false}};
    const get=store=>async(d,cb)=>{const result={...d,...store};cb?.(result);return result;};
    window.chrome={storage:{sync:{get:get(settings)},local:{get:get({dcbImageAccountSignalCache:cache}),set:async()=>{}},onChanged:{addListener:f=>listeners.push(f)}},runtime:{onMessage:{addListener(){}},sendMessage(m,cb){if(m.type==='dcb.accountSignal')requests++;cb?.({ok:false})}}};
    window.DCBRuntimeSettingsCache={get:get(settings),onChanged:chrome.storage.onChanged};
    // Pause optional work. Warm hiding must not depend on the idle scheduler.
    window.DCBStartupScheduler={schedule(){return ()=>{}}};
  };
  // One init script preserves the declared extension dependency order.
  await p.addInitScript({content:`(${init})();\n`+files.map(file=>fs.readFileSync(file,'utf8')).join('\n')});
  await p.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1');
  await p.evaluate(()=>DCBAccountActivityFilter.ready());
  const state=()=>p.evaluate(()=>Object.fromEntries(['low','allowed','unknown','stale','article'].map(id=>[id,getComputedStyle(document.getElementById(id)).display==='none'])));
  assert.deepEqual(await state(),{low:true,allowed:false,unknown:false,stale:false,article:true});
  const first=await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{
    document.querySelector('tbody').insertAdjacentHTML('beforeend','<tr id="dynamic" class="ub-content"><td class="gall_writer" data-uid="lowuser">new low</td></tr>');
    // Mutation observer microtasks run before this frame can paint.
    queueMicrotask(()=>queueMicrotask(()=>resolve(getComputedStyle(document.querySelector('#dynamic')).display)));
  })));
  assert.equal(first,'none');
  assert.equal(await p.evaluate(()=>requests),0);
  await p.locator('.dcb-account-activity-notice button').click();
  await p.evaluate(()=>document.querySelector('#article .gall_writer').appendChild(document.createElement('span')));
  assert.equal((await state()).article,false,'temporary reveal survives later author mutations');
  await p.evaluate(()=>{settings.dcbImageAccountRules={...settings.dcbImageAccountRules,holdWhileChecking:true};listeners.forEach(f=>f({dcbImageAccountRules:{newValue:settings.dcbImageAccountRules}},'sync'));});
  await p.waitForFunction(()=>DCBAccountActivityFilter.getSettings().holdWhileChecking);
  // The earlier unknown UID may now have a failed lookup; use a new candidate.
  await p.evaluate(()=>document.querySelector('tbody').insertAdjacentHTML('beforeend','<tr id="pending" class="ub-content"><td class="gall_writer" data-uid="freshcandidate">new</td></tr>'));
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('#pending')).display==='none');
  await p.evaluate(()=>{settings.dcbImageAccountRules={...settings.dcbImageAccountRules,enabled:false};listeners.forEach(f=>f({dcbImageAccountRules:{newValue:settings.dcbImageAccountRules}},'sync'));});
  await p.waitForFunction(()=>!document.querySelector('.dcb-account-activity-hidden,.dcb-account-activity-pending'));
  assert.deepEqual(errors,[]);
});
