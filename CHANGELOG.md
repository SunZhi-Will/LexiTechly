# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2025-12-17

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

