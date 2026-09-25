/**
 * タブ情報から表示用のテキストを生成する。
 *
 * @typedef {Object} TabLike
 * @property {string} title タブタイトル。
 * @property {string} url タブURL。
 */

/**
 * フォーマット時に使用するエスケープ関数群
 *
 * @typedef {Object} FormatterEscapers
 * @property {function(string): string} [title] タイトル文字列をエスケープ/エンコードする関数。
 * @property {function(string): string} [url] URL文字列をエスケープ/エンコードする関数。
 */

/**
 * フォーマッタの設定定義
 *
 * @typedef {Object} FormatterConfig
 * @property {function({title: string, url: string}): string} formatItem アイテム1件分の文字列を生成する関数。
 * @property {string} [prefix] (Optional) 出力全体の前方に付与する文字列。
 * @property {string} [suffix] (Optional) 出力全体の後方に付与する文字列。
 * @property {string} [separator] (Optional) 各アイテム要素を結合する際の区切り文字。
 * @property {FormatterEscapers | null} [escapers] (Optional) タイトルとURLに対するエスケープ処理関数群。
 * @property {string} [defaultTitle] (Optional) タイトルが空文字の場合に使用する代替文字列。
 * @property {string} [emptyText] (Optional) タブが0件の場合に出力する文字列。未指定時は prefix + suffix が出力される。
 */

/**
 * 各フォーマット形式とフォーマッタ設定の紐付け
 * @type {Object.<string, FormatterConfig>}
 */
const FORMATTERS = {
	"url": {
		formatItem: ({ url }) => `${url}\n`,
	},
	"tsv": {
		formatItem: ({ title, url }) => `${title}\t${url}\n`,
	},
	"csv": {
		formatItem: ({ title, url }) => `${title},${url}\n`,
		escapers: { title: escapeCsvCell, url: escapeCsvCell },
	},
	"json": {
		prefix: "[\n",
		formatItem: ({ title, url }) => `\t${JSON.stringify({ title, url })}`,
		separator: ",\n",
		suffix: "\n]\n",
		emptyText: "[]\n",
		escapers: null, // JSON.stringifyがエンコードを担うため不要
	},
	"markdown-link": {
		formatItem: ({ title, url }) => `[${title}](${url})\n`,
		defaultTitle: "Untitled",
		escapers: { title: escapeMarkdownTitle, url: encodeMarkdownUrl },
	},
	"markdown-list": {
		formatItem: ({ title, url }) => `- [${title}](${url})\n`,
		defaultTitle: "Untitled",
		escapers: { title: escapeMarkdownTitle, url: encodeMarkdownUrl },
	},
	"markdown-table": {
		prefix: "| title | url |\n| --- | --- |\n",
		formatItem: ({ title, url }) => `| ${title} | ${url} |\n`,
		defaultTitle: "Untitled",
		escapers: { title: escapeMarkdownTitle, url: encodeMarkdownUrl },
	},
	"html-link": {
		formatItem: ({ title, url }) => `<a href="${url}">${title}</a>\n`,
		defaultTitle: "Untitled",
		escapers: { title: escapeHtml, url: escapeHtml },
	},
	"html-list": {
		prefix: "<ul>\n",
		formatItem: ({ title, url }) => `\t<li><a href="${url}">${title}</a></li>\n`,
		suffix: "</ul>\n",
		defaultTitle: "Untitled",
		escapers: { title: escapeHtml, url: escapeHtml },
	}
};

/**
 * @param {TabLike[]} tabs タブ一覧。
 * @param {string} format 出力形式。
 * @returns {string} 生成した文字列。
 */
export function formatUrlList(tabs, format) {
	const def = FORMATTERS[format] ?? FORMATTERS["url"];
	const prefix = def.prefix ?? "";
	const suffix = def.suffix ?? "";
	const separator = def.separator ?? "";

	// タブが0件の場合のフォールバック
	if (!tabs?.length)
		return def.emptyText ?? `${prefix}${suffix}`;

	const items = tabs.map(tab => {
		let title = tab.title ?? "";
		let url = tab.url ?? "";

		// マークダウン・HTML系など、defaultTitleが設定されている場合は空文字を補完
		if (!title && def.defaultTitle)
			title = def.defaultTitle;

		// 指定されたエンコーダでタイトルとURLをエスケープ/エンコード
		title = def.escapers?.title?.(title) ?? title;
		url = def.escapers?.url?.(url) ?? url;

		return def.formatItem({ title, url });
	});

	// 各要素を結合し、前後にprefix/suffixを付与（suffixには改行を含める）
	return `${prefix}${items.join(separator)}${suffix}`;
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
		return `"${text.replaceAll('"', '""')}"`;
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
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
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

/**
 * Markdownのリンクテキスト用に特殊文字をエスケープする。
 *
 * @param {string} title タイトル文字列。
 * @returns {string} エスケープ後のタイトル文字列。
 */
function escapeMarkdownTitle(title) {
	return String(title ?? "").replace(/[\[\]\\]/g, " ");
}