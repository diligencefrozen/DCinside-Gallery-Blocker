const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const test=require('node:test');
const {chromium,firefox}=require('playwright');

for(const [engine,type] of Object.entries({chromium,firefox})) test(engine+' activity layout and keyword/image reveal',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:900,height:550}});
  await page.route('https://gall.dcinside.com/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><body></body></html>'}));
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  const writer='<span class="gall_writer" data-uid="fixtureuser" data-nick="테스터"><span class="nickname"><em>테스터</em></span><i class="writer_nikcon"></i></span>';
  await page.setContent('<style>body{font:14px system-ui;padding:30px}table{width:100%;table-layout:fixed;border-collapse:collapse}td,.cmt_info{padding:10px;border-bottom:1px solid #ddd}.fr{float:right}.cmt_txtbox{display:inline;margin-left:28px}time{color:#666}</style><h3>갤러리 목록</h3><table><col width="65%"><col width="20%"><col width="15%"><tr class="ub-content"><td class="gall_tit ub-word"><a href="?no=1">게시글 제목과 댓글 수 [3]</a></td><td>'+writer+'</td><td>18:30</td></tr></table><h3>전체 댓글 1개</h3><ul class="cmt_list"><li><div class="cmt_info">'+writer+'<div class="cmt_txtbox">댓글 본문입니다.</div><div class="fr clear"><time>11.12 18:30</time> <button>삭제</button></div></div></li></ul>');
  await page.evaluate(()=>{
    window.signalCalls=0;window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;
    document.cookie='ci_c=fixture';
    const listeners=[];
    window.sync={dcbShowWriterActivity:true,dcbImageAccountRules:{enabled:false},dcbImageBlockConfig:{enabled:true},keywordBlockEnabled:true,blockedKeywords:['차단단어'],keywordHideEnabled:true,hiddenKeywords:['접기'],showUidBadge:false,showMemberIpInfo:false};
    window.local={dcbImageBlockRecords:{'quick:fixture':{originalSrc:'https://gall.dcinside.com/picture.svg'}}};
    const get=store=>async(keys,cb)=>{const result={...(keys||{}),...store};cb?.(result);return result};
    window.chrome={storage:{local:{get:get(local),set:async x=>Object.assign(local,x)},sync:{get:get(sync)},onChanged:{addListener:f=>listeners.push(f)}},
      runtime:{onMessage:{addListener(){}},sendMessage(m,cb){if(m.type==='dcb.accountSignal'){signalCalls++;cb({ok:true,posts:71,comments:83})}else cb?.({ok:false})}}};
    window.DCBRuntimeSettingsCache={get:get(sync),onChanged:chrome.storage.onChanged};
    window.change=patch=>{Object.assign(sync,patch);for(const f of listeners)f(Object.fromEntries(Object.entries(patch).map(([k,v])=>[k,{newValue:v}])),'sync')};
  });
  await page.addStyleTag({path:'src/content/appearance/writer-layout.css'});
  for(const f of ['shared/dom-mutation-bus','shared/keyword-matcher','content/user/writer-layout','content/image/image-account-filter','content/user/account-activity-blocker','content/image/image-blocker']) await page.addScriptTag({path:'src/'+f+'.js'});
  await page.waitForSelector('td.gall_tit > .dcb-activity-badge');
  await page.waitForSelector('.cmt_info > .fr > .dcb-activity-badge');
  assert.equal(await page.locator('.gall_writer .dcb-activity-badge').count(),0);
  assert.equal(await page.evaluate(()=>signalCalls),1);
  fs.mkdirSync('test-results/layout-1112',{recursive:true});
  await page.screenshot({path:'test-results/layout-1112/'+engine+'-list-comments.png'});
  const source=fs.readFileSync('src/content/core/content_script.js','utf8');
  await page.addScriptTag({content:source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/,'window.renderFixture=renderPreview;window.closeFixture=closePreview;})();')});
  await page.route('**/picture.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="150" height="80"><rect width="150" height="80" fill="teal"/></svg>'}));
  await page.evaluate(()=>{window.post={url:location.origin+'/board/view/?id=fixture&no=8',title:'접기',articleHTML:'<p>본문 예시</p><img src="/picture.svg">',commentsHTML:'',counts:{}};renderFixture(post)});
  await page.locator('[data-dcbpv-reveal="article"]').click();
  await page.locator('.dcbpv-article [data-act=peek]').click();
  await page.waitForFunction(()=>{const im=document.querySelector('.dcbpv-article img');return im?.naturalWidth>0 && im.getClientRects().length && getComputedStyle(im).visibility==='visible'});
  assert.equal(await page.evaluate(()=>Object.keys(local.dcbImageBlockRecords).length),1);
  await page.evaluate(()=>{
    const body=document.querySelector('.dcbpv-article');
    body.innerHTML='<p>다시 그린 본문</p><img src="/picture.svg">';
    document.dispatchEvent(new CustomEvent('dcb-preview-content',{detail:{root:body}}));
  });
  await page.waitForFunction(()=>document.querySelector('.dcbpv-article [data-ibx-peek="1"] img')?.getClientRects().length);
  await page.screenshot({path:'test-results/layout-1112/'+engine+'-revealed.png'});
  await page.evaluate(()=>{closeFixture();change({dcbShowWriterActivity:false})});
  await page.waitForFunction(()=>!document.querySelector('.dcb-activity-badge'));
});
