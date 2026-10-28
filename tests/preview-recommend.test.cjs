// All network traffic is intercepted. No real recommendation is sent.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const content=fs.readFileSync(path.join(root,'src/content/core/content_script.js'),'utf8');
const backend=fs.readFileSync(path.join(root,'src/background/preview-vote.js'),'utf8');
const preview=content.slice(content.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/, 'window.recommendTest={renderPreview,updatePreviewComments,closePreview,cache,previewCacheKey};})();');
const origin='https://gall.dcinside.com';
const typeOf=url=>url.includes('/mgallery/')?'M':url.includes('/mini/')?'MI':url.includes('/person/')?'PR':'G';
function native(url,config){
  const no=new URL(url).searchParams.get('no'),type=typeOf(url);
  return `<!doctype html><meta charset="utf-8"><input id="id" value="fixture"><input id="no" value="${no}">
    <form id="_view_form_"><input name="gallery_id" value="fixture"><input name="gallery_id" value="fixture">
    <input id="e_s_n_o" name="e_s_n_o" value="fixture-hidden-secret"><input id="_GALLTYPE_" name="_GALLTYPE_" value="${type}">
    <input name="is_login" value="${config.login?'Y':'N'}"><input name="fixture_proof" value="fixture-proof-secret"></form>
    <textarea id="draft">comment draft</textarea><input id="password" type="password" value="fixture-password-secret">
    <button class="btn_recom_up" data-no="${no}">추천</button>${config.noDown?'':`<button class="btn_recom_down" data-no="${no}">비추천</button>`}
    <input id="recommend_code_use_yn_${no}" value="${config.policy?'Y':'N'}" data-use-type="${config.policy||''}">
    ${config.image===false?'':`<img class="kcaptcha" id="kcaptcha_recommend_${no}" data-type="recommend" data-gall_id="fixture" data-gall_type="${type}">`}
    <span id="recommend_view_up_${no}">19</span><span id="recommend_view_up_fix_${no}">5</span><span id="recommend_view_down_${no}">4</span>
    <script>var mem_allow=${config.member===false?0:1};</script>`;
}

