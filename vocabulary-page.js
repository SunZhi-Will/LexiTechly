// 在檔案開頭添加全域變數
let wordAnalysisCache = {};
let accumulatedVocabulary = [];
let currentPageVocabulary = [];
let audioCache = {};  // 新增語音快取
let currentAudio = null;  // 添加全域變數來追蹤當前播放的音訊
let lastPlayedText = null;
let lastPlayedSpeed = 'normal';  // 追蹤上次播放的速度

// 從 chrome.storage 讀取單字資料
async function loadVocabulary() {
    const {
        accumulatedVocabulary: savedAccumulated,
        currentPageVocabulary: savedCurrent,
        wordAnalysisCache: savedCache,
        audioCache: savedAudioCache
    } = await chrome.storage.local.get([
        'accumulatedVocabulary',
        'currentPageVocabulary',
        'wordAnalysisCache',
        'audioCache'
    ]);

    // 載入已儲存的資料
    if (savedAccumulated) {
        // 確保所有單字都有時間戳記
        accumulatedVocabulary = savedAccumulated.map(word => ({
            ...word,
            addedTime: word.addedTime || Date.now()  // 如果沒有時間戳記，則使用當前時間
        }));
    }
    if (savedCurrent) {
        currentPageVocabulary = savedCurrent.map(word => ({
            ...word,
            addedTime: word.addedTime || Date.now()
        }));
    }
    if (savedCache) {
        wordAnalysisCache = savedCache;
    }

    if (savedAudioCache) {
        // 將儲存的 base64 資料轉換為 Blob URL
        audioCache = {};
        for (const [text, audioData] of Object.entries(savedAudioCache)) {
            try {
                // 確保 audioData 是字串格式
                const audioDataString = typeof audioData === 'string'
                    ? audioData
                    : JSON.stringify(audioData);

                const audioBlob = await fetch(`data:audio/mp3;base64,${audioDataString}`).then(r => r.blob());
                audioCache[text] = URL.createObjectURL(audioBlob);
            } catch (error) {
                console.warn('音訊資料轉換失敗:', error);
                // 移除無效的音訊資料
                delete savedAudioCache[text];
            }
        }
        // 更新儲存的音訊快取，移除無效的資料
        await chrome.storage.local.set({ audioCache: savedAudioCache });
    }

    // 合併並去重
    const allWords = [...accumulatedVocabulary];
    currentPageVocabulary.forEach(word => {
        if (!allWords.some(w => w.text.toLowerCase() === word.text.toLowerCase())) {
            allWords.push(word);
        }
    });

    return allWords;
}

// 檢查儲存空間是否超過限制
async function checkStorageLimit(newDataSize = 0) {
    try {
        const { storageLimit } = await chrome.storage.local.get('storageLimit');
        if (!storageLimit) return true; // 無限制

        const {
            accumulatedVocabulary = [],
            currentPageVocabulary = [],
            wordAnalysisCache = {},
            audioCache = {},
            savedAnalysis = {},
            savedChat = []
        } = await chrome.storage.local.get(null);

        // 計算當前使用量
        const getSize = (data) => new TextEncoder().encode(JSON.stringify(data)).length;
        const currentUsage = getSize(accumulatedVocabulary) +
            getSize(currentPageVocabulary) +
            getSize(wordAnalysisCache) +
            getSize(audioCache) +
            getSize(savedAnalysis) +
            getSize(savedChat);

        // 檢查是否超過限制
        const limitBytes = storageLimit * 1024 * 1024;
        if ((currentUsage + newDataSize) > limitBytes) {
            showToast('已達到儲存空間上限，請清理空間或調整限制', false, true);
            return false;
        }
        return true;
    } catch (error) {
        console.error('檢查儲存空間失敗:', error);
        return false;
    }
}

// 修改儲存資料的函數
async function saveData(key, data) {
    try {
        const dataSize = new TextEncoder().encode(JSON.stringify(data)).length;
        if (await checkStorageLimit(dataSize)) {
            await chrome.storage.local.set({ [key]: data });
            return true;
        }
        return false;
    } catch (error) {
        console.error('儲存資料失敗:', error);
        return false;
    }
}

// 修改單字列表儲存函數
async function saveVocabulary(words) {
    const success = await saveData('accumulatedVocabulary', words);
    if (!success) {
        showToast('儲存空間不足，無法添加新單字', false, true);
        return false;  // 返回 false 表示儲存失敗
    }
    return true;  // 返回 true 表示儲存成功
}

