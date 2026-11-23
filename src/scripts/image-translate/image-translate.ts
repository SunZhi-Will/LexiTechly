/**
 * 翻譯圖片：背景頁這一側
 *
 * 兩個入口：
 * - 右鍵「翻譯這張圖片 → 原文語言」：翻一張。子選單是原文語言（韓、日、中），因為 OCR 模型依語言不同，
 *   中日英統一模型讀不了韓文，所以在按下的當下選（P0 結論）。
 * - 快捷鍵（manifest 的 commands，預設 Alt+Shift+T）：切換這個分頁的自動翻譯。有些閱讀器把右鍵拿去翻頁，
 *   右鍵選單用不了；自動翻譯會翻這頁所有漫畫圖，換頁或新出現的圖也會跟著翻（見 auto-translate.ts）。
 * 兩者都會讓 Chrome 給這個分頁 activeTab，才能注入內容腳本與擷取畫面；不需要任何網站的 host 權限。
 *
 * 取得圖片像素：先直接抓圖片網址（多數圖床允許跨來源讀取），抓不到（blob: 網址、需要登入的圖、
 * 不允許跨來源的圖床）就擷取分頁畫面再裁出那張圖看得到的部分；不繞過網站的防盜連。
 * 文字辨識在 offscreen 文件（見 ocr-engine.ts），翻譯在這裡（見 translate-engines.ts），
 * 結果交給內容腳本疊在圖上（見 content-entry.ts）。
 */

import { contentLogger } from './logger';
import { getLocale, initI18n, t, type MessageKey } from './i18n';
import { isFromContentScript } from './sender-guard';
import { groupLines } from './group';
import { TranslateBusyError, translateForImage } from './translate-engines';
import { loadTranslation, saveTranslation } from './translation-store';
import {
    IMAGE_TRANSLATE_AUTO_TOGGLE,
    IMAGE_TRANSLATE_BATCH_KEY,
    IMAGE_TRANSLATE_BATCH_BEGIN,
    IMAGE_TRANSLATE_BATCH_PROGRESS,
    IMAGE_TRANSLATE_LOOKUP,
    IMAGE_TRANSLATE_CAPTURE_DONE,
    IMAGE_TRANSLATE_CAPTURE_PREPARE,
    IMAGE_TRANSLATE_ERROR,
    IMAGE_TRANSLATE_PROGRESS,
    IMAGE_TRANSLATE_REQUEST,
    IMAGE_TRANSLATE_RESULT,
    IMAGE_TRANSLATE_START,
    OFFSCREEN_ANALYZE,
    OFFSCREEN_PROGRESS,
    OFFSCREEN_TARGET,
    SOURCE_LANGS,
    translationKey,
    type AnalyzeRequest,
    type BatchProgress,
    type AnalyzeResponse,
    type AutoToggleMessage,
    type ErrorMessage,
    type ImageGeometry,
    type LangChoice,
    type ProgressMessage,
    type ResultMessage,
    type SourceLang,
    type StartRequest,
    type StartResponse,
    type TranslateRequest,
    type TranslateResponse,
    type TranslatedImage
} from './protocol';

const MENU_PARENT = 'lexitechly-translate-image';
const MENU_CHILD_PREFIX = `${MENU_PARENT}:`;
// 子選單：自動判斷放第一個（大部分時候選它就對）
const MENU_LANGS: LangChoice[] = ['auto', ...SOURCE_LANGS];
const MENU_TITLES: Record<LangChoice, MessageKey> = {
    auto: 'manga.menu.autoDetect',
    ko: 'manga.menu.fromKorean',
    ja: 'manga.menu.fromJapanese',
    zh: 'manga.menu.fromChinese'
};
export const TRANSLATE_COMMAND = 'translate-images';
// 內容腳本是另外打包成單一檔案的（見 vite.config.ts 的 imageTranslateAssets），才能用檔名注入
const CONTENT_SCRIPT = 'image-translate-content.js';
const OFFSCREEN_URL = 'src/pages/offscreen.html';
// offscreen 文件載著模型很佔記憶體，閒置這麼久就關掉，下次用到再開（模型已在快取，重開只要幾秒）
const OFFSCREEN_IDLE_ALARM = 'lexitechly-offscreen-idle';
const OFFSCREEN_IDLE_MINUTES = 5;
// 直接抓原圖時的大小上限；再大的圖多半不是漫畫頁，交給畫面擷取
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
// 預先翻譯時，比這小的圖不像漫畫頁（圖示、頭像、廣告），略過
const PREFETCH_MIN_SIDE = 400;

