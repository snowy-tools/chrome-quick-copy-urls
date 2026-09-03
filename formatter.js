/**
 * タブ情報から表示用のテキストを生成する。
 *
 * @typedef {Object} TabLike
 * @property {string} title タブタイトル。
 * @property {string} url タブURL。
 */

/**
 * @param {TabLike[]} tabs タブ一覧。
 * @param {string} format 出力形式（"url" | "tsv" | "csv" | "html" | "json" | "markdown"）。
 * @returns {string} 生成した文字列。
 */
export function formatUrlListText(tabs, format) {
	const formatters = {
		url: (entries) => entries.map(({ url }) => `${url}\n`).join(""),
		"tsv": (entries) => entries
			.map(({ title, url }) => `${title || "Untitled"}\t${url}\n`)
			.join(""),
		csv: (entries) => {
			const rows = entries.map(({ title, url }) => [title || "Untitled", url]);
			const csvLines = rows.map((row) => row.map(escapeCsvCell).join(","));
			return `${csvLines.join("\n")}\n`;
		},
		html: (entries) => {
			const listItems = entries.map(({ title, url }) => {
				const label = escapeHtml(title || "Untitled");
				const href = escapeHtml(url);
				return `\t<li><a href="${href}">${label}</a></li>`;
			}).join("\n");
			return `<ul>\n${listItems}\n</ul>\n`;
		},
		json: (entries) => JSON.stringify(entries.map(({ title, url }) => ({ title: title || "Untitled", url })), null, 2) + "\n",
		markdown: (entries) => entries
			.map(({ title, url }) => `- [${(title || "Untitled").replace(/[\[\]\\]/g, " ")}](${encodeMarkdownUrl(url)})`)
			.join("\n") + "\n",
	};

	const formatter = formatters[format] ?? formatters.url;
	return formatter(tabs);
}

/**
 * CSVのセル値をエスケープする。
 *
 * @param {string} value セル文字列。
 * @returns {string} エスケープ済みセル文字列。
 */
function escapeCsvCell(value) {
	const text = String(value ?? "");
	if (/[",\n]/.test(text))
		return `"${text.replace(/"/g, '""')}"`;
	return text;
}

/**
 * HTMLエスケープを施す。
 *
 * @param {string} value 文字列。
 * @returns {string} エスケープ済み文字列。
 */
function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Markdownで安全に埋め込めるURL文字列に変換する。
 *
 * @param {string} url URL文字列。
 * @returns {string} エンコード後のURL文字列。
 */
function encodeMarkdownUrl(url) {
	return String(url ?? "").replace(/\s+/g, "%20");
}