// 修改更新單字顯示函數
async function updateWordDisplay(words) {
    // 檢查是否需要儲存
    if (words !== accumulatedVocabulary) {
        const dataSize = new TextEncoder().encode(JSON.stringify(words)).length;
        if (await checkStorageLimit(dataSize)) {
            const saveSuccess = await saveVocabulary(words);
            if (!saveSuccess) {
                // 如果儲存失敗，保持使用原有的單字列表
                updateWordDisplay(accumulatedVocabulary);
                return;
            }
        } else {
            // 如果超出容量限制，保持使用原有的單字列表
            updateWordDisplay(accumulatedVocabulary);
            return;
        }
    }

    // 更新全域變數
    accumulatedVocabulary = words;

    const grid = document.getElementById('word-grid');
    grid.innerHTML = '';

    words.forEach(word => {
        // 建立主卡片
        const card = document.createElement('div');
        card.className = 'word-card';

        // 基本資訊區塊
        card.innerHTML = `
            <div class="word-header">
                <div class="word-text">${word.text}</div>
                <div class="word-level">${word.level || 'N/A'}</div>
            </div>
            <div class="word-details">${word.example || ''}</div>
            <div class="word-translation">${word.translation || ''}</div>
        `;

        // 建立詳細資訊頁面
        const detailsPage = document.createElement('div');
        detailsPage.className = 'word-details-page';
        detailsPage.innerHTML = `
            <div class="details-header">
                <button class="back-btn">
                    <svg viewBox="0 0 24 24" class="back-icon">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                    返回
                </button>
                <div class="word-title-container">
                    <div class="word-title">${word.text}</div>
                    <div class="word-translation-title">${word.translation || '暫無翻譯'}</div>
                    <button class="speak-btn" title="播放發音">
                        ${getSpeakButtonHTML()}
                    </button>
                </div>
                <button class="reanalyze-btn" title="重新分析">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                    </svg>
                </button>
            </div>
            <div class="details-content">
                <div class="loading-overlay" style="display: none;">
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                        <p>正在分析中...</p>
                    </div>
                </div>
                <div class="details-sections">
                    <div class="synonyms-section">
                        <h4>相似詞</h4>
                        <div class="synonyms-content">尚未分析</div>
                    </div>
                    <div class="antonyms-section">
                        <h4>反義詞</h4>
                        <div class="antonyms-content">尚未分析</div>
                    </div>
                    <div class="examples-section">
                        <h4>更多例句</h4>
                        <div class="examples-content">尚未分析</div>
                    </div>
                    <div class="usage-section">
                        <h4>用法說明</h4>
                        <div class="usage-content">尚未分析</div>
                    </div>
                </div>
            </div>
        `;

        let detailsLoaded = false;

        // 點擊卡片開啟詳細資訊
        card.addEventListener('click', async () => {
            // 將所有頁面的 z-index 重置
            document.querySelectorAll('.word-details-page').forEach(page => {
                page.style.zIndex = '1000';
            });

            // 設定新頁面的 z-index 為最高
            detailsPage.style.zIndex = '1001';

            // 直接展開新頁面
            detailsPage.classList.add('active');
            document.body.style.overflow = 'hidden';

            // 檢查是否有快取的分析結果
            if (wordAnalysisCache[word.text]) {
                // 使用快取的結果
                const details = wordAnalysisCache[word.text];
                updateDetailsContent(detailsPage, details, word);
                detailsLoaded = true;
            }

            // 如果還沒載入過詳細資料，則進行分析
            if (!detailsLoaded) {
                try {
                    const { apiKey } = await chrome.storage.local.get('apiKey');
                    if (!apiKey) {
                        detailsPage.querySelector('.details-sections').innerHTML = `
                            <div class="error-message">
                                請先在設定頁面設定 API Key
                            </div>
                        `;
                        return;
                    }

                    detailsPage.querySelector('.loading-overlay').style.display = 'flex';
                    detailsPage.querySelector('.details-sections').style.opacity = '0.5';

                    const details = await analyzeWordDetails(word.text, apiKey);

                    // 儲存分析結果到快取
                    wordAnalysisCache[word.text] = details;
                    await chrome.storage.local.set({ wordAnalysisCache });

                    updateDetailsContent(detailsPage, details, word);

                    detailsLoaded = true;
                } catch (error) {
                    console.error('分析失敗:', error);
                    detailsPage.querySelector('.details-sections').innerHTML = `
                        <div class="error-message">
                            <h4>分析時發生錯誤</h4>
                            <p>${error.message}</p>
                            <button class="retry-btn">重試</button>
                        </div>
                    `;

                    // 添加重試按鈕功能
                    const retryBtn = detailsPage.querySelector('.retry-btn');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            detailsLoaded = false;
                            // 清除該單字的快取
                            delete wordAnalysisCache[word.text];
                            await chrome.storage.local.set({ wordAnalysisCache });
                            // 重新初始化內容
                            detailsPage.querySelector('.details-sections').innerHTML = `
                                <div class="synonyms-section">
                                    <h4>相似詞</h4>
                                    <div class="synonyms-content">尚未分析</div>
                                </div>
                                <div class="antonyms-section">
                                    <h4>反義詞</h4>
                                    <div class="antonyms-content">尚未分析</div>
                                </div>
                                <div class="examples-section">
                                    <h4>更多例句</h4>
                                    <div class="examples-content">尚未分析</div>
                                </div>
                                <div class="usage-section">
                                    <h4>用法說明</h4>
                                    <div class="usage-content">尚未分析</div>
                                </div>
                            `;
                            // 重新觸發分析
                            card.click();
                        });
                    }
                } finally {
                    detailsPage.querySelector('.loading-overlay').style.display = 'none';
                    detailsPage.querySelector('.details-sections').style.opacity = '1';
                }
            }
        });

        // 返回按鈕功能
        detailsPage.querySelector('.back-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            detailsPage.classList.remove('active');
            document.body.style.overflow = '';
        });

        // 添加重新分析按鈕的事件監聽
        detailsPage.querySelector('.reanalyze-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const { apiKey } = await chrome.storage.local.get('apiKey');
                if (!apiKey) {
                    throw new Error('請先設定 API Key');
                }

                // 顯示載入動畫
                detailsPage.querySelector('.loading-overlay').style.display = 'flex';
                detailsPage.querySelector('.details-sections').style.opacity = '0.5';

                // 清除快取
                delete wordAnalysisCache[word.text];
                await chrome.storage.local.set({ wordAnalysisCache });

                // 重新分析
                const details = await analyzeWordDetails(word.text, apiKey);

                // 更新快取
                wordAnalysisCache[word.text] = details;
                await chrome.storage.local.set({ wordAnalysisCache });

                // 更新顯示
                updateDetailsContent(detailsPage, details, word);

                showToast('重新分析完成');
            } catch (error) {
                console.error('重新分析失敗:', error);
                showToast(`重新分析失敗: ${error.message}`, false, true);
            } finally {
                detailsPage.querySelector('.loading-overlay').style.display = 'none';
                detailsPage.querySelector('.details-sections').style.opacity = '1';
            }
        });

        // 添加發音按鈕的事件監聽
        addSpeakButtonListeners(detailsPage, word);

        grid.appendChild(card);
        document.body.appendChild(detailsPage);
    });

    document.getElementById('total-count').textContent = words.length;
}

