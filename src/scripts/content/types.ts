/// <reference types="chrome"/>

// CEFR 等級類型
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// 單字介面
export interface Word {
    text: string;
    level: CEFRLevel;
    translation: string;
    example: string;
    phonetic?: string;
    addedTime: number;
}

// Chrome 訊息介面
export interface ChromeMessage {
    action: 'analyze' | 'chat' | 'analyzeVocabulary';
    apiKey?: string;
    message?: string;
    history?: Array<{ text: string; type: 'user' | 'ai' }>;
}

// Chrome 回應介面
export interface ChromeResponse {
    level?: {
        level: CEFRLevel;
        analysis: {
            vocabulary: string;
            grammar: string;
            topic: string;
        };
    };
    text?: string;
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