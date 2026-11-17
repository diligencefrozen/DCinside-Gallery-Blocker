import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/ui/options/native-record-context.js',import.meta.url),'utf8');
function fixture({ownPrivate=false,permission=true,windows,createResult}={}){
  const calls=[];
  const own={id:ownPrivate?2:1,type:'normal',incognito:ownPrivate};
  const context={};vm.runInNewContext(source,context);
  const api={runtime:{},extension:{isAllowedIncognitoAccess(cb){calls.push('permission');cb(permission)}},windows:{
    getCurrent:async()=>own,getAll:async()=>windows??[{id:1,type:'normal',incognito:false},{id:2,type:'normal',incognito:true}],
    create:async options=>{calls.push(options);return createResult??{id:3,type:'normal',incognito:false}},remove:async id=>calls.push({remove:id})}};
  return{api,calls,selector:context.DCBNativeRecordContext};
}
test('current source follows the option window and explicit modes select browser-reported matching windows',async()=>{
  for(const ownPrivate of [false,true]){
    const f=fixture({ownPrivate});
    assert.equal((await f.selector.resolve('current',f.api)).incognito,ownPrivate);
    assert.equal((await f.selector.resolve('regular',f.api)).windowId,1);
    assert.equal((await f.selector.resolve('private',f.api)).windowId,2);
  }
});
test('private access denial or a missing private session never falls back to normal records',async()=>{
  const denied=fixture({permission:false});await assert.rejects(denied.selector.resolve('private',denied.api),/許可|허용/);assert.deepEqual(denied.calls,['permission']);
  const absent=fixture({windows:[{id:1,type:'normal',incognito:false}]});await assert.rejects(absent.selector.resolve('private',absent.api),/열려 있는 시크릿/);assert.equal(absent.calls.length,1);
});
test('an owned normal helper window is tracked and a wrong helper is closed on failure',async()=>{
  const f=fixture({ownPrivate:true,windows:[{id:2,type:'normal',incognito:true}]});
  const context=await f.selector.resolve('regular',f.api);assert.equal(context.windowId,3);assert.equal(context.ownedWindowId,3);assert.equal(f.calls[0].incognito,false);assert.equal(f.calls[0].focused,false);
  const bad=fixture({ownPrivate:true,windows:[],createResult:{id:4,type:'normal',incognito:true}});
  await assert.rejects(bad.selector.resolve('regular',bad.api),/일반 창/);assert.equal(bad.calls.at(-1).remove,4);
});
test('changed window or privacy metadata is rejected before reading the source',()=>{
  const f=fixture(),context={windowId:2,incognito:true};
  f.selector.verify({id:10,windowId:2,incognito:true},context);
  for(const tab of [{id:10,windowId:1,incognito:true},{id:10,windowId:2,incognito:false},{id:10,windowId:2}])assert.throws(()=>f.selector.verify(tab,context),/모드/);
});
test('invalid window metadata is rejected and promise-style permission checks work',async()=>{
  const f=fixture();f.api.windows.getCurrent=async()=>({id:-1,incognito:false});await assert.rejects(f.selector.resolve('current',f.api),/창 모드/);
  const p=fixture();p.api.extension.isAllowedIncognitoAccess=()=>Promise.resolve(true);assert.equal((await p.selector.resolve('private',p.api)).incognito,true);
});
