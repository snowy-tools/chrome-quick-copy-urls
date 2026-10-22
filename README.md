# Quick URL Copy

<a href="https://ko-fi.com/snowflake36u" target="_blank"><img src="docs/images/support_me_on_kofi_blue.png" height="44ex" alt="Buy Me a Coffee at ko-fi.com"></a>

<picture>
  <img src="docs/images/screenshot_default.png" style="border: 1px solid #d0d7de; width: 440px; max-width: 100%;">
</picture>

## About

Chrome extension to copy tab URLs fast and effortlessly.

Collect and copy URLs instantly from open tabs using a keyboard shortcut or the toolbar button. In the popup, adjust options, reorder the URLs, and copy them again for further fine-tuning.

The quick access to key features and a clean UI makes collecting tab information quick and low-stress.

## Features

- **Instant copy with minimal steps:** Keyboard shortcut for each collection range, plus an action button that copies using the configured settings.
- **Popup controls and feedback:** Change the collection range and output format, sort or reverse the URL list, refresh it, and copy it manually. An animated text highlight makes each action's result easy to notice.
- **Collapsible popup:** Hide the detail options for a simpler, less cluttered view.
- **Flexible collection range:** Active tab, selected tabs, same tab group, current window, or all tabs.
- **Multiple output formats:** URL list, TSV, CSV, JSON, Markdown, and HTML.
- **Optional URL filters:** Exclude blank, duplicate, and non-web URLs.

## Usage

### Collection ranges

| Range | Collected tabs |
| --- | --- |
| Active tab | The active tab only |
| Selected tabs | The tabs currently selected (highlighted) in the current window |
| Same tab group | All tabs in the tab group of the current window |
| Current window | All tabs in the current window |
| All tabs | All tabs in all windows |

Each range has its own keyboard shortcut. Clicking the action button copies with the default range configured in the settings.

### Popup

- Change the collection range and output format interactively.
- **Sort / Reverse**: rearrange the collected URL list.
- **Refresh / Copy**: refresh the list and copy it manually after changing options.
- An animated text highlight makes each action's result easy to notice.
- Collapse the popup's detail options for a simpler, less cluttered view.

### URL filters

The popup lets you exclude:

- Blank URLs
- Duplicate URLs
- Special URLs such as `chrome://`, `about:`, `data:`, `file:`, and similar non-web URLs

### Settings

- The popup remembers the last-used settings automatically.
- The default collection range used by the action button can be configured.

## Output formats

| Type | Explanation |
| --- | --- |
| `url` | one URL per line |
| `tsv` | `title\turl` per line |
| `csv` | `title,url` per line |
| `json` | `[ { "title": "...", "url": "..." }, ... ]` |
| `markdown-link` | `[title](url)` per line |
| `html-link` | `<a href="url">title</a>` per line |

## Project links

- Repository: https://github.com/snowy-tools/chrome-quick-url-copy
- Privacy policy source: `store/privacy-policy.md`
- Support: https://github.com/snowy-tools/chrome-quick-url-copy/issues

## Install for local development

1. Clone the repository:

```bash
git clone https://github.com/snowy-tools/chrome-quick-url-copy
```

2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `chrome-quick-url-copy` project directory.

## Release workflow

This repository separates normal development from release operations.

1. Push normal development commits to `master`.
2. When you are ready to start a release, run the `release-please` GitHub Actions workflow manually from the Actions tab.
3. `release-please` creates or updates a Release PR with the version bump, changelog, commit range, and package metadata for review.
4. Review the Release PR in GitHub. If anything looks wrong, fix the configuration or release metadata in a normal commit, push it, and rerun the `release-please` workflow.
5. When the Release PR looks correct, merge it into `master`.
6. The release is finalized by creating the GitHub Release. After that, the build workflow packages the Chrome extension and uploads the artifact to the release.

This avoids ad-hoc `chore: prepare release` / `chore: retry release` commits purely to test the release workflow.

## Notes

- The extension uses Manifest V3.
- It requests these permissions: `tabs`, `storage`, `clipboardWrite`, and `offscreen`.
- No host permissions are requested, and the extension uses Chrome's tabs API without reading page contents.
- Clipboard writes are handled through the offscreen document required by Manifest V3.
- Settings and recent collection state are stored locally in Chrome storage and reused for subsequent operations.
- The popup and background script share the same collection logic, so the current text area and the last action state stay in sync.