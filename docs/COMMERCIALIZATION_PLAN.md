# LexiTechly 商業化完整規劃

查證日：2026-11-23。路線：翻譯 + 學習。

## 1. 結論摘要

1. **定位要從「AI 英文分析工具」改成「把你讀過、翻過的內容變成複習課」**。通用翻譯、AI 對話、摘要已經被 Chrome 內建功能與千萬級對手做成免費，不能當賣點。還沒有贏家的是「閱讀當下查詞，自動分級、自動進間隔重複」這條學習閉環，現有玩家都在 CWS 10 萬使用者以下。
2. **兩個差異化切角**：(a) 繁中母語者的英文閱讀分級教練（CEFR 加台灣考試對照）；(b) 漫畫與 Webtoon 翻譯加日韓語學習，目前沒有產品把漫畫裡查過的詞存起來複習。
3. **圖片翻譯當免費獲客功能，不當付費牆**。本機 OCR 邊際成本接近零，是結構性優勢。
4. **收費模式**：免費層保留 BYOK 全功能；Pro 賣「免申請 key 的代管 AI、雲端同步、進階學習功能」。建議 Pro 月費 US$4.99（NT$149）、年費 US$34.99（NT$990），主推年費。
5. **營收預期要務實**：基準情境第一年約 US$4,000 上下，屬副業等級。先用免費版驗證留存，再蓋付費後端。
6. **有兩件事比商業化更急**：`gemini-2.5-flash` 在 2026-12-01 被自動導向別的模型；Gemini 語音用的 `gemini-2.0-flash-live-001` 官方列的關閉日 2025-12-09 已經過了，這個功能現在可能已經壞掉。

## 2. 研究方法與可信度

8 個 subagent 平行研究，再由主流程對關鍵數字做 3 次直接抓官方頁面的複核。

| 主題 | 模型 | 可信度備註 |
|---|---|---|
| 競品深度分析 | Opus | 使用者數多取自 CWS 即時頁面；營收全部查無 |
| 收費架構與單位經濟 | Opus | 金流與 Gemini 價格已複核；營收試算是推估 |
| 漫畫圖片翻譯市場 | Sonnet | 只搜約 15 次，中文社群與日韓關鍵字未涵蓋 |
| 市場規模與需求 | Sonnet | 市場規模各家口徑差 5 倍以上，只能看量級 |
| 通路與成長 | Sonnet | 獨立開發者案例只有搜尋摘要；指標目標值是估計 |
| 程式碼就緒度盤點 | Sonnet | 直接讀程式碼，附行號，可信度高 |
| 政策與法規 | Haiku | 多項查無官方明文，已標示 |
| API 價格表 | Haiku | Google Cloud 翻譯、TTS、Vision 價格頁讀取失敗 |

**複核後修正的三件事**

- 沉浸式翻譯 Pro 是 US$14.99/月、US$119.88/年（官方會員條款，2026-08-07 版）。漫畫報告寫的 $9.99 是錯的。
- Read Frog 陪讀蛙比競品報告描述的更強也更便宜：Pro 年繳 US$30（約 US$2.5/月），含 FSRS 單字卡與每月約 3,000 萬 token。原本 Opus 建議的 US$6.99 月費在這個價格帶站不住，本規劃已下修。
- Lemon Squeezy 官方確認 2026-11-16 停止新註冊，2027-03-31 停止處理付款。

## 3. 現況診斷（程式碼盤點）

**可以直接當資產的**

- 圖片翻譯是最完整的功能：本機 OCR、直排、整本翻譯、快取、42 個測試，且已經按需注入、有引擎選擇層（`src/scripts/image-translate/translate-engines.ts`）。
- CEFR 分析、沉浸式查詞、單字本、關聯圖都能用。
- 已有離線分析 `analyzeContentLocal` 與 CSV 匯出。

**商業化前必須處理的**

