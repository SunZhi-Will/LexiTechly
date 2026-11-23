/**
 * 本機譯文儲存（背景頁的 IndexedDB，只存在使用者自己的電腦）
 *
 * 翻好的頁存起來，下次打開同一部漫畫直接貼上，不用再擷取、辨識、翻譯（也少打翻譯服務，比較不會被擋）。
 * 鍵是「譯文語言 + 圖片網址去掉主機」（見 protocol.ts 的 translationKey）；存的是當時擷取的圖（壓成 JPEG）、
 * 每個區塊的原文與譯文。內容腳本的 IndexedDB 是宿主網站的，不能用，所以一律透過訊息由背景頁存取。
 */

import type { TranslatedImage } from './protocol';

// 沿用改名前（LexiTechly）的資料庫名稱：改掉會讓已存的譯文消失
const DB_NAME = 'lexitechly-image-translations';
const STORE = 'pages';
// 最多存這麼多頁；超過時刪掉最舊的（一頁約 200 KB）
const MAX_ENTRIES = 3000;
const PRUNE_BATCH = 200;
// 辨識流程有明顯改進時加一：用舊版存的頁當作沒翻過，下次看到時重翻
// 2：整頁找字不再先縮小（舊版小字常漏字）
const ENGINE_VERSION = 2;

interface StoredPage {
    key: string;
    savedAt: number;
    // 存的時候的辨識版本；舊資料沒有這個欄位
    engine?: number;
    result: Omit<TranslatedImage, 'requestId' | 'diagnostics'>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
                store.createIndex('savedAt', 'savedAt');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                dbPromise = null;
                reject(request.error);
            };
        });
    }
    return dbPromise;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function loadTranslation(key: string): Promise<StoredPage['result'] | null> {
    const db = await open();
    const stored = (await wrap(db.transaction(STORE).objectStore(STORE).get(key))) as StoredPage | undefined;
    return stored && stored.engine === ENGINE_VERSION ? stored.result : null;
}

/** 存了幾頁（設定頁顯示用） */
export async function countTranslations(): Promise<number> {
    const db = await open();
    return wrap(db.transaction(STORE).objectStore(STORE).count());
}

/** 刪掉所有存下來的譯文（設定頁的清除按鈕）；只清內容不刪資料庫，背景頁開著的連線不受影響 */
export async function clearTranslations(): Promise<void> {
    const db = await open();
    await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
}

export async function saveTranslation(key: string, result: TranslatedImage): Promise<void> {
    const db = await open();
    const { requestId: _requestId, diagnostics: _diagnostics, ...rest } = result;
    const page: StoredPage = { key, savedAt: Date.now(), engine: ENGINE_VERSION, result: rest };
    await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).put(page));
    await prune(db);
}

async function prune(db: IDBDatabase): Promise<void> {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const count = await wrap(store.count());
    if (count <= MAX_ENTRIES) return;
    // 由舊到新刪掉一批
    let toDelete = count - MAX_ENTRIES + PRUNE_BATCH;
    await new Promise<void>((resolve, reject) => {
        const cursorRequest = store.index('savedAt').openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor || toDelete <= 0) {
                resolve();
                return;
            }
            cursor.delete();
            toDelete--;
            cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
}
