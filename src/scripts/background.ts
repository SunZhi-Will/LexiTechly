// Background Script for LexiTechly Extension
// 處理擴充功能的訊息通訊和狀態管理

import { handleAiMessage } from './ai/background';
import { t } from './i18n';
import { PENDING_ASK_KEY, type PendingAsk } from './sidepanel/protocol';

const EXPLAIN_MENU_ID = 'lexitechly-explain-selection';
import { createImageTranslateMenus, installImageTranslate } from './image-translate/image-translate';

interface MessageRequest {
    action: string;
    source?: string;
    currentUrl?: string;
    word?: string; // 添加單字參數
    [key: string]: any;
}

interface MessageResponse {
    success: boolean;
    error?: string;
    [key: string]: any;
}

// 監聽來自 content scripts 和 popup 的訊息
chrome.runtime.onMessage.addListener((
    message: MessageRequest, 
    sender: chrome.runtime.MessageSender, 
    sendResponse: (response: MessageResponse) => void
) => {
    // 圖片翻譯的訊息用 type 欄位、由 installImageTranslate 的監聽器處理（見檔案最下方）。
    // 這裡不能替它們回應，否則下面的「未知的訊息類型」會搶先回覆，蓋掉圖片翻譯的非同步結果
    if (typeof message?.action !== 'string') return false;

    // AI 請求（頁面分析、查詞、單字詳解）統一從這裡出去
    if (handleAiMessage(message, sender, sendResponse)) return true;

    console.log('Background script 收到訊息:', message.action);

    // 處理切換到單字列表頁面的請求
    if (message.action === 'switchToVocabularyPage') {
        console.log('處理切換到單字列表頁面請求');
        
        try {
            // 構建 URL，包含單字參數
            let vocabularyUrl = chrome.runtime.getURL('src/pages/vocabulary.html');
            if (message.word && message.word.trim()) {
                const wordParam = encodeURIComponent(message.word.trim());
                vocabularyUrl += `?word=${wordParam}`;
                console.log('將開啟單字列表並定位到單字:', message.word);
            }
            
            // 直接打開單字列表頁面，不需要先開啟 popup
            chrome.tabs.create({
                url: vocabularyUrl
            }, (tab) => {
                if (chrome.runtime.lastError) {
                    console.error('無法打開單字列表頁面:', chrome.runtime.lastError);
                    sendResponse({ 
                        success: false, 
                        error: chrome.runtime.lastError.message || '無法打開新標籤頁' 
                    });
                } else {
                    console.log('成功打開單字列表頁面:', tab);
                    sendResponse({ success: true });
                }
            });
        } catch (error) {
            console.error('處理切換到單字列表頁面時發生錯誤:', error);
            sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : '未知錯誤' 
            });
        }
        return true; // 保持訊息通道開啟
    }

    // 處理打開單字列表頁面的請求
    if (message.action === 'openVocabularyPage') {
        console.log('處理打開單字列表頁面請求');
        
        try {
            // 構建 URL，包含單字參數
            let vocabularyUrl = chrome.runtime.getURL('src/pages/vocabulary.html');
            if (message.word && message.word.trim()) {
                const wordParam = encodeURIComponent(message.word.trim());
                vocabularyUrl += `?word=${wordParam}`;
                console.log('將開啟單字列表並定位到單字:', message.word);
            }
            
            chrome.tabs.create({
                url: vocabularyUrl
            }, (tab) => {
                if (chrome.runtime.lastError) {
                    console.error('無法打開單字列表頁面:', chrome.runtime.lastError);
                    sendResponse({ 
                        success: false, 
                        error: chrome.runtime.lastError.message || '無法打開新標籤頁' 
                    });
                } else {
                    console.log('成功打開單字列表頁面:', tab);
                    sendResponse({ success: true });
                }
            });
        } catch (error) {
            console.error('打開單字列表頁面時發生錯誤:', error);
            sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : '未知錯誤' 
            });
        }
        return true; // 保持訊息通道開啟
    }

    // 處理其他訊息
    console.log('未處理的訊息類型:', message.action);
    sendResponse({ success: false, error: '未知的訊息類型' });
});

// 監聽擴充功能安裝事件
chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
    console.log('LexiTechly 擴充功能已安裝/更新:', details);

    // 第一次安裝時開歡迎頁：說明免設定就能用的功能，並讓使用者選擇要不要填 API Key
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/welcome.html') });
    }
    
    // 初始化擴充功能設定
    chrome.storage.local.get(['apiKey', 'settings'], (result) => {
        if (!result.apiKey) {
            console.log('初始化擴充功能設定...');
            chrome.storage.local.set({
                apiKey: '',
                settings: {
                    theme: 'auto',
                    speechEnabled: true,
                    speechSpeed: 'normal'
                }
            });
        }
    });

    // 建立右鍵選單：查詢選取文字
    try {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: 'lexitechly-lookup-selection',
                title: t('menuLookupSelection'),
                contexts: ['selection']
            });
            chrome.contextMenus.create({
                id: EXPLAIN_MENU_ID,
                title: t('menuExplainSelection'),
                contexts: ['selection']
            });
            // 圖片翻譯的選單要在 removeAll 之後、同一個流程裡建立
            createImageTranslateMenus();
        });
    } catch (error) {
        console.error('建立 contextMenus 失敗:', error);
    }
});

// 監聽右鍵選單點擊
chrome.contextMenus?.onClicked.addListener((info, tab) => {
    if (info.menuItemId === EXPLAIN_MENU_ID && info.selectionText && tab?.id) {
        // sidePanel.open 必須在使用者操作的當下直接呼叫，前面不能先 await 別的東西
        void chrome.sidePanel.open({ tabId: tab.id }).catch((error) => console.error('無法開啟側邊面板:', error));
        const pending: PendingAsk = { text: info.selectionText, tabId: tab.id, createdAt: Date.now() };
        void chrome.storage.session.set({ [PENDING_ASK_KEY]: pending });
        return;
    }
    if (info.menuItemId === 'lexitechly-lookup-selection' && info.selectionText && tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
            action: 'lookupSelection',
            text: info.selectionText
        });
    }
});

// 圖片翻譯（右鍵選單、Alt+Shift+T 自動翻譯）：監聽器要在頂層同步註冊，service worker 被喚醒時才接得到事件
installImageTranslate();

console.log('LexiTechly Background Script 已載入');

// 添加 export 語句以使其成為模組
export {}; 