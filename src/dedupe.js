// Pure duplicate-detection logic. No chrome.* calls, so it can be unit tested in Node.

// Only pages we can't meaningfully compare. chrome:// pages (incl. new tabs) count as duplicates.
const IGNORED_PROTOCOLS = /^(devtools|view-source):/;

// A tab that is still loading may only have pendingUrl set.
const tabUrl = (tab) => tab.url || tab.pendingUrl;

// Tuning point: change this to decide what counts as "the same page".
export function normalizeUrl(url) {
  return url.split('#')[0];
}

export function isIgnorable(tab) {
  const url = tabUrl(tab);
  return !url || IGNORED_PROTOCOLS.test(url);
}

// Higher score = more worth keeping.
function keepScore(tab, currentWindowId) {
  const inCurrent = tab.windowId === currentWindowId;
  return (tab.pinned ? 4 : 0) + (tab.active && inCurrent ? 2 : 0) + (inCurrent ? 1 : 0);
}

function compareKeepers(a, b, currentWindowId) {
  const diff = keepScore(b, currentWindowId) - keepScore(a, currentWindowId);
  return diff !== 0 ? diff : a.id - b.id; // tie-break: oldest tab (lowest id)
}

/**
 * @param tabs chrome.tabs.Tab-like objects
 * @param opts.scope 'window' (current window only) or 'all' (every window)
 * @param opts.currentWindowId
 * @returns groups of 2+ tabs: { url, tabs, keepId, closeIds }
 *          pinned tabs are never put in closeIds
 */
export function findDuplicateGroups(tabs, { scope, currentWindowId }) {
  const byUrl = new Map();
  for (const tab of tabs) {
    if (isIgnorable(tab)) continue;
    if (scope === 'window' && tab.windowId !== currentWindowId) continue;
    const key = normalizeUrl(tabUrl(tab));
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(tab);
  }

  const groups = [];
  for (const [url, members] of byUrl) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => compareKeepers(a, b, currentWindowId));
    const keep = sorted[0];
    groups.push({
      url,
      tabs: sorted,
      keepId: keep.id,
      closeIds: sorted.slice(1).filter((t) => !t.pinned).map((t) => t.id),
    });
  }
  return groups.filter((g) => g.closeIds.length > 0);
}
