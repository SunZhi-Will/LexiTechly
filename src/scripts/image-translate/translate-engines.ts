/**
 * 圖片翻譯的翻譯引擎選擇（背景頁）
 *
 * 1. Google 免金鑰端點（預設）：品質好、不需下載，但同一個 IP 短時間請求太多會被擋（429）。
 * 2. Chrome 內建翻譯（Translator API）：只有 Google Chrome 有，而且該語言的語言包要使用者先下載過
 *    （availability 為 available）；下載需要使用者點擊，背景頁做不到，所以這裡只在已經可用時接手。
 *
 * 被 429 擋下後記錄 30 分鐘，這段時間不再打 Google（再打只會延長封鎖），直接走本機翻譯；
 * 本機翻譯也不能用時，回報 TranslateBusyError，由介面告訴使用者稍後再試。
 */

import type { Locale } from './i18n';
import { TranslateHttpError, googleSourceCode, googleTargetCode, translateTexts } from './google-translate';
import type { SourceLang } from './protocol';

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

// 兩次 Google 請求至少間隔這麼久：自動翻譯會一口氣預先翻好幾頁，不排隊就是一波連發，最容易被擋
const GOOGLE_MIN_INTERVAL_MS = 1000;
let googleQueue: Promise<unknown> = Promise.resolve();
let lastGoogleAt = 0;

function paced<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
        const wait = lastGoogleAt + GOOGLE_MIN_INTERVAL_MS - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        lastGoogleAt = Date.now();
        return task();
    };
    const job = googleQueue.then(run, run);
    googleQueue = job.catch(() => undefined);
    return job;
}

export async function translateForImage(texts: string[], lang: SourceLang, locale: Locale): Promise<string[]> {
    let blockedUntil = await googleBlockedUntil();
    let blocked = Date.now() < blockedUntil;
    if (!blocked) {
        try {
            return await paced(() => translateTexts(texts, googleSourceCode(lang), googleTargetCode(locale)));
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
