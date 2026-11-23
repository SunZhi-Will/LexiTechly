/**
 * 用使用者自己的 API Key 呼叫 Gemini（BYOK）
 *
 * 走串流端點：背景頁是 service worker，fetch 超過 30 秒沒收到回應會被 Chrome 中止，
 * 整頁分析這種長回應用一般端點可能撐不到；串流端點一開始產生內容就會回應。
 * 金鑰放在標頭，不放在網址上。
 */

import { GEMINI_STREAM_URL } from '../ai-models';
import { AiError, type AiTextRequest, type AiTextResult, type TextProvider } from './types';

const MAX_ATTEMPTS = 3;

interface StreamChunk {
    candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
        finishReason?: string;
    }[];
}

export function buildGeminiBody(request: AiTextRequest): unknown {
    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.topK !== undefined) generationConfig.topK = request.topK;
    if (request.topP !== undefined) generationConfig.topP = request.topP;
    if (request.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = request.maxOutputTokens;
    if (request.json) generationConfig.responseMimeType = 'application/json';
    return {
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        generationConfig
    };
}

/**
 * 把串流回應（SSE）的全文組回一段文字。
 * 每個事件是一行 `data: {json}`；模型的思考過程（thought）不算在答案裡。
 */
export function parseGeminiStream(body: string): AiTextResult {
    let text = '';
    let finishReason: string | undefined;
    for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let chunk: StreamChunk;
        try {
            chunk = JSON.parse(payload) as StreamChunk;
        } catch {
            continue;
        }
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
            if (typeof part.text === 'string' && !part.thought) text += part.text;
        }
        if (candidate?.finishReason) finishReason = candidate.finishReason;
    }
    return { text: text.trim(), finishReason };
}

export interface GeminiByokDeps {
    getApiKey: () => Promise<string>;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
}

export function createGeminiByokProvider(deps: GeminiByokDeps): TextProvider {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

    return {
        async generate(request: AiTextRequest): Promise<AiTextResult> {
            const apiKey = (await deps.getApiKey()).trim();
            if (!apiKey) throw new AiError('no-key', '請先在設定頁面設定 API Key');
            const fetchImpl = deps.fetchImpl ?? fetch;

            for (let attempt = 0; ; attempt++) {
                let response: Response;
                try {
                    response = await fetchImpl(GEMINI_STREAM_URL, {
                        method: 'POST',
                        credentials: 'omit',
                        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                        body: JSON.stringify(buildGeminiBody(request))
                    });
                } catch {
                    throw new AiError('network', '無法連線到 Gemini，請檢查網路後再試');
                }

                // 額度或服務忙碌：等一下再試，試完還是不行才回報
                if (response.status === 429 || response.status === 503) {
                    if (attempt + 1 < MAX_ATTEMPTS) {
                        await sleep(2 ** attempt * 1000);
                        continue;
                    }
                    if (response.status === 429) throw new AiError('quota', 'Gemini 的額度已用完或請求太頻繁，請稍後再試');
                    throw new AiError('network', 'Gemini 目前忙碌中，請稍後再試');
                }

                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    const errorBody = await response.text().catch(() => '');
                    // 400 也可能是請求本身的問題；只有和金鑰有關的才當作金鑰錯誤
                    if (response.status !== 400 || /api[_ ]?key/i.test(errorBody)) {
                        throw new AiError('invalid-key', 'API Key 無效或沒有權限，請到設定頁面檢查');
                    }
                    throw new AiError('bad-response', `Gemini 拒絕了這個請求（HTTP ${response.status}）`);
                }
                if (!response.ok) throw new AiError('bad-response', `Gemini 回應錯誤（HTTP ${response.status}）`);

                const result = parseGeminiStream(await response.text());
                if (!result.text) throw new AiError('bad-response', 'Gemini 沒有回傳內容');
                return result;
            }
        }
    };
}