| 問題 | 位置 | 影響 |
|---|---|---|
| 圖片翻譯走非官方 Google 端點 `client=gtx` | `image-translate/google-translate.ts:2` | 收費產品不能依賴，有被封鎖與違反條款的風險 |
| 文字語音走非官方 `translate_tts`，並偽造 User-Agent 與 Referer | `background.ts:100`、`:118` | 同上，且偽造標頭在審查上更難辯護 |
| 所有 REST 呼叫寫死 `gemini-2.5-flash` | `content/analysis.ts:141`、`:452`、`:530`，`content/word-query.ts:140`，`vocabulary/analysis.ts:8` | 12-01 起被導向 `gemini-3.5-flash-lite`，行為可能改變 |
| 語音用 `gemini-2.0-flash-live-001` | `audio/geminiSpeech.ts:234` | 官方關閉日已過，需要實測是否還能用 |
| AI 呼叫散在 5 處，各自讀 key，key 放在網址參數 | `content/analysis.ts:192` 等 | 無法做代管額度，也無法統一重試與計量 |
| API key 前 5 碼印到 console | `popup/speech.ts:65` | 上架前要移除 |
| 單字資料沒有學習進度欄位 | `vocabulary/types.ts:5` | 只有 `addedTime`，學習路線要從資料模型做起 |
| 沒有 `_locales`，約 1,600 行以上寫死繁中 | 全專案 | 無法進入台灣以外市場 |
| 無帳號、付費牆、遙測、首次使用導引 | 全專案 | 新使用者要先自己去申請 key 才能用 |
| `web_accessible_resources` 對全站暴露 `.ts` 與 assets | `manifest.json` | 可被任何網站指紋偵測，審查扣分 |
| 懸停 3 秒才出字卡 | `content/reading-mode.ts` | 體驗太慢 |
| 無 lint、無 CI，測試只涵蓋圖片翻譯 | `tests/` | 改資料模型時風險高 |

`PROJECT_ANALYSIS.md`（2025-01 撰寫）已大幅過時，沒有涵蓋圖片翻譯，建議以本文件取代。

## 4. 市場與競品

### 4.1 競品地圖

| 類別 | 代表 | CWS 使用者 | 價格 | 對我們的意義 |
|---|---|---|---|---|
| 通用翻譯巨頭 | Google 翻譯、DeepL、沉浸式翻譯 | 3,900 萬、400 萬、300 萬 | 免費到 US$14.99/月 | 紅海，避開。沉浸式翻譯官方頁沒有生詞本、複習、CEFR |
| AI 側欄 | Sider、Monica、Gemini in Chrome | 500 萬、300 萬、內建 | 約 US$8 到 30/月 | 紅海。「頁面 AI 對話」降為附加功能 |
| 影片字幕學習 | Language Reactor、Trancy、Migaku | 200 萬、30 萬、3 萬 | 約 US$5 到 10/月 | 已卡位，不做影片 |
| 網頁閱讀學習 | Readlang、Read Frog、Relingo | 10 萬、6 萬、4 萬 | US$2.5 到 6/月 | **直接競爭區，沒有贏家** |
| 漫畫翻譯 | Ichigo Reader、Torii、沉浸式翻譯漫畫 | 約 3 萬、約 1 萬 | 點數或訂閱 | 都是雲端、只翻不教 |
| 日文查詞 | Yomitan | 10 萬 | 免費開源 | DIY 流程（Mokuro + Yomitan + Anki）設定麻煩 |

### 4.2 最需要正視的對手：Read Frog 陪讀蛙

- 開源（GPL-3.0，另有商業授權），GitHub 10.5k star，CWS 6 萬使用者、4.8 分，官網宣稱 24 萬安裝。2026-11-22 才剛更新，版本 1.61.1，迭代很快。
- 功能：雙語網頁翻譯、字幕、PDF、EPUB、單字本、FSRS 單字卡、BYOK 免費不限量。
- 價格：Pro 年繳 US$30，Ultra 年繳 US$70（早鳥價）。
- 它**沒有**的：CEFR 頁面分級、台灣考試對照、漫畫圖片翻譯與漫畫學習。這三項就是我們的立足點。

### 4.3 平台威脅

- Chrome 138 起 Translator API 與 Language Detector API 已穩定，本機翻譯免費。
- Gemini in Chrome 2026 年 4 月已在台灣上線，支援繁中摘要與跨分頁問答。
- Google 翻譯 App 2025 年 8 月加入練習功能。
- Duolingo 2026 Q3 日活 6,490 萬、付費 1,310 萬，但沒有做「網頁閱讀變學習材料」。

結論：純翻譯沒有生存空間。生存條件是做瀏覽器內建做不到的事，也就是個人化的程度判斷、累積的單字資料、複習排程。

