/**
 * @fileoverview バックグラウンドスクリプト。拡張機能のコマンド要求やポップアップからのメッセージを受け取り、
 * 開いているタブのURL収集、クリップボードコピー処理をまとめて担う。
 * 複数のウィンドウやタブで並行して動作できるよう、操作履歴は操作対象のタブIDごとに管理する。
 */

import { formatUrlListText } from "./core.js";

/**
 * @typedef {Object} CollectedTab
 * @property {number|null} id タブID.
 * @property {string} title タブタイトル.
 * @property {string} url タブURL.
 */

/**
 * @typedef {Object} ActionStatus
 * @property {boolean} ok 実行が成功したかどうか。
 * @property {string} message 表示用メッセージ。
 */

/**
 * @typedef {Object} PersistedAction
 * @property {string} id アクションを一意に識別するID。
 * @property {string} collectRange 収集対象範囲。
 * @property {string} format 出力フォーマット。
 * @property {CollectedTab[]} tabs 収集したタブ一覧。
 * @property {string} text 生成した文字列。
 * @property {string} message 表示用メッセージ。
 * @property {boolean} ok 実行結果。
 */

/**
 * @typedef {Object} LocalStorageData
 * @property {string} displayMode ポップアップ画面の表示形式。
 * @property {string} format コピーする文字列の出力フォーマット。
 * @property {string} collectRange 前回実行時に指定されたタブ収集範囲。
 * @property {"current"|"window"|"all"|"last"} actionButtonCollectRange アクションボタン押下時のタブ収集範囲のグローバル設定。
 */

/**
 * メモリ上で各タブの処理結果を一時的に保持するキャッシュ。
 * ポップアップが情報を要求した際に最新の状態を返すために使用する。
 * @type {Map<number, PersistedAction>}
 */
const actionCache = new Map();

/**
 * @type {{ displayMode: string, format: string, collectRange: string, actionButtonCollectRange: string }}
 */
const DEFAULT_SETTINGS = {
	displayMode: "detail",
	format: "url",
	collectRange: "current",
	actionButtonCollectRange: "current",
};

/**
 * 初回インストールまたは更新時に、未定義の保存設定だけをデフォルト値で補完する。
 *
 * @returns {Promise<void>} 設定補完完了時に解決する Promise。
 */
async function initializeDefaultSettings() {
	const current = await chrome.storage.local.get(DEFAULT_SETTINGS);

	await chrome.storage.local.set({
		displayMode: current.displayMode ?? DEFAULT_SETTINGS.displayMode,
		format: current.format ?? DEFAULT_SETTINGS.format,
		collectRange: current.collectRange ?? DEFAULT_SETTINGS.collectRange,
		actionButtonCollectRange: current.actionButtonCollectRange ?? DEFAULT_SETTINGS.actionButtonCollectRange,
	});
}

/**
 * 拡張機能のアクションボタンがクリックされたときに、保存されている設定を用いて
 * URLの収集とコピーを実行し、ポップアップを開く。
 *
 * @param {chrome.tabs.Tab} tab 現在のタブ情報。
 * @returns {Promise<void>} 処理完了時に解決する Promise。
 */
async function onActionClicked(tab) {
	const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

	// グローバル設定に従って収集範囲を決定する
	let collectRange = settings.actionButtonCollectRange ?? DEFAULT_SETTINGS.actionButtonCollectRange;

	if (collectRange === "last")
		collectRange = settings.collectRange ?? DEFAULT_SETTINGS.collectRange;

	const format = settings.format ?? DEFAULT_SETTINGS.format;

	await collectUrls(collectRange, format, true, tab.id);
	await openPopup();
}

/**
 * Chrome のショートカットから呼ばれた場合に、指定範囲のURLを収集してコピーし、最後の実行結果を保存する。
 *
 * @param {string} command 実行されたコマンド名。
 * @param {chrome.tabs.Tab} [tab] 実行時にアクティブだったタブ情報。
 * @returns {Promise<void>} 処理完了時に解決する Promise。
 */
async function onCommand(command, tab) {
	const collectRange = commandToRange(command);

	if (!collectRange)
		// 収集範囲が指定されていない場合、何もせず終了する
		return;

	// 前回の設定を取得・引き継ぐ
	const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
	const format = settings.format ?? DEFAULT_SETTINGS.format;

	// コマンド実行時の対象タブIDを特定する
	let targetTabId = tab?.id ?? null;

	if (!targetTabId) {
		const tabs = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		});

		if (tabs.length > 0)
			targetTabId = tabs[0].id;
	}

	await collectUrls(collectRange, format, true, targetTabId);
	await openPopup();
}

