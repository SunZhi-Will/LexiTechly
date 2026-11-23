/**
 * 語言定義：Readloop 支援「學習哪種語言」與「用哪種語言解說」兩個獨立的設定。
 *
 * - 學習語言（LearningLang）：正在讀的內容是什麼語言，決定斷詞方式、分級系統與發音。
 * - 解說語言（NativeLang）：翻譯與說明要用什麼語言寫。
 *
 * 這個檔案只有資料與純函式，不碰 chrome API，內容腳本、擴充頁面與測試都能用。
 */

export type LearningLang = 'en' | 'ja' | 'ko' | 'zh' | 'es' | 'fr' | 'de';
export type NativeLang = 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko';
export type LevelSystem = 'CEFR' | 'JLPT' | 'TOPIK' | 'HSK';

/** 文字系統：決定怎麼判斷一個字元屬不屬於這個語言、以及怎麼斷詞 */
export type Script = 'latin' | 'japanese' | 'korean' | 'chinese';

export interface LearningLanguage {
    code: LearningLang;
    /** 寫在 AI prompt 裡的名稱 */
    englishName: string;
    /** 顯示給使用者看的名稱（該語言自己的寫法） */
    nativeName: string;
    script: Script;
    levelSystem: LevelSystem;
    /** 語音合成用的語言代碼 */
    ttsLang: string;
    /** MyMemory 翻譯 API 的語言代碼 */
    translateCode: string;
    /** 單字至少要幾個字元才算（太短的多半是虛詞，不值得查） */
    minWordLength: number;
}

/** 各分級系統的等級，由易到難 */
export const LEVELS: Record<LevelSystem, readonly string[]> = {
    CEFR: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    JLPT: ['N5', 'N4', 'N3', 'N2', 'N1'],
    TOPIK: ['TOPIK1', 'TOPIK2', 'TOPIK3', 'TOPIK4', 'TOPIK5', 'TOPIK6'],
    // 用舊版六級制：大多數教材與字表仍以它標示
    HSK: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6']
};

export const LEARNING_LANGUAGES: Record<LearningLang, LearningLanguage> = {
    en: { code: 'en', englishName: 'English', nativeName: 'English', script: 'latin', levelSystem: 'CEFR', ttsLang: 'en-US', translateCode: 'en', minWordLength: 3 },
    ja: { code: 'ja', englishName: 'Japanese', nativeName: '日本語', script: 'japanese', levelSystem: 'JLPT', ttsLang: 'ja-JP', translateCode: 'ja', minWordLength: 1 },
    ko: { code: 'ko', englishName: 'Korean', nativeName: '한국어', script: 'korean', levelSystem: 'TOPIK', ttsLang: 'ko-KR', translateCode: 'ko', minWordLength: 1 },
    zh: { code: 'zh', englishName: 'Chinese', nativeName: '中文', script: 'chinese', levelSystem: 'HSK', ttsLang: 'zh-TW', translateCode: 'zh-TW', minWordLength: 1 },
    es: { code: 'es', englishName: 'Spanish', nativeName: 'Español', script: 'latin', levelSystem: 'CEFR', ttsLang: 'es-ES', translateCode: 'es', minWordLength: 2 },
    fr: { code: 'fr', englishName: 'French', nativeName: 'Français', script: 'latin', levelSystem: 'CEFR', ttsLang: 'fr-FR', translateCode: 'fr', minWordLength: 2 },
    de: { code: 'de', englishName: 'German', nativeName: 'Deutsch', script: 'latin', levelSystem: 'CEFR', ttsLang: 'de-DE', translateCode: 'de', minWordLength: 2 }
};

export interface NativeLanguage {
    code: NativeLang;
    /** 寫在 AI prompt 裡的名稱 */
    promptName: string;
    nativeName: string;
    /** MyMemory 翻譯 API 的語言代碼 */
    translateCode: string;
}

export const NATIVE_LANGUAGES: Record<NativeLang, NativeLanguage> = {
    'zh-TW': { code: 'zh-TW', promptName: 'Traditional Chinese as used in Taiwan', nativeName: '繁體中文', translateCode: 'zh-TW' },
    'zh-CN': { code: 'zh-CN', promptName: 'Simplified Chinese', nativeName: '简体中文', translateCode: 'zh-CN' },
    en: { code: 'en', promptName: 'English', nativeName: 'English', translateCode: 'en' },
    ja: { code: 'ja', promptName: 'Japanese', nativeName: '日本語', translateCode: 'ja' },
    ko: { code: 'ko', promptName: 'Korean', nativeName: '한국어', translateCode: 'ko' }
};

export const DEFAULT_LEARNING_LANG: LearningLang = 'en';

export function isLearningLang(value: unknown): value is LearningLang {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEARNING_LANGUAGES, value);
}

export function isNativeLang(value: unknown): value is NativeLang {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NATIVE_LANGUAGES, value);
}

export function levelsFor(lang: LearningLang): readonly string[] {
    return LEVELS[LEARNING_LANGUAGES[lang].levelSystem];
}

/**
 * 把模型回傳的等級整理成該語言分級系統裡的寫法（例如 "b2"、"JLPT N3"、"TOPIK 4級"、"HSK 5"）。
 * 認不出來時回傳 null。
 */
export function normalizeLevel(lang: LearningLang, raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const system = LEARNING_LANGUAGES[lang].levelSystem;
    const levels = LEVELS[system];
    const compact = raw.toUpperCase().replace(/[\s\-_.]/g, '');
    if (levels.includes(compact)) return compact;

    if (system === 'CEFR') {
        const match = compact.match(/[ABC][12]/);
        return match ? match[0] : null;
    }
    if (system === 'JLPT') {
        const match = compact.match(/N([1-5])/);
        return match ? `N${match[1]}` : null;
    }
    // TOPIK、HSK：取第一個落在範圍內的數字
    const digit = compact.match(/[1-6]/);
    return digit ? `${system}${digit[0]}` : null;
}

/** 等級在該語言分級系統中的位置（0 最簡單）；不是該系統的等級時回傳 -1 */
export function levelRank(lang: LearningLang, level: string): number {
    return levelsFor(lang).indexOf(level);
}

/** 這個語言分級系統的中間等級，在沒有其他資訊時當作預設 */
export function middleLevel(lang: LearningLang): string {
    const levels = levelsFor(lang);
    return levels[Math.floor((levels.length - 1) / 2)];
}

/** 由瀏覽器介面語言推測解說語言 */
export function nativeLangFromUiLanguage(uiLanguage: string): NativeLang {
    const lower = uiLanguage.toLowerCase();
    if (lower.startsWith('zh')) {
        return /^zh-(tw|hk|mo|hant)/.test(lower) ? 'zh-TW' : 'zh-CN';
    }
    if (lower.startsWith('ja')) return 'ja';
    if (lower.startsWith('ko')) return 'ko';
    return 'en';
}
