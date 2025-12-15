/// <reference types="chrome"/>

// 匯入模組化的功能
import * as State from './popup/state.js';
import * as UI from './popup/ui.js';
import * as Storage from './popup/storage.js';
import * as Speech from './popup/speech.js';
import { removePhoneticFromVocabulary } from './vocabulary/cleaner.js';
import { getSpeakButtonHTML, speakWord } from './vocabulary/audio.js';
import { audioCache } from './vocabulary/storage.js';
import { convertToCSV, downloadCSV } from './vocabulary/export.js';

export { }; // 使此檔案成為模組

// 工具函數
function isValidUrl(url?: string): boolean {
    if (!url) return false;
    const invalidProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:', 'edge:', 'about:', 'file:'];
    const invalidDomains = ['chrome.google.com/webstore'];

    if (invalidProtocols.some(protocol => url.startsWith(protocol))) return false;
    if (invalidDomains.some(domain => url.includes(domain))) return false;

    return url.startsWith('http://') || url.startsWith('https://');
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
    } catch (error) {
        // 已注入或注入失敗，忽略錯誤
    }
}

/**
 * 為語音按鈕添加事件監聽器
 * @param button 語音按鈕元素
 * @param text 要播放的文字
 */
function setupSpeakButtonListener(button: HTMLElement, text: string): void {
    // 移除任何舊的事件監聽器
    const oldClickHandler = (button as any).clickHandler;
    if (oldClickHandler) {
        button.removeEventListener('click', oldClickHandler);
    }

    // 創建新的事件處理函數
    const newClickHandler = async (e: Event) => {
        e.stopPropagation(); // 防止觸發卡片點擊
        
        // 如果按鈕已在載入或播放中，直接返回
        if (button.classList.contains('loading')) return;
        
        // 調用播放功能
        await speakWord(text, button);
    };

    // 儲存事件處理函數的引用
    (button as any).clickHandler = newClickHandler;
    button.addEventListener('click', newClickHandler);
}

function createWordCard(word: Word): HTMLDivElement {
    const wordCard = document.createElement('div');
    wordCard.className = 'word-card';
    wordCard.innerHTML = `
        <div class="word-header">
            <div class="word-text-group">
                <span class="word-text-main" title="${word.text}">${word.text}</span>
                <button class="speak-btn elegant small" title="播放發音" data-text="${word.text}" aria-label="播放 ${word.text} 的發音">
                    <svg class="play-icon" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    <svg class="stop-icon" viewBox="0 0 24 24">
                        <path d="M6 6h12v12H6z"/>
                    </svg>
                </button>
            </div>
            <span class="word-level" title="單字等級">${word.level || 'N/A'}</span>
        </div>
        ${word.example ? `<div class="word-details" title="例句">${word.example}</div>` : ''}
        ${word.translation ? `<div class="word-translation" title="翻譯">${word.translation}</div>` : ''}
    `;
    
    // 立即綁定語音按鈕事件
    const speakBtn = wordCard.querySelector('.speak-btn') as HTMLElement;
    if (speakBtn) {
        setupSpeakButtonListener(speakBtn, word.text);
    }
    
    return wordCard;
}

