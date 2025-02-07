// 在文件開頭加入暫存變數
let lastAnalysisResult = null;
let chatHistory = [];
let currentTabUrl = '';
let accumulatedVocabulary = []; // 累積的單字
let currentPageVocabulary = []; // 當前頁面的單字
let wordAnalysisCache = {};
let audioCache = {};
let currentAudio = null;
let lastPlayedText = null;
let lastPlayedSpeed = 'normal';

// 將函數移到外部
function updateVocabularyUI(isLoading = false) {
    const vocabularyContainer = document.getElementById('vocabulary-list');
    vocabularyContainer.innerHTML = '';

    // 添加跳出按鈕
    const popoutButton = document.createElement('button');
    popoutButton.className = 'popout-button';
    popoutButton.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
        </svg>
    `;
    popoutButton.onclick = () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL('vocabulary.html')
        });
    };
    vocabularyContainer.appendChild(popoutButton);

    if (isLoading) {
        vocabularyContainer.innerHTML = `
            <div class="word-card loading-card">
                <div class="loading-spinner"></div>
                <p style="color: #5f6368; text-align: center; margin-top: 12px;">正在分析單字...</p>
            </div>
        `;
        return;
    }

    // 如果兩個列表都是空的，顯示提示訊息
    if ((!accumulatedVocabulary || accumulatedVocabulary.length === 0) &&
        (!currentPageVocabulary || currentPageVocabulary.length === 0)) {
        vocabularyContainer.innerHTML = `
            <div class="word-card" style="text-align: center;">
                <p style="color: #5f6368; margin-bottom: 8px;">尚未收集任何單字</p>
                <p style="color: #5f6368; font-size: 12px;">請先進行頁面分析來收集單字</p>
                <svg style="width: 48px; height: 48px; fill: #9aa0a6; margin-top: 12px;" viewBox="0 0 24 24">
                    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 9h8v2h-8zm0-3h8v2h-8zm0 6h4v2h-4z"/>
                </svg>
            </div>
        `;
        return;
    }

    // 添加當前頁面單字區塊
    if (currentPageVocabulary && currentPageVocabulary.length > 0) {
        const currentPageSection = document.createElement('div');
        currentPageSection.className = 'vocabulary-section';
        currentPageSection.innerHTML = `
            <h3 class="section-title">當前頁面單字</h3>
            <div class="word-list current-page"></div>
        `;
        vocabularyContainer.appendChild(currentPageSection);

        const currentPageList = currentPageSection.querySelector('.word-list');
        currentPageVocabulary.forEach(word => {
            const wordCard = createWordCard(word);
            currentPageList.appendChild(wordCard);
        });
    }

    // 添加累積單字區塊（排除當前頁面的單字）
    if (accumulatedVocabulary && accumulatedVocabulary.length > 0) {
        // 過濾出不在當前頁面的單字
        const filteredAccumulatedWords = accumulatedVocabulary.filter(accWord =>
            !currentPageVocabulary.some(currentWord =>
                currentWord.text.toLowerCase() === accWord.text.toLowerCase()
            )
        );

        // 只有在有過濾後的單字時才顯示累積單字區塊
        if (filteredAccumulatedWords.length > 0) {
            const accumulatedSection = document.createElement('div');
            accumulatedSection.className = 'vocabulary-section';
            accumulatedSection.innerHTML = `
                <h3 class="section-title">累積單字</h3>
                <div class="word-list accumulated"></div>
            `;
            vocabularyContainer.appendChild(accumulatedSection);

            const accumulatedList = accumulatedSection.querySelector('.word-list');
            filteredAccumulatedWords.forEach(word => {
                const wordCard = createWordCard(word);
                accumulatedList.appendChild(wordCard);
            });
        }
    }
}

// 新增建立單字卡片的輔助函數
function createWordCard(word) {
    const wordCard = document.createElement('div');
    wordCard.className = 'word-card';
    wordCard.innerHTML = `
        <div class="word-header">
            <div class="word-text">${word.text}</div>
            <div class="word-level">${word.level || 'N/A'}</div>
        </div>
        <div class="word-details">${word.example || '暫無例句'}</div>
        <div class="word-translation">${word.translation || '暫無翻譯'}</div>
    `;
    return wordCard;
}

// 主要的 DOMContentLoaded 事件監聽器
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化設定頁面
    initializeSettingsPage();

    // 初始化清除功能
    initializeClearDataFeature();

    // 載入已儲存的數據
    const { apiKey, savedAnalysis, savedChat, savedUrl } = await chrome.storage.local.get(['apiKey', 'savedAnalysis', 'savedChat', 'savedUrl']);

    // 獲取當前 tab 的 URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab.url;

    // 只有在切換到新的 URL 時才清除記錄
    if (savedUrl && savedUrl !== currentTabUrl) {
        // 清除舊記錄
        chrome.storage.local.remove(['savedAnalysis', 'savedChat']);
        lastAnalysisResult = null;
        chatHistory = [];

        // 重置顯示
        document.getElementById('level').textContent = '-';
        document.getElementById('vocabulary').textContent = '-';
        document.getElementById('grammar').textContent = '-';
        document.getElementById('topic').textContent = '-';
        document.getElementById('chat-messages').innerHTML = '';

        // 更新儲存的 URL
        chrome.storage.local.set({ savedUrl: currentTabUrl });
    } else {
        // 在同一頁面，恢復儲存的狀態
        if (savedAnalysis) {
            lastAnalysisResult = savedAnalysis;
            displayAnalysisResult(savedAnalysis);
        }
        if (savedChat) {
            chatHistory = savedChat;
            restoreChatHistory(savedChat);
        }
    }

    // 載入深色模式設定
    const { darkMode } = await chrome.storage.local.get('darkMode');
    if (darkMode) {
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode').checked = true;
    }

    // 監聽深色模式切換
    document.getElementById('dark-mode').addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.classList.add('dark-mode');
            chrome.storage.local.set({ darkMode: true });
        } else {
            document.body.classList.remove('dark-mode');
            chrome.storage.local.set({ darkMode: false });
        }
    });

    // 添加底部導航欄事件監聽
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.dataset.page;
            switchPage(pageId);
        });
    });

    // 監聽分析按鈕
    document.getElementById('analyze').addEventListener('click', async () => {
        const { apiKey } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
            showError('請先設定 API Key');
            return;
        }

        showLoading(true);
        document.getElementById('error-message').style.display = 'none';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            chrome.tabs.sendMessage(tab.id, {
                action: 'analyze',
                apiKey
            }, async (response) => {
                showLoading(false);

                if (chrome.runtime.lastError) {
                    showError(chrome.runtime.lastError.message);
                    return;
                }

                if (!response) {
                    showError('未收到回應');
                    return;
                }

                if (response.error) {
                    showError(response.error);
                    return;
                }

                try {
                    // 修正這裡：response.level 就是分析結果
                    const analysisResult = response.level;
                    if (!analysisResult || !analysisResult.level) {
                        showError('分析結果格式錯誤');
                        return;
                    }

                    // 儲存分析結果
                    lastAnalysisResult = analysisResult;
                    // 顯示結果
                    displayAnalysisResult(analysisResult);

                    // 分析文本中的單字，傳入 apiKey
                    if (response.text) {
                        await analyzeVocabulary(response.text, apiKey);
                    }
                } catch (error) {
                    console.error('解析錯誤:', error);
                    showError('解析回應失敗');
                }
            });
        } catch (error) {
            showLoading(false);
            showError(error.message || '無法分析頁面內容');
        }
    });

    // 監聽 API Key 輸入
    document.getElementById('gemini-api-key').addEventListener('input', updateAnalyzeButtonState);

    // 監聽儲存 Gemini API Key 按鈕
    document.getElementById('save-gemini-api-key').addEventListener('click', async () => {
        const apiKey = document.getElementById('gemini-api-key').value.trim();
        await chrome.storage.local.set({ apiKey });
        showMessage('Gemini API Key 已儲存');
        updateAnalyzeButtonState();
    });

    // 監聽儲存 Speechify API Key 按鈕
    document.getElementById('save-speechify-api-key').addEventListener('click', async () => {
        const speechifyApiKey = document.getElementById('speechify-api-key').value.trim();
        await chrome.storage.local.set({ speechifyApiKey });
        showMessage('Speechify API Key 已儲存');
    });

    // 監聽發送訊息按鈕和輸入框
    document.getElementById('send-message').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // 監聽清除對話按鈕
    document.getElementById('clear-chat').addEventListener('click', () => {
        chatHistory = [];
        document.getElementById('chat-messages').innerHTML = '';
        chrome.storage.local.remove('savedChat');
    });

    // 恢復已儲存的狀態
    if (apiKey) {
        document.getElementById('gemini-api-key').value = apiKey;
        switchPage('main-page');
    } else {
        switchPage('settings-page');
    }

    updateAnalyzeButtonState();

    // 載入設定
    chrome.storage.local.get(['apiKey', 'speechifyApiKey'], function (data) {
        if (data.apiKey) {
            document.getElementById('gemini-api-key').value = data.apiKey;
        }
        if (data.speechifyApiKey) {
            document.getElementById('speechify-api-key').value = data.speechifyApiKey;
        }
    });

    // 設定區塊的展開/收合功能
    document.querySelectorAll('.settings-section.collapsible').forEach(section => {
        const header = section.querySelector('.section-header');
        const content = section.querySelector('.section-content');

        // 預設收合狀態
        section.classList.remove('active');
        content.style.display = 'none';

        // 點擊事件處理
        header.addEventListener('click', () => {
            const isActive = section.classList.toggle('active');
            content.style.display = isActive ? 'block' : 'none';
        });
    });

    // 從 chrome.storage 讀取儲存的單字列表
    const { accumulatedVocabulary: savedAccumulated, currentPageVocabulary: savedCurrent } =
        await chrome.storage.local.get(['accumulatedVocabulary', 'currentPageVocabulary']);

    if (savedAccumulated) {
        accumulatedVocabulary = savedAccumulated;
    }
    if (savedCurrent) {
        currentPageVocabulary = savedCurrent;
    }
    updateVocabularyUI();
});

// 初始化設定頁面功能
function initializeSettingsPage() {
    const settingsPage = document.getElementById('settings-page');
    if (settingsPage && settingsPage.classList.contains('active')) {
        updateStorageUsage();
    }

    // 監聽設定頁面的展開/收合
    document.querySelectorAll('.settings-section.collapsible').forEach(section => {
        const header = section.querySelector('.section-header');
        header.addEventListener('click', () => {
            if (section.classList.contains('active')) {
                updateStorageUsage();
            }
        });
    });

    // 添加儲存空間限制設定功能
    const storageLimitInput = document.getElementById('storage-limit');
    const saveStorageLimitBtn = document.getElementById('save-storage-limit');
    const clearStorageLimitBtn = document.getElementById('clear-storage-limit');

    // 載入已儲存的容量限制
    chrome.storage.local.get('storageLimit', ({ storageLimit }) => {
        if (storageLimit) {
            storageLimitInput.value = storageLimit;
        }
    });

    // 修改儲存容量限制的邏輯
    saveStorageLimitBtn?.addEventListener('click', async () => {
        const limit = parseInt(storageLimitInput.value);
        if (!storageLimitInput.value.trim()) {
            // 如果輸入框為空，視為取消限制
            await chrome.storage.local.remove('storageLimit');
            showToast('已取消儲存空間限制');
            updateStorageUsage();
        } else if (limit && limit > 0) {
            // 設定新的容量限制
            await chrome.storage.local.set({ storageLimit: limit });
            showToast('已設定儲存空間上限');
            updateStorageUsage();
        } else {
            showToast('請輸入有效的容量數值', false, true);
        }
    });

    // 修改輸入框的事件處理
    storageLimitInput?.addEventListener('input', (e) => {
        // 移除開頭的 0
        if (e.target.value.startsWith('0')) {
            e.target.value = e.target.value.replace(/^0+/, '');
        }
        // 只允許輸入正整數
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
}

// 初始化清除資料功能
function initializeClearDataFeature() {
    const clearAllDataBtn = document.getElementById('clear-all-data');
    const clearAudioBtn = document.getElementById('clear-audio');
    const confirmDialog = document.getElementById('confirm-dialog');
    const confirmAudioDialog = document.getElementById('confirm-audio-dialog');
    const cancelClearBtn = document.getElementById('cancel-clear');
    const confirmClearBtn = document.getElementById('confirm-clear');
    const cancelAudioClearBtn = document.getElementById('cancel-audio-clear');
    const confirmAudioClearBtn = document.getElementById('confirm-audio-clear');

    // 清除語音快取按鈕
    clearAudioBtn?.addEventListener('click', () => {
        confirmAudioDialog.style.display = 'flex';
    });

    // 取消清除語音快取
    cancelAudioClearBtn?.addEventListener('click', () => {
        confirmAudioDialog.style.display = 'none';
    });

    // 確認清除語音快取
    confirmAudioClearBtn?.addEventListener('click', async () => {
        try {
            // 隱藏對話框
            confirmAudioDialog.style.display = 'none';

            // 清除記憶體中的 Blob URLs
            if (window.audioCache) {
                Object.values(window.audioCache).forEach(url => {
                    URL.revokeObjectURL(url);
                });
                window.audioCache = {};
            }

            // 清除儲存的語音快取
            const { audioCache: savedAudioCache } = await chrome.storage.local.get('audioCache');
            if (savedAudioCache) {
                // 清除所有已儲存的 base64 音訊資料
                for (const text in savedAudioCache) {
                    delete savedAudioCache[text];
                }
            }

            // 清除儲存空間中的語音快取
            await chrome.storage.local.remove('audioCache');

            // 重置全域變數
            audioCache = {};
            currentAudio = null;
            lastPlayedText = null;
            lastPlayedSpeed = 'normal';

            // 更新介面
            updateStorageUsage();
            showToast('語音快取已清除');
        } catch (error) {
            console.error('清除語音快取失敗:', error);
            showToast('清除語音快取失敗: ' + error.message, false, true);
        }
    });

    // 綁定清除按鈕事件
    clearAllDataBtn?.addEventListener('click', () => {
        confirmDialog.style.display = 'flex';
    });

    // 綁定取消按鈕事件
    cancelClearBtn?.addEventListener('click', () => {
        confirmDialog.style.display = 'none';
    });

    // 綁定確認清除按鈕事件
    confirmClearBtn?.addEventListener('click', async () => {
        try {
            confirmDialog.style.display = 'none';
            await clearAllData();
        } catch (error) {
            console.error('清除資料失敗:', error);
            showToast('清除資料失敗: ' + error.message, false, true);
        }
    });
}

// 清除所有資料的函數
async function clearAllData() {
    // 先保存 API Keys 和外觀設定
    const {
        apiKey,
        speechifyApiKey,
        darkMode,
        theme
    } = await chrome.storage.local.get([
        'apiKey',
        'speechifyApiKey',
        'darkMode',
        'theme'
    ]);

    // 清除所有儲存的資料
    await chrome.storage.local.clear();

    // 恢復 API Keys 和外觀設定
    await chrome.storage.local.set({
        apiKey: apiKey || '',
        speechifyApiKey: speechifyApiKey || '',
        darkMode: darkMode || false,
        theme: theme || 'light'
    });

    // 清除記憶體中的 Blob URLs
    if (window.audioCache) {
        Object.values(window.audioCache).forEach(url => {
            URL.revokeObjectURL(url);
        });
        window.audioCache = {};
    }

    // 重置所有相關變數
    accumulatedVocabulary = [];
    currentPageVocabulary = [];
    wordAnalysisCache = {};
    chatHistory = [];
    lastAnalysisResult = null;

    // 更新介面
    updateStorageUsage();
    showToast('所有資料已清除');

    // 切換到設定頁面
    switchPage('settings-page');
}

// 更新分析按鈕狀態
function updateAnalyzeButtonState() {
    const apiKey = document.getElementById('gemini-api-key').value;
    document.getElementById('analyze').disabled = !apiKey;
}

// 顯示錯誤訊息
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.style.backgroundColor = '#fde8e8';
    errorDiv.style.color = '#d32f2f';
}

// 顯示載入動畫
function showLoading(show) {
    document.querySelector('.loading').style.display = show ? 'block' : 'none';
    document.getElementById('analyze').disabled = show;
}

// 修改頁面切換函數
function switchPage(pageId) {
    // 保存當前頁面的狀態
    const currentPage = document.querySelector('.page.active');
    if (currentPage) {
        const currentPageId = currentPage.id;

        // 如果從分析頁面切換出去，保存分析結果
        if (currentPageId === 'main-page' && lastAnalysisResult) {
            chrome.storage.local.set({
                savedAnalysis: lastAnalysisResult,
                savedUrl: currentTabUrl
            });
        }

        // 如果從對話頁面切換出去，保存對話歷史
        if (currentPageId === 'chat-page' && chatHistory.length > 0) {
            chrome.storage.local.set({
                savedChat: chatHistory,
                savedUrl: currentTabUrl
            });
        }

        // 如果從設定頁面切換出去，保存 API Key
        if (currentPageId === 'settings-page') {
            const apiKey = document.getElementById('gemini-api-key').value;
            if (apiKey) {
                chrome.storage.local.set({ apiKey });
            }
        }
    }

    // 如果切換到設定頁面，顯示已儲存的 API Key
    if (pageId === 'settings-page') {
        chrome.storage.local.get('apiKey', ({ apiKey }) => {
            if (apiKey) {
                document.getElementById('gemini-api-key').value = apiKey;
            }
        });
    }

    // 更新頁面顯示
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');

    // 更新底部導航欄狀態
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`.nav-item[data-page="${pageId}"]`).classList.add('active');

    // 如果切換到設定頁面，立即更新儲存空間使用狀態
    if (pageId === 'settings-page') {
        updateStorageUsage();
    }

    // 如果切換回主頁面且有分析結果，顯示分析結果
    if (pageId === 'main-page' && lastAnalysisResult) {
        displayAnalysisResult(lastAnalysisResult);
    }
}

// 修改分析結果處理
function displayAnalysisResult(analysisResult) {
    // 檢查 analysisResult 是否存在且包含必要的屬性
    if (!analysisResult || !analysisResult.level) {
        console.error('無效的分析結果:', analysisResult);
        showError('無效的分析結果');
        return;
    }

    // 更新顯示
    document.getElementById('level').textContent = analysisResult.level;
    document.getElementById('vocabulary').textContent = analysisResult.analysis.vocabulary;
    document.getElementById('grammar').textContent = analysisResult.analysis.grammar;
    document.getElementById('topic').textContent = analysisResult.analysis.topic;

    // 儲存分析結果和當前 URL
    chrome.storage.local.set({
        savedAnalysis: analysisResult,
        savedUrl: currentTabUrl
    });
}

// 新增還原對話歷史函數
function restoreChatHistory(history) {
    history.forEach(msg => {
        addMessage(msg.content, msg.role === 'user' ? 'user' : 'ai');
    });
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (!apiKey) {
        showError('請先設定 API Key');
        return;
    }

    // 清空輸入框
    input.value = '';

    // 顯示使用者訊息並加入歷史
    addMessage(message, 'user');
    chatHistory.push({ role: 'user', content: message });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        chrome.tabs.sendMessage(tab.id, {
            action: 'chat',
            message,
            history: chatHistory,  // 傳送對話歷史
            apiKey
        }, (response) => {
            if (chrome.runtime.lastError) {
                showError(chrome.runtime.lastError.message);
                return;
            }

            if (!response) {
                showError('未收到回應');
                return;
            }

            if (response.error) {
                showError(response.error);
                return;
            }

            if (!response.reply) {
                showError('回應內容為空');
                return;
            }

            // 顯示 AI 回應並加入歷史
            addMessage(response.reply, 'ai');
            chatHistory.push({ role: 'assistant', content: response.reply });

            // 在成功接收 AI 回應後儲存對話歷史和 URL
            chrome.storage.local.set({
                savedChat: chatHistory,
                savedUrl: currentTabUrl
            });
        });
    } catch (error) {
        console.error('發送訊息錯誤:', error);
        showError(error.message || '無法發送訊息');
    }
}

function addMessage(text, type) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}-message`;

    const content = document.createElement('div');
    content.className = 'message-content';

    // 使用 marked 解析 Markdown
    if (type === 'ai') {
        content.innerHTML = marked.parse(text);
    } else {
        content.textContent = text;
    }

    messageDiv.appendChild(content);
    messagesContainer.appendChild(messageDiv);

    // 滾動到最新訊息
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 修改 tab 變化的監聽事件
chrome.tabs.onActivated.addListener(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const newUrl = tab.url;
    const savedUrl = await chrome.storage.local.get('savedUrl').then(data => data.savedUrl);

    // 只有在 URL 真的改變時才清除記錄
    if (newUrl !== savedUrl) {
        currentTabUrl = newUrl;
        lastAnalysisResult = null;
        chatHistory = [];
        currentPageVocabulary = []; // 只清除當前頁面單字

        // 清除相關儲存的資料，但保留累積單字
        chrome.storage.local.remove(['savedAnalysis', 'savedChat', 'currentPageVocabulary'], function () {
            chrome.storage.local.set({ savedUrl: newUrl });

            // 重置顯示
            document.getElementById('level').textContent = '-';
            document.getElementById('vocabulary').textContent = '-';
            document.getElementById('grammar').textContent = '-';
            document.getElementById('topic').textContent = '-';
            document.getElementById('chat-messages').innerHTML = '';

            updateVocabularyUI(); // 更新單字列表顯示
        });
    }
});

