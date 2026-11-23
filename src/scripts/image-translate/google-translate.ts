/**
 * Google 翻譯免金鑰端點（translate_a/t，client=gtx）
 *
 * 移植前的 P0 實測：
 * - 一段一個 q 參數、用 GET：每段各自回傳，100% 對齊；用換行串成一段的寫法有三成段數對不上，不能用。
 * - POST 一律 429；沒有任何 q 的空請求回 400，緊接著的請求可能被 429。所以永遠不送空請求。
 * - 端點回 Access-Control-Allow-Origin: *，不需要 host 權限。
 * 這是非官方端點，Google 隨時可能改，所以解析失敗一律丟錯，由呼叫端顯示「翻譯失敗」。
 */

import type { Locale } from './i18n';
import type { SourceLang } from './protocol';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/t';
// 網址長度上限（保守值）；超過就拆成多次請求
const MAX_URL_LENGTH = 6000;

/** 中文原文用 auto，讓 Google 自己分簡繁 */
export function googleSourceCode(lang: SourceLang): string {
    return lang === 'zh' ? 'auto' : lang;
}

export function googleTargetCode(locale: Locale): string {
    return locale;
}

export function buildTranslateUrl(texts: string[], source: string, target: string): string {
    const params = new URLSearchParams({ client: 'gtx', sl: source, tl: target });
    for (const text of texts) params.append('q', text);
    return `${ENDPOINT}?${params}`;
}

/**
 * 依網址長度把段落分批；單一段落本身就超過上限時自己一批（照送，讓伺服器決定）
 */
export function chunkTexts(texts: string[], source: string, target: string, maxLength = MAX_URL_LENGTH): string[][] {
    const chunks: string[][] = [];
    let current: string[] = [];
    for (const text of texts) {
        if (current.length > 0 && buildTranslateUrl([...current, text], source, target).length > maxLength) {
            chunks.push(current);
            current = [];
        }
        current.push(text);
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
}

/**
 * 回應格式：多段時是 [[譯文, 偵測到的語言], ...]；原文語言指定時可能是 [譯文, ...]
 */
export function parseTranslateResponse(json: unknown, expected: number): string[] {
    if (!Array.isArray(json)) throw new Error('unexpected response');
    // 只送一段、而且回的是 [譯文, 語言] 這種扁平形式
    if (expected === 1 && json.length === 2 && typeof json[0] === 'string' && typeof json[1] === 'string' && !Array.isArray(json[1])) {
        return [json[0]];
    }
    const out = json.map((item) => (Array.isArray(item) ? item[0] : item));
    if (out.length !== expected || out.some((item) => typeof item !== 'string')) {
        throw new Error(`expected ${expected} translations, got ${out.length}`);
    }
    return out as string[];
}

/** 端點回非 2xx；429 代表這個 IP 被暫時擋下（P1 開發時實際遇過：一小時約三百次請求後被擋） */
export class TranslateHttpError extends Error {
    constructor(readonly status: number) {
        super(`HTTP ${status}`);
    }
}

export async function translateTexts(texts: string[], source: string, target: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
    const results = new Array<string>(texts.length).fill('');
    // 空字串不送（空請求會 400）；送出去的保留原本的位置
    const indexed = texts.map((text, index) => ({ text: text.trim(), index })).filter((item) => item.text.length > 0);
    if (indexed.length === 0) return results;
    let offset = 0;
    for (const chunk of chunkTexts(indexed.map((item) => item.text), source, target)) {
        const response = await fetchImpl(buildTranslateUrl(chunk, source, target), { credentials: 'omit' });
        if (!response.ok) throw new TranslateHttpError(response.status);
        const translated = parseTranslateResponse(await response.json(), chunk.length);
        translated.forEach((text, i) => {
            results[indexed[offset + i].index] = text;
        });
        offset += chunk.length;
    }
    return results;
}