// 單字 UI 更新
function updateVocabularyUI(isLoading: boolean = false): void {
    const vocabularyContainer = document.getElementById('vocabulary-list');
    if (!vocabularyContainer) return;

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
        chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/vocabulary.html') });
    };
    vocabularyContainer.appendChild(popoutButton);

    if (isLoading) {
        const loadingCard = document.createElement('div');
        loadingCard.className = 'word-card loading-card';
        loadingCard.innerHTML = `
            <div class="loading-spinner"></div>
            <p class="empty-state-text" style="margin-top: 16px;">正在分析單字...</p>
        `;
        vocabularyContainer.appendChild(loadingCard);
        return;
    }

    // 空列表處理
    if ((!State.accumulatedVocabulary || State.accumulatedVocabulary.length === 0) &&
        (!State.currentPageVocabulary || State.currentPageVocabulary.length === 0)) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'word-card empty-state';
        emptyCard.innerHTML = `
            <svg class="empty-state-icon" viewBox="0 0 24 24">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 9h8v2h-8zm0-3h8v2h-8zm0 6h4v2h-4z"/>
            </svg>
            <p class="empty-state-text">尚未收集任何單字</p>
            <p class="empty-state-subtext">請先進行頁面分析來收集單字</p>
        `;
        vocabularyContainer.appendChild(emptyCard);
        return;
    }

    // 當前頁面單字
    if (State.currentPageVocabulary && State.currentPageVocabulary.length > 0) {
        const currentPageSection = document.createElement('div');
        currentPageSection.className = 'vocabulary-section';
        currentPageSection.innerHTML = `
            <h3 class="section-title">當前頁面單字 (${State.currentPageVocabulary.length})</h3>
            <div class="word-list current-page"></div>
        `;
        vocabularyContainer.appendChild(currentPageSection);

        const currentPageList = currentPageSection.querySelector('.word-list');
        if (currentPageList) {
            State.currentPageVocabulary.forEach(word => {
                const wordCard = createWordCard(word);
                currentPageList.appendChild(wordCard);
            });
        }
    }

    // 累積單字（排除當前頁面）
    if (State.accumulatedVocabulary && State.accumulatedVocabulary.length > 0) {
        const filteredAccumulatedWords = State.accumulatedVocabulary.filter(accWord =>
            !State.currentPageVocabulary.some(currentWord =>
                currentWord.text.toLowerCase() === accWord.text.toLowerCase()
            )
        );

        if (filteredAccumulatedWords.length > 0) {
            const accumulatedSection = document.createElement('div');
            accumulatedSection.className = 'vocabulary-section';
            accumulatedSection.innerHTML = `
                <h3 class="section-title">累積單字 (${filteredAccumulatedWords.length})</h3>
                <div class="word-list accumulated"></div>
            `;
            vocabularyContainer.appendChild(accumulatedSection);

            const accumulatedList = accumulatedSection.querySelector('.word-list');
            if (accumulatedList) {
                filteredAccumulatedWords.forEach(word => {
                    const wordCard = createWordCard(word);
                    accumulatedList.appendChild(wordCard);
                });
            }
        }
    }
}

