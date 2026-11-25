const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, firefox} = require('playwright');

const origin = 'https://gall.dcinside.com';
const article = origin + '/mini/board/view/?id=fixture&no=42';
// Only this intercepted widget sends requests. Its selection contract mirrors poll.js:
// label clicks call chk_vote, and the POST serializes .sel boxes by data-no.
function widget(limit) {
  const items = [11, 23, 37].map((id, i) =>
    `<div class="vote_categorybox" data-no="${id}"><input type="checkbox" id="item_${i}" class="item_chk"><label for="item_${i}" onclick="chk_vote(${i})">항목 ${i}</label></div>`).join('');
  return `<div class="vote"><div class="vote_catelist">${items}</div>
    <button class="btn_vote">투표하기</button><a href="vote_result?preview=1">결과 미리보기</a></div>
    <script>
      const hooks = {};
      window.jQuery = () => ({on(name, fn){hooks[name.split('.')[0]] = fn}});
      function chk_vote(i){
        const input = document.getElementById('item_'+i), box = input.parentNode;
        if (box.classList.contains('sel') && input.checked) return box.classList.remove('sel');
        const selected = [...document.querySelectorAll('.sel')];
        if (${limit} === 1) selected.forEach(n=>n.classList.remove('sel'));
        else if (selected.length >= ${limit}) return;
        box.classList.add('sel');
      }
      document.querySelector('.btn_vote').onclick = async () => {
        const ids = [...document.querySelectorAll('.sel')].map(n=>n.dataset.no);
        if (!ids.length) return;
        const url='/ajax/poll_ajax/update_vote', xhr={};
        hooks.ajaxSend(null,xhr,{url});
        const body=new URLSearchParams({poll_idx:new URL(location.href).searchParams.get('no'),ci_t:'fixture'});
        ids.forEach(id=>body.append('check_vote[]',id));
        const r=await fetch(url,{method:'POST',body});
        xhr.status=r.status; xhr.responseText=await r.text();
        if(xhr.responseText==='ok') location.href='vote_result';
        else document.title='제출 실패';
        hooks.ajaxComplete(null,xhr);
      };
    </script>`;
}
for (const [name,engine] of Object.entries({chromium,firefox})) {
  test(name+' native poll preserves choices, handles rejection and submits once',async t=>{
    const browser = await engine.launch({executablePath:engine.executablePath()});
    t.after(()=>browser.close());
    const page=await browser.newPage();
    page.setDefaultTimeout(6000);

    let limit=1, reply='non_member|권한 없음', closed=false, status=200;
    const writes=[], referrers=[];
    await page.route('**/*',async route=>{
      const req=route.request(), url=new URL(req.url());
      if(url.pathname==='/fixture-poll-bridge.js') return route.fulfill({contentType:'application/javascript',path:'src/content/core/preview-poll.js'});
      if(url.pathname==='/ajax/poll_ajax/update_vote'){
        assert.equal(req.method(),'POST');
        const fields=new URLSearchParams(req.postData());
        assert.equal(fields.get('poll_idx'),'12');
        assert.equal(fields.get('ci_t'),'fixture');
        writes.push(fields.getAll('check_vote[]'));
        await new Promise(resolve=>setTimeout(resolve,180));
        return route.fulfill({status,body:reply});
      }
      if(url.pathname==='/board/poll/vote_result') return route.fulfill({contentType:'text/html; charset=utf-8',body:url.search?'결과 미리보기':'313명 참여 · 투표 완료'});
      if(url.pathname==='/board/poll/vote'){
        if(req.headers().referer === article) referrers.push(req.headers().referer);
        const body = closed ? '<div class="vote">종료된 투표</div>' : widget(limit);
        return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><script src="/fixture-poll-bridge.js"></script>'+body});
      }
      return route.fulfill({contentType:'text/html; charset=utf-8',body:`<div id="dcb-preview-overlay"><iframe data-dcbpv-poll-article="${article}" src="/board/poll/vote?no=12"></iframe></div>`});
    });
    const frame=page.frameLocator('iframe');
    async function open(){
      await page.goto(origin+'/board/lists/?id=fixture');
      await page.waitForSelector('iframe[data-dcbpv-poll-ready="1"]');
    }
    await open();
    await frame.getByText('항목 0').click();
    await frame.locator('#item_1').check();
    assert.equal(await frame.locator('#item_0').isChecked(),false);
    await frame.getByText('결과 미리보기').click();
    await frame.locator('body').filter({hasText:'결과 미리보기'}).waitFor();
    assert.deepEqual(writes,[]);
    limit=2;
    await open();
    await frame.locator('#item_0').check();
    await frame.getByText('항목 1').click();
    await frame.getByText('항목 2').click();
    assert.equal(await frame.locator('#item_2').isChecked(),false);
    await frame.getByText('항목 1').click();
    await frame.getByText('항목 2').click();
    await frame.getByRole('button').dblclick();
    await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.title==='제출 실패');
    assert.equal(await frame.getByRole('button').isEnabled(),true);
    assert.deepEqual(writes,[['11','37']]);
    status=503;
    await frame.getByRole('button').click();
    await frame.getByRole('status').waitFor();
    assert.equal(await frame.getByRole('button').isEnabled(),true);
    status=200;
    reply='ok';
    await frame.getByRole('button').click();
    await frame.getByText('313명 참여 · 투표 완료').waitFor();
    assert.equal(await frame.locator('.btn_vote').count(),0);
    assert.deepEqual(writes,[['11','37'],['11','37'],['11','37']]);
    closed=true;
    await open();
    await frame.getByText('종료된 투표').waitFor();
    assert.equal(await frame.getByRole('button').count(),0);
    await page.locator('#dcb-preview-overlay').evaluate(node=>node.remove());
    assert.equal(page.frames().length,1);
    assert.deepEqual(referrers,[article,article,article]);
  });
}
