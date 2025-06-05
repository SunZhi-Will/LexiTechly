/// <reference types="chrome"/>

import { Word, WordDetails } from './types.js';
import {
    accumulatedVocabulary,
    wordAnalysisCache,
    saveVocabulary,
    checkStorageLimit
} from './storage.js';
import { speakWord, getSpeakButtonHTML } from './audio.js';
import { showToast } from './ui.js';
import { analyzeWordDetails } from './analysis.js';
import { formatWordList, formatExamples } from './formatters.js';
import { createRelationshipGraph } from './relationship-graph.js';
import { filterAndSortWords } from './filters.js';

// 處理單字片段點擊
export async function handleWordChipClick(chip: HTMLElement, currentWord: Word, event?: Event): Promise<void> {
    const wordText = chip.dataset.word;
    const type = chip.dataset.type;

    if (!wordText || !type) return;

    // 檢查單字是否已在列表中
    const existingWord = accumulatedVocabulary.find(w =>
        w && w.text && typeof w.text === 'string' &&
        wordText && typeof wordText === 'string' &&
        w.text.toLowerCase() === wordText.toLowerCase()
    );

    if (existingWord) {
        // 如果單字已在列表中，展開詳細資訊
        await showWordDetails(existingWord);
        return;
    }

    // 如果單字不在列表中，添加到列表
    await addWordToVocabulary(wordText, type, currentWord);
}

// 顯示單字詳細資訊
async function showWordDetails(word: Word): Promise<void> {
    try {
        const { apiKey }: { apiKey?: string } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
            showToast('請先設定 API Key', false, true);
            return;
        }

        // 顯示分析中的覆蓋層
        const analyzingOverlay = document.querySelector('.analyzing-overlay') as HTMLElement;
        if (analyzingOverlay) {
            analyzingOverlay.classList.add('active');
        }

        let details = wordAnalysisCache[word.text];
        if (!details) {
            details = await analyzeWordDetails(word.text, apiKey);
            wordAnalysisCache[word.text] = details;
            await chrome.storage.local.set({ wordAnalysisCache });
        }

        // 創建詳細頁面
        const detailsPage = createWordDetailsPage(word, details);
        document.body.appendChild(detailsPage);

        // 隱藏分析中的覆蓋層
        if (analyzingOverlay) {
            analyzingOverlay.classList.remove('active');
        }

        // 顯示詳細頁面
        setTimeout(() => {
            detailsPage.classList.add('active');
            document.body.style.overflow = 'hidden';
        }, 50);

        // 添加事件監聽器
        setupDetailsPageEventListeners(detailsPage, word);

    } catch (error) {
        console.error('展開單字失敗:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        showToast('展開單字失敗: ' + errorMessage, false, true);

        // 隱藏分析中的覆蓋層
        const analyzingOverlay = document.querySelector('.analyzing-overlay') as HTMLElement;
        if (analyzingOverlay) {
            analyzingOverlay.classList.remove('active');
        }
    }
}

