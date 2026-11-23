/**
 * 圖片翻譯的翻譯引擎選擇（背景頁）
 *
 * 使用者在設定頁選翻譯來源（imageTranslate.engine）：
 * - google（預設）：下面的 Google 免金鑰流程。
 * - gemini：用使用者填的 Gemini API Key（見 gemini-translate.ts），不走 Google，也不會被 Google 擋。
 *
 * Google 流程：
 * 1. Google 免金鑰端點：品質好、不需下載，但同一個 IP 短時間請求太多會被擋（429）。
 * 2. Chrome 內建翻譯（Translator API）：只有 Google Chrome 有，而且該語言的語言包要使用者先下載過
 *    （availability 為 available）；下載需要使用者點擊，背景頁做不到，所以這裡只在已經可用時接手。
 *
 * 被 429 擋下後記錄 30 分鐘，這段時間不再打 Google（再打只會延長封鎖），直接走本機翻譯；
 * 本機翻譯也不能用時，回報 TranslateBusyError，由介面告訴使用者稍後再試。
 */

import type { Locale } from './i18n';
import { TranslateHttpError, googleSourceCode, googleTargetCode, translateTexts } from './google-translate';
import { GeminiQuotaError, translateWithGemini } from './gemini-translate';
import type { SourceLang } from './protocol';

export type ImageTranslateEngine = 'google' | 'gemini';
export const ENGINE_KEY = 'imageTranslate.engine';

// ---------- Gemini 的排隊與限速 ----------
// 自動翻譯會一口氣預先翻好幾頁，每張一個請求；不排隊就是一波連發，免費額度（每分鐘約十次）馬上用完。
// 一開始只保持一次一個、間隔一秒（付費額度的人不必等）；第一次被 429 擋下後，這個 service worker
// 之後都拉長到七秒一次（每分鐘不到九次），避免接著又被擋。
const GEMINI_INTERVAL_MS = 1000;
const GEMINI_THROTTLED_INTERVAL_MS = 7000;
// 被 429 擋下時，Gemini 建議的等待不超過這麼久就原地等完再試一次；更久就回報忙碌，讓使用者稍後再按
const GEMINI_MAX_INLINE_WAIT_MS = 30 * 1000;
// Gemini 沒說要等多久時的預設值
const GEMINI_DEFAULT_RETRY_MS = 60 * 1000;

export async function getEngine(): Promise<ImageTranslateEngine> {
    const stored = await chrome.storage.local.get(ENGINE_KEY);
    return stored[ENGINE_KEY] === 'gemini' ? 'gemini' : 'google';
}

const BLOCKED_KEY = 'imageTranslate.googleBlockedUntil';
const BLOCK_MS = 30 * 60 * 1000;

export class TranslateBusyError extends Error {
    // Google 預計解除封鎖、可以再試的時間（我們自己設的 30 分鐘冷卻）
    constructor(readonly retryAt: number) {
        super('translate busy');
    }
}

// Translator API 尚未收錄在 @types/chrome；只宣告用到的部分
interface BuiltinTranslator {
    translate(text: string): Promise<string>;
}
interface TranslatorStatic {
    availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
    create(options: { sourceLanguage: string; targetLanguage: string }): Promise<BuiltinTranslator>;
}

const BUILTIN_TARGET: Record<Locale, string> = { 'zh-TW': 'zh-Hant', 'zh-CN': 'zh', en: 'en', ja: 'ja' };

const builtinCache = new Map<string, BuiltinTranslator>();

/**
 * 用 Chrome 內建翻譯；不支援、語言包還沒下載、或原文與譯文同語言時回傳 null
 */
export async function translateWithBuiltin(texts: string[], lang: SourceLang, locale: Locale): Promise<string[] | null> {
    const api = (globalThis as { Translator?: TranslatorStatic }).Translator;
    const target = BUILTIN_TARGET[locale];
    if (!api || target.split('-')[0] === lang) return null;
    const key = `${lang}>${target}`;
    try {
        let translator = builtinCache.get(key);
        if (!translator) {
            if ((await api.availability({ sourceLanguage: lang, targetLanguage: target })) !== 'available') return null;
            translator = await api.create({ sourceLanguage: lang, targetLanguage: target });
            builtinCache.set(key, translator);
        }
        const out: string[] = [];
        for (const text of texts) out.push(text.trim() ? await translator.translate(text) : '');
        return out;
    } catch {
        return null;
    }
}

