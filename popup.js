import { findDuplicateGroups } from './src/dedupe.js';

const $ = (id) => document.getElementById(id);
let scope = 'window';
let groups = [];
let selected = new Set(); // tab ids that will be closed
let windowLabels = new Map();
let currentWindowId;

async function load() {
  const [tabs, windows, current] = await Promise.all([
    chrome.tabs.query({}),
    chrome.windows.getAll(),
    chrome.windows.getCurrent(),
  ]);
  currentWindowId = current.id;
  windowLabels = new Map(windows.map((w, i) => [w.id, w.id === currentWindowId ? 'Current' : `Window ${i + 1}`]));
  groups = findDuplicateGroups(tabs, { scope, currentWindowId });
  selected = new Set(groups.flatMap((g) => g.closeIds));
  render();
}

function render() {
  for (const btn of document.querySelectorAll('.scope button')) {
    btn.classList.toggle('active', btn.dataset.scope === scope);
  }

  const total = groups.reduce((n, g) => n + g.closeIds.length, 0);
  $('summary').textContent = groups.length
    ? `${groups.length} duplicate ${groups.length === 1 ? 'group' : 'groups'} · ${total} extra ${total === 1 ? 'tab' : 'tabs'}`
    : '';
  $('select-all').hidden = $('select-none').hidden = !groups.length;
  updateCloseButton();

  const list = $('groups');
  list.replaceChildren();
  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No duplicate tabs 🎉';
    list.append(empty);
    return;
  }
  for (const g of groups) list.append(renderGroup(g));
}

function updateCloseButton() {
  const n = selected.size;
  $('close-btn').disabled = n === 0;
  $('close-btn').textContent = n ? `Close ${n} selected` : 'Close selected';
}

function setAll(on) {
  selected = on ? new Set(groups.flatMap((g) => g.closeIds)) : new Set();
  for (const box of document.querySelectorAll('.tab input[type=checkbox]')) box.checked = on;
  updateCloseButton();
}

// Make newId the survivor: every other non-pinned tab in the group becomes a close candidate.
function swapKeeper(g, newId) {
  g.keepId = newId;
  g.closeIds = g.tabs.filter((t) => t.id !== newId && !t.pinned).map((t) => t.id);
  selected.delete(newId);
  for (const id of g.closeIds) selected.add(id);
  render();
}

function renderGroup(g) {
  const el = document.createElement('div');
  el.className = 'group';
  const url = document.createElement('div');
  url.className = 'group-url';
  url.textContent = g.url;
  el.append(url);

  for (const tab of g.tabs) {
    const row = document.createElement('div');
    const willClose = g.closeIds.includes(tab.id);
    row.className = 'tab' + (willClose ? ' close' : '');

    if (willClose) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.has(tab.id);
      box.addEventListener('change', () => {
        if (box.checked) selected.add(tab.id);
        else selected.delete(tab.id);
        row.classList.toggle('close', box.checked);
        updateCloseButton();
      });
      row.append(box);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'box-spacer';
      row.append(spacer);
    }

    if (tab.favIconUrl) {
      const icon = document.createElement('img');
      icon.src = tab.favIconUrl;
      row.append(icon);
    }
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = (tab.pinned ? '📌 ' : '') + (tab.title || tab.url || tab.pendingUrl);
    row.append(title);

    // Fixed-width slots keep every row's badges and buttons in the same columns.
    if (scope === 'all') row.append(slot('window', badge(windowLabels.get(tab.windowId) ?? 'Window')));
    // Same column holds the "Keep" badge on the survivor and "Keep this" on the others.
    let keep = tab.id === g.keepId ? badge('Keep', 'keep') : null;
    if (tab.id !== g.keepId && !tab.pinned) {
      keep = document.createElement('button');
      keep.className = 'link';
      keep.textContent = 'Keep this';
      keep.addEventListener('click', () => swapKeeper(g, tab.id));
    }
    row.append(slot('keep', keep));

    const go = document.createElement('button');
    go.className = 'goto';
    go.textContent = 'Go';
    go.addEventListener('click', async () => {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    });
    row.append(slot('go', go));
    el.append(row);
  }
  return el;
}

function slot(name, child) {
  const el = document.createElement('span');
  el.className = `slot slot-${name}`;
  if (child) el.append(child);
  return el;
}

function badge(text, extraClass = '') {
  const b = document.createElement('span');
  b.className = `badge ${extraClass}`.trim();
  b.textContent = text;
  return b;
}

async function closeDuplicates() {
  if (!selected.size) return;
  // Remember what we close so Undo can reopen exactly these tabs.
  const closed = groups
    .flatMap((g) => g.tabs)
    .filter((t) => selected.has(t.id))
    .map((t) => ({ url: t.url || t.pendingUrl, windowId: t.windowId, index: t.index }));
  await chrome.tabs.remove([...selected]);
  await chrome.storage.session.set({ lastSweep: closed });
  $('undo-btn').hidden = false;
  await load();
}

function waitForLoad(tabId, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done());
  });
}

async function undo() {
  const { lastSweep = [] } = await chrome.storage.session.get('lastSweep');
  // Reopen left to right so each tab lands back at its original position.
  const reopened = [];
  for (const t of lastSweep.sort((a, b) => a.index - b.index)) {
    try {
      reopened.push(await chrome.tabs.create({ url: t.url, windowId: t.windowId, index: t.index, active: false }));
    } catch {
      reopened.push(await chrome.tabs.create({ url: t.url, active: false })); // original window is gone
    }
  }
  // A fresh tab has no title or favicon until it loads, so wait before re-listing.
  await Promise.all(reopened.map((t) => waitForLoad(t.id)));
  await chrome.storage.session.remove('lastSweep');
  $('undo-btn').hidden = true;
  await load();
}

for (const btn of document.querySelectorAll('.scope button')) {
  btn.addEventListener('click', async () => {
    scope = btn.dataset.scope;
    await chrome.storage.local.set({ scope });
    await load();
  });
}
$('select-all').addEventListener('click', () => setAll(true));
$('select-none').addEventListener('click', () => setAll(false));
$('close-btn').addEventListener('click', closeDuplicates);
$('undo-btn').addEventListener('click', undo);

chrome.storage.session.get('lastSweep').then(({ lastSweep }) => {
  $('undo-btn').hidden = !lastSweep?.length;
});
chrome.storage.local.get('scope').then((s) => {
  if (s.scope) scope = s.scope;
  return load();
});
