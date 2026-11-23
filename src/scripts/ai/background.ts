/**
 * 背景頁的 AI 請求入口：內容腳本與擴充頁面送 ai.generate 訊息進來，由這裡帶金鑰去問。
 * 金鑰由背景頁讀取並放在請求標頭，不再經過訊息傳遞，也不會出現在網址上。
 */

import { createGeminiByokProvider } from './gemini-byok';
import {
    AI_GENERATE_ACTION,
    AI_HAS_KEY_ACTION,
    AiError,
    type AiGenerateResponse,
    type AiTextRequest,
    type TextProvider
} from './types';

async function readApiKey(): Promise<string> {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    return typeof apiKey === 'string' ? apiKey : '';
}

const provider: TextProvider = createGeminiByokProvider({ getApiKey: readApiKey });

function isTextRequest(value: unknown): value is AiTextRequest {
    return !!value && typeof (value as AiTextRequest).prompt === 'string' && (value as AiTextRequest).prompt.length > 0;
}

/**
 * 處理 AI 相關訊息。回傳 true 代表已接手（會非同步回應），false 代表不是 AI 訊息。
 */
export function handleAiMessage(
    message: { action?: unknown; request?: unknown },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
): boolean {
    if (message.action !== AI_GENERATE_ACTION && message.action !== AI_HAS_KEY_ACTION) return false;

    // 只接受這個擴充功能自己的內容腳本與頁面
    if (sender.id !== chrome.runtime.id) {
        const denied: AiGenerateResponse = { ok: false, code: 'bad-response', message: 'unauthorized sender' };
        sendResponse(denied);
        return true;
    }

    if (message.action === AI_HAS_KEY_ACTION) {
        readApiKey().then(
            (key) => sendResponse({ hasKey: key.trim().length > 0 }),
            () => sendResponse({ hasKey: false })
        );
        return true;
    }

    if (!isTextRequest(message.request)) {
        const invalid: AiGenerateResponse = { ok: false, code: 'bad-response', message: 'invalid request' };
        sendResponse(invalid);
        return true;
    }

    provider.generate(message.request).then(
        (result) => {
            const response: AiGenerateResponse = { ok: true, result };
            sendResponse(response);
        },
        (error: unknown) => {
            const response: AiGenerateResponse =
                error instanceof AiError
                    ? { ok: false, code: error.code, message: error.message }
                    : { ok: false, code: 'bad-response', message: error instanceof Error ? error.message : 'AI 請求失敗' };
            sendResponse(response);
        }
    );
    return true;
}
