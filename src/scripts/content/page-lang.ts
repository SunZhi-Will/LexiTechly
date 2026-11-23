/**
 * 目前頁面的學習語言（內容腳本用）
 *
 * 滑鼠移動時的斷詞是同步的，沒辦法每次都去讀設定，所以把「這個頁面要當成哪種語言」算好放在這裡。
 * 偵測要讀整頁文字，只在開啟查閱模式或第一次查詢時才做，不在每個網頁載入時做。
 */

import { langOfSnippet } from '../lang/detect';
import { DEFAULT_LEARNING_LANG, type LearningLang, type NativeLang } from '../lang/languages';
import {
    LEARNING_LANG_KEY,
    NATIVE_LANG_KEY,
    getLanguageSettings,
    resolveLearningLangOrDefault,
    type LearningLangSetting
} from '../lang/settings';

let pageLang: LearningLang = DEFAULT_LEARNING_LANG;
let setting: LearningLangSetting = 'auto';
let nativeLang: NativeLang = 'zh-TW';
let loaded = false;

function pageSample(): string {
    const article = document.querySelector('article') || document.body;
    return (article?.innerText ?? '').slice(0, 6000);
}

/** 重新讀取語言設定並判斷頁面語言 */
export async function refreshPageLanguage(): Promise<void> {
    const settings = await getLanguageSettings();
    setting = settings.learningLang;
    nativeLang = settings.nativeLang;
    pageLang = resolveLearningLangOrDefault(setting, pageSample());
    loaded = true;
}

/** 目前頁面的學習語言；還沒判斷過時是英文 */
export function getActiveLang(): LearningLang {
    return pageLang;
}

/** 一段選取或查詢的文字要當成哪種語言，以及說明要用哪種語言寫 */
export async function languagesForSnippet(text: string): Promise<{ lang: LearningLang; native: NativeLang }> {
    if (!loaded) await refreshPageLanguage();
    return { lang: langOfSnippet(text, pageLang, setting), native: nativeLang };
}

/**
 * 選取這段文字後要不要顯示查詢按鈕。
 *
 * 選到的是自己的母語（例如中文使用者在中文網頁上選字）就不顯示，免得每次選字都跳出按鈕；
 * 除非使用者明確指定要學那個語言。母語是英文時一律顯示：很多學英文的人瀏覽器介面就是英文。
 */
export function shouldOfferLookup(text: string): boolean {
    if (!/\p{L}/u.test(text)) return false;
    if (!loaded) {
        // 還沒判斷過頁面語言：先照舊規則（有英文字母才顯示），同時開始判斷，下次選取就準了
        void refreshPageLanguage();
        return /[A-Za-z]/.test(text);
    }
    const lang = langOfSnippet(text, pageLang, setting);
    const nativeAsLearning = nativeLang.startsWith('zh') ? 'zh' : nativeLang;
    return !(lang === nativeAsLearning && lang !== 'en' && setting !== lang);
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !loaded) return;
    if (LEARNING_LANG_KEY in changes || NATIVE_LANG_KEY in changes) void refreshPageLanguage();
});
