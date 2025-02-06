// 在檔案開頭添加
let wordAnalysisCache = {};

// 從 chrome.storage 讀取單字資料
async function loadVocabulary() {
    const { accumulatedVocabulary, currentPageVocabulary, wordAnalysisCache: savedCache } =
        await chrome.storage.local.get(['accumulatedVocabulary', 'currentPageVocabulary', 'wordAnalysisCache']);

    // 載入已儲存的分析快取
    if (savedCache) {
        wordAnalysisCache = savedCache;
    }

    // 合併並去重
    const allWords = [...(accumulatedVocabulary || [])];
    if (currentPageVocabulary) {
        currentPageVocabulary.forEach(word => {
            if (!allWords.some(w => w.text.toLowerCase() === word.text.toLowerCase())) {
                allWords.push(word);
            }
        });
    }

    return allWords;
}

// 更新單字顯示
function updateWordDisplay(words) {
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
            <div class="word-details">${word.example || '暫無例句'}</div>
            <div class="word-translation">${word.translation || '暫無翻譯'}</div>
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
                </div>
            </div>
            <div class="details-content">
                <div class="loading-spinner" style="display: none;">
                    <div class="spinner"></div>
                    <p>正在分析中...</p>
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
            // 先展開頁面
            detailsPage.classList.add('active');
            document.body.style.overflow = 'hidden';

            // 檢查是否有快取的分析結果
            if (wordAnalysisCache[word.text]) {
                // 使用快取的結果
                const details = wordAnalysisCache[word.text];
                detailsPage.querySelector('.synonyms-content').innerHTML = formatWordList(details.synonyms);
                detailsPage.querySelector('.antonyms-content').innerHTML = formatWordList(details.antonyms);
                detailsPage.querySelector('.examples-content').innerHTML = formatExamples(details.examples);
                detailsPage.querySelector('.usage-content').innerHTML = details.usage;
                detailsLoaded = true;
                return;
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

                    detailsPage.querySelector('.loading-spinner').style.display = 'block';
                    detailsPage.querySelector('.details-sections').style.opacity = '0.5';

                    const details = await analyzeWordDetails(word.text, apiKey);

                    // 儲存分析結果到快取
                    wordAnalysisCache[word.text] = details;
                    await chrome.storage.local.set({ wordAnalysisCache });

                    detailsPage.querySelector('.synonyms-content').innerHTML = formatWordList(details.synonyms);
                    detailsPage.querySelector('.antonyms-content').innerHTML = formatWordList(details.antonyms);
                    detailsPage.querySelector('.examples-content').innerHTML = formatExamples(details.examples);
                    detailsPage.querySelector('.usage-content').innerHTML = details.usage;

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
                    detailsPage.querySelector('.loading-spinner').style.display = 'none';
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

        grid.appendChild(card);
        document.body.appendChild(detailsPage);
    });

    document.getElementById('total-count').textContent = words.length;
}

// 格式化單字列表
function formatWordList(words) {
    if (!words || words.length === 0) return '無資料';
    return words.map(word => `<span class="word-chip">${word}</span>`).join('');
}

// 格式化例句
function formatExamples(examples) {
    if (!examples || examples.length === 0) return '無資料';
    return examples.map(example => `
        <div class="example-item">
            <div class="example-text">${example.text}</div>
            <div class="example-translation">${example.translation}</div>
        </div>
    `).join('');
}

// AI 分析單字詳細資訊
async function analyzeWordDetails(word, apiKey) {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    const prompt = `
        分析英文單字 "${word}" 並提供以下資訊：
        1. 相似詞（最多5個）
        2. 反義詞（最多5個）
        3. 例句（3個，包含中文翻譯）
        4. 用法說明（中文說明，100字以內）

        請直接回傳 JSON 格式，不要加入任何其他標記或說明。格式如下：
        {
            "synonyms": ["相似詞1", "相似詞2", ...],
            "antonyms": ["反義詞1", "反義詞2", ...],
            "examples": [
                {"text": "英文例句1", "translation": "中文翻譯1"},
                {"text": "英文例句2", "translation": "中文翻譯2"},
                {"text": "英文例句3", "translation": "中文翻譯3"}
            ],
            "usage": "用法說明（中文）"
        }

        注意：
        1. 請確保回應是有效的 JSON 格式
        2. 不要加入 markdown 標記或其他格式
        3. 不要加入任何額外的說明文字
    `;

    try {
        const response = await fetch(`${API_URL}?key=${apiKey}`, {
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
        });

        if (!response.ok) {
            throw new Error('API 請求失敗');
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text.trim();

        // 嘗試清理並解析 JSON
        let jsonText = text;

        // 移除可能的 markdown 代碼區塊標記
        jsonText = jsonText.replace(/```json\n?|\n?```/g, '');

        // 移除開頭和結尾的空白字元
        jsonText = jsonText.trim();

        try {
            // 嘗試解析 JSON
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

            return result;
        } catch (parseError) {
            console.error('JSON 解析錯誤:', parseError);
            console.error('原始回應:', text);
            throw new Error('AI 回應格式錯誤');
        }
    } catch (error) {
        console.error('AI 分析失敗:', error);
        throw new Error(error.message || '無法取得詳細資訊');
    }
}

// 篩選和排序
function filterAndSortWords(words, filters) {
    let filtered = [...words];

    // 等級篩選
    if (filters.level) {
        filtered = filtered.filter(word => word.level === filters.level);
    }

    // 搜尋篩選
    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(word =>
            word.text.toLowerCase().includes(searchLower) ||
            word.translation.toLowerCase().includes(searchLower)
        );
    }

    // 排序
    switch (filters.sort) {
        case 'level':
            filtered.sort((a, b) => (a.level || 'Z').localeCompare(b.level || 'Z'));
            break;
        case 'alphabet':
            filtered.sort((a, b) => a.text.localeCompare(b.text));
            break;
        case 'latest':
            // 假設最新的在陣列最後
            filtered.reverse();
            break;
    }

    return filtered;
}

// 初始化頁面
async function initializePage() {
    const words = await loadVocabulary();
    const filters = {
        level: '',
        search: '',
        sort: 'level'
    };

    // 初始顯示
    updateWordDisplay(filterAndSortWords(words, filters));

    // 監聽篩選器變化
    document.getElementById('level-filter').addEventListener('change', e => {
        filters.level = e.target.value;
        updateWordDisplay(filterAndSortWords(words, filters));
    });

    document.getElementById('search-filter').addEventListener('input', e => {
        filters.search = e.target.value;
        updateWordDisplay(filterAndSortWords(words, filters));
    });

    document.getElementById('sort-filter').addEventListener('change', e => {
        filters.sort = e.target.value;
        updateWordDisplay(filterAndSortWords(words, filters));
    });
}

// 啟動頁面
document.addEventListener('DOMContentLoaded', initializePage);

// 修改清除單字列表函數
function clearVocabulary() {
    accumulatedVocabulary = [];
    currentPageVocabulary = [];
    wordAnalysisCache = {}; // 同時清除分析快取
    chrome.storage.local.remove(['accumulatedVocabulary', 'currentPageVocabulary', 'wordAnalysisCache'], function () {
        updateWordDisplay(filterAndSortWords([], { level: '', search: '', sort: 'level' }));
    });
} 