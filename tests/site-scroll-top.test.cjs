const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');
for(const [name,type]of Object.entries({chromium,firefox}))test(name+' top button scrolls pages and comments, above refresh and floating bars without overlap',async t=>{
  const browser=await type.launch({executablePath:type.executablePath()});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1000,height:750},reducedMotion:'reduce'});
  page.setDefaultTimeout(5000);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><style>body{margin:0;height:5000px}#dcb-auto-refresh-countdown{position:fixed;right:20px;bottom:20px;height:40px;width:180px;background:orange}#dcb-gallery-quick-block-floating{position:fixed;right:12px;bottom:70px;height:36px;width:200px;background:pink}#comments{position:fixed;top:80px;left:60px;width:500px;height:260px;overflow:auto;background:#ddd}</style><div id="dcb-auto-refresh-countdown"><button onclick="window.refreshClicks=(window.refreshClicks||0)+1">새로고침</button></div><div id="dcb-gallery-quick-block-floating">플로팅 차단</div><div id="comments"><div style="height:2500px">긴 댓글 목록</div></div>'}));
  await page.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1');await page.addScriptTag({path:'src/content/tools/scroll-top.js'});
  const host=page.locator('#dcb-site-scroll-top');assert.equal(await host.isVisible(),false);
  const controls=await page.locator('#dcb-auto-refresh-countdown').getAttribute('style');
  await page.evaluate(()=>scrollTo(0,1200));await host.waitFor({state:'visible'});
  async function above(selector){const a=await host.boundingBox(),b=await page.locator(selector).boundingBox();assert.ok(a.y+a.height+8<=b.y,JSON.stringify({a,b}));}
  await above('#dcb-auto-refresh-countdown');await above('#dcb-gallery-quick-block-floating');
  const previewScroll=await page.evaluate(async()=>{
    const overlay=document.createElement('section');
    overlay.id='dcb-preview-overlay';
    overlay.innerHTML='<main style="height:220px;overflow:auto"><p style="height:1200px">미리보기</p></main>';
    document.body.append(overlay);
    await new Promise(resolve=>setTimeout(resolve,200));
    const panel=overlay.firstElementChild;
    let probes=0;
    const probe=document.elementsFromPoint.bind(document);
    document.elementsFromPoint=(...args)=>{probes++;return probe(...args);};
    panel.scrollTop=500;
    panel.firstElementChild.append('댓글');
    await new Promise(resolve=>setTimeout(resolve,200));
    const nativeTarget=document.querySelector('#dcb-site-scroll-top')._scrollTarget===document.scrollingElement;
    delete document.elementsFromPoint;
    overlay.remove();
    return {probes,nativeTarget};
  });
  assert.deepEqual(previewScroll,{probes:0,nativeTarget:true});
  await page.getByRole('button',{name:'새로고침',exact:true}).click();assert.equal(await page.evaluate(()=>refreshClicks),1);
  await page.evaluate(()=>{const node=document.createElement('div');node.id='extra';node.style.cssText='position:fixed;right:10px;bottom:120px;height:54px;width:120px';document.body.append(node)});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#dcb-site-scroll-top').style.bottom)>=184);await above('#extra');
  await page.locator('#extra').evaluate(node=>node.style.display='none');
  await page.waitForFunction(()=>parseFloat(document.querySelector('#dcb-site-scroll-top').style.bottom)<184);
  await page.addStyleTag({content:'#opaque-bar{position:fixed;right:16px;bottom:116px;width:100px;height:44px}'});
  await page.evaluate(()=>{const node=document.createElement('div');node.id='opaque-bar';node.textContent='Native bar';document.body.append(node)});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#dcb-site-scroll-top').style.bottom)>=170);await above('#opaque-bar');
  await page.locator('#opaque-bar').evaluate(node=>node.remove());
  await page.getByRole('button',{name:'맨 위로 이동',exact:true}).click();await page.waitForFunction(()=>scrollY===0);assert.equal(await host.isVisible(),false);
  await page.locator('#comments').evaluate(node=>node.scrollTop=700);await host.waitFor({state:'visible'});
  await page.getByRole('button',{name:'현재 목록 맨 위로 이동'}).click();await page.waitForFunction(()=>document.querySelector('#comments').scrollTop===0);
  assert.equal(await page.evaluate(()=>scrollY),0);assert.equal(await page.locator('#dcb-auto-refresh-countdown').getAttribute('style'),controls);
  await page.addScriptTag({path:'src/content/tools/scroll-top.js'});assert.equal(await host.count(),1);
  fs.mkdirSync('test-results/site-scroll-top',{recursive:true});await page.evaluate(()=>scrollTo(0,1200));await host.waitFor({state:'visible'});await page.screenshot({path:`test-results/site-scroll-top/${name}.png`});
});
test('top button is registered for both engines without adding permissions',()=>{
  const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));const entry=manifest.content_scripts.find(x=>x.js.includes('src/content/tools/scroll-top.js'));
  assert.equal(entry.run_at,'document_end');assert.equal(entry.all_frames,false);
});

