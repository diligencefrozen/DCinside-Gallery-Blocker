const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const sharedStyle = path.join(root, 'src/content/appearance/comment-author.css');
const longUid = 'member_with_an_unusually_long_account_name_123456789';
const longMemo = '오랫동안 참고할 정보가 있는 이용자에게 남긴 아주 긴 개인 메모입니다';
let browser;

before(async () => {
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || (fs.existsSync(chrome) ? chrome : undefined) });
});
after(async () => { await browser?.close(); });

function authorRow(id, { member = false, direct = false, legacy = false, reply = false } = {}) {
  const nickname = member ? '닉네임이아주길어지는고정닉네임사용자' : '글쓴 무척긴닉네임입니다';
  const identity = member
    ? `<span class="nickname in"><em>${nickname}</em></span><a class="writer_nikcon" href="#member"><span>♟</span></a>`
    : direct
      ? `<span class="nickname"><em>${nickname}</em></span><span class="ip">(175.124)</span>`
      : `<span class="nickname me"><em>${nickname}</em><span class="ip">(175.124)</span></span>`;
  return `<li class="ub-content" id="${id}"><div class="${reply ? 'reply_info' : 'cmt_info'} clear">
    ${legacy ? '' : '<div class="addbox">'}<div class="cmt_nickbox">
      <span class="gall_writer ub-writer" data-nick="${nickname}" data-uid="${member ? longUid : ''}" data-ip="${member ? '' : '175.124'}">${identity}</span>
    </div><div class="clear cmt_txtbox"><p class="usertxt ub-word">댓글의 본문은 작성자 정보 오른쪽에 있어야 합니다. 긴 내용과 글자 크기를 조절해도 메모 버튼, 닉네임, 아이피와 겹치지 않아야 합니다.</p></div>
    ${legacy ? '' : '</div>'}</div></li>`;
}

