// Gemini 文字模型名稱集中在這裡，模型被棄用時只需要改這個檔案。
// 語音用的 Live 模型在 audio/geminiSpeech.ts。
// 棄用時程：https://aistudio.google.com/docs/deprecations

// gemini-2.5-flash 於 2026-12-01 起被自動導向此模型，這裡直接明確指定。
export const GEMINI_TEXT_MODEL = 'gemini-3.5-flash-lite';

export const GEMINI_GENERATE_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`;

// 串流端點（SSE）。背景頁的 AI 請求走這個，見 ai/gemini-byok.ts。
export const GEMINI_STREAM_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:streamGenerateContent?alt=sse`;
