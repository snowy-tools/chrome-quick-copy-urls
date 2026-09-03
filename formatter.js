/**
 * タブ情報から表示用のテキストを生成する。
 *
 * @typedef {Object} TabLike
 * @property {string} title タブタイトル。
 * @property {string} url タブURL。
 */

/**
 * フォーマット時に使用するエンコーダ定義
 *
 * @typedef {Object} FormatterEncoder
 * @property {function(string): string} [title] タイトル文字列をエスケープ/エンコードする関数。
 * @property {function(string): string} [url] URL文字列をエスケープ/エンコードする関数。
 */

/**
 * フォーマッタの設定定義
 *
 * @typedef {Object} FormatterConfig
 * @property {function({title: string, url: string}): string} itemFormatter 【必須】各タブのタイトルとURLを受け取り、1件分のフォーマット済み文字列を返す関数。
 * @property {string} [prefix] 【任意】出力全体の前方に付与する文字列。
 * @property {string} [separator] 【任意】各要素を結合する際の区切り文字列（未指定時は空文字として結合）。
 * @property {string} [postfix] 【任意】出力全体の後方に付与する文字列。
 * @property {FormatterEncoder | null} [encoder] 【任意】タイトルとURLのエスケープ/エンコード用関数群。
 * @property {string} [titleFill] 【任意】タイトルが空文字の場合に補完するデフォルト文字列（例: "Untitled"）。
 * @property {string} [emptyFallback] 【任意】タブが0件の場合に出力するフォールバック文字列（未指定時は prefix + postfix になる）。
 */

/**
 * 各フォーマット形式とフォーマッタ設定の紐付け
 * @type {Object.<string, FormatterConfig>}
 */
const FORMATTERS = {
	"url": {
		itemFormatter: ({ url }) => `${url}\n`,
	},
	"tsv": {
		itemFormatter: ({ title, url }) => `${title}\t${url}\n`,
	},
	"csv": {
		itemFormatter: ({ title, url }) => `${title},${url}\n`,
		encoder: { title: escapeCsvCell, url: escapeCsvCell }
	},
	"json": {
		prefix: "[\n",
		itemFormatter: ({ title, url }) => `\t${JSON.stringify({ title, url })}`,
		separator: ",\n",
		postfix: "\n]\n",
		emptyFallback: "[]\n",
		encoder: null // JSON.stringifyがエンコードを担うため不要
	},
	"markdown-link": {
		itemFormatter: ({ title, url }) => `[${title}](${url})\n`,
		titleFill: "Untitled",
		encoder: { title: escapeMarkdownTitle, url: encodeMarkdownUrl }
	},
	"markdown-list": {
		itemFormatter: ({ title, url }) => `- [${title}](${url})\n`,
		titleFill: "Untitled",
		encoder: { title: escapeMarkdownTitle, url: encodeMarkdownUrl }
	},
	"markdown-table": {
		prefix: "| title | url |\n| --- | --- |\n",
		itemFormatter: ({ title, url }) => `| ${title} | ${url} |\n`,
		titleFill: "Untitled",
		encoder: { title: escapeMarkdownTitle, url: encodeMarkdownUrl }
	},
	"html-link": {
		itemFormatter: ({ title, url }) => `<a href="${url}">${title}</a>\n`,
		titleFill: "Untitled",
		encoder: { title: escapeHtml, url: escapeHtml }
	},
	"html-list": {
		prefix: "<ul>\n",
		itemFormatter: ({ title, url }) => `\t<li><a href="${url}">${title}</a></li>\n`,
		postfix: "</ul>\n",
		titleFill: "Untitled",
		encoder: { title: escapeHtml, url: escapeHtml }
	}
};

/**
 * @param {TabLike[]} tabs タブ一覧。
 * @param {string} format 出力形式（"url" | "tsv" | "csv" | "json" | "markdown-link" | "markdown-list" | "markdown-table" | "html-link" | "html-list"）。
 * @returns {string} 生成した文字列。
 */
export function formatUrlList(tabs, format) {
	const def = FORMATTERS[format] ?? FORMATTERS["url"];
	const prefix = def.prefix ?? "";
	const postfix = def.postfix ?? "";
	const separator = def.separator ?? "";

	// タブが0件の場合のフォールバック
	if (!tabs?.length)
		return def.emptyFallback ?? `${prefix}${postfix}`;

	const items = tabs.map(tab => {
		let title = tab.title ?? "";
		let url = tab.url ?? "";

		// マークダウン・HTML系など、titleFillが設定されている場合は空文字を補完
		if (!title && def.titleFill)
			title = def.titleFill;

		// 指定されたエンコーダでタイトルとURLをエスケープ/エンコード
		title = def.encoder?.title?.(title) ?? title;
		url = def.encoder?.url?.(url) ?? url;

		return def.itemFormatter({ title, url });
	});

	// 各要素を結合し、前後にprefix/postfixを付与（postfixには改行を含める）
	return `${prefix}${items.join(separator)}${postfix}`;
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