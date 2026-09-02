/**
 * @fileoverview 設定画面（options.html）の制御スクリプト。
 * ユーザーが選択したグローバル設定を storage.local に保存し、バックグラウンドでの収集範囲決定に利用させる。
 */

const rangeSelect = document.getElementById("actionButtonRange");

/**
 * 画面ロード時に現在の設定値を読み込み、UIへ復元する。
 */
document.addEventListener("DOMContentLoaded", async () => {
	const settings = await chrome.storage.local.get({ actionButtonRange: "current" });

	if (rangeSelect)
		rangeSelect.value = settings.actionButtonRange;
});

/**
 * 設定値の変更を検知し、即座にストレージへ保存する。
 */
rangeSelect?.addEventListener("change", async (event) => {
	const target = event.target;

	await chrome.storage.local.set({
		actionButtonRange: target.value
	});
});