// 修改格式化單字列表的函數
function formatWordList(words, type) {
    if (!words || words.length === 0) {
        return '無';
    }

    return words.map(word => {
        // 檢查 word 是否為物件格式
        const wordText = typeof word === 'object' ? word.text : word;
        const translation = typeof word === 'object' ? word.translation : '';

        // 檢查單字是否已在列表中
        const isInList = accumulatedVocabulary.some(w =>
            w.text.toLowerCase() === wordText.toLowerCase()
        );

        return `
            <div class="word-chip clickable${isInList ? ' added' : ''}" data-word="${wordText}" data-type="${type}">
                <span class="word-text">${wordText}</span>
                ${translation ? `<span class="word-translation">${translation}</span>` : ''}
                ${!isInList ? `
                    <span class="add-icon" title="加入單字列表">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                    </span>
                ` : ''}
            </div>
        `;
    }).join('');
}

// 修改發音按鈕的 HTML 模板
function getSpeakButtonHTML(size = 'normal') {
    return `
        <svg class="play-icon" viewBox="0 0 24 24" width="${size === 'small' ? '16' : '20'}" height="${size === 'small' ? '16' : '20'}">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
        <svg class="stop-icon" viewBox="0 0 24 24" width="${size === 'small' ? '16' : '20'}" height="${size === 'small' ? '16' : '20'}">
            <path d="M6 6h12v12H6z"/>
        </svg>
    `;
}