// 設定頁面初始化
function initializeSettingsPage(): void {
    // 初始化展開/收合功能
    document.querySelectorAll('.settings-section.collapsible .section-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.settings-section') as HTMLElement;
            if (section) {
                section.classList.toggle('active');
            }
        });
    });

    // 載入設定
    chrome.storage.sync.get(['hideFloatingLogo'], (result) => {
        const showFloatingLogoCheckbox = document.getElementById('show-floating-logo') as HTMLInputElement;
        if (showFloatingLogoCheckbox) {
            // 如果設定未初始化，預設為顯示
            showFloatingLogoCheckbox.checked = result.hideFloatingLogo === undefined ? true : !result.hideFloatingLogo;
            
            // 如果設定未初始化，設置預設值
            if (result.hideFloatingLogo === undefined) {
                chrome.storage.sync.set({ 'hideFloatingLogo': false });
            }
        }
    });

    // 監聽懸浮圖示顯示設定的變更
    const showFloatingLogoCheckbox = document.getElementById('show-floating-logo');
    if (showFloatingLogoCheckbox) {
        showFloatingLogoCheckbox.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            chrome.storage.sync.set({ 'hideFloatingLogo': !isChecked });
            
            // 通知內容腳本更新懸浮圖示的顯示狀態
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                if (activeTab.id) {
                    chrome.tabs.sendMessage(activeTab.id, {
                        type: 'updateFloatingLogo',
                        show: isChecked
                    });
                }
            });
        });
    }

    // 載入 API Key
    chrome.storage.local.get(['apiKey']).then((result) => {
        const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
        const apiKey = typeof result.apiKey === 'string' ? result.apiKey : null;
        if (apiKeyInput && apiKey) apiKeyInput.value = apiKey;
    });

    // API Key 儲存按鈕
    const saveGeminiApiKeyButton = document.getElementById('save-gemini-api-key');
    if (saveGeminiApiKeyButton) {
        saveGeminiApiKeyButton.addEventListener('click', () => {
            const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
            if (apiKeyInput) {
                const apiKey = apiKeyInput.value.trim();
                if (apiKey) {
                    chrome.storage.local.set({ apiKey });
                    UI.showToast('Gemini API Key 已儲存', false, false, true);
                    Storage.updateStorageUsage();
                } else {
                    UI.showToast('請輸入有效的 API Key', false, true);
                }
            }
        });
    }



    // 儲存空間限制設定
    chrome.storage.local.get('storageLimit').then(({ storageLimit }) => {
        const storageLimitInput = document.getElementById('storage-limit') as HTMLInputElement;
        if (storageLimitInput) {
            storageLimitInput.value = storageLimit ? storageLimit.toString() : '';
            storageLimitInput.placeholder = '留空表示無限制';
        }
    });

    const saveStorageLimitButton = document.getElementById('save-storage-limit');
    if (saveStorageLimitButton) {
        saveStorageLimitButton.addEventListener('click', () => {
            const storageLimitInput = document.getElementById('storage-limit') as HTMLInputElement;
            if (storageLimitInput) {
                const inputValue = storageLimitInput.value.trim();

                if (inputValue === '' || inputValue === '0') {
                    chrome.storage.local.remove('storageLimit');
                    UI.showToast('設定為無限制', false, false, true);
                    Storage.updateStorageUsage();
                } else {
                    const limit = parseInt(inputValue);
                    if (limit > 0) {
                        chrome.storage.local.set({ storageLimit: limit });
                        UI.showToast(`已設定為 ${limit} MB`, false, false, true);
                        Storage.updateStorageUsage();
                    } else {
                        UI.showToast('請輸入有效數值或留空無限制', false, true);
                    }
                }
            }
        });
    }

    // === 新增語音設定同步 ===
    // 載入語音設定
    const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    const speedRange = document.getElementById('speed-range') as HTMLInputElement;
    const speedValue = document.getElementById('speed-value');
    const pitchRange = document.getElementById('pitch-range') as HTMLInputElement;
    const pitchValue = document.getElementById('pitch-value');

    function loadSpeechSettings() {
        const savedSettings = localStorage.getItem('speechSettings');
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                if (voiceSelect) voiceSelect.value = settings.voice || 'Puck';
                if (languageSelect) languageSelect.value = settings.language || 'en-US';
                if (speedRange) {
                    speedRange.value = settings.speed ? settings.speed.toString() : '1.0';
                    if (speedValue) speedValue.textContent = parseFloat(speedRange.value).toFixed(1);
                }
                if (pitchRange) {
                    pitchRange.value = settings.pitch ? settings.pitch.toString() : '1.0';
                    if (pitchValue) pitchValue.textContent = parseFloat(pitchRange.value).toFixed(1);
                }
            } catch (e) { console.error('無法載入語音設定', e); }
        }
    }
    function saveSpeechSettings() {
        const settings = {
            voice: voiceSelect ? voiceSelect.value : 'Puck',
            language: languageSelect ? languageSelect.value : 'en-US',
            speed: speedRange ? parseFloat(speedRange.value) : 1.0,
            pitch: pitchRange ? parseFloat(pitchRange.value) : 1.0
        };
        localStorage.setItem('speechSettings', JSON.stringify(settings));
    }
    if (voiceSelect) voiceSelect.addEventListener('change', saveSpeechSettings);
    if (languageSelect) languageSelect.addEventListener('change', saveSpeechSettings);
    if (speedRange) speedRange.addEventListener('input', () => {
        if (speedValue) speedValue.textContent = parseFloat(speedRange.value).toFixed(1);
        saveSpeechSettings();
    });
    if (pitchRange) pitchRange.addEventListener('input', () => {
        if (pitchValue) pitchValue.textContent = parseFloat(pitchRange.value).toFixed(1);
        saveSpeechSettings();
    });
    loadSpeechSettings();

    Storage.updateStorageUsage();
}

