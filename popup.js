// 載入已儲存的 API Key
document.addEventListener('DOMContentLoaded', async () => {
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
            }, (response) => {
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
                    const analysisResult = response.level;
                    // 儲存分析結果
                    lastAnalysisResult = analysisResult;
                    // 顯示結果
                    displayAnalysisResult(analysisResult);
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
    document.getElementById('api-key').addEventListener('input', updateAnalyzeButtonState);

    // 監聽儲存 API Key 按鈕
    document.getElementById('save-api-key').addEventListener('click', async () => {
        const apiKey = document.getElementById('api-key').value;
        await chrome.storage.local.set({ apiKey });

        const errorDiv = document.getElementById('error-message');
        errorDiv.style.display = 'block';
        errorDiv.style.backgroundColor = '#e8f5e9';
        errorDiv.style.color = '#2e7d32';
        errorDiv.textContent = 'API Key 已成功儲存！';

        setTimeout(() => {
            errorDiv.style.display = 'none';
            // 儲存成功後返回主頁面
            switchPage('main-page');
        }, 1500);

        updateAnalyzeButtonState();
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
        document.getElementById('api-key').value = apiKey;
        switchPage('main-page');
    } else {
        switchPage('settings-page');
    }

    updateAnalyzeButtonState();

    // 設定區塊的展開/收合功能
    const apiSettingsSection = document.querySelector('.settings-section.collapsible');
    const apiSettingsHeader = apiSettingsSection.querySelector('.section-header');
    const apiSettingsContent = document.getElementById('api-settings');

    // 預設收合狀態
    if (!apiKey) {
        // 如果沒有 API Key，預設展開
        apiSettingsSection.classList.add('active');
        apiSettingsContent.style.display = 'block';
    } else {
        // 如果有 API Key，預設收合
        apiSettingsSection.classList.remove('active');
        apiSettingsContent.style.display = 'none';
    }

    // 點擊事件處理
    apiSettingsHeader.addEventListener('click', () => {
        const isActive = apiSettingsSection.classList.toggle('active');
        apiSettingsContent.style.display = isActive ? 'block' : 'none';
    });
});

// 更新分析按鈕狀態
function updateAnalyzeButtonState() {
    const apiKey = document.getElementById('api-key').value;
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

// 在文件開頭加入暫存變數
let lastAnalysisResult = null;
let chatHistory = [];
let currentTabUrl = '';

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
            const apiKey = document.getElementById('api-key').value;
            if (apiKey) {
                chrome.storage.local.set({ apiKey });
            }
        }
    }

    // 如果切換到設定頁面，顯示已儲存的 API Key
    if (pageId === 'settings-page') {
        chrome.storage.local.get('apiKey', ({ apiKey }) => {
            if (apiKey) {
                document.getElementById('api-key').value = apiKey;
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

    // 如果切換回主頁面且有分析結果，顯示分析結果
    if (pageId === 'main-page' && lastAnalysisResult) {
        displayAnalysisResult(lastAnalysisResult);
    }
}

// 修改分析結果處理
function displayAnalysisResult(analysisResult) {
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
        chrome.storage.local.remove(['savedAnalysis', 'savedChat']);
        chrome.storage.local.set({ savedUrl: newUrl });

        // 重置顯示
        document.getElementById('level').textContent = '-';
        document.getElementById('vocabulary').textContent = '-';
        document.getElementById('grammar').textContent = '-';
        document.getElementById('topic').textContent = '-';
        document.getElementById('chat-messages').innerHTML = '';
    }
}); 