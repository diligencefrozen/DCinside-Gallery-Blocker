import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = { Intl, Object };
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/ui/popup/user-block-list.js'), 'utf8'), context);
const list = context.DCBUserBlockList;

test('user block tokens are counted and grouped ID, IP, nickname with natural sorting', () => {
  const mixed = ['nick:나', 'id10', '39.7', 'id2', 'nick:가', '127.0.0.1'];
  assert.deepEqual({ ...list.counts(mixed) }, { all: 6, UID: 2, IP: 2, NICK: 2 });
  assert.deepEqual(list.prepare(mixed).map(item => item.label), ['id2', 'id10', '39.7', '127.0.0.1', '가', '나']);
});

test('user block search and type filters are case insensitive and non-mutating', () => {
  const tokens = ['Alpha5', 'alpha2', '39.7', 'nick:무갤러'];
  const snapshot = [...tokens];
  assert.deepEqual(list.prepare(tokens, { filter: 'UID', query: 'ALPHA' }).map(item => item.token), ['alpha2', 'Alpha5']);
  assert.deepEqual(list.prepare(tokens, { filter: 'IP', query: '39' }).map(item => item.token), ['39.7']);
  assert.deepEqual(list.prepare(tokens, { filter: 'NICK', query: '무갤' }).map(item => item.token), ['nick:무갤러']);
  assert.deepEqual(tokens, snapshot);
});

test('user block list handles empty, no-result, long, and 50-plus collections', () => {
  assert.equal(list.prepare([]).length, 0);
  assert.equal(list.prepare(['id'], { query: 'missing' }).length, 0);
  assert.equal(list.prepare([`nick:${'긴닉네임'.repeat(30)}`])[0].kind, 'NICK');
  assert.equal(list.prepare(Array.from({ length: 60 }, (_, i) => `id${i}`)).length, 60);
});
