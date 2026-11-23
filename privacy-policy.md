# LexiTechly Privacy Policy & 隱私權政策

*Last Updated: November 2026*  
*最後更新日期：2026年11月*

[English](#english) | [中文](#中文)

# English

## Introduction

Welcome to LexiTechly. We value your privacy and are committed to protecting your personal data. This Privacy Policy explains how we handle your information. Important note: This extension is designed as a frontend-only application. We do not run any servers, and your data is stored locally in your browser. Some features send content directly from your browser to third-party services (see "Third-Party Services" and "Image Translation" below).

## Data Collection and Usage

### Locally Stored Information
The following data is stored only in your browser:
- Webpage English content analysis results (for CEFR level analysis)
- Your personal vocabulary list and learning records
- Your AI conversation history
- Your user settings (e.g., API Key, interface preferences)
- Audio playback cache files
- Analysis result cache files
- Image translation: text recognition models, saved translations, and related preferences (see "Image Translation" below)

### Future Local Storage Possibilities
If collected in the future, the following data will also be stored only in your browser:
- Web page records (page titles, URLs, visit times)
- User activities (clicks, mouse movements, keyboard inputs)
- Website content (text, images, hyperlinks)

### Data Usage
Your local data is used only for:
- Providing CEFR level analysis
- Generating vocabulary, grammar, and topic difficulty assessments
- Providing AI conversation services
- Managing personal vocabulary lists
- Providing audio playback functionality
- Optimizing user interface
- Supporting dark mode
- Translating text inside images

## Image Translation

Image translation runs only when you start it: by right-clicking an image and choosing "Translate this image", or by pressing "Translate images on this page" in the popup or the shortcut (Alt+Shift+T by default) to auto-translate comic images on the current tab. It never runs in the background on pages you have not asked it to translate.

- **Text recognition (OCR) happens on your device.** The image itself is not uploaded. To read the image, the extension fetches it from its original URL without your cookies, or, if that is not possible, captures the visible part of the current tab and crops out the image.
- **Recognized text is sent to the translation service you choose.** In settings, under "Image translation engine", you choose Google Translate (the default) or Gemini.
  - Google Translate: only the text found in the image, the source language, and the target language are sent to `translate.googleapis.com`. No API key, account, or page address is attached by the extension.
  - Gemini: the same text and languages are sent to the Gemini API (`generativelanguage.googleapis.com`) with the API key you entered, as with LexiTechly's other Gemini features.
  - In both cases the image itself is not sent. As with any web request, Google receives your IP address, and its handling of the request is governed by Google's own privacy policy and, for Gemini, the Gemini API terms.
- **Recognition models are downloaded from Hugging Face.** The first time you use each source language, about 25 to 41 MB of model files are downloaded from `huggingface.co`, verified against a fixed checksum, and cached in your browser. This request does not include any information about the images or pages you translate.
- **Translations are saved locally.** So that the same page does not need to be translated again, the extension keeps up to 3,000 translated images in your browser (a compressed copy of the image, the recognized text, and the translation), removing the oldest ones first. It also remembers that you accepted the first-use notice, the source language you chose per website, and the "pre-translate next page" switch.
- **Removing this data.** In settings, under "Image translation data", you can see how many translations are saved and how much space the models use, and clear either one with its own button. The "clear all data" button in settings also clears both, and they are removed when you uninstall the extension.

## User Controls

- You can manage storage space in settings at any time
- You can view detailed storage usage statistics
- You can clear all stored data with one click (keeping API Key and appearance settings), including saved image translations and recognition models
- You can clear saved image translations and downloaded recognition models separately
- You can choose not to authorize data collection

## Permission Details

The extension requests the following permissions:
- storage: For local storage of settings and vocabulary records
- unlimitedStorage: Provides unlimited local storage space
- activeTab: Accesses current webpage content for analysis
- scripting: Executes webpage analysis scripts
- tabs: Records browsing pages
- Website access: Provides English content analysis
- contextMenus: Adds the "look up selection" and "translate this image" right-click items
- offscreen: Runs on-device text recognition for image translation in a hidden extension page
- alarms: Closes that hidden page after it has been idle for a few minutes to free memory

## Data Storage and Security

- All data is stored in your local browser
- We do not operate any servers and do not collect your personal data
- Content is sent to third-party services only as described in "Third-Party Services" and "Image Translation"
- You can view and clean data through storage management features

## Third-Party Services

- Google Gemini API: For AI analysis and conversation features, and for image translation when you choose Gemini as its engine
- Google Gemini API: Provides word and sentence audio playback
- API Keys are provided by users and we do not store or share them
- Google Translate: Translates the text recognized in images when it is the image translation engine (the default)
- Hugging Face: Hosts the text recognition models downloaded on first use of image translation

## Children's Privacy

Our service is not targeted at children under 13. We do not knowingly collect personal information from children.

## Policy Updates

We may update this Privacy Policy periodically. We will notify you of significant changes through the extension.

## Contact Us

If you have any questions about this Privacy Policy, please contact us:
- GitHub Issues: [LexiTechly GitHub Repository](https://github.com/SunZhi-Will)
- Email: sun055676@gmail.com

Using this extension indicates your agreement to this Privacy Policy.

---

# 中文

## 簡介

歡迎使用 LexiTechly。我們重視您的隱私權，並致力於保護您的個人資料。本隱私權政策說明我們如何收集、使用和保護您的資訊。特別說明：本擴充功能採用純前端設計，我們沒有自己的伺服器，您的資料儲存於您的本地瀏覽器中。部分功能會由您的瀏覽器直接把內容送到第三方服務（見下方「第三方服務」與「圖片翻譯」）。

## 資料收集與使用

### 本地儲存的資訊
以下資料僅儲存在您的瀏覽器中：
- 網頁英文內容的分析結果（用於 CEFR 等級分析）
- 您的個人詞彙列表與學習記錄
- 您與 AI 的對話記錄
- 您的使用者設定（如 API Key、介面偏好）
- 語音播放的暫存檔案
- 分析結果的暫存檔案
- 圖片翻譯：文字辨識模型、存下來的譯文與相關偏好設定（見下方「圖片翻譯」）

### 未來可能在本地儲存的資訊
以下資料如果收集，也將只會儲存在您的瀏覽器中：
- 網頁記錄（網頁標題、網址、造訪時間）
- 使用者活動（點擊、滑鼠滑動、鍵盤輸入等）
- 網站內容（網頁內的文字、圖片、超連結）

### 資料使用方式
您的本地資料僅用於：
- 提供 CEFR 等級分析
- 生成詞彙、語法和主題難度評估
- 提供 AI 對話服務
- 管理個人單字列表
- 提供語音播放功能
- 優化使用者介面
- 提供深色模式支援
- 翻譯圖片中的文字

## 圖片翻譯

圖片翻譯只在您主動啟動時才會執行：在圖片上按右鍵選「翻譯這張圖片」，或在 popup 按「翻譯這頁的圖片」、按快捷鍵（預設 Alt+Shift+T）自動翻譯目前分頁的漫畫圖片。您沒有要求翻譯的網頁，它不會在背景執行。

- **文字辨識（OCR）在您的電腦上完成。** 圖片本身不會上傳。為了讀取圖片，擴充功能會在不帶您的 Cookie 的情況下，從圖片原本的網址抓取；抓不到時，改為擷取目前分頁看得到的畫面，再裁出那張圖。
- **辨識出的文字會送到您選擇的翻譯服務。** 在設定頁的「圖片翻譯來源」可以選 Google 翻譯（預設）或 Gemini。
  - Google 翻譯：只有圖片中辨識出的文字、原文語言與目標語言會送到 `translate.googleapis.com`，擴充功能不會附上任何 API Key、帳號或網頁網址。
  - Gemini：同樣的文字與語言會連同您填入的 API Key 送到 Gemini API（`generativelanguage.googleapis.com`），和 LexiTechly 其他 Gemini 功能相同。
  - 兩種方式都不會送出圖片本身。和所有網路請求一樣，Google 會收到您的 IP 位址，後續處理依 Google 的隱私權政策，Gemini 另依 Gemini API 的服務條款。
- **辨識模型從 Hugging Face 下載。** 每種原文語言第一次使用時，會從 `huggingface.co` 下載約 25 到 41 MB 的模型檔，比對固定的雜湊值後存在您的瀏覽器裡。這個請求不包含您翻譯的圖片或網頁的任何資訊。
- **譯文存在本機。** 為了讓同一頁不必重翻，擴充功能會在您的瀏覽器中保存最多 3,000 張翻譯過的圖（壓縮後的圖片、辨識出的原文與譯文），超過時先刪最舊的。另外會記住您已看過第一次使用的說明、您為各網站選的原文語言，以及「預翻下一頁」開關。
- **如何移除這些資料。** 在設定頁的「圖片翻譯資料」可以看到存了幾頁譯文、模型占多少空間，並用各自的按鈕清除。設定裡的「清除所有資料」按鈕也會一併清除這兩項，移除擴充功能時同樣會刪除。

## 使用者控制權限

- 您可以隨時在設定中管理儲存空間
- 您可以查看詳細的儲存空間使用狀況
- 您可以一鍵清除所有儲存資料（保留 API Key 和外觀設定），包含圖片譯文與辨識模型
- 您可以分別清除存下來的圖片譯文與已下載的辨識模型
- 您可以選擇不提供數據授權

## 權限說明

擴充功能請求以下權限：
- storage：用於本地存儲設定和單字記錄
- unlimitedStorage：提供無限制的本地儲存空間
- activeTab：存取當前網頁內容進行分析
- scripting：執行網頁分析腳本
- tabs：記錄瀏覽網頁
- 網站存取權限：提供英文內容分析
- contextMenus：加入「查詢選取文字」與「翻譯這張圖片」的右鍵選單
- offscreen：在擴充功能自己的隱藏頁面裡，執行圖片翻譯的本機文字辨識
- alarms：隱藏頁面閒置幾分鐘後把它關掉，釋放記憶體

## 資料儲存與安全

- 所有資料都儲存在您的本地瀏覽器中
- 我們沒有自己的伺服器，也不收集您的個人資料
- 只有「第三方服務」與「圖片翻譯」中說明的內容會送到第三方服務
- 您可以透過儲存空間管理功能檢視和清理資料

## 第三方服務

- Google Gemini API：用於 AI 分析與對話功能，以及您把圖片翻譯來源設為 Gemini 時的翻譯
- Google Gemini API：提供單字和例句的語音播放
- API Key 由用戶自行提供，我們不會存儲或分享該金鑰
- Google 翻譯：在圖片翻譯來源為 Google 翻譯（預設）時翻譯圖片中辨識出的文字
- Hugging Face：存放圖片翻譯第一次使用時下載的文字辨識模型

## 兒童隱私

我們的服務不針對 13 歲以下的兒童。我們不會故意收集兒童的個人資訊。

## 政策更新

我們可能會不定期更新本隱私權政策。重大變更時，我們會通過擴充功能通知您。

## 聯絡我們

如果您對本隱私權政策有任何疑問，請通過以下方式聯絡我們：
- GitHub Issues: [LexiTechly GitHub Repository](https://github.com/SunZhi-Will)
- Email: sun055676@gmail.com

使用本擴充功能即表示您同意本隱私權政策的條款。