// 修改音訊快取儲存函數
async function cacheAudioData(text, audioData) {
    try {
        // 計算新增音訊後的大小
        const { audioCache: savedCache = {} } = await chrome.storage.local.get('audioCache');
        const newCache = { ...savedCache, [text]: audioData };
        const dataSize = new TextEncoder().encode(JSON.stringify(newCache)).length;

        // 檢查儲存空間
        if (!(await checkStorageLimit(dataSize))) {
            console.warn('儲存空間不足，無法快取語音');
            return false;
        }

        // 儲存音訊資料
        await chrome.storage.local.set({ audioCache: newCache });
        return true;
    } catch (error) {
        console.error('快取音訊失敗:', error);
        return false;
    }
}

// 修改語音功能
async function speakWord(text, button) {
    try {
        // 如果按鈕已在載入中，直接返回
        if (button && button.classList.contains('loading')) {
            return;
        }

        // 如果正在播放，則停止
        if (currentAudio && button.classList.contains('playing')) {
            currentAudio.pause();
            currentAudio = null;
            button.classList.remove('playing');
            return;
        }

        // 先重置所有播放按鈕的狀態
        document.querySelectorAll('.speak-btn').forEach(btn => {
            btn.classList.remove('playing');
        });

        // 檢查是否是重複播放同一個文字
        const isRepeating = text === lastPlayedText;

        // 決定播放速度
        const speed = isRepeating && lastPlayedSpeed === 'normal' ? 'slow' : 'normal';
        lastPlayedText = text;
        lastPlayedSpeed = speed;

        // 如果有其他音訊在播放，先停止
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        // 添加載入狀態
        if (button) {
            button.classList.add('loading');
            if (speed === 'slow') {
                button.classList.add('slow');
            }
            button.disabled = true;
        }

        try {
            // 檢查快取
            if (audioCache[text]) {
                currentAudio = new Audio(audioCache[text]);
            } else {
                // 從設定讀取 API Key
                const { speechifyApiKey } = await chrome.storage.local.get('speechifyApiKey');
                if (!speechifyApiKey) {
                    throw new Error('請先在設定頁面設定語音 API Key');
                }

                // 使用 API 生成語音
                const response = await fetch('https://api.sws.speechify.com/v1/audio/speech', {
                    method: 'POST',
                    headers: {
                        'accept': '*/*',
                        'content-type': 'application/json',
                        'Authorization': `Bearer ${speechifyApiKey}`
                    },
                    body: JSON.stringify({
                        voice_id: 'henry',
                        input: text,
                        output_format: 'mp3'
                    })
                });

                if (!response.ok) {
                    throw new Error('語音 API 請求失敗');
                }

                const data = await response.json();
                if (!data.audio_data) {
                    throw new Error('未收到音訊資料');
                }

                // 創建音訊 URL
                const audioBlob = await fetch(`data:audio/mp3;base64,${data.audio_data}`).then(r => r.blob());
                const audioUrl = URL.createObjectURL(audioBlob);
                audioCache[text] = audioUrl;
                currentAudio = new Audio(audioUrl);

                // 嘗試儲存音訊資料
                const cacheSuccess = await cacheAudioData(text, data.audio_data);
                if (!cacheSuccess) {
                    showToast('儲存空間不足，語音將不會被快取', false, true);
                }
            }

            // 設定播放速度
            currentAudio.playbackRate = speed === 'slow' ? 0.7 : 1.0;

            // 添加播放狀態
            button.classList.add('playing');

            // 播放結束時的處理
            currentAudio.addEventListener('ended', () => {
                button.classList.remove('playing');
                currentAudio = null;
            });

            // 播放錯誤時的處理
            currentAudio.addEventListener('error', () => {
                button.classList.remove('playing');
                currentAudio = null;
            });

            await currentAudio.play();

        } catch (apiError) {
            console.warn('Speechify API 失敗，使用備用語音:', apiError);
            await fallbackSpeak(text, button, speed);
        } finally {
            if (button) {
                button.classList.remove('loading');
                button.classList.remove('slow');
                button.disabled = false;
            }
        }

    } catch (error) {
        console.error('語音播放失敗:', error);
        showToast(`語音播放失敗: ${error.message}`, false, true);
        if (button) {
            button.classList.remove('loading', 'playing');
            button.disabled = false;
        }
    }
}

