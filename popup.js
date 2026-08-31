/**
 * @fileoverview ポップアップ画面のUI状態を管理する。
 * 保存済み設定、最終アクション結果、表示モードを統合し、収集したURLの一覧やコピー状態を表示する。
 */

import { formatUrlListText } from "./core.js";

/**
 * @typedef {Object} TabEntry
 * @property {number|null} id タブID。
 * @property {string} title タブタイトル。
 * @property {string} url タブURL。
 */

/**
 * @typedef {Object} ActionState
 * @property {TabEntry[]} tabs 収集済みタブ一覧。
 * @property {string} collectRange 収集範囲。
 * @property {string} format 出力フォーマット。
 * @property {"detail" | "compact"} displayMode 表示モード。
 */

/**
 * @type {ActionState}
 */
const state = {
	tabs: [],
	collectRange: "current",
	format: "url",
	displayMode: "detail"
};

/**
 * DOM要素の参照を保持するオブジェクト。
 */
const elements = {
	rangeSelect: /** @type {HTMLSelectElement} */ document.getElementById("rangeSelect"),
	formatSelect: /** @type {HTMLSelectElement} */ document.getElementById("formatSelect"),
	urlList: /** @type {HTMLTextAreaElement} */ document.getElementById("urlList"),
	statusLabel: document.getElementById("statusLabel"),
	detailControls: document.getElementById("detailControls"),
	modeButton: document.getElementById("modeButton"),
	refreshButton: document.getElementById("refreshButton"),
	copyButton: document.getElementById("copyButton")
};

/**
 * ポップアップが読み込まれた直後に初期化を行う。
 *
 * @param {Event} event DOMContentLoaded イベント。
 */
function onInitialLoaded(event) {
	initialize();
}

/**
 * 保存済みの設定と直近のアクション結果を復元して UI を初期化する。
 *
 * @returns {Promise<void>} 初期化完了時に解決する Promise。
 */
async function initialize() {
	const data = await getStoredSettings();

	const displayMode = data.displayMode;
	state.displayMode = displayMode;
	applyDisplayMode(displayMode);

	await loadStateFromStorage(data);
}

/**
 * ストレージに保存された動作設定や実行結果をもとにUI を同期する。
 *
 * @param {Record<string, chrome.storage.StorageChange>} changes 変更されたストレージ項目。
 * @param {string} areaName 変更対象のストレージ領域。
 */
async function onStorageChanged(changes, areaName) {
	if (areaName !== "local")
		return;

	if ("lastAction" in changes) {
		const data = await getStoredSettings();
		loadStateFromStorage(data);
	}
}

/**
 * 現在の収集範囲とフォーマットに基づいて URL を再生成し、必要ならコピーも実行する。
 *
 * @param {boolean} [shouldCopy=false] コピーもあわせて実行するかどうか。
 * @returns {Promise<void>} 再生成完了時に解決する Promise。
 */
async function executeUrlCollection(shouldCopy = false) {
	clearStatusLabels();

	const response = await chrome.runtime.sendMessage({
		type: shouldCopy ? "collect-and-copy" : "collect",
		collectRange: state.collectRange,
		format: state.format,
	});

	state.tabs = response?.tabs ?? [];
	elements.urlList.value = response?.text ?? "";

	if (response?.ok) {
		showStatus({
			ok: true,
			message: response.message,
			count: response.count,
		});
	} else {
		showStatus({
			ok: false,
			message: response?.message || (shouldCopy
				? "URL retrieval/copy failed."
				: "URL retrieval failed."),
			count: response?.count ?? 0,
		});
	}
}

/**
 * 保存された動作設定と最後のアクション状態を取得する。
 *
 * @returns {Promise<Object>} ストレージから復元した値。
 */
async function getStoredSettings() {
	return await chrome.storage.local.get({
		displayMode: "detail",
		format: "url",
		collectRange: "current",
		lastAction: null
	});
}

/* ==========================================================================
   内部状態更新用の関数群（DOM操作を行わず、内部データのみを更新する）
   ========================================================================== */

/**
 * storage の設定値を現在の state に読み込む。
 *
 * @param {Object} data ストレージから取得したデータ。
 */
async function loadStateFromStorage(data) {
	const lastAction = data.lastAction;

	state.format = lastAction?.format ?? state.format;
	state.collectRange = lastAction?.collectRange ?? state.collectRange;
	state.tabs = lastAction?.tabs ?? [];

	elements.rangeSelect.value = state.collectRange;
	elements.formatSelect.value = state.format;

	updateUrlList(lastAction);
	showStatus(lastAction);
}

