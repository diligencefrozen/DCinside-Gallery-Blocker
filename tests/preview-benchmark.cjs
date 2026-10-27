// Opt-in microbenchmark: actual production functions, synthetic identical DOM.
const fs = require('node:fs');
const {chromium} = require('playwright');
(async()=>{
  const content=fs.readFileSync('src/content/core/content_script.js','utf8');
  const backend=fs.readFileSync('src/background/preview-comment.js','utf8');
  const decorator=content.slice(content.indexOf('  function decoratePreviewReplyActions('),content.indexOf('  async function openPreviewComposer('));
  const targets=backend.slice(backend.indexOf('  const nativeTargets ='),backend.indexOf('  const uniqueTargets ='));
  const cacheCode=content.slice(content.indexOf('  function writePreviewCache('),content.indexOf('  function clearPreviewLoadingTimer('));
  const markerCode=content.slice(content.indexOf('  function previewMayContainDynamicYouTube('),content.indexOf('  function isWeakPreviewData('));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.addScriptTag({content:`let previewComposer=null;const cache=new Map(),CACHE_MAX_ENTRIES=32;const previewCacheKey=x=>x;${decorator}${markerCode}${cacheCode}window.bench={decoratePreviewReplyActions,writePreviewCache,cache,targets:()=>{const doc=document;${targets};return nativeTargets();}};`});
    const output=[];
    for(const count of [50,500,2000]){
      await page.setContent(Array.from({length:count},(_,i)=>`<div class="dcbpv-comment-item cmt_info" data-dcbpv-native-id="${i+1}" data-no="${i+1}"><div class="dcbpv-comment-meta"></div><button class="btn_reply_write_all">reply</button></div>`).join(''));
      output.push(await page.evaluate(async count=>{
        const longTasks=[];const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));
        observer.observe({type:'longtask'});
        const decoration=[],targets=[];
        for(let i=0;i<5;i++){
          await new Promise(r=>setTimeout(r,20));
          let start=performance.now();bench.decoratePreviewReplyActions(document.body);decoration.push(performance.now()-start);
          start=performance.now();bench.targets();targets.push(performance.now()-start);
        }
        await new Promise(r=>setTimeout(r,50));observer.disconnect();
        const median=values=>+values.sort((a,b)=>a-b)[2].toFixed(2);
        return {comments:count,decorationMs:median(decoration),nativeTargetsMs:median(targets),longTasks:longTasks.length,maxLongTaskMs:Math.round(Math.max(0,...longTasks))};
      },count));
    }
    const cache=await page.evaluate(()=>{
      for(let i=0;i<30;i++){
        const raw='<html>'+String(i)+'x'.repeat(1024*1024)+'</html>';
        bench.writePreviewCache(String(i),{rawHtml:raw,desktopRawHtml:raw,articleHTML:'<p>'+String(i)+'y'.repeat(4096)+'</p>',commentsHTML:'',url:String(i)});
      }
      return {entries:bench.cache.size,serializedBytes:new TextEncoder().encode(JSON.stringify([...bench.cache.values()])).length};
    });
    const result={measuredAt:new Date().toISOString(),engine:'Chromium',samples:5,rows:output,cache};
    if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