/**
 * ポップアップからの要求を受け取り、必要に応じてレスポンスを返す。
 *
 * @param {{ type?: string, collectRange?: string, format?: string, tabId?: number }} message 受信したメッセージ。
 * @param {unknown} sender 送信元情報。
 * @param {(response?: unknown) => void} sendResponse 応答用コールバック。
 * @returns {boolean | void} 非同期応答を行う場合は true を返す。
 */
function onRuntimeMessage(message, sender, sendResponse) {
	if (message?.type === "get-action-state") {
		const actionState = actionCache.get(message.tabId);

		sendResponse(actionState || null);

		return false;
	} else {
		const shouldCopy = message?.type === "collect-and-copy";

		collectUrls(
			message.collectRange,
			message.format,
			shouldCopy,
			message.tabId,
		).then(sendResponse);

		return true;
	}
}

/**
 * URL の収集を行い、動作履歴を対象タブIDに紐付けてキャッシュに記録する。
 *
 * @param {string} collectRange 収集範囲。
 * @param {string} format 文字列出力フォーマット。
 * @param {boolean} copy コピーを行うかどうか。
 * @param {number|null} targetTabId 処理対象とするタブID。
 * @returns {Promise<{ ok: boolean, message: string, count: number, tabs: CollectedTab[], text: string, id: string }>} 実行結果。
 */
async function collectUrls(collectRange, format, copy = false, targetTabId = null) {
	try {
		let isSuccess = true;
		let message = null;

		// URLリストを収集し、テキストに変換
		const data = await collectTabs(collectRange, targetTabId);
		const text = formatUrlListText(data.tabs, format);

		const actionState = {
			id: crypto.randomUUID(),
			collectRange,
			format,
			tabs: data.tabs,
			text,
			ok: true,
			message: "",
		};

		if (copy) {
			// コピーを実行する
			const copyResult = await copyToClipboard(text);

			isSuccess = copyResult.ok;
			message = isSuccess
				? `Copied ${formatTabCount(data.tabs.length)}.`
				: (copyResult.error || "Copy failed.");

			actionState.ok = isSuccess;
			actionState.message = message;
		} else {
			message = `Collected ${formatTabCount(data.tabs.length)}.`;
			actionState.message = message;
		}

		if (targetTabId !== null)
			cacheAndNotifyActionState(targetTabId, actionState);

		return {
			ok: isSuccess,
			message,
			count: data.tabs.length,
			tabs: data.tabs,
			text,
			id: actionState.id,
		};
	} catch (error) {
		return await handleCollectionError(collectRange, format, error, targetTabId);
	}
}

/**
 * 指定された範囲のタブを正規化して、URL一覧として扱いやすい形に整形する。
 * 対象タブIDが指定された場合は、そのタブ自身または属するウィンドウを基準とする。
 *
 * @param {"current" | "window" | "all"} collectRange 収集範囲。
 * @param {number|null} targetTabId 基準とするタブID。
 * @returns {Promise<{ tabs: CollectedTab[] }>} 正規化済みのタブ一覧。
 */
async function collectTabs(collectRange, targetTabId) {
	let tabs;
	let targetTab = null;

	if (targetTabId !== null && targetTabId !== undefined) {
		try {
			targetTab = await chrome.tabs.get(targetTabId);
		} catch (error) {
			// タブが既に閉じられている等の理由で取得できない場合はフォールバックとして無視する
			targetTab = null;
		}
	}

	if (collectRange === "current") {
		if (targetTab) {
			tabs = [targetTab];
		} else {
			const result = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});

			tabs = result.slice(0, 1);
		}
	} else if (collectRange === "window") {
		const queryOptions = {};

		if (targetTab)
			queryOptions.windowId = targetTab.windowId;
		else
			queryOptions.currentWindow = true;

		tabs = await chrome.tabs.query(queryOptions);
	} else if (collectRange === "all") {
		tabs = await chrome.tabs.query({});
	} else {
		throw new Error(`Unknown collect range: ${collectRange}`);
	}

	const normalizedTabs = tabs
		.filter((tab) => typeof tab.url === "string" && tab.url.length > 0)
		.map((tab) => ({
			id: tab.id ?? null,
			title: tab.title ?? "",
			url: tab.url,
		}));

	return {
		tabs: normalizedTabs,
	};
}

