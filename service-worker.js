/**
 * @fileoverview バックグラウンドスクリプト。拡張機能のコマンド要求やポップアップからのメッセージを受け取り、
 * 開いているタブのURL収集、クリップボードコピー処理をまとめて担う。
 * 複数のウィンドウやタブで並行して動作できるよう、操作履歴は操作対象のタブIDごとに管理する。
 */

import { formatUrlListText } from "./formatter.js";

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
 * @typedef {Object} UserPreferences
 * @property {string} displayMode ポップアップ画面の表示形式。
 * @property {"current"|"window"|"group"|"all"|"last"} actionButtonCollectRange アクションボタン押下時のタブ収集範囲のグローバル設定。
 */

/**
 * @typedef {Object} LastCondition
 * @property {string} format コピーする文字列の出力フォーマット（履歴）。
 * @property {string} collectRange 前回実行時に指定されたタブ収集範囲（履歴）。
 */

/**
 * メモリ上で各タブの処理結果を一時的に保持するキャッシュ。
 * ポップアップが情報を要求した際に最新の状態を返すために使用する。
 * @type {Map<number, PersistedAction>}
 */
const actionCache = new Map();

/**
 * @type {UserPreferences}
 */
const DEFAULT_PREFERENCES = {
	displayMode: "detail",
	actionButtonCollectRange: "current",
};

/**
 * @type {LastCondition}
 */
const DEFAULT_LAST_CONDITION = {
	format: "url",
	collectRange: "current",
};

/**
 * 初回インストールまたは更新時に、未定義の保存データだけをデフォルト値で補完する。
 * ユーザー設定と前回の動作状態の両方をストレージに確保する。
 *
 * @returns {Promise<void>} 補完完了時に解決する Promise。
 */
