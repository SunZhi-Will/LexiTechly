/// <reference types="chrome"/>

// 導入所有需要的模組
import { initReadingMode, lookupSelectionFromContextMenu } from './content/reading-mode';
import { injectStyles } from './content/styles';
import { PAGE_CONTEXT_ACTION, type PageContext } from './sidepanel/protocol';
import { getPageContent, analyzeContent, chatWithAI, analyzePageVocabulary, analyzeContentLocal, analyzePageVocabularyLocal } from './content/analysis';

// 等待 DOM 載入完成後再初始化
function initialize() {
    console.log('Readloop: 開始初始化...');
    
    // 初始化時注入樣式
    try {
        injectStyles();
        console.log('Readloop: 樣式注入成功');
    } catch (error) {
        console.error('Readloop: 樣式注入失敗', error);
    }

    // 啟動查閱模式
    try {
        initReadingMode();
        console.log('Readloop: 查閱模式初始化成功');
    } catch (error) {
        console.error('Readloop: 查閱模式初始化失敗', error);
    }
}

// 確保在 DOM 載入完成後才執行初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// 監聽來自 popup 的訊息
chrome.runtime.onMessage.addListener((
    request: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ChromeResponse) => void
): boolean => {
    console.log('Readloop: 收到訊息', request.action);

    if (request.action === 'analyze') {
        const content = getPageContent();

        if (request.useAi) {
            analyzeContent(content).then(result => {
                sendResponse(result);
            }).catch(error => {
                console.error('Readloop: 分析失敗', error);
                sendResponse({
                    error: error.message || '分析失敗'
                });
            });
        } else {
            analyzeContentLocal(content).then(result => sendResponse(result));
        }
        return true;

    } else if (request.action === 'chat') {
        const content = getPageContent();

        if (!request.useAi || !request.message) {
            sendResponse({
                error: 'API Key 或訊息未提供'
            });
            return true;
        }

        chatWithAI(content, request.message, request.history || []).then(result => {
            sendResponse(result);
        }).catch(error => {
            console.error('Readloop: 聊天失敗', error);
            sendResponse({
                error: error.message || '聊天失敗'
            });
        });
        return true;

    } else if (request.action === 'analyzeVocabulary') {
        const content = getPageContent();

        if (request.useAi) {
            analyzePageVocabulary(content).then(result => {
                sendResponse(result);
            }).catch(error => {
                console.error('Readloop: 單字分析失敗', error);
                sendResponse({
                    error: error.message || '單字分析失敗'
                });
            });
        } else {
            analyzePageVocabularyLocal(content).then(result => sendResponse(result));
        }
        return true;
    } else if (request.action === PAGE_CONTEXT_ACTION) {
        // 側邊面板要目前頁面的文章、選取的文字與標題
        const context: PageContext = {
            text: getPageContent(),
            selection: window.getSelection()?.toString() ?? '',
            title: document.title
        };
        (sendResponse as (response: unknown) => void)(context);
        return false;
    } else if (request.action === 'lookupSelection') {
        lookupSelectionFromContextMenu((request as any).text || '');
        sendResponse({ success: true });
        return true;
    }

    return false;
}); 