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

test('a tab hidden before paint drains pending mutations and cancels work on unsubscribe',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<main></main>');
  await page.addScriptTag({path:'src/shared/dom-mutation-bus.js'});
  const result=await page.evaluate(async()=>{
   let hidden=false, delivered=0, batches=0;
   Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
   const frames=new Map();
   let next=0;
   window.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};
   window.cancelAnimationFrame=id=>frames.delete(id);
   const main=document.querySelector('main');
   const done=new Promise(resolve=>{
    window.stopBus=DCBDomMutationBus.subscribe('background-list',records=>{
     batches++;delivered+=records.filter(record=>record.target===main).length;resolve();
    },{types:['childList']});
   });
   main.append(document.createElement('i'));
   await Promise.resolve();
   const queuedBeforeHide=frames.size;
   hidden=true;document.dispatchEvent(new Event('visibilitychange'));
   for(let i=0;i<1000;i++)main.append(document.createElement('i'));
   let timeout;
   try{
    await Promise.race([done,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('background batch stalled')),3000);})]);
   }finally{clearTimeout(timeout);}
   hidden=false;document.dispatchEvent(new Event('visibilitychange'));
   main.append(document.createElement('i'));await Promise.resolve();
   stopBus();const queuedAfterStop=frames.size;
   return {delivered,batches,queuedBeforeHide,queuedAfterStop};
  });
  assert.deepEqual(result,{delivered:1001,batches:1,queuedBeforeHide:1,queuedAfterStop:0});
 }finally{await browser.close();}
});
