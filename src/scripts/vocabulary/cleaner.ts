/// <reference types="chrome"/>

import { saveVocabulary } from './storage.js';

// 清除單字列表中的KK音標
export async function removePhoneticFromVocabulary(): Promise<void> {
    try {
        // 獲取當前單字列表
        const { accumulatedVocabulary } = await chrome.storage.local.get('accumulatedVocabulary');
        
        if (!accumulatedVocabulary || !Array.isArray(accumulatedVocabulary)) {
            console.log('單字列表為空或不是陣列');
            return;
        }
        
        // 創建一個新的列表，移除phonetic屬性
        const cleanedVocabulary = accumulatedVocabulary.map(word => {
            const { phonetic, ...rest } = word;
            return rest;
        });
        
        // 儲存清理後的列表
        await saveVocabulary(cleanedVocabulary);
        
        console.log(`已清理 ${accumulatedVocabulary.length} 個單字的KK音標`);
    } catch (error) {
        console.error('清理單字列表KK音標失敗:', error);
    }
} 