import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/background/activity-navigation.js',import.meta.url),'utf8');
function fixture(){
  const calls=[];let listener;
  const tab={id:3,windowId:1,incognito:true,url:'https://gall.dcinside.com/mini/board/lists/?id=fixture'};
  const chrome={runtime:{id:'extension',onMessage:{addListener:f=>listener=f}},tabs:{get:async()=>({...tab}),create:async args=>calls.push(['tab',args])},windows:{create:async args=>calls.push(['window',args])}};
  vm.runInNewContext(source,{chrome,URL});
  const sender={id:'extension',frameId:0,url:tab.url,tab:{id:3}};
  const send=(message,from=sender)=>new Promise(resolve=>listener({type:'dcb.activityOpen',url:'https://gall.dcinside.com/mini/board/view/?id=fixture&no=11',...message},from,resolve));
  return{calls,tab,sender,send};
}
test('verified modified clicks retain background-tab and private-window behavior',async()=>{
  const f=fixture();assert.equal((await f.send({active:false})).ok,true);
  assert.equal(f.calls[0][0],'tab');assert.equal(f.calls[0][1].active,false);assert.equal(f.calls[0][1].openerTabId,3);assert.equal(f.calls[0][1].windowId,1);
  assert.equal((await f.send({newWindow:true})).ok,true);
  assert.equal(f.calls[1][0],'window');assert.equal(f.calls[1][1].incognito,true);
});
test('activity navigation rejects foreign frames, senders, destinations and stale source pages',async()=>{
  const f=fixture();
  for(const sender of [{...f.sender,id:'other'},{...f.sender,frameId:1},{...f.sender,url:'https://gall.dcinside.com.attacker.example/board/lists/?id=fixture'}])assert.equal((await f.send({},sender)).ok,false);
  for(const url of ['https://example.com/','javascript:alert(1)','https://gall.dcinside.com/board/view/?id=fixture','https://gall.dcinside.com/board/lists/?id=fixture'])assert.equal((await f.send({url})).ok,false);
  f.tab.url='https://gall.dcinside.com/board/lists/?id=another';assert.equal((await f.send({})).ok,false);assert.equal(f.calls.length,0);
});
