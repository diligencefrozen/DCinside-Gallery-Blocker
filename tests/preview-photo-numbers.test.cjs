const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');
const source=fs.readFileSync('src/content/core/content_script.js','utf8');
const preview=source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/,
  'window.photoTest={renderPreview,closePreview,articleHTMLFromElement,numberPreviewArticlePhotos};})();');

for(const [name,type] of Object.entries({chromium,firefox}))test(name+' preview photo numbers survive native markers, dynamic images, filtering and reopen without numbering icons',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1080,height:900}});page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    if(/\.(?:jpg|png|gif)(?:\?|$)/.test(route.request().url())||route.request().url().includes('/dccon.php'))
      return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#b6c8df"/></svg>'});
    return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body></body></html>'});
  });
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  await page.evaluate(()=>{
    window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;
    const get=(defaults,callback)=>{callback?.(defaults);return Promise.resolve(defaults)};
    window.chrome={storage:{local:{get},sync:{get},onChanged:{addListener(){}}},runtime:{sendMessage(message,callback){callback?.({ok:false})}}};
    window.DCBRuntimeSettingsCache={get,onChanged:chrome.storage.onChanged};
  });
  // Simulate the native sprite styles that otherwise make .imgnum text vanish.
  await page.addStyleTag({content:'.num.img{position:absolute;float:right;width:17px;height:17px}.imgnum{background:red;text-indent:-9999px;width:10px;height:10px}.imgnum:before{content:"sprite"}'});
  await page.addScriptTag({content:preview});
  await page.evaluate(()=>{
    const doc=new DOMParser().parseFromString('<div class="write_div"><p>사진 본문</p><div class="imgwrap"><span class="num img"><em class="imgnum n7"></em></span><a href="https://dcimg1.dcinside.com/photo-one.jpg"><img src="https://dcimg1.dcinside.com/photo-one.jpg" alt="첫 사진"></a></div><p><span class="num img"><em class="imgnum n9"></em></span><picture><img src="https://dcimg1.dcinside.com/photo-two.jpg" alt="두 번째 사진"></picture></p><img src="https://dcimg1.dcinside.com/dccon.php?no=sticker" class="written_dccon"><img src="https://example.com/tiny.png" width="24" height="24"><img src="https://example.com/icons/symbol.png"><span class="video_thumb"><img src="https://example.com/poster.jpg"></span><span class="gall_writer"><img src="https://example.com/author.jpg"></span></div>','text/html');
    window.post={url:location.origin+'/board/view/?id=fixture&no=1',title:'다중 사진',articleHTML:photoTest.articleHTMLFromElement(doc.querySelector('.write_div'),location.href),commentsHTML:'<p class="dcbpv-comment-body"><img src="https://example.com/comment-photo.jpg"></p>',counts:{}};
    photoTest.renderPreview(post);
  });
  const numbers=()=>page.locator('.dcbpv-article .dcbpv-photo-number em').allTextContents();
  await page.waitForFunction(()=>document.querySelectorAll('.dcbpv-photo-number').length===2);
  assert.deepEqual(await numbers(),['1','2']);
  assert.equal(await page.locator('.dcbpv-article .num.img').count(),2,'native number markers are replaced rather than duplicated');
  assert.deepEqual(await page.locator('.dcbpv-photo-number').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))),['사진 1/2','사진 2/2']);
  assert.equal(await page.locator('.dcbpv-comment-body .dcbpv-photo-number').count(),0);
  assert.equal(await page.locator('.dcbpv-photo .dcbpv-dccon').count(),0);
  const marker=page.locator('.dcbpv-photo-number em').first();
  assert.equal(await marker.evaluate(node=>getComputedStyle(node).textIndent),'0px');
  assert.equal(await marker.evaluate(node=>getComputedStyle(node,'::before').content),'none');
  assert.equal(await page.locator('img[alt="첫 사진"]').getAttribute('alt'),'첫 사진');
  assert.ok(await page.locator('img[alt="첫 사진"]').evaluate(node=>!!node.closest('a')),'photo links are preserved');
  await page.evaluate(()=>{const img=document.createElement('img');img.src='https://dcimg1.dcinside.com/photo-three.jpg';document.querySelector('.dcbpv-article').prepend(img)});
  await page.waitForFunction(()=>document.querySelectorAll('.dcbpv-photo-number').length===3);
  assert.deepEqual(await numbers(),['1','2','3']);
  await page.evaluate(()=>document.querySelector('.dcbpv-article .dcbpv-photo').remove());
  await page.waitForFunction(()=>[...document.querySelectorAll('.dcbpv-photo-number em')].map(node=>node.textContent).join(',')==='1,2');
  assert.deepEqual(await numbers(),['1','2']);
  const changes=await page.evaluate(()=>{
    const observer=new MutationObserver(()=>{});
    observer.observe(document.querySelector('.dcbpv-article'),{subtree:true,childList:true,attributes:true});
    for(let i=0;i<3;i++)photoTest.numberPreviewArticlePhotos(document.querySelector('.dcbpv-article'));
    const count=observer.takeRecords().length;observer.disconnect();return count;
  });
  assert.equal(changes,0,'settled numbering does not keep mutating the article');
  fs.mkdirSync('test-results/preview-photo-numbers',{recursive:true});
  await page.locator('.dcbpv-panel').screenshot({path:`test-results/preview-photo-numbers/${name}.png`});
  await page.evaluate(()=>{photoTest.closePreview();photoTest.renderPreview(post)});
  await page.waitForFunction(()=>document.querySelectorAll('.dcbpv-photo-number').length===2);
  assert.deepEqual(await numbers(),['1','2']);
  await page.evaluate(()=>{document.querySelector('.dcbpv-article picture').remove()});
  await page.waitForFunction(()=>!document.querySelector('.dcbpv-photo-number'));
  assert.equal(await page.locator('.dcbpv-photo').count(),0,'one remaining photo needs no counter or extra wrapper');
  await page.evaluate(()=>document.querySelector('.dcbpv-article').insertAdjacentHTML('beforeend','<video class="dcbpv-animated-media" muted><source src="https://example.com/animated.mp4"></video>'));
  await page.waitForFunction(()=>document.querySelectorAll('.dcbpv-photo-number').length===2);
  assert.deepEqual(await numbers(),['1','2'],'image-like GIF videos keep the same photo sequence');
  await page.locator('video.dcbpv-animated-media').evaluate(node=>node.className='dcbpv-dccon');
  await page.waitForFunction(()=>!document.querySelector('.dcbpv-photo-number'));
  await page.evaluate(()=>photoTest.closePreview());
  assert.deepEqual(errors,[]);
});
