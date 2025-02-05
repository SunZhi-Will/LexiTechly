// 在文件開頭加入暫存變數
let lastAnalysisResult = null;
let chatHistory = [];
let currentTabUrl = '';
let vocabularyList = []; // 添加全局變數

// 將函數移到外部
function updateVocabularyUI(isLoading = false) {
    const vocabularyContainer = document.getElementById('vocabulary-list');
    vocabularyContainer.innerHTML = '';

    if (isLoading) {
        vocabularyContainer.innerHTML = `
            <div class="word-card loading-card">
                <div class="loading-spinner"></div>
                <p style="color: #5f6368; text-align: center; margin-top: 12px;">正在分析單字...</p>
            </div>
        `;
        return;
    }

    if (!vocabularyList || vocabularyList.length === 0) {
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

    vocabularyList.forEach(word => {
        const wordCard = document.createElement('div');
        wordCard.className = 'word-card';
        wordCard.innerHTML = `
            <div class="word-header">
                <div class="word-text">${word.text}</div>
                <div class="word-level">${word.level || 'N/A'}</div>
            </div>
            <div class="word-details">${word.definition || '暫無釋義'}</div>
            <div class="word-translation">${word.translation || '暫無翻譯'}</div>
        `;
        vocabularyContainer.appendChild(wordCard);
    });
}

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
                    const analysisResult = response.level;
                    // 儲存分析結果
                    lastAnalysisResult = analysisResult;
                    // 顯示結果
                    displayAnalysisResult(analysisResult);

                    // 分析文本中的單字，傳入 apiKey
                    if (response.text) {
                        await analyzePageVocabulary(response.text, apiKey);
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

    // 從 chrome.storage 讀取儲存的單字列表
    const { vocabulary } = await chrome.storage.local.get('vocabulary');
    if (vocabulary) {
        vocabularyList = vocabulary;
        updateVocabularyUI();
    }
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
        vocabularyList = []; // 清除單字列表

        // 清除儲存的資料
        chrome.storage.local.remove(['savedAnalysis', 'savedChat', 'vocabulary']);
        chrome.storage.local.set({ savedUrl: newUrl });

        // 重置顯示
        document.getElementById('level').textContent = '-';
        document.getElementById('vocabulary').textContent = '-';
        document.getElementById('grammar').textContent = '-';
        document.getElementById('topic').textContent = '-';
        document.getElementById('chat-messages').innerHTML = '';
        updateVocabularyUI(); // 更新單字列表顯示
    }
});

// 修改分析頁面單字的函數，添加 apiKey 參數
async function analyzePageVocabulary(text, apiKey) {
    try {
        // 顯示載入狀態
        updateVocabularyUI(true);

        const prompt = `
            分析以下英文文本，提取重要單字（最多20個）。
            對每個單字提供：
            1. CEFR 等級 (A1-C2)
            2. 英文定義（簡短）
            3. 中文翻譯
            
            回傳格式必須是以下 JSON：
            {
                "words": [
                    {
                        "text": "單字",
                        "level": "CEFR等級",
                        "definition": "英文定義",
                        "translation": "中文翻譯"
                    }
                ]
            }
            
            文本：
            ${text}
            
            請直接返回 JSON 格式，不要有其他說明文字。
        `;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text;
            let wordsData;
            try {
                wordsData = JSON.parse(text);
            } catch (e) {
                const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/({[\s\S]*})/);
                if (jsonMatch) {
                    wordsData = JSON.parse(jsonMatch[1].trim());
                } else {
                    throw new Error('無法解析 JSON 格式');
                }
            }

            if (wordsData && wordsData.words) {
                // 合併新單字到列表
                wordsData.words.forEach(newWord => {
                    const existingWordIndex = vocabularyList.findIndex(w =>
                        w.text.toLowerCase() === newWord.text.toLowerCase()
                    );
                    if (existingWordIndex === -1) {
                        vocabularyList.push(newWord);
                    }
                });

                // 儲存更新後的單字列表
                await chrome.storage.local.set({ vocabulary: vocabularyList });
            }
        }
    } catch (error) {
        console.error('分析單字時發生錯誤:', error);
        showError('分析單字時發生錯誤');
    } finally {
        // 無論成功或失敗，都更新 UI（不帶 loading 狀態）
        updateVocabularyUI(false);
    }
}

// 清除單字列表
function clearVocabulary() {
    vocabularyList = [];
    chrome.storage.local.remove(['vocabulary'], function () {
        updateVocabularyUI();
    });
}

// 添加清除單字列表的功能
const clearVocabularyBtn = document.createElement('button');
clearVocabularyBtn.className = 'save-button';
clearVocabularyBtn.textContent = '清除單字列表';
clearVocabularyBtn.onclick = clearVocabulary;

// 將清除按鈕加入設定頁面
document.querySelector('.settings-sections').appendChild(clearVocabularyBtn); 