async function googleBlockedUntil(): Promise<number> {
    const stored = await chrome.storage.session.get(BLOCKED_KEY);
    return typeof stored[BLOCKED_KEY] === 'number' ? stored[BLOCKED_KEY] : 0;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 排隊器：一次只跑一個工作，而且每個工作開始的時間至少間隔 intervalMs（間隔可以隨時調整）
 */
export class Pacer {
    private queue: Promise<unknown> = Promise.resolve();
    private lastStart = 0;

    constructor(public intervalMs: number) {}

    run<T>(task: () => Promise<T>): Promise<T> {
        const start = async () => {
            const wait = this.lastStart + this.intervalMs - Date.now();
            if (wait > 0) await sleep(wait);
            this.lastStart = Date.now();
            return task();
        };
        const job = this.queue.then(start, start);
        this.queue = job.catch(() => undefined);
        return job;
    }

    /** 工作裡又送出一個請求（例如重試）時呼叫：下一個工作的間隔從這時重新算 */
    markRequest(): void {
        this.lastStart = Date.now();
    }
}

// 兩次 Google 請求至少間隔這麼久：自動翻譯會一口氣預先翻好幾頁，不排隊就是一波連發，最容易被擋
const googlePacer = new Pacer(1000);
const geminiPacer = new Pacer(GEMINI_INTERVAL_MS);

/** 測試用：把 Gemini 的排隊器恢復成初始狀態 */
export function resetGeminiPacerForTest(intervalMs = GEMINI_INTERVAL_MS): void {
    geminiPacer.intervalMs = intervalMs;
}

async function translateWithGeminiPaced(texts: string[], lang: SourceLang, locale: Locale, apiKey: string, throttledIntervalMs: number, maxInlineWaitMs: number): Promise<string[]> {
    // 等待與重試都在排隊器裡：被擋的那段時間，後面排隊的請求也跟著等，不會趁空檔又送出去
    return geminiPacer.run(async () => {
        try {
            return await translateWithGemini(texts, lang, locale, apiKey);
        } catch (error) {
            if (!(error instanceof GeminiQuotaError)) throw error;
            geminiPacer.intervalMs = Math.max(geminiPacer.intervalMs, throttledIntervalMs);
            const wait = error.retryAfterMs ?? GEMINI_DEFAULT_RETRY_MS;
            if (wait > maxInlineWaitMs) throw new TranslateBusyError(Date.now() + wait);
            await sleep(wait);
            geminiPacer.markRequest();
            try {
                return await translateWithGemini(texts, lang, locale, apiKey);
            } catch (retryError) {
                if (retryError instanceof GeminiQuotaError) {
                    throw new TranslateBusyError(Date.now() + (retryError.retryAfterMs ?? GEMINI_DEFAULT_RETRY_MS));
                }
                throw retryError;
            }
        }
    });
}

/** 測試用的參數；正式流程用預設值 */
export interface GeminiPacingOptions {
    throttledIntervalMs?: number;
    maxInlineWaitMs?: number;
}

export async function translateForImage(
    texts: string[],
    lang: SourceLang,
    locale: Locale,
    engine: ImageTranslateEngine = 'google',
    pacing: GeminiPacingOptions = {}
): Promise<string[]> {
    if (engine === 'gemini') {
        const { apiKey } = await chrome.storage.local.get('apiKey');
        // 金鑰錯誤（GeminiKeyError）往上丟，由呼叫端告訴使用者去設定；額度問題在排隊器裡等待或轉成 TranslateBusyError
        return translateWithGeminiPaced(
            texts,
            lang,
            locale,
            typeof apiKey === 'string' ? apiKey.trim() : '',
            pacing.throttledIntervalMs ?? GEMINI_THROTTLED_INTERVAL_MS,
            pacing.maxInlineWaitMs ?? GEMINI_MAX_INLINE_WAIT_MS
        );
    }
    let blockedUntil = await googleBlockedUntil();
    let blocked = Date.now() < blockedUntil;
    if (!blocked) {
        try {
            return await googlePacer.run(() => translateTexts(texts, googleSourceCode(lang), googleTargetCode(locale)));
        } catch (error) {
            if (!(error instanceof TranslateHttpError && error.status === 429)) throw error;
            blocked = true;
            blockedUntil = Date.now() + BLOCK_MS;
            await chrome.storage.session.set({ [BLOCKED_KEY]: blockedUntil });
        }
    }
    const builtin = await translateWithBuiltin(texts, lang, locale);
    if (builtin) return builtin;
    throw new TranslateBusyError(blockedUntil);
}
