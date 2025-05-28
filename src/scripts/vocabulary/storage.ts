/// <reference types="chrome"/>

import { Word, WordDetails, StorageData } from './types.js';

// 全域變數
export let accumulatedVocabulary: Word[] = [];
export let currentPageVocabulary: Word[] = [];
export let wordAnalysisCache: Record<string, WordDetails> = {};
export let audioCache: Record<string, string> = {};

// 從 chrome.storage 讀取單字資料
export async function loadVocabulary(): Promise<Word[]> {
    const storageData: StorageData = await chrome.storage.local.get([
        'accumulatedVocabulary',
        'currentPageVocabulary',
        'wordAnalysisCache',
        'audioCache'
    ]);

    // 載入已儲存的資料
    if (storageData.accumulatedVocabulary) {
        accumulatedVocabulary = storageData.accumulatedVocabulary.map(word => ({
            ...word,
            addedTime: word.addedTime || Date.now()
        }));
    }

    if (storageData.currentPageVocabulary) {
        currentPageVocabulary = storageData.currentPageVocabulary.map(word => ({
            ...word,
            addedTime: word.addedTime || Date.now()
        }));
    }

    if (storageData.wordAnalysisCache) {
        wordAnalysisCache = storageData.wordAnalysisCache;
    }

    if (storageData.audioCache) {
        // 將儲存的 base64 資料轉換為 Blob URL
        audioCache = {};
        for (const [text, audioData] of Object.entries(storageData.audioCache)) {
            try {
                const audioDataString = typeof audioData === 'string'
                    ? audioData
                    : JSON.stringify(audioData);

                const audioBlob = await fetch(`data:audio/mp3;base64,${audioDataString}`).then(r => r.blob());
                audioCache[text] = URL.createObjectURL(audioBlob);
            } catch (error) {
                console.warn('音訊資料轉換失敗:', error);
                delete storageData.audioCache[text];
            }
        }
        await chrome.storage.local.set({ audioCache: storageData.audioCache });
    }

    // 合併並去重
    const allWords = [...accumulatedVocabulary];
    currentPageVocabulary.forEach(word => {
        if (!allWords.some(w => w && w.text && word && word.text &&
            w.text.toLowerCase() === word.text.toLowerCase())) {
            allWords.push(word);
        }
    });

    return allWords;
}

// 檢查儲存空間是否超過限制
export async function checkStorageLimit(newDataSize: number = 0): Promise<boolean> {
    try {
        const { storageLimit }: { storageLimit?: number } = await chrome.storage.local.get('storageLimit');
        if (!storageLimit) return true;

        const data: StorageData = await chrome.storage.local.get(null);
        const getSize = (data: any): number => new TextEncoder().encode(JSON.stringify(data)).length;
        const currentUsage = getSize(data.accumulatedVocabulary || []) +
            getSize(data.currentPageVocabulary || []) +
            getSize(data.wordAnalysisCache || {}) +
            getSize(data.audioCache || {}) +
            getSize(data.savedAnalysis || {}) +
            getSize(data.savedChat || []);

        const limitBytes = storageLimit * 1024 * 1024;
        if ((currentUsage + newDataSize) > limitBytes) {
            console.warn('已達到儲存空間上限，請清理空間或調整限制');
            return false;
        }
        return true;
    } catch (error) {
        console.error('檢查儲存空間失敗:', error);
        return false;
    }
}

// 儲存資料
export async function saveData(key: string, data: any): Promise<boolean> {
    try {
        const dataSize = new TextEncoder().encode(JSON.stringify(data)).length;
        if (await checkStorageLimit(dataSize)) {
            await chrome.storage.local.set({ [key]: data });
            return true;
        }
        return false;
    } catch (error) {
        console.error('儲存資料失敗:', error);
        return false;
    }
}

// 儲存單字列表
export async function saveVocabulary(words: Word[]): Promise<boolean> {
    const success = await saveData('accumulatedVocabulary', words);
    if (!success) {
        console.warn('儲存空間不足，無法添加新單字');
        return false;
    }
    accumulatedVocabulary = words;
    return true;
}

// 音訊快取儲存
export async function cacheAudioData(text: string, audioData: string): Promise<boolean> {
    try {
        const { audioCache: savedCache = {} }: { audioCache?: Record<string, string> } = await chrome.storage.local.get('audioCache');
        const newCache = { ...savedCache, [text]: audioData };
        const dataSize = new TextEncoder().encode(JSON.stringify(newCache)).length;

        if (!(await checkStorageLimit(dataSize))) {
            console.warn('儲存空間不足，無法快取語音');
            return false;
        }

        await chrome.storage.local.set({ audioCache: newCache });
        return true;
    } catch (error) {
        console.error('快取音訊失敗:', error);
        return false;
    }
}

// 清除單字列表
export function clearVocabulary(): void {
    accumulatedVocabulary = [];
    currentPageVocabulary = [];
    wordAnalysisCache = {};

    Object.values(audioCache).forEach(url => {
        URL.revokeObjectURL(url);
    });
    audioCache = {};

    chrome.storage.local.remove([
        'accumulatedVocabulary',
        'currentPageVocabulary',
        'wordAnalysisCache',
        'audioCache'
    ]);
} 