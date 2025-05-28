/// <reference types="chrome"/>

// 全域狀態管理
export let lastAnalysisResult: AnalysisResult | null = null;
export let chatHistory: ChatMessage[] = [];
export let currentTabUrl: string = '';
export let accumulatedVocabulary: Word[] = [];
export let currentPageVocabulary: Word[] = [];
export let wordAnalysisCache: Record<string, WordDetails> = {};
export let audioCache: Record<string, string> = {};
export let currentAudio: HTMLAudioElement | null = null;
export let lastPlayedText: string | null = null;
export let lastPlayedSpeed: 'slow' | 'normal' | 'fast' = 'normal';

// 狀態更新函數
export function setLastAnalysisResult(result: AnalysisResult | null): void {
    lastAnalysisResult = result;
}

export function setChatHistory(history: ChatMessage[]): void {
    chatHistory = history;
}

export function addChatMessage(message: ChatMessage): void {
    chatHistory.push(message);
}

export function setCurrentTabUrl(url: string): void {
    currentTabUrl = url;
}

export function setAccumulatedVocabulary(vocabulary: Word[]): void {
    accumulatedVocabulary = vocabulary;
}

export function setCurrentPageVocabulary(vocabulary: Word[]): void {
    currentPageVocabulary = vocabulary;
}

export function addToAccumulatedVocabulary(words: Word[]): void {
    words.forEach(newWord => {
        const exists = accumulatedVocabulary.some(existingWord =>
            existingWord.text.toLowerCase() === newWord.text.toLowerCase()
        );
        if (!exists) {
            accumulatedVocabulary.push(newWord);
        }
    });
}

export function clearAllVocabulary(): void {
    accumulatedVocabulary = [];
    currentPageVocabulary = [];
}

export function setWordAnalysisCache(cache: Record<string, WordDetails>): void {
    wordAnalysisCache = cache;
}

export function setAudioCache(cache: Record<string, string>): void {
    audioCache = cache;
}

export function clearAudioCacheMemory(): void {
    Object.values(audioCache).forEach(url => {
        if (typeof url === 'string') {
            URL.revokeObjectURL(url);
        }
    });
    audioCache = {};
}

export function resetAllState(): void {
    lastAnalysisResult = null;
    chatHistory = [];
    accumulatedVocabulary = [];
    currentPageVocabulary = [];
    wordAnalysisCache = {};
    audioCache = {};
    currentAudio = null;
    lastPlayedText = null;
    lastPlayedSpeed = 'normal';
} 