// 修改按鈕 HTML 生成
function formatExamples(examples) {
    if (!examples || examples.length === 0) return '無資料';
    return examples.map(example => `
        <div class="example-item">
            <div class="example-text">
                ${example.text}
                <button class="speak-btn small" title="播放發音" data-text="${example.text}">
                    ${getSpeakButtonHTML('small')}
                </button>
            </div>
            <div class="example-translation">${example.translation}</div>
        </div>
    `).join('');
}

// 修改 AI 分析單字詳細資訊函數
async function analyzeWordDetails(word, apiKey) {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    const prompt = `
        分析英文單字 "${word}" 並提供以下資訊：
        1. 相似詞（最多5個，包含中文翻譯）
        2. 反義詞（最多5個，包含中文翻譯）
        3. 例句（3個，包含中文翻譯）
        4. 用法說明（中文說明，100字以內）

        請直接回傳 JSON 格式，不要加入任何其他標記或說明。格式如下：
        {
            "synonyms": [
                {"text": "相似詞1", "translation": "中文翻譯1"},
                {"text": "相似詞2", "translation": "中文翻譯2"}
            ],
            "antonyms": [
                {"text": "反義詞1", "translation": "中文翻譯1"},
                {"text": "反義詞2", "translation": "中文翻譯2"}
            ],
            "examples": [
                {"text": "英文例句1", "translation": "中文翻譯1"},
                {"text": "英文例句2", "translation": "中文翻譯2"},
                {"text": "英文例句3", "translation": "中文翻譯3"}
            ],
            "usage": "用法說明（中文）",
            "translation": "單字的中文翻譯（簡潔準確）"
        }

        注意：
        1. 請確保回應是有效的 JSON 格式
        2. 不要加入 markdown 標記或其他格式
        3. 不要加入任何額外的說明文字
        4. translation 欄位請提供最常用、最準確的中文翻譯
        5. synonyms 和 antonyms 中的每個單字都要包含中文翻譯
    `;

    try {
        // 獲取 Speechify API Key
        const { speechifyApiKey } = await chrome.storage.local.get('speechifyApiKey');
        if (!speechifyApiKey) {
            throw new Error('請先設定語音 API Key');
        }

        // 同時發送 AI 分析和語音生成的請求
        const [analysisResponse, speechResponse] = await Promise.all([
            // AI 分析請求
            fetch(`${API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024
                    }
                })
            }),
            // 語音生成請求
            fetch('https://api.sws.speechify.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${speechifyApiKey}`
                },
                body: JSON.stringify({
                    voice_id: 'henry',
                    input: word,
                    output_format: 'mp3'
                })
            })
        ]);

        if (!analysisResponse.ok || !speechResponse.ok) {
            throw new Error('API 請求失敗');
        }

        // 處理 AI 分析結果
        const analysisData = await analysisResponse.json();
        const text = analysisData.candidates[0].content.parts[0].text.trim();
        let jsonText = text.replace(/```json\n?|\n?```/g, '').trim();
        const result = JSON.parse(jsonText);

        // 驗證結果格式
        if (!result.synonyms || !Array.isArray(result.synonyms)) {
            throw new Error('相似詞格式錯誤');
        }
        if (!result.antonyms || !Array.isArray(result.antonyms)) {
            throw new Error('反義詞格式錯誤');
        }
        if (!result.examples || !Array.isArray(result.examples)) {
            throw new Error('例句格式錯誤');
        }
        if (!result.usage || typeof result.usage !== 'string') {
            throw new Error('用法說明格式錯誤');
        }

        // 處理語音資料
        const speechData = await speechResponse.json();
        if (speechData.audio_data) {
            try {
                // 確保 audio_data 是字串格式
                const audioDataString = typeof speechData.audio_data === 'string'
                    ? speechData.audio_data
                    : JSON.stringify(speechData.audio_data);

                // 檢查儲存空間並儲存語音資料
                const saveSuccess = await cacheAudioData(word, audioDataString);
                if (!saveSuccess) {
                    console.warn('儲存空間不足，語音將不會被快取');
                } else {
                    // 只有在成功儲存後才創建 Blob URL
                    const audioBlob = await fetch(`data:audio/mp3;base64,${audioDataString}`).then(r => r.blob());
                    const audioUrl = URL.createObjectURL(audioBlob);
                    window.audioCache = window.audioCache || {};
                    window.audioCache[word] = audioUrl;
                }
            } catch (error) {
                console.warn('音訊資料處理失敗:', error);
            }
        }

        return result;

    } catch (error) {
        console.error('分析失敗:', error);
        throw new Error(error.message || '無法取得詳細資訊');
    }
}

