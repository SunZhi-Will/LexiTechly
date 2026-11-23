/**
 * offscreen 文件（擴充功能自己的隱藏頁面）：目前只負責圖片翻譯的文字辨識，見 ocr-engine.ts
 *
 * 只接受擴充功能自己（背景頁）送來、target 是 offscreen 的訊息。
 */

import { ModelDownloadError, analyzeImage } from './ocr-engine';
import {
    OFFSCREEN_ANALYZE,
    OFFSCREEN_PROGRESS,
    OFFSCREEN_TARGET,
    type AnalyzeRequest,
    type AnalyzeResponse,
    type OffscreenProgress
} from './protocol';

// 同一時間只跑一張：一張圖已經用滿 WASM 的執行緒，並行只會互相拖慢，模型初始化也不該重複
let queue: Promise<unknown> = Promise.resolve();

function isAnalyzeRequest(message: unknown): message is AnalyzeRequest {
    const m = message as Partial<AnalyzeRequest> | null;
    return m?.target === OFFSCREEN_TARGET && m.type === OFFSCREEN_ANALYZE && typeof m.dataUrl === 'string' && typeof m.requestId === 'string';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isAnalyzeRequest(message) || sender.id !== chrome.runtime.id) return false;
    const run = async (): Promise<AnalyzeResponse> => {
        try {
            const analysis = await analyzeImage(message.dataUrl, message.lang, message.hint, (loaded, total) => {
                const progress: OffscreenProgress = { type: OFFSCREEN_PROGRESS, requestId: message.requestId, loaded, total };
                chrome.runtime.sendMessage(progress).catch(() => undefined);
            });
            return { ok: true, ...analysis };
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return { ok: false, code: error instanceof ModelDownloadError ? 'model-download-failed' : 'analyze-failed', detail };
        }
    };
    const job = queue.then(run, run);
    queue = job;
    job.then(sendResponse);
    return true;
});
