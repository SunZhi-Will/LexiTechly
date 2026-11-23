/**
 * 背景頁的訊息來源檢查
 *
 * 內容腳本跑在別人的網頁裡，但 sender.id 與擴充功能自己的頁面相同，光比對 sender.id 分不出來。
 * 擴充功能頁面的 sender.url 在 chrome-extension://<id>/ 底下，內容腳本的 sender.url 是它所在網頁的網址。
 */

export function isFromExtensionPage(sender: { id?: string; url?: string }): boolean {
    if (sender.id !== chrome.runtime.id || typeof sender.url !== 'string') return false;
    return sender.url.startsWith(chrome.runtime.getURL(''));
}

/**
 * 訊息是否來自我們注入到某個分頁的內容腳本
 */
export function isFromContentScript(sender: { id?: string; url?: string; tab?: { id?: number } }): boolean {
    return sender.id === chrome.runtime.id && typeof sender.tab?.id === 'number' && !isFromExtensionPage(sender);
}