for(const [name,type]of Object.entries({chromium,firefox}))test(name+' article comments shortcut appears at the top and targets the current article only',async t=>{
  const browser=await type.launch({executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1000,height:750},reducedMotion:'reduce'});page.setDefaultTimeout(5000);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><style>body{margin:0;min-height:4500px}.comment_wrap{height:200px;width:700px}#comment_wrap_18489{position:absolute;top:1000px}#dcb-auto-refresh-countdown{position:fixed;right:20px;bottom:20px;width:150px;height:40px}#dcb-gallery-quick-block-floating{position:fixed;right:12px;bottom:70px;width:180px;height:36px}</style><h1>본문</h1><div id="comment_wrap_18489" class="comment_wrap" data-article-no="18489">다른 글 댓글</div><div id="dcb-auto-refresh-countdown">새로고침</div><div id="dcb-gallery-quick-block-floating">차단</div>'}));
  await page.goto('https://gall.dcinside.com/mini/board/view/?id=nobirthgall&no=18490&page=1');
  await page.evaluate(()=>{const preview=document.createElement('div');preview.id='dcb-preview-overlay';preview.innerHTML='<div class="comment_wrap" data-article-no="18490" style="height:80px"><div class="comment_count">전체 댓글 <span id="comment_total_18490">999</span>개</div></div>';document.body.append(preview);});
  await page.addScriptTag({path:'src/content/tools/scroll-top.js'});
  const host=page.locator('#dcb-site-scroll-top');assert.equal(await host.isVisible(),false,'Another article comment root is not a valid shortcut');
  await page.evaluate(()=>{
    const node=document.createElement('div');node.id='comment_wrap_18490';node.className='comment_wrap show';node.dataset.articleNo='18490';node.style.cssText='position:absolute;top:2600px';
    node.dataset.commentCnt='0';node.innerHTML='<div class="comment_count">전체 댓글 <em class="font_red"><span id="comment_total_18490">2</span></em>개</div><ul class="cmt_list"><li>화면에는 댓글 하나만 렌더됨</li></ul><button onclick="window.nativeCommentClicks=(window.nativeCommentClicks||0)+1">댓글닫기</button>';
    document.body.append(node);
  });
  const comments=page.getByRole('button',{name:/^댓글로 이동/});await comments.waitFor({state:'visible'});
  assert.equal(await comments.getAttribute('aria-label'),'댓글로 이동 · 전체 2개');
  assert.match(await comments.textContent(),/댓글2/);
  await page.locator('#comment_wrap_18490 #comment_total_18490').evaluate(node=>node.firstChild.data='5');
  await page.waitForFunction(()=>document.querySelector('#dcb-site-scroll-top').shadowRoot.querySelector('.comments').getAttribute('aria-label')==='댓글로 이동 · 전체 5개');
  await page.locator('#comment_wrap_18490 .cmt_list').evaluate(node=>node.innerHTML=Array.from({length:12},()=>'<li>렌더된 댓글</li>').join(''));
  assert.match(await comments.textContent(),/댓글5/);
  await page.locator('#comment_wrap_18490 #comment_total_18490').evaluate(node=>node.firstChild.data='0');
  await page.waitForFunction(()=>document.querySelector('#dcb-site-scroll-top').shadowRoot.querySelector('.comments').getAttribute('aria-label')==='댓글로 이동 · 전체 0개');
  await page.locator('#comment_wrap_18490 #comment_total_18490').evaluate(node=>node.firstChild.data='집계 중');
  await page.waitForFunction(()=>document.querySelector('#dcb-site-scroll-top').shadowRoot.querySelector('.comments').getAttribute('aria-label')==='댓글로 이동');
  assert.equal(await comments.textContent(),'댓글');
  await page.locator('#comment_wrap_18490').evaluate(node=>{
    node.classList.remove('show');
    node.removeAttribute('data-comment-cnt');
    node.querySelector('.comment_count').innerHTML='<span id="comment_total_18490">0</span>';
  });
  await page.waitForTimeout(180);
  assert.equal(await comments.textContent(),'댓글','An unresolved initial zero leaves the shortcut usable');
  await page.evaluate(()=>{
    const form=document.createElement('form');form.id='_view_form_';
    form.innerHTML='<input name="gallery_no" value="18489"><input name="comment_cnt" value="3">';
    document.body.append(form);
  });
  await page.waitForTimeout(180);
  assert.equal(await comments.textContent(),'댓글','A different article cannot confirm this count');
  await page.evaluate(()=>{
    document.querySelector('#_view_form_ [name=gallery_no]').value='18490';
    window.dispatchEvent(new Event('popstate'));
  });
  await page.waitForFunction(()=>document.querySelector('#dcb-site-scroll-top').shadowRoot.querySelector('.comments-count').textContent==='3');
  for (const value of ['27','128','0']) {
    await page.locator('#comment_wrap_18490 #comment_total_18490').evaluate((node,value)=>node.textContent=value,value);
    await page.waitForFunction(value=>document.querySelector('#dcb-site-scroll-top').shadowRoot.querySelector('.comments-count').textContent===value,value);
  }
  await page.locator('#comment_wrap_18490 .comment_count').evaluate(node=>node.innerHTML='전체 댓글 <span>1,234</span>개');
  await page.waitForFunction(()=>document.querySelector('#dcb-site-scroll-top').shadowRoot.querySelector('.comments').getAttribute('aria-label')==='댓글로 이동 · 전체 1,234개');
  await page.locator('#comment_wrap_18490 .comment_count').evaluate(node=>node.innerHTML='전체 댓글 <span id="comment_total_5520429">7</span>개');
  await page.waitForFunction(()=>document.querySelector('#dcb-site-scroll-top').shadowRoot.querySelector('.comments').getAttribute('aria-label')==='댓글로 이동');
  await page.locator('#comment_wrap_18490 .comment_count').evaluate(node=>node.innerHTML='전체 댓글 <span id="comment_total_18490">5</span>개');
  await page.waitForFunction(()=>document.querySelector('#dcb-site-scroll-top').shadowRoot.querySelector('.comments').getAttribute('aria-label')==='댓글로 이동 · 전체 5개');
  assert.equal(await page.getByRole('button',{name:'맨 위로 이동',exact:true}).isVisible(),false);
  assert.equal(await page.evaluate(()=>scrollY),0);
  await comments.click();await page.waitForFunction(()=>Math.abs(document.getElementById('comment_wrap_18490').getBoundingClientRect().top)<2);
  assert.equal(await page.evaluate(()=>window.nativeCommentClicks||0),0);
  await page.getByRole('button',{name:'맨 위로 이동',exact:true}).waitFor({state:'visible'});
  assert.equal(await host.evaluate(node=>node.offsetHeight),96);
  const a=await host.boundingBox(),b=await page.locator('#dcb-gallery-quick-block-floating').boundingBox();assert.ok(a.y+a.height+8<=b.y,JSON.stringify({a,b}));
  await page.getByRole('button',{name:'맨 위로 이동',exact:true}).click();await page.waitForFunction(()=>scrollY===0);assert.equal(await comments.isVisible(),true);
  await page.locator('#comment_wrap_18490').evaluate(node=>node.hidden=true);await comments.waitFor({state:'hidden'});assert.equal(await host.isVisible(),false);
  fs.mkdirSync('test-results/site-scroll-top',{recursive:true});await page.locator('#comment_wrap_18490').evaluate(node=>node.hidden=false);await comments.waitFor({state:'visible'});await page.screenshot({path:`test-results/site-scroll-top/${name}-comments.png`});
});
