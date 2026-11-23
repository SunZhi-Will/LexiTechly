/**
 * 圖片翻譯：背景頁、offscreen 文件、內容腳本之間的訊息與共用型別（三邊共用，避免字串打錯）
 *
 * 流程：
 * 1. 使用者在圖片上按右鍵選「翻譯這張圖片 → 原文語言」，背景頁把 image-translate-content.js 注入那個分頁（activeTab）。
 * 2. 背景頁 → 內容腳本 START：內容腳本找到那張圖、顯示處理中（第一次使用先顯示說明），回傳圖片在畫面上的位置。
 * 3. 背景頁取得圖片像素（先抓原圖，跨網域抓不到就擷取分頁畫面再裁切），交給 offscreen 文件 ANALYZE：
 *    對話框偵測 + OCR，回傳區塊與文字行。
 * 4. 背景頁分組、送翻譯，RESULT 回給內容腳本，內容腳本在圖上疊一層譯文。
 */

export type SourceLang = 'ko' | 'ja' | 'zh';

// 'auto'：自動判斷原文語言（同一個網站常有各種語言的作品，預設用這個）
export type LangChoice = SourceLang | 'auto';

// 右鍵子選單的順序
export const SOURCE_LANGS: SourceLang[] = ['ko', 'ja', 'zh'];

// [x0, y0, x1, y1]，圖片像素座標
export type Box = [number, number, number, number];

export type RegionLabel = 'bubble' | 'text_bubble' | 'text_free';

/** 對話框偵測模型的輸出：對話框、對話框內的文字、框外的文字 */
export interface Region {
    label: RegionLabel;
    score: number;
    box: Box;
}

/** OCR 的一行 */
export interface OcrLine {
    text: string;
    box: Box;
    confidence: number;
}

export interface ImageAnalysis {
    width: number;
    height: number;
    regions: Region[];
    lines: OcrLine[];
}

/** 一個要翻譯、要貼回去的文字區塊 */
export interface TextBlock {
    label: Exclude<RegionLabel, 'bubble'>;
    // 原文所在範圍（抹字範圍）
    box: Box;
    // 所屬對話框；排版時可以用對話框內縮後的範圍，譯文通常比原文長
    bubbleBox: Box | null;
    text: string;
    confidence: number;
    // 原文是直排（日文漫畫的對白多半是）：譯文是中文或日文時也直排
    vertical: boolean;
    // 原文的字大約多大（圖片像素）：譯文的字不比原文大，看起來才像原本的版面
    fontHint: number;
}

export interface TranslatedBlock extends TextBlock {
    translation: string;
}

// ---------- 背景頁 ↔ 內容腳本 ----------

export const IMAGE_TRANSLATE_START = 'READLOOP_IMAGE_TRANSLATE_START';
export const IMAGE_TRANSLATE_PROGRESS = 'READLOOP_IMAGE_TRANSLATE_PROGRESS';
export const IMAGE_TRANSLATE_RESULT = 'READLOOP_IMAGE_TRANSLATE_RESULT';
export const IMAGE_TRANSLATE_ERROR = 'READLOOP_IMAGE_TRANSLATE_ERROR';

export interface StartRequest {
    type: typeof IMAGE_TRANSLATE_START;
    requestId: string;
    srcUrl: string;
    lang: LangChoice;
}

/** 圖片在視窗中的位置（CSS 像素），擷取畫面時用來裁切 */
export interface ViewportRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type StartResponse =
    | { ok: true; rect: ViewportRect; viewport: { width: number; height: number }; naturalWidth: number; naturalHeight: number }
    | { ok: false; reason: 'not-found' | 'cancelled' };

export type ProgressPhase = 'download' | 'analyze' | 'translate';

export interface ProgressMessage {
    type: typeof IMAGE_TRANSLATE_PROGRESS;
    requestId: string;
    phase: ProgressPhase;
    // 下載模型時的位元組數
    loaded?: number;
    total?: number;
}