### 4.4 市場規模（只看量級）

- 全球線上語言學習 2025 年約 158 億到 241 億美元，亞太占四成以上。
- 日本 2025 年度 TOEIC 約 216 萬人次。台灣多益動機以畢業門檻 29.3%、求學 24.3%、求職 18.3% 為主。
- 教育類 App 的 30 日留存只有約 2% 到 3%，留存是這個品類最難的事。

## 5. 定位

**一句話**：把你每天讀的英文網頁與看的漫畫，自動變成只含你不會的字的個人化複習課。

**起點客群**

1. **台灣上班族與大學生**：多益 600 到 800，每天讀英文新聞或技術文件，沒時間背單字。語言與在地優勢最大，先做。
2. **日韓語學習者（看漫畫學語言）**：先以繁中使用者為主，之後再做英文介面觸及歐美的日文學習者。
3. 日本的英文學習者（TOEIC 族群）放第二階段，需要日文介面與在地化。

**不做**：通用雙語網頁翻譯、AI 側欄、影片字幕、遊戲化課程、學校採購（只預留邀請碼與學習報告匯出）。

## 6. 產品規劃：學習閉環

現在的功能是一堆分散的工具。要改成一條線：

```
讀網頁或漫畫 → 只標出高於你程度的詞 → 查詞（一次點擊或短懸停）
→ 自動入庫並記下原句 → 間隔重複排程 → 每日複習 → 程度更新 → 回到第一步
```

| 功能 | 說明 | 依據 |
|---|---|---|
| 程度設定與自適應標示 | 首次使用時選 CEFR 等級或做簡短測驗，網頁上只標出高於程度的詞 | 「翻譯讓人變懶」的對策；Relingo 已驗證此設計有人用 |
| 查過即入庫 | 查詞自動存單字、原句、來源網址，不需要手動收藏 | 語境中學詞有文獻支持 |
| 間隔重複 | 採用 FSRS 演算法，資料模型加上到期日、穩定度、難度、複習紀錄 | FSRS 在公開基準上預測優於 SM-2（預測準確度，非學習成效試驗） |
| 每日複習 | 新分頁或 popup 顯示今日到期卡片，先猜再看 | 主動回想 |
| 台灣考試對照 | 單字標示多益、學測、全民英檢常見度 | 巨頭不做繁中在地化，這是付費理由 |
| 漫畫學習卡 | 圖片翻譯結果可點詞查詢，存下「泡泡原文 + 截圖區塊 + 譯文」 | 市場上沒有一鍵產品 |
| Anki 匯出 | 降低資料被綁住的疑慮 | 競品普遍有，使用者會問 |
| 學習報告 | 週報、連續天數、可分享的卡片 | 留存與自然擴散 |

**要降級或簡化的**：頁面 AI 對話移到次要位置；單字關聯圖保留但不當賣點；懸停延遲從 3 秒改為約 0.5 秒或改點擊觸發。

## 7. 商業模式與定價

### 7.1 方案

| 方案 | 內容 | 價格 |
|---|---|---|
| 免費 | BYOK 全功能、本機圖片翻譯、Chrome 內建翻譯、單字本、本機複習 | 0 |
| Pro 試用 | 註冊後 7 天，不需信用卡 | 0 |
| Pro 月費 | 免申請 key 的代管 AI（有合理使用額度）、雲端同步、考試對照、漫畫學習卡、學習報告 | US$4.99，台灣 NT$149 |
| Pro 年費（主推） | 同上 | US$34.99，台灣 NT$990 |

**定價理由**

- 價格帶參考：Read Frog US$2.5 到 5.83/月，Relingo US$3.99，Readlang US$6，Language Reactor 約 US$5，沉浸式翻譯 US$14.99。學習型產品落在 US$3 到 6。
- 金流手續費是固定費用占比問題。以 Creem 的 3.9% + US$0.40 計算，US$4.99 月費手續費約 12%，US$34.99 年費約 5%，所以要主推年費。
- 是否加「終身買斷」：只在不含代管 AI 的前提下才可行（否則有長期變動成本）。建議先不推出，等有付費資料再評估。
- 學生方案要等確認模型供應商的年齡條款後再決定，見第 9 節。

### 7.2 單位經濟

