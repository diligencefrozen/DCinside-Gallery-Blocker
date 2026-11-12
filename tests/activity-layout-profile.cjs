const fs=require('node:fs'),path=require('node:path');
const {chromium,firefox}=require('playwright');
const [root,out]=process.argv.slice(2);
(async()=>{
 const report=[];
 for(const [engine,type] of Object.entries({chromium,firefox})){
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});
  try{
   for(const n of [50,500,2000])for(const mode of ['display','keyword','image','combined']){
    const page=await browser.newPage();
    await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
    await page.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1');
    await page.evaluate(({n,mode})=>{
      const writer='<span class="gall_writer" data-uid="fixtureuser"><span class="nickname">작성자</span><i class="writer_nikcon"></i></span>';
      document.body.innerHTML='<table class="gall_list"><tbody>'+Array.from({length:100},(_,i)=>'<tr class="ub-content"><td class="gall_tit ub-word"><a href="/board/view/?id=fixture&no='+i+'">'+(i%10?'글 제목':'접을 제목')+'</a></td><td>'+writer+'</td></tr>').join('')+'</tbody></table><div class="write_div"><img width="48" height="32" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E"></div><ul class="cmt_list">'+Array.from({length:n},(_,i)=>'<li class="ub-content" id="comment_li_'+i+'"><div class="cmt_info">'+writer+'<div class="cmt_txtbox"><p class="usertxt">'+(i%10?'일반 댓글':'접을 댓글')+'</p></div><span class="fr">18:30</span></div></li>').join('')+'</ul>';
      const all=mode==='combined',sync={keywordHideEnabled:all||mode==='keyword',hiddenKeywords:['접을'],dcbImageBlockConfig:{enabled:all||mode==='image'},dcbImageAccountRules:{enabled:all},dcbShowWriterActivity:all||mode==='display',galleryBlockEnabled:false};
      const listeners=[],get=store=>async(keys,cb)=>{const d={...keys,...store};cb?.(d);return d};
      window.calls=0;document.cookie='ci_c=fixture';window.chrome={storage:{onChanged:{addListener:f=>listeners.push(f)},sync:{get:get(sync)},local:{get:get({}),set:async()=>{}}},runtime:{onMessage:{addListener(){}},sendMessage(m,cb){if(m.type==='dcb.accountSignal'){calls++;cb?.({ok:true,posts:71,comments:83})}else cb?.({ok:false})}}};
      window.DCBRuntimeSettingsCache={get:get(sync),onChanged:chrome.storage.onChanged};
      window.start=performance.now();window.mutations=0;
      new MutationObserver(rs=>mutations+=rs.length).observe(document.body,{subtree:true,attributes:true,childList:true});
    },{n,mode});
    for(const f of ['shared/dom-mutation-bus','shared/keyword-matcher','content/list/list-filter','content/keyword/keyword-hider','content/image/image-account-filter','content/user/account-activity-blocker','content/image/image-blocker'])await page.addScriptTag({path:path.resolve(root,'src/'+f+'.js')});
    const row=await page.evaluate(async()=>{
      const frames=[];let response,previous=performance.now();
      await new Promise(resolve=>requestAnimationFrame(function tick(now){response??=now-start;frames.push(now-previous);previous=now;scrollBy(0,20);if(frames.length<45)requestAnimationFrame(tick);else resolve()}));
      frames.sort((a,b)=>a-b);return {firstFrameMs:Math.round(response),p95:Math.round(frames[42]),mutations,activityRequests:calls};
    });
    report.push({engine,n,mode,...row});await page.close();fs.writeFileSync(out,JSON.stringify(report,null,2));
   }
  }finally{await browser.close()}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
