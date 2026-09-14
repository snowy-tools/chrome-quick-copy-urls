/**
 * @fileoverview メッセージ生成に関する共通処理。
 * URL件数に応じた単数/複数表記や、収集・コピー・フィルタ・フォーマット操作の
 * 結果を表す表示用文言をここに集約する。
 * service-worker.js と popup.js の双方から参照することで、
 * 各所に散らばっていた同種のロジック（単数/複数表記のズレ、句点の有無などの
 * 表記揺れ）を防ぎ、文言変更時の修正箇所を一箇所にまとめる。
 */

/**
 * URL件数を「N URL」または「N URLs」の形式に整形する。
 * 0件の場合も複数形（"0 URLs"）として扱う。
 * adjective を指定すると「N blank URLs」のように名詞の前に修飾語を挿入する。
 *
 * @param {number} count 件数。
 * @param {string} [adjective] URLの前に付ける修飾語（例: "blank"）。
 * @returns {string} 例: "0 URLs", "1 URL", "3 URLs", "2 blank URLs"。
 */
export function formatUrlCount(count, adjective) {
	const noun = `URL${count === 1 ? "" : "s"}`;

	return adjective ? `${count} ${adjective} ${noun}` : `${count} ${noun}`;
}

/**
 * 収集結果に含まれていた空文字列URLの件数を、追加情報の注記として整形する。
 * 空文字列URLが0件の場合は何も表示しない。
 * フィルタで除外されたか、結果にそのまま含まれているかによって文言を変える。
 *
 * @param {number} blankCount 空文字列URLの件数。
 * @param {boolean} filterBlankUrls 空文字列URLをフィルタで除外する設定かどうか。
 * @returns {string} 例: " (2 blank URLs excluded)"。0件の場合は空文字列。
 */
export function buildBlankUrlNote(blankCount, filterBlankUrls) {
	if (!blankCount)
		return "";

	const suffix = filterBlankUrls ? "excluded" : "included";

	return ` (${formatUrlCount(blankCount, "blank")} ${suffix})`;
}

/**
 * URL収集成功時の表示用メッセージを生成する。
 * 空文字列URLが収集結果に含まれていた場合、その件数を追加情報として付記する。
 *
 * @param {number} count 収集件数（フィルタ適用後）。
 * @param {{ blankCount?: number, filterBlankUrls?: boolean }} [blankInfo] 空文字列URLに関する情報。
 * @returns {string} 表示用メッセージ。
 */
export function buildCollectedMessage(count, { blankCount = 0, filterBlankUrls = true } = {}) {
	return `Collected ${formatUrlCount(count)}.${buildBlankUrlNote(blankCount, filterBlankUrls)}`;
}

/**
 * クリップボードへのコピー成功時の表示用メッセージを生成する。
 * 空文字列URLが収集結果に含まれていた場合、その件数を追加情報として付記する。
 *
 * @param {number} count コピー件数（フィルタ適用後）。
 * @param {{ blankCount?: number, filterBlankUrls?: boolean }} [blankInfo] 空文字列URLに関する情報。
 * @returns {string} 表示用メッセージ。
 */
export function buildCopiedMessage(count, { blankCount = 0, filterBlankUrls = true } = {}) {
	return `Copied ${formatUrlCount(count)}.${buildBlankUrlNote(blankCount, filterBlankUrls)}`;
}

/**
 * フィルタ再適用時の表示用メッセージを生成する。
 *
 * @param {number} count フィルタ後の件数。
 * @returns {string} 表示用メッセージ。
 */
export function buildFilteredMessage(count) {
	return `Filtered ${formatUrlCount(count)}.`;
}

/**
 * 出力フォーマット変更時の表示用メッセージを生成する。
 *
 * @param {number} count 件数。
 * @returns {string} 表示用メッセージ。
 */
export function buildFormattedMessage(count) {
	return `Formatted for ${formatUrlCount(count)}.`;
}

/**
 * ステータス欄に既定文言として表示する、収集結果の要約テキストを生成する。
 * 個別の成功/失敗メッセージが指定されなかった場合の代替表示に使う。
 *
 * @param {number} count 件数。
 * @returns {string} 例: "No URLs collected.", "3 URLs collected."。
 */
export function buildCollectedSummaryText(count) {
	return count > 0
		? `${formatUrlCount(count)} collected.`
		: "No URLs collected.";
}