// 清除功能初始化
function initializeClearDataFeature(): void {
    // 清除所有資料
    const clearAllDataButton = document.getElementById('clear-all-data');
    if (clearAllDataButton) {
        clearAllDataButton.addEventListener('click', () => {
            UI.showConfirmDialog(
                '確認清除所有資料',
                '此操作將永久刪除以下資料：',
                ['單字列表', '分析快取', '語音快取', '對話記錄'],
                async () => {
                    try {
                        // 備份重要設定
                        const { apiKey, darkMode, storageLimit } =
                            await chrome.storage.local.get(['apiKey', 'darkMode', 'storageLimit']);

                        await chrome.storage.local.clear();

                        // 恢復設定
                        const settingsToRestore: any = {};
                        if (apiKey) settingsToRestore.apiKey = apiKey;
                        if (darkMode !== undefined) settingsToRestore.darkMode = darkMode;
                        if (storageLimit !== undefined) settingsToRestore.storageLimit = storageLimit;

                        if (Object.keys(settingsToRestore).length > 0) {
                            await chrome.storage.local.set(settingsToRestore);
                        }

                        State.resetAllState();

                        // 重置 UI
                        ['level', 'vocabulary', 'grammar', 'topic'].forEach(id => {
                            const element = document.getElementById(id);
                            if (element) element.textContent = '-';
                        });

                        const chatMessagesElement = document.getElementById('chat-messages');
                        if (chatMessagesElement) chatMessagesElement.innerHTML = '';

                        updateVocabularyUI();
                        Storage.updateStorageUsage();

                        UI.showToast('資料已清除（保留設定）', false, false, true);
                    } catch (error) {
                        UI.showToast('清除資料失敗', false, true);
                    }
                }
            );
        });
    }

    // 清除語音快取
    const clearAudioButton = document.getElementById('clear-audio');
    if (clearAudioButton) {
        clearAudioButton.addEventListener('click', () => {
            UI.showConfirmDialog(
                '確認清除語音快取',
                '此操作將刪除所有已下載的語音檔案。',
                ['語音檔案將被刪除', '需要時會重新下載'],
                async () => {
                    try {
                        State.clearAudioCacheMemory();
                        await chrome.storage.local.remove('audioCache');
                        Storage.updateStorageUsage();
                        UI.showToast('語音快取已清除', false, false, true);
                    } catch (error) {
                        UI.showToast('清除語音快取失敗', false, true);
                    }
                }
            );
        });
    }

    // 清除單字
    const clearVocabButton = document.getElementById('clear-vocabulary');
    if (clearVocabButton) {
        clearVocabButton.addEventListener('click', () => {
            UI.showConfirmDialog(
                '確認清除單字列表',
                '此操作將永久刪除所有收集的單字。',
                ['累積單字', '當前頁面單字', '單字快取'],
                () => {
                    State.clearAllVocabulary();
                    chrome.storage.local.remove(['accumulatedVocabulary', 'currentPageVocabulary']);
                    updateVocabularyUI();
                    Storage.updateStorageUsage();
                    UI.showToast('單字已清除', false, false, true);
                }
            );
        });
    }

    // 清除聊天記錄
    const clearChatButton = document.getElementById('clear-chat');
    if (clearChatButton) {
        clearChatButton.addEventListener('click', () => {
            UI.showConfirmDialog(
                '確認清除聊天記錄',
                '此操作將永久刪除所有對話記錄。',
                [],
                () => {
                    State.setChatHistory([]);
                    const chatMessagesElement = document.getElementById('chat-messages');
                    if (chatMessagesElement) chatMessagesElement.innerHTML = '';
                    chrome.storage.local.remove('savedChat');
                    Storage.updateStorageUsage();
                    UI.showToast('聊天記錄已清除', false, false, true);
                }
            );
        });
    }

    // 清除分析結果
    const clearAnalysisButton = document.getElementById('clear-analysis');
    if (clearAnalysisButton) {
        clearAnalysisButton.addEventListener('click', () => {
            UI.showConfirmDialog(
                '確認清除分析結果',
                '此操作將永久刪除當前頁面的分析結果。',
                [],
                () => {
                    State.setLastAnalysisResult(null);
                    ['level', 'vocabulary', 'grammar', 'topic'].forEach(id => {
                        const element = document.getElementById(id);
                        if (element) element.textContent = '-';
                    });
                    chrome.storage.local.remove('savedAnalysis');
                    Storage.updateStorageUsage();
                    UI.showToast('分析結果已清除', false, false, true);
                }
            );
        });
    }
}

