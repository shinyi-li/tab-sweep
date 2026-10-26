import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateGroups, normalizeUrl } from '../src/dedupe.js';

const tab = (id, url, extra = {}) => ({ id, url, windowId: 1, pinned: false, active: false, ...extra });

test('normalizeUrl strips the hash', () => {
  assert.equal(normalizeUrl('https://a.com/x#top'), 'https://a.com/x');
});

test('groups duplicates and keeps the oldest tab', () => {
  const g = findDuplicateGroups([tab(3, 'https://a.com'), tab(1, 'https://a.com'), tab(2, 'https://b.com')], {
    scope: 'window',
    currentWindowId: 1,
  });
  assert.equal(g.length, 1);
  assert.equal(g[0].keepId, 1);
  assert.deepEqual(g[0].closeIds, [3]);
});

test('window scope ignores other windows; all scope includes them', () => {
  const tabs = [tab(1, 'https://a.com'), tab(2, 'https://a.com', { windowId: 2 })];
  assert.equal(findDuplicateGroups(tabs, { scope: 'window', currentWindowId: 1 }).length, 0);
  assert.equal(findDuplicateGroups(tabs, { scope: 'all', currentWindowId: 1 }).length, 1);
});

test('never closes the active tab in the current window', () => {
  const tabs = [tab(1, 'https://a.com'), tab(2, 'https://a.com', { active: true })];
  const [g] = findDuplicateGroups(tabs, { scope: 'window', currentWindowId: 1 });
  assert.equal(g.keepId, 2);
  assert.deepEqual(g.closeIds, [1]);
});

test('cross-window prefers the current window tab', () => {
  const tabs = [tab(1, 'https://a.com', { windowId: 2 }), tab(5, 'https://a.com')];
  const [g] = findDuplicateGroups(tabs, { scope: 'all', currentWindowId: 1 });
  assert.equal(g.keepId, 5);
});

test('never closes pinned tabs', () => {
  const tabs = [tab(1, 'https://a.com'), tab(2, 'https://a.com', { pinned: true })];
  const [g] = findDuplicateGroups(tabs, { scope: 'window', currentWindowId: 1 });
  assert.equal(g.keepId, 2);
  assert.deepEqual(g.closeIds, [1]);
});

test('treats several new tabs as duplicates', () => {
  const tabs = [tab(1, 'chrome://newtab/'), tab(2, 'chrome://newtab/'), tab(3, '', { pendingUrl: 'chrome://newtab/' })];
  const [g] = findDuplicateGroups(tabs, { scope: 'window', currentWindowId: 1 });
  assert.equal(g.closeIds.length, 2);
});

test('ignores empty urls and devtools', () => {
  const tabs = [tab(1, undefined), tab(2, undefined), tab(3, 'devtools://x'), tab(4, 'devtools://x')];
  assert.equal(findDuplicateGroups(tabs, { scope: 'all', currentWindowId: 1 }).length, 0);
});
