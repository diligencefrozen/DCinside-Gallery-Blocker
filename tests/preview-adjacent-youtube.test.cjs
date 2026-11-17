const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');
const source=fs.readFileSync('src/content/core/content_script.js','utf8');
const preview=source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/,'window.adjacentTest={parseDesktopFallback};})();');
const original='https://gall.dcinside.com/board/view/?id=fixture&no=17';

for(const [name,type]of Object.entries({chromium,firefox}))test(name+' adjacent YouTube metadata survives deferred source normalization without duplicates or unrelated content',async t=>{
  const browser=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  await page.evaluate(()=>{window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;window.chrome={storage:{local:{get:(d,c)=>c?.(d)},sync:{get:(d,c)=>c?.(d)},onChanged:{addListener(){}}},runtime:{sendMessage:(m,c)=>c?.({ok:false})}};});
  await page.addScriptTag({content:preview});
  const results=await page.evaluate(original=>{
    const A='dQw4w9WgXcQ',B='9bZkp7q19f0',C='kJQP7kiw5Fk';
    const parse=(article,before='',after='',outside='')=>{
      const html=`<div class="view_content_wrap"><header class="gallview_head"><h3 class="title_subject">본문</h3><span class="gall_writer" data-uid="author" data-nick="작성자">작성자</span></header>${before}<div class="write_div">${article}</div>${after}</div>${outside}`;
      const result=adjacentTest.parseDesktopFallback(html,original);
      const doc=new DOMParser().parseFromString(result.articleHTML,'text/html');
      return {ids:[...doc.querySelectorAll('iframe')].map(node=>new URL(node.src).pathname.split('/').at(-1)),article:result.articleHTML,text:doc.body.textContent,
        unsafe:doc.querySelectorAll('script,[onclick],[onerror],button').length};
    };
    return {
      nested:parse('<p>본문 유지</p>','',`<div class="adjacent-wrapper"><span><button data-video-url="https://www.youtube.com/watch?v=${A}">play</button></span><p>관련 없는 형제 설명</p><script>throw Error('must not copy')</script></div>`),
      unique:parse(`<p>본문 유지</p><div data-youtube-id="${A}"></div>`,'',`<div><button data-youtube-id="${A}">duplicate</button><span data-video-url="https://youtu.be/${B}"></span><iframe src="https://www.youtube.com/embed/${B}"></iframe></div>`),
      ordered:parse('<p>본문 유지</p>',`<div><span data-youtube-id="${A}"></span></div>`,`<div><span data-youtube-id="${B}"></span></div>`),
      excluded:parse('<p>본문 유지</p>','',`<div><div class="right_content"><button data-youtube-id="${A}">sidebar</button></div><div class="comment_wrap"><button data-youtube-id="${B}">comment</button></div><a href="https://www.youtube.com/watch?v=${C}">ordinary link</a><span data-video-url="https://www.youtube.com.attacker.example/watch?v=${C}"></span></div>`,`<aside><span data-youtube-id="${C}"></span></aside>`)
    };
  },original);
  assert.deepEqual(results.nested.ids,['dQw4w9WgXcQ']);assert.match(results.nested.text,/본문 유지/);assert.doesNotMatch(results.nested.text,/관련 없는 형제 설명|must not copy/);assert.equal(results.nested.unsafe,0);
  assert.deepEqual(results.unique.ids,['dQw4w9WgXcQ','9bZkp7q19f0']);
  assert.deepEqual(results.ordered.ids,['dQw4w9WgXcQ','9bZkp7q19f0']);
  assert.deepEqual(results.excluded.ids,[]);assert.equal(results.excluded.unsafe,0);
});