// 在需要分析單字的地方
async function analyzeVocabulary(text, apiKey) {
    try {
        updateVocabularyUI(true);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const response = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'analyzeVocabulary',
                apiKey: apiKey
            }, resolve);
        });

        if (response.error) {
            throw new Error(response.error);
        }

        if (response.words) {
            // 將新單字分類為當前頁面單字和累積單字
            currentPageVocabulary = []; // 清空當前頁面單字

            response.words.forEach(newWord => {
                // 檢查單字是否已在累積列表中
                const existingWordIndex = accumulatedVocabulary.findIndex(w =>
                    w.text.toLowerCase() === newWord.text.toLowerCase()
                );

                if (existingWordIndex === -1) {
                    // 如果單字不在累積列表中，加入當前頁面單字列表
                    currentPageVocabulary.push(newWord);
                } else {
                    // 如果單字已在累積列表中，加入累積列表的版本到當前頁面單字列表
                    currentPageVocabulary.push(accumulatedVocabulary[existingWordIndex]);
                }
            });

            // 將當前頁面的新單字加入累積列表
            currentPageVocabulary.forEach(word => {
                const existingWordIndex = accumulatedVocabulary.findIndex(w =>
                    w.text.toLowerCase() === word.text.toLowerCase()
                );
                if (existingWordIndex === -1) {
                    accumulatedVocabulary.push(word);
                }
            });

            // 儲存更新後的單字列表
            await chrome.storage.local.set({
                accumulatedVocabulary: accumulatedVocabulary,
                currentPageVocabulary: currentPageVocabulary
            });
        }
    } catch (error) {
        console.error('分析單字時發生錯誤:', error);
        showError(error.message);
    } finally {
        updateVocabularyUI(false);
    }
}

