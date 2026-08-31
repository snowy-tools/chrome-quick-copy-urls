/**
 * タブ情報から表示用のテキストを生成する。
 *
 * @param {Array<{title: string, url: string}>} tabs タブ一覧。
 * @param {string} format 出力形式（"url" または "title-url"）。
 * @returns {string} 生成した文字列。
 */
export function formatUrlListText(tabs, format) {
	const isTitleUrl = format === "title-url";

	return tabs
		.map((tab) => isTitleUrl
			? `${tab.title}\t${tab.url}\n`
			: `${tab.url}\n`
		)
		.join("");
}