/* ==========================================================================
   UI 更新用の関数群（State のデータを DOM に反映する）
   ========================================================================== */

/**
 * ステータスメッセージを表示し、指定がない場合は要約を表示する。
 *
 * @param {{ ok?: boolean, message?: string, count?: number } | undefined} status 表示するステータス情報。
 */
function showStatus(status) {
	if (!elements.statusLabel)
		return;

	const count = status?.count ?? state.tabs.length;

	if (status?.message) {
		elements.statusLabel.textContent = status.message;
		elements.statusLabel.className = `status ${status.ok ? "ok" : "error"}`;

		elements.statusLabel.classList.remove("flash");
		void elements.statusLabel.offsetWidth;
		elements.statusLabel.classList.add("flash");
	} else {
		clearStatusLabels();
		elements.statusLabel.textContent = count > 0
			? `${count} URL${count === 1 ? "" : "s"} collected`
			: "No URLs collected.";
	}
}

/**
 * ステータス表示をクリアし、初期状態に戻す。
 */
function clearStatusLabels() {
	if (!elements.statusLabel)
		return;

	elements.statusLabel.textContent = "";
	elements.statusLabel.className = "status";
	elements.statusLabel.classList.remove("flash");
}

/**
 * URL一覧のテキストUIを更新する。
 *
 * @param {Object} [data] アクション状態データ。
 */
function updateUrlList(data) {
	if (!elements.urlList)
		return;

	elements.urlList.value = data?.text ?? "";
}

/**
 * 現在の表示モード状態に応じて UI の表示形式を切り替える。
 *
 * @param {string} displayMode 表示モード。
 */
function applyDisplayMode(displayMode) {
	const compact = displayMode === "compact";

	document.body.classList.toggle("compact", compact);

	if (elements.modeButton) {
		elements.modeButton.textContent = compact ? "▼" : "▲";
		elements.modeButton.title = compact
			? "Switch to detailed view"
			: "Switch to compact view";
		elements.modeButton.setAttribute("aria-expanded", String(!compact));
	}
}

/* ==========================================================================
   UI イベントハンドラ
   ========================================================================== */

/**
 * 再生成ボタン押下時に対象URLを再収集する。
 */
function onRefreshButtonClicked() {
	executeUrlCollection(false);
}

/**
 * コピーボタン押下時に URL を再収集してすぐコピーする。
 */
function onCopyButtonClicked() {
	executeUrlCollection(true);
}

/**
 * 収集範囲の選択が変わったときに state と storage を更新し、一覧を再生成する。
 *
 * @returns {Promise<void>} 更新完了時に解決する Promise。
 */
async function onRangeSelectChanged() {
	state.collectRange = elements.rangeSelect.value;

	await chrome.storage.local.set({
		collectRange: state.collectRange
	});

	await executeUrlCollection(false);
}

/**
 * 出力フォーマットの選択が変わったときに state と UI を更新する。
 *
 * @returns {Promise<void>} 更新完了時に解決する Promise。
 */
async function onFormatSelectChanged() {
	state.format = elements.formatSelect.value;
	elements.urlList.value = formatUrlListText(state.tabs, state.format);

	await chrome.storage.local.set({
		format: state.format
	});
}

/**
 * 表示モード切替ボタンが押されたときにモードを切り替える。
 *
 * @returns {Promise<void>} 保存と反映の完了時に解決する Promise。
 */
async function onModeButtonToggled() {
	const displayMode = state.displayMode === "detail"
		? "compact"
		: "detail";

	state.displayMode = displayMode;
	applyDisplayMode(displayMode);

	await chrome.storage.local.set({
		displayMode: state.displayMode
	});
}

/* イベント登録 */
document.addEventListener("DOMContentLoaded", onInitialLoaded);
chrome.storage.onChanged.addListener(onStorageChanged);

elements.rangeSelect.addEventListener("change", onRangeSelectChanged);
elements.formatSelect.addEventListener("change", onFormatSelectChanged);
elements.refreshButton.addEventListener("click", onRefreshButtonClicked);
elements.copyButton.addEventListener("click", onCopyButtonClicked);
elements.modeButton.addEventListener("click", onModeButtonToggled);