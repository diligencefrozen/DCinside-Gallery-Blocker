const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');
const source=fs.readFileSync('src/content/core/content_script.js','utf8');
const preview=source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/,
  'window.photoTest={renderPreview,closePreview,articleHTMLFromElement,numberPreviewArticlePhotos};})();');

for(const [engine,type]of Object.entries({chromium,firefox}))test(engine+' one top-left photo number survives nested native markers, CSS and serialized old wrappers',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1128,height:820}});page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.fulfill({contentType:route.request().url().endsWith('.jpg')?'image/svg+xml':'text/html; charset=utf-8',body:route.request().url().endsWith('.jpg')?'<svg xmlns="http://www.w3.org/2000/svg" width="820" height="500"><rect width="820" height="500" fill="#18283b"/><text x="35" y="65" font-size="32" fill="white">사진 위치 검증</text></svg>':'<!doctype html><html><body></body></html>'}));
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  await page.evaluate(()=>{window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;const get=(d,cb)=>{const s={...d,doryBlockEnabled:false,userBlockEnabled:false};cb?.(s);return Promise.resolve(s)};window.chrome={storage:{local:{get},sync:{get},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>cb?.({ok:false})}};window.DCBRuntimeSettingsCache={get,onChanged:chrome.storage.onChanged}});
  await page.addStyleTag({content:'.imgwrap{position:relative;text-align:center}.imgwrap .num.img{position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:3}.imgwrap span{float:right;transform:translateX(30%)}.imgwrap .imgnum{position:absolute;left:50%;text-indent:-9999px;background:red}.imgwrap .imgnum:before{content:"native sprite"}'});
  await page.addScriptTag({content:preview});
  await page.evaluate(()=>{
    const native=new DOMParser().parseFromString('<div class="write_div"><div class="imgwrap"><span class="num img"><em class="imgnum n1"></em><a href="https://dcimg1.dcinside.com/first.jpg"><img alt="첫 사진" src="https://dcimg1.dcinside.com/first.jpg"></a></span></div><div class="imgwrap"><span class="num img"><em class="imgnum n2"></em></span><picture><img alt="둘째 사진" src="https://dcimg1.dcinside.com/second.jpg"></picture></div></div>','text/html');
    window.post={url:location.origin+'/board/view/?id=fixture&no=1',title:'중첩 native 사진 순번',commentTotal:0,articleHTML:photoTest.articleHTMLFromElement(native.querySelector('.write_div'),location.href),commentsHTML:'',counts:{}};photoTest.renderPreview(post);
  });
  const assertLayout=async()=>{
    await page.waitForFunction(()=>document.querySelectorAll('.dcbpv-photo-number').length===2&&[...document.querySelectorAll('.dcbpv-article img')].every(img=>img.complete&&img.naturalWidth));
    const result=await page.locator('.dcbpv-article img').evaluateAll(images=>images.map(img=>{
      const wrapper=img.closest('.dcbpv-photo'),badges=wrapper.querySelectorAll('.dcbpv-photo-number'),image=img.getBoundingClientRect(),badge=badges[0].getBoundingClientRect();
      return {count:badges.length,text:badges[0].textContent,x:Math.round(badge.left-image.left),y:Math.round(badge.top-image.top),nested:!!wrapper.parentElement.closest('.dcbpv-photo')};
    }));
    assert.deepEqual(result.map(r=>r.count),[1,1]);assert.deepEqual(result.map(r=>r.text),['1','2']);
    for(const item of result){assert.equal(item.nested,false);assert.ok(item.x>=6&&item.x<=10,JSON.stringify(item));assert.ok(item.y>=6&&item.y<=10,JSON.stringify(item));}
    assert.equal(await page.locator('.dcbpv-article .num.img,.dcbpv-article .imgnum').count(),0);
  };
  await assertLayout();assert.equal(await page.locator('img[alt="첫 사진"]').evaluate(img=>!!img.closest('a')),true);
  // Reproduce an older nested owner spanning two photographs, plus duplicate
  // badges left by a serialized rerender. Each image must regain one owner.
  await page.evaluate(()=>{
    const article=document.querySelector('.dcbpv-article'),photos=[...article.querySelectorAll('.dcbpv-photo')];
    photos[0].append(photos[1]);photos[1].append(photos[1].querySelector('.dcbpv-photo-number').cloneNode(true));
    article.innerHTML=article.innerHTML;photoTest.numberPreviewArticlePhotos(article);
    for(let i=0;i<3;i++){article.innerHTML=article.innerHTML;photoTest.numberPreviewArticlePhotos(article);}
  });
  await assertLayout();
  fs.mkdirSync('test-results/preview-photo-layout',{recursive:true});
  await page.locator('.dcbpv-panel').screenshot({path:`test-results/preview-photo-layout/${engine}.png`});
  await page.evaluate(()=>{photoTest.closePreview();photoTest.renderPreview(post)});await assertLayout();
  await page.setViewportSize({width:390,height:720});await assertLayout();
  await page.evaluate(()=>photoTest.closePreview());assert.deepEqual(errors,[]);
});
