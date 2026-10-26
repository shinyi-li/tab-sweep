# Tab Sweep

A Chrome extension that finds duplicate tabs and closes them in one click.

## Features

- Lists duplicate tabs grouped by URL (the `#hash` is ignored).
- Toggle between **This window** and **All windows**.
- Pick exactly which tabs to close with checkboxes, or use **All** / **None**.
- Swap which tab in a group is kept with **Keep this**.
- **Go** jumps to a tab so you can look before closing.
- **Undo** reopens the tabs you just closed.

## How the kept tab is chosen

Each tab in a group is scored, and the highest score is kept:

| Condition | Points |
|---|---|
| Pinned | +4 |
| Active tab in your current window | +2 |
| In your current window | +1 |

Ties go to the oldest tab (lowest tab ID). Pinned tabs are never closed.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Pin the extension and click its icon.

After editing the code, click the reload arrow on the extension's card.

## Development

```bash
npm test
```

- `src/dedupe.js` has the grouping and keeper logic, with no Chrome APIs, so it runs under Node.
- `popup.html`, `popup.css` and `popup.js` make up the popup UI.
- `icons/icon.svg` is the icon source. Render the PNGs with:

  ```bash
  for s in 16 32 48 128; do rsvg-convert -w $s -h $s icons/icon.svg -o icons/icon$s.png; done
  ```

## Ideas

- Strip tracking params like `?utm_source=` when comparing URLs.
- Live-update the popup when tabs open or close.