重度使用者假設：每月 900 次單字解析、150 次全文分析、600 次對話，合計約 342 萬輸入 token、92 萬輸出 token。

| 模型 | 每百萬 token 輸入 / 輸出 | 重度使用者每月文字成本 |
|---|---|---|
| gemini-2.5-flash-lite | US$0.10 / 0.40 | 約 US$0.71 |
| Claude Haiku 5.5 | US$0.10 / 0.50 | 約 US$0.8 到 1.0 |
| gemini-3.1-flash-lite | US$0.25 / 1.50 | 約 US$2.23 |
| gemini-3.5-flash-lite | US$0.30 / 2.50 | 約 US$3.3（依同一用量推算） |
| gemini-3.8-flash（2027-01-01 漲價後） | US$1.50 / 7.50 | 約 US$12 |

- 一般付費使用者估計約為重度的三到四成。
- 代管層必須用 Flash-Lite 等級模型，並設每日與每月額度，才能把每位付費者的 AI 成本壓在 US$1 以內，毛利才守得住。
- 圖片翻譯用本機 OCR 加 Chrome 內建 Translator，成本為零。
- 語音預設用瀏覽器 `speechSynthesis`，高品質語音列為 Pro 並計入額度。Gemini 3.8 Flash-Lite TTS 在 2027-01-01 價格翻倍，要留意。
- 後端：Cloudflare Workers 付費版 US$5/月含 1,000 萬次請求，1,000 位付費者以內基礎設施約 US$10/月以內。

### 7.3 營收試算（推估，不是預測）

假設混合後每位付費者每月淨收約 US$3。

| 情境 | 月活 起到末 | 付費轉換 | 平均付費人數 | 第一年營收 |
|---|---|---|---|---|
| 保守 | 500 到 3,000 | 0.8% | 約 14 | 約 US$500 |
| 基準 | 1,000 到 10,000 | 2% | 約 110 | 約 US$4,000 |
| 樂觀 | 2,000 到 40,000 | 3% | 約 630 | 約 US$22,000 |

公開資料中，擴充功能免費轉付費多落在 0.5% 到 2%。也有 7 萬使用者幾乎沒有營收的公開反例。這份試算的用途是提醒：**先證明留存，再投資付費後端**。

### 7.4 金流

| 方案 | 費率 | 台灣 | 判斷 |
|---|---|---|---|
| Creem | 3.9% + US$0.40；出款 1% 或 7 美元取高者 | 列在 88 個支援國家 | 首選候選，費率最低 |
| Polar | 5% + US$0.50，非美國卡加 1.5% | 出款清單有台灣 | 備選，小額月費手續費偏高 |
| Dodo Payments | 4% + US$0.40，另有附加 | 可用台灣身分證件驗證 | 備選 |
| Stripe 直連、ExtensionPay | 不適用 | 台灣不在 Stripe 支援清單 | 不可行 |
| Lemon Squeezy | 不適用 | 已停止新註冊 | 不可行 |

三家都是 Merchant of Record，會代為處理各國消費稅。**尚未確認**：台灣「個人」身分能否通過 Creem 與 Polar 的開戶驗證、兩家的授權金鑰功能。開發付費功能前先實際註冊走一次驗證流程。

## 8. 技術路線

1. **AI 請求收斂到 background**：content 與頁面只送 `{task, payload}`，由 service worker 決定走 BYOK、Chrome 內建 AI，或代管後端。key 不再出現在 content script 與網址參數。
2. **Provider 介面**：以圖片翻譯現有的引擎選擇層為雛形，擴成文字 LLM、翻譯、語音三種介面。模型名稱集中成設定，不再散落寫死。
3. **替換非官方端點**：圖片翻譯預設改用 Chrome 內建 Translator API（已支援 zh-Hant，僅桌面），備援為 Flash-Lite 翻譯；語音預設改 `speechSynthesis`。
4. **資料模型升級**：加 schema 版本號與遷移機制；單字加入複習欄位；大量資料從 `chrome.storage.local` 移到 IndexedDB。
5. **國際化**：導入 `_locales`，先做 zh-TW、en，之後 ja。AI prompt 的輸出語言改成參數。
6. **最小後端（收費階段才做）**：Cloudflare Workers + D1。流程為金流 webhook 寫入授權表，擴充功能換取短效 token，Worker 驗證後扣額度再呼叫模型。prompt 模板放伺服器端，前端只傳單字與上下文，避免被當成通用 LLM 代理。
7. **品質**：加 lint 與 CI，資料遷移與複習排程要有測試。

