/// <reference types="chrome"/>

import { showToast } from './ui.js';

export async function checkStorageLimit(newDataSize: number = 0): Promise<boolean> {
    try {
        const { storageLimit }: { storageLimit?: number } = await chrome.storage.local.get('storageLimit');
        if (!storageLimit) return true; // 無限制

        const data: StorageData = await chrome.storage.local.get(null);

        // 計算當前使用量
        const getSize = (data: any): number => new TextEncoder().encode(JSON.stringify(data)).length;
        const currentUsage = getSize(data.accumulatedVocabulary || []) +
            getSize(data.currentPageVocabulary || []) +
            getSize(data.wordAnalysisCache || {}) +
            getSize(data.audioCache || {}) +
            getSize(data.savedAnalysis || {}) +
            getSize(data.savedChat || []);

        // 檢查是否超過限制
        const limitBytes = storageLimit * 1024 * 1024;
        if ((currentUsage + newDataSize) > limitBytes) {
            showToast('已達到儲存空間上限，請清理空間或調整限制', false, true);
            return false;
        }
        return true;
    } catch (error) {
        return false;
    }
}

export async function saveData(key: string, data: any): Promise<boolean> {
    try {
        const dataSize = new TextEncoder().encode(JSON.stringify(data)).length;
        if (await checkStorageLimit(dataSize)) {
            await chrome.storage.local.set({ [key]: data });
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

export async function saveVocabulary(vocabulary: Word[]): Promise<boolean> {
    const success = await saveData('accumulatedVocabulary', vocabulary);
    if (!success) {
        showToast('儲存空間不足，無法添加新單字', false, true);
        return false;
    }
    return true;
}

export async function saveAnalysis(analysis: AnalysisResult): Promise<boolean> {
    const success = await saveData('savedAnalysis', analysis);
    if (!success) {
        showToast('儲存空間不足，無法儲存分析結果', false, true);
        return false;
    }
    return true;
}

export async function saveChat(messages: ChatMessage[]): Promise<boolean> {
    const success = await saveData('savedChat', messages);
    if (!success) {
        showToast('儲存空間不足，無法儲存聊天記錄', false, true);
        return false;
    }
    return true;
}

export async function cacheAudio(text: string, audioData: string): Promise<void> {
    try {
        const currentCache: { audioCache?: Record<string, string> } = await chrome.storage.local.get('audioCache');
        const updatedCache = {
            ...currentCache.audioCache,
            [text]: audioData
        };

        await saveData('audioCache', updatedCache);
    } catch (error) {
        // 快取音訊失敗，靜默處理
    }
}

export async function updateStorageUsage(): Promise<void> {
    try {
        const data: StorageData = await chrome.storage.local.get(null);

        // 計算各項資料大小
        const getSize = (data: any): number => new TextEncoder().encode(JSON.stringify(data)).length;

        const totalSize = getSize(data.accumulatedVocabulary || []) +
            getSize(data.currentPageVocabulary || []) +
            getSize(data.savedAnalysis || {}) +
            getSize(data.savedChat || []) +
            getSize(data.wordAnalysisCache || {}) +
            getSize(data.audioCache || {}) +
            getSize({
                apiKey: data.apiKey || '',
                speechifyApiKey: data.speechifyApiKey || '',
                darkMode: data.darkMode || false,
                storageLimit: data.storageLimit || 10
            });

        // 檢查是否有設定儲存限制
        const hasStorageLimit = data.storageLimit !== undefined && data.storageLimit > 0;
        const storageLimit = hasStorageLimit ? (data.storageLimit as number) * 1024 * 1024 : null;

        function formatSize(bytes: number): string {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        // 更新儲存狀態
        const storageStatusElement = document.getElementById('storage-status');
        if (storageStatusElement) {
            if (hasStorageLimit && storageLimit) {
                const usagePercent = (totalSize / storageLimit * 100).toFixed(1);
                storageStatusElement.textContent = `${usagePercent}% 已使用`;
            } else {
                storageStatusElement.textContent = '無限制';
            }
        }

        // 更新已使用空間
        const storageUsedElement = document.getElementById('storage-used');
        if (storageUsedElement) {
            storageUsedElement.textContent = formatSize(totalSize);
        }

        // 更新未使用空間
        const storageFreeElement = document.getElementById('storage-free');
        if (storageFreeElement) {
            if (hasStorageLimit && storageLimit) {
                const freeSpace = Math.max(0, storageLimit - totalSize);
                storageFreeElement.textContent = formatSize(freeSpace);
            } else {
                storageFreeElement.textContent = '無限制';
            }
        }

        // 更新總容量
        const storageTotalElement = document.getElementById('storage-total');
        if (storageTotalElement) {
            if (hasStorageLimit && storageLimit) {
                storageTotalElement.textContent = formatSize(storageLimit);
            } else {
                storageTotalElement.textContent = '無限制';
            }
        }

        // 更新進度條
        const storageUsedBarElement = document.getElementById('storage-used-bar');
        if (storageUsedBarElement) {
            if (hasStorageLimit && storageLimit) {
                const usagePercent = Math.min(100, (totalSize / storageLimit) * 100);
                storageUsedBarElement.style.width = `${usagePercent}%`;

                // 根據使用量改變顏色
                if (usagePercent > 90) {
                    storageUsedBarElement.style.backgroundColor = '#d32f2f';
                } else if (usagePercent > 70) {
                    storageUsedBarElement.style.backgroundColor = '#f57c00';
                } else {
                    storageUsedBarElement.style.backgroundColor = '#1a73e8';
                }
            } else {
                storageUsedBarElement.style.width = '0%';
                storageUsedBarElement.style.backgroundColor = '#e0e0e0';
            }
        }
    } catch (error) {
        // 更新儲存使用量失敗，靜默處理
    }
} 