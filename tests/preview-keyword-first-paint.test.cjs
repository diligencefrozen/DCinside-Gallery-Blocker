const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {chromium, firefox} = require('playwright');
const baseline = process.env.DCB_PREVIEW_BASELINE;
const source = baseline
  ? execFileSync('git', ['show', `${baseline}:src/content/core/content_script.js`], {encoding:'utf8', maxBuffer:4*1024*1024})
  : fs.readFileSync('src/content/core/content_script.js', 'utf8');
const preview = source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/, 'window.pv={renderPreview,updatePreviewComments,closePreview,commentRecordsToHtml};})();');
const out = 'test-results/preview-keyword-first-paint/' + (baseline ? 'before' : 'after');
fs.mkdirSync(out, {recursive:true});

for (const [engine, type] of Object.entries({chromium, firefox})) {
  test(`${engine}: keyword filtering precedes preview paint`, async t => {
    const browser = await type.launch({headless:true, executablePath:type.executablePath()});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport:{width:1100,height:900}});
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
    await page.evaluate(() => {
      window.previewEnabled = true; window.PREVIEW_COMMENT_DEBUG = false;
      window.config = {keywordHideEnabled:true,hiddenKeywords:['검증금칙'],showMemberIpInfo:false,doryBlockEnabled:false,userBlockEnabled:false};
      window.hold = true; window.pending = []; window.syncReads = 0; window.marked = 0;
      window.readSettings = defaults => {
        const snapshot = {...defaults,...config};
        return hold ? new Promise((resolve,reject) => pending.push({resolve:()=>resolve(snapshot),reject})) : Promise.resolve(snapshot);
      };
      const listeners = [];
      window.chrome = {storage:{
        sync:{get(defaults,cb){syncReads++;readSettings(defaults).then(cb);}},
        local:{get(defaults,cb){cb(defaults);}},
        onChanged:{addListener:f=>listeners.push(f)}
      },runtime:{sendMessage(m,cb){if(m.type==='dcb.readPosts.markPreview')marked++;cb?.({ok:false});}}};
      window.DCBRuntimeSettingsCache = {get:readSettings,onChanged:chrome.storage.onChanged};
      window.release = () => {hold=false;pending.splice(0).forEach(p=>p.resolve());};
      window.exposed = () => {
        const root = document.querySelector('#dcb-preview-overlay');
        if(!root)return false;
        const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          if(!walker.currentNode.nodeValue.includes('검증금칙'))continue;
          let element=walker.currentNode.parentElement, visible=!!element.getClientRects().length;
          while(element && visible){const s=getComputedStyle(element);visible=s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0;element=element.parentElement;}
          if(visible)return true;
        }
        return false;
      };
      window.capture = () => {
        window.frames=0;window.exposedFrames=0;window.capturing=true;
        const sample=()=>{if(!capturing)return;frames++;if(exposed())exposedFrames++;requestAnimationFrame(sample);};
        requestAnimationFrame(sample);
      };
    });
    await page.addScriptTag({path:'src/shared/keyword-matcher.js'});
    await page.addScriptTag({content:preview});
    await page.evaluate(() => {
      window.post={url:location.origin+'/board/view/?id=fixture&no=1',title:'검증금칙 제목',articleHTML:'<p>검증금칙 본문</p>',commentsHTML:'',counts:{}};
      post.commentsHTML=pv.commentRecordsToHtml([{no:'1',name:'검증회원',memo:'검증금칙 댓글',reg_date:'2026.11.15 12:00:00'}],post.url);
      capture();pv.renderPreview(post);
    });
    await page.waitForTimeout(180);
    await page.screenshot({path:`${out}/${engine}-settings-pending.png`});
    const pendingState=await page.evaluate(()=>({frames,exposedFrames,marked,inert:document.querySelector('.dcbpv-article').inert}));
    assert.ok(pendingState.frames>0);
    if(baseline)assert.ok(pendingState.exposedFrames>0,'baseline reproduces raw content before settings resolve');
    else {
      assert.equal(pendingState.exposedFrames,0);
      assert.equal(pendingState.marked,0,'pending content is not marked read');
      assert.equal(pendingState.inert,true,'pending content cannot receive focus');
    }
    await page.evaluate(()=>release());
    await page.waitForFunction(()=>document.querySelector('.dcbpv-article')?.dataset.dcbpvFiltered==='1');
    await page.waitForTimeout(80);
    await page.screenshot({path:`${out}/${engine}-filtered.png`});
    const result=await page.evaluate(()=>{capturing=false;return {frames,exposedFrames,visibleAfter:exposed(),syncReads}});
    fs.writeFileSync(`${out}/${engine}.json`, JSON.stringify({pendingState,result},null,2));
    if(baseline)return;
    assert.equal(result.exposedFrames,0,'no raw title/body/comment or matched-word chip was painted');
    assert.equal(result.visibleAfter,false);
    assert.equal(result.syncReads,0,'reuse the runtime settings snapshot');
    await page.locator('[data-dcbpv-reveal="article"]').click();
    assert.equal(await page.evaluate(()=>exposed()),true,'explicit one-time reveal still works');
    assert.equal(await page.locator('.dcbpv-title a').textContent(),'검증금칙 제목');
    await page.locator('[data-dcbpv-reveal^="comment-"]').click();
    assert.equal(await page.locator('.dcbpv-comment-item').evaluate(e=>e.classList.contains('dcbpv-filter-hidden')),false);

    // Warm reopen, settings OFF, and target-specific behavior.
    await page.evaluate(()=>{pv.closePreview();capture();pv.renderPreview(post)});
    await page.waitForFunction(()=>document.querySelector('.dcbpv-article')?.dataset.dcbpvFiltered==='1');
    assert.equal(await page.evaluate(()=>{capturing=false;return exposedFrames}),0);
    await page.evaluate(()=>{config.keywordHideEnabled=false;pv.renderPreview(post)});
    await page.waitForFunction(()=>!document.querySelector('[data-dcbpv-filter-pending]'));
    assert.equal(await page.evaluate(()=>exposed()),true);
    await page.evaluate(()=>{config.keywordHideEnabled=true;config.keywordHideTargets={viewTitle:false,viewBody:false,comments:true};pv.renderPreview(post)});
    await page.waitForFunction(()=>!document.querySelector('[data-dcbpv-filter-pending]'));
    assert.equal(await page.locator('.dcbpv-title a').textContent(),'검증금칙 제목');
    assert.equal(await page.locator('.dcbpv-article').getAttribute('data-dcbpv-filtered'),null);
    assert.equal(await page.locator('.dcbpv-comment-item').evaluate(e=>e.classList.contains('dcbpv-filter-hidden')),true);

    // Body-only category filtering and hard-block precedence.
    await page.evaluate(()=>{
      delete config.keywordHideTargets;config.hiddenKeywords=[];config.keywordHideCategories={poll:true};
      post={...post,title:'안전한 제목',articleHTML:'<p>인기투표 참여</p>'};pv.renderPreview(post);
    });
    await page.waitForFunction(()=>document.querySelector('.dcbpv-article')?.dataset.dcbpvFiltered==='1');
    assert.match(await page.locator('.dcbpv-article').textContent(),/투표/);
    await page.evaluate(()=>{config.keywordBlockEnabled=true;config.blockedKeywords=['인기투표'];pv.renderPreview(post)});
    await page.waitForFunction(()=>!document.querySelector('[data-dcbpv-filter-pending]'));
    assert.equal(await page.locator('.dcbpv-article [data-dcbpv-reveal]').count(),0);

    // A slow old pass must not expose a newer render; failures remain closed.
    await page.evaluate(()=>{
      config.keywordBlockEnabled=false;config.keywordHideCategories={};config.hiddenKeywords=['검증금칙'];
      hold=true;post={...post,articleHTML:'<p>검증금칙 새 본문</p>'};pv.renderPreview(post);
    });
    await page.waitForFunction(()=>pending.length>0);
    await page.evaluate(()=>{window.oldRead=pending.shift();pv.renderPreview(post)});
    await page.waitForFunction(()=>pending.length>0);
    await page.evaluate(()=>oldRead.resolve());
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>exposed()),false);
    assert.equal(await page.locator('.dcbpv-article').getAttribute('data-dcbpv-filter-pending'),'');
    await page.evaluate(()=>{hold=false;pending.splice(0).forEach(p=>p.reject(new Error('fixture storage unavailable')))});
    await page.waitForFunction(()=>!document.querySelector('[data-dcbpv-filter-pending]'));
    assert.equal(await page.evaluate(()=>exposed()),false);
    assert.match(await page.locator('.dcbpv-article').textContent(),/설정을 확인하지 못했어요/);
    await page.evaluate(()=>pv.renderPreview(post));
    await page.waitForFunction(()=>document.querySelector('.dcbpv-article [data-dcbpv-reveal]'));

    // Deferred/paged comments and updates use the same first-paint gate.
    await page.evaluate(()=>{
      pv.closePreview();post.articleHTML='<p>안전한 본문</p>';
      post.commentsHTML=pv.commentRecordsToHtml(Array.from({length:500},(_,i)=>({no:String(i+1),name:'합성회원',memo:'검증금칙 댓글 '+i,reg_date:'2026.11.15 12:00:00'})),post.url);
      hold=true;capture();pv.renderPreview(post);
    });
    await page.waitForFunction(()=>document.querySelectorAll('.dcbpv-comment-item').length>=80);
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>exposedFrames),0);
    await page.evaluate(()=>release());
    await page.waitForFunction(()=>!document.querySelector('[data-dcbpv-filter-pending]'));
    await page.evaluate(()=>{hold=true;document.querySelector('.dcbpv-comment-html > button')?.click()});
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>exposedFrames),0);
    await page.evaluate(()=>release());
    await page.waitForFunction(()=>!document.querySelector('[data-dcbpv-filter-pending]'));
    const unfiltered=await page.locator('.dcbpv-comment-item:not(.dcbpv-filter-hidden)').count();
    assert.equal(unfiltered,0,'appended comments match while cloaked');
    await page.evaluate(()=>{hold=true;pv.updatePreviewComments(post)});
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>exposedFrames),0);
    await page.evaluate(()=>{capturing=false;pv.closePreview();release()});
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#dcb-preview-overlay').count(),0);
    // Legacy callback storage still filters before showing; errors cannot imply OFF.
    await page.evaluate(()=>{delete window.DCBRuntimeSettingsCache;hold=true;pv.renderPreview(post)});
    await page.waitForFunction(()=>pending.length>0);
    assert.equal(await page.evaluate(()=>exposed()),false);
    await page.evaluate(()=>release());
    await page.waitForFunction(()=>!document.querySelector('[data-dcbpv-filter-pending]'));
    assert.equal(await page.evaluate(()=>exposed()),false);
    await page.evaluate(()=>{
      pv.closePreview();chrome.storage.sync.get=(_defaults,cb)=>{chrome.runtime.lastError={message:'fixture error'};cb();delete chrome.runtime.lastError;};
      pv.renderPreview(post);
    });
    await page.waitForFunction(()=>!document.querySelector('[data-dcbpv-filter-pending]'));
    assert.match(await page.locator('.dcbpv-article').textContent(),/설정을 확인하지 못했어요/);
    assert.equal(await page.evaluate(()=>exposed()),false);
    await page.evaluate(()=>pv.closePreview());
    assert.deepEqual(errors,[]);
  });
}
