const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(root, 'src/content/core/content_script.js'), 'utf8');
const preview = content.slice(content.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/, `
window.composeTest = {renderPreview, updatePreviewComments, closePreview, commentRecordsToHtml, previewCacheKey, cache, formatPreviewCommentTime};
})();`);
const backend = fs.readFileSync(path.join(root, 'src/background/preview-comment.js'), 'utf8');
const article = (prefix = '', no = '10') => `https://gall.dcinside.com/${prefix}board/view/?id=fixture&no=${no}`;

function nativeDocument(url, member = true, captcha = false, own = false, turnstile = false) {
  const type = url.includes('/mgallery/') ? 'M' : url.includes('/mini/') ? 'MI' : url.includes('/person/') ? 'PR' : 'G';
  const no = new URL(url).searchParams.get('no');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    ${Object.entries({ _GALLTYPE_: type, member_division: member ? 'Y' : 'N', e_s_n_o: 'fixture-read-token',
      cur_t:'fixture-time', check_6:'0', check_7:'0', check_8:'0', check_9:'0', check_10:'0', recommend:'0', c_r_k_x_z:'fixture', kcaptcha_use:captcha?'Y':'N' })
      .map(([id,value])=>`<input id="${id}" value="${value}">`).join('')}
    <li id="comment_li_101"><div class="cmt_info" data-no="101"><div class="btn_reply_write_all">parent</div>${own?'<div class="cmt_mdf_del" data-my="Y" re_no="101"><button class="btn_cmt_delete">삭제</button></div>':''}</div>
      <ul class="reply_list" id="reply_list_101" p-no="101"><li id="reply_li_102"><div class="reply_info" data-no="102"><div class="btn_re_reply_write_all">reply</div></div></li></ul></li>
    <div class="cmt_write_box"><div class="fl">${member ? '' : `<input id="name_${no}" placeholder="닉네임"><input id="password_${no}" type="password">`}</div>
    <div class="cmt_txt_cont"><textarea id="memo_${no}" maxlength="400"></textarea>${captcha?`<div><img class="kcaptcha" data-type="comment" id="kcaptcha_${no}" alt="인증 이미지"><input id="code_${no}" placeholder="자동입력 방지코드"><button type="button" class="btn_kcap_refresh" onclick="kcaptcha_init('${no}')">새 문제</button></div>`:''}<button class="repley_add btn_svc" data-no="${no}">등록</button></div></div>
    <form id="_cmt_del_form_"><input name="fixture_delete_proof" value="fixture-proof"></form><input name="v_cur_t" value="fixture-time">
    <script>
      window.jQuery = () => ({data:key=>({comment_id:'fixture',comment_no:'${no}'})[key]});
      window.dc_rc_key='fixture-rc';
      window.dc_rc_new_v2='fixture-v2';window.dc_rc_new_v3='fixture-v3';
      window.get_cookie=key=>key==='ci_c'?'fixture-csrf':'';
      window.kcaptchaRefreshes=0;
      window.kcaptcha_init=()=>{window.kcaptchaRefreshes++;const image=document.querySelector('.kcaptcha');if(image)image.src='/kcaptcha/image_v3/?gall_id=fixture&kcaptcha_type=comment&time='+window.kcaptchaRefreshes;};
      window.nativeSubmits=0;
      document.addEventListener('click',event=>{if(event.target.matches('.repley_add'))window.nativeSubmits++});
      function secure(button){button.addEventListener('click',event=>{if(window.nativeReject)event.preventDefault();if(event.isTrusted)document.service_code='fixture-live-code';});}
      secure(document.querySelector('.repley_add'));
      if(${turnstile}){
        window._TS_CMT_={mode:2};window.ts_cmt={st:'pending',id:1,box:null};let token='';
        window.ts_pass_left=()=>0;window.turnstile={getResponse:()=>token};
        window.ts_cmt_fields=()=>{const out='&cf-turnstile-response='+token+'&ts_state=ok';token='';window.ts_cmt.st='expired';return out;};
        window.ts_cmt_load=()=>{if(window.ts_cmt.box)return;const box=document.createElement('div');const control=document.createElement('button');control.textContent='사람인지 확인';control.id='fixture-turnstile';control.onclick=()=>{token='fixture-turnstile-token';window.ts_cmt.st='ok';};box.append(control);window.ts_cmt.box=box;const editor=document.querySelector('.cmt_write_box');editor.after(box);window.ts_cmt.st='interactive';};
      }
      window.addReplyForm=(parent,count,type,target)=>{
        const li=document.createElement('li');
        li.innerHTML='<div class="cmt_write_box"><div class="cmt_txt_cont"><textarea id="memo_'+parent+'" maxlength="400"></textarea><button class="repley_add btn_svc" r_idx="'+parent+'" reply_no="'+target+'">등록</button></div></div>';
        document.getElementById('reply_list_'+parent).append(li);secure(li.querySelector('button'));
      };
    </script></body></html>`;
}

(async () => {
  const browser = await chromium.launch({headless:true});
  let checks = 0;
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror',error=>pageErrors.push(error.message));
    let member = true, captcha = false, own=false, turnstile=false, responseMode = 'success', delay = 0;
    let writes = [], records = [], reads = 0, deletes=[];
    const reset = () => { writes=[]; deletes=[];reads=0; records=[{no:'101',c_no:'0',depth:0,name:'송채경',memo:'parent',reg_date:'2026.10.26 21:12:56'}, {no:'102',c_no:'101',depth:1,name:'tester',memo:'reply'}]; responseMode='success';delay=0;member=true;captcha=false;own=false;turnstile=false; };
    reset();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/board/forms/comment_submit') {
        const fields = Object.fromEntries(new URLSearchParams(route.request().postData()));
        writes.push(fields);
        if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
        if (/^\d+$/.test(responseMode)) return route.fulfill({status:Number(responseMode),body:'restricted'});
        if (responseMode === 'reject') return route.fulfill({body:'false||permission denied'});
        if (responseMode === 'captcha') return route.fulfill({body:'false||captcha||v3'});
        if (responseMode === 'captcha-v2') return route.fulfill({body:'false||captcha'});
        if (responseMode === 'unknown') return route.fulfill({body:'<html>login</html>'});
        const id=String(102+writes.length);
        records.push({no:id,c_no:fields.c_no||'0',depth:fields.c_no?1:0,name:fields.name||'member',memo:fields.memo.replace(/&/g,'&amp;').replace(/</g,'&lt;'),reg_date:'2026.10.26 21:13:56'});
        return route.fulfill({body:id});
      }
      if(url.hostname==='www.google.com')return route.fulfill({contentType:'application/javascript',body:`
        window.grecaptcha={ready:f=>f(),execute:async()=> 'fixture-v3-token',render:(host,opts)=>{window.fixtureRecaptchaOptions=opts;const b=document.createElement('button');b.id='fixture-recaptcha';b.textContent='인증 확인';b.onclick=()=>{window.fixtureRecaptchaToken='fixture-v2-token';opts.callback();};host.append(b);return 1;},getResponse:()=>window.fixtureRecaptchaToken||'',reset:()=>{window.fixtureRecaptchaToken='';}};
      `});
      if(url.pathname==='/board/comment/comment_delete_submit'){
        const fields=Object.fromEntries(new URLSearchParams(route.request().postData()));deletes.push(fields);
        if(responseMode==='reject')return route.fulfill({body:'false||wrong password'});
        if(responseMode==='captcha-v2')return route.fulfill({body:'false||captcha'});
        records=records.filter(row=>row.no!==fields.re_no);return route.fulfill({body:'true||deleted'});
      }
      if(url.pathname.startsWith('/kcaptcha/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="110" height="30"><text y="20">fixture</text></svg>'});
      if (url.pathname === '/board/comment/') {reads++; return route.fulfill({json:{comments:records,total_cnt:records.length}});}
      return route.fulfill({contentType:'text/html',body:url.pathname.endsWith('/view/') ? nativeDocument(url.href,member,captcha,own,turnstile) : '<!doctype html><html><head></head><body><button id="origin">origin</button></body></html>'});
    });
    await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
    await page.evaluate(()=>{
      window.previewEnabled=true; window.PREVIEW_COMMENT_DEBUG=false;
      window.chrome={runtime:{id:'fixture-extension',lastError:null,onMessage:{addListener(){}},sendMessage(message,done){
        if(message.type==='dcb.previewComment') window.backendTest.previewCommentInPage(message).then(done);
        else done({ok:false});
      }},storage:{sync:{get:(defaults,done)=>done(defaults)},local:{get:(defaults,done)=>done(defaults)},onChanged:{addListener(){}}}};
    });
    await page.addScriptTag({content:backend+'\nwindow.backendTest={previewCommentInPage,handlePreviewCommentMessage};'});
    await page.addStyleTag({path:path.join(root,'src/content/appearance/writer-layout.css')});
    await page.addScriptTag({path:path.join(root,'src/content/user/writer-layout.js')});
    await page.addScriptTag({content:preview});
    const render = async (url=article()) => page.evaluate(({url,records})=>{
      window.fixtureData={url,fetchedUrl:url,title:'fixture',writerHTML:'',articleHTML:'<p>body</p>',counts:{up:'0',down:'0'},commentTitle:'댓글 2개',commentsHTML:window.composeTest.commentRecordsToHtml(records,url)};
      window.composeTest.renderPreview(window.fixtureData);
    },{url,records});
    const open = async () => {await page.locator('.dcbpv-composer iframe').waitFor({state:'visible'}); await page.waitForFunction(()=>document.querySelector('.dcbpv-composer iframe')?.style.visibility==='visible');};
    const editor = () => page.frameLocator('iframe[data-dcbpv-compose-frame]');
    const finish = async text => page.locator('.dcbpv-composer [role="status"]').filter({hasText:text}).waitFor();
    const close = async () => page.evaluate(()=>window.composeTest.closePreview());

    for (const prefix of ['', 'mgallery/', 'mini/', 'person/']) {
      reset(); await render(article(prefix)); await open();
      assert.equal(await page.locator('[data-act=compose]').getAttribute('aria-expanded'),'true');
      assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BUTTON','default opening does not steal focus into the iframe');
      assert.equal(await page.locator('.dcbpv-scroll').evaluate(el=>el.scrollTop),0,'default opening does not jump to comments');
      assert.equal(await page.locator('.dcbpv-time').first().textContent(),'2026.10.26 PM 09:12:56');
      await editor().locator('textarea').fill('<img src=x onerror=alert(1)> test');
      await editor().locator('.repley_add').click();
      await finish('등록된 댓글을 확인');
      assert.equal(writes.length,1); assert.equal(reads,2);
      assert.equal(writes[0]._GALLTYPE_,{'':'G','mgallery/':'M','mini/':'MI','person/':'PR'}[prefix]);
      assert.equal(writes[0].service_code,'fixture-live-code');
      assert.equal(await page.locator('.dcbpv-comments-title').textContent(),'댓글 3개');
      assert.equal(await page.locator('.dcbpv-comment-html img[src="x"]').count(),0);
      assert.equal(await editor().locator('body').evaluate(()=>window.nativeSubmits),0,'native retry/password-saving handler never runs');
      await close(); checks++;
    }

    for (const target of ['101','102']) {
      reset(); await render(); await open();
      await editor().locator('textarea').fill('general draft');
      const originalFrame=page.frames().find(f=>f.url().includes('no=10'));
      await page.locator(`[data-dcbpv-native-id="${target}"] .dcbpv-comment-body`).click();
      await page.waitForFunction(()=>document.querySelector('.dcbpv-composer iframe')?.style.visibility==='visible');
      assert.equal(page.frames().find(f=>f.url().includes('no=10')),originalFrame,'reply selection keeps native form/security state');
      await editor().locator('#memo_10').fill('target draft');
      await page.locator('[data-act=compose-reply-cancel]').click();
      assert.equal(await editor().locator('#memo_10').inputValue(),'general draft');
      await page.locator(`[data-act="compose-reply"][data-target="${target}"]`).click();
      assert.equal(await editor().locator('#memo_10').inputValue(),'target draft');
      await editor().locator('#memo_10').fill('reply text');
      await editor().locator('.repley_add').click();
      await finish('등록된 댓글을 확인');
      assert.equal(writes[0].c_no,'101'); assert.equal(writes[0].reply_no,target);
      await close(); checks++;
    }

    reset(); member=false; await render(); await open();
    await editor().locator('#name_10').fill('guest');
    await editor().locator('#password_10').fill('fixture-password');
    await editor().locator('textarea').fill('guest comment');
    await editor().locator('.repley_add').click(); await finish('등록된 댓글을 확인');
    assert.equal(writes[0].name,'guest');assert.equal(writes[0].password,'fixture-password');
    assert.equal(await editor().locator('#password_10').inputValue(),'fixture-password');
    assert.equal(await editor().locator('textarea').inputValue(),'');
    await editor().locator('textarea').fill('second comment');await editor().locator('.repley_add').click();
    await page.waitForFunction(()=>document.querySelector('.dcbpv-comments-title').textContent==='댓글 4개');
    assert.equal(writes.length,2);assert.equal(writes[1].password,'fixture-password');
    assert.equal(await page.locator('[data-act=compose-delete]').count(),2);
    await page.locator('[data-act=compose-delete][data-target="103"]').click();
    assert.equal(deletes.length,0,'opening confirmation never deletes');
    responseMode='reject';
    await editor().locator('[data-dcbpv-delete-confirm]').click();await finish('삭제하지 못했습니다');
    assert.equal(await page.locator('[data-dcbpv-native-id="103"]').count(),1,'failed delete leaves comment visible');
    responseMode='success';
    await editor().locator('[data-dcbpv-delete-confirm]').click();await finish('댓글을 삭제');
    assert.equal(deletes.length,2);assert.equal(deletes[0].re_password,'fixture-password');
    assert.equal(await page.locator('[data-dcbpv-native-id="103"]').count(),0);
    await close();await render();await open();
    assert.equal(await editor().locator('#password_10').inputValue(),'','closing ends the credential session');
    assert.equal(await page.locator('[data-act=compose-delete]').count(),0,'guest ownership is never inferred in a new preview session');
    await close();checks++;

    for (const [index,mode] of ['reject','captcha','403','429','503','unknown'].entries()) {
      reset(); responseMode=mode; await render(article('', String(50+index))); await open();
      await editor().locator('textarea').fill('preserved draft');
      await editor().locator('.repley_add').click();
      await page.waitForFunction(()=>{const text=document.querySelector('.dcbpv-composer [role="status"]').textContent;return !!text && !/전송 중|작성 폼을 확인하는 중/.test(text)});
      assert.equal(writes.length,1); assert.equal(await editor().locator('textarea').inputValue(),'preserved draft');
      assert.doesNotMatch(await page.locator('.dcbpv-composer [role="status"]').textContent(),/등록된 댓글을 확인/);
      assert.equal(await page.locator('.dcbpv-comments-title').textContent(),'댓글 2개');
      await close();
      if (mode === 'unknown') {
        await render(article('', String(50+index)));
        await page.locator('.dcbpv-saved-draft').waitFor();
        assert.equal(await page.locator('.dcbpv-saved-draft').inputValue(),'preserved draft');
        assert.equal(writes.length,1,'an uncertain result cannot silently be resubmitted after reopening');
        await close();
      }
      checks++;
    }

    reset(); await render(article('', '20')); await open();
    await editor().locator('textarea').fill('keep during refresh');
    for (const width of [360,540,1100]) {
      await page.setViewportSize({width,height:820});
      assert.equal(await page.locator('.dcbpv-composer').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,`${width}px composer fits`);
      await page.waitForFunction(()=>document.querySelector('.dcbpv-composer iframe').clientHeight<300);
      assert.equal(await editor().locator('html').evaluate(el=>el.scrollHeight<=innerHeight+1),true,'no nested scroll or hidden article blank space');
      assert.equal(await page.locator('.dcbpv-comment-item').first().evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'nickname/time/actions stay inside the comment');
      assert.equal(await page.locator('.dcbpv-comment-item').first().locator('.nickname').textContent(),'송채경');
    }
    await page.screenshot({path:path.join(root,'test-results/preview-compose-fixture.png')});
    const frameBefore=page.frames().find(f=>f.url().includes('no=20'));
    await page.evaluate(()=>{window.composeTest.updatePreviewComments(window.fixtureData); window.composeTest.renderPreview(window.fixtureData);});
    assert.equal(page.frames().find(f=>f.url().includes('no=20')),frameBefore);
    assert.equal(await editor().locator('textarea').inputValue(),'keep during refresh');
    await editor().locator('.repley_add').evaluate(button=>button.click());
    assert.equal(writes.length,0,'synthetic click never submits');
    await page.locator('[data-act="compose-cancel"]').click();
    await page.evaluate(()=>window.composeTest.renderPreview(window.fixtureData));
    assert.equal(await page.locator('[data-act=compose]').getAttribute('aria-expanded'),'false');
    await page.locator('[data-act=compose]').click();await open();
    assert.equal(await editor().locator('textarea').inputValue(),'keep during refresh');
    await editor().locator('textarea').press('Escape');
    await page.locator('#dcb-preview-overlay').waitFor({state:'detached'});
    await close(); checks++;

    reset();await render(article('', '21'));await open();
    await editor().locator('textarea').fill('native guard');
    await editor().locator('body').evaluate(()=>{window.nativeReject=true});
    await editor().locator('.repley_add').click();await finish('인증 영역');
    assert.equal(writes.length,0,'native security rejection is respected even if an old code exists');await close();checks++;

    reset();captcha=true;await render(article('', '22'));await open();
    await editor().locator('textarea').fill('captcha comment');await editor().locator('.repley_add').click();await finish('자동입력 방지');
    assert.equal(writes.length,0);
    await editor().locator('.btn_kcap_refresh').click();await editor().locator('#code_22').fill('fixture-answer');
    await editor().locator('.repley_add').click();await finish('등록된 댓글을 확인');
    assert.equal(writes[0].code,'fixture-answer');assert.equal(await editor().locator('#code_22').inputValue(),'');await close();checks++;

    for(const [number,mode] of ['captcha-v2','captcha'].entries()){
      reset();responseMode=mode;await render(article('',String(70+number)));await open();
      await editor().locator('textarea').fill('captcha retry');await editor().locator('.repley_add').click();
      if(mode==='captcha-v2'){
        await editor().locator('#fixture-recaptcha').click();
        await finish('인증 완료');
        assert.equal(await page.locator('.dcbpv-composer [role="status"]').textContent(),'인증 완료');
        assert.equal(writes.length,1,'solving CAPTCHA never automatically re-posts');
        await editor().locator('body').evaluate(()=>window.fixtureRecaptchaOptions['expired-callback']());await finish('만료');
        await editor().locator('#fixture-recaptcha').click();
      }else await finish('추가 인증');
      responseMode='success';await editor().locator('.repley_add').click();await finish('등록된 댓글을 확인');
      assert.equal(writes.length,2);assert.equal(writes[1][mode==='captcha-v2'?'g-recaptcha-response':'g-recaptcha-token'],mode==='captcha-v2'?'fixture-v2-token':'fixture-v3-token');
      await close();checks++;
    }

    reset();turnstile=true;await render(article('','72'));await open();
    await editor().locator('textarea').fill('turnstile');await editor().locator('.repley_add').click();
    assert.equal(writes.length,0);await editor().locator('#fixture-turnstile').click();assert.equal(writes.length,0);
    await finish('인증 완료');
    assert.equal(await page.locator('.dcbpv-composer [role="status"]').textContent(),'인증 완료');
    await editor().locator('.repley_add').click();await finish('등록된 댓글을 확인');
    assert.equal(writes.length,1);assert.equal(writes[0]['cf-turnstile-response'],'fixture-turnstile-token');await close();checks++;

    reset();own=true;records[0].my_cmt='Y';records[0].del_btn='Y';await render(article('','73'));await open();
    assert.equal(await page.locator('[data-act=compose-delete]').count(),1);
    await editor().locator('textarea').fill('draft while deleting');
    await page.locator('[data-act=compose-delete]').click();await editor().locator('[data-dcbpv-delete-confirm]').click();await finish('댓글을 삭제');
    assert.equal(deletes.length,1);assert.equal(deletes[0].re_password,undefined);assert.equal(deletes[0].ci_t,'fixture-csrf');
    assert.equal(await editor().locator('textarea').inputValue(),'draft while deleting');await close();checks++;

    reset();own=true;records[0].my_cmt='Y';records[0].del_btn='Y';await render(article('','74'));await open();
    responseMode='captcha-v2';
    await page.locator('[data-act=compose-delete][data-target="101"]').click();
    await editor().locator('[data-dcbpv-delete-confirm]').click();
    await editor().locator('#fixture-recaptcha').click();
    assert.equal(deletes.length,1,'solving deletion CAPTCHA never resubmits');
    await finish('인증 완료');
    assert.equal(await page.locator('.dcbpv-composer [role="status"]').textContent(),'인증 완료');
    assert.equal(await page.locator('[data-dcbpv-native-id="101"]').count(),1);
    responseMode='success';await editor().locator('[data-dcbpv-delete-confirm]').click();await finish('댓글을 삭제');
    assert.equal(deletes.length,2);assert.equal(deletes[1]['g-recaptcha-response'],'fixture-v2-token');
    await close();checks++;

    reset();await render(article('','75'));await open();
    await editor().locator('body').evaluate(body=>{
      body.querySelector('#comment_li_101').remove();
    });
    await page.waitForTimeout(60);
    await page.locator('[data-act=compose-reply][data-target="101"]').click();await finish('대상');
    await editor().locator('body').evaluate(body=>{
      const row=document.createElement('div');row.className='cmt_info';row.dataset.no='101';
      row.innerHTML='<button class="btn_reply_write_all">답글</button><span class="date_time" title="2026.10.26 23:59:59">23:59</span>';
      body.append(row);
    });
    await page.waitForFunction(()=>document.querySelector('.dcbpv-time').textContent==='2026.10.26 PM 11:59:59');
    await page.locator('[data-act=compose-reply][data-target="101"]').click();
    await editor().locator('textarea').fill('late native comment');await editor().locator('.repley_add').click();await finish('등록된 댓글을 확인');
    assert.equal(writes[0].c_no,'101');assert.equal(writes[0].reply_no,'101');await close();checks++;

    reset(); delay=350;await render(article('', '30'));await open();
    await editor().locator('textarea').fill('once');
    await editor().locator('.repley_add').dblclick();await finish('등록된 댓글을 확인');
    assert.equal(writes.length,1);await close();checks++;

    reset();delay=400;await render(article('', '40'));await open();
    await editor().locator('textarea').fill('late response');await editor().locator('.repley_add').click();
    await close();await render(article('', '41'));await page.waitForTimeout(600);
    assert.equal(await page.locator('.dcbpv-comments-title').textContent(),'댓글 2개');
    assert.equal(await page.locator('.dcbpv-composer').count(),1,'new article has its own default-open editor');
    assert.equal(await page.locator('.dcbpv-composer iframe').getAttribute('src'),article('', '41'));await close();checks++;

    const times=await page.evaluate(()=>['2026.01.01 00:00:00','2026-10-26 12:00:00','2025-12-31T15:00:00Z','21:12:56','2026.02.30 23:00:00'].map(window.composeTest.formatPreviewCommentTime));
    assert.deepEqual(times,['2026.01.01 AM 12:00:00','2026.10.26 PM 12:00:00','2026.01.01 AM 12:00:00','21:12:56','2026.02.30 23:00:00']);checks++;

    reset();await render(article('','80'));await open();
    await page.locator('[data-dcbpv-native-id="101"] .dcbpv-comment-body').evaluate(body=>{body.innerHTML='<a href="#probe">link</a><span>text to select</span>';body.querySelector('a').onclick=event=>event.preventDefault();});
    await page.locator('[data-dcbpv-native-id="101"] .dcbpv-comment-body a').click();
    assert.equal(await page.locator('[data-composer-target]').textContent(),'댓글 작성');
    await page.locator('[data-dcbpv-native-id="101"] .dcbpv-comment-body span').evaluate(span=>{const range=document.createRange();range.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(range);span.dispatchEvent(new MouseEvent('click',{bubbles:true,button:0}));});
    assert.equal(await page.locator('[data-composer-target]').textContent(),'댓글 작성');
    await page.evaluate(()=>getSelection().removeAllRanges());
    await page.locator('[data-act=compose-reply][data-target="101"]').press('Enter');
    await page.waitForFunction(()=>document.querySelector('[data-composer-target]').textContent.includes('송채경'));
    assert.equal(writes.length,0);await close();checks++;

    const denied=await page.evaluate(async()=>{
      const sender={id:'fixture-extension',url:location.href,frameId:0,tab:{id:1}};
      const base={operation:'prepare',url:'https://gall.dcinside.com/board/view/?id=fixture&no=10',key:'11111111-1111-4111-8111-111111111111',draft:''};
      return Promise.all([
        window.backendTest.handlePreviewCommentMessage({...base,url:'https://example.com/'},sender),
        window.backendTest.handlePreviewCommentMessage({...base,operation:'submit'},sender),
        window.backendTest.handlePreviewCommentMessage(base,{...sender,id:'other'}),
        window.backendTest.handlePreviewCommentMessage(base,{...sender,frameId:1})]);
    });
    assert.ok(denied.every(result=>!result.ok));checks++;
    assert.deepEqual(pageErrors,[]);
    console.log(`Preview composer: ${checks} scenarios passed (default/toggle, continuous writes, CAPTCHA v2/v3/Turnstile/image, replies, owner deletion, responsive layout, timestamps, drafts, duplicates, stale response, sender validation).`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