(async()=>{
  let listener,executions=0;
  const sandbox={URL,chrome:{runtime:{id:'extension',onMessage:{addListener:fn=>listener=fn}},scripting:{executeScript:async()=>{executions++;return [{result:{ok:true}}];}}}};
  vm.runInNewContext(backend,sandbox);
  const valid={type:'dcb.previewVote',operation:'prepare',url:origin+'/board/view/?id=fixture&no=1',key:'12345678-1234-1234-1234-123456789abc'};
  const sender={id:'extension',frameId:0,tab:{id:4},url:origin+'/board/lists/?id=fixture'};
  for(const [message,source] of [[{...valid,operation:'submit'},sender],[valid,{...sender,id:'other'}],[valid,{...sender,frameId:1}],[valid,{...sender,url:'https://example.com'}],[{...valid,url:origin+'/board/recommend/vote'},sender],[{...valid,url:'https://evil.example/board/view/?id=fixture&no=1'},sender],[{...valid,key:'bad'},sender]]){
    assert.equal(await new Promise(resolve=>listener(message,source,resolve)).then(r=>r.ok),false);
  }
  assert.equal(executions,0);assert.equal((await new Promise(resolve=>listener(valid,sender,resolve))).ok,true);assert.equal(executions,1);

  const browser=await chromium.launch({headless:true});
  let checks=1;
  try{
    const page=await browser.newPage();page.setDefaultTimeout(6000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let config={},writes=[],reads=0,images=[],sequence=100,reply='success',postDelay=0,getDelay=0;
    await page.context().addCookies([{name:'ci_c',value:'fixture-cookie-secret',url:origin}]);
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()==='POST'){
        assert.equal(url.pathname,'/board/recommend/vote');
        const fields=new URLSearchParams(request.postData());writes.push({fields,headers:request.headers()});
        const response=reply,delay=postDelay;if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
        if(response==='disconnect')return route.abort();
        if(/^\d+$/.test(response))return route.fulfill({status:Number(response),body:'restricted'});
        return route.fulfill({body:response==='success'?(fields.get('mode')==='U'?'true||12||3||true':'true||2||false'):response});
      }
      if(url.pathname.startsWith('/kcaptcha/')){images.push(url);return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="130" height="40"><text y="20">fixture</text></svg>'});}
      if(url.pathname==='/board/poll/vote')return route.fulfill({contentType:'text/html',body:'<!doctype html><button id="poll-native">투표하기</button><script>document.body.dataset.ready="1"</script>'});
      if(url.pathname.endsWith('/view/')){
        if(request.resourceType()==='fetch'){reads++;if(getDelay)await new Promise(resolve=>setTimeout(resolve,getDelay));}
        return route.fulfill({contentType:'text/html',body:config.fallback&&request.resourceType()==='document'?'<html><body></body></html>':native(url.href,config)});
      }
      return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><button>origin</button></body></html>'});
    });
    await page.goto(origin+'/board/lists/?id=fixture');
    await page.evaluate(()=>{
      window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;window.rpc=[];window.events=[];
      window.chrome={runtime:{id:'extension',lastError:null,onMessage:{addListener(){}},sendMessage(message,done){window.rpc.push(message);if(message.type==='dcb.previewVote')done(window.preparePreviewVote(message));else done({ok:false});}},storage:{sync:{get:(defaults,done)=>done(defaults)},local:{get:(defaults,done)=>done(defaults)},onChanged:{addListener(){}}}};
      window.addEventListener('message',event=>{if(event.data?.type==='dcb.previewVote.event')window.events.push(event.data);});
    });
    await page.addScriptTag({content:backend});await page.addScriptTag({content:preview});
    const up=()=>page.locator('[data-act=vote-up]'),down=()=>page.locator('[data-act=vote-down]');
    const status=()=>page.locator('.dcbpv-recommend-status');
    const finish=async text=>{await status().filter({hasText:text}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-act=vote-up]')?.getAttribute('aria-busy')==='false');};
    const close=()=>page.evaluate(()=>window.recommendTest.closePreview());
    const render=async (options={},prefix='',url=null)=>{
      await close();config=options;writes=[];reads=0;images=[];reply='success';postDelay=0;getDelay=0;
      url ||= `${origin}/${prefix}board/view/?id=fixture&no=${++sequence}`;
      await page.evaluate(url=>{
        window.fixture={url,fetchedUrl:url,title:'fixture',writerHTML:'',articleHTML:'<p>body</p>',counts:{up:'7',upMember:'1',down:'0'},commentTitle:'댓글',commentsHTML:'<div class="dcbpv-comment-list"></div>'};
        window.recommendTest.cache.set(window.recommendTest.previewCacheKey(url),window.fixture);
        window.recommendTest.renderPreview(window.fixture);
      },url);
      await page.waitForFunction(()=>document.querySelector('[data-act=vote-up]')?.getAttribute('aria-busy')==='false');
      await page.waitForFunction(()=>document.querySelector('iframe[data-dcbpv-compose-frame]')?.contentDocument?.readyState==='complete');
      return url;
    };
    const confirm=()=>page.locator('.dcbpv-recommend-auth button').filter({hasText:/^(비)?추천$/});
    const code=()=>page.locator('.dcbpv-recommend-auth input');
    const challenge=async()=>{await code().waitFor();await page.waitForFunction(()=>{const i=document.querySelector('.dcbpv-recommend-auth img');return i?.complete&&i.naturalWidth>0;});};

    for(const prefix of ['', 'mgallery/', 'mini/', 'person/'])for(const login of [false,true]){
      const url=await render({login},prefix),frames=page.frames().length;
      assert.equal(reads,0,'preparation adds no article GET');
      await up().press('Enter');await finish('추천 완료');
      assert.equal(writes.length,1);assert.equal(reads,0,'reuse existing comment document');
      const {fields,headers}=writes[0];assert.equal(fields.get('mode'),'U');assert.equal(fields.get('no'),new URL(url).searchParams.get('no'));
      assert.deepEqual(fields.getAll('gallery_id'),['fixture','fixture']);assert.deepEqual(fields.getAll('_GALLTYPE_'),[typeOf(url),typeOf(url)]);
      for(const [key,value] of Object.entries({ci_t:'fixture-cookie-secret',e_s_n_o:'fixture-hidden-secret',fixture_proof:'fixture-proof-secret',id:'fixture',link_id:'fixture',code_recommend:'',is_login:login?'Y':'N'}))assert.equal(fields.get(key),value);
      assert.equal(headers.referer,url);assert.equal(headers['x-requested-with'],'XMLHttpRequest');
      assert.equal(await page.locator('.dcbpv-vote-up').textContent(),'12');assert.equal(await page.locator('.dcbpv-vote-member').textContent(),'(3)');
      await down().press('Space');await finish('비추천 완료');assert.equal(writes.length,2);assert.equal(writes[1].fields.get('mode'),'D');
      assert.equal(await page.locator('.dcbpv-vote-down').textContent(),'2');assert.equal(await page.locator('.dcbpv-vote-member').textContent(),'(3)');
      assert.equal(page.frames().length,frames);assert.equal(await page.locator('.dcbpv-vote-panel,iframe[data-dcbpv-vote-frame]').count(),0);
      assert.deepEqual(await page.evaluate(()=>{const d=document.querySelector('iframe[data-dcbpv-compose-frame]').contentDocument;return [d.querySelector('#draft').value,d.querySelector('#password').value];}),['comment draft','fixture-password-secret']);
      assert.equal(await page.evaluate(()=>window.recommendTest.cache.has(window.recommendTest.previewCacheKey(window.fixture.url))),false);
      await page.evaluate(()=>window.recommendTest.renderPreview({...window.fixture,counts:{up:'7',upMember:'1',down:'0'}}));
      assert.equal(await page.locator('.dcbpv-vote-up').textContent(),'12','stale refresh cannot undo confirmed count');checks++;
    }

    await render({fallback:true});await up().click();await finish('추천 완료');assert.equal(reads,1);assert.equal(writes.length,1);checks++;
    await render();await up().evaluate(button=>button.click());assert.equal(writes.length,0,'synthetic click cannot submit');
    postDelay=200;await up().dblclick({force:true});await finish('추천 완료');assert.equal(writes.length,1);
    await page.evaluate(()=>window.preparePreviewVote({url:window.fixture.url,key:document.querySelector('.dcbpv-vote').dataset.recommendKey}));
    assert.equal(await up().isDisabled(),true,'re-prepare/background restart preserves guard');checks++;

    for(const policy of ['all','recommend','non_recommend'])for(const mode of ['U','D']){
      await render({policy});await (mode==='U'?up():down()).click();
      const required=policy==='all'||policy===(mode==='U'?'recommend':'non_recommend');
      if(!required){await finish(mode==='U'?'추천 완료':'비추천 완료');assert.equal(writes.length,1);assert.equal(await code().count(),0);}
      else{
        await challenge();assert.equal(writes.length,0);assert.equal(images.at(-1).searchParams.get('kcaptcha_type'),'recommend');
        await code().fill('wrong-secret');reply='false||코드를 확인해 주세요.';await confirm().click();await finish('코드가 맞지 않습니다');await challenge();
        assert.equal(writes.length,1);assert.equal(await code().inputValue(),'');const before=images.length;
        await page.locator('.dcbpv-recommend-auth button').filter({hasText:'새로고침'}).click();await page.waitForFunction(()=>document.querySelector('.dcbpv-recommend-auth img')?.complete);assert.ok(images.length>before);assert.equal(writes.length,1);
        reply='success';await code().fill('correct-secret');await confirm().click();await finish(mode==='U'?'추천 완료':'비추천 완료');
        assert.equal(writes.length,2);assert.equal(writes[1].fields.get('code_recommend'),'correct-secret');assert.equal(writes[1].fields.get('mode'),mode);assert.equal(await code().count(),0);
      }checks++;
    }
    await render({policy:'all'});await up().click();await challenge();await code().fill('old-direction');await down().click();await challenge();assert.equal(await code().inputValue(),'');assert.equal(await confirm().textContent(),'비추천');assert.equal(writes.length,0);checks++;
    await render({policy:'all'});await up().click();await challenge();await code().fill('expired-secret');
    await page.evaluate(()=>{window.originalNow=Date.now;Date.now=()=>window.originalNow()+121000;});
    await confirm().click();await finish('코드를 새로 확인');assert.equal(writes.length,0);assert.equal(await code().inputValue(),'');
    await page.evaluate(()=>{Date.now=window.originalNow;});await close();assert.equal(await code().count(),0);checks++;
    await render();reply='false||코드를 입력해 주세요.';await up().click();await challenge();assert.equal(writes.length,1);checks++;
    for(const options of [{member:false},{policy:'all',image:false},{policy:'unknown'}]){
      await render(options);await up().click();await finish(options.member===false?'멤버만':'인증을 원문');assert.equal(writes.length,0);assert.equal(await status().locator('a').count(),1);checks++;
    }
    await render({noDown:true});await down().click();await finish('확인하지 못했습니다');assert.equal(writes.length,0);checks++;
    for(const response of ['false||이미 추천했습니다.','false||nomember','false||CAPTCHA 인증 필요','403','429','503','disconnect','<html>challenge</html>']){
      await render();reply=response;await up().click();await finish(response.startsWith('false')?(response.includes('nomember')?'비회원':response.includes('CAPTCHA')?'CAPTCHA':'이미 추천'): /^\d/.test(response)?'HTTP':'확인하지 못했습니다');
      assert.equal(writes.length,1);assert.equal(await up().isDisabled(),true);assert.doesNotMatch(await status().textContent(),/완료/);
      assert.equal(await page.locator('.dcbpv-vote-up').textContent(),response.startsWith('<')?'19':'7');checks++;
    }
    await render();postDelay=200;
    await page.evaluate(()=>{window.originalTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.originalTimeout(fn,ms===20000?50:ms,...args);});
    await up().click();await finish('확인하지 못했습니다');assert.equal(writes.length,1);assert.equal(await up().isDisabled(),true);
    await page.evaluate(()=>{window.setTimeout=window.originalTimeout;});await page.waitForTimeout(250);assert.equal(writes.length,1);checks++;
    await render({fallback:true});getDelay=250;await up().click();await close();await page.waitForTimeout(300);assert.equal(writes.length,0,'closing during GET prevents POST');checks++;
    await render();await page.evaluate(()=>document.querySelector('.dcbpv-article').dataset.dcbpvFiltered='1');await up().click();assert.equal(writes.length,0,'blocked article cannot submit');checks++;
    const old=await render();postDelay=250;await up().click();await page.waitForFunction(()=>document.querySelector('[data-act=vote-up]').disabled);
    await page.waitForTimeout(30);assert.equal(writes.length,1);await render();await page.waitForTimeout(300);assert.equal(await page.locator('.dcbpv-vote-up').textContent(),'7','late old response cannot update new article');
    await render({},'',old);assert.equal(await up().isDisabled(),true,'uncertain POST cannot be repeated after reopening');checks++;
    assert.match(await status().textContent(),/확인하지 못했습니다/,'reopening preserves the reason for disabling');

    for(const width of [360,540,1100])for(const dark of [false,true]){
      await page.setViewportSize({width,height:850});await page.emulateMedia({colorScheme:dark?'dark':'light'});await render({policy:'all'});
      await up().click();await challenge();const bounds=await page.locator('.dcbpv-recommend-auth').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth,right:el.getBoundingClientRect().right}));
      assert.ok(bounds.scroll<=bounds.width+1&&bounds.right<=width,JSON.stringify(bounds));checks++;
    }
    await render();await page.evaluate(()=>window.recommendTest.renderPreview({...window.fixture,articleHTML:'<iframe name="pollFrame" width="459" height="437" src="https://gall.dcinside.com/board/poll/vote?no=2337944"></iframe>'}));
    await page.waitForFunction(()=>document.querySelector('iframe.dcbpv-poll-frame')?.contentDocument?.body?.dataset.ready==='1');
    assert.equal(await page.frameLocator('iframe.dcbpv-poll-frame').locator('#poll-native').textContent(),'투표하기');assert.equal(writes.length,0);checks++;
    const serialized=await page.evaluate(()=>JSON.stringify({rpc:window.rpc,events:window.events}));
    assert.doesNotMatch(serialized,/fixture-(cookie|hidden|proof|password)-secret|correct-secret|wrong-secret/);
    assert.deepEqual(errors,[]);console.log(`Recommendation checks passed: ${checks} scenarios (all requests mocked; no live POST).`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
