/**
 * @fileoverview バックグラウンドスクリプト。拡張機能のコマンド要求やポップアップからのメッセージを受け取り、
 * 開いているタブのURL収集、クリップボードコピー処理をまとめて担う。
 * 複数のウィンドウやタブで並行して動作できるよう、操作履歴は操作対象のタブIDごとに管理する。
 */

import { formatUrlList } from "../shared/formatter.js";
import { normalizeAndFilterTabs } from "../shared/filter.js";
import { buildCollectedMessage, buildCopiedMessage } from "../shared/messages.js";

/**
 * @typedef {Object} CollectedTab
 * @property {number|null} id タブID。
 * @property {string} title タブタイトル。
 * @property {string} url タブURL。
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
 * @property {boolean} filterBlankUrls 空白URL除去の有無。
 * @property {boolean} filterDuplicateUrls 重複URL除去の有無。
 * @property {boolean} filterSpecialUrls 特殊URL除去の有無。
 * @property {CollectedTab[]} filteredTabs 出力対象となるタブ（フィルタ適用済み）。
 * @property {CollectedTab[]} collectedTabs 収集範囲に含まれるすべてのタブ（フィルタ未適用）。
 * @property {number} blankCount 収集範囲に含まれていた空文字列URLの件数。
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
	filterBlankUrls: true,
	filterDuplicateUrls: true,
	filterSpecialUrls: true,
};

/**
 * @type {LastCondition}
 */
const DEFAULT_LAST_CONDITION = {
	format: "url",
	collectRange: "current",
	filterBlankUrls: true,
	filterDuplicateUrls: true,
	filterSpecialUrls: true,
};

/**
 * 収集処理で扱うフィルタ設定を正規化する。
 *
 * @param {{ filterBlankUrls?: boolean, filterDuplicateUrls?: boolean, filterSpecialUrls?: boolean }} [filterOptions] 入力されたフィルタ設定。
 * @returns {{ filterBlankUrls: boolean, filterDuplicateUrls: boolean, filterSpecialUrls: boolean }} 正規化済みのフィルタ設定。
 */
function normalizeFilterOptions(filterOptions = {}) {
	return {
		filterBlankUrls: filterOptions.filterBlankUrls ?? true,
		filterDuplicateUrls: filterOptions.filterDuplicateUrls ?? true,
		filterSpecialUrls: filterOptions.filterSpecialUrls ?? true,
	};
}

/**
 * 初回インストールまたは更新時に、未定義の保存データだけをデフォルト値で補完する。
 * ユーザー設定と前回の動作状態の両方をストレージに確保する。
 *
 * @returns {Promise<void>} 補完完了時に解決する Promise。
 */
