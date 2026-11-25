const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {chromium,firefox}=require('playwright');
const baseline=process.env.DCB_STARTUP_BASELINE;
const source=baseline?execFileSync('git',['show',baseline+':src/content/core/content_script.js'],{encoding:'utf8',maxBuffer:4*1024*1024}):fs.readFileSync('src/content/core/content_script.js','utf8');
const preview=source.slice(source.indexOf('(function dcBlockPostPreview(){'))
  .replace('function normalizeDcMedia(root, baseUrl){','function normalizeDcMedia(root, baseUrl){if(root.nodeType===9)window.documentMediaVisits+=root.querySelectorAll("img,video,iframe").length;')
  .replace(/\}\)\(\);\s*$/,'window.startupTest={openPreview,closePreview,parseDesktopFallback,parseMobilePreview,previewPerformanceSnapshot,mountCommentPage};})();');
const articleUrl='https://gall.dcinside.com/board/view/?id=fixture&no=17';
const image='https://dcimg.dcinside.com/article-photo.svg';
const nativeHtml=count=>`<!doctype html><html><head><meta property="og:title" content="시작 검사"></head><body>
  <div class="gallview"><header class="gallview_head"><h3 class="title_subject">시작 검사</h3><span class="gall_writer" data-uid="nativeauthor" data-nick="작성자">작성자</span></header>
  <div class="write_div"><p>먼저 읽을 본문입니다.</p><img src="${image}" width="600" height="300"><p style="height:2400px">${'긴 본문 '.repeat(1200)}</p><img data-original="${image}?lower" src="/blank.gif"><script>throw Error('article script')</script></div>
  <div id="comment_wrap_17" class="comment_wrap" data-article-no="17"><div class="comment_count">전체 댓글 <span id="comment_total_17">${count+200}</span>개</div><ul class="cmt_list">${Array.from({length:count},(_,i)=>`<li id="comment_li_${i+1}"><div class="cmt_info" data-no="${i+1}"><span class="gall_writer" data-uid="member${i}" data-nick="회원">회원</span><p class="usertxt">댓글 ${i}<img class="written_dccon" src="https://dcimg.dcinside.com/dccon.php?no=${i}"></p></div></li>`).join('')}</ul></div></div>
  <aside class="right_content">${Array.from({length:count*2},(_,i)=>`<a class="gall_writer" data-uid="sidebar${i}"><img data-original="https://dcimg.dcinside.com/sidebar-${i}.jpg" src="/blank.gif"></a>`).join('')}</aside></body></html>`;
const out='test-results/preview-startup/'+(baseline?'before':'after');fs.mkdirSync(out,{recursive:true});

