/// <reference types="chrome"/>

// CEFR 等級類型
// 名稱沿用舊的，實際上是各語言分級系統的等級（CEFR、JLPT、TOPIK、HSK），見 lang/languages.ts
export type CEFRLevel = string;

// 單字介面
export interface Word {
    text: string;
    level: CEFRLevel;
    translation: string;
    example: string;
    phonetic?: string;
    /** 這個單字的語言；舊資料沒有這個欄位，視為英文 */
    lang?: string;
    addedTime: number;
}

// Chrome 訊息介面
export interface ChromeMessage {
    action: 'analyze' | 'chat' | 'analyzeVocabulary';
    /** 有設定 API Key 時用 AI 分析，否則用本機規則。金鑰本身不經過訊息傳遞 */
    useAi?: boolean;
    message?: string;
    history?: Array<{ text: string; type: 'user' | 'ai' }>;
}

// Chrome 回應介面
export interface ChromeResponse {
    success?: boolean;
    level?: {
        level: CEFRLevel;
        analysis: {
            vocabulary: string;
            grammar: string;
            topic: string;
        };
    };
    text?: string;
    /** 分析時採用的學習語言 */
    lang?: string;
    error?: string;
    response?: string;
    vocabulary?: Word[];
}

// Gemini API 請求介面
export interface GeminiRequest {
    contents: Array<{
        role: string;
        parts: Array<{
            text: string;
        }>;
    }>;
    generationConfig: {
        temperature: number;
        topK: number;
        topP: number;
        maxOutputTokens: number;
        responseMimeType?: string;
    };
}

// Gemini API 回應介面
export interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
        };
    }>;
} 