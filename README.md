# Quick URL Copy

Chrome extension for collecting and copying URLs from open tabs. This provides quick copying via keyboard shortcuts, and allows you to switch URL collection and format options interactively on popup.

## Features

- **Collect and copy URLs from flexible tab ranges:**
	- Active tab only
	- Selected tabs
	- Same tab group
	- Current window
	- All tabs
- **Advanced controls on popup:**
	- Interactive options for the collection range and output format
	- Sort/Reverse buttons to rearrange the collected URL list
	- Refresh/Copy buttons to refresh URLs and copy URLs manually after changing options
	- Result messages highlighted on each action finished
- **Features for quick and easy copy:**
	- Keyboard shortcuts to copy URLs for each collection range
	- Action button to trigger copy on click
	- Foldable popup to hide detail options for low visual stress
- **Built-in URL filters:**
	- Exclude blank URLs
	- Exclude duplicate URLs
	- Exclude special URLs such as `chrome://`, `about:`, `data:`, `file:`, and similar non-web URLs
- **Output formats:**
	- Supports simple url stack, TSV, CSV, JSON, Markdown and HTML
- **Settings:**
	- Automatically memorized execution settings for popup
	- Configurable default collection range on action button clicked
- **Manifest V3 and privacy:**
	- No host permissions are requested; the extension uses Chrome's tabs API without reading page contents
	- Clipboard writes are handled through the offscreen document required by Manifest V3

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

- Repository: https://github.com/snowflake36u/quick-url-copy
- Privacy policy source: `store/privacy-policy.md`
- Support: https://github.com/snowflake36u/quick-url-copy/issues

## Install for local development

1. Clone the repository:

```bash
git clone https://github.com/snowflake36u/quick-url-copy
```

2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `quick-url-copy` project directory.

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
- Settings and recent collection state are stored in Chrome storage and reused for subsequent operations.
- The popup and background script share the same collection logic, so the current text area and the last action state stay in sync.
