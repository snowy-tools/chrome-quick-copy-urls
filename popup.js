/**
 * @fileoverview ポップアップ画面のUI状態を管理する。
 * 保存済み動作条件、自身が属するタブの直近のアクション結果、表示モードを統合し、
 * 収集したURLの一覧やコピー状態を表示する。
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
 * @property {number|null} tabId ポップアップが表示されているタブのID。
 */

/**
 * @type {ActionState}
 */
const state = {
	tabs: [],
	collectRange: "current",
	format: "url",
	displayMode: "detail",
	tabId: null,
};

/**
 * DOM要素の参照を保持するオブジェクト。
 */
const elements = {
	rangeSelect: /** @type {HTMLFieldSetElement|null} */ null,
	formatSelect: /** @type {HTMLFieldSetElement|null} */ null,
	urlList: /** @type {HTMLTextAreaElement|null} */ null,
	statusLabel: /** @type {HTMLElement|null} */ null,
	detailControls: /** @type {HTMLElement|null} */ null,
	modeButton: /** @type {HTMLButtonElement|null} */ null,
	refreshButton: /** @type {HTMLButtonElement|null} */ null,
	copyButton: /** @type {HTMLButtonElement|null} */ null,
};

function bindDomElements() {
	// Fetch DOM elements after DOMContentLoaded
	elements.rangeSelect = /** @type {HTMLFieldSetElement|null} */ document.getElementById("rangeSelect");
	elements.formatSelect = /** @type {HTMLFieldSetElement|null} */ document.getElementById("formatSelect");
	elements.urlList = /** @type {HTMLTextAreaElement|null} */ document.getElementById("urlList");
	elements.statusLabel = /** @type {HTMLElement|null} */ document.getElementById("statusLabel");
	elements.detailControls = /** @type {HTMLElement|null} */ document.getElementById("detailControls");
	elements.modeButton = /** @type {HTMLButtonElement|null} */ document.getElementById("modeButton");
	elements.refreshButton = /** @type {HTMLButtonElement|null} */ document.getElementById("refreshButton");
	elements.copyButton = /** @type {HTMLButtonElement|null} */ document.getElementById("copyButton");

	// Register event listeners if elements exist
	if (elements.rangeSelect)
		elements.rangeSelect.addEventListener("change", onRangeSelectChanged);
	if (elements.formatSelect)
		elements.formatSelect.addEventListener("change", onFormatSelectChanged);
	if (elements.refreshButton)
		elements.refreshButton.addEventListener("click", onRefreshButtonClicked);
	if (elements.copyButton)
		elements.copyButton.addEventListener("click", onCopyButtonClicked);
	if (elements.modeButton)
		elements.modeButton.addEventListener("click", onModeButtonToggled);

	// Listen for runtime messages to update UI
	chrome.runtime.onMessage.addListener(onRuntimeMessage);
}

/**
 * ポップアップが読み込まれた直後に初期化を行う。
 *
 * @param {Event} event DOMContentLoaded イベント。
 */
function onInitialLoaded(event) {
	initialize();
}

/**
 * 自身が属するタブのIDを取得し、バックグラウンドから関連するアクション結果を
 * 取得して UI を初期化する。
 *
 * @returns {Promise<void>} 初期化完了時に解決する Promise。
 */
async function initialize() {
	const data = await getStoredData();

	const displayMode = data.displayMode;
	state.displayMode = displayMode;

	// Bind DOM elements and register UI event listeners now that DOM is ready
	bindDomElements();

	applyDisplayMode(displayMode);

	// ポップアップが存在するウィンドウのアクティブタブを取得する
	const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

	state.tabId = tabs.length > 0 ? tabs[0].id : null;

	// バックグラウンドプロセスに現在タブのアクション実行結果を問い合わせる
	const tabAction = await chrome.runtime.sendMessage({
		type: "get-action-state",
		tabId: state.tabId,
	});

	if (tabAction) {
		await loadStateFromAction(tabAction);
	} else {
		// 処理中のタブ切り替えなどの特殊な理由でデータが存在しない場合、
		// 意図しない対象の自動収集を防ぐためにエラー状態とする
		showStatus({
			ok: false,
			message: "No collection data found for this tab.",
		});
	}
}

/**
 * 現在の収集範囲とフォーマットに基づいて URL を再生成する。
 * 対象となるアクティブタブ等の判定基準として、現在のタブIDを含めて要求する。
 *
 * @returns {Promise<void>} 再生成完了時に解決する Promise。
 */
