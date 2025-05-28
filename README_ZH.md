<div align="center">

# LexiTechly

🔍 智慧英文內容分析擴充功能 (TypeScript 版本)

[![License: Commercial](https://img.shields.io/badge/License-Commercial-red.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chrome.google.com/webstore)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

[English](README.md) | [中文](README_ZH.md)

</div>

## ✨ 功能特色

- 📊 網頁英文內容的 CEFR 等級分析
- 📚 全方位的詞彙、語法和主題難度評估
- 💬 互動式 AI 對話功能
- 📝 智慧單字列表與 AI 詞彙分析
  - 按需分析：只在用戶點擊展開時才進行分析
  - 相似詞與反義詞分析
  - 多樣例句與中文翻譯
  - 詳細用法說明
- 🎯 現代化的使用者介面
  - 美觀的 Toast 通知系統
  - 自訂確認對話框
  - 流暢的載入動畫
- 🌙 完整深色模式支援
- 🔊 高品質語音播放（Speechify API）
- 💾 智慧儲存空間管理
  - 可設定儲存限制
  - 詳細使用量統計
  - 分類清除功能
- ⚡ 模組化架構設計
- 🛡️ TypeScript 型別安全

## 🛠️ 技術架構

### TypeScript 轉換完成
已成功從 JavaScript 轉換為 TypeScript，提供：

- **型別安全**: 完整的型別定義系統
- **開發體驗**: IntelliSense 和編譯時錯誤檢測
- **程式碼品質**: 嚴格的型別檢查和重構支援
- **模組化設計**: 分離關注點，提高可維護性

### 完整型別系統
- `AnalysisResult`, `CEFRLevel` - 分析結果型別
- `Word`, `WordDetails` - 單字相關型別
- `ChatMessage`, `ChromeMessage` - 聊天功能型別
- `StorageData`, `FilterOptions` - 儲存相關型別
- `GeminiRequest`, `GeminiResponse` - API 型別

### 模組化架構
```
src/
├── scripts/
│   ├── popup/
│   │   ├── state.ts      # 全域狀態管理
│   │   ├── ui.ts         # UI 工具函數
│   │   └── storage.ts    # 儲存相關功能
│   ├── vocabulary/
│   │   ├── types.ts      # 單字型別定義
│   │   ├── analysis.ts   # 按需分析功能
│   │   ├── word-display.ts # 單字顯示邏輯
│   │   └── ...
│   ├── popup.ts          # 主要 popup 邏輯
│   └── content.ts        # 內容腳本
├── styles/
│   ├── main.css          # 主樣式
│   ├── components.css    # 元件樣式
│   └── dark-mode.css     # 深色模式樣式
└── pages/
    └── popup.html        # 主要介面
```

## 🚀 安裝與開發

### 快速安裝
1. 下載並解壓縮專案的 ZIP 檔案
2. 開啟終端機，在專案目錄執行：
   ```bash
   npm install
   npm run build
   ```
3. 開啟 Chrome 瀏覽器，進入 `chrome://extensions/`
4. 開啟右上角的 `開發人員模式`
5. 點擊 `載入未封裝項目`
6. 選擇專案的 `dist` 資料夾

### 詳細安裝步驟

#### 步驟 1：準備擴充功能檔案
確保您已經完成建置流程：
```bash
npm install    # 安裝專案依賴
npm run build  # 建置擴充功能
```

建置完成後，`dist/` 目錄將包含所有必要的擴充功能檔案。

#### 步驟 2：在 Chrome 瀏覽器中安裝
1. **開啟擴充功能管理頁面**
   - 開啟 Chrome 瀏覽器
   - 在網址列輸入：`chrome://extensions/`
   - 或者點選右上角的三個點 → 更多工具 → 擴充功能

2. **啟用開發者模式**
   - 在擴充功能頁面的右上角，開啟「開發人員模式」開關

3. **載入擴充功能**
   - 點選「載入未封裝項目」按鈕
   - 選擇專案中的 `dist` 資料夾
   - 點選「選取資料夾」

4. **確認安裝**
   - 擴充功能應該會出現在擴充功能列表中
   - 您會在瀏覽器工具列看到 LexiTechly 圖示

#### 步驟 3：設定 API Keys
1. **取得 Google Gemini API Key**
   - 前往 [Google AI Studio](https://makersuite.google.com/app/apikey)
   - 登入您的 Google 帳戶
   - 點選「Create API Key」
   - 複製產生的 API Key

2. **取得 Speechify API Key（可選）**
   - 前往 [Speechify Console](https://console.sws.speechify.com/tts)
   - 登入您的帳戶
   - 複製產生的 API Key

3. **在擴充功能中設定 API Keys**
   - 點選瀏覽器工具列的 LexiTechly 圖示
   - 進入設定頁面
   - 在對應欄位中貼上您的 API Keys
   - 點選「儲存」

### 開發指令
```bash
npm install          # 安裝依賴
npm run build        # 完整建置
npm run watch        # 監視模式開發
npm run clean        # 清理輸出
npm run type-check   # 型別檢查
```

### 建置後檔案結構
```
dist/
├── manifest.json              # 擴充功能配置檔
├── src/pages/
│   ├── popup.html            # 主要介面
│   └── vocabulary.html       # 單字頁面
├── assets/
│   ├── popup.html.*.js       # 主要邏輯（已編譯）
│   ├── vocabulary.*.js       # 單字頁面邏輯
│   ├── content.ts.*.js       # 內容腳本
│   ├── utils.*.js           # 工具函數
│   └── *.css                # 樣式檔案
├── libs/
│   └── marked.min.js        # Markdown 解析庫
└── images/
    └── icon128.png          # 擴充功能圖示
```

## 📖 使用方法

### 1. 取得 API Key
- **Gemini API**: 前往 [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Speechify API** (可選): 前往 [Speechify Console](https://console.sws.speechify.com/tts)

### 2. 設定 API Key
- 點擊擴充功能圖示
- 進入設定頁面
- 輸入並儲存 API Key

### 3. 內容分析
- 在任何英文網頁點擊擴充功能圖示
- 點擊「分析當前頁面」
- 系統會先進行 CEFR 分析，再分析單字
- 查看詳細的分析結果

### 4. 智慧單字管理
- 透過底部導航進入單字列表
- **按需分析**: 只有在點擊單字時才進行詳細分析
- 查看單字詳細資訊：
  - 相似詞與反義詞（含中文翻譯）
  - 3個例句及中文翻譯
  - 詳細用法說明
- 支援多種篩選和排序方式
- 支援中英文搜尋

### 5. AI 對話功能
- 進入對話介面
- 輸入您的問題
- 獲得 AI 智慧回答
- 支援 Markdown 格式顯示

### 6. 儲存空間管理
- **智慧限制**: 可設定儲存空間上限
- **詳細統計**: 
  - 單字列表、分析快取、語音快取、對話記錄
  - 實時使用量顯示
- **分類清除**:
  - 清除語音快取
  - 清除單字列表
  - 清除聊天記錄
  - 清除分析結果
  - 清除所有資料（保留設定）

## 🎨 使用者介面特色

### 現代化 Toast 系統
- 位於頂部中央，不遮擋重要內容
- 玻璃擬態效果和漸層設計
- 載入、成功、錯誤狀態的視覺區分
- 流暢的動畫效果

### 美觀的確認對話框
- 取代瀏覽器原生 confirm()
- 現代化設計風格
- 支援列表項目顯示
- 完整的鍵盤和滑鼠操作

### 完整深色模式
- 一鍵切換深淺主題
- 所有元件完整適配
- 舒適的夜間閱讀體驗

## 🛡️ 型別安全與品質

### TypeScript 優勢
- **編譯時錯誤檢測**: 在開發階段發現問題
- **智慧提示**: 完整的 IntelliSense 支援
- **安全重構**: 確保重構不會破壞功能
- **自文件化**: 型別即文件

### 建置流程
1. TypeScript 編譯檢查
2. 模組打包和優化
3. 資源複製和處理
4. 輸出到 `dist` 目錄

## ⚠️ 注意事項

- 🌐 僅支援英文內容分析
- 🔑 需要有效的 Gemini API Key
- 🌟 建議在網路連線穩定時使用
- 📱 Speechify API 為可選功能
- 💾 建議設定適當的儲存空間限制

## 🔮 未來發展

- [ ] 添加單元測試
- [ ] 設定 ESLint 和 Prettier
- [ ] 效能優化和快取改進
- [ ] 更多語言支援
- [ ] 進階分析功能

## 🔧 疑難排解

### 常見問題

**Q: 擴充功能無法載入**
- 確認 `dist/` 目錄包含所有必要檔案
- 檢查 `manifest.json` 是否存在且格式正確
- 重新建置專案：`npm run build`
- 確認已啟用開發人員模式

**Q: API 功能無法使用**
- 確認已正確設定 Google Gemini API Key
- 檢查網路連線是否正常
- 確認 API Key 有效且有足夠的配額
- 檢查瀏覽器控制台是否有錯誤訊息

**Q: 單字發音功能無法使用**
- 檢查瀏覽器是否允許音訊播放
- 確認網路連線正常（需要連接 Speechify API）
- 確認已設定 Speechify API Key（如果使用的話）

**Q: Toast 通知或載入動畫無法顯示**
- 重新整理頁面並重試
- 檢查瀏覽器控制台是否有 JavaScript 錯誤
- 確認擴充功能已正確載入

**Q: 儲存空間相關問題**
- 檢查瀏覽器的本地儲存空間是否足夠
- 嘗試清除部分快取資料
- 調整儲存空間限制設定

### 重新安裝步驟
如果遇到嚴重問題，可以嘗試完全重新安裝：
1. 在 `chrome://extensions/` 中移除舊版本
2. 清理並重新建置：
   ```bash
   npm run clean
   npm run build
   ```
3. 重新載入 `dist` 資料夾
4. 重新設定 API Keys

### 開發除錯
開發者可以使用以下方法進行除錯：
```bash
npm run type-check    # 檢查 TypeScript 型別錯誤
npm run watch        # 監視模式，自動重新建置
```

在 Chrome 中：
- 打開 `chrome://extensions/`
- 找到 LexiTechly 擴充功能
- 點擊「詳細資料」→「檢查檢視畫面」來開啟開發者工具

## 📄 授權條款

本專案採用商業授權條款 - 版權所有，詳見 [LICENSE](LICENSE) 檔案

---

<div align="center">
由 Sun 用 ❤️ 和 TypeScript 打造
</div> 