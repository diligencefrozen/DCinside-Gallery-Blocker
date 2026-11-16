const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");

// Rendered forms of the public block_word-tmpl and user_memo_row-tmpl,
// fetched 2026-11-16. These are synthetic data, not signed-in-account evidence.
const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
function blockPanel(selector, enabled, rows = {}) {
  return `<div class="${selector}">${selector === "part_setting" ? '<span id="sel_gall_name" data-id="fixture^MI" data-gtype="migall">연습 갤러리</span>' : ""}
    <div class="setting_onoff"><button class="sp_img ${enabled ? "on" : ""}"><span class="blind">${enabled ? "on" : "off"}</span></button></div>
    <div class="word_wrap ${enabled ? "" : "setting_off"}">${["word","id","nick","ip"].map(type =>
    `<div class="set_cont add_text"><input name="${type}" ${enabled ? "" : "disabled"}><ul class="block_list word">${(rows[type] || []).map(value =>
      `<li><span class="block_word">${escape(value)}</span><button><span class="blind">차단설정 단어 삭제</span></button></li>`).join("")}</ul></div>`).join("")}</div></div>`;
}
function blocks(globalOn = false, partOn = true, rows = {word:["같은 단어"],id:["fixtureuser"],nick:["닉네임"],ip:["192.0"]}) {
  return `<div id="user_block">${blockPanel("all_setting",globalOn,rows)}${blockPanel("part_setting",partOn,rows)}</div>`;
}
function memos(all = true, rows = [{value:"fixtureuser",memo:"메모 & <특수>-문자",color:"#ff00aa",uid:true},{value:"192.0",memo:"IP 접두부",color:"#123456"}]) {
  return `<input id="gallery_id" value="fixture"><div id="user_memo_config"><div class="tab_menubox"><button class="all ${all ? "on" : ""}">전체</button><button class="${all ? "" : "on"}">현재</button></div>
    <div id="user_memo_setting" class="tabcontent gall_setting"><div id="user_memo_table"><span class="user_memo_count">${rows.length}</span><ul class="memo_list"><li class="empty_box" style="display:none">빈 목록</li>${rows.map(row =>
      `<li><div class="btn-wrap"><button class="btn"><span class="checkbox"><input type="checkbox" class="chk_um_list" value="${escape(row.value+"-"+row.memo)}"><label><span class="nik ${row.uid ? "icon" : ""}">${escape(row.value)}</span><span class="mone" style="color:${row.color}">-${escape(row.memo)}</span></label></span></button></div></li>`).join("")}</ul></div>
    <div id="user_memo_search"><input class="int"></div></div></div>`;
}

