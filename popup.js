const state = {
	tabs: [],
	range: "current",
	format: "url",
	mode: "detail"
};

const rangeSelect = document.getElementById("rangeSelect");
const formatSelect = document.getElementById("formatSelect");
const urls = document.getElementById("urls");
const status = document.getElementById("status");
const summary = document.getElementById("summary");
const compactValue = document.getElementById("compactValue");
const compactStatus = document.getElementById("compactStatus");
const detailView = document.getElementById("detailView");
const compactView = document.getElementById("compactView");
const modeButton = document.getElementById("modeButton");

document.addEventListener("DOMContentLoaded", initialize);
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName !== "local")
		return;
	if (!("lastAction" in changes || "lastStatus" in changes))
		return;
	applyStoredState();
});

async function initialize() {
	const saved = await chrome.storage.local.get({
		displayMode: "detail",
		format: "url",
		range: "current",
		lastAction: null,
		lastStatus: null
	});

	state.mode = saved.displayMode;
	state.format = saved.format;
	state.range = saved.range;

	rangeSelect.value = state.range;
	formatSelect.value = state.format;

	if (saved.lastAction?.tabs) {
		state.tabs = saved.lastAction.tabs;
		state.range = saved.lastAction.range || state.range;
		state.format = saved.lastAction.format || state.format;
		rangeSelect.value = state.range;
		formatSelect.value = state.format;
		urls.value = saved.lastAction.text ?? buildText();
		showStatus(saved.lastStatus);
	} else {
		await regenerate(false, false);
	}

	applyMode();
}

async function applyStoredState() {
	const saved = await chrome.storage.local.get({
		displayMode: "detail",
		format: "url",
		range: "current",
		lastAction: null,
		lastStatus: null
	});

	state.mode = saved.displayMode;
	state.format = saved.format;
	state.range = saved.range;

	if (saved.lastAction?.tabs) {
		state.tabs = saved.lastAction.tabs;
		state.range = saved.lastAction.range || state.range;
		state.format = saved.lastAction.format || state.format;
		rangeSelect.value = state.range;
		formatSelect.value = state.format;
		urls.value = saved.lastAction.text ?? buildText();
	} else {
		state.tabs = [];
		urls.value = "";
	}

	showStatus(saved.lastStatus);
	updateSummary();
	updateCompactValue();
	applyMode();
}

rangeSelect.addEventListener("change", async () => {
	state.range = rangeSelect.value;
	await chrome.storage.local.set({ range: state.range });
	await regenerate(false, false);
});

formatSelect.addEventListener("change", async () => {
	state.format = formatSelect.value;
	urls.value = buildText();
	await chrome.storage.local.set({ format: state.format });
});

document.getElementById("refreshButton").addEventListener("click", () => regenerate(false, false));
document.getElementById("copyButton").addEventListener("click", () => regenerate(true, true));
modeButton.addEventListener("click", async () => {
	state.mode = state.mode === "detail" ? "compact" : "detail";
	await chrome.storage.local.set({ displayMode: state.mode });
	applyMode();
});

async function regenerate(shouldCopy, copyFresh) {
	clearStatus();

	const response = await chrome.runtime.sendMessage({
		type: copyFresh ? "collect-and-copy" : "collect-only",
		range: state.range,
		format: state.format
	});

	state.tabs = response?.tabs ?? [];
	urls.value = response?.text ?? buildText();

	if (response?.ok) {
		showStatus({
			ok: true,
			message: response.message,
			count: response.count
		});
	} else {
		showStatus({
			ok: false,
			message: response?.message || (shouldCopy ? "URL retrieval/copy failed." : "URL retrieval failed."),
			count: response?.count ?? 0
		});
	}
}

function buildText() {
	const lines = state.format === "title-url"
		? state.tabs.map(tab => `${tab.title}\t${tab.url}\n`)
		: state.tabs.map(tab => `${tab.url}\n`);
	return lines.join("");
}

function showStatus(data) {
	if (!data?.message) {
		clearStatus();
		return;
	}
	const nodes = [status, compactStatus];
	for (const node of nodes) {
		node.textContent = data.message;
		node.className = `status ${data.ok ? "ok" : "error"}`;
		node.classList.remove("flash");
		void node.offsetWidth;
		node.classList.add("flash");
	}
	updateSummary(data.count ?? state.tabs.length);
	updateCompactValue();
}

function clearStatus() {
	for (const node of [status, compactStatus]) {
		node.textContent = "";
		node.className = "status";
		node.classList.remove("flash");
	}
}

function updateSummary(count = state.tabs.length) {
	summary.textContent = `${count} URL${count === 1 ? "" : "s"} collected`;
}

function updateCompactValue() {
	const count = state.tabs.length;
	if (count === 1 && state.range === "current") {
		compactValue.textContent = state.tabs[0]?.url ?? "No URL";
	} else {
		compactValue.textContent = `${count} URL${count === 1 ? "" : "s"}`;
	}
}

function applyMode() {
	const compact = state.mode === "compact";
	document.body.classList.toggle("compact", compact);
	detailView.hidden = compact;
	compactView.hidden = !compact;
	modeButton.title = compact ? "Switch to detailed view" : "Switch to compact view";
	updateSummary();
	updateCompactValue();
}
