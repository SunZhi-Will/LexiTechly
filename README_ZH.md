# LexiTechly

[English](README.md) | [中文](README_ZH.md)

LexiTechly 是一個智慧型 Chrome 擴充功能，使用 Google Gemini AI 來分析網頁內容的英文程度。

## 功能特點

- 分析網頁英文內容的 CEFR 等級
- 提供詞彙、語法和主題的難度評估
- 支援 AI 對話功能，協助理解內容
- 簡潔直觀的使用者介面
- 支援暗色模式

## 安裝方式

1. 下載此專案的 ZIP 檔案並解壓縮
2. 開啟 Chrome 瀏覽器，進入擴充功能管理頁面 (chrome://extensions/)
3. 開啟右上角的「開發人員模式」
4. 點擊「載入未封裝項目」
5. 選擇解壓縮後的資料夾

## 使用方法

1. 取得 Gemini API Key
   - 前往 [Google AI Studio](https://makersuite.google.com/app/apikey)
   - 登入 Google 帳號
   - 點擊「Get API key」按鈕
   - 複製產生的 API Key

2. 設定 API Key
   - 點擊擴充功能圖示
   - 進入設定頁面
   - 輸入並儲存 API Key

3. 分析網頁
   - 在任何英文網頁點擊擴充功能圖示
   - 點擊「分析當前頁面」
   - 查看分析結果

4. AI 對話
   - 點擊底部導航列的「對話」
   - 輸入問題
   - 獲得 AI 回答

## 技術說明

- 使用 Google Gemini AI API 進行內容分析
- 支援 Markdown 格式的 AI 回答
- 自動保存分析結果和對話記錄
- 支援頁面切換時的狀態保持

## 注意事項

- 僅支援英文內容的分析
- 需要有效的 Gemini API Key
- 建議在網路連線穩定時使用

## 授權條款

MIT License 