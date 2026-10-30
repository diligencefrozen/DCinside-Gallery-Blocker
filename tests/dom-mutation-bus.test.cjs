const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
test('shared observer keeps pending changes across lazy subscriptions and stale disposers',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<div id="root"></div>');
  await page.evaluate(()=>{
   const NativeObserver=MutationObserver;window.observerCreations=0;
   window.MutationObserver=class extends NativeObserver{constructor(fn){super(fn);observerCreations++;}};
  });
  await page.addScriptTag({path:'src/shared/dom-mutation-bus.js'});
  const result=await page.evaluate(async()=>{
   window.observerCreations=0;
   const bus=DCBDomMutationBus,root=document.querySelector('#root'),seen=[],replacement=[];
   const first=bus.subscribe('first',records=>seen.push(...records.map(r=>r.type)),{types:['childList']});
   root.append(document.createElement('span'));
   for(let i=0;i<20;i++)bus.subscribe('lazy'+i,()=>{},{types:['childList']});
   bus.subscribe('attributes',()=>{},{types:['attributes'],attributes:['class']});
   const stale=bus.subscribe('replace',()=>{},{types:['childList']});
   const current=bus.subscribe('replace',records=>replacement.push(...records),{types:['childList']});stale();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const created=observerCreations;
   first();current();bus.unsubscribe('attributes');for(let i=0;i<20;i++)bus.unsubscribe('lazy'+i);
   const delivered=seen.length;root.append(document.createElement('em'));
   await new Promise(requestAnimationFrame);
   return {created,seen,delivered,afterDispose:seen.length,replacement:replacement.length};
  });
  assert.equal(result.created,1);assert.deepEqual(result.seen,['childList']);
  assert.equal(result.replacement,1);assert.equal(result.afterDispose,result.delivered);
 }finally{await browser.close();}
});