for (const [name, engine] of Object.entries({chromium,firefox})) test(name + " direct collector preserves types, scope and raw state without site writes", async t => {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const requests = [];
  await page.route("**/*", route => { requests.push(route.request().url()); return route.fulfill({contentType:"text/html; charset=utf-8",body:blocks()+memos()}); });
  await page.goto("https://gall.dcinside.com/mini/board/lists/?id=fixture");
  await page.addScriptTag({path:"src/content/dc-native-records-collector.js"});
  await page.evaluate(() => {
    window.siteCalls = 0;
    window.ub_load_conf = window.ub_save_conf = window.UserMemo = () => {siteCalls++; throw Error("site mutation");};
    Object.defineProperty(window,"localStorage",{get(){siteCalls++;throw Error("site storage accessed")}});
  });
  const before = await page.locator("body").innerHTML(), requestCount = requests.length;
  const result = await page.evaluate(() => DCBNativeCollector.collect());
  assert.equal(result.ok,true);
  assert.equal(result.records.length,10);
  assert.equal(result.coverage.complete,false);
  assert.equal(result.href,"https://gall.dcinside.com/mini/board/lists/?id=fixture");
  assert.deepEqual(result.records.slice(0,4).map(r=>[r.targetType,r.enabled,r.scope,r.value]),[
    ["keyword",false,"global","같은 단어"],["uid",false,"global","fixtureuser"],["nick",false,"global","닉네임"],["ip",false,"global","192.0"]]);
  assert.equal(result.records[1].nativeTargetType,"id");
  assert.equal(result.records[1].identityVerified,true);
  assert.deepEqual(result.records.slice(4,8).map(r=>[r.enabled,r.scope,r.galleryId,r.galleryType]),Array(4).fill([true,"gallery","fixture","MI"]));
  assert.equal(result.records[8].memo,"메모 & <특수>-문자");
  assert.equal(result.records[8].color,"#ff00aa");
  assert.equal(result.records[8].identityVerified,true);
  assert.equal(result.records[9].value,"192.0");
  assert.ok(result.issues.some(i=>i.code==="LIVE_ACCOUNT_UNVERIFIED"));
  assert.equal(await page.evaluate(()=>siteCalls),0);
  assert.equal(requests.length,requestCount);
  assert.equal(await page.locator("body").innerHTML(),before);

  await page.setContent(memos(false));
  const scoped = await page.evaluate(() => DCBNativeCollector.collect());
  assert.ok(scoped.records.every(r=>r.scope==="gallery" && r.galleryId==="fixture" && r.galleryType==="MI"));
  await page.locator("#user_memo_search .int").fill("특수");
  await page.locator("#user_memo_config").evaluate(el=>el.insertAdjacentHTML("beforeend",'<div class="paging"><button data-page="2">다음</button></div>'));
  const partial = await page.evaluate(() => DCBNativeCollector.collect());
  assert.equal(partial.coverage.memos,"filtered-dom");
  assert.ok(partial.issues.some(i=>i.code==="MEMO_SEARCH_FILTERED"));
  assert.ok(partial.issues.some(i=>i.code==="PAGINATION_PRESENT"));

  await page.setContent(blocks(false,true,{word:[]}));
  const empty = await page.evaluate(() => DCBNativeCollector.collect());
  assert.equal(empty.records.length,0);
  assert.ok(empty.issues.some(i=>i.code==="EMPTY_DOM_ONLY"));
  await page.setContent('<div id="user_block" style="display:none"></div>');
  const closed = await page.evaluate(() => DCBNativeCollector.collect());
  assert.equal(closed.ok,false);
  assert.ok(closed.issues.some(i=>i.code==="MODAL_NOT_OPEN"));

  await page.setContent(blocks()+memos());
  await page.locator("#user_block .all_setting .block_word").first().evaluate(el=>el.className="changed_word");
  await page.locator(".user_memo_count").evaluate(el=>el.textContent="30");
  const changed = await page.evaluate(() => DCBNativeCollector.collect());
  assert.ok(changed.issues.some(i=>i.code==="BLOCK_ROW_CHANGED"));
  assert.ok(changed.issues.some(i=>i.code==="MEMO_COUNT_MISMATCH"));
  assert.ok(changed.records.every(r=>r.kind==="block"));

  await page.setContent(blocks());
  const racing = await page.evaluate(() => {
    setTimeout(()=>document.querySelector(".block_word").textContent="변경 중",20);
    return DCBNativeCollector.collect();
  });
  assert.equal(racing.ok,false);
  assert.deepEqual(racing.records,[]);

  await page.goto("https://gall.dcinside.com.attacker.example/");
  await page.addScriptTag({path:"src/content/dc-native-records-collector.js"});
  assert.equal((await page.evaluate(()=>DCBNativeCollector.collect())).ok,false);
});

test("collector caps large DOM lists without returning a truncated import", async t => {
  const browser = await chromium.launch();
  t.after(()=>browser.close());
  const page = await browser.newPage();
  await page.route("**/*",route=>route.fulfill({contentType:"text/html",body:blocks(true,false,{word:Array.from({length:5001},(_,i)=>"word"+i)})}));
  await page.goto("https://gall.dcinside.com/board/lists/?id=fixture");
  await page.addScriptTag({path:"src/content/dc-native-records-collector.js"});
  const result = await page.evaluate(()=>DCBNativeCollector.collect());
  assert.equal(result.ok,false);
  assert.equal(result.records.length,0);
  assert.match(result.issues[0].message,/10,000/);
});