Chrome 內建 Prompt API 只支援英日西德法輸出，且需要 22 GB 磁碟空間與較高硬體，不能當成所有人的免費層，只能當有條件的加速選項。

## 9. 合規與風險

| 風險 | 現況 | 對策 |
|---|---|---|
| Gemini API 條款（2026-03-23 生效） | 免費層內容會被用於改進產品；歐洲經濟區、瑞士、英國只能用付費服務；使用者須滿 18 歲；條款有「not for consumer use」字樣 | 代管層一律用付費層。**上線代管前要自己讀完條款，確認面向個人消費者的代理用法是否允許**。Provider 抽象層讓我們能換供應商 |
| 非官方 Google 端點 | 圖片翻譯與語音都在用 | 收費前全部換掉 |
| Chrome Web Store 審查 | `<all_urls>`、`tabs`、過寬的 `web_accessible_resources`；ONNX 模型從網路下載屬灰區（官方無明文） | 移除不必要權限、收窄暴露資源、審查說明逐項解釋；模型下載維持固定 commit 與 checksum，並在商店說明寫清楚 |
| 單一用途政策 | 翻譯、學習、圖片翻譯三者並列 | 商店說明用「閱讀學習」單一主軸描述 |
| 漫畫著作權 | 查不到工具因此被下架的案例，但 2026 年日韓版權方連續拿下多個盜版站 | 行銷只談官方平台與學習用途，不出現盜版站名稱與「免費看」字樣。工具提供者責任沒有找到判例，正式主打前建議諮詢律師 |
| 隱私 | 現行政策寫「無伺服器」 | 加入後端時整份改寫，並在官網公開 Limited Use 聲明 |
| 稅務 | 個人網路銷售勞務當月達 NT$5 萬需辦稅籍登記（KPMG 引述） | 有營收前先諮詢會計師 |
| 競爭 | Read Frog 迭代快；沉浸式翻譯只要補上單字本就能壓過來 | 守住 CEFR 分級、台灣在地化、漫畫學習三個他們沒做的點 |

## 10. 通路

| 優先 | 做法 | 備註 |
|---|---|---|
| 1 | CWS 商店頁重做：英文與繁中雙語、5 張標註截圖、30 秒示範影片 | 官方規格：截圖 1280x800，摘要 132 字元內 |
| 2 | 首次使用導引，60 秒內看到第一個結果 | 降低前兩天的解除安裝 |
| 3 | Threads 開發日誌與短示範（已有經營基礎） | 每週約 3 小時 |
| 4 | 上 Edge Add-ons | 移植成本最低 |
| 5 | 內容：免費的「網頁 CEFR 檢測」落地頁、競品替代方案比較文 | 有案例靠這類內容長到數千日活 |
| 6 | Firefox 版 | 本機 OCR 的 WASM 與 offscreen 需另測 |
| 7 | Show HN、Product Hunt | 流量不保證 |
| 延後 | Safari（年費 US$99 加 Xcode）、Android（幾乎沒有可行管道）、學校採購、AppSumo | |

請評論只在使用者完成有意義動作後提示，付費換評論違反政策。

## 11. 路線圖

**第 0 階段：本週內（12-01 前）**

- 把寫死的 `gemini-2.5-flash` 改成明確指定的現行模型並實測輸出格式。
- 實測 Gemini 語音是否還能用，不能用就先把預設切到瀏覽器語音。
- 移除 console 中的 key 輸出。

**第 1 階段：地基（約 4 週）**

- AI 請求收斂到 background、provider 介面、模型名稱集中。
- 換掉兩個非官方端點。
- `_locales`（zh-TW、en）、首次使用導引、懸停延遲調整。
- 收窄權限與 `web_accessible_resources`，加 lint 與 CI。

**第 2 階段：學習閉環，全部免費（約 4 週）**

- 資料模型升級與遷移、程度設定、查過即入庫、FSRS 複習、每日複習介面。
- 漫畫學習卡、Anki 匯出。
- 重做商店頁，上 Edge，開始內容與 Threads。
- 加入匿名、可關閉的使用統計，才量得到留存。

**第 3 階段：驗證付費意願（約 2 週）**

