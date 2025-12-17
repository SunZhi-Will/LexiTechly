/**
 * 管理應用程式設定的儲存和讀取
 */
export class SettingsStorage {
  // API Key 儲存鍵名
  private readonly GEMINI_API_KEY = 'apiKey';
  
  // 快取期限（毫秒）
  private readonly CACHE_EXPIRATION = 30 * 24 * 60 * 60 * 1000; // 30天
  
  /**
   * 獲取 Gemini API Key
   */
  async getGeminiApiKey(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(this.GEMINI_API_KEY);
      const apiKey = result[this.GEMINI_API_KEY];
      return (typeof apiKey === 'string' ? apiKey : null);
    } catch (error) {
      console.error('無法獲取 Gemini API Key:', error);
      return null;
    }
  }
  
  /**
   * 保存 Gemini API Key
   */
  async saveGeminiApiKey(apiKey: string): Promise<void> {
    try {
      await chrome.storage.local.set({ [this.GEMINI_API_KEY]: apiKey });
    } catch (error) {
      console.error('無法保存 Gemini API Key:', error);
      throw error;
    }
  }
  

  
  /**
   * 獲取儲存容量限制（以字節為單位）
   */
  async getStorageLimit(): Promise<number | null> {
    try {
      const result = await chrome.storage.local.get('storage_limit');
      const limit = result['storage_limit'];
      return (typeof limit === 'number' ? limit : null);
    } catch (error) {
      console.error('無法獲取儲存容量限制:', error);
      return null;
    }
  }
  
  /**
   * 設置儲存容量限制（以兆字節為單位）
   */
  async setStorageLimit(limitMB: number): Promise<void> {
    try {
      const limitBytes = limitMB * 1024 * 1024; // 轉換為字節
      await chrome.storage.local.set({ 'storage_limit': limitBytes });
    } catch (error) {
      console.error('無法設置儲存容量限制:', error);
      throw error;
    }
  }
  
  /**
   * 獲取暗色模式設定
   */
  async getDarkMode(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get('darkMode');
      return result['darkMode'] === true;
    } catch (error) {
      console.error('無法獲取暗色模式設定:', error);
      return false;
    }
  }
  
  /**
   * 設置暗色模式
   */
  async setDarkMode(enabled: boolean): Promise<void> {
    try {
      await chrome.storage.local.set({ 'darkMode': enabled });
    } catch (error) {
      console.error('無法設置暗色模式:', error);
      throw error;
    }
  }
  
  /**
   * 保存頁面分析結果
   */
  async savePageAnalysis(url: string, analysis: any): Promise<void> {
    try {
      // 獲取現有的分析快取
      const result = await chrome.storage.local.get('page_analysis_cache');
      const cacheData = result['page_analysis_cache'];
      const cache: Record<string, { data: any; timestamp: number }> = 
        (cacheData && typeof cacheData === 'object' && !Array.isArray(cacheData)) 
          ? cacheData as Record<string, { data: any; timestamp: number }> 
          : {};
      
      // 新增或更新當前頁面的分析結果
      cache[url] = {
        data: analysis,
        timestamp: Date.now()
      };
      
      // 清理過期的快取
      this.cleanExpiredCache(cache);
      
      // 保存更新後的快取
      await chrome.storage.local.set({ 'page_analysis_cache': cache });
    } catch (error) {
      console.error('無法保存頁面分析結果:', error);
      throw error;
    }
  }
  
  /**
   * 獲取頁面分析結果
   */
  async getPageAnalysis(url: string): Promise<any | null> {
    try {
      const result = await chrome.storage.local.get('page_analysis_cache');
      const cacheData = result['page_analysis_cache'];
      const cache: Record<string, { data: any; timestamp: number }> = 
        (cacheData && typeof cacheData === 'object' && !Array.isArray(cacheData)) 
          ? cacheData as Record<string, { data: any; timestamp: number }> 
          : {};
      
      // 檢查是否有該 URL 的快取
      if (cache[url]) {
        // 檢查快取是否過期
        const timestamp = cache[url].timestamp;
        if (Date.now() - timestamp < this.CACHE_EXPIRATION) {
          return cache[url].data;
        }
      }
      
      return null;
    } catch (error) {
      console.error('無法獲取頁面分析結果:', error);
      return null;
    }
  }
  
  /**
   * 清除所有設定和快取
   */
  async clearAllData(): Promise<void> {
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('無法清除所有數據:', error);
      throw error;
    }
  }
  
  /**
   * 清理過期的快取
   */
  private cleanExpiredCache(cache: Record<string, { data: any, timestamp: number }>): void {
    const now = Date.now();
    for (const url in cache) {
      if (now - cache[url].timestamp > this.CACHE_EXPIRATION) {
        delete cache[url];
      }
    }
  }
} 