// 修改搜尋功能
function filterAndSortWords(words, filters) {
    let filteredWords = [...words];

    // 等級篩選
    if (filters.level && filters.level !== 'all') {
        filteredWords = filteredWords.filter(word => word.level === filters.level);
    }

    // 搜尋篩選
    if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredWords = filteredWords.filter(word =>
            word.text.toLowerCase().includes(searchTerm) ||
            (word.translation && word.translation.toLowerCase().includes(searchTerm))
        );
    }

    // 排序
    if (filters.sort) {
        switch (filters.sort) {
            case 'level':
                filteredWords.sort((a, b) => (a.level || '').localeCompare(b.level || ''));
                break;
            case 'alphabet':
                filteredWords.sort((a, b) => a.text.localeCompare(b.text));
                break;
            case 'time':
                filteredWords.sort((a, b) => (b.addedTime || 0) - (a.addedTime || 0));
                break;
        }
    }

    return filteredWords;
}

// 修改初始化頁面函數
async function initializePage() {
    let allWords = await loadVocabulary();  // 保存完整的單字列表
    const filters = {
        level: '',
        search: '',
        sort: 'level'
    };

    // 初始顯示
    updateWordDisplay(filterAndSortWords(allWords, filters));

    // 監聽篩選器變化
    document.getElementById('level-filter').addEventListener('change', e => {
        filters.level = e.target.value;
        // 使用完整的單字列表進行篩選
        updateWordDisplay(filterAndSortWords(allWords, filters));
    });

    // 修改搜尋事件監聽器
    document.getElementById('search-filter').addEventListener('input', (e) => {
        const searchTerm = e.target.value;
        const levelFilter = document.getElementById('level-filter').value;
        const sortFilter = document.getElementById('sort-filter').value;

        // 每次都從完整的單字列表中進行搜尋
        updateWordDisplay(filterAndSortWords(allWords, {
            level: levelFilter,
            search: searchTerm,
            sort: sortFilter
        }));
    });

    document.getElementById('sort-filter').addEventListener('change', e => {
        filters.sort = e.target.value;
        // 使用完整的單字列表進行篩選
        updateWordDisplay(filterAndSortWords(allWords, filters));
    });

    // 監聽 storage 變化
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.accumulatedVocabulary) {
            // 更新完整的單字列表
            allWords = changes.accumulatedVocabulary.newValue || [];
            updateWordDisplay(filterAndSortWords(allWords, filters));
        }
    });
}

// 啟動頁面
document.addEventListener('DOMContentLoaded', initializePage);

// 修改清除單字列表函數
function clearVocabulary() {
    accumulatedVocabulary = [];
    currentPageVocabulary = [];
    wordAnalysisCache = {};

    // 清除記憶體中的 Blob URLs
    if (window.audioCache) {
        Object.values(window.audioCache).forEach(url => {
            URL.revokeObjectURL(url);
        });
        window.audioCache = {};
    }

    // 從 storage 中清除所有相關資料
    chrome.storage.local.remove([
        'accumulatedVocabulary',
        'currentPageVocabulary',
        'wordAnalysisCache',
        'audioCache'
    ], function () {
        updateWordDisplay(filterAndSortWords([], {
            level: '',
            search: '',
            sort: 'level'
        }));
        showToast('單字列表已清除');
    });
}

