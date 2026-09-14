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
 *
 * @param {number} count 件数。
 * @returns {string} 例: "0 URLs", "1 URL", "3 URLs"。
 */
export function formatUrlCount(count) {
	return `${count} URL${count === 1 ? "" : "s"}`;
}

/**
 * URL収集成功時の表示用メッセージを生成する。
 *
 * @param {number} count 収集件数。
 * @returns {string} 表示用メッセージ。
 */
export function buildCollectedMessage(count) {
	return `Collected ${formatUrlCount(count)}.`;
}

/**
 * クリップボードへのコピー成功時の表示用メッセージを生成する。
 *
 * @param {number} count コピー件数。
 * @returns {string} 表示用メッセージ。
 */
export function buildCopiedMessage(count) {
	return `Copied ${formatUrlCount(count)}.`;
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
