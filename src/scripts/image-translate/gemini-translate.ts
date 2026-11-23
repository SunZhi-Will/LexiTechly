/**
 * 圖片翻譯用 Gemini 翻譯（使用者在 LexiTechly 設定填的 API Key）
 *
 * 和 Google 免金鑰端點比：會看前後文，對白比較自然，也不會被同一個 IP 的請求次數擋下；
 * 代價是要 API Key、比較慢，而且受 Gemini 的免費額度限制。
 * 一次送一整張圖的所有區塊，要求回傳同樣長度、同樣順序的 JSON 字串陣列，對不上就當作失敗。
 */

import type { Locale } from './i18n';
import type { SourceLang } from './protocol';

// 和 LexiTechly 其他功能用同一個模型
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SOURCE_NAMES: Record<SourceLang, string> = { ko: 'Korean', ja: 'Japanese', zh: 'Chinese' };
const TARGET_NAMES: Record<Locale, string> = {
    'zh-TW': 'Traditional Chinese as used in Taiwan',
    'zh-CN': 'Simplified Chinese',
    en: 'English',
    ja: 'Japanese'
};

/** 沒有 API Key，或 Gemini 說金鑰無效、沒有權限 */
export class GeminiKeyError extends Error {}

/** Gemini 的額度用完或請求太頻繁（429）；retryAfterMs 是 Gemini 建議的等待時間（沒給就是 null） */
export class GeminiQuotaError extends Error {
    constructor(readonly retryAfterMs: number | null = null) {
        super('quota');
    }
}

/**
 * 從 429 回應取出建議的等待時間：先看 Retry-After 標頭（秒），再看錯誤內容裡 RetryInfo 的 retryDelay（例如 "37s"、"1.5s"）
 */
export function parseRetryDelay(retryAfterHeader: string | null, body: string): number | null {
    const header = Number(retryAfterHeader);
    if (retryAfterHeader && Number.isFinite(header) && header >= 0) return Math.round(header * 1000);
    const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
    return match ? Math.round(Number(match[1]) * 1000) : null;
}

export function buildGeminiPrompt(texts: string[], source: SourceLang, target: Locale): string {
    return [
        `Translate the following ${SOURCE_NAMES[source]} comic text into ${TARGET_NAMES[target]}.`,
        'The items are speech bubbles and captions from one comic page, in reading order. Use the surrounding items as context.',
        'Keep the tone natural and conversational, keep sound effects short, and do not add explanations.',
        `Return a JSON array of exactly ${texts.length} strings: the translation of each item, in the same order.`,
        '',
        JSON.stringify(texts)
    ].join('\n');
}

/**
 * 取出 Gemini 回應裡的譯文陣列；格式不對或數量不符就丟錯
 */
export function parseGeminiTranslations(json: unknown, expected: number): string[] {
    const text = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
    if (!text) throw new Error('empty Gemini response');
    // 偶爾還是會包在 ```json 區塊裡
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length !== expected || parsed.some((item) => typeof item !== 'string')) {
        throw new Error(`expected ${expected} translations from Gemini`);
    }
    return parsed as string[];
}

export async function translateWithGemini(
    texts: string[],
    source: SourceLang,
    target: Locale,
    apiKey: string,
    fetchImpl: typeof fetch = fetch
): Promise<string[]> {
    if (!apiKey) throw new GeminiKeyError('missing api key');
    const results = new Array<string>(texts.length).fill('');
    const indexed = texts.map((text, index) => ({ text: text.trim(), index })).filter((item) => item.text.length > 0);
    if (indexed.length === 0) return results;

    const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{ parts: [{ text: buildGeminiPrompt(indexed.map((item) => item.text), source, target) }] }],
            generationConfig: {
                temperature: 0.3,
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
                // 翻譯不需要推理，關掉思考比較快
                thinkingConfig: { thinkingBudget: 0 }
            }
        })
    });
    if (response.status === 429) {
        const body = await response.text().catch(() => '');
        throw new GeminiQuotaError(parseRetryDelay(response.headers.get('retry-after'), body));
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
        const body = await response.text().catch(() => '');
        // 400 也可能是請求本身的問題；只有和金鑰有關的才當作金鑰錯誤
        if (response.status !== 400 || /api[_ ]?key/i.test(body)) throw new GeminiKeyError(`HTTP ${response.status}`);
        throw new Error(`Gemini HTTP ${response.status}`);
    }
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);

    const translated = parseGeminiTranslations(await response.json(), indexed.length);
    translated.forEach((text, i) => {
        results[indexed[i].index] = text;
    });
    return results;
}
