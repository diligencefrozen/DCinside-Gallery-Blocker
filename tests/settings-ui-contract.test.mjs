import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('settings UI cache paints cached values before async storage resolves', async () => {
  const source = read('src/ui/shared/ui-settings-cache.js');
  let resolveRead;
  const listeners = [];
  const memory = new Map([
    ['dcb:ui-sync-settings:v1', JSON.stringify({ hideDccon: true, dcbFontScale: 125 })]
  ]);

  const context = {
    console,
    Promise,
    JSON,
    Object,
    localStorage: {
      getItem(key) { return memory.get(key) ?? null; },
      setItem(key, value) { memory.set(key, String(value)); }
    },
    chrome: {
      storage: {
        sync: {
          get() { return new Promise(resolve => { resolveRead = resolve; }); }
        },
        onChanged: { addListener(fn) { listeners.push(fn); } }
      }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'ui-settings-cache.js' });

  const immediate = context.DCBUiSettingsCache.read({ hideDccon: false, dcbFontScale: 100 });
  assert.equal(immediate.hideDccon, true);
  assert.equal(immediate.dcbFontScale, 125);

  resolveRead({ hideDccon: false, dcbFontScale: 110, previewEnabled: true });
  await context.DCBUiSettingsCache.ready;
  const fresh = context.DCBUiSettingsCache.read();
  assert.equal(fresh.hideDccon, false);
  assert.equal(fresh.dcbFontScale, 110);
  assert.equal(fresh.previewEnabled, true);

  listeners[0]({ hideTextCon: { newValue: true } }, 'sync');
  assert.equal(context.DCBUiSettingsCache.read().hideTextCon, true);
});

test('backup v8 stores all sync settings and restores without forced reload', () => {
  const source = read('src/ui/options/options.js');
  assert.match(source, /chrome\.storage\.sync\.get\(null\)/);
  assert.match(source, /version:\s*8/);
  assert.match(source, /storage:\s*\{\s*sync,/s);
  assert.match(source, /await Promise\.all\(jobs\)/);
  assert.match(source, /applyOptionsSettings\(\{ \.\.\.BACKUP_DEFAULTS, \.\.\.sync \}, \{ refreshAsync: false \}\)/);

  const importStart = source.indexOf('function importSettingsFromFile');
  const importEnd = source.indexOf('/* ───── 키워드 차단 관리 ───── */', importStart);
  const importBody = source.slice(importStart, importEnd);
  assert.doesNotMatch(importBody, /location\.reload\s*\(/);
});

test('settings pages do not use a render-blocking Google Fonts stylesheet', () => {
  for (const file of ['src/ui/options/options.html', 'src/ui/popup/popup.html']) {
    const html = read(file);
    assert.doesNotMatch(html, /fonts\.googleapis\.com\/css2/);
    assert.match(html, /ui-settings-cache\.js/);
  }
});

test('popup separates its scrollable main area from the compact donation footer and exposes accessible tabs', () => {
  const html = read('src/ui/popup/popup.html');
  const mainStart = html.indexOf('<main class="popup-main">');
  const mainEnd = html.indexOf('</main>', mainStart);
  const footerStart = html.indexOf('<footer class="popup-footer">');
  const donationStart = html.indexOf('<section class="donation-card"');
  assert.ok(mainStart >= 0 && mainEnd > mainStart);
  assert.ok(footerStart > mainEnd && donationStart > footerStart);
  assert.doesNotMatch(html.slice(footerStart, html.indexOf('</footer>', footerStart)), /position\s*:\s*(?:fixed|sticky)/i);
  assert.match(html, /\.popup-main\{[^}]*overflow-y:auto/);
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.match(html, /<button id="openOptions">고급 설정 열기<\/button>/);
});
