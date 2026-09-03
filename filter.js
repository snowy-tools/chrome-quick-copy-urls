/**
 * @typedef {Object} TabEntry
 * @property {number|null} id タブID。
 * @property {string} title タブタイトル。
 * @property {string} url タブURL。
 */

/**
 * 収集されたタブ一覧から、空白URL除去や重複除去、特殊URL除外を適用した一覧を返す。
 *
 * @param {Array<{id?: number | null, title?: string, url?: string}>} tabs タブ一覧。
 * @param {{ filterBlankUrls?: boolean, filterDuplicateUrls?: boolean, filterSpecialUrls?: boolean }} [options] 除去オプション。
 * @returns {TabEntry[]} 正規化済みタブ一覧。
 */
export function normalizeAndFilterTabs(tabs, options = {}) {
	const filterBlankUrls = options.filterBlankUrls ?? true;
	const filterDuplicateUrls = options.filterDuplicateUrls ?? true;
	const filterSpecialUrls = options.filterSpecialUrls ?? true;
	const seenUrls = new Set();

	return tabs.reduce((result, tab) => {
		// 文字列以外の型（undefined/null等）も空文字として安全に文字列化する
		// これによりユーザーは「空文字が混ざっている = 正常でないタブが存在する」ことに間接的に気付ける
		// (将来的にはユーザーに直接警告を表示するべき)
		const rawUrl = typeof tab?.url === "string" ? tab.url : "";
		const trimmedUrl = rawUrl.trim();

		if (filterBlankUrls && trimmedUrl.length === 0)
			return result;

		if (filterSpecialUrls && isSpecialUrl(trimmedUrl))
			return result;

		const normalizedUrl = normalizeUrl(trimmedUrl) ?? trimmedUrl;

		// 重複URLの判定（空文字列でない場合のみ重複判定を実施）
		if (filterDuplicateUrls && normalizedUrl.length > 0) {
			const key = normalizedUrl.toLowerCase();

			if (seenUrls.has(key))
				return result;

			seenUrls.add(key);
		}

		result.push({
			id: tab.id ?? null,
			title: tab.title ?? "",
			url: normalizedUrl,
		});

		return result;
	}, []);
}

const SPECIAL_URL_PATTERN = /^(about:|chrome:\/\/|chrome-extension:\/\/|devtools:\/\/|edge:\/\/|javascript:|data:|file:)/i;

/**
 * 特殊URLや無効なURLを除外する。
 *
 * @param {string} value URL文字列。
 * @returns {boolean} 除外対象なら true。
 */
export function isSpecialUrl(value) {
	const url = value.trim();

	if (!url)
		return false;

	if (SPECIAL_URL_PATTERN.test(url))
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