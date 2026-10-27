import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('new installation keeps instant user blocking as the approved default', () => {
  const background = read('src/background/background.js');
  const probe = read('src/content/user/ctx-probe.js');
  const popup = read('src/ui/popup/popup.js');
  const options = read('src/ui/options/options.js');
  assert.match(background, /patch\.userBlockTriggerMode\s*=\s*"instant"/);
  assert.match(probe, /userBlockTriggerModeCache\s*=\s*"instant"/);
  assert.match(probe, /return USER_BLOCK_TRIGGER_MODES\.has\(v\) \? v : "instant"/);
  assert.match(popup, /userBlockTriggerMode:\s*"instant"/);
  assert.match(options, /userBlockTriggerMode:\s*"instant"/);
  assert.match(probe, /userBlockTriggerModeCache === "instant"/);
});

test('access guard accepts plain and id= gallery identifiers before URL parsing', () => {
  const source = read('src/content/gallery/access-guard.js');
  assert.match(source, /if \(\/\^id\\s\*=\\s\*\/i\.test\(raw\)\)/);
  assert.ok(source.includes('if (/^[a-z0-9_-]+$/i.test(raw))'));
  assert.match(source, /let lastRedirectHref = ""/);
  assert.match(source, /if \(lastRedirectHref === location\.href\) return;/);
});


test('preview rerenders keep the existing shell until replacement content is ready', () => {
  const source = read('src/content/core/content_script.js');
  const resetStart = source.indexOf('function resetPreviewSurface');
  const resetEnd = source.indexOf('function handlePreviewOverlayClick', resetStart);
  const reset = source.slice(resetStart, resetEnd);
  assert.doesNotMatch(reset, /overlay\.replaceChildren\(\)/);
  assert.match(reset, /Keep the current panel until the next render/);
});

