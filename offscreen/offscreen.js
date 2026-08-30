chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "offscreen-copy") {
		const success = copyTextFallback(message.text);
		if (success) {
			sendResponse({ ok: true });
		} else {
			sendResponse({ ok: false, error: "Copy command failed." });
		}
	}
});

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
	} catch (err) {
		console.error("ExecCommand error:", err);
	}

	document.body.removeChild(textarea);
	return result;
}