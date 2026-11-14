const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const test = require('node:test');
const {chromium, firefox} = require('playwright');

// Optional characterization of the pre-fix source, using identical synthetic data.
const baseline = process.env.DCB_PREVIEW_BASELINE;
const read = file => baseline
  ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding:'utf8', maxBuffer:4*1024*1024})
  : fs.readFileSync(file, 'utf8');
const out = path.resolve('test-results/preview-activity', baseline ? 'before' : 'after');
fs.mkdirSync(out, {recursive:true});

async function fixture(type, token = true) {
  const browser = await type.launch({headless:true, executablePath:type.executablePath()});
  const page = await browser.newPage({viewport:{width:1100,height:800}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.fulfill({contentType:'text/html', body:'<!doctype html><html><body></body></html>'}));
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  await page.evaluate(token => {
    window.previewEnabled = true; window.PREVIEW_COMMENT_DEBUG = false;
    if (token) document.cookie = 'ci_c=synthetic';
    window.signalCalls = 0; window.candidates = new Set(); window.requestedUids = []; window.held = [];
    window.signalMode = 'success';
    const listeners = [], sync = {dcbShowWriterActivity:true, dcbImageAccountRules:{enabled:false}, showUidBadge:false, showMemberIpInfo:false};
    const local = {};
    const get = store => async (keys, cb) => {const result = {...keys,...store}; cb?.(result); return result;};
    window.chrome = {storage:{sync:{get:get(sync)},local:{get:get(local),set:async p=>Object.assign(local,p)},onChanged:{addListener:f=>listeners.push(f)}},runtime:{onMessage:{addListener(){}},sendMessage(m,cb){
      if(m.type==='dcb.activityCandidates'){m.uids.forEach(uid=>candidates.add(uid));cb?.({ok:true});}
      else if(m.type==='dcb.accountSignal'){
        signalCalls++; requestedUids.push(m.uid);
        if(signalMode==='hold')held.push(cb);
        else cb?.(signalMode==='budget'?{ok:false,reason:'BUDGET',retryAfterMs:600000}:{ok:true,posts:71,comments:83});
      } else cb?.({ok:false});
    }}};
    window.DCBRuntimeSettingsCache = {get:get(sync),onChanged:chrome.storage.onChanged};
  }, token);
  await page.addStyleTag({content:read('src/content/appearance/writer-layout.css')});
  for(const file of ['shared/dom-mutation-bus','shared/keyword-matcher','content/user/writer-layout','content/image/image-account-filter','content/user/account-activity-blocker']) {
    let content = read('src/'+file+'.js');
    if(file.endsWith('account-activity-blocker')) content = content.replace(/\}\)\(\);\s*$/, 'window.activityTest={state:()=>({queued:uidQueue.size,timer:!!queueWakeTimer,targets:[...uidQueue.values()].reduce((n,e)=>n+e.targets.size,0)})};})();');
    await page.addScriptTag({content});
  }
  const source = read('src/content/core/content_script.js');
  await page.addScriptTag({content:source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/, 'window.pv={renderPreview,closePreview,commentRecordsToHtml,decoratePreviewReplyActions,preparePreviewPresentation};})();')});
  await page.evaluate(() => {
    window.makePost = (n=50, uid='fixtureuser') => {
      const url=location.origin+'/board/view/?id=fixture&no=1';
      const records=Array.from({length:n},(_,i)=>({no:String(i+1),name:'테스트 작성자 '+(i+1),user_id:uid==='unique'?'fixture'+(i%100):uid,memo:'익명화된 회귀 검사 댓글입니다.',reg_date:'2026.11.13 12:34:56',depth:0}));
      return {url,title:'미리보기 댓글 레이아웃 검증',articleHTML:'<p>활동량과 날짜는 오른쪽, 작성자 이름은 왼쪽에 표시합니다.</p>',commentsHTML:pv.commentRecordsToHtml(records,url),counts:{}};
    };
    window.openPost = (n,uid) => pv.renderPreview(makePost(n,uid));
  });
  return {browser,page,errors};
}

