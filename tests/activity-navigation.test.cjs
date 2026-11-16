const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium, firefox } = require('playwright');

const listUrl = 'https://gall.dcinside.com/board/lists/?id=fixture';
const viewUrl = 'https://gall.dcinside.com/board/view/?id=fixture&no=11';
const verdict = (shouldHide = false) => ({ available: true, shouldHide, stats: { posts: shouldHide ? 0 : 40, comments: shouldHide ? 0 : 50 }, checkedAt: Date.now(), summary: shouldHide ? '활동 기준 미달' : '기준 충족' });

async function fixture(browser, config = {}) {
  const context = await browser.newContext();
  const navigations = [], relays = [];
  await context.route('https://gall.dcinside.com/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/board/view')) {
      navigations.push(route.request().url());
      return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><p id="arrived">게시글</p>'});
    }
    return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><table class="gall_list"><tbody><tr class="ub-content" data-no="11" id="post"><td class="gall_tit ub-word"><a id="postLink" href="${viewUrl}">게시글 열기</a></td><td class="gall_writer ub-writer" data-uid="newuser" data-nick="회원">회원</td></tr></tbody></table>`});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('relayOpen', async message => {
    relays.push(message);
    const opened = await context.newPage();
    await opened.goto(message.url);
    return {ok:true};
  });
  await page.goto(listUrl);
  await page.evaluate(config => {
    window.activityCalls = 0;
    window.flushCalls = 0;
    window.schedulerCalls = [];
    window.activitySettings = {enabled:config.enabled !== false,display:false,blockPosts:true,blockComments:true,holdWhileChecking:false};
    window.activityVerdicts = new Map();
    window.activityInflight = new Map();
    window.activityResolvers = new Map();
    window.filterReady = config.ready !== false;
    let resolveReady, resolveFlush;
    const ready = filterReady ? Promise.resolve() : new Promise(resolve => {resolveReady=resolve;});
    const flush = config.holdFlush ? new Promise(resolve => {resolveFlush=resolve;}) : Promise.resolve();
    window.releaseActivityReady = () => {filterReady=true;resolveReady?.();};
    window.releaseActivityFlush = () => resolveFlush?.();
    window.resolveActivity = (uid, result) => activityResolvers.get(uid)?.(result);
    window.DCBAccountActivityFilter = {
      ready:() => ready,
      isReady:() => filterReady,
      getSettings:() => ({...activitySettings}),
      peek:uid => activityVerdicts.get(String(uid).toLowerCase()) || null,
      evaluate:uid => {
        uid=String(uid).toLowerCase();
        if(activityVerdicts.has(uid)) return Promise.resolve(activityVerdicts.get(uid));
        if(activityInflight.has(uid)) return activityInflight.get(uid);
        activityCalls++;
        const promise=new Promise(resolve => activityResolvers.set(uid, result => {
          const value={uid,...result};activityVerdicts.set(uid,value);resolve(value);
        })).finally(() => {activityInflight.delete(uid);activityResolvers.delete(uid);});
        activityInflight.set(uid,promise);return promise;
      },
      flushCache:async() => {flushCalls++;await flush;}
    };
    window.DCBRuntimeSettingsCache = {
      peek:() => ({dcbImageAccountRules:{...activitySettings}}),
      get:async() => ({dcbImageAccountRules:{...activitySettings}}),
      onChanged:{addListener(){}}
    };
    window.DCBStartupScheduler = {schedule(name,work,phase){
      schedulerCalls.push({name,phase});
      if(phase!=='idle')queueMicrotask(work);
      return () => {};
    }};
    window.chrome = {
      runtime:{id:'activity-navigation-fixture',onMessage:{addListener(){}},sendMessage(message,callback){
        const result=message.type==='dcb.activityOpen'?relayOpen(message):Promise.resolve({ok:true});
        result.then(value=>callback?.(value));return result;
      }},
      storage:{local:{get:async() => ({}),set:async() => {}},sync:{get:async() => ({dcbImageAccountRules:{...activitySettings}})},onChanged:{addListener(){}}}
    };
  }, config);
  await page.addScriptTag({path:'src/content/user/account-activity-blocker.js'});
  return {page,context,navigations,relays,errors,async close(){await context.close();}};
}

for (const [name, engine] of Object.entries({chromium,firefox})) test(name+' activity is checked before opening a post', {timeout:30000}, async t => {
  const browser=await engine.launch({executablePath:engine.executablePath()});
  t.after(()=>browser.close());

  await t.test('a cache verdict arriving before the click hides the row and prevents navigation',async()=>{
    const f=await fixture(browser);
    try {
      await f.page.waitForFunction(()=>activityCalls===1);
      await f.page.evaluate(result=>activityVerdicts.set('newuser',result),verdict(true));
      await f.page.locator('#postLink').click();
      assert.equal(f.page.url(),listUrl);
      assert.deepEqual(f.navigations,[]);
      assert.equal(await f.page.locator('#post').evaluate(row=>getComputedStyle(row).display),'none');
      assert.deepEqual(f.errors,[]);
    } finally {await f.close();}
  });

  await t.test('an immediate click waits for settings and one lookup, then waits for the successful cache flush',async()=>{
    const f=await fixture(browser,{ready:false,holdFlush:true});
    try {
      await f.page.locator('#postLink').click();
      assert.equal(f.page.url(),listUrl);assert.deepEqual(f.navigations,[]);
      assert.equal(await f.page.evaluate(()=>activityCalls),0);
      await f.page.evaluate(()=>releaseActivityReady());
      await f.page.waitForFunction(()=>activityCalls===1);
      await f.page.locator('#postLink').click();
      assert.equal(await f.page.evaluate(()=>activityCalls),1,'Repeated clicks share the UID lookup');
      await f.page.evaluate(result=>resolveActivity('newuser',result),verdict(false));
      await f.page.waitForFunction(()=>flushCalls>0);
      assert.equal(f.page.url(),listUrl,'The result must be durable before leaving the list');
      await f.page.locator('#postLink').click();
      assert.equal(f.page.url(),listUrl,'A repeated click cannot bypass a pending cache flush');
      await f.page.evaluate(()=>releaseActivityFlush());
      await f.page.waitForURL(viewUrl);
      assert.equal(f.navigations.length,1);
      assert.deepEqual(f.errors,[]);
    } finally {await f.close();}
  });

  await t.test('the latest low verdict is checked again after a held cache flush',async()=>{
    const f=await fixture(browser,{holdFlush:true});
    try {
      await f.page.locator('#postLink').click();await f.page.waitForFunction(()=>activityCalls===1);
      await f.page.evaluate(result=>resolveActivity('newuser',result),verdict(false));
      await f.page.waitForFunction(()=>flushCalls>0);
      await f.page.evaluate(result=>activityVerdicts.set('newuser',result),verdict(true));
      await f.page.evaluate(()=>releaseActivityFlush());
      await f.page.waitForFunction(()=>getComputedStyle(document.getElementById('post')).display==='none');
      assert.equal(f.page.url(),listUrl);assert.deepEqual(f.navigations,[]);assert.deepEqual(f.errors,[]);
    } finally {await f.close();}
  });

  await t.test('an old author result cannot hide a reused row or open its changed link',async()=>{
    const f=await fixture(browser);
    try {
      await f.page.locator('#postLink').click();await f.page.waitForFunction(()=>activityCalls===1);
      await f.page.evaluate(()=>{document.querySelector('.gall_writer').dataset.uid='otheruser';document.querySelector('#postLink').href='/board/view/?id=fixture&no=12';});
      await f.page.evaluate(result=>resolveActivity('newuser',result),verdict(true));
      await f.page.waitForFunction(()=>!activityInflight.has('newuser'));
      assert.notEqual(await f.page.locator('#post').evaluate(row=>getComputedStyle(row).display),'none');
      assert.equal(f.page.url(),listUrl);assert.deepEqual(f.navigations,[]);assert.deepEqual(f.errors,[]);
    } finally {await f.close();}
  });

  await t.test('a low-activity result from an unknown author hides the list row without visiting the article',async()=>{
    const f=await fixture(browser);
    try {
      await f.page.locator('#postLink').click();
      await f.page.waitForFunction(()=>activityCalls===1);
      await f.page.evaluate(result=>resolveActivity('newuser',result),verdict(true));
      await f.page.waitForFunction(()=>getComputedStyle(document.getElementById('post')).display==='none');
      assert.equal(f.page.url(),listUrl);assert.deepEqual(f.navigations,[]);
      assert.equal(await f.page.evaluate(()=>activityCalls),1);
      assert.deepEqual(f.errors,[]);
    } finally {await f.close();}
  });

  await t.test('unavailable and rate-limited results are not treated as low activity and need explicit bypass',async()=>{
    for(const reason of ['NO_TOKEN','BUDGET']) {
      const f=await fixture(browser);
      try {
        await f.page.locator('#postLink').click();await f.page.waitForFunction(()=>activityCalls===1);
        await f.page.evaluate(reason=>resolveActivity('newuser',{available:false,shouldHide:false,reason,retryAt:Date.now()+600000}),reason);
        await f.page.getByText('확인 없이 열기',{exact:true}).waitFor();
        assert.equal(f.page.url(),listUrl);assert.deepEqual(f.navigations,[]);
        assert.notEqual(await f.page.locator('#post').evaluate(row=>getComputedStyle(row).display),'none');
        assert.equal(await f.page.evaluate(()=>activityCalls),1);
        await f.page.getByText('확인 없이 열기',{exact:true}).click();await f.page.waitForURL(viewUrl);
        assert.equal(f.navigations.length,1);assert.deepEqual(f.errors,[]);
      } finally {await f.close();}
    }
  });

  await t.test('canceling a pending click prevents a late allowed result from navigating',async()=>{
    const f=await fixture(browser);
    try {
      await f.page.locator('#postLink').click();await f.page.waitForFunction(()=>activityCalls===1);
      await f.page.getByRole('button',{name:'취소',exact:true}).click();
      await f.page.evaluate(result=>resolveActivity('newuser',result),verdict(false));
      await f.page.waitForFunction(()=>!activityInflight.size);
      await f.page.waitForTimeout(50);
      assert.equal(f.page.url(),listUrl);assert.deepEqual(f.navigations,[]);assert.deepEqual(f.errors,[]);
    } finally {await f.close();}
  });

  await t.test('middle and modifier clicks use the background relay only after an allowed verdict',async()=>{
    for(const action of [{button:'middle'},{modifiers:['Control']},{modifiers:['Shift']}]) {
      const f=await fixture(browser);
      try {
        await f.page.locator('#postLink').click(action);await f.page.waitForFunction(()=>activityCalls===1);
        assert.equal(f.relays.length,0);assert.deepEqual(f.navigations,[]);
        const opened=f.context.waitForEvent('page');
        await f.page.evaluate(result=>resolveActivity('newuser',result),verdict(false));
        const destination=await opened;await destination.waitForURL(viewUrl);
        assert.equal(f.page.url(),listUrl);assert.equal(f.relays.length,1);
        assert.equal(f.relays[0].url,viewUrl);
        assert.equal(!!f.relays[0].newWindow,!!action.modifiers?.includes('Shift'));
        assert.equal(f.navigations.length,1);assert.deepEqual(f.errors,[]);
      } finally {await f.close();}
    }
  });

  await t.test('concurrent resumes and repeated bypasses open a modified click only once',async()=>{
    for (const bypass of [false,true]) {
      const f=await fixture(browser,{holdFlush:true});
      try {
        await f.page.locator('#postLink').click({modifiers:['Control']});
        await f.page.waitForFunction(()=>activityCalls===1);
        await f.page.evaluate(({result,bypass})=>resolveActivity('newuser',bypass?{available:false,shouldHide:false,reason:'UNAVAILABLE'}:result),{result:verdict(),bypass});
        if (bypass) {
          await f.page.getByRole('button',{name:'확인 없이 열기'}).waitFor();
          await f.page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(n=>n.textContent==='확인 없이 열기');button.click();button.click();});
        } else {
          await f.page.waitForFunction(()=>flushCalls===1);
          await f.page.evaluate(()=>{activitySettings.enabled=false;window.dispatchEvent(new CustomEvent('dcb:account-activity-rules-changed'));});
        }
        await f.page.waitForFunction(()=>flushCalls===2);
        await f.page.evaluate(()=>releaseActivityFlush());
        await f.page.waitForFunction(()=>!document.querySelector('.dcb-activity-navigation-status'));
        assert.equal(f.relays.length,1);assert.equal(f.navigations.length,1);assert.equal(f.context.pages().length,2);assert.deepEqual(f.errors,[]);
      } finally {await f.close();}
    }
  });

  await t.test('disabled filtering leaves native navigation immediate',async()=>{
    const f=await fixture(browser,{enabled:false});
    try {
      await f.page.locator('#postLink').click();await f.page.waitForURL(viewUrl);
      assert.equal(f.navigations.length,1);assert.equal(f.relays.length,0);assert.deepEqual(f.errors,[]);
    } finally {await f.close();}
  });

  await t.test('turning filtering off during a pending check does not hide or strand the selected post',async()=>{
    const f=await fixture(browser);
    try {
      await f.page.locator('#postLink').click();await f.page.waitForFunction(()=>activityCalls===1);
      await f.page.evaluate(()=>{
        activitySettings.enabled=false;
        window.dispatchEvent(new CustomEvent('dcb:account-activity-rules-changed',{detail:{settings:{...activitySettings}}}));
      });
      await f.page.waitForURL(viewUrl);assert.equal(f.navigations.length,1);assert.deepEqual(f.errors,[]);
    } finally {await f.close();}
  });
});
