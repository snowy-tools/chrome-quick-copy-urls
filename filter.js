/**
 * @typedef {Object} TabEntry
 * @property {number|null} id タブID。
 * @property {string} title タブタイトル。
 * @property {string} url タブURL。
 */

/**
 * 収集されたタブ一覧から、重複除去や特殊URL除外を適用した一覧を返す。
 *
 * @param {Array<{id?: number | null, title?: string, url?: string}>} tabs タブ一覧。
 * @param {{ filterDuplicateUrls?: boolean, filterSpecialUrls?: boolean }} [options] 除去オプション。
 * @returns {TabEntry[]} 正規化済みタブ一覧。
 */
export function normalizeAndFilterTabs(tabs, options = {}) {
	const filterDuplicateUrls = options.filterDuplicateUrls ?? true;
	const filterSpecialUrls = options.filterSpecialUrls ?? true;
	const seenUrls = new Set();

	return tabs
		.filter((tab) => typeof tab?.url === "string" && tab.url.trim().length > 0)
		.map((tab) => ({
			id: tab.id ?? null,
			title: tab.title ?? "",
			url: tab.url.trim(),
		}))
		.filter(({ url }) => {
			// 特殊なURLの判定
			if (filterSpecialUrls && isSpecialUrl(url))
				return false;

			const normalizedUrl = normalizeUrl(url);
			if (!normalizedUrl)
				return false;

			// 重複URLの判定
			if (filterDuplicateUrls) {
				const key = normalizedUrl.toLowerCase();
				if (seenUrls.has(key))
					return false;
				seenUrls.add(key);
			}

			return true;
		})
		.map(({ id, title, url }) => ({
			id,
			title,
			url: normalizeUrl(url) ?? url,
		}));
}

/**
 * 特殊URLや無効なURLを除外する。
 *
 * @param {string} value URL文字列。
 * @returns {boolean} 除外対象なら true。
 */
export function isSpecialUrl(value) {
	const url = value.trim();
	if (!url)
		return true;

	const lower = url.toLowerCase();
	if (lower === "about:blank" || lower.startsWith("about:"))
		return true;
	if (lower.startsWith("chrome://")
		|| lower.startsWith("chrome-extension://")
		|| lower.startsWith("devtools://")
		|| lower.startsWith("edge://"))
		return true;
	if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("file:"))
		return true;

	return false;
}

/**
 * URLを安定した形式へ正規化する。
 *
 * @param {string} value URL文字列。
 * @returns {string | null} 正規化済み URL または null。
 */
export function normalizeUrl(value) {
	try {
		const url = new URL(value.trim());
		return url.href;
	} catch (error) {
		return null;
	}
}
