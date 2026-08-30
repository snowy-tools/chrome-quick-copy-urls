/**
 * @fileoverview バックグラウンドスクリプト。拡張機能のコマンド要求やポップアップからのメッセージを受け取り、
 * 開いているタブのURL収集、クリップボードコピー、状態永続化をまとめて処理する。
 */

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
 * @property {string} range 収集対象範囲。
 * @property {string} format 出力フォーマット。
 * @property {CollectedTab[]} tabs 収集したタブ一覧。
 * @property {string} text 生成した文字列。
 * @property {ActionStatus | null} status 最後の状態。
 */

/**
 * @type {{ displayMode: string, format: string, range: string }}
 */
const DEFAULT_SETTINGS = {
	displayMode: "detail",
	format: "url",
	range: "current"
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
		range: current.range ?? DEFAULT_SETTINGS.range
	});
}

chrome.runtime.onInstalled.addListener(initializeDefaultSettings);

/**
 * Chrome のショートカットから呼ばれた場合に、指定範囲のURLを収集してコピーし、最後の実行結果を保存する。
 *
 * @param {string} command 実行されたコマンド名。
 * @returns {Promise<void>} 処理完了時に解決する Promise。
 */
async function handleCommandExecution(command) {
	const range = commandToRange(command);
	if (!range) {
		return;
	}

	try {
		const data = await collectTabs(range);
		const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
		const text = buildText(data.tabs, settings.format ?? "url");

		await persistActionState({
			range,
			format: settings.format ?? "url",
			tabs: data.tabs,
			text,
			status: {
				ok: false,
				message: "",
				count: data.tabs.length,
				time: Date.now()
			}
		});

		const copyResult = await copyToClipboard(text);
		await persistActionState({
			range,
			format: settings.format ?? "url",
			tabs: data.tabs,
			text,
			status: {
				ok: copyResult.ok,
				message: copyResult.ok
					? `Copied ${formatTabCount(data.tabs.length)}.`
					: (copyResult.error || "Copy failed."),
				count: data.tabs.length,
				time: Date.now()
			}
		});

		await openPopup();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await persistActionState({
			range,
			format: (await chrome.storage.local.get(DEFAULT_SETTINGS)).format ?? "url",
			tabs: [],
			text: "",
			status: {
				ok: false,
				message: `URL retrieval failed: ${message}`,
				count: 0,
				time: Date.now()
			}
		});
		await openPopup();
	}
}

chrome.commands.onCommand.addListener(handleCommandExecution);

/**
 * ポップアップからの収集要求を受け取り、必要に応じてレスポンスを返す。
 *
 * @param {{ type?: string, range?: string, format?: string }} message 受信したメッセージ。
 * @param {unknown} sender 送信元情報。
 * @param {(response?: unknown) => void} sendResponse 応答用コールバック。
 * @returns {boolean | void} 非同期応答を行う場合は true を返す。
 */
function handleRuntimeMessage(message, sender, sendResponse) {
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
}

chrome.runtime.onMessage.addListener(handleRuntimeMessage);

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
 * 最後の処理結果と収集内容をストレージへ保存する。
 *
 * @param {{ range: string, format: string, tabs: CollectedTab[], text: string, status?: ActionStatus | null }} params 保存するアクション情報。
 * @returns {Promise<void>} 保存完了時に解決する Promise。
 */
async function persistActionState({ range, format, tabs, text, status }) {
	await chrome.storage.local.set({
		lastAction: {
			id: crypto.randomUUID(),
			range,
			format,
			tabs,
			text,
			requestedAt: Date.now()
		},
		lastStatus: status ?? null
	});
}

/**
 * URL 収集だけを行い、ポップアップへ反映可能な形で結果を返す。
 *
 * @param {string} range 収集範囲。
 * @param {string} format 文字列出力フォーマット。
 * @returns {Promise<{ ok: boolean, message: string, count: number, tabs: CollectedTab[], text: string }>} 収集結果。
 */
