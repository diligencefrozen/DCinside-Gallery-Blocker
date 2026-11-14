const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const {chromium,firefox}=require('playwright');
require('../src/ui/options/official-memos.js');

test('explicit copied block lists use identifiers, memo mode never creates blocks',()=>{
  const text='sample_user-설명, 유지\n192.0.2.10-메모\nuid:sample_user\n예시닉';
  const block=DCBOfficialMemos.parseRecords(text,'global','block');
  assert.equal(block.entries.size,0);
  assert.deepEqual(new Set(block.blocks),new Set(['sample_user','192.0','nick-exact:예시닉']));
  assert.equal(block.duplicates,1);
  const memo=DCBOfficialMemos.parseRecords(text,'gallery_test','memo');
  assert.equal(memo.blocks.length,0);
  assert.equal(memo.entries.size,2);
  assert.equal(memo.entries.get('gallery:gallery_test:uid:sample_user').memo,'설명, 유지');
  assert.throws(()=>DCBOfficialMemos.parseRecords(text,'gallery_test','block'));
});

for(const [engine,type] of Object.entries({chromium,firefox}))test(engine+' records workflow and long title layout',async t=>{
  const b=await type.launch({headless:true,executablePath:type.executablePath()});t.after(()=>b.close());
  const p=await b.newPage({viewport:{width:1000,height:900}});p.setDefaultTimeout(6000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const source=fs.readFileSync('src/ui/options/options.html','utf8');
  await p.setContent('<style>body{background:#10151c;color:#ddd;font:14px system-ui;--fg:#ddd}.card{max-width:680px;margin:auto}</style>'+source.match(/<style>[\s\S]*?<\/style>/)[0]+source.slice(source.indexOf('<section class="card" id="settingsDcRecords">'),source.indexOf('<section class="card support-card">')));
  await p.evaluate(()=>{
    window.chrome={storage:{local:{get:async()=>({})}}};
    window.getUserMemos=async()=>({});window.getStoredUidList=async()=>[];
    window.DCBUserBlockStore={makeBlockKey:v=>v};
  });
  await p.addScriptTag({path:'src/ui/options/official-memos.js'});
  await p.addScriptTag({path:'src/ui/options/dc-records-import.js'});
  await p.locator('#recordsPaste').fill('sample_user-테스트 메모');
  await p.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('메모 1건'));
  assert.ok(!(await p.locator('#settingsDcRecords').innerText()).includes('global'));
  await p.locator('#recordsScope').selectOption('gallery');
  await p.locator('#memoTextScope').fill('gallery_test');
  await p.waitForFunction(()=>document.querySelector('#officialMemoRows').textContent.includes('갤러리: gallery_test'));
  await p.locator('#recordsKind').selectOption('block');
  await p.waitForFunction(()=>document.querySelector('#officialMemoPreview').textContent.includes('차단 1건'));
  assert.equal(await p.locator('#officialMemoApply').isDisabled(),true);
  await p.locator('#recordsConfirm').check();
  assert.equal(await p.locator('#officialMemoApply').isEnabled(),true);
  assert.ok((await p.locator('#officialMemoRows').innerText()).includes('회원 ID: sample_user'));
  fs.mkdirSync('test-results/records-ip-fix',{recursive:true});
  await p.locator('#settingsDcRecords').screenshot({path:`test-results/records-ip-fix/${engine}-import.png`});
  await p.locator('#recordsReset').click();
  assert.equal(await p.locator('#officialMemoApply').isDisabled(),true);
  assert.equal(await p.locator('#recordsPaste').inputValue(),'');
  await p.locator('#memoImportFormat').selectOption('web');
  assert.equal(await p.locator('#recordsPaste').isVisible(),false);
  assert.equal(await p.locator('#officialMemoFile').isVisible(),true);
  await p.setViewportSize({width:420,height:900});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.setViewportSize({width:1000,height:900});
  await p.setContent('<style>body{font:13px Arial}table{width:840px;table-layout:fixed;border-collapse:collapse}td{padding:5px 4px;height:24px;border-bottom:1px solid #ddd}.gall_tit a{color:#333;text-decoration:none}td.gall_tit{overflow:hidden}</style><table><col width="500"><col width="170"><col width="80"><col width="90"><tbody>'+Array.from({length:6},(_,i)=>'<tr><td class="gall_tit ub-word"><span class="dcb-activity-badge" data-dcb-writer-activity="글 12345 · 댓 123456" title="합성 활동량"></span><a href="#">'+('긴 제목 테스트 '.repeat(i+1))+'</a> <a class="reply_numbox" href="#">[125]</a></td><td>작성자</td><td>12:34</td><td>조회수</td></tr>').join('')+'</tbody></table>');
  await p.evaluate(()=>document.documentElement.classList.add('dcb-show-writer-activity'));
  await p.addStyleTag({path:'src/content/appearance/writer-layout.css'});
  const rows=await p.locator('td.gall_tit').evaluateAll(cells=>cells.map(c=>{
    const title=c.querySelector('a').getBoundingClientRect(),reply=c.querySelector('.reply_numbox').getBoundingClientRect(),badge=c.querySelector('.dcb-activity-badge').getBoundingClientRect();
    return {sameLine:Math.abs(title.y-reply.y)<8 && Math.abs(title.y-badge.y)<8,noOverlap:reply.right<=badge.left+1,height:c.getBoundingClientRect().height};
  }));
  assert.ok(rows.every(r=>r.sameLine&&r.noOverlap),JSON.stringify(rows));
  assert.ok(rows.every(r=>Math.abs(r.height-rows[0].height)<=1),JSON.stringify(rows));
  await p.screenshot({path:`test-results/records-ip-fix/${engine}-titles.png`});
  assert.deepEqual(errors,[]);
});