// 修改清除單字列表函數
function clearVocabulary() {
    accumulatedVocabulary = [];
    currentPageVocabulary = [];
    chrome.storage.local.remove(['accumulatedVocabulary', 'currentPageVocabulary'], function () {
        updateVocabularyUI();
    });
}

// 修改計算儲存空間使用狀態的函數
async function updateStorageUsage() {
    try {
        const storageUsedElement = document.getElementById('storage-used');
        const storageFreeElement = document.getElementById('storage-free');
        const storageTotalElement = document.getElementById('storage-total');
        const storageBarElement = document.getElementById('storage-used-bar');
        const storageLimitInput = document.getElementById('storage-limit');
        const storageStatusElement = document.getElementById('storage-status');

        if (!storageUsedElement || !storageFreeElement || !storageTotalElement || !storageBarElement) {
            console.warn('找不到儲存空間顯示元素');
            return;
        }

        // 獲取所有儲存的資料和設定
        const {
            accumulatedVocabulary = [],
            currentPageVocabulary = [],
            wordAnalysisCache = {},
            audioCache = {},
            savedAnalysis = {},
            savedChat = [],
            storageLimit
        } = await chrome.storage.local.get(null);

        // 計算各類型資料的大小
        const getSize = (data) => new TextEncoder().encode(JSON.stringify(data)).length;

        const sizes = {
            vocabulary: getSize(accumulatedVocabulary) + getSize(currentPageVocabulary),
            analysis: getSize(wordAnalysisCache) + getSize(savedAnalysis),
            audio: getSize(audioCache),
            chat: getSize(savedChat)
        };

        const totalUsage = Object.values(sizes).reduce((a, b) => a + b, 0);
        const totalStorage = storageLimit ? (storageLimit * 1024 * 1024) : Infinity;
        const freeStorage = totalStorage === Infinity ? Infinity : totalStorage - totalUsage;

        // 更新容量限制輸入框和狀態
        if (storageLimit) {
            storageLimitInput.value = storageLimit;
            storageStatusElement.textContent = `已限制 ${storageLimit} MB`;
            storageStatusElement.style.color = totalUsage > 0 ? (totalUsage > 90 ? '#d32f2f' : '#ff9800') : '#1a73e8';
        } else {
            storageLimitInput.value = '';
            storageStatusElement.textContent = '無限制';
            storageStatusElement.style.color = '#1a73e8';
        }

        // 格式化容量顯示
        function formatSize(bytes) {
            if (bytes === Infinity) {
                return '無限制';
            }
            if (bytes > 1024 * 1024) {
                return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
            } else if (bytes > 1024) {
                return `${(bytes / 1024).toFixed(2)} KB`;
            }
            return `${bytes} bytes`;
        }

        // 更新顯示
        storageUsedElement.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 4px;">${formatSize(totalUsage)}</div>
            <div style="color: #5f6368; font-size: 0.9em;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>單字列表:</span>
                    <span>${formatSize(sizes.vocabulary)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>分析快取:</span>
                    <span>${formatSize(sizes.analysis)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>語音快取:</span>
                    <span>${formatSize(sizes.audio)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>對話記錄:</span>
                    <span>${formatSize(sizes.chat)}</span>
                </div>
            </div>
        `;
        storageFreeElement.textContent = formatSize(freeStorage);
        storageTotalElement.textContent = formatSize(totalStorage);

        // 更新進度條
        const percentage = totalStorage === Infinity ?
            (totalUsage > 0 ? 10 : 0) : // 無限制時，只要有使用就顯示 10%
            (totalUsage / totalStorage) * 100;

        storageBarElement.style.width = `${Math.min(percentage, 100)}%`;

        // 根據使用量變更顏色
        if (totalStorage === Infinity) {
            storageBarElement.style.backgroundColor = '#1a73e8'; // 藍色
        } else if (percentage > 90) {
            storageBarElement.style.backgroundColor = '#f44336'; // 紅色
        } else if (percentage > 70) {
            storageBarElement.style.backgroundColor = '#ff9800'; // 橙色
        } else {
            storageBarElement.style.backgroundColor = '#1a73e8'; // 藍色
        }

    } catch (error) {
        console.error('計算儲存空間使用量失敗:', error);
        const elements = ['storage-used', 'storage-free', 'storage-total', 'storage-status'];
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '計算失敗';
            }
        });
    }
}

// 添加 Toast 提示功能
function showToast(message, isLoading = false, isError = false) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);

        // 添加 Toast 樣式
        const style = document.createElement('style');
        style.textContent = `
            #toast {
                position: fixed;
                bottom: 60px;
                left: 50%;
                transform: translateX(-50%);
                background-color: #323232;
                color: white;
                padding: 12px 24px;
                border-radius: 4px;
                font-size: 14px;
                z-index: 10000;
                display: none;
                align-items: center;
                gap: 8px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                transition: opacity 0.3s ease;
            }
            #toast.error {
                background-color: #d32f2f;
            }
            #toast.loading {
                background-color: #1976d2;
            }
            #toast .spinner {
                width: 16px;
                height: 16px;
                border: 2px solid #fff;
                border-top-color: transparent;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    toast.className = 'toast' + (isLoading ? ' loading' : '') + (isError ? ' error' : '');
    toast.innerHTML = `
        ${isLoading ? '<div class="spinner"></div>' : ''}
        <span>${message}</span>
    `;

    toast.style.display = 'flex';
    setTimeout(() => {
        toast.style.display = 'none';
    }, isLoading ? 0 : 3000);
} 