// 添加單字到詞彙表
async function addWordToVocabulary(wordText: string, type: string, currentWord: Word): Promise<void> {
    try {
        const { apiKey }: { apiKey?: string } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
            throw new Error('請先設定 API Key');
        }

        // 顯示分析中的覆蓋層
        const analyzingOverlay = document.querySelector('.analyzing-overlay') as HTMLElement;
        if (analyzingOverlay) {
            analyzingOverlay.classList.add('active');
        }

        let details = wordAnalysisCache[wordText];
        if (!details) {
            details = await analyzeWordDetails(wordText, apiKey);
            wordAnalysisCache[wordText] = details;
            await chrome.storage.local.set({ wordAnalysisCache });
        }

        const newWord: Word = {
            text: wordText,
            level: currentWord.level || '',
            addedTime: Date.now(),
            translation: (details as any).translation || '',
            example: details.examples?.[0]?.sentence || ''
        };

        const newVocabulary = [...accumulatedVocabulary, newWord];
        const dataSize = new TextEncoder().encode(JSON.stringify(newVocabulary)).length;

        if (!(await checkStorageLimit(dataSize))) {
            showToast('儲存空間不足，無法添加新單字', false, true);
            if (analyzingOverlay) {
                analyzingOverlay.classList.remove('active');
            }
            return;
        }

        await saveVocabulary(newVocabulary);

        // 更新當前詳細頁面中的相似詞和反義詞顯示
        updateCurrentDetailPage(currentWord, type);

        // 更新主頁面的單字顯示
        updateMainWordDisplay();

        showToast(`已添加 ${type === 'synonym' ? '相似詞' : '反義詞'}: ${wordText}`);

        // 隱藏分析中的覆蓋層
        if (analyzingOverlay) {
            analyzingOverlay.classList.remove('active');
        }

        // 添加完成後，立即展開該單字的詳細頁面
        setTimeout(() => {
            showWordDetails(newWord);
        }, 500);

    } catch (error) {
        console.error('添加單字失敗:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        showToast('添加單字失敗: ' + errorMessage, false, true);

        // 隱藏分析中的覆蓋層
        const analyzingOverlay = document.querySelector('.analyzing-overlay') as HTMLElement;
        if (analyzingOverlay) {
            analyzingOverlay.classList.remove('active');
        }
    }
}

// 創建單字詳細頁面
function createWordDetailsPage(word: Word, details: WordDetails): HTMLElement {
    const detailsPage = document.createElement('div');
    detailsPage.className = 'word-details-page';

    // 安全地獲取詳細資訊
    const synonyms = details?.synonyms || [];
    const antonyms = details?.antonyms || [];
    const examples = details?.examples || [];
    const usage = details?.usage || '';

    detailsPage.innerHTML = `
        <div class="details-header">
            <button class="back-btn">
                <svg viewBox="0 0 24 24" class="back-icon">
                    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
                返回
            </button>
            <div class="word-title-container">
                <div class="word-title">${word.text || ''}</div>
                <div class="word-translation-title">${word.translation || '暫無翻譯'}</div>
                <button class="speak-btn" title="播放發音" data-text="${word.text}">
                    ${getSpeakButtonHTML()}
                </button>
            </div>
            <div class="header-actions">
                <button class="show-graph-btn" title="顯示關聯圖">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                    </svg>
                </button>
                <button class="reanalyze-btn" title="重新分析">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                    </svg>
                </button>
            </div>
            <div class="relationship-graph-container">
                <div class="relationship-graph-content">
                    <div class="relationship-graph-header">
                        <div class="relationship-graph-title">單字關聯圖</div>
                        <button class="close-graph-btn">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    </div>
                    <div id="word-relationship-graph"></div>
                </div>
            </div>
        </div>
        <div class="details-content">
            <div class="details-sections">
                <div class="synonyms-section">
                    <h4>相似詞</h4>
                    <div class="synonyms-content">${formatWordList(synonyms.map(s => ({ text: s?.text || '', translation: s?.translation || '' })), 'synonym')}</div>
                </div>
                <div class="antonyms-section">
                    <h4>反義詞</h4>
                    <div class="antonyms-content">${formatWordList(antonyms.map(a => ({ text: a?.text || '', translation: a?.translation || '' })), 'antonym')}</div>
                </div>
                <div class="examples-section">
                    <h4>更多例句</h4>
                    <div class="examples-content">${formatExamples(examples)}</div>
                </div>
                <div class="usage-section">
                    <h4>用法說明</h4>
                    <div class="usage-content">${usage}</div>
                </div>
            </div>
        </div>
    `;
    return detailsPage;
}

// 設置詳細頁面事件監聽器
function setupDetailsPageEventListeners(detailsPage: HTMLElement, word: Word): void {
    // 添加發音按鈕事件監聽
    addSpeakButtonListeners(detailsPage, word);

    // 添加關聯圖按鈕的事件監聽
    updateDetailsContent(detailsPage, wordAnalysisCache[word.text], word);

    // 返回按鈕功能
    detailsPage.querySelector('.back-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        detailsPage.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => {
            document.body.removeChild(detailsPage);
        }, 300);
    });

    // 重新分析按鈕
    detailsPage.querySelector('.reanalyze-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await reanalyzeWord(detailsPage, word);
    });
}

