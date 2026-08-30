/**
 * @fileoverview ポップアップ画面のUI状態を管理する。
 * 保存済み設定、最終アクション結果、表示モードを統合し、収集したURLの一覧やコピー状態を表示する。
 */

/**
 * @typedef {Object} TabEntry
 * @property {number|null} id タブID。
 * @property {string} title タブタイトル。
 * @property {string} url タブURL。
 */

/**
 * @typedef {Object} ActionState
 * @property {TabEntry[]} tabs 収集済みタブ一覧。
 * @property {string} range 収集範囲。
 * @property {string} format 出力フォーマット。
 * @property {"detail" | "compact"} mode 表示モード。
 */

/**
 * @type {ActionState}
 */
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

/**
 * ポップアップが読み込まれた直後に初期化を行う。
 *
 * @param {Event} event DOMContentLoaded イベント。
 */
function handleInitialLoad(event) {
	initialize();
}

document.addEventListener("DOMContentLoaded", handleInitialLoad);

/**
 * 保存された設定や最後の実行結果が更新されたら、UI を同期する。
 *
 * @param {Record<string, chrome.storage.StorageChange>} changes 変更されたストレージ項目。
 * @param {string} areaName 変更対象のストレージ領域。
 */
function handleStorageChange(changes, areaName) {
	if (areaName !== "local") {
		return;
	}
	if (!("lastAction" in changes || "lastStatus" in changes)) {
		return;
	}
	applyStoredState();
}

chrome.storage.onChanged.addListener(handleStorageChange);

/**
 * 保存済みの設定と直近のアクション結果を復元して UI を初期化する。
 *
 * @returns {Promise<void>} 初期化完了時に解決する Promise。
 */
async function initialize() {
	const saved = await getStoredSettings();
	syncSelectionState(saved);

	if (saved.lastAction?.tabs) {
		applyActionToState(saved.lastAction);
		showStatus(saved.lastStatus);
	} else {
		await regenerate(false, false);
	}

	applyMode();
}

/**
 * storage の変更を受け取り、UI と内部 state を同一の状態へ揃える。
 *
 * @returns {Promise<void>} 更新反映完了時に解決する Promise。
 */
async function applyStoredState() {
	const saved = await getStoredSettings();
	syncSelectionState(saved);

	if (saved.lastAction?.tabs) {
		applyActionToState(saved.lastAction);
	} else {
		state.tabs = [];
		urls.value = "";
	}

	showStatus(saved.lastStatus);
	updateSummary();
	updateCompactValue();
	applyMode();
}

/**
 * 保存された設定と最後のアクション状態を取得する。
 *
 * @returns {Promise<{ displayMode: string, format: string, range: string, lastAction: any, lastStatus: any }>} ストレージから復元した値。
 */
function getStoredSettings() {
	return chrome.storage.local.get({
		displayMode: "detail",
		format: "url",
		range: "current",
		lastAction: null,
		lastStatus: null
	});
}

/**
 * storage の設定値を現在の UI に反映する。
 *
 * @param {{ displayMode?: string, format?: string, range?: string, lastAction?: { tabs?: TabEntry[] }, lastStatus?: any }} saved 保存済みの設定値。
 */
function syncSelectionState(saved) {
	state.mode = saved.displayMode;
	state.format = saved.format;
	state.range = saved.range;
	state.tabs = saved.lastAction?.tabs ?? state.tabs;

	rangeSelect.value = state.range;
	formatSelect.value = state.format;
}

/**
 * 最後に実行したアクション情報を state と UI の入力欄に反映する。
 *
 * @param {{ tabs?: TabEntry[], range?: string, format?: string, text?: string }} action 実行済みアクション。
 */
function applyActionToState(action) {
	state.tabs = action.tabs;
	state.range = action.range || state.range;
	state.format = action.format || state.format;
	valuesToControls();
	urls.value = action.text ?? buildText();
}

/**
 * state と select の値を同一にする。
 */