async function initializeStorageDefaults() {
	const defaults = {
		...DEFAULT_PREFERENCES,
		...DEFAULT_LAST_CONDITION,
	};
	const current = await chrome.storage.local.get(defaults);
	const normalizedFilters = normalizeFilterOptions(current);

	await chrome.storage.local.set({
		displayMode: current.displayMode ?? DEFAULT_PREFERENCES.displayMode,
		actionButtonCollectRange: current.actionButtonCollectRange ?? DEFAULT_PREFERENCES.actionButtonCollectRange,
		format: current.format ?? DEFAULT_LAST_CONDITION.format,
		collectRange: current.collectRange ?? DEFAULT_LAST_CONDITION.collectRange,
		...normalizedFilters,
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

	const filterOptions = normalizeFilterOptions(data);

	await collectUrls(
        collectRange,
        data.format ?? DEFAULT_LAST_CONDITION.format,
        true,
        tab.id,
        filterOptions
    );
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
	const filterOptions = normalizeFilterOptions(data);

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

	await collectUrls(
        collectRange,
        data.format ?? DEFAULT_LAST_CONDITION.format,
        true,
        targetTabId,
        filterOptions
    );
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
		{
			filterBlankUrls: message.filterBlankUrls,
			filterDuplicateUrls: message.filterDuplicateUrls,
			filterSpecialUrls: message.filterSpecialUrls,
		},
	).then(sendResponse, (error) => {
		sendResponse({
			ok: false,
			message: error instanceof Error ? error.message : String(error),
			count: 0,
			filteredTabs: [],
			collectedTabs: [],
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
 * @param {Object} filterOptions URLのフィルタリング条件。
 * @returns {Promise<{ ok: boolean, message: string, count: number, tabs: CollectedTab[], text: string, id: string }>} 実行結果。
 */
async function collectUrls(collectRange, format, copy = false, targetTabId = null, filterOptions = {}) {
	const normalizedRange = typeof collectRange === "string" && collectRange === "same-group"
		? "group"
		: collectRange;
	const filterSettings = normalizeFilterOptions(filterOptions);
	const { filterBlankUrls, filterDuplicateUrls, filterSpecialUrls } = filterSettings;

	try {
		if (typeof collectRange !== "string" || typeof format !== "string")
			throw new Error("Invalid collection parameters.");

		// 次回の実行時に状態を引き継ぐため、今回使用したパラメータを記録する
		await chrome.storage.local.set({
			collectRange: normalizedRange,
			format,
			...filterSettings,
		});

		let isSuccess = true;
		let message = null;

		// URLリストを収集し、テキストに変換
		const data = await collectTabs(normalizedRange, targetTabId, {
			filterBlankUrls,
			filterDuplicateUrls,
			filterSpecialUrls,
		});
		const text = formatUrlList(data.filteredTabs, format);

		const actionState = {
			id: crypto.randomUUID(),
			collectRange: normalizedRange,
			format,
			filterBlankUrls,
			filterDuplicateUrls,
			filterSpecialUrls,
			filteredTabs: data.filteredTabs,
			collectedTabs: data.collectedTabs,
			blankCount: data.blankCount,
			text,
			ok: true,
			message: "",
		};

		if (copy) {
			// コピーを実行する
			const copyResult = await copyToClipboard(text);

			isSuccess = copyResult.ok;
			message = isSuccess
				? buildCopiedMessage(data.filteredTabs.length, { blankCount: data.blankCount, filterBlankUrls })
				: (copyResult.error || "Copy failed.");

			actionState.ok = isSuccess;
			actionState.message = message;
		} else {
			message = buildCollectedMessage(data.filteredTabs.length, { blankCount: data.blankCount, filterBlankUrls });
			actionState.message = message;
		}

		if (hasValidTabId(targetTabId))
			cacheAndNotifyActionState(targetTabId, actionState);

		// ポップアップのメッセージ呼び出しに対する応答データを返す
		return {
			ok: isSuccess,
			message,
			count: data.filteredTabs.length,
			filteredTabs: data.filteredTabs,
			collectedTabs: data.collectedTabs,
			blankCount: data.blankCount,
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
 * @param {"current" | "window" | "group" | "all"} collectRange 収集範囲。
 * @param {number|null} targetTabId 基準とするタブID。
 * @param {Object} filterOptions URLのフィルタリング条件。
 * @returns {Promise<{ filteredTabs: CollectedTab[], collectedTabs: CollectedTab[] }>} 正規化済みのタブ一覧。
 */
async function collectTabs(collectRange, targetTabId, filterOptions = {}) {
	const normalizedRange = collectRange === "same-group" ? "group" : collectRange;
	const { filterBlankUrls, filterDuplicateUrls, filterSpecialUrls } = normalizeFilterOptions(filterOptions);
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
			// Chrome APIにフィルタリングを委譲することでパフォーマンスを向上させる
			tabs = await chrome.tabs.query({
				groupId: currentTab.groupId,
			});
		}
	} else if (normalizedRange === "all") {
		tabs = await chrome.tabs.query({});
	} else {
		throw new Error(`Unknown collect range: ${normalizedRange}`);
	}

	const normalizedTabs = normalizeAndFilterTabs(tabs, {
		filterBlankUrls,
		filterDuplicateUrls,
		filterSpecialUrls,
	});

	const collectedTabs = tabs.map((tab) => ({
		id: tab.id ?? null,
		title: tab.title ?? "",
		url: typeof tab.url === "string" ? tab.url.trim() : "",
	}));

	// フィルタ設定によらず、収集範囲内に空文字列URLが何件あったかを数える
	const blankCount = collectedTabs.filter((tab) => tab.url === "").length;

	return {
		collectedTabs,
		filteredTabs: normalizedTabs,
		blankCount,
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
	const offscreenUrl = chrome.runtime.getURL("src/offscreen/offscreen.html");

	const contexts = await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT"],
		documentUrls: [offscreenUrl],
	});

	if (contexts.length > 0)
		return;

	await chrome.offscreen.createDocument({
		url: "src/offscreen/offscreen.html",
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

	// PersistedAction として期待されるフィールド名に合わせる
	const actionState = {
		id,
		collectRange,
		format,
		filteredTabs: [],
		collectedTabs: [],
		blankCount: 0,
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
		filteredTabs: [],
		collectedTabs: [],
		blankCount: 0,
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
	const commandMap = {
		"copy-current-tab": "current",
		"copy-window-tabs": "window",
		"copy-group-tabs": "group",
		"copy-all-tabs": "all",
	};

	return commandMap[command] || null;
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
				popup: "src/popup/popup.html",
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