import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const background = fs.readFileSync('src/background/background.js', 'utf8');
const popupHtml = fs.readFileSync('src/ui/popup/popup.html', 'utf8');
const popupJs = fs.readFileSync('src/ui/popup/popup.js', 'utf8');
const statsSource = fs.readFileSync('src/shared/block-stats.js', 'utf8');

test('block stats helper loads before normal content scripts', () => {
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.deepEqual(manifest.content_scripts[0].js, ['src/shared/block-stats.js']);
  assert.match(statsSource, /MutationObserver/);
  assert.match(statsSource, /dcb\.stats\.sync/);
});

test('background keeps per-page and cumulative block counts without navigation reset races', () => {
  assert.match(background, /BLOCK_STATS_TOTAL_KEY/);
  assert.match(background, /chrome\.storage\.session/);
  assert.match(background, /setCountBadge/);
  assert.match(background, /dcb\.stats\.get/);
  assert.match(background, /dcb\.stats\.pageStart/);
  assert.match(background, /pageBlockTokens/);
  assert.match(background, /fallback \|\| sender\?\.documentId/);
  assert.match(background, /syncBlockStats/);
  assert.match(background, /queueBlockStatsMutation/);
  assert.match(background, /pageStart가 유실되어도 새 활성 문서의 첫 집계를 그대로 받아들인다/);
  assert.match(background, /changeInfo\.status === "complete"/);
  assert.match(background, /reconcileLiveBlockStats\(tabId\)/);
});

test('popup exposes current-page, cumulative, and category stats', () => {
  assert.match(popupHtml, /id="blockStatsPageTotal"/);
  assert.match(popupHtml, /id="blockStatsCumulativeTotal"/);
  assert.match(popupHtml, /id="blockStatsBreakdown"/);
  assert.match(popupJs, /BLOCK_STATS_LABELS/);
  assert.match(popupJs, /loadBlockSummary\(\)/);
  assert.match(popupJs, /dcb\.stats\.updated/);
  assert.match(popupJs, /dcb\.stats\.live/);
  assert.match(background, /dcb\.stats\.live/);
  assert.match(background, /requestLiveBlockStats/);
  assert.match(background, /broadcastBlockStats/);
});

