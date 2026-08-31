/**
 * @fileoverview バックグラウンドスクリプト。拡張機能のコマンド要求やポップアップからのメッセージを受け取り、
 * 開いているタブのURL収集、クリップボードコピー、状態永続化をまとめて処理する。
 */

import { formatTabListText } from "./core.js";

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
 * @property {number} count 対象のタブ数。
 * @property {number} time 実行時刻（Unix ミリ秒）。
 */

/**
 * @typedef {Object} PersistedAction
 * @property {string} collectRange 収集対象範囲。
 * @property {string} format 出力フォーマット。
 * @property {CollectedTab[]} tabs 収集したタブ一覧。
 * @property {string} text 生成した文字列。
 * @property {ActionStatus | null} status 最後の状態。
 */

/**
 * @type {{ displayMode: string, format: string, collectRange: string }}
 */
const DEFAULT_SETTINGS = {
	displayMode: "detail",
	format: "url",
	collectRange: "current"
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
		collectRange: current.collectRange ?? DEFAULT_SETTINGS.collectRange
	});
}

/**
 * Chrome のショートカットから呼ばれた場合に、指定範囲のURLを収集してコピーし、最後の実行結果を保存する。
 *
 * @param {string} command 実行されたコマンド名。
 * @returns {Promise<void>} 処理完了時に解決する Promise。
 */
async function onCommand(command) {
	const collectRange = commandToRange(command);

	if (!collectRange)
		// 収集範囲が指定されていない場合、何もせず終了する
		return;

	// 前回の設定を取得・引き継ぐ
	const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

	const format = settings.format ?? DEFAULT_SETTINGS.format;
	await collectUrls(collectRange, format, true);
	await openPopup();
}

/**
 * ポップアップからの収集要求を受け取り、必要に応じてレスポンスを返す。
 *
 * @param {{ type?: string, collectRange?: string, format?: string }} message 受信したメッセージ。
 * @param {unknown} sender 送信元情報。
 * @param {(response?: unknown) => void} sendResponse 応答用コールバック。
 * @returns {boolean | void} 非同期応答を行う場合は true を返す。
 */
function onRuntimeMessage(message, sender, sendResponse) {
	const shouldCopy = message?.type === "collect-and-copy";
	collectUrls(
		message.collectRange,
		message.format,
		shouldCopy,
	).then(sendResponse);
}

/**
 * URL の収集を行い、動作履歴を記録する。
 *
 * @param {string} collectRange 収集範囲。
 * @param {string} format 文字列出力フォーマット。
 * @param {bool} copy コピーを行うかどうか。
 * @returns {Promise<{ ok: boolean, message: string, count: number, tabs: CollectedTab[], text: string }>} 実行結果。
 */
async function collectUrls(collectRange, format, copy=false) {
	try {
		let isSuccess = true;
		let message = null;

		// URLリストを収集し、テキストに変換
		const data = await collectTabs(collectRange);
		const text = formatTabListText(data.tabs, format);

		const actionState = {
			collectRange,
			format,
			tabs: data.tabs,
			text,
			status: null,
		};

		if (copy) {
			// コピーを実行する
			const copyResult = await copyToClipboard(text);

			isSuccess = copyResult.ok;
			const message = isSuccess
				? `Copied ${formatTabCount(data.tabs.length)}.`
				: (copyResult.error || "Copy failed.");
			actionState.status = {
				ok: isSuccess,
				message,
				count: data.tabs.length,
				time: Date.now(),
			};
		} else {
			message = `Collected ${formatTabCount(data.tabs.length)}.`;
		}

		// 収集設定を記録する
		await persistActionState(actionState);

		return {
			ok: isSuccess,
			message,
			count: data.tabs.length,
			tabs: data.tabs,
			text,
		};
	} catch (error) {
		return await handleCollectionError(collectRange, format, error);
	}
}

/**
 * 指定された範囲のタブを正規化して、URL一覧として扱いやすい形に整形する。
 *
 * @param {"current" | "window" | "all"} collectRange 収集範囲。
 * @returns {Promise<{ tabs: CollectedTab[] }>} 正規化済みのタブ一覧。
 */
async function collectTabs(collectRange) {
	let tabs;

	if (collectRange === "current") {
		const result = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true
		});

		tabs = result.slice(0, 1);
	} else if (collectRange === "window") {
		tabs = await chrome.tabs.query({
			currentWindow: true
		});
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
			url: tab.url
		}));

	return {
		tabs: normalizedTabs
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
			text
		});

		if (response?.ok) {
			return {
				ok: true
			};
		}

		return {
			ok: false,
			error: response?.error || "Copy failed."
		};
	} catch (error) {
		return {
			ok: false,
			error: `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`
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
		documentUrls: [offscreenUrl]
	});

	if (contexts.length > 0)
		return;

	await chrome.offscreen.createDocument({
		url: "offscreen/offscreen.html",
		reasons: ["CLIPBOARD"],
		justification: "Copy collected tab URLs to the system clipboard."
	});
}

/**
 * 最後の動作設定と処理結果をストレージへ保存する。
 * このデータはポップアップ側から参照され、UI表示に利用される。
 *
 * @param {{ collectRange: string, format: string, tabs: CollectedTab[], text: string, status?: ActionStatus | null }} params 保存するアクション情報。
 * @returns {Promise<void>} 保存完了時に解決する Promise。
 */
async function persistActionState({ collectRange, format, tabs, text, status }) {
	await chrome.storage.local.set({
		lastAction: {
			id: crypto.randomUUID(),
			collectRange,
			format,
			tabs,
			text,
			requestedAt: Date.now()
		},
		lastStatus: status ?? null
	});
}

/**
 * 収集処理時の例外発生に伴うエラーログ保存と応答用オブジェクト作成を行う。
 *
 * @param {string} collectRange 収集範囲。
 * @param {string} format フォーマット。
 * @param {unknown} error 発生したエラー。
 * @returns {Promise<{ ok: false, message: string, count: 0, tabs: [], text: "" }>} エラー結果情報。
 */
async function handleCollectionError(collectRange, format, error) {
	const message = error instanceof Error
		? error.message
		: String(error);

	await persistActionState({
		collectRange,
		format,
		tabs: [],
		text: "",
		status: {
			ok: false,
			message: `URL retrieval failed: ${message}`,
			count: 0,
			time: Date.now()
		}
	});

	return {
		ok: false,
		message,
		count: 0,
		tabs: [],
		text: ""
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
chrome.commands.onCommand.addListener(onCommand);
chrome.runtime.onMessage.addListener(onRuntimeMessage);