// 添加發音按鈕事件監聽
export function addSpeakButtonListeners(detailsPage: HTMLElement, word: Word): void {
    // 安全檢查，確保 word 對象存在
    if (!word || !word.text) {
        console.warn('無效的單字對象');
        return;
    }

    const wordSpeakBtn = detailsPage.querySelector('.speak-btn') as HTMLElement;
    if (wordSpeakBtn) {
        const oldClickHandler = (wordSpeakBtn as any).clickHandler;
        if (oldClickHandler) {
            wordSpeakBtn.removeEventListener('click', oldClickHandler);
        }

        const newClickHandler = async (e: Event) => {
            e.stopPropagation();
            
            // 如果按鈕已經在播放中，則停止播放
            if (wordSpeakBtn.classList.contains('playing')) {
                window.speechSynthesis.cancel();
                wordSpeakBtn.classList.remove('playing');
                return;
            }

            // 開始播放
            try {
                await speakWord(word.text, wordSpeakBtn);
            } catch (error) {
                console.error('播放失敗:', error);
                wordSpeakBtn.classList.remove('playing');
            }
        };

        (wordSpeakBtn as any).clickHandler = newClickHandler;
        wordSpeakBtn.addEventListener('click', newClickHandler);
    }

    detailsPage.querySelectorAll('.example-item .speak-btn').forEach(btn => {
        const button = btn as HTMLElement;
        const oldHandler = (button as any).clickHandler;
        if (oldHandler) {
            button.removeEventListener('click', oldHandler);
        }

        const newHandler = (e: Event) => {
            e.stopPropagation();
            const text = (button as HTMLElement).dataset.text;
            if (text) {
                speakWord(text, button);
            }
        };

        (button as any).clickHandler = newHandler;
        button.addEventListener('click', newHandler);
    });

    detailsPage.querySelectorAll('.word-chip.clickable').forEach(chip => {
        const chipElement = chip as HTMLElement;
        const oldClickHandler = (chipElement as any).clickHandler;
        if (oldClickHandler) {
            chipElement.removeEventListener('click', oldClickHandler);
        }

        const newClickHandler = (e: Event) => {
            e.stopPropagation();
            handleWordChipClick(chipElement, word, e);
        };

        (chipElement as any).clickHandler = newClickHandler;
        chipElement.addEventListener('click', newClickHandler);
    });
}

// 更新詳細資訊內容
export function updateDetailsContent(detailsPage: HTMLElement, details: WordDetails, word: Word): void {
    // 安全檢查，確保 details 對象存在
    if (!details) {
        console.warn('詳細資訊對象不存在');
        return;
    }

    const synonymsContent = detailsPage.querySelector('.synonyms-content');
    const antonymsContent = detailsPage.querySelector('.antonyms-content');
    const examplesContent = detailsPage.querySelector('.examples-content');
    const usageContent = detailsPage.querySelector('.usage-content');

    if (synonymsContent) {
        const synonyms = details.synonyms || [];
        synonymsContent.innerHTML = formatWordList(synonyms.map(s => ({ text: s?.text || '', translation: s?.translation || '' })), 'synonym');
    }
    if (antonymsContent) {
        const antonyms = details.antonyms || [];
        antonymsContent.innerHTML = formatWordList(antonyms.map(a => ({ text: a?.text || '', translation: a?.translation || '' })), 'antonym');
    }
    if (examplesContent) {
        const examples = details.examples || [];
        examplesContent.innerHTML = formatExamples(examples);
    }
    if (usageContent) {
        usageContent.innerHTML = details.usage || '';
    }

    addSpeakButtonListeners(detailsPage, word);

    // 添加關聯圖按鈕的事件監聽
    setupGraphEventListeners(detailsPage, word, details);
}

