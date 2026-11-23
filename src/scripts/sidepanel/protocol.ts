/**
 * 側邊面板、內容腳本與背景頁之間共用的訊息與儲存鍵
 */

/** 面板向內容腳本要頁面內容 */
export const PAGE_CONTEXT_ACTION = 'getPageContext';

export interface PageContext {
    /** 文章文字 */
    text: string;
    /** 使用者目前選取的文字 */
    selection: string;
    title: string;
}

/** 右鍵選單「解說選取的文字」：背景頁寫進 chrome.storage.session，面板開啟後取走 */
export const PENDING_ASK_KEY = 'panelPendingAsk';

export interface PendingAsk {
    text: string;
    tabId: number;
    createdAt: number;
}

/** 某個網址的對話紀錄在 chrome.storage.session 裡的鍵（不含 # 之後的部分） */
export function chatKey(url: string): string {
    return `panelChat:${url.split('#')[0]}`;
}
