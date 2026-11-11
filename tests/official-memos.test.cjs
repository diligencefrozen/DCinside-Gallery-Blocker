const test=require('node:test');
const assert=require('node:assert/strict');

require('../src/ui/options/official-memos.js');
const {parse,parseText}=globalThis.DCBOfficialMemos;
// Anonymous synthetic entries exported with the two official web interfaces.
const pc='eyJ1c2VyTWVtb0xpc3QiOlt7ImdhbGxlcnlJZCI6ImJnMyIsInZhbHVlIjpbImZpeHR1cmV1c2VyIl0sIm1lbW8iOlsi6rCk65+s66asIOuplOuqqCJdLCJjb2xvciI6WyIjOTk5OTk5Il19LHsiZ2FsbGVyeUlkIjoiIiwidmFsdWUiOlsiZml4dHVyZXVzZXIiXSwibWVtbyI6WyLtlanshLEg66mU66qoIl0sImNvbG9yIjpbIiM5OTk5OTkiXX1dfQ==';
const mobile='eyJ1c2VyTWVtb0xpc3QiOlt7ImdhbGxlcnlJZCI6IiIsIm1lbW8iOlsiXHVkNTY5XHVjMTMxIFx1YmE1NFx1YmFhOCJdLCJ2YWx1ZSI6WyJmaXh0dXJldXNlciJdLCJjb2xvciI6WyIjMzM2Njk5Il19LHsiZ2FsbGVyeUlkIjoiZGUiLCJtZW1vIjpbIlx1YWMyNFx1YjdlY1x1YjlhYyBcdWJhNTRcdWJhYTgiXSwidmFsdWUiOlsiZml4dHVyZXVzZXIiXSwiY29sb3IiOlsiIzEyMzQ1NiJdfV0sImFwcFNldHRpbmdMaXN0IjpbeyJrZXkiOiJzZXR0aW5ncyIsInZhbHVlIjpbXX1dLCJ1bmlxdWUiOiJkY2luc2lkZSIsInZlcnNpb24iOjR9';
test('official desktop and mobile exports retain global and gallery-specific identities',()=>{
  for(const [source,gallery] of [[pc,'bg3'],[mobile,'de']]){
    const {entries,invalid}=parse(source);
    assert.equal(invalid,0);
    assert.equal(entries.size,2);
    assert.equal(entries.get('uid:fixtureuser').memo,'합성 메모');
    assert.equal(entries.get('gallery:'+gallery+':uid:fixtureuser').memo,'갤러리 메모');
    assert.equal(entries.get('gallery:'+gallery+':uid:fixtureuser').scope,gallery);
  }
});
test('unrecognized scope, file shape or version cannot silently become global memos',()=>{
  const data=JSON.parse(Buffer.from(mobile,'base64'));
  const encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64');
  assert.throws(()=>parse(encode({...data,version:99})));
  assert.throws(()=>parse(encode({userMemos:{}})));
  const [group]=data.userMemoList;
  for(const field of [{galleryId:null},{color:[]},{galleryId:'../x'}])
    assert.throws(()=>parse(encode({userMemoList:[{...group,...field}]})));
  assert.equal(parse(encode({userMemoList:[group,group]})).duplicates,1);
});
test('review flags ambiguous lines and preserves explicit identifiers and memo punctuation',()=>{
  const {entries,duplicates,badLines}=parseText('sample-user\t한글-메모\r\n192.0.2.10-테스트 메모\n닉네임\nsample-user-ambiguous\n192.0.2.10-중복','sample');
  assert.equal(entries.get('gallery:sample:uid:sample-user').memo,'한글-메모');
  assert.equal(entries.get('gallery:sample:ip:192.0.2.10').ip,'192.0.2.10');
  assert.equal(duplicates,1);
  assert.deepEqual(badLines,[3,4]);
});
