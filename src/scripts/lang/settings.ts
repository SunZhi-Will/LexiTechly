/**
 * 語言設定的讀寫（chrome.storage.local）
 *
 * learningLang：'auto' 代表依頁面內容自動判斷；nativeLang 沒設定時跟著瀏覽器介面語言。
 */

import { detectLearningLang } from './detect';
import {
    DEFAULT_LEARNING_LANG,
    isLearningLang,
    isNativeLang,
    nativeLangFromUiLanguage,
    type LearningLang,
    type NativeLang
} from './languages';

export const LEARNING_LANG_KEY = 'learningLang';
export const NATIVE_LANG_KEY = 'nativeLang';

export type LearningLangSetting = LearningLang | 'auto';

export interface LanguageSettings {
    learningLang: LearningLangSetting;
    nativeLang: NativeLang;
}

export function defaultNativeLang(): NativeLang {
    return nativeLangFromUiLanguage(chrome.i18n.getUILanguage());
}

export async function getLanguageSettings(): Promise<LanguageSettings> {
    const stored = await chrome.storage.local.get([LEARNING_LANG_KEY, NATIVE_LANG_KEY]);
    const learning = stored[LEARNING_LANG_KEY];
    const native = stored[NATIVE_LANG_KEY];
    return {
        learningLang: isLearningLang(learning) ? learning : 'auto',
        nativeLang: isNativeLang(native) ? native : defaultNativeLang()
    };
}

export async function saveLanguageSettings(settings: Partial<LanguageSettings>): Promise<void> {
    const update: Record<string, string> = {};
    if (settings.learningLang) update[LEARNING_LANG_KEY] = settings.learningLang;
    if (settings.nativeLang) update[NATIVE_LANG_KEY] = settings.nativeLang;
    await chrome.storage.local.set(update);
}

/**
 * 決定這段文字要當成哪種語言來學：使用者指定了就照指定的，否則自動判斷；
 * 判斷不出來回傳 null，由呼叫端決定要報錯還是用預設值。
 */
export function resolveLearningLang(setting: LearningLangSetting, text: string): LearningLang | null {
    return setting === 'auto' ? detectLearningLang(text) : setting;
}

/** 和 resolveLearningLang 一樣，但判斷不出來時用英文 */
export function resolveLearningLangOrDefault(setting: LearningLangSetting, text: string): LearningLang {
    return resolveLearningLang(setting, text) ?? DEFAULT_LEARNING_LANG;
}