// 匯出單字列表為 CSV
function exportVocabularyToCSV() {
    const allWords = [...State.accumulatedVocabulary];
    const csvContent = convertToCSV(allWords);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(csvContent, `vocabulary-${timestamp}.csv`);
}

// 主初始化函數
document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
    try {
        // 清除單字列表中的KK音標
        await removePhoneticFromVocabulary();
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 初始化各個模組
        initializeSettingsPage();
        initializeClearDataFeature();

        // 載入已儲存的數據
        const storageData: StorageData = await chrome.storage.local.get([
            'apiKey', 'savedAnalysis', 'savedChat', 'savedUrl',
            'accumulatedVocabulary', 'currentPageVocabulary', 'audioCache'
        ]);

        // 如果有音訊快取，先載入
        if (storageData.audioCache) {
            // 將儲存的 base64 資料轉換為 Blob URL
            for (const [text, audioData] of Object.entries(storageData.audioCache)) {
                try {
                    const audioDataString = typeof audioData === 'string'
                        ? audioData
                        : JSON.stringify(audioData);

                    const audioBlob = await fetch(`data:audio/mp3;base64,${audioDataString}`).then(r => r.blob());
                    audioCache[text] = URL.createObjectURL(audioBlob);
                } catch (error) {
                    console.warn('音訊資料轉換失敗:', error);
                    delete storageData.audioCache[text];
                }
            }
            await chrome.storage.local.set({ audioCache: storageData.audioCache });
        }

        // 獲取當前 tab URL
        State.setCurrentTabUrl(tab?.url || '');

        // 處理 URL 切換
        if (storageData.savedUrl && storageData.savedUrl !== State.currentTabUrl) {
            chrome.storage.local.remove(['savedAnalysis', 'savedChat']);
            State.setLastAnalysisResult(null);
            State.setChatHistory([]);

            ['level', 'vocabulary', 'grammar', 'topic'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = '-';
            });

            const chatMessagesElement = document.getElementById('chat-messages');
            if (chatMessagesElement) chatMessagesElement.innerHTML = '';

            chrome.storage.local.set({ savedUrl: State.currentTabUrl });
        } else {
            if (storageData.savedAnalysis) {
                State.setLastAnalysisResult(storageData.savedAnalysis);
                // 顯示分析結果
                const { level } = storageData.savedAnalysis;
                document.getElementById('level')!.textContent = level.level;
                document.getElementById('vocabulary')!.textContent = level.analysis.vocabulary;
                document.getElementById('grammar')!.textContent = level.analysis.grammar;
                document.getElementById('topic')!.textContent = level.analysis.topic;
            }
            if (storageData.savedChat) {
                State.setChatHistory(storageData.savedChat);
                // 恢復聊天記錄
                storageData.savedChat.forEach((message: ChatMessage) => {
                    // 添加聊天訊息到 UI
                    const chatMessages = document.getElementById('chat-messages');
                    if (chatMessages) {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = `message ${message.type}-message`;
                        const messageContent = document.createElement('div');
                        messageContent.className = 'message-content';
                        messageContent.textContent = message.text;
                        messageDiv.appendChild(messageContent);
                        chatMessages.appendChild(messageDiv);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                });
            }
        }

        // 載入單字資料
        if (storageData.accumulatedVocabulary) {
            State.setAccumulatedVocabulary(storageData.accumulatedVocabulary);
        }
        if (storageData.currentPageVocabulary) {
            State.setCurrentPageVocabulary(storageData.currentPageVocabulary);
        }

        // 載入深色模式設定
        const { darkMode }: { darkMode?: boolean } = await chrome.storage.local.get('darkMode');
        if (darkMode) {
            document.documentElement.classList.add('dark-mode');
            const darkModeToggle = document.getElementById('dark-mode') as HTMLInputElement;
            if (darkModeToggle) darkModeToggle.checked = true;
        }

        // 深色模式切換監聽
        const darkModeToggle = document.getElementById('dark-mode') as HTMLInputElement;
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    document.documentElement.classList.add('dark-mode');
                    chrome.storage.local.set({ darkMode: true });
                } else {
                    document.documentElement.classList.remove('dark-mode');
                    chrome.storage.local.set({ darkMode: false });
                }
            });
        }

        // 底部導航監聽
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const element = item as HTMLElement;
                const pageId = element.dataset.page;
                if (pageId) {
                    UI.switchPage(pageId);
                    if (pageId === 'vocabulary-page') {
                        updateVocabularyUI();
                    } else if (pageId === 'settings-page') {
                        Storage.updateStorageUsage();
                    }
                }
            });
        });

        // 分析按鈕監聽
        const analyzeButton = document.getElementById('analyze');
        if (analyzeButton) {
            analyzeButton.addEventListener('click', async (): Promise<void> => {
                const { apiKey }: { apiKey?: string } = await chrome.storage.local.get('apiKey');
                if (!apiKey) {
                    UI.showError('請先設定 API Key');
                    return;
                }

                UI.showToast('正在分析頁面內容...', true, false);

                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!tab?.id || !isValidUrl(tab.url)) {
                        UI.showError('此頁面不支援內容分析');
                        return;
                    }

                    await ensureContentScriptInjected(tab.id);

                    // 第一步：CEFR 分析
                    const message: ChromeMessage = { action: 'analyze', apiKey };
                    const response: ChromeResponse = await chrome.tabs.sendMessage(tab.id, message);

                    if (response.error) {
                        UI.showError(response.error);
                    } else if (response.level && response.text) {
                        const analysisResult: AnalysisResult = {
                            level: response.level,
                            text: response.text,
                            error: undefined
                        };

                        State.setLastAnalysisResult(analysisResult);

                        // 顯示結果
                        document.getElementById('level')!.textContent = response.level.level;
                        document.getElementById('vocabulary')!.textContent = response.level.analysis.vocabulary;
                        document.getElementById('grammar')!.textContent = response.level.analysis.grammar;
                        document.getElementById('topic')!.textContent = response.level.analysis.topic;

                        await Storage.saveAnalysis(analysisResult);
                        chrome.storage.local.set({ savedUrl: State.currentTabUrl });
                        Storage.updateStorageUsage();

                        // 隱藏載入提示並顯示中間成功訊息
                        const existingToast = document.querySelector('.toast.loading');
                        if (existingToast) existingToast.remove();
                        UI.showToast('CEFR 分析完成，正在分析單字...', true, false);

                        // 第二步：單字分析
                        try {
                            const vocabMessage: ChromeMessage = {
                                action: 'analyzeVocabulary',
                                apiKey: apiKey
                            };

                            const vocabResponse: ChromeResponse = await chrome.tabs.sendMessage(tab.id, vocabMessage);

                            if (vocabResponse.error) {
                                UI.showError('單字分析失敗：' + vocabResponse.error);
                            } else if (vocabResponse.vocabulary) {
                                State.setCurrentPageVocabulary(vocabResponse.vocabulary);
                                State.addToAccumulatedVocabulary(vocabResponse.vocabulary);

                                await Storage.saveVocabulary(State.accumulatedVocabulary);
                                await chrome.storage.local.set({ currentPageVocabulary: State.currentPageVocabulary });

                                Storage.updateStorageUsage();
                                updateVocabularyUI();

                                // 隱藏載入提示並顯示最終成功訊息
                                const finalToast = document.querySelector('.toast.loading');
                                if (finalToast) finalToast.remove();
                                UI.showToast(`找到 ${vocabResponse.vocabulary.length} 個單字！`, false, false, true);
                            } else {
                                const finalToast = document.querySelector('.toast.loading');
                                if (finalToast) finalToast.remove();
                                UI.showToast('CEFR 分析完成，未找到單字', false, false, true);
                            }
                        } catch (vocabError) {
                            const finalToast = document.querySelector('.toast.loading');
                            if (finalToast) finalToast.remove();
                            UI.showToast('分析完成，單字分析失敗', false, true);
                        }
                    }
                } catch (error) {
                    const errorMessage = (error as Error).message;
                    if (errorMessage.includes('Could not establish connection')) {
                        UI.showError('無法連接到頁面內容，請重新整理頁面後再試');
                    } else {
                        UI.showError('分析失敗，請確認頁面已載入完成');
                    }
                } finally {
                    const loadingToast = document.querySelector('.toast.loading');
                    if (loadingToast) loadingToast.remove();
                }
            });
        }

        // 初始化語音功能
        Speech.initializeSpeechPage();

        // 綁定匯出 CSV 按鈕事件（單字列表頁面）
        const exportButton = document.getElementById('export-csv');
        if (exportButton) {
            exportButton.addEventListener('click', exportVocabularyToCSV);
        }
        
        // 綁定匯出 CSV 按鈕事件（設定頁面）
        const settingsExportButton = document.getElementById('settings-export-csv');
        if (settingsExportButton) {
            settingsExportButton.addEventListener('click', exportVocabularyToCSV);
        }

        updateVocabularyUI();
    } catch (error) {
        console.error('初始化失敗:', error);
        UI.showError('初始化失敗，請確認頁面已載入完成');
    }
});