test('update notice is update-only, GitHub-sourced, one-shot per version, and auto-hides', () => {
  assert.match(background, /reason === "update"/);
  assert.match(background, /previousVersion/);
  assert.match(background, /UPDATE_NOTICE_KEY/);
  assert.match(background, /UPDATE_NOTICE_SEEN_VERSION_KEY/);
  assert.match(background, /api\.github\.com\/repos\/diligencefrozen\/DCinside-Gallery-Blocker\/releases\/latest/);
  assert.match(background, /api\.github\.com\/repos\/diligencefrozen\/DCinside-Gallery-Blocker\/tags\?per_page=100/);
  assert.match(background, /publishedVersion !== installedVersion/);
  assert.match(popupHtml, /현재 최신 버전입니다\./);
  assert.doesNotMatch(popupHtml, />7\.3\.39\.2026</);
  assert.match(popupJs, /dcb\.release\.status/);
  assert.match(popupJs, /dcb\.updateNotice\.consume/);
  assert.match(popupJs, /version:\s*publishedVersion/);
  assert.match(background, /updateNoticeMutationQueue/);
  assert.match(background, /show:\s*false/);
  assert.match(background, /show:\s*true/);
  assert.match(popupJs, /result\.show !== true/);
  assert.match(popupJs, /setTimeout\(\(\) => \{/);
  assert.match(popupJs, /4000/);
  assert.doesNotMatch(popupHtml, /dismissUpdateNotice/);
});

test('GitHub version lookup has the required MV3 network permission without blocking popup stats', () => {
  assert.ok(manifest.host_permissions.includes('https://api.github.com/*'));
  assert.match(manifest.content_security_policy.extension_pages, /https:\/\/api\.github\.com/);
  assert.match(popupHtml, /id="blockStatsVersion" hidden/);
  assert.match(popupJs, /loadReleaseStatus\(\)/);
  assert.match(popupJs, /GitHub 조회는 차단 현황 렌더링과 분리/);
});


test('content-side stats use absolute snapshots, retry transient failures, and deduplicate elements', async () => {
  const sent = [];
  let syncAttempts = 0;
  class FakeElement {}
  class FakeFragment {}
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
  }
  const runtime = {
    lastError: null,
    onMessage: { addListener() {} },
    sendMessage(message, callback) {
      sent.push(message);
      if (message.type === 'dcb.stats.pageStart') {
        callback?.({ ok: true });
        return;
      }
      if (message.type === 'dcb.stats.sync') {
        syncAttempts += 1;
        if (syncAttempts === 1) {
          runtime.lastError = { message: 'service worker waking' };
          callback?.();
          runtime.lastError = null;
        } else {
          callback?.({ ok: true });
        }
      }
    }
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Element: FakeElement,
    DocumentFragment: FakeFragment,
    MutationObserver: FakeMutationObserver,
    document: {
      documentElement: {},
      querySelectorAll() { return []; }
    },
    window: { addEventListener() {} },
    chrome: { runtime }
  };
  context.globalThis = context;
  vm.runInNewContext(statsSource, context, { filename: 'block-stats.js' });
  const target = new FakeElement();
  assert.equal(context.DCBBlockStats.report(target, 'comments'), true);
  assert.equal(context.DCBBlockStats.report(target, 'keywords'), false);
  await new Promise((resolve) => setTimeout(resolve, 900));
  const pageStart = sent.find((message) => message.type === 'dcb.stats.pageStart');
  const syncs = sent.filter((message) => message.type === 'dcb.stats.sync');
  assert.ok(pageStart?.pageId);
  assert.ok(syncs.length >= 2);
  assert.equal(syncs.at(-1).pageId, pageStart.pageId);
  assert.equal(syncs.at(-1).stats.total, 1);
  assert.equal(syncs.at(-1).stats.byCategory.comments, 1);
  assert.equal(syncs.at(-1).stats.byCategory.keywords, undefined);
  assert.match(statsSource, /절대값 스냅샷/);
});




test('block stats can recover counts from the live DOM and CSS-only blockers', () => {
  assert.match(statsSource, /RECOVERY_RULES/);
  assert.match(statsSource, /STYLE_RECOVERY_RULES/);
  assert.match(statsSource, /dcb-hide-comment-style/);
  assert.match(statsSource, /dcb-hide-img-comment-style/);
  assert.match(statsSource, /dcb-hide-dccon-style/);
  assert.match(statsSource, /dcb-hide-textcon-style/);
  assert.match(statsSource, /function reconcile\(/);
  assert.match(statsSource, /message\?\.type !== "dcb\.stats\.snapshot"/);
  assert.match(statsSource, /reconcile\(document\)/);
  assert.match(background, /setBadgeText\(\{ tabId, text \}\)/);
  assert.match(background, /화면 숫자는 storage I\/O보다 먼저 갱신/);
});

test('comment-heavy filters avoid full-document rescans on every mutation', () => {
  const imageComment = fs.readFileSync('src/content/cleaner/cleaner-img-comment.js', 'utf8');
  const accountActivity = fs.readFileSync('src/content/user/account-activity-blocker.js', 'utf8');
  const keywordHider = fs.readFileSync('src/content/keyword/keyword-hider.js', 'utf8');

  assert.doesNotMatch(imageComment, /new MutationObserver/);
  assert.doesNotMatch(imageComment, /hideExistingElements/);
  assert.match(imageComment, /CSS 규칙은 이후 추가되는 이미지 댓글에도 자동 적용/);

  assert.match(accountActivity, /queueIncrementalScan/);
  assert.match(accountActivity, /scanScope/);
  assert.doesNotMatch(accountActivity, /new MutationObserver\(\(\) => scheduleScan\(100\)\)/);

  assert.match(keywordHider, /processPendingRoots/);
  assert.match(keywordHider, /collectScoped/);
  assert.match(keywordHider, /applyKeywordHide\(\{ reset: true \}\)/);
});

test('usage counters are local runtime data, not part of settings backup', () => {
  const optionsSource = fs.readFileSync('src/ui/options/options.js', 'utf8');
  const keyList = optionsSource.match(/const PERSISTENT_LOCAL_BACKUP_KEYS = \[(.*?)\];/s)?.[1] || '';
  assert.doesNotMatch(keyList, /dcbBlockStatsTotal/);
  assert.doesNotMatch(keyList, /dcbUpdateNotice/);
});
