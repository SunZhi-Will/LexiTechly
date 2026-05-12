// Background Script for LexiTechly Extension
// 處理擴充功能的訊息通訊和狀態管理

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
    console.log('Background script 收到訊息:', message, '來自:', sender);

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

    // 由 background 代為請求 Google 翻譯 TTS 音檔（避免 CORS）
    if (message.action === 'getGoogleTranslateTts') {
        const text = typeof message.text === 'string' ? message.text.trim() : '';
        const lang = typeof message.lang === 'string' ? message.lang : 'en';
        if (!text) {
            sendResponse({ success: false, error: 'Missing text' });
            return false;
        }
        const MAX_CHARS = 200;
        const chunk = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
        fetch(url, {
            method: 'GET',
            headers: {
                'Referer': 'https://translate.google.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.arrayBuffer();
            })
            .then(buf => {
                const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                const contentType = 'audio/mp3';
                sendResponse({ success: true, data: base64, contentType });
            })
            .catch(err => {
                sendResponse({ success: false, error: err instanceof Error ? err.message : 'Fetch failed' });
            });
        return true; // 非同步回應
    }

    // 處理其他訊息
    console.log('未處理的訊息類型:', message.action);
    sendResponse({ success: false, error: '未知的訊息類型' });
});

// 監聽擴充功能安裝事件
chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
    console.log('LexiTechly 擴充功能已安裝/更新:', details);
    
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
                title: '用 LexiTechly 查詢「%s」',
                contexts: ['selection']
            });
        });
    } catch (error) {
        console.error('建立 contextMenus 失敗:', error);
    }
});

// 監聽右鍵選單點擊
chrome.contextMenus?.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'lexitechly-lookup-selection' && info.selectionText && tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
            action: 'lookupSelection',
            text: info.selectionText
        });
    }
});

// 監聽標籤頁更新事件
chrome.tabs.onUpdated.addListener((
    tabId: number, 
    changeInfo: any, 
    tab: chrome.tabs.Tab
) => {
    if (changeInfo.status === 'complete' && tab.url) {
        console.log('標籤頁已更新:', tab.url);
        
        // 檢查是否為 Gmail 頁面
        if (tab.url.includes('mail.google.com')) {
            console.log('檢測到 Gmail 頁面，可能需要特殊處理');
        }
    }
});

// 監聽擴充功能圖示點擊事件
chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
    console.log('擴充功能圖示被點擊，標籤頁:', tab);
    
    // 如果 popup 未定義，則打開新標籤頁
    chrome.action.getPopup({}, (popup) => {
        if (chrome.runtime.lastError || !popup) {
            console.log('Popup 未定義，打開新標籤頁');
            chrome.tabs.create({
                url: chrome.runtime.getURL('src/pages/popup.html')
            });
        }
    });
});

console.log('LexiTechly Background Script 已載入');

// 添加 export 語句以使其成為模組
export {}; 