/**
 * 管理音頻文件的儲存和快取
 */
export class AudioStorage {
  private readonly STORAGE_KEY_PREFIX = 'audio_cache_';
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDatabase();
  }

  /**
   * 初始化 IndexedDB 數據庫
   */
  private initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve();
        return;
      }

      const request = indexedDB.open('LexiTechlyAudioDB', 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // 創建音頻儲存對象庫
        if (!db.objectStoreNames.contains('audioFiles')) {
          db.createObjectStore('audioFiles', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        console.error('無法開啟音頻數據庫:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  /**
   * 保存音頻數據到 IndexedDB
   */
  async saveAudio(key: string, audioData: ArrayBuffer): Promise<void> {
    await this.initDatabase();
    
    if (!this.db) {
      throw new Error('數據庫未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['audioFiles'], 'readwrite');
      const store = transaction.objectStore('audioFiles');

      const id = this.STORAGE_KEY_PREFIX + key;
      const request = store.put({
        id,
        data: audioData,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 從 IndexedDB 獲取音頻數據
   */
  async getAudio(key: string): Promise<ArrayBuffer | null> {
    await this.initDatabase();
    
    if (!this.db) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['audioFiles'], 'readonly');
      const store = transaction.objectStore('audioFiles');

      const id = this.STORAGE_KEY_PREFIX + key;
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清除所有音頻快取
   */
  async clearAll(): Promise<void> {
    await this.initDatabase();
    
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['audioFiles'], 'readwrite');
      const store = transaction.objectStore('audioFiles');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取已使用的儲存空間大小（以字節為單位）
   */
  async getUsedStorage(): Promise<number> {
    await this.initDatabase();
    
    if (!this.db) {
      return 0;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['audioFiles'], 'readonly');
      const store = transaction.objectStore('audioFiles');
      const request = store.getAll();

      request.onsuccess = () => {
        let totalSize = 0;
        for (const item of request.result) {
          totalSize += item.data.byteLength;
        }
        resolve(totalSize);
      };

      request.onerror = () => reject(request.error);
    });
  }
} 