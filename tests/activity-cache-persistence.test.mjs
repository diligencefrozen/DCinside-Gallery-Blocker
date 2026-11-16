import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/content/image/image-account-filter.js',import.meta.url),'utf8');
const key='dcbImageAccountSignalCache';
const clone=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

function fixture(beforeSet=async()=>{}) {
  const data={[key]:{}},writes=[],requests=[],timers=new Map(),listeners=[];
  let timerId=0,lockTail=Promise.resolve();
  const changed={addListener:listener=>listeners.push(listener)};
  const chrome={
    runtime:{sendMessage(message,callback){
      requests.push({type:message.type,uid:message.uid});
      queueMicrotask(()=>callback({ok:true,posts:20,comments:30}));
    }},
    storage:{local:{
      async get(keys){
        const result=Array.isArray(keys)?{}:typeof keys==='string'?{}:clone(keys);
        for(const name of typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys))
          if(Object.hasOwn(data,name))result[name]=clone(data[name]);
        return result;
      },
      async set(patch){
        writes.push(clone(patch));
        await beforeSet(writes.length,clone(patch));
        const previous=clone(data);
        Object.assign(data,clone(patch));
        const changes=Object.fromEntries(Object.keys(patch).map(name=>[name,{oldValue:previous[name],newValue:clone(data[name])}]));
        for(const listener of listeners)listener(changes,'local');
      }
    },onChanged:changed}
  };
  const context=vm.createContext({
    chrome,
    document:{cookie:'ci_c=synthetic'},
    window:{dispatchEvent(){}},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}},
    DCBRuntimeSettingsCache:{
      get:async()=>({dcbImageAccountRules:{enabled:true,blockPosts:true,blockComments:true,minPostCount:5,minCommentCount:10,cacheHours:72},dcbShowWriterActivity:false}),
      onChanged:changed
    },
    navigator:{locks:{request(_name,work){
      const job=lockTail.then(work,work);lockTail=job.catch(()=>{});return job;
    }}},
    setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},
    clearTimeout(id){timers.delete(id);},
    queueMicrotask,Date,console
  });
  vm.runInContext(source,context);
  return {api:context.DCBAccountActivityFilter,data,writes,requests,timers};
}

test('an explicit cache flush saves immediately and waits for the storage write before navigation can continue',async()=>{
  const entered=deferred(),release=deferred();
  const f=fixture(async index=>{if(index===1){entered.resolve();await release.promise;}});
  assert.equal(f.api.isReady(),false);
  await f.api.ready();assert.equal(f.api.isReady(),true);
  const result=await f.api.evaluate('fixtureuser');
  assert.equal(result.available,true);assert.equal(result.shouldHide,false);
  assert.equal(f.requests.length,1);
  assert.deepEqual(f.data[key],{});
  assert.ok([...f.timers.values()].some(timer=>timer.delay===250),'The ordinary debounced write has not fired');
  let completed=false;
  const flushed=f.api.flushCache().then(()=>{completed=true;});
  await entered.promise;
  assert.equal(completed,false,'Flush must await the actual storage operation');
  assert.deepEqual(f.data[key],{});
  assert.ok(![...f.timers.values()].some(timer=>timer.delay===250),'Flush bypasses the debounce timer');
  release.resolve();await flushed;
  assert.equal(f.data[key].fixtureuser.posts,20);assert.equal(f.data[key].fixtureuser.comments,30);
  assert.equal(f.api.peek('fixtureuser').available,true);
  assert.equal((await f.api.evaluate('fixtureuser')).stats.comments,30);
  await f.api.flushCache();
  assert.equal(f.requests.length,1,'The saved result is reused without another account lookup');
  assert.equal(f.writes.length,1);
});

test('clearing the cache waits for queued flushes and an old write cannot repopulate it afterward',async()=>{
  const entered=deferred(),release=deferred();
  const f=fixture(async index=>{if(index===1){entered.resolve();await release.promise;}});
  await f.api.ready();
  await f.api.evaluate('firstuser');
  const firstFlush=f.api.flushCache();await entered.promise;
  await f.api.evaluate('seconduser');
  const queuedFlush=f.api.flushCache();
  let cleared=false;
  const clearing=f.api.clearCache().then(()=>{cleared=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cleared,false,'Cache clear must stay behind the pending write queue');
  assert.equal(f.writes.length,1);
  release.resolve();await Promise.all([firstFlush,queuedFlush,clearing]);
  assert.equal(cleared,true);
  assert.deepEqual(f.data[key],{});
  assert.equal(f.api.peek('firstuser'),null);assert.equal(f.api.peek('seconduser'),null);
  assert.equal(f.writes.length,3,'Two pending result writes are followed by the cache clear');
  await f.api.flushCache();
  assert.deepEqual(f.data[key],{});assert.equal(f.writes.length,3);
  assert.equal(f.requests.length,2);
});
