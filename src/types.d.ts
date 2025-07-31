// 全域型別定義
type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

interface AnalysisResult {
    level: {
        level: CEFRLevel;
        analysis: {
            vocabulary: string;
            grammar: string;
            topic: string;
        };
    };
    text: string;
    error?: string;
}

interface Word {
    text: string;
    level?: string;
    translation?: string;
    example?: string;
    phonetic?: string;
    addedTime?: number;
}

interface ChatMessage {
    text: string;
    type: 'user' | 'ai';
    timestamp?: number;
}

interface StorageData {
    apiKey?: string;
    savedAnalysis?: AnalysisResult;
    savedChat?: ChatMessage[];
    savedUrl?: string;
    accumulatedVocabulary?: Word[];
    currentPageVocabulary?: Word[];
    wordAnalysisCache?: Record<string, any>;
    audioCache?: Record<string, string>;
    darkMode?: boolean;
    storageLimit?: number;
}

interface ChromeMessage {
    action: string;
    apiKey?: string;
    message?: string;
    history?: Array<{ text: string; type: 'user' | 'ai' }>;
}

interface ChromeResponse {
    error?: string;
    level?: AnalysisResult['level'];
    text?: string;
    response?: string;
    vocabulary?: Word[];
}

interface WordDetails {
    word: string;
    definitions: Array<{
        partOfSpeech: string;
        definition: string;
        translation: string;
    }>;
    examples: Array<{
        text: string;
        translation: string;
    }>;
    relatedWords: {
        synonyms: string[];
        antonyms: string[];
        related: string[];
    };
    level: string;
    phonetic?: string;
    synonyms?: string[];
    antonyms?: string[];
    usage?: string;
}

interface GeminiRequest {
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

interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
        };
    }>;
}

interface ToastOptions {
    message: string;
    isLoading?: boolean;
    isError?: boolean;
}

interface FilterOptions {
    level?: string;
    search?: string;
    sort?: string;
} 