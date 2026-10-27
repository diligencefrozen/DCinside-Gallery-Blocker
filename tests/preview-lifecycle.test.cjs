const assert=require('node:assert/strict');const fs=require('node:fs');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
 await page.goto('https://gall.dcinside.com/board/lists/?id=test');
 await page.evaluate(()=>{
  window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;window.messages=[];
  window.chrome={runtime:{lastError:null,sendMessage(message,done){messages.push(message);if(message.type==='dcb.fetchText')window.pendingRead=done;else done({ok:false});}},storage:{sync:{get:(d,f)=>f(d)},local:{get:(d,f)=>f(d)},onChanged:{addListener(){}}}};
 });
 const source=fs.readFileSync('src/content/core/content_script.js','utf8');
 await page.addScriptTag({content:source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/,'window.lifecycle={renderPreview,closePreview,fetchText,fetchTextDirect,fetchCommentsFromEndpoint,writePreviewCache,readPreviewCache,previewMayContainDynamicYouTube,decoratePreviewReplyActions};})();')});
 await page.evaluate(()=>lifecycle.renderPreview({url:'https://gall.dcinside.com/board/view/?id=test&no=1',title:'test',articleHTML:'<p>body</p>',commentsHTML:'',counts:{up:'3',upMember:'2',down:'1'}}));
 await page.locator('[data-act=share]').click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#dcb-preview-share').count(),0);assert.equal(await page.locator('#dcb-preview-overlay').count(),1);
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.act),'share');
 assert.deepEqual(await page.evaluate(async()=>{
   const controller=new AbortController();const pending=lifecycle.fetchText('https://gall.dcinside.com/board/view/?id=test&no=2',controller.signal).catch(e=>e.name);
   controller.abort();const error=await pending;pendingRead({ok:true,text:'late'});
   return {error,cancels:messages.filter(m=>m.type==='dcb.cancelFetch').length,matching:messages.find(m=>m.type==='dcb.cancelFetch').requestId===messages.find(m=>m.type==='dcb.fetchText').requestId};
 }),{error:'AbortError',cancels:1,matching:true});
 assert.equal(await page.evaluate(async()=>{
  window.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError'))));
  const c=new AbortController(),pending=lifecycle.fetchTextDirect('/board/comment/',c.signal).catch(e=>e.name);c.abort();return pending;
 }),'AbortError');
 for(const status of [403,429,503])assert.equal(await page.evaluate(async status=>{
  let attempts=0;chrome.runtime.sendMessage=(m,done)=>{attempts++;done({ok:false,status,error:'restricted'});};
  window.fetch=()=>{attempts++;throw new Error('no fallback allowed');};
  try{await lifecycle.fetchCommentsFromEndpoint('https://gall.dcinside.com/board/view/?id=test&no=2',new DOMParser().parseFromString('<html/>','text/html'),new AbortController().signal,'default');}catch(_){}
  return attempts;
 },status),1);
 assert.deepEqual(await page.evaluate(()=>{
  const url='https://gall.dcinside.com/board/view/?id=test&no=5';
  const data={url,articleHTML:'<p>body</p>',rawHtml:'x'.repeat(1000000)+'<div data-youtube-id="12345678901">',desktopRawHtml:'secret source'};
  lifecycle.writePreviewCache(url,data);const cached=lifecycle.readPreviewCache(url);
  return {raw:'rawHtml' in cached,desktop:'desktopRawHtml' in cached,marker:lifecycle.previewMayContainDynamicYouTube(cached),hit:cached===data};
 }),{raw:false,desktop:false,marker:true,hit:true});
 assert.deepEqual(await page.evaluate(()=>{
  const root=document.createElement('div');root.innerHTML=['1','1','2','bad','3'].map((id,i)=>`<div class="dcbpv-comment-item ${i===4?'deleted':''}" data-dcbpv-native-id="${id}"><div class="dcbpv-comment-meta"></div></div>`).join('');
  lifecycle.decoratePreviewReplyActions(root);return [...root.querySelectorAll('[data-act=compose-reply]')].map(n=>n.dataset.target);
 }),['2']);
 await page.evaluate(()=>lifecycle.closePreview());assert.deepEqual(errors,[]);
 console.log('Preview lifecycle passed: share Esc/focus, direct/background abort, no restricted retries, compact cache/YouTube marker, duplicate/deleted IDs.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
