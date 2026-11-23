/**
 * 設定頁用的圖片翻譯資料管理：查用量、清除譯文、清除模型快取
 *
 * 設定頁（popup）、背景頁與 offscreen 文件都是擴充功能自己的頁面，共用同一份 IndexedDB 與 Cache Storage，
 * 所以這裡直接存取，不必繞訊息。
 */

import { MODEL_CACHE, allModelFiles } from './models';
import { clearTranslations, countTranslations } from './translation-store';

export interface ImageTranslateUsage {
    /** 存下來的譯文頁數 */
    pages: number;
    /** 已下載的模型總位元組（依 models.ts 記錄的檔案大小加總） */
    modelBytes: number;
}

export async function getImageTranslateUsage(): Promise<ImageTranslateUsage> {
    const [pages, modelBytes] = await Promise.all([
        countTranslations().catch(() => 0),
        cachedModelBytes().catch(() => 0)
    ]);
    return { pages, modelBytes };
}

async function cachedModelBytes(): Promise<number> {
    if (!(await caches.has(MODEL_CACHE))) return 0;
    const cache = await caches.open(MODEL_CACHE);
    let total = 0;
    for (const file of allModelFiles()) {
        if (await cache.match(file.url)) total += file.size;
    }
    return total;
}

export function clearSavedTranslations(): Promise<void> {
    return clearTranslations();
}

/**
 * 刪掉模型快取。正在使用的 offscreen 文件記憶體裡的模型不受影響，它閒置關閉後，下次翻譯會重新下載
 */
export async function clearModelCache(): Promise<void> {
    await caches.delete(MODEL_CACHE);
}
