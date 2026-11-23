/**
 * AI 文字請求的共用型別
 *
 * 內容腳本與擴充頁面只描述「要問什麼」，由背景頁決定用哪個 provider、帶哪把金鑰去問。
 * 之後加入代管後端或 Chrome 內建 AI 時，只需要多一個 TextProvider，呼叫端不用改。
 */

export interface AiTextRequest {
    prompt: string;
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
    /** 要求模型回傳 JSON */
    json?: boolean;
}

export interface AiTextResult {
    text: string;
    /** 模型停止的原因，例如 STOP、MAX_TOKENS */
    finishReason?: string;
}

export type AiErrorCode =
    /** 沒有設定 API Key */
    | 'no-key'
    /** 金鑰無效或沒有權限 */
    | 'invalid-key'
    /** 額度用完或請求太頻繁 */
    | 'quota'
    /** 連不上服務 */
    | 'network'
    /** 服務有回應，但內容不能用 */
    | 'bad-response';

export class AiError extends Error {
    constructor(public readonly code: AiErrorCode, message: string) {
        super(message);
        this.name = 'AiError';
    }
}

export interface TextProvider {
    generate(request: AiTextRequest): Promise<AiTextResult>;
}

/** 內容腳本、擴充頁面送給背景頁的訊息 */
export const AI_GENERATE_ACTION = 'ai.generate';
export const AI_HAS_KEY_ACTION = 'ai.hasKey';

export interface AiGenerateMessage {
    action: typeof AI_GENERATE_ACTION;
    request: AiTextRequest;
}

export type AiGenerateResponse =
    | { ok: true; result: AiTextResult }
    | { ok: false; code: AiErrorCode; message: string };
