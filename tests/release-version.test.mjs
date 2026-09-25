import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = { Object, Math };
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/shared/release-version.js'), 'utf8'), context);
const version = context.DCBReleaseVersion;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const background = fs.readFileSync(path.join(root, 'src/background/background.js'), 'utf8');

test('four-part release versions normalize and compare numerically', () => {
  assert.equal(version.normalize('v7.3.42.2026'), '7.3.42.2026');
  assert.equal(version.compare('7.3.41.2026', '7.3.42.2026'), -1);
  assert.equal(version.compare('7.3.42.2026', '7.3.42.2026'), 0);
  assert.equal(version.compare('7.3.43.2026', '7.3.42.2026'), 1);
  assert.equal(version.compare('7.3.100.2026', '7.3.42.2026'), 1);
});

test('unsupported formats fail explicitly instead of using string ordering', () => {
  for (const invalid of ['', '7.3.42', '7.3.42.2026-beta', 'latest']) {
    assert.equal(version.normalize(invalid), '');
    assert.equal(version.compare(invalid, '7.3.42.2026'), null);
  }
});

test('7.3.42.2026 is the manifest source of truth for installed release status', () => {
  assert.equal(manifest.version, '7.3.42.2026');
  assert.equal(version.compare('7.3.42.2026', manifest.version) > 0, false);
  assert.equal(version.compare('7.3.43.2026', manifest.version) > 0, true);
  assert.match(background, /chrome\.runtime\.getManifest\(\)\.version/);
  assert.match(background, /comparePublishedVersions\(publishedVersion, installedVersion\) > 0/);
});