for(const [engine,type] of Object.entries({chromium,firefox})) {
  test(`${engine}: preview activity layout, late token and warm reopen`, async t => {
    const {browser,page,errors}=await fixture(type,false); t.after(()=>browser.close());
    await page.evaluate(()=>openPost(50));
    await page.waitForSelector('.dcb-activity-badge[title*="세션 토큰 없음"]');
    assert.equal(await page.evaluate(()=>signalCalls),0);
    if(baseline){await page.screenshot({path:path.join(out,engine+'-layout.png')});return;}
    assert.equal(await page.locator('.dcbpv-comment-meta > .dcb-activity-badge').count(),0);
    await page.evaluate(()=>{document.cookie='ci_c=synthetic';});
    await page.locator('.dcbpv-comment-item .gall_writer').first().hover();
    await page.waitForSelector('.dcbpv-comment-actions > [data-dcb-writer-activity="글 71 · 댓 83"]');
    assert.equal(await page.evaluate(()=>signalCalls),1);
    const layout=await page.evaluate(()=>[...document.querySelectorAll('.dcbpv-comment-meta')].slice(0,4).map(meta=>{
      const writer=meta.querySelector('.gall_writer').getBoundingClientRect(), actions=meta.querySelector('.dcbpv-comment-actions').getBoundingClientRect();
      return {left:writer.left<actions.left,sameLine:Math.abs(writer.top-actions.top)<10,children:meta.children.length};
    }));
    assert.ok(layout.every(row=>row.left && row.sameLine && row.children===2),JSON.stringify(layout));
    await page.screenshot({path:path.join(out,engine+'-layout.png')});
    await page.evaluate(()=>{
      const overlay=document.querySelector('#dcb-preview-overlay');
      window.replyBefore=overlay.querySelector('[data-act=compose-reply]');
      replyBefore.focus();
      pv.decoratePreviewReplyActions(overlay);pv.preparePreviewPresentation(overlay);
    });
    assert.equal(await page.evaluate(()=>document.activeElement===replyBefore && replyBefore.isConnected),true);
    for(let i=0;i<20;i++) {
      await page.evaluate(()=>{pv.closePreview();openPost(50);});
      await page.waitForSelector('.dcbpv-comment-actions > [data-dcb-writer-activity="글 71 · 댓 83"]');
    }
    assert.equal(await page.evaluate(()=>signalCalls),1,'warm reopen must reuse cached activity');
    await page.setViewportSize({width:420,height:750});
    await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
    await page.screenshot({path:path.join(out,engine+'-mobile.png')});
    assert.equal(await page.evaluate(()=>{const panel=document.querySelector('.dcbpv-panel');return !panel || panel.scrollWidth<=panel.clientWidth+1;}),true);
    await page.evaluate(()=>pv.closePreview());
    assert.equal(await page.locator('#dcb-preview-overlay,iframe').count(),0);
    assert.deepEqual(await page.evaluate(()=>activityTest.state()),{queued:0,timer:false,targets:0});
    assert.deepEqual(errors,[]);
  });

  test(`${engine}: closed preview releases budget waits and late requests`,{skip:!!baseline},async t=>{
    const {browser,page,errors}=await fixture(type);t.after(()=>browser.close());
    await page.evaluate(()=>{signalMode='budget';openPost(50);});
    await page.waitForSelector('.dcb-activity-badge[title*="서버 요청 제한"]');
    await page.evaluate(()=>pv.closePreview());
    assert.deepEqual(await page.evaluate(()=>activityTest.state()),{queued:0,timer:false,targets:0});
    assert.equal(await page.evaluate(()=>signalCalls),1);
    // Use a fresh page context so the real global budget cooldown remains intact.
    const second=await fixture(type);t.after(()=>second.browser.close());
    await second.page.evaluate(()=>{signalMode='hold';openPost(50);});
    await second.page.waitForFunction(()=>held.length===1);
    await second.page.evaluate(()=>{pv.closePreview();openPost(50);});
    await second.page.waitForTimeout(150);
    await second.page.evaluate(()=>held.shift()({ok:true,posts:71,comments:83}));
    await second.page.waitForSelector('.dcbpv-comment-actions > [data-dcb-writer-activity="글 71 · 댓 83"]');
    assert.equal(await second.page.evaluate(()=>signalCalls),1);
    await second.page.evaluate(()=>pv.closePreview());
    assert.deepEqual(await second.page.evaluate(()=>activityTest.state()),{queued:0,timer:false,targets:0});
    assert.deepEqual([...errors,...second.errors],[]);
  });

  test(`${engine}: repeated comment decoration remains dormant`,async t=>{
    const {browser,page,errors}=await fixture(type);t.after(()=>browser.close());
    const results=[];
    for(const count of [50,500,2000]){
      const result=await page.evaluate(count=>{
        const root=document.createElement('div');
        root.innerHTML=makePost(count).commentsHTML;
        pv.decoratePreviewReplyActions(root);
        const reply=root.querySelector('[data-act=compose-reply]');
        const observer=new MutationObserver(()=>{});observer.observe(root,{subtree:true,childList:true,attributes:true,characterData:true});
        const ms=[];
        for(let i=0;i<5;i++){const start=performance.now();pv.decoratePreviewReplyActions(root);ms.push(performance.now()-start);}
        const mutations=observer.takeRecords().length;observer.disconnect();
        ms.sort((a,b)=>a-b);
        return {count,medianMs:ms[2],maxMs:ms[4],mutations,sameReply:reply===root.querySelector('[data-act=compose-reply]')};
      },count);
      results.push(result);
      if(!baseline){assert.equal(result.mutations,0);assert.equal(result.sameReply,true);}
    }
    fs.writeFileSync(path.join(out,engine+'-decoration.json'),JSON.stringify({browser:browser.version(),samples:5,results},null,2));
    // Normal rendering must keep a large comment list paged and the composer asleep.
    await page.evaluate(()=>openPost(2000));
    await page.waitForSelector('.dcbpv-comment-item');
    const mounted=await page.locator('.dcbpv-comment-item').count();
    assert.ok(mounted>=80 && mounted<=160,`mounted ${mounted} of 2000`);
    assert.equal(await page.locator('iframe').count(),0);
    await page.evaluate(()=>pv.closePreview());
    assert.deepEqual(errors,[]);
  });

  test(`${engine}: pagination registers all UIDs without waking offscreen lookups`,{skip:!!baseline},async t=>{
    const {browser,page,errors}=await fixture(type);t.after(()=>browser.close());
    await page.evaluate(()=>openPost(2000,'unique'));
    await page.waitForFunction(()=>candidates.size===80);
    const before=await page.evaluate(()=>{
      const row=document.querySelector('.dcbpv-comment-item');
      window.savedReply=row.querySelector('[data-act=compose-reply]');
      window.savedTime=row.querySelector('.dcbpv-time');
      window.addedCount=0;
      document.addEventListener('dcb-preview-content',e=>{if(e.detail.addedRows)addedCount=e.detail.addedRows.length;});
      return signalCalls;
    });
    assert.ok(before>0 && before<20,`offscreen calls: ${before}`);
    await page.evaluate(()=>document.querySelector('.dcbpv-comment-html > button').click());
    await page.waitForFunction(()=>candidates.size===100);
    assert.equal(await page.evaluate(()=>addedCount),80);
    assert.equal(await page.locator('.dcbpv-comment-item').count(),160);
    const requested=await page.evaluate(()=>requestedUids);
    // Candidate registration precedes asynchronous viewport delivery. Initial
    // visible lookups may still finish after append; appended UIDs must sleep.
    assert.ok(requested.length<20 && requested.every(uid=>Number(uid.slice(7))<80));
    assert.equal(new Set(requested).size,requested.length,'duplicate UID lookup');
    assert.equal(await page.evaluate(()=>savedReply.isConnected && savedTime.isConnected && !savedTime.textContent.includes('글 71')),true);
    await page.evaluate(()=>pv.closePreview());
    assert.deepEqual(await page.evaluate(()=>activityTest.state()),{queued:0,timer:false,targets:0});
    assert.deepEqual(errors,[]);
  });
}
