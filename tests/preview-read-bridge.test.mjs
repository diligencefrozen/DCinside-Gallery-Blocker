import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync('src/background/background.js','utf8');
const bridge=source.slice(source.indexOf('const DCB_FETCH_ALLOWED_HOSTS'),source.indexOf('/* ───── 실베 원출처 확인'));
function fixture(fetch){
  const listeners=[],removed=[],updated=[];
  const context=vm.createContext({URL,URLSearchParams,Headers,TextDecoder,AbortController,setTimeout,clearTimeout,DCB_FETCH_TIMEOUT_MS:500,
    accountSignalSenderAllowed:sender=>new URL(sender.url).origin==='https://gall.dcinside.com',fetch,
    chrome:{runtime:{id:'extension',onMessage:{addListener:fn=>listeners.push(fn)}},tabs:{onRemoved:{addListener:fn=>removed.push(fn)},onUpdated:{addListener:fn=>updated.push(fn)}}}});
  vm.runInContext(bridge+';globalThis.read={dcbReadAllowed,dcbReadBoundedText,dcbReadRequests};',context);
  const sender={id:'extension',tab:{id:7},frameId:0,documentId:'document',url:'https://gall.dcinside.com/board/lists/?id=test'};
  return {read:context.read,sender,removed,updated,request:(message,from=sender)=>new Promise(resolve=>listeners[0](message,from,resolve))};
}
const url='https://gall.dcinside.com/board/view/?id=test&no=123';
test('read bridge allows only article GET and bounded comment reads',async()=>{
  let calls=0;const app=fixture(async()=>{calls++;return new Response('ok');});
  for(const prefix of ['','mgallery/','mini/','person/'])assert.equal(app.read.dcbReadAllowed(new URL(`https://gall.dcinside.com/${prefix}board/view/?id=test&no=1`),'GET'),true);
  for(const prefix of ['board','mini','person'])assert.equal(app.read.dcbReadAllowed(new URL(`https://m.dcinside.com/${prefix}/test/1`),'GET'),true);
  for(const path of ['/board/forms/comment_submit','/board/comment/comment_delete_submit','/board/recommend/vote','/api/anything']){
    const result=await app.request({type:'dcb.fetchText',requestId:randomUUID(),url:'https://gall.dcinside.com'+path,method:'POST',body:'id=test&no=1'});assert.equal(result.ok,false);
  }
  for(const body of ['id=test&no=1&mode=delete','id=test&id=other&no=1','x'.repeat(17000)])assert.equal((await app.request({type:'dcb.fetchText',requestId:randomUUID(),url:'https://gall.dcinside.com/board/comment/',method:'POST',body})).ok,false);
  assert.equal(calls,0);
  assert.equal((await app.request({type:'dcb.fetchText',requestId:randomUUID(),url})).ok,true);assert.equal(calls,1);
});
test('20 close/switch cycles abort the actual fetch and clean the registry; other frames cannot cancel',async()=>{
  let aborted=0;const app=fixture((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(new DOMException('aborted','AbortError'));},{once:true})));
  for(let i=0;i<20;i++){
    const requestId=randomUUID(),pending=app.request({type:'dcb.fetchText',requestId,url});
    await app.request({type:'dcb.cancelFetch',requestId},{...app.sender,frameId:1});assert.equal(aborted,i);
    await app.request({type:'dcb.cancelFetch',requestId});assert.equal((await pending).ok,false);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(app.read.dcbReadRequests.size,0);
  }
  assert.equal(aborted,20);
});
test('tab close and navigation cancel outstanding reads',async()=>{
  const app=fixture((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))));
  for(const cancel of [()=>app.removed[0](7),()=>app.updated[0](7,{status:'loading'})]){
    const pending=app.request({type:'dcb.fetchText',requestId:randomUUID(),url});cancel();await pending;assert.equal(app.read.dcbReadRequests.size,0);
  }
});
test('bounded response reader rejects oversized streaming data and malformed senders never fetch',async()=>{
  let calls=0;const app=fixture(async()=>{calls++;return new Response('ok');});
  await assert.rejects(()=>app.read.dcbReadBoundedText(new Response('x',{headers:{'content-length':9*1024*1024}})),/크기/);
  await assert.rejects(()=>app.read.dcbReadBoundedText(new Response(new Uint8Array(8*1024*1024+1))),/크기/);
  for(const sender of [{...app.sender,id:'other'},{...app.sender,tab:null},{...app.sender,url:'https://example.com/'}])assert.equal((await app.request({type:'dcb.fetchText',requestId:randomUUID(),url},sender)).ok,false);
  assert.equal(calls,0);
});