async function fixture(settings = {}, local = {}) {
  const page = await browser.newPage({ viewport: { width: 1240, height: 820 } });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>
    body{margin:24px;font:13px Arial,sans-serif;color:#333}p,ul,li,em{margin:0;padding:0;list-style:none;font-style:normal}
    a{color:inherit;text-decoration:none}.clear::after{content:"";display:block;clear:both;visibility:hidden}
    .comment_box{width:1160px}.cmt_info{position:relative;padding:9px 12px 7px;border-top:1px solid #eee}
    .view_comment .cmt_info{padding:9px 3px 7px}.reply_info{position:relative}
    .cmt_nickbox{float:left;width:152px;margin-right:33px;margin-top:3px;line-height:13px}
    .reply .cmt_nickbox{width:133px;margin-right:23px}.addbox .cmt_nickbox{width:152px}
    .cmt_txtbox{float:left;width:820px;cursor:pointer}.usertxt{float:left;width:820px;line-height:20px;word-break:break-all;overflow:hidden}
    .reply_info .usertxt{position:relative;width:774px;padding-left:16px}.addbox .cmt_txtbox,.addbox .usertxt{width:800px}
    .reply_info .usertxt::before{content:'↳';position:absolute;left:0;top:0;color:#334e9c}
    .reply_box{margin:0 0 12px 30px;border:1px solid #ddd;border-width:0 1px 1px;background:#fafafa}
    .reply_list>li{padding:9px 12px 7px;border-top:1px solid #ddd}
    .comment_box .nickname{font-size:12px;color:#777;vertical-align:top}
    .comment_box .nickname>em{display:inline-block;max-width:84px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;vertical-align:top}
    .comment_box .nickname.in>em{max-width:110px;padding-right:1px}.comment_box .reply .nickname.in>em{max-width:107px}
    .comment_box .nickname .ip{display:inline-block;vertical-align:1px}.ip{font-family:tahoma,sans-serif;font-size:11px;color:#999}
    .nickname.me{background:#e5ebff;padding:0 1px 0 2px}
    .comment_box .addbox .gall_writer{display:inline-flex;align-items:center;max-width:100%}
    .comment_box .addbox .nickname{display:inline-flex;flex:0 0 auto;max-width:100%;white-space:nowrap;overflow:hidden}
    .comment_box .addbox .nickname em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .writer_nikcon{display:inline-block;width:16px;height:16px;background:#e3eaf1;text-align:center}
    .user_data{position:absolute;top:100%;left:0;width:210px;background:white;border:1px solid #999;z-index:9999}
    .user_data button{width:100%;height:32px;border:0;background:#eef3fd;text-align:left}
  </style><body><div class="view_comment"><div class="comment_box"><ul class="cmt_list">
    ${authorRow('nested')}${authorRow('member', { member: true })}${authorRow('direct', { direct: true })}
    <li class="reply"><div class="reply_box"><ul class="reply_list">
      ${authorRow('reply-current', { reply: true })}${authorRow('reply-legacy', { reply: true, legacy: true })}
    </ul></div></li></ul></div></div></body></html>`);
  if (fs.existsSync(sharedStyle) && process.env.DCB_SKIP_COMMENT_AUTHOR_CSS !== '1') {
    await page.addStyleTag({ path: sharedStyle });
  }
  await page.evaluate(({ sync, local }) => {
    const listeners = [];
    window.fixtureStore = { sync, local };
    window.changeSettings = (patch, area = 'sync') => {
      const changes = {};
      for (const [key, value] of Object.entries(patch)) {
        changes[key] = { oldValue: fixtureStore[area][key], newValue: value };
        fixtureStore[area][key] = value;
      }
      for (const listener of listeners) listener(changes, area);
    };
    function storageArea(area) {
      return {
        get(defaults, callback) {
          const value = defaults == null ? { ...fixtureStore[area] } : { ...defaults, ...fixtureStore[area] };
          callback?.(value);
          return Promise.resolve(value);
        },
        set(patch, callback) { changeSettings(patch, area); callback?.(); return Promise.resolve(); }
      };
    }
    window.chrome = { runtime: { onMessage: { addListener() {} } }, storage: {
      sync: storageArea('sync'), local: storageArea('local'), onChanged: { addListener(listener) { listeners.push(listener); } }
    } };
    window.nativeMenuClicks = 0;
    document.addEventListener('click', event => {
      const nick = event.target.closest('.nickname');
      if (!nick) return;
      const writer = nick.closest('.gall_writer');
      if (writer.querySelector('.user_data')) return;
      const menu = document.createElement('div');
      menu.className = 'user_data';
      menu.innerHTML = '<ul class="user_data_list"><li><button type="button">갤로그 보기</button></li></ul>';
      menu.querySelector('button').addEventListener('click', () => { nativeMenuClicks++; });
      writer.append(menu);
    });
  }, { sync: { showUidBadge: true, userMemoEnabled: true, showMemberIpInfo: true, ...settings },
    local: { userMemos: { [`uid:${longUid}`]: { memo: longMemo, color: '#506e9c' } }, ...local } });
  for (const file of ['appearance/font-config.js', 'user/uid-badge.js', 'user/member-ip-view.js', 'user/user-memo.js', 'appearance/font-manager.js']) {
    await page.addScriptTag({ path: path.join(root, 'src/content', file) });
  }
  await settle(page);
  return page;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertAuthorBounds(page, ids = ['nested', 'member', 'direct', 'reply-current', 'reply-legacy']) {
  const measurements = await page.evaluate(ids => ids.map(id => {
    const row = document.getElementById(id);
    const host = row.querySelector('.cmt_nickbox');
    const box = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width }; };
    return { id, host:box(host), body:box(row.querySelector('.cmt_txtbox')),
      items:[...host.querySelectorAll('.gall_writer,.nickname,.ip,.dc-member-ip-chip,.dcb-writer-tools,.dcb-uid-badge,.dcb-user-memo-trigger')].map(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return { name:node.className, rect:box(node), lines:new Set([...range.getClientRects()].map(r => Math.round(r.top))).size,
          textBounds: range.getBoundingClientRect().toJSON(), fontSize:parseFloat(getComputedStyle(node).fontSize) };
      }),
      nick:[...host.querySelectorAll('.nickname>em')].map(node => ({ overflow:getComputedStyle(node).overflowX, ellipsis:getComputedStyle(node).textOverflow }))
    };
  }), ids);
  for (const row of measurements) {
    assert.ok(row.host.right < row.body.left, `${row.id}: author and body retain separate columns`);
    for (const item of row.items) {
      assert.ok(item.rect.left >= row.host.left - 1 && item.rect.right <= row.host.right + 1,
        `${row.id}: ${item.name} stays within ${row.host.width}px author column (${JSON.stringify(item.rect)})`);
      if (item.name === 'ip') assert.equal(item.lines, 1, `${row.id}: IP remains a single unbroken token`);
      if (item.name.includes('dc-member-ip-chip')) {
        assert.ok(item.textBounds.right <= item.rect.right - 1, `${row.id}: provider text is not squeezed or clipped`);
        assert.ok(item.rect.width >= 34, `${row.id}: provider chip keeps a readable width`);
      }
    }
    for (const nick of row.nick) {
      assert.equal(nick.overflow, 'hidden', `${row.id}: long nickname is bounded`);
      assert.equal(nick.ellipsis, 'ellipsis', `${row.id}: clipped nickname has an ellipsis`);
    }
  }
}

test('long authors, nested and sibling IPs, account IDs and saved memos stay inside native comment columns', async () => {
  const page = await fixture();
  try {
    await page.locator('#member .dcb-user-memo-trigger.has-memo').waitFor();
    assert.equal(await page.locator('#nested .nickname > .ip + .dc-member-ip-chip').count(), 1);
    assert.equal(await page.locator('#direct .gall_writer > .ip + .dc-member-ip-chip').count(), 1);
    await assertAuthorBounds(page);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive:true });
    await page.screenshot({ path:path.join(root, 'test-results/comment-author-layout.png'), fullPage:true });
  } finally { await page.close(); }
});

test('140 percent body text and independently larger author text preserve layout; OFF restores native text', async () => {
  const page = await fixture();
  try {
    const sizes = () => page.evaluate(() => ({ body:getComputedStyle(document.querySelector('#nested .usertxt')).fontSize,
      nick:getComputedStyle(document.querySelector('#nested .nickname')).fontSize }));
    const native = await sizes();
    await page.evaluate(() => changeSettings({ dcbApplyFontToDc:true, dcbFontScale:140 }));
    assert.equal(parseFloat((await sizes()).body), 18.2);
    await assertAuthorBounds(page);
    const largeAuthors = await page.addStyleTag({ content:'.comment_box .nickname{font-size:16.8px!important}.comment_box .ip{font-size:15.4px!important}' });
    await assertAuthorBounds(page);
    await largeAuthors.evaluate(node => node.remove());
    await page.evaluate(() => changeSettings({ dcbApplyFontToDc:false }));
    assert.deepEqual(await sizes(), native);
    await assertAuthorBounds(page);
  } finally { await page.close(); }
});

for (const [label, settings] of [
  ['UID alone', { showUidBadge:true, userMemoEnabled:false, showMemberIpInfo:false }],
  ['memo alone', { showUidBadge:false, userMemoEnabled:true, showMemberIpInfo:false }],
  ['provider alone', { showUidBadge:false, userMemoEnabled:false, showMemberIpInfo:true }]
]) {
  test(`${label} and feature toggles preserve author layout`, async () => {
    const page = await fixture(settings);
    try {
      await assertAuthorBounds(page);
      await page.evaluate(() => changeSettings({ showUidBadge:true, userMemoEnabled:true, showMemberIpInfo:true }));
      await settle(page);
      await assertAuthorBounds(page);
      await page.evaluate(() => changeSettings({ showUidBadge:false, userMemoEnabled:false, showMemberIpInfo:false }));
      await settle(page);
      assert.equal(await page.locator('.dcb-uid-badge,.dcb-user-memo-trigger,.dc-member-ip-chip').count(), 0);
      await page.evaluate(settings => changeSettings(settings), settings);
      await settle(page);
      await assertAuthorBounds(page);
    } finally { await page.close(); }
  });
}

test('new replies are enhanced without a reload', async () => {
  const page = await fixture({ dcbApplyFontToDc:true, dcbFontScale:140 });
  try {
    await page.locator('.reply_list').evaluate((list, html) => list.insertAdjacentHTML('beforeend', html), authorRow('dynamic', { reply:true }));
    await page.locator('#dynamic .dcb-user-memo-trigger').waitFor();
    await page.waitForFunction(() => document.querySelector('#dynamic .usertxt')?.hasAttribute('data-dcb-font-size'));
    await assertAuthorBounds(page, ['dynamic']);
    assert.equal(await page.locator('#dynamic .dc-member-ip-chip').count(), 1);
  } finally { await page.close(); }
});

test('native author menu can extend beyond the author column and memo editing remains clickable', async () => {
  const page = await fixture();
  try {
    await page.locator('#member .nickname em').click();
    const menu = page.locator('#member .user_data button');
    await menu.click({ position:{ x:190, y:16 } });
    assert.equal(await page.evaluate(() => nativeMenuClicks), 1);
    await page.locator('#member .user_data').evaluate(node => node.remove());
    await page.locator('#member .dcb-user-memo-trigger').click();
    assert.equal(await page.locator('#dcb-user-memo-modal.open').count(), 1);
    assert.equal(await page.locator('#dcb-user-memo-textarea').inputValue(), longMemo);
    await page.locator('#dcb-user-memo-textarea').fill('수정된 메모');
    await page.locator('#dcb-user-memo-modal [data-act="save"]').click();
    assert.equal(await page.evaluate(uid => fixtureStore.local.userMemos[`uid:${uid}`].memo, longUid), '수정된 메모');
    await assertAuthorBounds(page);
  } finally { await page.close(); }
});
