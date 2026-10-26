const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(root, 'src/content/core/content_script.js'), 'utf8');
const preview = content.slice(content.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/, `
window.composeTest = {renderPreview, updatePreviewComments, closePreview, commentRecordsToHtml, previewCacheKey, cache};
})();`);
const backend = fs.readFileSync(path.join(root, 'src/background/preview-comment.js'), 'utf8');
const article = (prefix = '', no = '10') => `https://gall.dcinside.com/${prefix}board/view/?id=fixture&no=${no}`;

function nativeDocument(url, member = true, captcha = false) {
  const type = url.includes('/mgallery/') ? 'M' : url.includes('/mini/') ? 'MI' : url.includes('/person/') ? 'PR' : 'G';
  const no = new URL(url).searchParams.get('no');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    ${Object.entries({ _GALLTYPE_: type, member_division: member ? 'Y' : 'N', e_s_n_o: 'fixture-read-token',
      cur_t:'fixture-time', check_6:'0', check_7:'0', check_8:'0', check_9:'0', check_10:'0', recommend:'0', c_r_k_x_z:'fixture', kcaptcha_use:captcha?'Y':'N' })
      .map(([id,value])=>`<input id="${id}" value="${value}">`).join('')}
    <li id="comment_li_101"><div class="cmt_info" data-no="101"><div class="btn_reply_write_all">parent</div></div>
      <ul class="reply_list" id="reply_list_101" p-no="101"><li id="reply_li_102"><div class="reply_info" data-no="102"><div class="btn_re_reply_write_all">reply</div></div></li></ul></li>
    <div class="cmt_write_box"><div class="fl">${member ? '' : `<input id="name_${no}" placeholder="닉네임"><input id="password_${no}" type="password">`}</div>
    <div class="cmt_txt_cont"><textarea id="memo_${no}" maxlength="400"></textarea><button class="repley_add btn_svc" data-no="${no}">등록</button></div></div>
    <script>
      window.jQuery = () => ({data:key=>({comment_id:'fixture',comment_no:'${no}'})[key]});
      window.dc_rc_key='fixture-rc';
      window.nativeSubmits=0;
      document.addEventListener('click',event=>{if(event.target.matches('.repley_add'))window.nativeSubmits++});
      function secure(button){button.addEventListener('click',event=>{if(window.nativeReject)event.preventDefault();if(event.isTrusted)document.service_code='fixture-live-code';});}
      secure(document.querySelector('.repley_add'));
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
    let member = true, captcha = false, responseMode = 'success', delay = 0;
    let writes = [], records = [], reads = 0;
    const reset = () => { writes=[]; reads=0; records=[{no:'101',c_no:'0',depth:0,name:'tester',memo:'parent'}, {no:'102',c_no:'101',depth:1,name:'tester',memo:'reply'}]; responseMode='success';delay=0;member=true;captcha=false; };
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
        if (responseMode === 'unknown') return route.fulfill({body:'<html>login</html>'});
        records.push({no:'103',c_no:fields.c_no||'0',depth:fields.c_no?1:0,name:fields.name||'member',memo:fields.memo.replace(/&/g,'&amp;').replace(/</g,'&lt;')});
        return route.fulfill({body:'103'});
      }
      if (url.pathname === '/board/comment/') {reads++; return route.fulfill({json:{comments:records,total_cnt:records.length}});}
      return route.fulfill({contentType:'text/html',body:url.pathname.endsWith('/view/') ? nativeDocument(url.href,member,captcha) : '<!doctype html><html><head></head><body><button id="origin">origin</button></body></html>'});
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
    await page.addScriptTag({content:preview});
    const render = async (url=article()) => page.evaluate(({url,records})=>{
      window.fixtureData={url,fetchedUrl:url,title:'fixture',writerHTML:'',articleHTML:'<p>body</p>',counts:{up:'0',down:'0'},commentTitle:'댓글 2개',commentsHTML:window.composeTest.commentRecordsToHtml(records,url)};
      window.composeTest.renderPreview(window.fixtureData);
    },{url,records});
    const open = async () => {await page.locator('[data-act="compose"]').click(); await page.locator('.dcbpv-composer iframe').waitFor({state:'visible'}); await page.waitForFunction(()=>document.querySelector('.dcbpv-composer iframe')?.style.visibility==='visible');};
    const editor = () => page.frameLocator('iframe[data-dcbpv-compose-frame]');
    const finish = async text => page.locator('.dcbpv-composer [role="status"]').filter({hasText:text}).waitFor();
    const close = async () => page.evaluate(()=>window.composeTest.closePreview());

    for (const prefix of ['', 'mgallery/', 'mini/', 'person/']) {
      reset(); await render(article(prefix)); await open();
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
      await page.locator(`[data-act="compose-reply"][data-target="${target}"]`).click();
      await page.waitForFunction(()=>document.querySelector('.dcbpv-composer iframe')?.style.visibility==='visible');
      await editor().locator('#memo_101').fill('reply text');
      await editor().locator('.repley_add[r_idx]').click();
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
    assert.equal(await editor().locator('#password_10').inputValue(),''); await close();checks++;

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
        await page.locator('[data-act="compose"]').click();
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
    }
    await page.screenshot({path:path.join(root,'test-results/preview-compose-fixture.png')});
    const frameBefore=page.frames().find(f=>f.url().includes('no=20'));
    await page.evaluate(()=>{window.composeTest.updatePreviewComments(window.fixtureData); window.composeTest.renderPreview(window.fixtureData);});
    assert.equal(page.frames().find(f=>f.url().includes('no=20')),frameBefore);
    assert.equal(await editor().locator('textarea').inputValue(),'keep during refresh');
    await editor().locator('.repley_add').evaluate(button=>button.click());
    assert.equal(writes.length,0,'synthetic click never submits');
    await page.locator('[data-act="compose-cancel"]').click(); await open();
    assert.equal(await editor().locator('textarea').inputValue(),'keep during refresh');
    await editor().locator('textarea').press('Escape');
    await page.locator('#dcb-preview-overlay').waitFor({state:'detached'});
    await close(); checks++;

    reset();await render(article('', '21'));await open();
    await editor().locator('textarea').fill('native guard');
    await editor().locator('body').evaluate(()=>{window.nativeReject=true});
    await editor().locator('.repley_add').click();await finish('추가 인증');
    assert.equal(writes.length,0,'native security rejection is respected even if an old code exists');await close();checks++;

    reset();captcha=true;await render(article('', '22'));
    await page.locator('[data-act="compose"]').click();await finish('추가 인증');
    assert.equal(writes.length,0);assert.equal(await page.locator('.dcbpv-composer iframe').evaluate(f=>f.style.visibility),'hidden');await close();checks++;

    reset(); delay=350;await render(article('', '30'));await open();
    await editor().locator('textarea').fill('once');
    await editor().locator('.repley_add').dblclick();await finish('등록된 댓글을 확인');
    assert.equal(writes.length,1);await close();checks++;

    reset();delay=400;await render(article('', '40'));await open();
    await editor().locator('textarea').fill('late response');await editor().locator('.repley_add').click();
    await close();await render(article('', '41'));await page.waitForTimeout(600);
    assert.equal(await page.locator('.dcbpv-comments-title').textContent(),'댓글 2개');
    assert.equal(await page.locator('.dcbpv-composer').count(),0);await close();checks++;

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
    console.log(`Preview composer: ${checks} scenarios passed (four gallery types, native trusted input, replies, guest, failures, drafts, rerender, duplicates, stale response, sender validation).`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
