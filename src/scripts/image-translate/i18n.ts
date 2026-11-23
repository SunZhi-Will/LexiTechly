/**
 * 圖片翻譯自己的小型多語系：Readloop 其他介面只有繁體中文，這裡只帶圖片翻譯用到的字串。
 *
 * 語系跟著瀏覽器介面語言走（沒有語言設定可選），它同時也是譯文的目標語言：
 * 繁體中文、簡體中文、日文的瀏覽器翻成各自的語言，其他一律翻成英文。
 */

import { MESSAGES, type MessageKey } from './messages';

export type { MessageKey };

export const LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja'] as const;

export type Locale = typeof LOCALES[number];

export type MessageParams = Record<string, string | number>;

/**
 * 把瀏覽器語言代碼（zh-TW、zh-HK、zh-Hans-CN、ja-JP、en-US…）對應到支援的語系，沒有對應的一律用英文
 */
export function matchLocale(languageTag: string | undefined | null): Locale {
    const tag = (languageTag || '').toLowerCase().replace('_', '-');
    if (tag.startsWith('zh')) {
        if (/^zh-(cn|sg|my)\b/.test(tag) || tag.includes('hans')) return 'zh-CN';
        return 'zh-TW';
    }
    if (tag.startsWith('ja')) return 'ja';
    return 'en';
}

function detectLocale(): Locale {
    try {
        if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
            return matchLocale(chrome.i18n.getUILanguage());
        }
    } catch {
        // 擴充功能重新載入後，舊的內容腳本會失去 chrome.*，改用 navigator
    }
    return matchLocale(typeof navigator !== 'undefined' ? navigator.language : undefined);
}

const currentLocale: Locale = detectLocale();

/** 語系在載入時就決定好了；保留這個函式是為了讓呼叫端的流程不用改 */
export function initI18n(): Promise<void> {
    return Promise.resolve();
}

export function getLocale(): Locale {
    return currentLocale;
}

/**
 * 取得目前語系的字串；字串中的 {name} 以 params 代入
 */
export function t(key: MessageKey, params?: MessageParams): string {
    const template = MESSAGES[currentLocale]?.[key] ?? MESSAGES['zh-TW'][key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
}