/**
 * オフスクリーンドキュメント経由でクリップボードにコピーを依頼する。
 *
 * @param {string} text コピー対象の文字列。
 * @returns {Promise<{ ok: boolean, error?: string }>} コピー結果。
 */
async function copyToClipboard(text) {
	try {
		// オフスクリーンにテキストコピーを依頼する
		await ensureOffscreenDocument();
		const response = await chrome.runtime.sendMessage({
			type: "offscreen-copy",
			text,
		});

		if (response?.ok) {
			return {
				ok: true,
			};
		}

		return {
			ok: false,
			error: response?.error || "Copy failed.",
		};
	} catch (error) {
		return {
			ok: false,
			error: `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * クリップボード利用に必要なオフスクリーンドキュメントが存在することを確認する。
 *
 * @returns {Promise<void>} 作成完了時に解決する Promise。
 */
async function ensureOffscreenDocument() {
	const offscreenUrl = chrome.runtime.getURL("offscreen/offscreen.html");

	const contexts = await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT"],
		documentUrls: [offscreenUrl],
	});

	if (contexts.length > 0)
		return;

	await chrome.offscreen.createDocument({
		url: "offscreen/offscreen.html",
		reasons: ["CLIPBOARD"],
		justification: "Copy collected tab URLs to the system clipboard.",
	});
}

/**
 * 処理結果をキャッシュに保存し、現在開いているポップアップへ状態の更新を通知する。
 * ポップアップがバックグラウンドでの処理進行をリアルタイムに反映できるようにするために用いる。
 *
 * @param {number} tabId 対象とするタブID。
 * @param {PersistedAction} actionState 通知するアクションデータ。
 */
function cacheAndNotifyActionState(tabId, actionState) {
	actionCache.set(tabId, actionState);

	chrome.runtime.sendMessage({
		type: "action-state-updated",
		tabId,
		actionState,
	}).catch(() => {
		// ポップアップが閉じられているなど、受信者が存在しない場合に発生する例外を無視する
	});
}

/**
 * 収集処理時の例外発生に伴うエラー情報をキャッシュし、応答用オブジェクトを作成する。
 *
 * @param {string} collectRange 収集範囲。
 * @param {string} format フォーマット。
 * @param {unknown} error 発生したエラー。
 * @param {number|null} targetTabId 対象とするタブID。
 * @returns {Promise<{ ok: false, message: string, count: 0, tabs: [], text: "", id: string }>} エラー結果情報。
 */
async function handleCollectionError(collectRange, format, error, targetTabId) {
	const message = error instanceof Error
		? error.message
		: String(error);

	const id = crypto.randomUUID();

	const actionState = {
		id,
		collectRange,
		format,
		tabs: [],
		text: "",
		ok: false,
		message: `URL retrieval failed: ${message}`,
	};

	if (targetTabId !== null)
		cacheAndNotifyActionState(targetTabId, actionState);

	return {
		ok: false,
		message,
		count: 0,
		tabs: [],
		text: "",
		id,
	};
}

/**
 * Chrome コマンド名から対象の収集範囲へ変換する。
 *
 * @param {string} command 実行されたショートカット名。
 * @returns {"current" | "window" | "all" | null} 変換後の範囲。
 */
function commandToRange(command) {
	switch (command) {
		case "copy-current-tab":
			return "current";
		case "copy-window-tabs":
			return "window";
		case "copy-all-tabs":
			return "all";
		default:
			return null;
	}
}

/**
 * 収集件数を表示用の文章へ整形する。
 *
 * @param {number} count タブ数。
 * @returns {string} 例: "3 URLs"。
 */
function formatTabCount(count) {
	return `${count} URL${count === 1 ? "" : "s"}`;
}

/**
 * コマンド実行後に必要な場合のみ、ポップアップ画面を開く。
 *
 * @returns {Promise<void>} 実行完了時に解決する Promise。
 */
async function openPopup() {
	try {
		if (chrome.action.openPopup)
			await chrome.action.openPopup();
	} catch {
		// 一部の Chrome 環境ではショートカット起動時にポップアップが制限されるため、
		// ここではコピーそのものの失敗ではないとして無視する。
	}
}

/* イベント登録 */
chrome.runtime.onInstalled.addListener(initializeDefaultSettings);
chrome.action.onClicked.addListener(onActionClicked);
chrome.commands.onCommand.addListener(onCommand);
chrome.runtime.onMessage.addListener(onRuntimeMessage);