async function initializeStorageDefaults() {
	const current = await chrome.storage.local.get({
		...DEFAULT_PREFERENCES,
		...DEFAULT_LAST_CONDITION,
	});

	await chrome.storage.local.set({
		displayMode: current.displayMode ?? DEFAULT_PREFERENCES.displayMode,
		actionButtonCollectRange: current.actionButtonCollectRange ?? DEFAULT_PREFERENCES.actionButtonCollectRange,
		format: current.format ?? DEFAULT_LAST_CONDITION.format,
		collectRange: current.collectRange ?? DEFAULT_LAST_CONDITION.collectRange,
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
	const data = await chrome.storage.local.get({
		...DEFAULT_PREFERENCES,
		...DEFAULT_LAST_CONDITION,
	});

	// グローバル設定に従って収集範囲を決定する
	let collectRange = data.actionButtonCollectRange ?? DEFAULT_PREFERENCES.actionButtonCollectRange;

	if (collectRange === "last")
		collectRange = data.collectRange ?? DEFAULT_LAST_CONDITION.collectRange;

	const format = data.format ?? DEFAULT_LAST_CONDITION.format;

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

	// 前回の履歴データを取得・引き継ぐ
	const data = await chrome.storage.local.get(DEFAULT_LAST_CONDITION);
	const format = data.format ?? DEFAULT_LAST_CONDITION.format;

	// コマンド実行時の対象タブIDを特定する
	let targetTabId = tab?.id ?? null;

	if (!hasValidTabId(targetTabId)) {
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
	}

	if (message?.type !== "collect" && message?.type !== "collect-and-copy")
		return false;

	const shouldCopy = message.type === "collect-and-copy";

	collectUrls(
		message.collectRange,
		message.format,
		shouldCopy,
		message.tabId,
	).then(sendResponse, (error) => {
		sendResponse({
			ok: false,
			message: error instanceof Error ? error.message : String(error),
			count: 0,
			tabs: [],
			text: "",
			id: crypto.randomUUID(),
		});
	});

	return true;
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
	const normalizedRange = typeof collectRange === "string" && collectRange === "same-group"
		? "group"
		: collectRange;

	try {
		if (typeof collectRange !== "string" || typeof format !== "string")
			throw new Error("Invalid collection parameters.");

		// 次回の実行時に状態を引き継ぐため、今回使用したパラメータを記録する
		await chrome.storage.local.set({
			collectRange: normalizedRange,
			format,
		});

		let isSuccess = true;
		let message = null;

		// URLリストを収集し、テキストに変換
		const data = await collectTabs(normalizedRange, targetTabId);
		const text = formatUrlListText(data.tabs, format);

		const actionState = {
			id: crypto.randomUUID(),
			collectRange: normalizedRange,
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

		if (hasValidTabId(targetTabId))
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
		return await handleCollectionError(normalizedRange, format, error, targetTabId);
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
	const normalizedRange = collectRange === "same-group" ? "group" : collectRange;
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

	if (normalizedRange === "current") {
		if (targetTab) {
			tabs = [targetTab];
		} else {
			const result = await chrome.tabs.query({
				active: true,
				lastFocusedWindow: true,
			});

			tabs = result.slice(0, 1);
		}
	} else if (normalizedRange === "window") {
		const queryOptions = {};

		if (targetTab)
			queryOptions.windowId = targetTab.windowId;
		else
			queryOptions.currentWindow = true;

		tabs = await chrome.tabs.query(queryOptions);
	} else if (normalizedRange === "group") {
		const currentTab = targetTab ?? (await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		})).at(0) ?? null;

		if (!currentTab) {
			tabs = [];
		} else if ((currentTab.groupId ?? -1) === -1) {
			tabs = [currentTab];
		} else {
			tabs = await chrome.tabs.query({
				windowId: currentTab.windowId,
			});
			tabs = tabs.filter((tab) => (tab.groupId ?? -1) === currentTab.groupId);
		}
	} else if (normalizedRange === "all") {
		tabs = await chrome.tabs.query({});
	} else {
		throw new Error(`Unknown collect range: ${normalizedRange}`);
	}

	return {
		tabs: normalizeAndFilterTabs(tabs),
	};
}

/**
 * 収集対象のタブを正規化し、重複や特殊URLを除外する。
 *
 * @param {chrome.tabs.Tab[]} tabs タブ一覧。
 * @returns {CollectedTab[]} 正規化済みタブ一覧。
 */
function normalizeAndFilterTabs(tabs) {
	const seenUrls = new Set();

	return tabs
		.filter((tab) => typeof tab?.url === "string" && tab.url.trim().length > 0)
		.map((tab) => ({
			id: tab.id ?? null,
			title: tab.title ?? "",
			url: tab.url.trim(),
		}))
		.filter(({ url }) => {
			if (isSpecialUrl(url))
				return false;

			const normalizedUrl = normalizeUrl(url);
			if (!normalizedUrl)
				return false;

			const key = normalizedUrl.toLowerCase();
			if (seenUrls.has(key))
				return false;

			seenUrls.add(key);
			return true;
		})
		.map(({ id, title, url }) => ({
			id,
			title,
			url: normalizeUrl(url) ?? url,
		}));
}

/**
 * 特殊URLや無効なURLを除外する。
 *
 * @param {string} value URL文字列。
 * @returns {boolean} 除外対象なら true。
 */
function isSpecialUrl(value) {
	const url = value.trim();
	if (!url)
		return true;

	const lower = url.toLowerCase();
	if (lower === "about:blank" || lower.startsWith("about:"))
		return true;
	if (lower.startsWith("chrome://") || lower.startsWith("chrome-extension://") || lower.startsWith("devtools://") || lower.startsWith("edge://"))
		return true;
	if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("file:"))
		return true;

	return false;
}

/**
 * URLを安定した形式へ正規化する。
 *
 * @param {string} value URL文字列。
 * @returns {string | null} 正規化済み URL または null。
 */
function normalizeUrl(value) {
	try {
		const url = new URL(value.trim());
		return url.href;
	} catch (error) {
		return null;
	}
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
 * タブIDとして扱えるかどうかを判定する。
 * `0` は有効なタブIDであるため、null/undefined だけでなく `NaN` も弾く。
 *
 * @param {number | null | undefined} tabId 判定対象のタブID。
 * @returns {boolean} 有効なタブIDなら true。
 */
function hasValidTabId(tabId) {
	return typeof tabId === "number" && Number.isFinite(tabId);
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

	if (hasValidTabId(targetTabId))
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
 * @returns {"current" | "window" | "group" | "all" | null} 変換後の範囲。
 */
function commandToRange(command) {
	switch (command) {
		case "copy-current-tab":
			return "current";
		case "copy-window-tabs":
			return "window";
		case "copy-group-tabs":
		case "copy-same-group-tabs":
			return "group";
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
 * 動的にポップアップを割り当てて表示後、割り当てを解除することで
 * 次回以降も onClicked イベントを確実に発火させる。
 *
 * @returns {Promise<void>} 実行完了時に解決する Promise。
 */
async function openPopup() {
	if (chrome.action.openPopup) {
		try {
			await chrome.action.setPopup({
				popup: "popup.html",
			});
			await chrome.action.openPopup();
		} catch (error) {
			// アクティブウィンドウが存在しない場合はポップアップ展開をスキップ
			console.warn("Could not open popup:", error);
		} finally {
			// 次回以降の onClicked を確実に発火させるための割り当て解除
			await chrome.action.setPopup({
				popup: "",
			});
		}
	}
}

/**
 * タブが閉じられた際にキャッシュを破棄する。
 * メモリリークを防止し、不要な状態データが残り続けるのを防ぐ。
 *
 * @param {number} tabId 閉じられたタブのID。
 */
function onTabRemoved(tabId) {
	actionCache.delete(tabId);
}

/* イベント登録 */
chrome.runtime.onInstalled.addListener(initializeStorageDefaults);
chrome.action.onClicked.addListener(onActionClicked);
chrome.commands.onCommand.addListener(onCommand);
chrome.runtime.onMessage.addListener(onRuntimeMessage);
chrome.tabs.onRemoved.addListener(onTabRemoved);