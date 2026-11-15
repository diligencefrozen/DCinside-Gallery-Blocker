const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/background/background.js','utf8');
const code=source.match(/^const ACCOUNT_SIGNAL_\w+ = .+;$/gm).join('\n')+'\n'+source.slice(source.indexOf('const accountSignalQueue ='),source.indexOf('chrome.runtime.onMessage.addListener',source.indexOf('const accountSignalQueue =')))+'\nglobalThis.request=enqueueAccountSignal;';
function fixture(){
  let now=1800000000000,status=200;const memory={},calls=[];
  const context=()=>vm.createContext({Date:class extends Date{static now(){return now}},URL,URLSearchParams,AbortController,
    setTimeout(fn,ms){if(ms!==8000){now+=ms;queueMicrotask(fn)}return 1},clearTimeout(){},
    chrome:{storage:{local:{get:async()=>structuredClone(memory),set:async p=>Object.assign(memory,structuredClone(p))}}},
    fetch:async(_url,options)=>{calls.push({time:now,uid:new URLSearchParams(options.body).get('user_id')});return {ok:status===200,status,headers:{get:()=>status===200?null:'7200'},text:async()=>'1,2'}}});
  let ctx;const restart=()=>{ctx=context();vm.runInContext(code,ctx)};restart();
  return {calls,memory,restart,advance:ms=>now+=ms,status:s=>status=s,request:uid=>ctx.request(uid,'synthetic')};
}
test('100 UID candidates retain the 12 per 10-minute global budget, spacing and in-flight deduplication',async()=>{
  const f=fixture();
  const results=await Promise.all([...Array.from({length:100},(_,i)=>f.request('user'+i)),f.request('user0')]);
  assert.equal(f.calls.length,12);assert.equal(results.filter(r=>r.ok).length,13);
  assert.ok(results.filter(r=>!r.ok).every(r=>['BUDGET','COOLDOWN'].includes(r.reason)));
  for(let i=1;i<f.calls.length;i++)assert.ok(f.calls[i].time-f.calls[i-1].time>=3000);
  f.restart();assert.equal((await f.request('afterrestart')).ok,false);assert.equal(f.calls.length,12);
  f.advance(600001);assert.equal((await f.request('afterwindow')).ok,true);assert.equal(f.calls.length,13);
});
test('HTTP 429 Retry-After persists across worker restarts without another fetch',async()=>{
  const f=fixture();f.status(429);const result=await f.request('user0');
  assert.equal(result.status,429);assert.ok(result.retryAfterMs>=7200000);
  f.restart();f.status(200);assert.equal((await f.request('user1')).reason,'COOLDOWN');assert.equal(f.calls.length,1);
  f.advance(7200001);assert.equal((await f.request('user1')).ok,true);assert.equal(f.calls.length,2);
});