// 設置關聯圖事件監聽器
function setupGraphEventListeners(detailsPage: HTMLElement, word: Word, details: WordDetails): void {
    const showGraphBtn = detailsPage.querySelector('.show-graph-btn') as HTMLElement;
    const graphContainer = detailsPage.querySelector('.relationship-graph-container') as HTMLElement;
    const closeGraphBtn = detailsPage.querySelector('.close-graph-btn') as HTMLElement;

    if (showGraphBtn && graphContainer && closeGraphBtn) {
        // 移除舊的事件監聽器
        const oldShowGraphHandler = (showGraphBtn as any).showGraphHandler;
        if (oldShowGraphHandler) {
            showGraphBtn.removeEventListener('click', oldShowGraphHandler);
        }

        // 創建新的事件處理函數
        const newShowGraphHandler = () => {
            graphContainer.style.display = 'flex';
            setTimeout(() => {
                graphContainer.classList.add('active');
            }, 10);
            const graphElement = detailsPage.querySelector('#word-relationship-graph') as HTMLElement;
            if (graphElement) {
                createRelationshipGraph(graphElement, word, details);
            }
        };

        (showGraphBtn as any).showGraphHandler = newShowGraphHandler;
        showGraphBtn.addEventListener('click', newShowGraphHandler);

        // 添加關閉按鈕的事件監聽
        const oldCloseGraphHandler = (closeGraphBtn as any).closeGraphHandler;
        if (oldCloseGraphHandler) {
            closeGraphBtn.removeEventListener('click', oldCloseGraphHandler);
        }

        const newCloseGraphHandler = () => {
            graphContainer.classList.remove('active');
            setTimeout(() => {
                graphContainer.style.display = 'none';
            }, 300);
        };

        (closeGraphBtn as any).closeGraphHandler = newCloseGraphHandler;
        closeGraphBtn.addEventListener('click', newCloseGraphHandler);

        // 點擊背景時關閉
        const oldBackgroundClickHandler = (graphContainer as any).backgroundClickHandler;
        if (oldBackgroundClickHandler) {
            graphContainer.removeEventListener('click', oldBackgroundClickHandler);
        }

        const newBackgroundClickHandler = (e: Event) => {
            if (e.target === graphContainer) {
                closeGraphBtn.click();
            }
        };

        (graphContainer as any).backgroundClickHandler = newBackgroundClickHandler;
        graphContainer.addEventListener('click', newBackgroundClickHandler);
    }
}

// 重新分析單字
async function reanalyzeWord(detailsPage: HTMLElement, word: Word): Promise<void> {
    try {
        const { apiKey }: { apiKey?: string } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
            throw new Error('請先設定 API Key');
        }

        const loadingOverlay = detailsPage.querySelector('.loading-overlay') as HTMLElement;
        const detailsSections = detailsPage.querySelector('.details-sections') as HTMLElement;

        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (detailsSections) detailsSections.style.opacity = '0.5';

        delete wordAnalysisCache[word.text];
        await chrome.storage.local.set({ wordAnalysisCache });

        const newDetails = await analyzeWordDetails(word.text, apiKey);

        wordAnalysisCache[word.text] = newDetails;
        await chrome.storage.local.set({ wordAnalysisCache });

        updateDetailsContent(detailsPage, newDetails, word);
        showToast('重新分析完成');
    } catch (error) {
        console.error('重新分析失敗:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        showToast(`重新分析失敗: ${errorMessage}`, false, true);
    } finally {
        const loadingOverlay = detailsPage.querySelector('.loading-overlay') as HTMLElement;
        const detailsSections = detailsPage.querySelector('.details-sections') as HTMLElement;

        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (detailsSections) detailsSections.style.opacity = '1';
    }
}

