# Quick URL Copy

Chrome extension to collect and copy URLs from open tabs. The popup displays collected URLs and status, and provides controls to change the collection range and URL format interactively

## Features

- Collect and copy urls from tabs with the range:
  - only active tab
  - all tabs in the current window
  - all open tabs
- Collected URLs and success/error messages are shown in popup.
- Switchable display modes of popup window:
  - Detailed:
  - Compact:
- Selectable output formats:
  - `URL`
  - `Title + URL` (tab-separated)
- Able to retry URL collection and URL copy interactively in popup.
- Keyboard shortcuts to perform URL collection and copy instantly.
- No host permissions are requested.

## Shortcuts

- Copy active tab URL
- Copy URLs from tabs in the current window
- Copy URLs from all tabs

Shortcuts can be changed at `chrome://extensions/shortcuts`.

## Install for local development

1. Clone repository:
```
git clone https://github.com/snowflake36u/quick-url-copy
```
2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `quick-url-copy` project directory.

## Notes

- The extension uses Manifest V3.
- The manifest requests these permissions: `tabs`, `storage`, `clipboardWrite` and `offscreen`.
- Settings such as collecting tab range and URL format are persisted in the storage and reused for subsequent operations.
