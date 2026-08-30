const DEFAULT_SETTINGS = {
	displayMode: "detail",
	format: "url",
	range: "current"
};

chrome.runtime.onInstalled.addListener(async () => {
	const current = await chrome.storage.local.get(DEFAULT_SETTINGS);
	await chrome.storage.local.set({
		displayMode: current.displayMode ?? DEFAULT_SETTINGS.displayMode,
		format: current.format ?? DEFAULT_SETTINGS.format,
		range: current.range ?? DEFAULT_SETTINGS.range
	});
});

chrome.commands.onCommand.addListener(async (command) => {
	const range = commandToRange(command);
	if (!range) return;

	try {
		const data = await collectTabs(range);
		const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
		const text = buildText(data.tabs, settings.format ?? "url");

		await chrome.storage.local.set({
			lastAction: {
				id: crypto.randomUUID(),
				range,
				format: settings.format ?? "url",
				tabs: data.tabs,
				text,
				requestedAt: Date.now()
			},
			lastStatus: {
				ok: false,
				message: "",
				count: data.tabs.length,
				time: Date.now()
			}
		});

		const copyResult = await copyToClipboard(text);
		await chrome.storage.local.set({
			lastStatus: {
				ok: copyResult.ok,
				message: copyResult.ok ? `Copied ${data.tabs.length} URL${data.tabs.length === 1 ? "" : "s"}.` : (copyResult.error || "Copy failed."),
				count: data.tabs.length,
				time: Date.now()
			}
		});

		await openPopup();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await chrome.storage.local.set({
			lastAction: {
				id: crypto.randomUUID(),
				range,
				format: (await chrome.storage.local.get(DEFAULT_SETTINGS)).format ?? "url",
				tabs: [],
				text: "",
				requestedAt: Date.now()
			},
			lastStatus: {
				ok: false,
				message: `URL retrieval failed: ${message}`,
				count: 0,
				time: Date.now()
			}
		});
		await openPopup();
	}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "collect-only") {
		collectOnly(message.range, message.format)
			.then(sendResponse)
			.catch((error) => sendResponse({
				ok: false,
				message: error instanceof Error ? error.message : String(error),
				count: 0,
				tabs: [],
				text: ""
			}));
		return true;
	}

	if (message?.type === "collect-and-copy") {
		collectAndCopy(message.range, message.format)
			.then(sendResponse)
			.catch((error) => sendResponse({
				ok: false,
				message: error instanceof Error ? error.message : String(error),
				count: 0,
				tabs: [],
				text: ""
			}));
		return true;
	}
});

function commandToRange(command) {
	switch (command) {
		case "copy-current-tab": return "current";
		case "copy-window-tabs": return "window";
		case "copy-all-tabs": return "all";
		default: return null;
	}
}

async function collectOnly(range, format) {
	try {
		const data = await collectTabs(range);
		const text = buildText(data.tabs, format);

		await chrome.storage.local.set({
			lastAction: {
				id: crypto.randomUUID(),
				range,
				format,
				tabs: data.tabs,
				text,
				requestedAt: Date.now()
			},
			lastStatus: null
		});

		return {
			ok: true,
			message: `Collected ${data.tabs.length} URL${data.tabs.length === 1 ? "" : "s"}.`,
			count: data.tabs.length,
			tabs: data.tabs,
			text
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await chrome.storage.local.set({
			lastAction: {
				id: crypto.randomUUID(),
				range,
				format,
				tabs: [],
				text: "",
				requestedAt: Date.now()
			},
			lastStatus: {
				ok: false,
				message: `URL retrieval failed: ${message}`,
				count: 0,
				time: Date.now()
			}
		});
		return { ok: false, message, count: 0, tabs: [], text: "" };
	}
}

async function collectAndCopy(range, format) {
	try {
		const data = await collectTabs(range);
		const text = buildText(data.tabs, format);
		const copyResult = await copyToClipboard(text);

		await chrome.storage.local.set({
			lastAction: {
				id: crypto.randomUUID(),
				range,
				format,
				tabs: data.tabs,
				text,
				requestedAt: Date.now()
			},
			lastStatus: {
				ok: copyResult.ok,
				message: copyResult.ok
					? `Copied ${data.tabs.length} URL${data.tabs.length === 1 ? "" : "s"}.`
					: (copyResult.error || "Copy failed."),
				count: data.tabs.length,
				time: Date.now()
			}
		});

		return {
			ok: copyResult.ok,
			message: copyResult.ok ? `Copied ${data.tabs.length} URL${data.tabs.length === 1 ? "" : "s"}.` : copyResult.error,
			count: data.tabs.length,
			tabs: data.tabs,
			text
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await chrome.storage.local.set({
			lastAction: {
				id: crypto.randomUUID(),
				range,
				format,
				tabs: [],
				text: "",
				requestedAt: Date.now()
			},
			lastStatus: {
				ok: false,
				message: `URL retrieval failed: ${message}`,
				count: 0,
				time: Date.now()
			}
		});
		return { ok: false, message, count: 0, tabs: [], text: "" };
	}
}

async function collectTabs(range) {
	let tabs;
	if (range === "current") {
		const result = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
		tabs = result.slice(0, 1);
	} else if (range === "window") {
		const result = await chrome.tabs.query({ currentWindow: true });
		tabs = result;
	} else if (range === "all") {
		tabs = await chrome.tabs.query({});
	} else {
		throw new Error(`Unknown range: ${range}`);
	}

	const normalized = tabs
		.filter(tab => typeof tab.url === "string" && tab.url.length > 0)
		.map(tab => ({
			id: tab.id ?? null,
			title: tab.title ?? "",
			url: tab.url
		}));

	return { tabs: normalized };
}

function buildText(tabs, format) {
	const lines = format === "title-url"
		? tabs.map(tab => `${tab.title}\t${tab.url}\n`)
		: tabs.map(tab => `${tab.url}\n`);
	return lines.join("");
}

async function copyToClipboard(text) {
	try {
		await ensureOffscreenDocument();
		const response = await chrome.runtime.sendMessage({
			type: "offscreen-copy",
			text
		});
		if (response?.ok)
			return { ok: true };
		return { ok: false, error: response?.error || "Copy failed." };
	} catch (error) {
		return {
			ok: false,
			error: `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}

async function ensureOffscreenDocument() {
	const offscreenUrl = chrome.runtime.getURL("offscreen/offscreen.html");
	const contexts = await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT"],
		documentUrls: [offscreenUrl]
	});
	if (contexts.length > 0) return;

	await chrome.offscreen.createDocument({
		url: "offscreen/offscreen.html",
		reasons: ["CLIPBOARD"],
		justification: "Copy collected tab URLs to the system clipboard."
	});
}

async function openPopup() {
	try {
		if (chrome.action.openPopup) {
			await chrome.action.openPopup();
		}
	} catch {
		// Opening a popup from a command can be unavailable in some Chrome environments.
		// The copy operation has already completed, so there is nothing else to do.
	}
}
