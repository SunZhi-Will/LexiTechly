# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 圖片翻譯（原本在 PostVault，移到 LexiTechly）
  - 在圖片上按右鍵選「翻譯這張圖片」，可選自動判斷、韓文、日文或中文原文，譯文會貼回圖上原本的位置
  - popup 主頁的「翻譯這頁的圖片」按鈕或快捷鍵 Alt+Shift+T 自動翻譯目前分頁的漫畫圖片，換頁或新出現的圖也會跟著翻
  - popup 顯示目前的快捷鍵；被其他擴充功能占用時顯示「未設定」並提供設定連結
  - 整本翻譯、預翻下一頁、看原文與看譯文切換
  - 支援直排文字與原文語言自動偵測
  - 文字辨識在本機完成（ppu-paddle-ocr 6.6.1 + onnxruntime-web 1.30.0 的 WASM 版），圖片不上傳
  - 翻譯來源可在設定頁選擇：Google 翻譯（預設，免 API Key）或 Gemini（用使用者的 API Key，參考整頁對白）
  - 每種原文語言第一次使用時下載約 25 到 41 MB 的辨識模型，之後存在瀏覽器裡
  - 翻過的頁存在本機（最多 3,000 張），下次直接顯示
  - 譯文語言跟著瀏覽器介面語言：繁體中文、簡體中文、日文，其餘為英文
  - 設定頁新增「圖片翻譯資料」：顯示存了幾頁譯文與模型大小，可分別清除譯文與辨識模型；「清除所有資料」也會一併清除這兩項
- 單元測試：`npm test`（圖片翻譯的 42 個測試）

### Changed
- 新增 `offscreen` 與 `alarms` 權限，以及 `translate-images` 快捷鍵指令
- 擴充功能頁面啟用跨來源隔離（COEP `credentialless`、COOP `same-origin`），讓文字辨識可以用多執行緒
- 背景頁的訊息監聽器不再回應沒有 `action` 欄位的訊息
- 隱私權政策補上圖片翻譯的資料流向
- 第一次安裝時開啟歡迎頁：說明不用設定就能用的功能，並可選擇填入 Gemini API Key（會當場測試金鑰能不能用）
- 擴充功能名稱、說明、快捷鍵說明與右鍵選單支援英文（`_locales`）；popup、單字頁與網頁上的文字仍只有繁體中文
- Gemini 文字模型改為 `gemini-3.5-flash-lite`（`gemini-2.5-flash` 於 2026-12-01 起被 Google 導向它），語音模型改為 `gemini-3.8-live`
- Gemini 的文字請求改由背景頁統一送出：API Key 放在標頭、不再出現在網址上，遇到額度限制會自動等待重試，錯誤訊息會說明是金鑰、額度還是連線問題
- 移除 `tabs` 權限；`web_accessible_resources` 只留下必要的檔案，不再對網頁公開原始碼
- 網頁不再一開始就載入 Gemini 語音元件（每頁少載入約 258 KB），第一次播放發音時才載入

### Removed
- 發音來源的「Google 翻譯（免 API Key）」選項：它用的是非官方端點。選過它的人會改用瀏覽器內建語音

### Technical
- TypeScript 4.9.5 升到 5.9.2
- 新增 GitHub Actions：每次 push 與 pull request 都會建置並跑測試
- 單元測試增加 AI 請求層與語系檔的檢查

## [1.4.1] - 2025-12-17

### Fixed
- 修復 JSON 解析錯誤：改善 AI 回應的 JSON 格式處理
  - 增強 JSON 修復邏輯，自動修復常見格式問題（缺少逗號、括號不匹配等）
  - 改善錯誤日誌，提供更詳細的診斷資訊
  - 優化 AI prompt，要求返回純 JSON 格式
- 修復 TypeScript 類型安全問題
  - 改善 Chrome Storage API 的類型處理
  - 修復 `reading-mode.ts` 中的類型斷言錯誤
  - 修復 `popup.ts` 和 `speech.ts` 中的字串類型檢查
  - 改善 `settingsStorage.ts` 中所有儲存讀取的類型安全
  - 修復 `vocabulary-page-main.ts` 中的陣列類型檢查

### Improved
- 更強大的 JSON 解析容錯能力
- 更完整的類型檢查覆蓋率
- 更詳細的錯誤訊息和診斷資訊

## [1.3.0] - 2025-12-17

### Added
- 完整 TypeScript 轉換
  - 所有模組都已轉換為 TypeScript
  - 完整的型別定義系統
  - 編譯時類型檢查
- 智慧單字列表與 AI 詞彙分析
  - 按需分析功能
  - 相似詞與反義詞分析
  - 多樣例句與中文翻譯
- 沉浸式查閱模式
  - 浮動 Logo 可拖拽移動
  - 滑鼠懸停單字自動顯示資訊
  - 精美的單字卡片顯示
- 高品質語音播放（Gemini API）
- 智慧儲存空間管理
  - 可設定儲存限制
  - 詳細使用量統計
  - 分類清除功能

### Changed
- 模組化架構重構
- 改善使用者介面設計
- 優化深色模式支援

### Technical
- TypeScript 4.6.3
- Vite 4.0.0
- 完整的型別安全保證

---

## 版本號規則

版本號格式：`主版本號.次版本號.修訂號`

- **主版本號（Major）**: 重大變更，可能不向後相容
- **次版本號（Minor）**: 新功能加入，向後相容
- **修訂號（Patch）**: Bug 修復和小改進，向後相容

