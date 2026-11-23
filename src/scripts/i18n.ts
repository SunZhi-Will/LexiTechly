/**
 * 介面文字的多語系入口（chrome.i18n，字串在 src/assets/_locales/）
 *
 * 目前只有擴充功能名稱、右鍵選單與歡迎頁走這裡；popup、單字頁與內容腳本的字串還是寫死的繁體中文，
 * 之後逐步搬過來。圖片翻譯有自己的 image-translate/i18n.ts。
 */

/** 取得目前語系的字串；找不到時回傳 key 本身，方便發現漏掉的字串 */
export function t(key: string, substitutions?: string | string[]): string {
    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
}

/**
 * 把頁面上標了 data-i18n 的元素換成目前語系的字串：
 * - data-i18n="key"：元素的文字
 * - data-i18n-placeholder="key"：輸入框的提示文字
 * - data-i18n-title="key"：滑鼠移上去的提示
 */
export function localizePage(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
        element.textContent = t(element.dataset.i18n as string);
    });
    root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((element) => {
        element.placeholder = t(element.dataset.i18nPlaceholder as string);
    });
    root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
        element.title = t(element.dataset.i18nTitle as string);
    });
    document.documentElement.lang = chrome.i18n.getUILanguage();
}
