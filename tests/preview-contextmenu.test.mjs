import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, '../src/content/core/content_script.js'), 'utf8');

test('page preview leaves writer right-clicks to user block actions', () => {
  assert.match(source, /const PREVIEW_CONTEXT_AUTHOR_SELECTOR\s*=\s*\[/);
  assert.match(source, /"\.gall_writer"/);
  assert.match(source, /"\.ub-writer"/);
  assert.match(source, /"\.nickname"/);
  assert.match(source, /"\.writer_nikcon"/);
  assert.match(source, /if \(target\.closest\?\.\(PREVIEW_CONTEXT_AUTHOR_SELECTOR\)\) return "";/);
});