async function collectOnly(range, format) {
	try {
		const data = await collectTabs(range);
		const text = buildText(data.tabs, format);

		await persistActionState({
			range,
			format,
			tabs: data.tabs,
			text,
			status: null
		});

		return {
			ok: true,
			message: `Collected ${formatTabCount(data.tabs.length)}.`,
			count: data.tabs.length,
			tabs: data.tabs,
			text
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await persistActionState({
			range,
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
		return { ok: false, message, count: 0, tabs: [], text: "" };
	}
}

/**
 * URL の収集とクリップボードへの書き込みをまとめて行い、結果を保存する。
 *
 * @param {string} range 収集範囲。
 * @param {string} format 文字列出力フォーマット。
 * @returns {Promise<{ ok: boolean, message: string, count: number, tabs: CollectedTab[], text: string }>} 実行結果。
 */
async function collectAndCopy(range, format) {
	try {
		const data = await collectTabs(range);
		const text = buildText(data.tabs, format);
		const copyResult = await copyToClipboard(text);

		await persistActionState({
			range,
			format,
			tabs: data.tabs,
			text,
			status: {
				ok: copyResult.ok,
				message: copyResult.ok
					? `Copied ${formatTabCount(data.tabs.length)}.`
					: (copyResult.error || "Copy failed."),
				count: data.tabs.length,
				time: Date.now()
			}
		});

		return {
			ok: copyResult.ok,
			message: copyResult.ok ? `Copied ${formatTabCount(data.tabs.length)}.` : copyResult.error,
			count: data.tabs.length,
			tabs: data.tabs,
			text
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await persistActionState({
			range,
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
		return { ok: false, message, count: 0, tabs: [], text: "" };
	}
}

/**
 * 指定された範囲のタブを正規化して、URL一覧として扱いやすい形に整形する。
 *
 * @param {"current" | "window" | "all"} range 収集範囲。
 * @returns {Promise<{ tabs: CollectedTab[] }>} 正規化済みのタブ一覧。
 */
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
		.filter((tab) => typeof tab.url === "string" && tab.url.length > 0)
		.map((tab) => ({
			id: tab.id ?? null,
			title: tab.title ?? "",
			url: tab.url
		}));

	return { tabs: normalized };
}

/**
 * タブ情報から表示用のテキストを生成する。
 *
 * @param {CollectedTab[]} tabs タブ一覧。
 * @param {string} format 出力形式（"url" または "title-url"）。
 * @returns {string} 生成した文字列。
 */
function buildText(tabs, format) {
	const lines = format === "title-url"
		? tabs.map((tab) => `${tab.title}\t${tab.url}\n`)
		: tabs.map((tab) => `${tab.url}\n`);
	return lines.join("");
}

/**
 * オフスクリーンドキュメント経由でクリップボードにコピーを依頼する。
 *
 * @param {string} text コピー対象の文字列。
 * @returns {Promise<{ ok: boolean, error?: string }>} コピー結果。
 */
async function copyToClipboard(text) {
	try {
		await ensureOffscreenDocument();
		const response = await chrome.runtime.sendMessage({
			type: "offscreen-copy",
			text
		});
		if (response?.ok) {
			return { ok: true };
		}
		return { ok: false, error: response?.error || "Copy failed." };
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
	if (contexts.length > 0) {
		return;
	}

	await chrome.offscreen.createDocument({
		url: "offscreen/offscreen.html",
		reasons: ["CLIPBOARD"],
		justification: "Copy collected tab URLs to the system clipboard."
	});
}

/**
 * コマンド実行後に必要な場合のみ、ポップアップ画面を開く。
 *
 * @returns {Promise<void>} 実行完了時に解決する Promise。
 */
async function openPopup() {
	try {
		if (chrome.action.openPopup) {
			await chrome.action.openPopup();
		}
	} catch {
		// 一部の Chrome 環境ではショートカット起動時にポップアップが制限されるため、
		// ここではコピーそのものの失敗ではないとして無視する。
	}
}
