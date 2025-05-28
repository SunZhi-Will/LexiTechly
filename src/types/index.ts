// 分析結果相關型別
export interface AnalysisResult {
    level: {
        level: CEFRLevel;
        analysis: {
            vocabulary: string;
            grammar: string;
            topic: string;
        };
    };
    text: string;
    error: string | null;
}

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// 單字相關型別
export interface Word {
    text: string;
    level?: string;
    example?: string;
    translation?: string;
    phonetic?: string;
    addedTime?: number;
}

export interface WordDetails {
    word: string;
    phonetic?: string;
    definitions: Definition[];
    examples: Example[];
    synonyms: string[];
    antonyms: string[];
    relatedWords: RelatedWord[];
    etymology?: string;
    usage?: string;
    collocations: string[];
}

export interface Definition {
    partOfSpeech: string;
    meaning: string;
    translation: string;
}

export interface Example {
    sentence: string;
    translation: string;
    context?: string;
}

export interface RelatedWord {
    word: string;
    relationship: string;
    translation?: string;
}

// 聊天相關型別
export interface ChatMessage {
    text: string;
    type: 'user' | 'ai';
    timestamp?: number;
}

// Chrome 擴充套件訊息型別
export interface ChromeMessage {
    action: 'analyze' | 'chat' | 'analyzeVocabulary';
    apiKey?: string;
    message?: string;
    history?: ChatMessage[];
}

export interface ChromeResponse {
    error?: string | undefined;
    level?: AnalysisResult['level'] | undefined;
    text?: string | undefined;
    vocabulary?: Word[] | undefined;
    response?: string | undefined;
}

// 儲存相關型別
export interface StorageData {
    apiKey?: string;
    savedAnalysis?: AnalysisResult;
    savedChat?: ChatMessage[];
    savedUrl?: string;
    accumulatedVocabulary?: Word[];
    currentPageVocabulary?: Word[];
    wordAnalysisCache?: Record<string, WordDetails>;
    audioCache?: Record<string, string>;
    darkMode?: boolean;
    storageLimit?: number;
}

// 過濾和排序選項
export interface FilterOptions {
    level?: CEFRLevel | 'all';
    sortBy?: 'alphabetical' | 'level' | 'recent';
    searchTerm?: string;
}

// API 相關型別
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

export interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
        };
    }>;
}

// D3.js 圖表相關型別
export interface GraphNode {
    id: string;
    word: string;
    type: 'main' | 'synonym' | 'antonym' | 'related';
    level?: number;
}

export interface GraphLink {
    source: string;
    target: string;
    type: string;
}

// 語音相關型別
export interface SpeechOptions {
    speed?: 'slow' | 'normal' | 'fast';
    voice?: string;
}

// 工具函數型別
export type ToastType = 'success' | 'error' | 'loading';

export interface ToastOptions {
    message: string;
    type?: ToastType;
    duration?: number;
} 