async function executeUrlCollection() {
	clearStatusLabels();

	const response = await chrome.runtime.sendMessage({
		type: "collect",
		collectRange: state.collectRange,
		format: state.format,
		tabId: state.tabId,
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
			message: response?.message || "URL retrieval failed.",
			count: response?.count ?? 0,
		});
	}
}

/**
 * 前回の動作状態や表示モードをストレージから取得する。
 * UIの初期表示やデータ復元のベースとして使用する。
 *
 * @returns {Promise<Object>} ストレージから復元した値。
 */
async function getStoredData() {
	return await chrome.storage.local.get({
		displayMode: "detail",
		format: "url",
		collectRange: "current",
	});
}

/* ==========================================================================
   内部状態更新用の関数群（DOM操作を行わず、内部データのみを更新する）
   ========================================================================== */

/**
 * メッセージの処理結果を現在の state に読み込む。
 *
 * @param {Object} actionData 復元するアクションデータ。
 */
async function loadStateFromAction(actionData) {
	state.format = actionData.format ?? state.format;
	state.collectRange = actionData.collectRange ?? state.collectRange;
	state.tabs = actionData.tabs ?? [];

	const rangeRadio = document.querySelector(`input[name="range"][value="${state.collectRange}"]`);
	if (rangeRadio)
		rangeRadio.checked = true;

	const formatRadio = document.querySelector(`input[name="format"][value="${state.format}"]`);
	if (formatRadio)
		formatRadio.checked = true;

	updateUrlList(actionData);
	showStatus(actionData);
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
	executeUrlCollection();
}

/**
 * textareaの内容をクリップボードにコピーし、結果をステータスに表示する。
 */
async function onCopyButtonClicked() {
	const text = elements.urlList.value;
	const itemCount = text
		.split(/\r?\n|\n?\r/)               // 行ごとに分割
		.filter(line => line.trim() !== "") // 空白を除去して空でない行だけ残す
		.length;

	if (!text) {
		showStatus({
			ok: false,
			message: "No URLs to copy.",
		});
		return;
	}

	try {
		await navigator.clipboard.writeText(text);
		showStatus({
			ok: true,
			message: `Copied ${itemCount} URL${itemCount === 1 ? "" : "s"}.`,
		});
	} catch (error) {
		showStatus({
			ok: false,
			message: "Copy failed.",
		});
	}
}

/**
 * 収集範囲の選択が変わったときに state と storage を更新し、一覧を再生成する。
 *
 * @param {Event} event changeイベント。
 * @returns {Promise<void>} 更新完了時に解決する Promise。
 */
async function onRangeSelectChanged(event) {
	if (event.target.name !== "range")
		return;

	state.collectRange = event.target.value;

	// 最新の動作条件をストレージに記録する
	// このロジックはサービスワーカー側にも存在するが、
	// メッセージングにに失敗した場合にも設定が確実に反映されるように
	// ここでも記録を実行する。（未検証）
	await chrome.storage.local.set({
		collectRange: state.collectRange,
	});

	await executeUrlCollection();
}

/**
 * 出力フォーマットの選択が変わったときに state と UI を更新する。
 *
 * @param {Event} event changeイベント。
 * @returns {Promise<void>} 更新完了時に解決する Promise。
 */
async function onFormatSelectChanged(event) {
	if (event.target.name !== "format")
		return;

	state.format = event.target.value;

	// 動作条件履歴を記録する
	await chrome.storage.local.set({
		format: state.format,
	});

	// URLの再収集を行わず、既知のURLをもとにテキストを再フォーマットする
	elements.urlList.value = formatUrlListText(state.tabs, state.format);
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
		displayMode: state.displayMode,
	});
}

/**
 * バックグラウンドから送信されたメッセージを受信し、状態の更新を UI に反映する。
 *
 * @param {Object} message 受信したメッセージ。
 * @param {string} [message.type] メッセージの種別。
 * @param {number} [message.tabId] アクション対象のタブID。
 * @param {Object} [message.actionState] 更新する状態データ。
 */
function onRuntimeMessage(message) {
	if (message.type === "action-state-updated" && message.tabId === state.tabId)
		loadStateFromAction(message.actionState);
}

/* イベント登録 */
document.addEventListener("DOMContentLoaded", onInitialLoaded);