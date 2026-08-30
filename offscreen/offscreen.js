/**
 * @fileoverview オフスクリーン文書でのクリップボード操作のフォールバック実装。
 * バックグラウンドスクリプトからのコピー要求を受け取り、textarea を利用して execCommand を実行する。
 */

/**
 * オフスクリーン文書上で、バックグラウンド側からのコピー要求を受け取り、フォールバック処理を実行する。
 *
 * @param {{ type?: string, text?: string }} message 受信したメッセージ。
 * @param {unknown} sender 送信元情報。
 * @param {(response?: { ok: boolean, error?: string }) => void} sendResponse 応答コールバック。
 */
function handleOffscreenCopyRequest(message, sender, sendResponse) {
	if (message?.type === "offscreen-copy") {
		const success = copyTextFallback(message.text);
		if (success) {
			sendResponse({ ok: true });
		} else {
			sendResponse({ ok: false, error: "Copy command failed." });
		}
	}
}

chrome.runtime.onMessage.addListener(handleOffscreenCopyRequest);

/**
 * textarea を画面外に配置し、execCommand でクリップボードコピーを試みる。
 *
 * @param {string} text コピー対象の文字列。
 * @returns {boolean} コピーに成功したかどうか。
 */
function copyTextFallback(text) {
	// textareaを作成して画面に配置
	const textarea = document.createElement("textarea");
	textarea.value = text;

	// 画面外に配置しつつ編集可能状態にする
	textarea.style.position = "fixed";
	textarea.style.left = "-9999px";
	textarea.style.top = "-9999px";
	document.body.appendChild(textarea);

	// フォーカスして選択・コピー
	textarea.focus();
	textarea.select();

	let result = false;
	try {
		result = document.execCommand("copy");
	} catch (error) {
		console.error("ExecCommand error:", error);
	}

	document.body.removeChild(textarea);
	return result;
}
