const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');
const source=fs.readFileSync('src/content/core/content_script.js','utf8');
const preview=source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/,'window.ux={renderPreview,renderLoading,updatePreviewComments,closePreview,commentRecordsToHtml};})();');
fs.mkdirSync('test-results/preview-ux',{recursive:true});

for(const [engine,type] of Object.entries({chromium,firefox}))test(engine+' preview states, contrast, reduced motion and responsive controls',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1100,height:900}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><textarea aria-label="원문 댓글"></textarea></body></html>'}));
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  await page.evaluate(()=>{
    document.body.innerHTML='';window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;window.prepares=[];window.writes=0;
    window.chrome={runtime:{sendMessage(m,cb){
      if(m.type==='dcb.previewComment'&&m.operation==='prepare')prepares.push(cb);
      else if(m.type==='dcb.previewVote'&&m.operation==='prepare')cb({ok:true,counts:{up:'12',down:'0'}});
      else {if(['submit','delete'].includes(m.operation))writes++;cb?.({ok:false});}
    }},storage:{sync:{get:(d,cb)=>cb(d)},local:{get:(d,cb)=>cb(d)},onChanged:{addListener(){}}}};
  });
  await page.addStyleTag({path:'src/content/appearance/writer-layout.css'});
  await page.addScriptTag({path:'src/shared/dom-mutation-bus.js'});
  await page.addScriptTag({path:'src/content/user/writer-layout.js'});
  await page.addScriptTag({content:preview});
  await page.evaluate(()=>{
    window.post={url:location.origin+'/board/view/?id=fixture&no=1',title:'주말에 다녀온 공원 사진을 공유합니다',writerHTML:'<span class="gall_writer" data-nick="산책하는사람"><span class="nickname">산책하는사람</span></span><span>11.15 14:20</span>',articleHTML:'<p>햇살이 좋아서 가까운 공원에 다녀왔어요.</p><p>본문을 읽는 동안에도 댓글을 준비할 수 있습니다. 준비 상태는 아래 안내에서 확인하세요.</p>',commentsHTML:'',counts:{up:'12',down:'0'},commentTitle:'댓글'};
    ux.renderLoading();
    post.commentsPending=true;
  });
  assert.equal(await page.locator('.dcbpv-status-card').getAttribute('aria-atomic'),'true');
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  assert.equal(await page.locator('#dcb-preview-overlay').count(),0);
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;ux.renderPreview(post,{commentsPending:true})},theme);
    await page.waitForSelector('.dcbpv-status-card');
    assert.equal(await page.locator('iframe').count(),0,'loading presentation must not wake the composer');
    const contrast=await page.evaluate(()=>{
      const card=document.querySelector('.dcbpv-status-card'),text=card.querySelector('small');
      const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
      const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      const a=lum(rgb(getComputedStyle(text).color)),b=lum(rgb(getComputedStyle(card).backgroundColor));
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(contrast>=4.5,theme+' explanatory text contrast '+contrast);
    assert.notEqual(await page.locator('.dcbpv-status-dots i').first().evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.screenshot({path:`test-results/preview-ux/${engine}-${theme}-comments-loading.png`,animations:'disabled'});
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.dcbpv-status-dots i').first().evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{window.hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
    assert.equal(await page.locator('.dcbpv-status-dots i').first().evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
    const changes=await page.evaluate(async()=>{let n=0;const o=new MutationObserver(rs=>n+=rs.length);o.observe(document.querySelector('.dcbpv-status-card'),{subtree:true,childList:true,attributes:true});await new Promise(r=>setTimeout(r,250));o.disconnect();return n});
    assert.equal(changes,0,'loading motion does not mutate DOM every frame');
    await page.getByRole('button',{name:'댓글 입력창 열기',exact:true}).click();
    await page.waitForFunction(()=>prepares.length>0);
    await page.waitForSelector('.dcbpv-compose-progress');
    await page.screenshot({path:`test-results/preview-ux/${engine}-${theme}-composer-loading.png`,animations:'disabled'});
    await page.evaluate(()=>prepares.shift()({ok:false,code:'unavailable'}));
    await page.waitForFunction(()=>!document.querySelector('.dcbpv-composer').hasAttribute('data-preparing'));
    assert.equal(await page.locator('.dcbpv-compose-progress').isVisible(),false);
    await page.evaluate(()=>ux.closePreview());
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{post.commentsPending=false;post.commentsHTML=ux.commentRecordsToHtml([{no:'1',name:'산책하는사람',memo:'추천해 주셔서 감사합니다.',reg_date:'2026.11.15 14:30:00'},{no:'2',name:'오늘도좋은하루',memo:'다음 주에도 가 보고 싶네요.',reg_date:'2026.11.15 14:32:00'}],post.url);ux.renderPreview(post)});
  await page.waitForSelector('.dcbpv-comment-item');
  await page.waitForTimeout(200);
  const collapse=page.getByRole('button',{name:'댓글 입력창 닫기',exact:true});
  if(await collapse.count())await collapse.click();
  const overflow=await page.evaluate(()=>{const p=document.querySelector('.dcbpv-panel'),r=p.getBoundingClientRect();return r.left<0||r.right>innerWidth||p.scrollWidth>p.clientWidth+1});
  assert.equal(overflow,false,'390px preview fits the viewport');
  await page.screenshot({path:`test-results/preview-ux/${engine}-mobile-ready.png`,animations:'disabled'});
  await page.evaluate(()=>{post.commentsHTML='';post.commentError='fixture';ux.updatePreviewComments(post)});
  assert.match(await page.locator('.dcbpv-status-card').textContent(),/새로고침/);
  assert.equal(await page.locator('.dcbpv-status-card .dcbpv-status-dots').count(),0,'error state stops the loading animation');
  assert.equal(await page.evaluate(()=>writes),0);
  await page.evaluate(()=>ux.closePreview());
  assert.deepEqual(errors,[]);
});
