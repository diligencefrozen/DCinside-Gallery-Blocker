// Production preview, mutation bus and writer layout in Chromium. Network is
// deterministic; this is a browser profile, not a claim about live server time.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const baseline=process.argv.includes('--before'),check=process.argv.includes('--check');
const runs=Number(process.argv.find(a=>a.startsWith('--runs='))?.split('=')[1]||5);
assert.ok(Number.isInteger(runs)&&runs>=1&&runs<=10);
const read=(file)=>fs.readFileSync(baseline?path.join('test-results/perf-before',path.basename(file)):file,'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true});const results=[];
 try{for(const count of [50,500,2000]){for(let run=1;run<=runs;run++){
  const page=await browser.newPage({viewport:{width:1100,height:850}}),cdp=await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('https://gall.dcinside.com/board/lists/?id=fixture');
  await page.evaluate(()=>{window.previewEnabled=true;window.PREVIEW_COMMENT_DEBUG=false;window.chrome={runtime:{sendMessage:(_m,f)=>f({ok:false})},storage:{sync:{get:(d,f)=>f(d)},local:{get:(d,f)=>f(d)},onChanged:{addListener(){}}}};});
  await page.addStyleTag({path:'src/content/appearance/writer-layout.css'});
  await page.addScriptTag({content:read('src/shared/dom-mutation-bus.js')});
  await page.addScriptTag({content:read('src/content/user/writer-layout.js')});
  let source=read('src/content/core/content_script.js');source=source.slice(source.indexOf('(function dcBlockPostPreview(){')).replace(/\}\)\(\);\s*$/,'window.profilePreview={renderPreview,closePreview};})();');
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{window.profileRender=count=>{
   const icon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#a9cfef"/></svg>');
   const html=Array.from({length:count},(_,i)=>`<div class="dcbpv-comment-item" data-dcbpv-native-id="${i+1}"><div class="dcbpv-comment-meta"><span class="gall_writer" data-nick="writer${i}" data-uid="writer${i}"><span class="nickname"><em>writer${i}</em></span></span><span class="dcbpv-time">12:00</span></div><div class="dcbpv-comment-body">Comment ${i} ${'text '.repeat(10)}${i%4===0?`<img class="dcbpv-dccon" src="${icon}">`:''}</div></div>`).join('');
   profilePreview.renderPreview({url:'https://gall.dcinside.com/board/view/?id=fixture&no=1',title:'Scroll profile',articleHTML:'<p>Profile</p>',commentsHTML:html,counts:{up:'0',down:'0'}});
   document.querySelectorAll('.gall_writer').forEach(n=>DCBWriterLayout.ensure(n));
  };});
  for(const phase of ['cold','warm']){
  await page.evaluate(count=>profileRender(count),count);
  await page.waitForTimeout(700);
  const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const sample=await page.evaluate(async()=>{
   let mutations=0;const longTasks=[],frames=[];const mo=new MutationObserver(r=>mutations+=r.length);mo.observe(document.querySelector('#dcb-preview-overlay'),{subtree:true,attributes:true,childList:true});
   const po=new PerformanceObserver(l=>longTasks.push(...l.getEntries().map(e=>e.duration)));po.observe({type:'longtask'});
   const scroll=document.querySelector('.dcbpv-scroll');let last=performance.now(),start=last;
   await new Promise(resolve=>{function tick(now){frames.push(now-last);last=now;scroll.scrollTop+=18;if(scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight)scroll.scrollTop=0;if(now-start<1800)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
   mo.disconnect();po.disconnect();frames.sort((a,b)=>a-b);
   return {mutations,frames:frames.length,p95FrameMs:+frames[Math.floor(frames.length*.95)].toFixed(1),slowFrames:frames.filter(n=>n>50).length,longTasks:longTasks.length,maxLongTaskMs:Math.round(Math.max(0,...longTasks))};
  });
  const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const row={count,run,phase,...sample,taskMs:Math.round((after.TaskDuration-before.TaskDuration)*1000),layoutMs:Math.round((after.LayoutDuration-before.LayoutDuration)*1000),styleMs:Math.round((after.RecalcStyleDuration-before.RecalcStyleDuration)*1000)};
  results.push(row);console.log(JSON.stringify(row));
  if(check)assert.equal(sample.mutations,0,'settled preview must not keep rewriting writer classes');
  await page.evaluate(()=>profilePreview.closePreview());
  }await page.close();
 }}
 const summary=[];
 for(const count of [50,500,2000])for(const phase of ['cold','warm']){
  const group=results.filter(r=>r.count===count&&r.phase===phase),row={count,phase};
  for(const key of ['mutations','taskMs','p95FrameMs','slowFrames','longTasks','maxLongTaskMs','layoutMs','styleMs']){
   const values=group.map(r=>r[key]).sort((a,b)=>a-b);row[key]={median:values[Math.floor(values.length/2)],p95:values[Math.ceil(values.length*.95)-1]};
  }summary.push(row);
 }
 fs.writeFileSync(`test-results/preview-scroll-${baseline?'before':'after'}.json`,JSON.stringify({engine:'Chromium',cpuThrottle:4,scrollMs:1800,runs,results,summary},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