export interface ResultMessage {
    type: typeof IMAGE_TRANSLATE_RESULT;
    requestId: string;
    // 拿來分析的那張圖（data URL）；疊圖時以它為底，取色不受跨網域限制
    image: string;
    // 分析的那張圖對應到原圖的哪一部分（0 到 1 的比例）；抓得到原圖時是整張 {0, 0, 1, 1}，
    // 只能擷取畫面時是圖片在畫面上看得到的那一塊
    coverage: { left: number; top: number; width: number; height: number };
    // 分析用的那張圖的尺寸（區塊座標以它為準）
    width: number;
    height: number;
    blocks: TranslatedBlock[];
    targetLang: string;
    // 實際用的原文語言（自動判斷時是判斷出來的那個）
    sourceLang: SourceLang;
    // 辨識的原始資料（偵測到的區塊、每一行讀到的字）：「匯出辨識紀錄」用來查漏翻是哪一步出問題
    diagnostics?: { regions: Region[]; lines: OcrLine[] };
}

export interface ErrorMessage {
    type: typeof IMAGE_TRANSLATE_ERROR;
    requestId: string;
    // translate-busy：免金鑰的翻譯端點把這個 IP 暫時擋下（429），而且沒有本機翻譯可以接手
    // region-outside：框選翻譯框到之前沒讀到的地方（只擷取了畫面上看得到的一塊）
    code: 'no-text' | 'analyze-failed' | 'translate-failed' | 'translate-busy' | 'translate-no-key' | 'capture-failed' | 'model-download-failed' | 'region-outside';
    detail?: string;
}

// 背景頁 → 內容腳本：要擷取畫面了，先把我們自己的譯文層、狀態列藏起來（不然會被截進去、蓋住要讀的字）；
// 擷取完再顯示回來。PREPARE 等內容腳本回覆（已經藏好、畫面也重畫過）才擷取
export const IMAGE_TRANSLATE_CAPTURE_PREPARE = 'READLOOP_IMAGE_TRANSLATE_CAPTURE_PREPARE';
export const IMAGE_TRANSLATE_CAPTURE_DONE = 'READLOOP_IMAGE_TRANSLATE_CAPTURE_DONE';

// ---------- 自動翻譯模式（快捷鍵開關；換頁、新出現的圖都會自動翻） ----------

// 背景頁 → 內容腳本：使用者按了快捷鍵，切換這個分頁的自動翻譯
export const IMAGE_TRANSLATE_AUTO_TOGGLE = 'READLOOP_IMAGE_TRANSLATE_AUTO_TOGGLE';
// 內容腳本 → 背景頁：翻譯一張圖
export const IMAGE_TRANSLATE_REQUEST = 'READLOOP_IMAGE_TRANSLATE_REQUEST';

// popup → 背景頁：使用者在 popup 按了「翻譯這頁的圖片」，切換那個分頁的自動翻譯（和快捷鍵同一條路）
export const IMAGE_TRANSLATE_PAGE_TOGGLE = 'READLOOP_IMAGE_TRANSLATE_PAGE_TOGGLE';
export const TRANSLATE_COMMAND = 'translate-images';

export interface PageToggleRequest {
    type: typeof IMAGE_TRANSLATE_PAGE_TOGGLE;
    tabId: number;
}

export interface AutoToggleMessage {
    type: typeof IMAGE_TRANSLATE_AUTO_TOGGLE;
}

/** 圖片目前在畫面上的位置；沒有（圖片不在畫面上）時背景頁只能直接抓原圖，抓不到就要等它出現在畫面上 */
export interface ImageGeometry {
    rect: ViewportRect;
    viewport: { width: number; height: number };
}

export interface TranslateRequest {
    type: typeof IMAGE_TRANSLATE_REQUEST;
    requestId: string;
    srcUrl: string;
    lang: LangChoice;
    // 自動判斷時先試的語言（同一部作品上一張判斷出的語言），通常一次就對
    hint?: SourceLang;
    geometry: ImageGeometry | null;
    // 預先翻譯（閱讀器在背景預載、還沒顯示的圖）：太小的圖直接略過，不浪費時間辨識
    prefetch: boolean;
    // 已知抓不到原圖（預翻下一頁）：直接擷取畫面，不先試著抓原圖，讓預翻的圖層顯示的時間越短越好
    skipFetch?: boolean;
}

export type TranslatedImage = Omit<ResultMessage, 'type'>;

export type TranslateResponse =
    | { ok: true; result: TranslatedImage }
    // skipped：不像漫畫頁（太小）；needsVisible：抓不到原圖，要等圖片出現在畫面上才能擷取
    // retryAt：translate-busy 時，翻譯服務預計可以再試的時間（毫秒時間戳）
    | { ok: false; code: ErrorMessage['code'] | 'skipped'; needsVisible?: boolean; retryAt?: number };