// 更新當前詳細頁面顯示
function updateCurrentDetailPage(currentWord: Word, type: string): void {
    // 安全檢查，確保 currentWord 存在
    if (!currentWord || !currentWord.text) {
        console.warn('當前單字對象無效');
        return;
    }

    const currentDetailPage = document.querySelector('.word-details-page.active');
    if (currentDetailPage) {
        const synonymsContent = currentDetailPage.querySelector('.synonyms-content');
        const antonymsContent = currentDetailPage.querySelector('.antonyms-content');

        // 重新生成相似詞和反義詞的 HTML，這樣會反映最新的單字列表狀態
        if (synonymsContent && type === 'synonym') {
            const currentDetails = wordAnalysisCache[currentWord.text];
            if (currentDetails && currentDetails.synonyms) {
                const synonyms = currentDetails.synonyms || [];
                synonymsContent.innerHTML = formatWordList(synonyms.map(s => ({ text: s?.text || '', translation: s?.translation || '' })), 'synonym');
                // 重新添加事件監聽器
                addSpeakButtonListeners(currentDetailPage as HTMLElement, currentWord);
            }
        }

        if (antonymsContent && type === 'antonym') {
            const currentDetails = wordAnalysisCache[currentWord.text];
            if (currentDetails && currentDetails.antonyms) {
                const antonyms = currentDetails.antonyms || [];
                antonymsContent.innerHTML = formatWordList(antonyms.map(a => ({ text: a?.text || '', translation: a?.translation || '' })), 'antonym');
                // 重新添加事件監聽器
                addSpeakButtonListeners(currentDetailPage as HTMLElement, currentWord);
            }
        }
    }
}

// 更新主要單字顯示
function updateMainWordDisplay(): void {
    const sortFilter = document.getElementById('sort-filter') as HTMLSelectElement;
    const levelFilter = document.getElementById('level-filter') as HTMLSelectElement;
    const searchFilter = document.getElementById('search-filter') as HTMLInputElement;

    const currentSort = sortFilter?.value || 'level';
    const currentLevel = levelFilter?.value || '';
    const currentSearch = searchFilter?.value || '';

    // 觸發更新事件
    const updateEvent = new CustomEvent('updateWordDisplay', {
        detail: {
            sort: currentSort,
            level: currentLevel,
            search: currentSearch
        }
    });
    window.dispatchEvent(updateEvent);
}

// 顯示關聯圖
export async function showRelationshipGraph(word: Word, details: WordDetails): Promise<void> {
    try {
        // 動態導入關聯圖模組
        const { createRelationshipGraph } = await import('./relationship-graph.js');

        let graphContainer = document.getElementById('relationship-graph-container') as HTMLElement;

        if (!graphContainer) {
            graphContainer = document.createElement('div');
            graphContainer.id = 'relationship-graph-container';
            graphContainer.className = 'relationship-graph-container';

            graphContainer.innerHTML = `
                <div class="relationship-graph-content">
                    <div class="relationship-graph-header">
                        <h3 class="relationship-graph-title">
                            ${word.text} 關聯圖
                        </h3>
                        <button class="close-graph-btn" id="close-graph-btn">
                            <svg viewBox="0 0 24 24">
                                <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                            </svg>
                        </button>
                    </div>
                    <div id="word-relationship-graph"></div>
                </div>
            `;

            document.body.appendChild(graphContainer);

            // 關閉按鈕事件
            const closeBtn = document.getElementById('close-graph-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    graphContainer.classList.remove('active');
                    setTimeout(() => {
                        graphContainer.style.display = 'none';
                    }, 300);
                });
            }

            // 點擊背景關閉
            graphContainer.addEventListener('click', (e) => {
                if (e.target === graphContainer) {
                    graphContainer.classList.remove('active');
                    setTimeout(() => {
                        graphContainer.style.display = 'none';
                    }, 300);
                }
            });
        }

        // 顯示關聯圖
        graphContainer.style.display = 'flex';

        setTimeout(() => {
            graphContainer.classList.add('active');
        }, 10);

        // 創建關聯圖
        const graphElement = document.getElementById('word-relationship-graph');
        if (graphElement) {
            createRelationshipGraph(graphElement, word, details);
        }

    } catch (error) {
        console.error('載入關聯圖失敗:', error);
        showToast('載入關聯圖失敗', false, true);
    }
}