// 修改備用語音功能
async function fallbackSpeak(text, button, speed = 'normal') {
    // 如果正在播放，則停止
    if (button.classList.contains('playing')) {
        window.speechSynthesis.cancel();
        button.classList.remove('playing');
        return;
    }

    // 如果有其他音訊在播放，先停止
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    window.speechSynthesis.cancel();  // 停止所有語音合成

    return new Promise(async (resolve, reject) => {
        try {
            // 確保語音列表已載入
            let voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) {
                await new Promise(resolve => {
                    window.speechSynthesis.onvoiceschanged = () => {
                        voices = window.speechSynthesis.getVoices();
                        resolve();
                    };
                });
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = speed === 'slow' ? 0.5 : 1;  // 慢速更慢

            // 選擇英文聲音，優先選擇女聲
            const englishVoice = voices.find(voice =>
                voice.lang.includes('en') && voice.name.includes('Female')
            ) || voices.find(voice =>
                voice.lang.includes('en')
            );

            if (englishVoice) {
                utterance.voice = englishVoice;
            }

            // 添加播放狀態
            if (button) {
                button.classList.remove('loading');  // 移除載入狀態
                button.classList.add('playing');     // 添加播放狀態
                button.disabled = false;             // 確保按鈕可以點擊
            }

            // 播放結束時的處理
            utterance.onend = () => {
                if (button) {
                    button.classList.remove('playing');
                    button.disabled = false;
                }
                window.speechSynthesis.cancel();  // 確保完全停止
                resolve();
            };

            utterance.onerror = (event) => {
                if (button) {
                    button.classList.remove('playing');
                    button.disabled = false;
                }
                window.speechSynthesis.cancel();  // 確保完全停止
                resolve(); // 使用 resolve 而不是 reject，避免顯示錯誤訊息
            };

            window.speechSynthesis.speak(utterance);

            // 修復 Chrome 的已知問題：長文本可能會被切斷
            const maximumTimeout = text.length * 100;
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    if (window.speechSynthesis.speaking) {
                        window.speechSynthesis.pause();
                        window.speechSynthesis.resume();
                    }
                }, maximumTimeout);
            });

            // 同時監聽播放完成和超時
            await Promise.race([
                new Promise(resolve => {
                    utterance.onend = () => {
                        if (button) {
                            button.classList.remove('playing');
                            button.disabled = false;
                        }
                        window.speechSynthesis.cancel();  // 確保完全停止
                        resolve();
                    };
                }),
                timeoutPromise
            ]);

        } catch (error) {
            if (button) {
                button.classList.remove('loading', 'playing');
                button.disabled = false;
            }
            window.speechSynthesis.cancel();  // 確保完全停止
            resolve(); // 使用 resolve 而不是 reject，避免顯示錯誤訊息
        }
    });
}

// 移除原有的語音列表載入檢查，因為已經整合到 fallbackSpeak 函數中
if ('speechSynthesis' in window) {
    // 預先載入語音列表
    window.speechSynthesis.getVoices();
}

// 修改發音按鈕的事件監聽
function addSpeakButtonListeners(detailsPage, word) {
    // 單字發音按鈕
    const wordSpeakBtn = detailsPage.querySelector('.speak-btn');

    // 移除舊的事件監聽器
    const oldClickHandler = wordSpeakBtn.clickHandler;
    if (oldClickHandler) {
        wordSpeakBtn.removeEventListener('click', oldClickHandler);
    }

    // 創建新的事件處理函數
    const newClickHandler = (e) => {
        e.stopPropagation();
        speakWord(word.text, wordSpeakBtn);
    };

    // 儲存事件處理函數的引用
    wordSpeakBtn.clickHandler = newClickHandler;

    // 添加新的事件監聽器
    wordSpeakBtn.addEventListener('click', newClickHandler);

    // 例句發音按鈕
    detailsPage.querySelectorAll('.example-item .speak-btn').forEach(btn => {
        // 移除舊的事件監聽器
        const oldHandler = btn.clickHandler;
        if (oldHandler) {
            btn.removeEventListener('click', oldHandler);
        }

        // 創建新的事件處理函數
        const newHandler = (e) => {
            e.stopPropagation();
            speakWord(btn.dataset.text, btn);
        };

        // 儲存事件處理函數的引用
        btn.clickHandler = newHandler;

        // 添加新的事件監聽器
        btn.addEventListener('click', newHandler);
    });

    // 添加相似詞和反義詞的點擊事件
    // detailsPage.querySelectorAll('.word-chip.clickable').forEach(chip => {
    //     chip.addEventListener('click', () => handleWordChipClick(chip, word));
    // });
}