for(const [engine,type]of Object.entries({chromium,firefox}))test(engine+' first preview paints the article before offscreen comments without losing author or media',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1100,height:760},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#b2c4dc"/></svg>'});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
  });
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  await page.evaluate(()=>{
    window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;window.documentMediaVisits=0;window.reads=0;
    window.startupSettings={userBlockEnabled:false,showMemberIpInfo:false,doryBlockEnabled:false};
    const get=(defaults,cb)=>{const value={...defaults,...startupSettings};cb?.(value);return Promise.resolve(value)};
    window.chrome={storage:{local:{get},sync:{get},onChanged:{addListener(){}}},runtime:{sendMessage(m,cb){
      if(m.type==='dcb.fetchText'){reads++;return setTimeout(()=>cb({ok:true,text:window.nativeFixture,finalUrl:m.url,status:200}),0)}cb?.({ok:false});
    }}};
    window.DCBRuntimeSettingsCache={get,onChanged:chrome.storage.onChanged};
  });
  await page.addScriptTag({content:preview});
  const samples=[];
  for(let sample=0;sample<(process.env.DCB_STARTUP_PROFILE?5:1);sample++){
    const result=await page.evaluate(async({html,url,sample})=>{
      window.nativeFixture=html;documentMediaVisits=0;reads=0;
      const tasks=[],observer=typeof PerformanceObserver==='function'?new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration))):null;
      try{observer?.observe({type:'longtask'})}catch{}
      const started=performance.now();let firstPaint=0;
      const coldUrl=new URL(url);coldUrl.searchParams.set('no',String(17+sample));
      void startupTest.openPreview(coldUrl.href);
      while(!firstPaint){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const article=document.querySelector('.dcbpv-article');
        if(article&&!article.hasAttribute('data-dcbpv-filter-pending')&&getComputedStyle(article).opacity!=='0')firstPaint=performance.now()-started;
      }
      const article=document.querySelector('.dcbpv-article'),photos=article.querySelectorAll('img');
      const value={sample,firstArticleFrameMs:+firstPaint.toFixed(2),documentMediaVisits,reads,commentsMounted:document.querySelectorAll('.dcbpv-comment-item').length,
        author:document.querySelector('.dcbpv-writer').textContent,body:article.textContent.includes('먼저 읽을 본문'),unsafe:article.querySelectorAll('script,[onclick],[onerror]').length,
        photo:photos[0]?.src,firstLoading:photos[0]?.loading,lowerLoading:[...photos].at(-1)?.loading,trace:startupTest.previewPerformanceSnapshot().currentTrace};
      startupTest.closePreview();await new Promise(resolve=>setTimeout(resolve,0));observer?.disconnect();value.longTaskMaxMs=+Math.max(0,...tasks).toFixed(2);return value;
    },{html:nativeHtml(500),url:articleUrl,sample});
    assert.equal(result.reads,1);assert.equal(result.commentsMounted,0,'offscreen comments must not block first article paint');
    assert.match(result.author,/작성자/);assert.equal(result.body,true);assert.equal(result.unsafe,0);assert.equal(result.photo,image);
    assert.equal(result.firstLoading,'eager');assert.equal(result.lowerLoading,'lazy');samples.push(result);
  }
  const parse=await page.evaluate(({html,url})=>{
    const result=startupTest.parseDesktopFallback(html,url);
    return{author:result.writerHTML,comments:result.commentsHTML,article:result.articleHTML,commentTotal:result.commentTotal};
  },{html:nativeHtml(2),url:articleUrl});
  assert.match(parse.author,/nativeauthor/);assert.match(parse.comments,/dcbpv-dccon/);assert.equal(/<script/.test(parse.article),false);
  if(!baseline){
    assert.equal(parse.commentTotal,202,'native total is independent of the embedded comment subset');
    const totals=await page.evaluate(url=>{
      const read=body=>{const data=startupTest.parseDesktopFallback('<div class="write_div">본문</div>'+body,url);return[data.commentTotal,data.commentTitle]};
      return [read('<div class="comment_wrap" id="comment_wrap_17"><div class="comment_count">전체 댓글 <span id="comment_total_17">0</span>개</div></div>'),
        read('<div class="comment_wrap"><div class="comment_count">전체 댓글 <span id="comment_total_17">1,234</span>개</div></div>'),
        read('<h3 class="title_subject">댓글 999개</h3><div class="comment_wrap" id="comment_wrap_18"><div class="comment_count">전체 댓글 <span id="comment_total_18">72</span>개</div></div>'),
        read('<div id="comment_wrap"><div class="comment_count">전체 댓글 42개</div></div>'),
        read('<div class="comment_wrap"><div class="comment_count">전체 댓글 <span id="comment_total_17">조회 중</span>개</div></div>')];
    },articleUrl);
    assert.deepEqual(totals.map(row=>row[0]),[0,1234,null,42,null]);assert.equal(totals[0][1],'댓글 0개');assert.equal(totals[1][1],'댓글 1,234개');
    const mobile=await page.evaluate(async ({url,html})=>{
      const mobileUrl='https://m.dcinside.com/board/fixture/17';
      const header='<div class="ginfo2"><a class="btn-commentgo" href="#comment_box"><b class="point-red">27</b></a></div>';
      const box='<div id="comment_box"><div class="all-comment-tit"><span class="tit"><i class="ct">[1,234]</i></span></div><input id="reple_totalCnt" value="4"></div>';
      const read=(body,source=mobileUrl)=>startupTest.parseMobilePreview(body,url,source).commentTotal;
      const fallback=startupTest.parseDesktopFallback('<span id="comment_total_17">0</span><form id="_view_form_"><input id="no" value="17"><input id="id" value="fixture"><input id="comment_cnt" value="27"></form>',url);
      reads=0;window.nativeFixture=html.replace('<body>','<body>'+header);
      await startupTest.openPreview(url,{force:true});
      const labels=()=>[document.querySelector('.dcbpv-comments-title').textContent,document.querySelector('.dcbpv-nav-count').textContent];
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const cold=labels();startupTest.closePreview();await startupTest.openPreview(url);
      await new Promise(resolve=>requestAnimationFrame(resolve));const warm=labels();startupTest.closePreview();
      return {counts:[read(header+box),read(box),read(box.replace('[1,234]','?')),read(header.replace('27','0')),read(header,mobileUrl+'8'),read('<input id="no" value="18">'+header)],fallback:fallback.commentTotal,cold,warm,reads};
    },{url:articleUrl,html:nativeHtml(2)});
    assert.deepEqual(mobile,{counts:[27,1234,4,0,null,null],fallback:27,cold:['댓글 27개','27'],warm:['댓글 27개','27'],reads:1});
  }
  // Measure DOM parsing on a cached reopen independently of network and paint.
  const paging=await page.evaluate(({html,url})=>{
    const data=startupTest.parseDesktopFallback(html,url);
    const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
    let parsedRows=0;
    Object.defineProperty(Element.prototype,'innerHTML',{...descriptor,set(value){
      if(this.tagName==='TEMPLATE') parsedRows+=(value.match(/data-dcbpv-comment="1"/g)||[]).length;
      descriptor.set.call(this,value);
    }});
    try {
      const root=document.createElement('div'),times=[];
      // A detached fixture can't auto-page or schedule work between samples.
      for(let i=0;i<6;i++){
        parsedRows=0;
        const start=performance.now();
        startupTest.mountCommentPage(root,data.commentsHTML,root,data,0);
        times.push(performance.now()-start);
      }
      return {parsedRows,mounted:root.querySelectorAll('.dcbpv-comment-item').length,medianMs:times.slice(1).sort((a,b)=>a-b)[2]};
    }finally{Object.defineProperty(Element.prototype,'innerHTML',descriptor);}
  },{url:articleUrl,html:nativeHtml(500)});
  assert.equal(paging.mounted,80);
  if(!baseline)assert.equal(paging.parsedRows,80);
  console.log(JSON.stringify({engine,baseline:baseline||'working',cachedCommentPage:paging}));
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/${engine}${process.env.DCB_STARTUP_PROFILE?'-profile':''}.json`,JSON.stringify(samples,null,2));
  console.log(JSON.stringify({engine,baseline:baseline||'working',samples:samples.map(({sample,firstArticleFrameMs,documentMediaVisits,longTaskMaxMs,trace})=>({sample,firstArticleFrameMs,documentMediaVisits,longTaskMaxMs,parseMs:trace?.parseMs,renderMs:trace?.renderMs}))}));
});
