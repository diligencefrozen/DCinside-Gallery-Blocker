const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');
const source=fs.readFileSync('src/content/core/content_script.js','utf8');
const preview=source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/,
  'window.videoTest={renderPreview,closePreview,parseDesktopFallback,preparePreviewVideoControls};})();');
const articleUrl='https://gall.dcinside.com/mgallery/board/view/?id=fixture&no=53168';
const mediaUrl='https://dcm6.dcinside.co.kr/viewmovie.php?code=fixture-code&key=fixture-key&ss=4&type=mp4';

for(const [engine,type]of Object.entries({chromium,firefox}))test(engine+' native preview video keeps visible controls, user playback, signed sources and GIF exclusions',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let clip,playerReads=0,playerReferrer='';
  const direct='<video id="dc_mv" playsinline webkit-playsinline preload="metadata" controlslist="nodownload" data-no="7528835"><source src="'+mediaUrl.replaceAll('&','&amp;')+'" type="video/webm"></video>';
  const article='<!doctype html><html><body><h3 class="title_subject">세로 동영상</h3><div class="write_div"><iframe id="movie_iframe_7528835" src="https://gall.dcinside.com/board/movie/movie_view?no=7528835&amp;token=fixture"></iframe></div></body></html>';
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='dcm6.dcinside.co.kr')return route.fulfill({contentType:'video/webm',body:clip||Buffer.alloc(0)});
    if(url.pathname==='/board/movie/movie_view'){
      playerReads++;playerReferrer=route.request().headers().referer;
      return route.fulfill({contentType:'text/html; charset=utf-8',body:direct});
    }
    return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body></body></html>'});
  });
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  // A local portrait WebM exercises real decoding and trusted user gestures in
  // both engines, without saving a media file or relying on expiring DC keys.
  clip=Buffer.from(await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=180;canvas.height=390;
    const context=canvas.getContext('2d'),stream=canvas.captureStream(10);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
    const complete=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve});
    recorder.start();let frame=0;
    const draw=setInterval(()=>{context.fillStyle=frame++%2?'#3158a6':'#537dc1';context.fillRect(0,0,180,390)},80);
    await new Promise(resolve=>setTimeout(resolve,900));clearInterval(draw);recorder.stop();await complete;stream.getTracks().forEach(track=>track.stop());
    return [...new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())];
  }));
  await page.evaluate(()=>{
    window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;
    const get=(defaults,callback)=>{const settings={...defaults,doryBlockEnabled:false,userBlockEnabled:false,showMemberIpInfo:false};callback?.(settings);return Promise.resolve(settings)};
    window.chrome={storage:{local:{get},sync:{get},onChanged:{addListener(){}}},runtime:{sendMessage(message,callback){callback?.({ok:false})}}};
    window.DCBRuntimeSettingsCache={get,onChanged:chrome.storage.onChanged};
  });
  await page.addScriptTag({content:preview});
  await page.evaluate(({article,url})=>{window.nativePost=videoTest.parseDesktopFallback(article,url);videoTest.renderPreview(nativePost)}, {article,url:articleUrl});
  const player=page.locator('.dcbpv-article .dcbpv-video-player'),video=player.locator('video'),button=player.getByRole('button');
  await page.waitForFunction(()=>document.querySelector('.dcbpv-video-player video')?.readyState>=1);
  assert.equal(playerReads,1,'the native iframe is fetched once to resolve its real source');
  assert.equal(playerReferrer,articleUrl,'the existing native player referrer is retained');
  assert.equal(await video.getAttribute('src'),mediaUrl,'code/key/ss and type remain unchanged');
  assert.equal(await page.locator('.dcbpv-article iframe').count(),0,'dormant iframe is replaced after source resolution');
  assert.equal(await video.evaluate(v=>v.controls&&!v.autoplay&&!v.loop&&!v.muted&&v.paused),true,'ordinary videos retain native controls and wait for a user gesture');
  const layout=await player.evaluate(node=>{
    const v=node.querySelector('video'),scroll=document.querySelector('.dcbpv-scroll').getBoundingClientRect();
    return {height:v.getBoundingClientRect().height,bottom:v.getBoundingClientRect().bottom,scrollBottom:scroll.bottom,
      label:node.querySelector('button').getAttribute('aria-controls')===v.id,
      original:node.querySelector('a').href,transition:getComputedStyle(node).transitionDuration};
  });
  assert.ok(layout.height<390,'portrait content is bounded by the viewport');
  assert.ok(layout.bottom<=layout.scrollBottom,'native controls fit inside the visible preview');
  assert.equal(layout.label,true);assert.equal(layout.original,articleUrl);assert.equal(layout.transition,'0s');
  await button.click();await page.waitForFunction(()=>{const v=document.querySelector('.dcbpv-video-player video');return !v.paused&&v.currentTime>0.05});
  assert.equal(await button.getAttribute('aria-label'),'동영상 일시정지');assert.equal(await button.getAttribute('aria-pressed'),'true');
  await button.click();assert.equal(await video.evaluate(v=>v.paused),true);
  assert.equal(await button.getAttribute('aria-label'),'동영상 재생');
  await page.setViewportSize({width:390,height:720});
  assert.ok(await player.evaluate(node=>node.getBoundingClientRect().width<=document.querySelector('.dcbpv-scroll').clientWidth),'controls fit a narrow preview');
  assert.ok(await button.evaluate(node=>node.getBoundingClientRect().width>=86));
  await button.click();await page.waitForFunction(()=>!document.querySelector('.dcbpv-video-player video').paused);
  const closed=await page.evaluate(()=>{const video=document.querySelector('.dcbpv-video-player video');videoTest.closePreview();return {paused:video.paused,detached:!video.isConnected}});
  assert.deepEqual(closed,{paused:true,detached:true},'closing explicitly stops playback before removing the overlay');
  await page.evaluate(()=>videoTest.renderPreview(nativePost));
  await page.waitForFunction(()=>document.querySelector('.dcbpv-video-player video')?.readyState>=1);
  assert.equal(playerReads,1,'reopen retains the existing resolved source cache');
  assert.equal(await page.locator('.dcbpv-video-toolbar').count(),1,'reopen never duplicates controls');

  // Direct native video markup and dynamically inserted videos receive the same
  // controls, while GIF-like videos and DCCon keep their existing animation UI.
  await page.evaluate(({direct,url})=>{videoTest.closePreview();videoTest.renderPreview({url,title:'Direct native video',articleHTML:direct,commentsHTML:'',counts:{}})}, {direct,url:articleUrl});
  await page.waitForFunction(()=>document.querySelector('.dcbpv-video-player video')?.readyState>=1);
  assert.equal(await video.locator('source').getAttribute('src'),mediaUrl);
  await page.evaluate(src=>document.querySelector('.dcbpv-article').insertAdjacentHTML('beforeend','<video id="dc_mv" src="'+src+'"></video><video class="dccon" src="'+src+'"></video><video data-dcbpv-animated="1" src="'+src+'"></video>'),mediaUrl);
  await page.waitForFunction(()=>document.querySelectorAll('.dcbpv-video-player').length===2);
  assert.equal(await page.locator('video.dcbpv-dccon').evaluate(v=>!v.controls&&v.autoplay&&v.loop&&v.muted&&!v.closest('.dcbpv-video-player')),true);
  assert.equal(await page.locator('video.dcbpv-animated-media:not(.dcbpv-dccon)').evaluate(v=>!v.controls&&v.autoplay&&v.loop&&v.muted&&!v.closest('.dcbpv-video-player')),true);
  assert.equal(await page.locator('.dcbpv-video-toggle').evaluateAll(nodes=>new Set(nodes.map(n=>n.getAttribute('aria-controls'))).size),2,'multiple native videos receive distinct accessible targets');
  const mutations=await page.evaluate(()=>{const article=document.querySelector('.dcbpv-article'),observer=new MutationObserver(()=>{});observer.observe(article,{childList:true,subtree:true,attributes:true});for(let n=0;n<3;n++)videoTest.preparePreviewVideoControls(article,location.href);const count=observer.takeRecords().length;observer.disconnect();return count});
  assert.equal(mutations,0,'idempotent preparation avoids listener and DOM loops');
  await page.locator('.dcbpv-video-player').first().evaluate(node=>{const v=node.querySelector('video');Object.defineProperty(v,'error',{configurable:true,value:{code:4}});v.dispatchEvent(new Event('error'))});
  assert.match(await page.locator('.dcbpv-video-toolbar [role=status]').first().textContent(),/오류 4/);
  assert.equal(await page.locator('.dcbpv-video-toolbar a').first().getAttribute('href'),articleUrl,'failure offers the original post rather than a media key URL');
  assert.equal(await page.locator('.dcbpv-video-toggle').first().getAttribute('aria-label'),'동영상 다시 시도');
  await page.locator('.dcbpv-video-player').first().evaluate(node=>{const video=node.querySelector('video');Object.defineProperty(video,'error',{configurable:true,value:null});video.play=()=>Promise.reject(new DOMException('private playback details','NotAllowedError'))});
  await page.locator('.dcbpv-video-toggle').first().click();
  await page.waitForFunction(()=>document.querySelector('.dcbpv-video-toolbar [role=status]').textContent.includes('브라우저에서'));
  assert.equal(await page.locator('.dcbpv-video-toolbar [role=status]').first().textContent(),'브라우저에서 동영상 재생을 허용하지 않았습니다. 원문에서 확인해 주세요.');
  await page.evaluate(()=>videoTest.closePreview());assert.deepEqual(errors,[]);
});
