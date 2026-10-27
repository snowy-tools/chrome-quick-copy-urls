/**
 * @fileoverview 設定画面（options.html）の制御スクリプト。
 * ユーザーが選択したグローバル設定を storage.local に保存し、バックグラウンドでの収集範囲決定に利用させる。
 */

let rangeSelect = null;

/**
 * 画面ロード時に現在の設定値を読み込み、UIへ復元する。
 */
document.addEventListener("DOMContentLoaded", async () => {
	rangeSelect = document.getElementById("actionButtonCollectRange");
	const settings = await chrome.storage.local.get({ actionButtonCollectRange: "highlighted" });
	
	if (rangeSelect)
		rangeSelect.value = settings.actionButtonCollectRange;
	
	// DOM が利用可能になったタイミングでイベントリスナを登録する
	rangeSelect?.addEventListener("change", async (event) => {
		const target = event.target;
		
		await chrome.storage.local.set({
			actionButtonCollectRange: target.value,
		});
	});
});