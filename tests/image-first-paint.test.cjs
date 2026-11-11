const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox } = require('playwright');
// The parser is deliberately paused. Waiting for document.fonts.ready would
// wait for our release signal rather than capture that first painted state.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

for (const [engine, browserType] of Object.entries({ chromium, firefox })) {
  test(engine + ' hides blocked media before the parser completes and preserves both official warnings', async t => {
    const browser = await browserType.launch({ headless: true, executablePath: browserType.executablePath() });
    t.after(() => browser.close());
    for (const [phase, root] of [['before', process.env.DCB_IMAGE_BASELINE], ['after', '.']]) {
      if (!root) continue;
      const page = await browser.newPage({viewport:{width:700,height:450}});
      const production = fs.readFileSync(path.join(root,'src/content/image/image-blocker.js'),'utf8');
      const bus = fs.readFileSync(path.join(root,'src/shared/dom-mutation-bus.js'),'utf8');
      const html = `<head><script defer src="/delay.js"></script></head><body><section class="write_div">
        <div id="spoiler_warning"><div class="spoiler_inner"><img id="pc" alt="스포일러 주의" src="/warning.svg"></div></div>
        <div id="spoiler"><div class="spoiler-inner"><img id="mobile" alt="스포일러 주의" src="/warning.svg"></div></div>
        <img id="original" src="/original.svg" width="100" height="100"></section></body>`;
      let release;
      const block = new Promise(resolve => {release=resolve;});
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('.js')) { await block; return route.fulfill({contentType:'text/javascript',body:''}); }
        if (url.pathname.endsWith('.svg')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>'});
        return route.fulfill({contentType:'text/html',body:html});
      });
      await page.addInitScript({content:`
        window.fixtureEnabled=true;
        const changes={addListener(fn){window.fixtureChange=fn}};
        window.chrome={runtime:{onMessage:{addListener(){}}},storage:{onChanged:changes,local:{get:async()=>({dcbImageBlockRecords:{'quick:fixture':{originalSrc:location.origin+'/original.svg'}}})}}};
        window.DCBRuntimeSettingsCache={get:async()=>({dcbImageBlockConfig:{enabled:fixtureEnabled}}),onChanged:changes};
        ${bus}
        ${production}`});
      await page.goto('https://gall.dcinside.com/board/view/?id=fixture&no=1',{waitUntil:'commit'});
      try {
        await page.waitForFunction(()=>document.querySelector('#original')?.complete);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.notEqual(await page.evaluate(()=>document.readyState),'complete');
        const shown=await page.locator('#original').isVisible();
        console.log(engine,phase,'original visible before DOMContentLoaded:',shown);
        if(process.env.DCB_IMAGE_BASELINE) await page.screenshot({path:'test-results/image-first-paint-'+engine+'-'+phase+'.png',timeout:5000});
        assert.equal(shown,phase==='before');
      } finally { release(); }
      await page.waitForLoadState();
      if (phase==='after') {
        for (const id of ['pc','mobile']) assert.equal(await page.locator('#'+id).isVisible(),true);
        await page.getByRole('button',{name:'이미지 보기'}).click();
        assert.equal(await page.locator('#original').isVisible(),false,'a saved URL still requires its own reveal');
        await page.getByRole('button',{name:'이미지 보기'}).click();
        assert.equal(await page.locator('#original').isVisible(),true);
        await page.evaluate(()=>{fixtureEnabled=false;fixtureChange({dcbImageBlockConfig:{newValue:{enabled:false}}},'sync')});
        await page.waitForFunction(()=>!document.querySelector('.dcibx-frame'));
      }
      await page.close();
    }
  });
}
