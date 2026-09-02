# Quick URL Copy

Chrome extension to collect and copy URLs from open tabs. The popup displays collected URLs and status, and provides controls to change the collection range and URL format interactively

## Features

- **Flexible URL collection range:**
  - Active tab only
  - Tabs in the same tab group
	- Tabs in the current window
  - All open tabs
- **Interactive popup controls:**
  - Collected URLs and status messages are displayed in the popup
  - Refresh button to recollect URLs with current settings
  - Copy button to copy URLs to clipboard 
  - Change collection range and output format on the fly
- **Togglable display modes:**
  - Detailed: Shows controls for range and format selection
  - Compact: Minimal view showing only URLs and status
- **Output formats:**
  - `URL`: One URL per line
  - `Title + URL`: Tab-separated title and URL (format: `{title}\t{url}`)
  - `CSV`, `HTML`, `JSON`, and `Markdown` output
  - Automatic deduplication and filtering of special URLs like `chrome://` and `about:blank`
- **Keyboard shortcuts:**
  - Support copy commands for each URL collection range
- **Settings page:**
  - Configure default behavior when clicking the extension button
- **No host permissions required** - The extension uses Chrome's tabs API without requesting access to page content

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

- The extension uses Manifest V3
- Uses offscreen document for clipboard operations (required for Manifest V3 security model)
- Requests these permissions: `tabs`, `storage`, `clipboardWrite`, and `offscreen`
- Settings are persisted in Chrome storage and reused for subsequent operations
