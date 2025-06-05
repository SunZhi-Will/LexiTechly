/// <reference types="chrome"/>

// 導入所有需要的模組
import { initReadingMode } from './content/reading-mode';
import { injectStyles } from './content/styles';
import { getPageContent, analyzeContent, chatWithAI, analyzePageVocabulary } from './content/analysis';

// 等待 DOM 載入完成後再初始化
function initialize() {
    console.log('LexiTechly: 開始初始化...');
    
    // 初始化時注入樣式
    try {
        injectStyles();
        console.log('LexiTechly: 樣式注入成功');
    } catch (error) {
        console.error('LexiTechly: 樣式注入失敗', error);
    }

    // 啟動查閱模式
    try {
        initReadingMode();
        console.log('LexiTechly: 查閱模式初始化成功');
    } catch (error) {
        console.error('LexiTechly: 查閱模式初始化失敗', error);
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
    console.log('LexiTechly: 收到訊息', request.action);

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
            console.error('LexiTechly: 分析失敗', error);
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
            console.error('LexiTechly: 聊天失敗', error);
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
            console.error('LexiTechly: 單字分析失敗', error);
            sendResponse({
                error: error.message || '單字分析失敗'
            });
        });
        return true;
    }

    return false;
}); 