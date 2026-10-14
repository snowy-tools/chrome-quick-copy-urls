# Privacy Policy for Quick URL Copy

Quick URL Copy processes and copies URLs from open tabs in your browser. **All processing is performed strictly locally on your device; no data is collected, stored on external servers, or transmitted over the internet.**

## Data Handling & Local Processing

This extension accesses tab metadata solely through the official Chrome Tabs API to provide its standard functionality.

- **Data accessed**:
	- Tab title
	- Tab URL
	- Tab status (active / selected / window / group)
	- Current browser window/tab state
- **No external transmission**:
	- **It does not send any tab data or URLs to external servers**.
	- **It does not track or store your personal browsing history** beyond temporary in-memory processing or optional local settings requested by the user.
	- **It does not read page content** (DOM/HTML) of the websites you visit.

## Data Usage

The tab information accessed by the extension is used exclusively to:

- Display URLs and tab titles within the extension popup
- Copy formatted text to your clipboard upon your explicit request
- Export tab data in user-selected formats (Text, CSV, JSON, Markdown, HTML, and others)

## Storage

The extension may store user preferences and recent action history using the browser's local storage (`chrome.storage`).

- This data remains strictly on your local device.
- It is never synced or shared with third parties.
- Uninstalling the extension automatically removes all stored data from your browser.

## Permissions Used

- `tabs`: Required to access open tab titles and URLs for copying/exporting.
- `storage`: Required to save user preferences locally on your device.
- `clipboardWrite`: Required to copy the generated text/URLs to your system clipboard.
- `offscreen`: Required in Manifest V3 to perform clipboard operations reliably from background contexts.

## Third-Party Services & Analytics

This extension does not integrate any third-party analytics, tracking tools, advertising networks, or external APIs.

## Contact

If you have any questions or feedback regarding this privacy policy, please open an issue on GitHub:
https://github.com/snowflake36u/quick-url-copy/issues