/**
 * 圖片翻譯的內容腳本：使用者在圖片上按右鍵選「翻譯這張圖片」時，背景頁才注入（activeTab），
 * 不常駐在任何網頁上。同一個分頁重複注入時只裝一次。
 *
 * 負責：找到那張圖、第一次使用時說明會送出什麼、顯示處理進度、把譯文疊回圖上。
 * 辨識與翻譯都在背景頁與 offscreen 文件，這裡不碰網路。
 */

import { initI18n, t } from './i18n';
import { downloadSizeRange } from './models';
import { TranslationOverlay } from './overlay';
import { AutoTranslator, type AutoState } from './auto-translate';
import { AutoPill } from './auto-pill';
import { BatchPill, BatchRunner } from './batch-translate';
import { imageUnder, selectRegion } from './region-select';
import {
    IMAGE_TRANSLATE_AUTO_TOGGLE,
    IMAGE_TRANSLATE_BATCH_BEGIN,
    type BatchBeginRequest,
    IMAGE_TRANSLATE_CAPTURE_DONE,
    IMAGE_TRANSLATE_CAPTURE_PREPARE,
    IMAGE_TRANSLATE_ERROR,
    IMAGE_TRANSLATE_PROGRESS,
    IMAGE_TRANSLATE_RESULT,
    IMAGE_TRANSLATE_START,
    type ErrorMessage,
    type ProgressMessage,
    type LangChoice,
    type ResultMessage,
    type StartRequest,
    type StartResponse
} from './protocol';
import type { MessageKey } from './i18n';

const INSTALLED_FLAG = '__lexiTechlyImageTranslateInstalled';
const NOTICE_ACCEPTED_KEY = 'imageTranslate.noticeAccepted';
// 自動翻譯手動選過的原文語言，依網站記住；沒選過就是自動判斷。
// 舊版的 imageTranslate.langByHost 會強迫整個網站用同一種語言（同一個網站常有各種語言的作品），換新鍵讓它失效
const LANG_BY_HOST_KEY = 'imageTranslate.langChoiceByHost';
// 「預翻下一頁」開關（全站共用；預設關，會閃一下）
const PREFETCH_NEXT_KEY = 'imageTranslate.prefetchNext';
const MB = 1024 * 1024;

const ERROR_KEYS: Record<ErrorMessage['code'], MessageKey> = {
    'no-text': 'manga.error.noText',
    'analyze-failed': 'manga.error.analyze',
    'translate-failed': 'manga.error.translate',
    'translate-busy': 'manga.error.busy',
    'translate-no-key': 'manga.error.noKey',
    'capture-failed': 'manga.error.capture',
    'model-download-failed': 'manga.error.download',
    'region-outside': 'manga.error.regionOutside'
};

const overlays = new Map<string, TranslationOverlay>();
// 每張圖同時只留一層：同一張圖再翻一次（例如換原文語言）時，先拿掉舊的
const overlayByImage = new WeakMap<HTMLImageElement, TranslationOverlay>();

function findImage(srcUrl: string): HTMLImageElement | null {
    const candidates = Array.from(document.images).filter((img) => img.currentSrc === srcUrl || img.src === srcUrl);
    // 同一個網址出現好幾次（例如縮圖與大圖）時，選畫面上最大的那張
    let best: HTMLImageElement | null = null;
    let bestArea = 0;
    for (const img of candidates) {
        const rect = img.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
            best = img;
            bestArea = area;
        }
    }
    return best;
}

async function noticeAccepted(): Promise<boolean> {
    const stored = await chrome.storage.local.get(NOTICE_ACCEPTED_KEY);
    return stored[NOTICE_ACCEPTED_KEY] === true;
}

async function start(request: StartRequest): Promise<StartResponse> {
    await initI18n();
    const image = findImage(request.srcUrl);
    if (!image) return { ok: false, reason: 'not-found' };

    overlayByImage.get(image)?.remove();
    const overlay = new TranslationOverlay(image);
    overlayByImage.set(image, overlay);

    if (!(await noticeAccepted())) {
        const range = downloadSizeRange();
        const accepted = await overlay.confirmNotice(t('manga.notice.title'), t('manga.notice.body', { min: Math.round(range.min / MB), max: Math.round(range.max / MB) }));
        if (!accepted) {
            overlay.remove();
            return { ok: false, reason: 'cancelled' };
        }
        await chrome.storage.local.set({ [NOTICE_ACCEPTED_KEY]: true });
    }

    overlays.set(request.requestId, overlay);
    overlay.setStatus(t('manga.status.preparing'));
    const rect = image.getBoundingClientRect();
    return {
        ok: true,
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
    };
}

// ---------- 擷取畫面時藏起我們自己的介面 ----------

const OUR_HOSTS = 'lexitechly-image-translation, lexitechly-auto-translate';
let hiddenForCapture: HTMLElement[] = [];

