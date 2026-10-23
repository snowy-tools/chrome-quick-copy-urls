# Privacy Policy for Quick URL Copy

Last updated: 2026-10-26

Quick URL Copy processes information about open tabs locally on your device to display and copy URLs. **The extension does not transmit tab information or other user data over the internet or store it on external servers.**

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Data Handling & Local Processing

This extension accesses tab metadata solely through the official Chrome Tabs API to provide its standard functionality.

- **Data accessed**:
	- Tab title
	- Tab URL
	- Tab and window identifiers and state needed to determine which tabs are active, selected, grouped, or in a window
- The extension uses this information only to collect the tabs you request. It does not read website page content (DOM/HTML) or track browsing history.
- Tab information and generated output are held temporarily in memory while the extension displays or processes a collection. They are not saved as browsing history or persisted in extension storage.
- The extension does not transmit this information to external servers or third parties.

## Data Usage

The tab information accessed by the extension is used exclusively to:

- Generate and display a list of URLs and, where applicable, tab titles in the extension popup
- Format that list in the format you select (URL, TSV, CSV, JSON, Markdown, or HTML)
- Copy the generated text to your system clipboard when you invoke a copy action

## Storage

The extension uses Chrome's local extension storage (`chrome.storage.local`) to save these settings:

- Popup display mode
- The action button's configured collection range
- The most recently used collection range and output format
- Whether blank, duplicate, and special URLs are filtered

These settings remain on your device and are not synced or shared with third parties. Tab titles, URLs, and generated collection results are not stored there. Uninstalling the extension removes its locally stored settings.

When you choose to copy, the generated text is written to your system clipboard. The clipboard is managed by your operating system and may be available to other applications; it is not extension storage.

## Permissions Used

- `tabs`: Required to access open tab titles and URLs for collecting and copying.
- `storage`: Required to save user preferences locally on your device.
- `clipboardWrite`: Required to copy the generated text/URLs to your system clipboard.
- `offscreen`: Required in Manifest V3 to perform clipboard operations reliably from background contexts.

## Third-Party Services & Analytics

This extension does not integrate any third-party analytics, tracking tools, advertising networks, or external APIs.

## Contact

If you have any questions or feedback regarding this privacy policy, please open an issue on GitHub:
https://github.com/snowy-tools/chrome-quick-url-copy/issues