- 在產品內放 Pro 介紹頁與候補名單，量點擊率與留信箱比例。
- 訪談 10 位活躍使用者。
- 實際註冊 Creem 與 Polar，確認台灣個人身分可開戶。
- 讀完 Gemini 條款並決定代管層的模型供應商。

**第 4 階段：收費（約 4 到 6 週，第 3 階段通過才做）**

- Cloudflare Workers 後端、帳號、金流、額度、雲端同步。
- 考試對照、學習報告、Pro 試用。
- 改寫隱私權政策。

**第 5 階段：擴張**

- Firefox、日文介面與日本市場、聯盟分潤（常見 20% 到 30% 循環）。

## 12. 指標與要驗證的假設

**指標**（目標值為起始假設，不是產業基準）

| 指標 | 起始目標 |
|---|---|
| 每週活躍占總安裝 | 20% 以上 |
| 7 日解除安裝率 | 15% 以下 |
| 有複習行為的使用者占活躍比例 | 30% 以上 |
| 30 日留存 | 高於教育類 App 的 2% 到 3% |
| 免費轉付費 | 1% 到 3% |

**進入第 4 階段的門檻（建議）**：至少 1,000 位每週活躍使用者，且候補名單留信箱比例達到活躍使用者的 3% 以上。

**三個核心假設**

1. 使用者願意為「只標生詞加間隔重複加考試對照」付費，而不是停在免費的內建翻譯。
2. 查過即入庫加每日複習能讓 7 日與 30 日留存明顯高於只有翻譯的版本。
3. 漫畫翻譯帶進來的使用者，有一定比例會轉成語言學習使用者，而不是只翻不學。

## 13. 尚未驗證的事項

- 台灣個人身分在 Creem、Polar 的開戶可行性，以及兩家的授權金鑰功能。
- Gemini 條款對「代理個人消費者請求」的明確立場。
- Gemini 語音功能目前是否仍可運作（需在本機實測）。
- 漫畫工具提供者的著作權責任。
- 中文社群（PTT、巴哈、小紅書、Dcard）對漫畫翻譯與學習工具的付費意願，本次幾乎沒有取得原文。
- 韓國、東南亞、中國大陸的市場數字。
- Google Cloud 翻譯、語音、Vision 的現行官方單價（價格頁讀取失敗）。
- 台灣個人販售數位訂閱的所得認列方式。
- CWS 審查時間與 `<all_urls>` 的實際審查標準。

## 14. 主要來源

- Gemini 棄用時程與價格：https://aistudio.google.com/docs/deprecations 、https://aistudio.google.com/docs/pricing
- Gemini API 條款：https://aistudio.google.com/docs/terms
- 沉浸式翻譯會員條款：https://immersivetranslate.com/docs/MEMBERSHIP-TERMS/
- Read Frog：https://www.readfrog.app/en/pricing 、https://github.com/mengxi-ream/read-frog
- Readlang 定價：https://readlang.com/pricing
- Lemon Squeezy 關閉公告：https://www.lemonsqueezy.com/blog/saying-goodbye-to-lemon-squeezy
- Creem：https://www.creem.io/pricing 、https://docs.creem.io/merchant-of-record/supported-countries
- Polar：https://polar.sh/resources/pricing 、https://polar.sh/docs/merchant-of-record/supported-countries
- Stripe 支援國家：https://stripe.com/global
- Chrome 內建 AI：https://developer.chrome.com/docs/ai/built-in-apis 、https://developer.chrome.com/docs/ai/translator-api
- CWS 政策：https://developer.chrome.com/docs/webstore/program-policies/policies 、https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- CWS 商店頁規格：https://developer.chrome.com/docs/webstore/best-listing
- Cloudflare Workers 價格：https://developers.cloudflare.com/workers/platform/pricing/
- Duolingo 2026 Q3：https://www.sec.gov/Archives/edgar/data/0001562088/000162828026069474/q3fy26duolingo9-30x26share.htm
- 擴充功能轉換率實例：https://dev.to/ktg0215/real-numbers-freemium-chrome-extension-monetization-after-6-months-5hga
- FSRS 基準：https://expertium.github.io/Benchmark.html
- 稅籍登記門檻：https://kpmg.com/tw/zh/home/insights/2025/09/e-tax-alert-206.html
