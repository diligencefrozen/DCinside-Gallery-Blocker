const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

test('installed centering switch synchronizes both UIs, open boards and backups', async t => {
  const root = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext('', {
    executablePath: chromium.executablePath(), viewport: {width:1600,height:900},
    args: ['--load-extension='+root, '--disable-extensions-except='+root]
  });
  t.after(()=>context.close());
  await context.route(/^https?:/, route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'gall.dcinside.com') return route.abort();
    const view = url.pathname.endsWith('/view/');
    return route.fulfill({contentType:'text/html',body:`<!doctype html><style>
      body{margin:0}.wrap_inner{width:min(1450px,100%);margin:auto}
      #container{width:min(1160px,100%);margin:auto}
      section{width:min(${view ? 900 : 840}px,100%);height:10px;float:left}
      aside{width:16%;float:right}
      </style><div id="top" class="width1160 ${view?'view_wrap':'list_wrap'}">
      <div class="wrap_inner"><main id="container"><section class="${view?'writing_view_box':'left_content'}"></section><aside></aside></main></div></div>`});
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const origin = 'chrome-extension://'+new URL(worker.url()).host;
  const options = await context.newPage(), popup = await context.newPage(), gallery = await context.newPage();
  await options.goto(origin+'/src/ui/options/options.html');
  await options.waitForFunction(async ()=>(await chrome.storage.local.get('dcbSettingsBatchV1')).dcbSettingsBatchV1?.phase==='committed');
  await popup.goto(origin+'/src/ui/popup/popup.html');
  await popup.locator('#popupTabDisplay').click();
  const control = '#contentCenteringEnabled';
  assert.equal(await popup.locator(control).isChecked(),false);
  const url = 'https://gall.dcinside.com/board/lists/?id=fixture';
  await gallery.goto(url);
  const column = gallery.locator('#container section');
  const original = await column.boundingBox();
  await popup.locator('label[for=contentCenteringEnabled]').click();
  await options.waitForFunction(()=>document.querySelector('#contentCenteringEnabled').checked);
  const centered = () => gallery.waitForFunction(()=>{
    const box=document.querySelector('#container section').getBoundingClientRect();
    return Math.abs(box.left+box.width/2-document.documentElement.clientWidth/2)<1;
  });
  await centered();
  const download = options.waitForEvent('download');
  await options.evaluate(()=>exportSettings());
  const data = JSON.parse(await fs.readFile(await (await download).path(),'utf8'));
  assert.equal(data.storage.sync.contentCenteringEnabled,true);
  await options.locator(control).evaluate(el=>el.click());
  await popup.waitForFunction(()=>!document.querySelector('#contentCenteringEnabled').checked);
  await gallery.waitForFunction(x=>document.querySelector('#container section').getBoundingClientRect().x===x, original.x);
  const restored=options.waitForEvent('dialog').then(async dialog=>{assert.equal(dialog.message(),'백업을 불러왔습니다.');await dialog.accept();});
  await options.locator('#importFile').setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await restored;
  await centered();
  for(const prefix of ['', 'mgallery/', 'mini/', 'person/']) for(const kind of ['lists','view']){
    await gallery.goto(`https://gall.dcinside.com/${prefix}board/${kind}/?id=fixture&no=1`);
    await centered();
    const box=await column.boundingBox(), side=await gallery.locator('aside').boundingBox();
    assert.ok(box.x+box.width<=side.x);
  }
  await gallery.setViewportSize({width:580,height:700});
  assert.ok(await gallery.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Native PC skins can keep a much wider page shell at this viewport.
  await gallery.addStyleTag({content:'#top{min-width:1515px}'});
  assert.equal((await column.boundingBox()).x,0);
  await popup.reload();
  await popup.waitForFunction(()=>document.querySelector('#contentCenteringEnabled').checked);
});
