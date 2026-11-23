<div align="center">

# Readloop

![Readloop Logo](src/assets/images/logo.png)

📖 Learn languages from the web pages and manga you read (English, Japanese, Korean, Chinese, Spanish, French, German)

[![Version](https://img.shields.io/badge/Version-1.4.1-blue.svg)](CHANGELOG.md)
[![License: Commercial](https://img.shields.io/badge/License-Commercial-red.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chrome.google.com/webstore)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

[English](README.md) | [中文](README_ZH.md)

</div>

## ✨ Features

- 📊 CEFR level analysis of web content
- 📚 Comprehensive assessment of vocabulary, grammar, and topic complexity
- 💬 Interactive AI chat for content understanding
- 📝 Smart Vocabulary List with AI Analysis
  - On-demand analysis: Only analyzes when users expand word details
  - Synonyms and antonyms analysis
  - Multiple example sentences with translations
  - Detailed usage explanations
- 🔍 **Immersive Reading Mode**
  - Floating logo in top-right corner for one-click mode toggle
  - Hover to highlight any word, then click it to see detailed information
  - Word highlighting effects for visual learning experience
  - Beautiful word cards showing: translation, part of speech, CEFR level, examples
- 🖼️ **Image Translation**
  - Right-click an image and choose "Translate this image"; the translation is drawn back in place
  - The "Translate images on this page" button in the popup (or Alt+Shift+T) auto-translates comic images and follows page turns
  - Korean, Japanese, and Chinese source text (auto-detected), including vertical text
  - Text recognition runs on your device; images are not uploaded
- 🎯 Modern User Interface
  - Beautiful Toast notification system
  - Custom confirmation dialogs
  - Smooth loading animations
- 🌙 Complete Dark Mode Support
- 🔊 High-quality Audio Playback (Gemini API)
- 💾 Smart Storage Management
  - Configurable storage limits
  - Detailed usage statistics
  - Categorized clearing functions
- ⚡ Modular Architecture Design
- 🛡️ TypeScript Type Safety

## 🛠️ Technical Architecture

### TypeScript Migration Complete
Successfully migrated from JavaScript to TypeScript, providing:

- **Type Safety**: Complete type definition system
- **Developer Experience**: IntelliSense and compile-time error detection
- **Code Quality**: Strict type checking and refactoring support
- **Modular Design**: Separation of concerns for better maintainability

### Complete Type System
- `AnalysisResult`, `CEFRLevel` - Analysis result types
- `Word`, `WordDetails` - Word-related types
- `ChatMessage`, `ChromeMessage` - Chat functionality types
- `StorageData`, `FilterOptions` - Storage-related types
- `GeminiRequest`, `GeminiResponse` - API types

### Modular Architecture
```
src/
├── scripts/
│   ├── popup/
│   │   ├── state.ts      # Global state management
│   │   ├── ui.ts         # UI utility functions
│   │   └── storage.ts    # Storage-related functionality
│   ├── vocabulary/
│   │   ├── types.ts      # Word type definitions
│   │   ├── analysis.ts   # On-demand analysis functionality
│   │   ├── word-display.ts # Word display logic
│   │   └── ...
│   ├── popup.ts          # Main popup logic
│   └── content.ts        # Content script
├── styles/
│   ├── main.css          # Main styles
│   ├── components.css    # Component styles
│   └── dark-mode.css     # Dark mode styles
└── pages/
    └── popup.html        # Main interface
```

## 🚀 Installation & Development

### Quick Installation
1. Download and extract the project ZIP file
2. Open terminal and run in the project directory:
   ```bash
   npm install
   npm run build
   ```
3. Open Chrome browser and go to `chrome://extensions/`
4. Enable `Developer mode` in the top right
5. Click `Load unpacked`
6. Select the project's `dist` folder

### Detailed Installation Steps

#### Step 1: Prepare Extension Files
Ensure you have completed the build process:
```bash
npm install    # Install project dependencies
npm run build  # Build the extension
```

After building, the `dist/` directory will contain all necessary extension files.

#### Step 2: Install in Chrome Browser
1. **Open Extension Management Page**
   - Open Chrome browser
   - Enter in address bar: `chrome://extensions/`
   - Or click the three dots in top right → More tools → Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right of the extensions page

3. **Load Extension**
   - Click the "Load unpacked" button
   - Select the `dist` folder from the project
   - Click "Select Folder"

4. **Confirm Installation**
   - The extension should appear in the extensions list
   - You'll see the Readloop icon in the browser toolbar

#### Step 3: Set Up API Keys
1. **Get Google Gemini API Key**
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Sign in with your Google account
   - Click "Create API Key"
   - Copy the generated API Key



3. **Configure API Keys in Extension**
   - Click the Readloop icon in the browser toolbar
   - Go to settings page
   - Paste your API Keys in the corresponding fields
   - Click "Save"

### Development Commands
```bash
npm install          # Install dependencies
npm run build        # Full build
npm run watch        # Watch mode development
npm run clean        # Clean output
npm run type-check   # Type checking
npm test             # Unit tests (image translation)
```

### Built File Structure
```
dist/
├── manifest.json              # Extension configuration
├── src/pages/
│   ├── popup.html            # Main interface
│   └── vocabulary.html       # Vocabulary page
├── assets/
│   ├── popup.html.*.js       # Main logic (compiled)
│   ├── vocabulary.*.js       # Vocabulary page logic
│   ├── content.ts.*.js       # Content script
│   ├── utils.*.js           # Utility functions
│   └── *.css                # Style files
├── libs/
│   └── marked.min.js        # Markdown parsing library
└── images/
    └── logo128.png          # Extension icon
```

## 📖 How to Use

### 1. Get API Keys
- **Gemini API**: Visit [Google AI Studio](https://makersuite.google.com/app/apikey)

### 2. Set Up API Keys
- Click the extension icon
- Go to settings
- Enter and save your API keys

### 3. Content Analysis
- Click the extension icon on any English webpage
- Click "Analyze Current Page"
- System will perform CEFR analysis first, then word analysis
- Review detailed analysis results

### 4. Smart Vocabulary Management
- Access vocabulary list via bottom navigation
- **On-demand Analysis**: Only analyzes when users click on words
- View detailed word information:
  - Synonyms and antonyms (with Chinese translations)
  - 3 example sentences with Chinese translations
  - Detailed usage explanations
- Support multiple filtering and sorting options
- Support English and Chinese search

### 5. AI Chat Functionality
- Access the chat interface
- Type your questions
- Receive AI-powered responses
- Support Markdown format display

### 6. Storage Management
- **Smart Limits**: Configure storage space limits
- **Detailed Statistics**: 
  - Vocabulary list, analysis cache, audio cache, chat history
  - Real-time usage display
- **Categorized Clearing**:
  - Clear audio cache
  - Clear vocabulary list
  - Clear chat history
  - Clear analysis results
  - Clear all data (preserve settings; includes image translations and recognition models)
  - Image translation data is listed separately; clear saved translations or recognition models on their own

### 7. Immersive Reading Mode 🔍
- **啟用閱讀模式**：
  - 在任何英文網頁上尋找右上角的半透明 Readloop logo
  - **🆕 可拖拽移動**: logo 現在支援拖拽功能，你可以將它移動到任何你喜歡的位置
  - 點擊 logo 可切換閱讀模式（logo 會變色以顯示狀態）
  - logo 位置會自動儲存，下次訪問時會保持在相同位置
- **即時單字查詢**：
  - 啟用閱讀模式後，將滑鼠懸停在任何英文單字上
  - 單字會立即高亮，點一下就顯示單字資訊
  - 單字會以選擇效果高亮顯示，提供視覺回饋
- **精美資訊卡片**：
  - 單字標題配有 CEFR 等級標章
  - 繁體中文翻譯
  - 詞性資訊
  - 實用例句配中文翻譯
- **便捷操作**：
  - 點擊頁面其他地方可關閉資訊卡片
  - 再次點擊 logo 可停用閱讀模式

#### ✨ 新功能亮點
- **半透明毛玻璃效果**: logo 採用現代化的半透明設計，不會遮擋網頁內容
- **智能拖拽系統**: 支援自由拖拽移動，位置會自動記憶
- **優雅的視覺回饋**: 拖拽時提供平滑的動畫效果和視覺提示
- **適應性設計**: logo 會自動限制在視窗範圍內，避免移出可視區域

### 8. Image Translation 🖼️
- **Translate one image**:
  - Right-click an image, choose "Translate this image", then pick the source language (auto-detect, Korean, Japanese, Chinese)
  - The translation is drawn over the original text; use the buttons in the top-right corner to switch between original and translation, or close it
- **Auto-translate a page**:
  - Click the Readloop toolbar icon and press "Translate images on this page" on the main tab, or press Alt+Shift+T (change it at `chrome://extensions/shortcuts`). Press again to stop
  - Comic images on the page are translated automatically, including new images after a page turn
  - The control bar in the bottom-right corner lets you change the source language, turn on "pre-translate next page", run "whole book", or stop
- **Target language**: follows the browser UI language (Traditional Chinese, Simplified Chinese, Japanese; English otherwise)
- **Translation engine**: choose it in settings under "Image translation engine"
  - Google Translate (default): no API key, fast; may be blocked briefly after many pages in a short time
  - Gemini: uses the API key from "Gemini API settings", reads the whole page of dialogue for more natural translations, subject to your Gemini quota
- **First use**:
  - A notice explains what is sent; translation starts after you press "Continue"
  - Each source language downloads about 25 to 41 MB of recognition models once
- **Privacy**: text recognition runs on your device and images are not uploaded; only the recognized text is sent to Google Translate. See the [Privacy Policy](privacy-policy.md)
- **No Gemini API Key needed by default** (only when Gemini is the translation engine)

## 🎨 User Interface Features

### Modern Toast System
- Positioned at top center, non-intrusive
- Glass morphism effects and gradient design
- Visual distinction for loading, success, error states
- Smooth animation effects

### Beautiful Confirmation Dialogs
- Replaces browser native confirm()
- Modern design style
- Support for list item display
- Complete keyboard and mouse operation

### Complete Dark Mode
- One-click theme switching
- Full component adaptation
- Comfortable night reading experience

## 🛡️ Type Safety & Quality

### TypeScript Advantages
- **Compile-time Error Detection**: Catch issues during development
- **Smart Suggestions**: Complete IntelliSense support
- **Safe Refactoring**: Ensure refactoring doesn't break functionality
- **Self-documenting**: Types serve as documentation

### Build Process
1. TypeScript compilation and checking
2. Module bundling and optimization
3. Resource copying and processing
4. Output to `dist` directory

## ⚠️ Important Notes

- 🌐 Word lookup and level ratings work in English, Japanese, Korean, Chinese, Spanish, French and German; image translation reads Korean, Japanese and Chinese
- 🔑 Valid Gemini API Key required
- 🌟 Stable internet connection recommended
- 🖼️ Image translation uses the keyless Google Translate endpoint; translating many pages in a short time may be temporarily blocked, so try again later

- 💾 Recommend setting appropriate storage limits

## 📋 Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and update notes.

**Current Version: 1.4.1** (2025-12-17)
- Fixed JSON parsing errors in AI responses
- Improved TypeScript type safety
- Enhanced error diagnostics

## 🔮 Future Development

- [x] Add unit testing (image translation)
- [ ] Set up ESLint and Prettier
- [ ] Performance optimization and caching improvements
- [ ] Multi-language support
- [ ] Advanced analysis features

## 🔧 Troubleshooting

### Common Issues

**Q: Extension fails to load**
- Ensure `dist/` directory contains all necessary files
- Check if `manifest.json` exists and is properly formatted
- Rebuild the project: `npm run build`
- Confirm Developer mode is enabled

**Q: API functionality not working**
- Ensure Google Gemini API Key is properly configured
- Check internet connection
- Verify API Key is valid and has sufficient quota
- Check browser console for error messages

**Q: Word pronunciation not working**
- Check if browser allows audio playback
- Ensure stable internet connection (requires Gemini API)
- Verify Gemini API Key is configured

**Q: Toast notifications or loading animations not displaying**
- Refresh the page and try again
- Check browser console for JavaScript errors
- Ensure extension is properly loaded

**Q: Storage-related issues**
- Check if browser has sufficient local storage space
- Try clearing some cached data
- Adjust storage limit settings

**Q: Image translation does nothing or fails**
- No "Translate this image" item: make sure you right-clicked an image, then reload the extension
- Shortcut does nothing: the popup's main tab shows the current shortcut; "not set" means another extension took it, so use "set shortcut" to pick another, or just use the button
- "Can't read this image": scroll the image into view and try again
- "Model download failed": check that huggingface.co is reachable, then try again
- "Translation service is busy": Google Translate is temporarily blocking requests or your Gemini quota ran out; try again later, or switch to Gemini when using Google Translate
- "API key is missing or invalid": the engine is Gemini; enter a valid key in "Gemini API settings", or switch image translation back to Google Translate
- Not available on `chrome://` pages or the Chrome Web Store

### Reinstallation Steps
If you encounter serious issues, try a complete reinstallation:
1. Remove the old version from `chrome://extensions/`
2. Clean and rebuild:
   ```bash
   npm run clean
   npm run build
   ```
3. Reload the `dist` folder
4. Reconfigure API Keys

### Development Debugging
Developers can use the following methods for debugging:
```bash
npm run type-check    # Check TypeScript type errors
npm run watch        # Watch mode, auto-rebuild
```

In Chrome:
- Open `chrome://extensions/`
- Find the Readloop extension
- Click "Details" → "Inspect views" to open developer tools

## 📄 License

This project is licensed under a Commercial License. All rights reserved. See the [LICENSE](LICENSE) file for details.

---

<div align="center">
Made with ❤️ and TypeScript by Sun
</div> 