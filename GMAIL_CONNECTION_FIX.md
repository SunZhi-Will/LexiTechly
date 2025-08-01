# Gmail 連接問題解決方案

## 問題描述

在 Gmail 頁面上使用 LexiTechly 擴充功能時，出現以下錯誤：
```
Could not establish connection. Receiving end does not exist.
```

## 問題原因

這個錯誤是 Chrome 擴充功能開發中的常見問題，主要原因包括：

1. **Content Script 嘗試與未開啟的 Popup 通訊**
2. **Gmail 等特殊頁面的安全限制**
3. **缺少 Background Script 來處理訊息通訊**
4. **Chrome 擴充功能 API 版本相容性問題**

## 解決方案

### 1. 添加 Background Script

創建了 `src/scripts/background.ts` 來處理擴充功能的訊息通訊：

```typescript
// 監聽來自 content scripts 和 popup 的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 處理切換到單字列表頁面的請求
    if (message.action === 'switchToVocabularyPage') {
        // 構建 URL，包含單字參數
        let vocabularyUrl = chrome.runtime.getURL('src/pages/vocabulary.html');
        if (message.word && message.word.trim()) {
            const wordParam = encodeURIComponent(message.word.trim());
            vocabularyUrl += `?word=${wordParam}`;
        }
        
        // 直接打開單字列表頁面，不需要先開啟 popup
        chrome.tabs.create({ url: vocabularyUrl });
    }
});
```

### 2. 更新 Manifest.json

添加了 background script 配置：

```json
{
    "background": {
        "service_worker": "src/scripts/background.ts"
    }
}
```

### 3. 改進 Content Script 錯誤處理

在 `src/scripts/content/reading-mode.ts` 中添加了：

- **重試機制**：最多重試 3 次
- **超時處理**：5 秒超時
- **Gmail 特殊處理**：針對 Gmail 頁面的特殊錯誤訊息
- **降級策略**：如果 background script 不可用，嘗試直接與 popup 通訊
- **直接開啟**：直接在新標籤頁開啟單字列表，無需先開啟 popup
- **單字傳遞**：將當前選中的單字傳遞到單字列表頁面

### 4. 單字列表頁面自動定位

在 `src/scripts/vocabulary-page-main.ts` 中添加了：

- **URL 參數解析**：解析 URL 中的單字參數
- **自動搜尋**：自動設置搜尋篩選器
- **滾動定位**：自動滾動到對應的單字卡片
- **高亮效果**：為目標單字添加視覺高亮效果
- **自動開啟**：自動點擊並開啟單字的詳細頁面

### 5. 更新套件版本

更新了關鍵套件到最新版本：

```bash
npm install @crxjs/vite-plugin@latest @google/genai@latest @types/chrome@latest
npm install vite@^4.0.0
```

## 技術細節

### Background Script 功能

1. **訊息路由**：處理來自 content scripts 的訊息
2. **直接開啟**：直接在新標籤頁開啟單字列表頁面
3. **標籤頁管理**：創建新標籤頁顯示單字列表
4. **錯誤處理**：提供詳細的錯誤訊息和降級策略
5. **單字傳遞**：通過 URL 參數傳遞單字資訊

### Content Script 改進

1. **重試邏輯**：自動重試失敗的訊息發送
2. **超時機制**：防止無限等待
3. **錯誤分類**：根據不同錯誤類型提供相應的用戶提示
4. **Gmail 檢測**：識別 Gmail 頁面並提供特殊處理
5. **用戶體驗**：一次點擊即可開啟單字列表
6. **單字獲取**：獲取當前選中或游標所在的單字

### 單字列表頁面功能

1. **URL 參數處理**：解析 `?word=單字` 參數
2. **自動搜尋**：自動設置搜尋篩選器並過濾結果
3. **視覺定位**：滾動到對應的單字卡片
4. **高亮動畫**：為目標單字添加脈衝高亮效果
5. **自動點擊**：自動點擊單字卡片開啟詳細頁面
6. **用戶反饋**：顯示成功或失敗的提示訊息

## 使用說明

### 在 Gmail 頁面上使用

1. **直接使用**：在 Gmail 頁面上直接點擊單字查詢功能
2. **自動開啟**：單字列表會自動在新標籤頁中開啟
3. **自動定位**：頁面會自動滾動到對應的單字並高亮顯示
4. **無需額外步驟**：不需要先點擊擴充功能圖示

### 功能流程

1. **選中單字**：在網頁上選中或點擊單字
2. **點擊查詢**：點擊單字查詢按鈕
3. **自動開啟**：系統自動在新標籤頁開啟單字列表
4. **自動定位**：頁面自動滾動到對應單字並高亮顯示
5. **自動開啟詳細頁面**：系統自動點擊單字卡片，開啟詳細資訊頁面
6. **查看詳情**：可以直接查看該單字的完整分析結果

### 錯誤處理

如果仍然遇到問題：

1. **重新整理頁面**：按 F5 重新整理 Gmail 頁面
2. **重新載入擴充功能**：在 `chrome://extensions/` 中重新載入擴充功能
3. **檢查權限**：確保擴充功能有足夠的權限

## 相容性

- **Chrome 88+**：支援 Manifest V3
- **Gmail**：特殊處理 Gmail 頁面的限制
- **其他網站**：正常支援所有網站

## 更新日誌

- **2025-01-XX**：添加 Background Script 支援
- **2025-01-XX**：改進錯誤處理和重試機制
- **2025-01-XX**：更新套件版本以解決相容性問題
- **2025-01-XX**：優化用戶體驗，直接開啟單字列表頁面
- **2025-01-XX**：添加自動定位功能，直接開啟對應單字

## 參考資料

- [Chrome Extension Messaging](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Service Workers in Extensions](https://developer.chrome.com/docs/extensions/mv3/service_workers/)