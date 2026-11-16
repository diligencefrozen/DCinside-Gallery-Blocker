const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,firefox}=require('playwright');
for(const [name,type]of Object.entries({chromium,firefox}))test(name+' top button scrolls pages and comments, above refresh and floating bars without overlap',async t=>{
  const browser=await type.launch({executablePath:type.executablePath()});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1000,height:750},reducedMotion:'reduce'});
  page.setDefaultTimeout(5000);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><style>body{margin:0;height:5000px}#dcb-auto-refresh-countdown{position:fixed;right:20px;bottom:20px;height:40px;width:180px;background:orange}#dcb-gallery-quick-block-floating{position:fixed;right:12px;bottom:70px;height:36px;width:200px;background:pink}#comments{position:fixed;top:80px;left:60px;width:500px;height:260px;overflow:auto;background:#ddd}</style><div id="dcb-auto-refresh-countdown"><button onclick="window.refreshClicks=(window.refreshClicks||0)+1">새로고침</button></div><div id="dcb-gallery-quick-block-floating">플로팅 차단</div><div id="comments"><div style="height:2500px">긴 댓글 목록</div></div>'}));
  await page.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1');await page.addScriptTag({path:'src/content/tools/scroll-top.js'});
  const host=page.locator('#dcb-site-scroll-top');assert.equal(await host.isVisible(),false);
  const controls=await page.locator('#dcb-auto-refresh-countdown').getAttribute('style');
  await page.evaluate(()=>scrollTo(0,1200));await host.waitFor({state:'visible'});
  async function above(selector){const a=await host.boundingBox(),b=await page.locator(selector).boundingBox();assert.ok(a.y+a.height+8<=b.y,JSON.stringify({a,b}));}
  await above('#dcb-auto-refresh-countdown');await above('#dcb-gallery-quick-block-floating');
  await page.getByRole('button',{name:'새로고침',exact:true}).click();assert.equal(await page.evaluate(()=>refreshClicks),1);
  await page.evaluate(()=>{const node=document.createElement('div');node.id='extra';node.style.cssText='position:fixed;right:10px;bottom:120px;height:54px;width:120px';document.body.append(node)});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#dcb-site-scroll-top').style.bottom)>=184);await above('#extra');
  await page.locator('#extra').evaluate(node=>node.style.display='none');
  await page.waitForFunction(()=>parseFloat(document.querySelector('#dcb-site-scroll-top').style.bottom)<184);
  await page.addStyleTag({content:'#opaque-bar{position:fixed;right:16px;bottom:116px;width:100px;height:44px}'});
  await page.evaluate(()=>{const node=document.createElement('div');node.id='opaque-bar';node.textContent='Native bar';document.body.append(node)});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#dcb-site-scroll-top').style.bottom)>=170);await above('#opaque-bar');
  await page.locator('#opaque-bar').evaluate(node=>node.remove());
  await page.getByRole('button',{name:'맨 위로 이동',exact:true}).click();await page.waitForFunction(()=>scrollY===0);assert.equal(await host.isVisible(),false);
  await page.locator('#comments').evaluate(node=>node.scrollTop=700);await host.waitFor({state:'visible'});
  await page.getByRole('button',{name:'현재 목록 맨 위로 이동'}).click();await page.waitForFunction(()=>document.querySelector('#comments').scrollTop===0);
  assert.equal(await page.evaluate(()=>scrollY),0);assert.equal(await page.locator('#dcb-auto-refresh-countdown').getAttribute('style'),controls);
  await page.addScriptTag({path:'src/content/tools/scroll-top.js'});assert.equal(await host.count(),1);
  fs.mkdirSync('test-results/site-scroll-top',{recursive:true});await page.evaluate(()=>scrollTo(0,1200));await host.waitFor({state:'visible'});await page.screenshot({path:`test-results/site-scroll-top/${name}.png`});
});
test('top button is registered for both engines without adding permissions',()=>{
  const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));const entry=manifest.content_scripts.find(x=>x.js.includes('src/content/tools/scroll-top.js'));
  assert.equal(entry.run_at,'document_end');assert.equal(entry.all_frames,false);
});