/** 藏起譯文層與狀態列，等畫面真的重畫過（兩個 animation frame）才回覆，確保截圖裡沒有它們 */
async function hideOurUi(): Promise<void> {
    hiddenForCapture = Array.from(document.querySelectorAll<HTMLElement>(OUR_HOSTS)).filter((host) => host.style.visibility !== 'hidden');
    for (const host of hiddenForCapture) host.style.visibility = 'hidden';
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function showOurUi(): void {
    for (const host of hiddenForCapture) host.style.visibility = '';
    hiddenForCapture = [];
}

// ---------- 整本翻譯（在這個分頁自動翻頁） ----------

let batch: BatchRunner | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 在這個分頁一頁一頁翻完整本、每頁存起來；翻完回到原本那頁，重新開自動翻譯（翻過的頁直接從本機貼上譯文）。
 * 要在使用者自己的分頁做，因為擴充功能只有這個分頁的 activeTab，能擷取畫面
 */
async function startBatch(): Promise<void> {
    if (batch) return;
    await initI18n();
    const begin: BatchBeginRequest = { type: IMAGE_TRANSLATE_BATCH_BEGIN };
    if (!(await chrome.runtime.sendMessage(begin).catch(() => false))) {
        auto?.pill.flash(t('manga.auto.batchFailed'));
        return;
    }
    const lang = auto?.lang ?? (await rememberedLanguage());
    stopAuto();

    // 記住原本在哪：網址 # 後面是頁碼就記頁碼並從第 1 頁開始，否則記捲動位置、從這頁開始
    const startHash = location.hash;
    const startScroll = window.scrollY;
    if (/^#\d+$/.test(startHash) && startHash !== '#1') {
        location.hash = '#1';
        await sleep(1500);
    }

    const pill = new BatchPill(() => batch?.stop());
    let result = { page: 0, translated: 0, saved: 0, busy: false };
    batch = new BatchRunner(lang, {
        update: (progress) => pill.update(progress),
        finish: (progress) => {
            result = progress;
        }
    });
    try {
        await batch.run();
    } finally {
        batch = null;
        pill.remove();
    }

    if (/^#\d+$/.test(startHash)) location.hash = startHash;
    else window.scrollTo(0, startScroll);
    await sleep(800);
    await toggleAuto();
    auto?.pill.flash(t(result.busy ? 'manga.auto.batchBusy' : 'manga.auto.batchDone', { page: result.page, translated: result.translated, saved: result.saved }), 15000);
}

// ---------- 匯出辨識紀錄（回報漏翻用） ----------

/** 把畫面上這頁的辨識紀錄存成 JSON 檔（下載到使用者自己的電腦，不會送到任何地方）；回傳檔名，沒有紀錄時回傳 null */
function exportDiagnostics(translator: AutoTranslator): string | null {
    const pages = translator.visibleDiagnostics();
    if (pages.length === 0) return null;
    const data = {
        exportedAt: new Date().toISOString(),
        extensionVersion: chrome.runtime.getManifest().version,
        viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
        pages: pages.map(({ result }) => result)
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    const filename = `lexitechly-ocr-log-${Date.now()}.json`;
    link.download = filename;
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return filename;
}

// ---------- 自動翻譯 ----------

let auto: { translator: AutoTranslator; pill: AutoPill; lang: LangChoice } | null = null;

async function rememberedLanguage(): Promise<LangChoice> {
    const stored = await chrome.storage.local.get(LANG_BY_HOST_KEY);
    const map = (stored[LANG_BY_HOST_KEY] ?? {}) as Record<string, LangChoice>;
    return map[location.host] ?? 'auto';
}

async function rememberLanguage(lang: LangChoice): Promise<void> {
    const stored = await chrome.storage.local.get(LANG_BY_HOST_KEY);
    const map = (stored[LANG_BY_HOST_KEY] ?? {}) as Record<string, LangChoice>;
    await chrome.storage.local.set({ [LANG_BY_HOST_KEY]: { ...map, [location.host]: lang } });
}

/** 框選翻譯：讓使用者在圖上拖出一個框，只翻框裡的字 */
async function selectAndTranslate(): Promise<void> {
    if (!auto) return;
    const rect = await selectRegion(t('manga.region.hint'));
    if (!rect || !auto) return;
    const target = imageUnder(rect);
    if (!target) {
        auto.pill.flash(t('manga.region.noImage'));
        return;
    }
    await auto.translator.translateRegion(target.img, target.selection);
}

function stopAuto(): void {
    auto?.translator.stop();
    auto?.pill.remove();
    auto = null;
}

async function toggleAuto(): Promise<void> {
    await initI18n();
    // 整本翻譯中按快捷鍵：停下整本翻譯（翻完會自己回到原本那頁、重開自動翻譯）
    if (batch) {
        batch.stop();
        return;
    }
    // 開著的時候再按一次是關掉；被擋下而暫停時，再按一次是重新開始
    if (auto && !auto.translator.isPaused) {
        stopAuto();
        return;
    }
    stopAuto();

    let state: AutoState = { stats: { translated: 0, noText: 0, unreadable: 0, failed: 0, waitingVisible: 0 }, activity: { kind: 'idle' }, prefetchNext: false };
    const pill = new AutoPill({
        onToggleOriginal: (showOriginal) => auto?.translator.setShowOriginal(showOriginal),
        onChangeLanguage: () => void changeLanguage(),
        onStop: stopAuto,
        onRetranslate: () => auto?.translator.retranslateVisible(),
        onSelectRegion: () => void selectAndTranslate(),
        onBatch: () => void startBatch(),
        onTogglePrefetch: (enabled) => {
            auto?.translator.setPrefetchNext(enabled);
            void chrome.storage.local.set({ [PREFETCH_NEXT_KEY]: enabled });
        },
        onExport: () => {
            if (!auto) return;
            const filename = exportDiagnostics(auto.translator);
            pill.flash(filename ? t('manga.auto.exported', { file: filename }) : t('manga.auto.exportEmpty'));
        }
    });
    const render = () => auto && pill.showRunning(auto.lang, state);

    // 預設自動判斷原文語言，不先問；判斷錯了可以從狀態列「換語言」手動指定
    const lang = await rememberedLanguage();
    if (!(await noticeAccepted())) {
        const range = downloadSizeRange();
        if (!(await pill.confirmNotice(t('manga.notice.title'), t('manga.notice.body', { min: Math.round(range.min / MB), max: Math.round(range.max / MB) })))) {
            pill.remove();
            return;
        }
        await chrome.storage.local.set({ [NOTICE_ACCEPTED_KEY]: true });
    }

    const translator = new AutoTranslator(lang, (next) => {
        state = next;
        render();
    });
    auto = { translator, pill, lang };
    const stored = await chrome.storage.local.get(PREFETCH_NEXT_KEY);
    translator.setPrefetchNext(stored[PREFETCH_NEXT_KEY] === true);
    render();
    translator.start();

    async function changeLanguage(): Promise<void> {
        if (!auto) return;
        const next = await pill.chooseLanguage();
        if (!auto) return;
        if (next && next !== auto.lang) {
            auto.lang = next;
            await rememberLanguage(next);
            auto.translator.setLanguage(next);
        }
        render();
    }
}

function onProgress(message: ProgressMessage, overlay: TranslationOverlay): void {
    if (message.phase === 'download' && message.total) {
        overlay.setStatus(t('manga.status.downloading', {
            loaded: (message.loaded! / MB).toFixed(1),
            total: (message.total / MB).toFixed(1)
        }));
    } else if (message.phase === 'analyze') {
        overlay.setStatus(t('manga.status.analyzing'));
    } else if (message.phase === 'translate') {
        overlay.setStatus(t('manga.status.translating'));
    }
}

function install(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id || sender.tab) return false;
        if (message?.type === IMAGE_TRANSLATE_CAPTURE_PREPARE) {
            hideOurUi().then(() => sendResponse(true));
            return true;
        }
        if (message?.type === IMAGE_TRANSLATE_CAPTURE_DONE) {
            showOurUi();
            auto?.translator.onCaptureDone();
            return false;
        }
        if (message?.type === IMAGE_TRANSLATE_AUTO_TOGGLE) {
            void toggleAuto();
            return false;
        }
        if (message?.type === IMAGE_TRANSLATE_PROGRESS && auto?.translator.ownsRequest(message.requestId)) {
            auto.translator.onProgress(message as ProgressMessage);
            return false;
        }
        if (message?.type === IMAGE_TRANSLATE_START) {
            start(message as StartRequest).then(sendResponse, () => sendResponse({ ok: false, reason: 'not-found' }));
            return true;
        }
        const overlay = overlays.get(message?.requestId);
        if (!overlay || overlay.isRemoved) return false;
        if (message.type === IMAGE_TRANSLATE_PROGRESS) {
            onProgress(message as ProgressMessage, overlay);
        } else if (message.type === IMAGE_TRANSLATE_RESULT) {
            overlays.delete(message.requestId);
            overlay.showResult(message as ResultMessage).catch(() => {
                overlay.setStatus(t('manga.error.analyze'), true);
                overlay.removeLater(5000);
            });
        } else if (message.type === IMAGE_TRANSLATE_ERROR) {
            overlays.delete(message.requestId);
            const code = (message as ErrorMessage).code;
            overlay.setStatus(t(ERROR_KEYS[code] ?? 'manga.error.analyze'), true);
            overlay.removeLater(code === 'no-text' ? 3500 : 6000);
        }
        return false;
    });
}

const globalFlags = window as unknown as Record<string, boolean>;
if (!globalFlags[INSTALLED_FLAG]) {
    globalFlags[INSTALLED_FLAG] = true;
    install();
}