// 進行中的請求：offscreen 回報下載進度時，轉給對應的分頁
const pending = new Map<string, { tabId: number; frameId: number }>();

/**
 * 在 background.ts 建立右鍵選單的地方呼叫（那裡會先 removeAll，所以選單要在同一個流程裡建立）
 */
export function createImageTranslateMenus(): void {
    const onError = () => {
        if (chrome.runtime.lastError) contentLogger.warn('建立圖片翻譯選單失敗', chrome.runtime.lastError.message);
    };
    chrome.contextMenus.create({ id: MENU_PARENT, title: t('manga.menu.translate'), contexts: ['image'] }, onError);
    for (const lang of MENU_LANGS) {
        chrome.contextMenus.create({ id: `${MENU_CHILD_PREFIX}${lang}`, parentId: MENU_PARENT, title: t(MENU_TITLES[lang]), contexts: ['image'] }, onError);
    }
}

function sendToTab(tabId: number, frameId: number, message: ProgressMessage | ResultMessage | ErrorMessage): void {
    chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => undefined);
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${mime};base64,${btoa(binary)}`;
}

interface FetchedImage {
    dataUrl: string;
    width: number;
    height: number;
}

async function fetchImage(srcUrl: string): Promise<FetchedImage | null> {
    if (!/^(https?:|data:)/.test(srcUrl)) return null;
    try {
        const response = await fetch(srcUrl, { credentials: 'omit' });
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.type.startsWith('image/') || blob.size > MAX_IMAGE_BYTES) return null;
        const bitmap = await createImageBitmap(blob);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return { dataUrl: bytesToDataUrl(new Uint8Array(await blob.arrayBuffer()), blob.type), ...size };
    } catch {
        return null;
    }
}

/**
 * 擷取分頁畫面，裁出圖片看得到的部分；回傳裁出的圖與它占原圖的比例
 */
async function captureImage(tabId: number, windowId: number, { rect, viewport }: ImageGeometry): Promise<{ dataUrl: string; coverage: ResultMessage['coverage'] } | null> {
    // 先請內容腳本藏起我們自己的譯文層與狀態列：它們蓋在圖上，會被截進去、擋住要讀的字（實際遇過）
    await chrome.tabs.sendMessage(tabId, { type: IMAGE_TRANSLATE_CAPTURE_PREPARE }, { frameId: 0 }).catch(() => undefined);
    let shot: string;
    try {
        shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } finally {
        chrome.tabs.sendMessage(tabId, { type: IMAGE_TRANSLATE_CAPTURE_DONE }, { frameId: 0 }).catch(() => undefined);
    }
    const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
    const scale = bitmap.width / viewport.width;
    const left = Math.max(0, rect.x);
    const top = Math.max(0, rect.y);
    const right = Math.min(viewport.width, rect.x + rect.width);
    const bottom = Math.min(viewport.height, rect.y + rect.height);
    if (right - left < 8 || bottom - top < 8) return null;
    const canvas = new OffscreenCanvas(Math.round((right - left) * scale), Math.round((bottom - top) * scale));
    canvas.getContext('2d')!.drawImage(bitmap, left * scale, top * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return {
        dataUrl: bytesToDataUrl(new Uint8Array(await blob.arrayBuffer()), 'image/png'),
        coverage: {
            left: (left - rect.x) / rect.width,
            top: (top - rect.y) / rect.height,
            width: (right - left) / rect.width,
            height: (bottom - top) / rect.height
        }
    };
}

// 正在建立的 offscreen 文件：同時來的請求都等同一份建好再送訊息。
// 之前後到的請求看到「已經有一份」就直接送，文件還沒載入完會收到 Receiving end does not exist（整本翻譯的第一頁實際遇過）
let offscreenCreating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
    if (offscreenCreating) await offscreenCreating;
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (contexts.length === 0) {
        offscreenCreating ??= chrome.offscreen.createDocument({
            url: OFFSCREEN_URL,
            reasons: [chrome.offscreen.Reason.WORKERS],
            justification: 'Run on-device text detection and OCR for image translation'
        }).catch((error) => {
            // 別的地方（例如 service worker 重啟前）已經建好一份
            if (!String(error).includes('single offscreen')) throw error;
        }).finally(() => {
            offscreenCreating = null;
        });
        await offscreenCreating;
    }
    await chrome.alarms.create(OFFSCREEN_IDLE_ALARM, { delayInMinutes: OFFSCREEN_IDLE_MINUTES });
}

interface PipelineInput {
    tab: chrome.tabs.Tab;
    frameId: number;
    requestId: string;
    srcUrl: string;
    lang: LangChoice;
    hint?: SourceLang;
    geometry: ImageGeometry | null;
    prefetch: boolean;
    skipFetch?: boolean;
}

/**
 * 取圖 → 辨識 → 分組 → 翻譯；進度用 tabs.sendMessage 回報給那個分頁
 */
async function runPipeline(input: PipelineInput): Promise<TranslateResponse> {
    const { tab, frameId, requestId, srcUrl, lang, hint, geometry, prefetch, skipFetch } = input;
    const tabId = tab.id!;
    pending.set(requestId, { tabId, frameId });
    try {
        let image: { dataUrl: string; coverage: ResultMessage['coverage'] } | null = null;
        const fetched = skipFetch ? null : await fetchImage(srcUrl);
        if (fetched) {
            if (prefetch && Math.min(fetched.width, fetched.height) < PREFETCH_MIN_SIDE) return { ok: false, code: 'skipped' };
            image = { dataUrl: fetched.dataUrl, coverage: { left: 0, top: 0, width: 1, height: 1 } };
        } else if (geometry && frameId === 0 && typeof tab.windowId === 'number') {
            // 畫面擷取只用在主頁框：iframe 裡的座標是相對於 iframe，對不上整個分頁的截圖
            image = await captureImage(tabId, tab.windowId, geometry).catch(() => null);
        }
        if (!image) return { ok: false, code: 'capture-failed', needsVisible: !geometry };

        await ensureOffscreen();
        if (!prefetch) sendToTab(tabId, frameId, { type: IMAGE_TRANSLATE_PROGRESS, requestId, phase: 'analyze' });
        const analyzeRequest: AnalyzeRequest = { target: OFFSCREEN_TARGET, type: OFFSCREEN_ANALYZE, requestId, dataUrl: image.dataUrl, lang, hint };
        const analysis = (await chrome.runtime.sendMessage(analyzeRequest)) as AnalyzeResponse | undefined;
        if (!analysis?.ok) {
            contentLogger.warn('圖片翻譯：辨識失敗', analysis);
            return { ok: false, code: analysis?.code ?? 'analyze-failed' };
        }

        // 自動判斷時，之後分組與翻譯都用判斷出來的語言
        const sourceLang = analysis.lang;
        const blocks = groupLines(analysis, sourceLang);
        if (blocks.length === 0) return { ok: false, code: 'no-text' };

        if (!prefetch) sendToTab(tabId, frameId, { type: IMAGE_TRANSLATE_PROGRESS, requestId, phase: 'translate' });
        await initI18n();
        const locale = getLocale();
        let translations: string[];
        try {
            translations = await translateForImage(blocks.map((block) => block.text), sourceLang, locale);
        } catch (error) {
            if (error instanceof TranslateBusyError) return { ok: false, code: 'translate-busy', retryAt: error.retryAt };
            return { ok: false, code: 'translate-failed' };
        }

        const result: TranslatedImage = {
            requestId,
            image: image.dataUrl,
            coverage: image.coverage,
            width: analysis.width,
            height: analysis.height,
            blocks: blocks.map((block, i) => ({ ...block, translation: translations[i] ?? '' })),
            targetLang: locale,
            sourceLang,
            diagnostics: { regions: analysis.regions, lines: analysis.lines }
        };
        // 存起來：下次打開同一部漫畫直接貼上（存失敗不影響這次的結果）
        const key = translationKey(srcUrl);
        if (key) {
            await storeResult(`${locale}|${key}`, result).catch((error) => contentLogger.debug('圖片翻譯：存譯文失敗', error));
        }
        return { ok: true, result };
    } catch (error) {
        contentLogger.warn('圖片翻譯失敗', error);
        return { ok: false, code: 'analyze-failed' };
    } finally {
        pending.delete(requestId);
    }
}

/** 存之前把擷取到的圖壓成 JPEG（PNG 一頁動輒一兩 MB），只用來當譯文層的底圖 */
async function storeResult(key: string, result: TranslatedImage): Promise<void> {
    let image = result.image;
    if (image.startsWith('data:image/png')) {
        const bitmap = await createImageBitmap(await (await fetch(image)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        bitmap.close();
        const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
        image = bytesToDataUrl(new Uint8Array(await jpeg.arrayBuffer()), 'image/jpeg');
    }
    await saveTranslation(key, { ...result, image });
}

async function lookupStored(srcUrl: string): Promise<TranslatedImage | null> {
    const key = translationKey(srcUrl);
    if (!key) return null;
    await initI18n();
    const stored = await loadTranslation(`${getLocale()}|${key}`).catch(() => null);
    return stored ? { ...stored, requestId: crypto.randomUUID() } : null;
}

// ---------- 整本翻譯（在使用者自己的分頁裡自動翻頁） ----------

// 正在整本翻譯的分頁 → 開始時的網址（不含 #）；存在 session，service worker 重啟後還記得。
// 只接受這些分頁送來的翻頁鍵；翻頁時網頁被帶到別頁（例如鍵盤的下一話），就把分頁帶回來
const BATCH_SESSIONS_KEY = 'imageTranslate.batchSessions';

const withoutHash = (url: string) => url.split('#')[0];

async function batchSessions(): Promise<Record<string, string>> {
    const stored = await chrome.storage.session.get(BATCH_SESSIONS_KEY);
    return (stored[BATCH_SESSIONS_KEY] ?? {}) as Record<string, string>;
}

async function setBatchSession(tabId: number, url: string | null): Promise<void> {
    const sessions = await batchSessions();
    if (url === null) delete sessions[tabId];
    else sessions[tabId] = withoutHash(url);
    await chrome.storage.session.set({ [BATCH_SESSIONS_KEY]: sessions });
}

/** 在網頁本身的環境按一個鍵（閱讀器的鍵盤處理多半看 keyCode，內容腳本送的事件設不了這個欄位） */
async function pressKeyInPage(tabId: number, key: string, keyCode: number): Promise<void> {
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [key, keyCode],
        func: (pressedKey: string, pressedKeyCode: number) => {
            for (const type of ['keydown', 'keyup']) {
                const event = new KeyboardEvent(type, { key: pressedKey, bubbles: true, cancelable: true });
                Object.defineProperty(event, 'keyCode', { get: () => pressedKeyCode });
                Object.defineProperty(event, 'which', { get: () => pressedKeyCode });
                (document.activeElement ?? document.body).dispatchEvent(event);
            }
        }
    });
}

async function injectContentScript(tabId: number, frameId: number): Promise<boolean> {
    try {
        await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: [CONTENT_SCRIPT] });
        return true;
    } catch (error) {
        // chrome:// 頁面、線上應用程式商店等不允許注入的地方
        contentLogger.debug('圖片翻譯：無法注入內容腳本', error);
        return false;
    }
}

/** 右鍵選單：翻一張 */
async function handleMenuTranslate(lang: LangChoice, info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab): Promise<void> {
    const tabId = tab.id;
    const srcUrl = info.srcUrl;
    if (typeof tabId !== 'number' || !srcUrl) return;
    const frameId = info.frameId ?? 0;
    const requestId = crypto.randomUUID();
    if (!(await injectContentScript(tabId, frameId))) return;
    const startRequest: StartRequest = { type: IMAGE_TRANSLATE_START, requestId, srcUrl, lang };
    const start = (await chrome.tabs.sendMessage(tabId, startRequest, { frameId })) as StartResponse | undefined;
    if (!start?.ok) return;

    const response = await runPipeline({ tab, frameId, requestId, srcUrl, lang, geometry: { rect: start.rect, viewport: start.viewport }, prefetch: false });
    if (response.ok) {
        sendToTab(tabId, frameId, { type: IMAGE_TRANSLATE_RESULT, ...response.result });
    } else if (response.code !== 'skipped') {
        sendToTab(tabId, frameId, { type: IMAGE_TRANSLATE_ERROR, requestId, code: response.code });
    }
}

/**
 * 快捷鍵：切換這個分頁的自動翻譯（只在主頁框；閱讀器的圖片幾乎都在主頁框）
 */
async function handleCommand(tab: chrome.tabs.Tab | undefined): Promise<void> {
    if (typeof tab?.id !== 'number') return;
    if (!(await injectContentScript(tab.id, 0))) return;
    const message: AutoToggleMessage = { type: IMAGE_TRANSLATE_AUTO_TOGGLE };
    chrome.tabs.sendMessage(tab.id, message, { frameId: 0 }).catch(() => undefined);
}

function isTranslateRequest(message: unknown): message is TranslateRequest {
    const m = message as Partial<TranslateRequest> | null;
    return m?.type === IMAGE_TRANSLATE_REQUEST && typeof m.srcUrl === 'string' && typeof m.requestId === 'string' && MENU_LANGS.includes(m.lang as LangChoice)
        && (m.hint === undefined || SOURCE_LANGS.includes(m.hint));
}

/**
 * 在 background 頂層同步呼叫，service worker 被喚醒時才接得到事件
 */
export function installImageTranslate(): void {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
        const id = String(info.menuItemId);
        if (!id.startsWith(MENU_CHILD_PREFIX) || !tab) return;
        const lang = id.slice(MENU_CHILD_PREFIX.length) as LangChoice;
        if (!MENU_LANGS.includes(lang)) return;
        void handleMenuTranslate(lang, info, tab);
    });

    chrome.commands.onCommand.addListener((command, tab) => {
        if (command === TRANSLATE_COMMAND) void handleCommand(tab);
    });

    // 整本翻譯中的分頁被關掉
    chrome.tabs.onRemoved.addListener((tabId) => void setBatchSession(tabId, null));
    // 整本翻譯中的分頁被帶到別頁：整本翻譯已經跟著網頁一起停了，把分頁帶回原本的漫畫
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (!changeInfo.url) return;
        const url = changeInfo.url;
        void batchSessions().then(async (sessions) => {
            const start = sessions[tabId];
            if (start === undefined || withoutHash(url) === start) return;
            await setBatchSession(tabId, null);
            await chrome.tabs.goBack(tabId).catch(() => undefined);
        });
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // 之前翻過的頁：直接回傳存著的譯文
        if (message?.type === IMAGE_TRANSLATE_LOOKUP && isFromContentScript(sender) && typeof message.srcUrl === 'string') {
            lookupStored(message.srcUrl).then(sendResponse, () => sendResponse(null));
            return true;
        }
        // 整本翻譯：這個分頁要開始自動翻頁了
        if (message?.type === IMAGE_TRANSLATE_BATCH_BEGIN && isFromContentScript(sender) && sender.tab?.id !== undefined) {
            setBatchSession(sender.tab.id, sender.tab.url ?? '').then(() => sendResponse(true), () => sendResponse(false));
            return true;
        }
        // 整本翻譯：在網頁裡按翻頁鍵（只接受正在整本翻譯的分頁送來的）
        if (message?.type === IMAGE_TRANSLATE_BATCH_KEY && isFromContentScript(sender) && sender.tab?.id !== undefined) {
            const tabId = sender.tab.id;
            void batchSessions().then(async (sessions) => {
                if (sessions[tabId] === undefined || typeof message.key !== 'string') return sendResponse(false);
                await pressKeyInPage(tabId, message.key, Number(message.keyCode) || 0).then(() => sendResponse(true), () => sendResponse(false));
            });
            return true;
        }
        // 整本翻譯做完：不再接受這個分頁的翻頁鍵
        if (message?.type === IMAGE_TRANSLATE_BATCH_PROGRESS && isFromContentScript(sender) && sender.tab?.id !== undefined) {
            if ((message as BatchProgress).finished) void setBatchSession(sender.tab.id, null);
            return false;
        }
        // 自動翻譯模式：內容腳本請求翻譯一張圖
        if (isTranslateRequest(message) && isFromContentScript(sender) && sender.tab) {
            runPipeline({
                tab: sender.tab,
                frameId: sender.frameId ?? 0,
                requestId: message.requestId,
                srcUrl: message.srcUrl,
                lang: message.lang,
                hint: message.hint,
                geometry: message.geometry,
                prefetch: message.prefetch === true,
                skipFetch: message.skipFetch === true
            }).then(sendResponse);
            return true;
        }
        // offscreen 文件回報的模型下載進度，轉給發出請求的那個分頁
        if (message?.type === OFFSCREEN_PROGRESS && sender.id === chrome.runtime.id && !sender.tab) {
            const target = pending.get(message.requestId);
            if (target) {
                sendToTab(target.tabId, target.frameId, {
                    type: IMAGE_TRANSLATE_PROGRESS,
                    requestId: message.requestId,
                    phase: 'download',
                    loaded: message.loaded,
                    total: message.total
                });
            }
        }
        return false;
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name !== OFFSCREEN_IDLE_ALARM || pending.size > 0) return;
        chrome.offscreen.closeDocument().catch(() => undefined);
    });

    // 只在非正式版的建置（vite build --mode development）存在：自動化測試按不到原生右鍵選單與快捷鍵，改由這裡走同一條流程。
    // 正式版建置時 import.meta.env.PROD 是 true，整段會被移除
    if (!import.meta.env.PROD) {
        const hooks = globalThis as Record<string, unknown>;
        hooks.__lexiTechlyTranslateImageForTest = async (tabId: number, srcUrl: string, lang: LangChoice, frameId = 0) => {
            const tab = await chrome.tabs.get(tabId);
            await handleMenuTranslate(lang, { srcUrl, frameId, menuItemId: `${MENU_CHILD_PREFIX}${lang}`, editable: false, pageUrl: tab.url ?? '' }, tab);
        };
        hooks.__lexiTechlyToggleAutoTranslateForTest = async (tabId: number) => handleCommand(await chrome.tabs.get(tabId));
    }
}