function valuesToControls() {
	rangeSelect.value = state.range;
	formatSelect.value = state.format;
}

/**
 * 収集範囲の選択が変わったときに state と storage を更新し、一覧を再生成する。
 *
 * @returns {Promise<void>} 更新完了時に解決する Promise。
 */
async function handleRangeChange() {
	state.range = rangeSelect.value;
	await chrome.storage.local.set({ range: state.range });
	await regenerate(false, false);
}

/**
 * 出力フォーマットの選択が変わったときに state と UI を更新する。
 *
 * @returns {Promise<void>} 更新完了時に解決する Promise。
 */
async function handleFormatChange() {
	state.format = formatSelect.value;
	urls.value = buildText();
	await chrome.storage.local.set({ format: state.format });
}

/**
 * 再生成ボタン押下時に対象URLを再収集する。
 */
function handleRefreshClick() {
	regenerate(false, false);
}

/**
 * コピーボタン押下時に URL を再収集してすぐコピーする。
 */
function handleCopyClick() {
	regenerate(true, true);
}

/**
 * 表示モード切替ボタンが押されたときにモードを切り替える。
 *
 * @returns {Promise<void>} 保存と反映の完了時に解決する Promise。
 */
async function handleModeToggle() {
	state.mode = state.mode === "detail" ? "compact" : "detail";
	await chrome.storage.local.set({ displayMode: state.mode });
	applyMode();
}

rangeSelect.addEventListener("change", handleRangeChange);
formatSelect.addEventListener("change", handleFormatChange);
document.getElementById("refreshButton").addEventListener("click", handleRefreshClick);
document.getElementById("copyButton").addEventListener("click", handleCopyClick);
modeButton.addEventListener("click", handleModeToggle);

/**
 * 現在の収集範囲とフォーマットに基づいて URL を再生成し、必要ならコピーも実行する。
 *
 * @param {boolean} shouldCopy コピーが必要かどうか。
 * @param {boolean} copyFresh コピーを実行するかどうか。
 * @returns {Promise<void>} 再生成完了時に解決する Promise.
 */
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

/**
 * 現在の state に基づいてテキストを生成する。
 *
 * @returns {string} 生成した URL 一覧テキスト。
 */
function buildText() {
	const lines = state.format === "title-url"
		? state.tabs.map((tab) => `${tab.title}\t${tab.url}\n`)
		: state.tabs.map((tab) => `${tab.url}\n`);
	return lines.join("");
}

/**
 * ステータスメッセージを表示し、必要な要約とコンパクト表示も更新する。
 *
 * @param {{ ok?: boolean, message?: string, count?: number } | undefined} data 表示するステータス情報。
 */
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

/**
 * ステータス表示をクリアする。
 */
function clearStatus() {
	for (const node of [status, compactStatus]) {
		node.textContent = "";
		node.className = "status";
		node.classList.remove("flash");
	}
}

/**
 * 収集件数の概要文を更新する。
 *
 * @param {number} [count=state.tabs.length] 表示する件数。
 */
function updateSummary(count = state.tabs.length) {
	summary.textContent = `${count} URL${count === 1 ? "" : "s"} collected`;
}

/**
 * コンパクト表示用の値を更新する。
 */
function updateCompactValue() {
	const count = state.tabs.length;
	if (count === 1 && state.range === "current") {
		compactValue.textContent = state.tabs[0]?.url ?? "No URL";
	} else {
		compactValue.textContent = `${count} URL${count === 1 ? "" : "s"}`;
	}
}

/**
 * 現在の表示モードに応じて詳細表示とコンパクト表示を切り替える。
 */
function applyMode() {
	const compact = state.mode === "compact";
	document.body.classList.toggle("compact", compact);
	detailView.hidden = compact;
	compactView.hidden = !compact;
	modeButton.title = compact ? "Switch to detailed view" : "Switch to compact view";
	updateSummary();
	updateCompactValue();
}