// 監聽來自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openVocabularyPage') {
        console.log('收到打開單字列表請求:', message);
        
        // 檢查是否來自 reading-mode
        if (message.source === 'reading-mode') {
            try {
                console.log('準備打開單字列表頁面...');
                
                // 打開新標籤頁顯示單字列表
                chrome.tabs.create({
                    url: chrome.runtime.getURL('src/pages/vocabulary.html')
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
        } else {
            // 原有的 popup 內切換邏輯
            const vocabularyTab = document.querySelector('[data-page="vocabulary-page"]') as HTMLElement;
            if (vocabularyTab) {
                vocabularyTab.click();
                // 確保單字列表是最新的
                updateVocabularyUI();
            }
            sendResponse({ success: true });
        }
    } else if (message.action === 'switchToVocabularyPage') {
        console.log('收到切換到單字列表請求:', message);
        
        // 檢查是否來自 reading-mode
        if (message.source === 'reading-mode') {
            try {
                console.log('準備切換到單字列表頁面...');
                
                // 切換到單字列表頁面
                const vocabularyTab = document.querySelector('[data-page="vocabulary-page"]') as HTMLElement;
                if (vocabularyTab) {
                    vocabularyTab.click();
                    // 確保單字列表是最新的
                    updateVocabularyUI();
                    console.log('成功切換到單字列表頁面');
                    sendResponse({ success: true });
                } else {
                    console.error('找不到單字列表頁面元素');
                    sendResponse({ 
                        success: false, 
                        error: '找不到單字列表頁面元素' 
                    });
                }
            } catch (error) {
                console.error('切換到單字列表頁面時發生錯誤:', error);
                sendResponse({ 
                    success: false, 
                    error: error instanceof Error ? error.message : '未知錯誤' 
                });
            }
            return true; // 保持訊息通道開啟
        } else {
            sendResponse({ success: false, error: '無效的來源' });
        }
    }
}); 