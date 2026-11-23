/**
 * 內容腳本與擴充頁面用的 AI 呼叫入口：把請求交給背景頁，不直接碰金鑰與 API。
 */

import {
    AI_GENERATE_ACTION,
    AI_HAS_KEY_ACTION,
    AiError,
    type AiGenerateMessage,
    type AiGenerateResponse,
    type AiTextRequest,
    type AiTextResult
} from './types';

export { AiError } from './types';
export type { AiTextRequest, AiTextResult } from './types';

export async function generateText(request: AiTextRequest): Promise<AiTextResult> {
    const message: AiGenerateMessage = { action: AI_GENERATE_ACTION, request };
    let response: AiGenerateResponse | undefined;
    try {
        response = (await chrome.runtime.sendMessage(message)) as AiGenerateResponse | undefined;
    } catch {
        // 擴充功能剛更新、舊分頁的內容腳本連不到背景頁時會走到這裡
        throw new AiError('network', '無法連線到 Readloop 背景服務，請重新整理頁面後再試');
    }
    if (!response) throw new AiError('network', 'Readloop 背景服務沒有回應，請重新整理頁面後再試');
    if (!response.ok) throw new AiError(response.code, response.message);
    return response.result;
}

/** 使用者有沒有設定 API Key（不會把金鑰本身傳出背景頁） */
export async function hasApiKey(): Promise<boolean> {
    try {
        const response = (await chrome.runtime.sendMessage({ action: AI_HAS_KEY_ACTION })) as { hasKey?: boolean } | undefined;
        return response?.hasKey === true;
    } catch {
        return false;
    }
}
