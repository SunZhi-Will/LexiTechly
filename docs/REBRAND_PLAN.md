# 改名與重新定位分析

日期：2026-11-23。延續 `docs/COMMERCIALIZATION_PLAN.md`，這份只處理三件事：產品現在到底是什麼、該叫什麼、改名前後要先最佳化什麼。

## 1. 名字和產品已經對不上

| 面向 | 名字與商店文案說的 | 程式碼實際做的 |
|---|---|---|
| 語言 | 英文（Lexi + Tech + ly，「智慧英文內容分析」） | `multilang` 分支已支援 7 種學習語言（英日韓中西法德）、5 種解說語言，分級含 CEFR、JLPT、TOPIK、HSK |
| 內容類型 | 英文網頁 | 網頁文字，加上漫畫圖片（本機 OCR、直排、整本翻譯、區塊翻譯） |
| 核心動作 | 「分析」難度 | 查詞、翻譯、存單字；分析只是其中一個按鈕 |
| 使用者 | 讀英文技術文章的人（Techly） | 讀外語網頁的學習者，以及看日韓漫畫的人 |

結論：LexiTechly 這個名字把產品鎖在「英文」與「科技文章」，兩個都已經不成立。商店單一用途政策也要求一個主軸，現在的名字無法同時涵蓋查詞、分級與漫畫翻譯。

## 2. 新的用途（一句話）

**讀你本來就在讀的東西（網頁、漫畫），查過的字自動留下來，之後變成你的複習。**

- 主軸：閱讀中學語言。商店單一用途的描述就寫這一句。
- 圖片翻譯是「漫畫也能當教材」的入口，免費、本機、不上傳，是獲客功能。
- CEFR 等分級從「主功能」降為「只標出高於你程度的字」的依據。
- 頁面 AI 對話、單字關聯圖降為次要功能，不放進商店標題。
- 不做：通用雙語整頁翻譯、AI 側欄、影片字幕（理由見商業化規劃 4.1）。

## 3. 名字候選

撞名查核只用網路搜尋做了初步確認，**尚未查商標**，定案前要查 TIPO 與 USPTO。

| 候選 | 意思 | 搜尋結果 | 判斷 |
|---|---|---|---|
| **Readloop**（中文：讀迴） | read + loop，直接對應「讀 → 查 → 存 → 複習 → 再讀」的學習閉環 | 沒有同名擴充功能；只有一個 Mac 朗讀小工具「Read Loop」和西語 App「READLO」，類別不同 | **推薦**。好唸、好拼、不綁語言也不綁內容類型 |
| Glossmark | gloss（行間註解）+ mark | 沒有同名，但 Gloss 系列很擠（Gloss 註解閱讀器、gloss.space 劃線工具） | 可用但辨識度較低 |
| 保留 Lexi 字首（例如 Lexiloop） | 延續舊名 | Lexi 字首在同類別非常擠：LexiPop、LexiLayer、LexiDrop、Lexi 都是閱讀學單字工具 | 不建議，會被淹沒 |
| 漫畫取向名字（例如 Bubblingo） | 對話泡泡 + lingo | Bubblingo 已被 Vision Pro 英文 App 使用 | 不建議，也會把產品綁死在漫畫 |

商店標題建議格式（132 字元內）：`Readloop：讀網頁與漫畫，邊讀邊學語言` / `Readloop: Learn languages from the web pages and manga you read`。

## 4. 最佳化優先順序

### 4.1 改名之前必須先做

1. **先把 `multilang` 分支收進 `main`**。該分支領先 `main` 7 個 commit，另有 24 個檔案未提交（i18n、多語言、provider 層、移除非官方 TTS）。改名會動到約 350 處「LexiTechly」字串，其中 `content/styles.ts` 138 處、`reading-mode.ts` 54 處，在兩條分支各改一次一定衝突。
2. **12-01 模型期限（剩 8 天）**：`main` 的 `image-translate/gemini-translate.ts:13` 仍寫死 `gemini-2.5-flash`；`main` 的 `background.ts:117` 仍用非官方 `translate_tts`。`multilang` 已處理後者，合併時要確認前者也改成 `ai-models.ts` 的集中設定。

### 4.2 改名本身（一次做完）

- 顯示名稱：`_locales/*/messages.json` 的 `extName`、`extDescription`、歡迎頁、右鍵選單、popup 與單字頁標題。
- 內部識別字：CSS class 與 DOM id 前綴（`lexitechly-*`）改為短前綴（例如 `rl-`），同時降低被網頁指紋偵測的辨識度。
- **資料遷移**：`chrome.storage` 的 key 與 IndexedDB 名稱若含舊名，不能直接改名，要寫一次性遷移，否則既有使用者的單字本和譯文快取會消失。
- 文件：README 中英、隱私權政策、LICENSE、CHANGELOG、`.project`、`package.json`。
- Logo：剛重做的 logo 若含 L 字形，需要配合新名字調整。
- Chrome 線上若已上架，擴充功能 ID 不變，改名只是更新商店資訊，使用者不需重裝。

### 4.3 改名之後，配合新用途

| 項目 | 現況 | 改成 |
|---|---|---|
| 查過即入庫 | 要手動收藏 | 查詞自動存單字、原句、來源網址 |
| 單字資料模型 | 只有 `addedTime` | 加上 schema 版本、FSRS 欄位（到期日、穩定度、難度、紀錄） |
| 每日複習 | 沒有 | popup 首頁顯示今日到期卡片 |
| 漫畫學習卡 | 只翻不存 | 譯文泡泡可點詞查詢，存「原文 + 截圖區塊 + 譯文」 |
| popup 首頁順序 | 分析結果在最上面 | 今日複習 → 本頁查詞 → 圖片翻譯 → 分析 |
| 懸停延遲 | 3 秒 | 約 0.5 秒或點擊觸發 |
| 權限 | `<all_urls>`、`tabs`、寬鬆的 `web_accessible_resources` | 逐項檢查，能縮就縮 |

## 5. 決定與進度

2026-11-23 定案：名字用 Readloop（讀迴）。`multilang` 已先透過 `sidepanel` 合併進 `main`，接著完成改名。儲存名稱沿用舊名，不做資料遷移（理由見 CHANGELOG）。還沒做：logo（目前是 L 字形）、商標查核、改名後的學習閉環功能（4.3 節）。

原本列出的待決事項：

1. 新名字（推薦 Readloop / 讀迴）。
2. 是否同意先合併 `multilang` 再改名。
3. 內部前綴與儲存 key 要不要一起改（推薦一起改並寫遷移）。

## 來源

- [LexiPop](https://chromewebstore.google.com/detail/djflojbfpbmbcjcjjbcfmnpggneknbla)、[LexiLayer Pro](https://chromewebstore.google.com/detail/kdoiocimklbgcelmbajofljppnfoimpd)、[LexiDrop](https://addons.mozilla.org/firefox/addon/lexidrop/)、[Lexi](https://apps.apple.com/app/id6757388579)
- [Bubblingo](https://apps.apple.com/us/app/bubblingo/id6744569484)
- [Read Loop（Mac）](https://apps.apple.com/np/app/read-loop-text-in-loop/id6612010849)、[READLO](https://devpost.com/software/readlo)
- [Gloss: Annotated Reader](https://apps.apple.com/app/id6782358267)、[Gloss（gloss.space）](https://addons.mozilla.org/sq/firefox/addon/gloss-space/)