// 修改點擊事件處理函數
async function handleWordChipClick(chip, currentWord) {
    const wordText = chip.dataset.word;
    const type = chip.dataset.type;

    try {
        const overlay = document.querySelector('.analyzing-overlay');
        overlay.classList.add('active');
        // 檢查單字是否已存在
        const existingWord = accumulatedVocabulary.find(w =>
            w.text.toLowerCase() === wordText.toLowerCase()
        );

        if (existingWord) {
            // 如果單字已存在，找到對應的卡片並觸發點擊
            const cards = document.querySelectorAll('.word-card');
            const existingCard = Array.from(cards).find(card =>
                card.querySelector('.word-text').textContent.toLowerCase() === wordText.toLowerCase()
            );

            if (existingCard) {
                // 關閉所有已開啟的詳細資訊頁面
                document.querySelectorAll('.word-details-page.active').forEach(page => {
                    page.style.transition = 'none';  // 移除過渡效果
                    page.classList.remove('active');
                    page.offsetHeight;  // 強制重繪
                    page.style.transition = '';  // 恢復過渡效果
                });

                // 觸發新卡片的點擊
                existingCard.click();
                // existingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showToast('單字已在列表中');
            }
            return;
        }

        // 取得 API Key
        const { apiKey } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
            throw new Error('請先設定 API Key');
        }

        // 檢查是否已有快取的分析結果
        let details = wordAnalysisCache[wordText];
        if (!details) {
            // 如果沒有快取，才進行分析
            details = await analyzeWordDetails(wordText, apiKey);
            // 儲存分析結果到快取
            wordAnalysisCache[wordText] = details;
            await chrome.storage.local.set({ wordAnalysisCache });
        }

        // 建立新單字物件，包含翻譯和例句
        const newWord = {
            text: wordText,
            level: currentWord.level,
            addedTime: Date.now(),
            translation: details.translation || '',
            example: details.examples?.[0]?.text || ''
        };

        // 檢查儲存空間是否足夠
        const newVocabulary = [...accumulatedVocabulary, newWord];
        const dataSize = new TextEncoder().encode(JSON.stringify(newVocabulary)).length;

        if (!(await checkStorageLimit(dataSize))) {
            showToast('儲存空間不足，無法添加新單字', false, true);
            return;
        }

        // 更新全域變數和儲存
        accumulatedVocabulary = newVocabulary;  // 直接更新全域變數
        const saveSuccess = await chrome.storage.local.set({ accumulatedVocabulary: newVocabulary });
        // if (!saveSuccess) {
        //     showToast('儲存空間不足，無法添加新單字', false, true);
        //     accumulatedVocabulary = accumulatedVocabulary.slice(0, -1);  // 回復全域變數
        //     return;
        // }

        // 關閉所有已開啟的詳細資訊頁面
        document.querySelectorAll('.word-details-page.active').forEach(page => {
            page.style.transition = 'none';
            page.classList.remove('active');
            page.offsetHeight;
            page.style.transition = '';
        });

        // 更新顯示
        updateWordDisplay(accumulatedVocabulary);

        // 找到新添加的卡片和詳細頁面
        setTimeout(() => {
            const cards = document.querySelectorAll('.word-card');
            const newCard = Array.from(cards).find(card =>
                card.querySelector('.word-text').textContent.toLowerCase() === wordText.toLowerCase()
            );

            if (newCard) {
                // 滾動到新卡片位置
                // newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // 找到對應的詳細頁面並展開
                const detailsPages = document.querySelectorAll('.word-details-page');
                const newDetailsPage = Array.from(detailsPages).find(page =>
                    page.querySelector('.word-title').textContent.toLowerCase() === wordText.toLowerCase()
                );

                if (newDetailsPage) {
                    // 立即更新詳細頁面內容
                    updateDetailsContent(newDetailsPage, details, newWord);
                    newDetailsPage.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            }
        }, 100);

        showToast(`已添加 ${type === 'synonym' ? '相似詞' : '反義詞'}: ${wordText}`);

    } catch (error) {
        console.error('添加單字失敗:', error);
        showToast('添加單字失敗: ' + error.message, false, true);
    } finally {
        // 移除載入狀態
        chip.classList.remove('loading');
        chip.style.pointerEvents = '';
        // 隱藏載入遮罩
        const overlay = document.querySelector('.analyzing-overlay');
        overlay.classList.remove('active');
    }
}

// 修改更新詳細資訊的函數
function updateDetailsContent(detailsPage, details, word) {
    detailsPage.querySelector('.synonyms-content').innerHTML = formatWordList(details.synonyms, 'synonym');
    detailsPage.querySelector('.antonyms-content').innerHTML = formatWordList(details.antonyms, 'antonym');
    detailsPage.querySelector('.examples-content').innerHTML = formatExamples(details.examples);
    detailsPage.querySelector('.usage-content').innerHTML = details.usage;

    // 添加所有發音按鈕的事件監聽
    addSpeakButtonListeners(detailsPage, word);

    // 添加相似詞和反義詞的點擊事件
    detailsPage.querySelectorAll('.word-chip.clickable').forEach(chip => {
        chip.addEventListener('click', () => handleWordChipClick(chip, word));
    });
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
                bottom: 20px;
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
            }
            #toast.error {
                background-color: #d32f2f;
            }
        `;
        document.head.appendChild(style);
    }

    toast.className = 'toast' + (isError ? ' error' : '');
    toast.textContent = message;
    toast.style.display = 'flex';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
} 