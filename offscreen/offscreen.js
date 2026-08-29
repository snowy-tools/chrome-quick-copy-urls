chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type !== "offscreen-copy") return;

	navigator.clipboard.writeText(message.text ?? "")
		.then(() => sendResponse({ ok: true }))
		.catch(error => sendResponse({
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		}));

	return true;
});
