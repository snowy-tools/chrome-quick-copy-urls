# Quick URL Copy

Chrome extension for collecting and copying tab URLs.

## Features

- Copy the active tab URL.
- Copy URLs from all tabs in the current window.
- Copy URLs from all Chrome tabs.
- Toolbar button opens a popup without copying.
- Keyboard shortcuts execute copy operations and open the popup with the result.
- Detailed and compact popup modes.
- Select output format:
	- `URL`
	- `Title + URL` (tab-separated)
- Regenerate the collected text and copy it again from the detailed popup.
- Displays the number of collected/copied URLs.
- Displays URL retrieval and clipboard-copy failures.

## Default shortcuts

- `Alt+Shift+1` — active tab
- `Alt+Shift+2` — current window
- `Alt+Shift+3` — all tabs

Shortcuts can be changed at `chrome://extensions/shortcuts`.

## Install for local development

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this directory.

## Notes

The extension uses Manifest V3 and the `offscreen` API for clipboard writes initiated by keyboard shortcuts. No website host permission is requested.

The extension's toolbar button uses Chrome's action popup directly; it collects the active tab and does not copy automatically.
