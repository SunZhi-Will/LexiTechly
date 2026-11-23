// 全域型別定義
// 名稱沿用舊的，實際上是各語言分級系統的等級（CEFR、JLPT、TOPIK、HSK），見 scripts/lang/languages.ts
type CEFRLevel = string;

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
    /** 分析時採用的學習語言；舊資料沒有這個欄位，視為英文 */
    lang?: string;
    error?: string;
}

interface Word {
    text: string;
    level?: string;
    translation?: string;
    example?: string;
    phonetic?: string;
    /** 這個單字的語言；舊資料沒有這個欄位，視為英文 */
    lang?: string;
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
    /** 有設定 API Key 時用 AI 分析，否則用本機規則。金鑰本身不經過訊息傳遞 */
    useAi?: boolean;
    message?: string;
    history?: Array<{ text: string; type: 'user' | 'ai' }>;
}

interface ChromeResponse {
    success?: boolean;
    error?: string;
    level?: AnalysisResult['level'];
    text?: string;
    /** 分析時採用的學習語言 */
    lang?: string;
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