// ---------- 框選翻譯（自動翻譯中，使用者在圖上拖出一個框，只翻框裡的字） ----------

// 內容腳本 → 背景頁：翻譯一張圖裡的一塊；回覆 TranslateResponse，result 是併入新區塊之後的整張譯文
export const IMAGE_TRANSLATE_REGION = 'READLOOP_IMAGE_TRANSLATE_REGION';

export interface RegionRequest {
    type: typeof IMAGE_TRANSLATE_REGION;
    requestId: string;
    srcUrl: string;
    lang: LangChoice;
    hint?: SourceLang;
    geometry: ImageGeometry | null;
    // 框選的範圍，占整張原圖的比例（0 到 1）
    selection: { left: number; top: number; width: number; height: number };
    // 這張圖原本的譯文（有的話）：從它的底圖裁切，新區塊併進它的區塊裡
    base?: TranslatedImage;
}

// ---------- 本機譯文儲存與整本翻譯 ----------

// 內容腳本 → 背景頁：這張圖之前翻過嗎（存在擴充功能自己的 IndexedDB，見 translation-store.ts）
export const IMAGE_TRANSLATE_LOOKUP = 'READLOOP_IMAGE_TRANSLATE_LOOKUP';
// 內容腳本 → 背景頁：要在這個分頁整本翻譯了（背景頁記下這個分頁，之後才接受它送來的翻頁鍵）
export const IMAGE_TRANSLATE_BATCH_BEGIN = 'READLOOP_IMAGE_TRANSLATE_BATCH_BEGIN';
// 整本翻譯中的內容腳本 → 背景頁：在網頁本身的環境按一個翻頁鍵（閱讀器的鍵盤處理多半看 keyCode，隔離環境送的事件設不了）
export const IMAGE_TRANSLATE_BATCH_KEY = 'READLOOP_IMAGE_TRANSLATE_BATCH_KEY';
// 整本翻譯中的內容腳本 → 背景頁：進度；finished 時背景頁不再接受這個分頁的翻頁鍵
export const IMAGE_TRANSLATE_BATCH_PROGRESS = 'READLOOP_IMAGE_TRANSLATE_BATCH_PROGRESS';

export interface LookupRequest {
    type: typeof IMAGE_TRANSLATE_LOOKUP;
    srcUrl: string;
}

export interface BatchBeginRequest {
    type: typeof IMAGE_TRANSLATE_BATCH_BEGIN;
}

export interface BatchKeyRequest {
    type: typeof IMAGE_TRANSLATE_BATCH_KEY;
    key: string;
    keyCode: number;
}

export interface BatchProgress {
    type: typeof IMAGE_TRANSLATE_BATCH_PROGRESS;
    page: number;
    translated: number;
    saved: number;
    finished: boolean;
    busy?: boolean;
}

/** 整本翻譯的翻頁：網址 # 後面的頁碼加一；不是頁碼回傳 null */
export function nextHash(hash: string): string | null {
    const match = /^#(\d+)$/.exec(hash);
    return match ? `#${Number(match[1]) + 1}` : null;
}

/**
 * 本機譯文的鍵：圖片網址去掉主機（同一張圖，圖床常換子網域）；blob:／data: 網址每次都不同，不存
 */
export function translationKey(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.pathname + parsed.search;
    } catch {
        return null;
    }
}

// ---------- 背景頁 ↔ offscreen 文件 ----------

export const OFFSCREEN_TARGET = 'readloop-offscreen';
export const OFFSCREEN_ANALYZE = 'READLOOP_OFFSCREEN_ANALYZE';
export const OFFSCREEN_PROGRESS = 'READLOOP_OFFSCREEN_PROGRESS';

export interface AnalyzeRequest {
    target: typeof OFFSCREEN_TARGET;
    type: typeof OFFSCREEN_ANALYZE;
    requestId: string;
    dataUrl: string;
    lang: LangChoice;
    hint?: SourceLang;
    // 框選翻譯：整張圖就是使用者框起來的文字，不跑對話框偵測（見 ocr-engine.ts 的 analyzeRegion）
    region?: boolean;
}

export type AnalyzeResponse = ({ ok: true; lang: SourceLang } & ImageAnalysis) | { ok: false; code: 'model-download-failed' | 'analyze-failed'; detail: string };

export interface OffscreenProgress {
    type: typeof OFFSCREEN_PROGRESS;
    requestId: string;
    loaded: number;
    total: number;
}
