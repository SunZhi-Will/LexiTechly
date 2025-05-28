/// <reference types="chrome"/>

export { }; // 使此檔案成為模組

// 導入模組化功能
import { initReadingMode } from './content/reading-mode';
import { injectStyles } from './content/styles';
import { getPageContent, analyzeContent, chatWithAI, analyzePageVocabulary } from './content/analysis';

// 初始化時注入樣式
try {
    injectStyles();
} catch (error) {
    // 靜默處理錯誤
}

// 啟動查閱模式
try {
    initReadingMode();
} catch (error) {
    // 靜默處理錯誤
}

// 監聽來自 popup 的訊息
chrome.runtime.onMessage.addListener((
    request: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ChromeResponse) => void
): boolean => {

    if (request.action === 'analyze') {
        const content = getPageContent();

        if (!request.apiKey) {
            sendResponse({
                error: 'API Key 未提供'
            });
            return true;
        }

        analyzeContent(content, request.apiKey).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({
                error: error.message || '分析失敗'
            });
        });
        return true;

    } else if (request.action === 'chat') {
        const content = getPageContent();

        if (!request.apiKey || !request.message) {
            sendResponse({
                error: 'API Key 或訊息未提供'
            });
            return true;
        }

        chatWithAI(content, request.message, request.apiKey, request.history || []).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({
                error: error.message || '聊天失敗'
            });
        });
        return true;

    } else if (request.action === 'analyzeVocabulary') {
        const content = getPageContent();

        if (!request.apiKey) {
            sendResponse({
                error: 'API Key 未提供'
            });
            return true;
        }

        analyzePageVocabulary(content, request.apiKey).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({
                error: error.message || '單字分析失敗'
            });
        });
        return true;
    }

    return false;
}); 