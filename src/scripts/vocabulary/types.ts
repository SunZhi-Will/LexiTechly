/// <reference types="chrome"/>

// 基本單字介面
export interface Word {
    text: string;
    level?: string;
    addedTime?: number;
    translation?: string;
    example?: string;
}

// 單字詳細資訊介面
export interface WordDetails {
    synonyms: Array<{
        text: string;
        translation: string;
    }>;
    antonyms: Array<{
        text: string;
        translation: string;
    }>;
    examples: Array<{
        sentence: string;
        translation: string;
    }>;
    usage: string;
    translation?: string;
}

// 儲存資料介面
export interface StorageData {
    accumulatedVocabulary?: Word[];
    currentPageVocabulary?: Word[];
    wordAnalysisCache?: Record<string, WordDetails>;
    audioCache?: Record<string, string>;
    savedAnalysis?: Record<string, any>;
    savedChat?: any[];
    storageLimit?: number;
    apiKey?: string;
}

// 過濾選項介面
export interface FilterOptions {
    level?: string;
    search?: string;
    sort?: string;
}

// Gemini API 相關介面
export interface GeminiRequest {
    contents: Array<{
        parts: Array<{
            text: string;
        }>;
    }>;
    generationConfig?: {
        temperature?: number;
        topK?: number;
        topP?: number;
        maxOutputTokens?: number;
    };
}

export interface GeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
    }>;
}

// Toast 選項介面
export interface ToastOptions {
    message: string;
    isLoading?: boolean;
    isError?: boolean;
}

// 擴展 Word 介面以支援過濾標記
export interface FilteredWordArray extends Array<Word> {
    isFiltered?: boolean;
}

// D3 相關型別
export interface D3Node {
    id: string;
    word: string;
    type: 'main' | 'synonym' | 'antonym' | 'related';
    level?: number;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

export interface D3Link {
    source: string | D3Node;
    target: string | D3Node;
    type: string;
} 