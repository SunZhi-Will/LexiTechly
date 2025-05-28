/// <reference types="chrome"/>

import { Word, WordDetails, FilteredWordArray } from './types.js';
import {
    wordAnalysisCache,
    saveVocabulary,
    checkStorageLimit
} from './storage.js';
import { analyzeWordOnDemand } from './analysis.js';
import { getSpeakButtonHTML } from './audio.js';
import { showToast } from './ui.js';
import { addSpeakButtonListeners, updateDetailsContent } from './word-interactions.js';

// 更新單字顯示
export async function updateWordDisplay(words: FilteredWordArray): Promise<void> {
    if (words !== (await import('./storage.js')).accumulatedVocabulary && !words.isFiltered) {
        const dataSize = new TextEncoder().encode(JSON.stringify(words)).length;
        if (await checkStorageLimit(dataSize)) {
            const saveSuccess = await saveVocabulary(words);
            if (!saveSuccess) {
                const { accumulatedVocabulary } = await import('./storage.js');
                const filteredArray: FilteredWordArray = [...accumulatedVocabulary];
                updateWordDisplay(filteredArray);
                return;
            }
        } else {
            const { accumulatedVocabulary } = await import('./storage.js');
            const filteredArray: FilteredWordArray = [...accumulatedVocabulary];
            updateWordDisplay(filteredArray);
            return;
        }
    }

    const grid = document.getElementById('word-grid');
    if (!grid) return;

    grid.innerHTML = '';

    words.forEach(word => {
        const card = createWordCard(word);
        grid.appendChild(card);
    });

    const totalCountElement = document.getElementById('total-count');
    if (totalCountElement) {
        totalCountElement.textContent = words.length.toString();
    }

    // 移除批次自動分析 - 只在用戶展開單字時才分析
}

// 創建單字卡片
function createWordCard(word: Word): HTMLElement {
    const card = document.createElement('div');
    card.className = 'word-card';

    // 如果已經分析過，添加 analyzed 類別
    if (wordAnalysisCache[word.text]) {
        card.classList.add('analyzed');
    }

    card.innerHTML = `
        <div class="word-header">
            <span class="word-text">${word.text}</span>
            <span class="word-level">${word.level || 'N/A'}</span>
        </div>
        <div class="word-details">${word.example || ''}</div>
        <div class="word-translation">${word.translation || ''}</div>
    `;

    // 創建詳細頁面
    const detailsPage = createWordDetailsPage(word);
    let detailsLoaded = false;

    // 點擊卡片開啟詳細資訊
    card.addEventListener('click', async () => {
        await showWordDetailsPage(detailsPage, word, detailsLoaded);
    });

    document.body.appendChild(detailsPage);
    return card;
}

// 創建單字詳細頁面
function createWordDetailsPage(word: Word): HTMLElement {
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

    setupDetailsPageEventListeners(detailsPage, word);
    return detailsPage;
}

// 顯示單字詳細頁面
async function showWordDetailsPage(detailsPage: HTMLElement, word: Word, detailsLoaded: boolean): Promise<void> {
    document.querySelectorAll('.word-details-page').forEach(page => {
        (page as HTMLElement).style.zIndex = '1000';
    });

    detailsPage.style.zIndex = '1001';
    detailsPage.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (wordAnalysisCache[word.text]) {
        const details = wordAnalysisCache[word.text];
        if (details) {
            updateDetailsContent(detailsPage, details, word);
            detailsLoaded = true;
        }
    }

    if (!detailsLoaded) {
        await loadWordDetails(detailsPage, word);
    }
}

// 載入單字詳細資訊
async function loadWordDetails(detailsPage: HTMLElement, word: Word): Promise<void> {
    try {
        showLoadingState(detailsPage, true);

        const details = await analyzeWordOnDemand(word);
        if (details) {
            updateDetailsContent(detailsPage, details, word);
        }
    } catch (error) {
        console.error('分析失敗:', error);
        showAnalysisError(detailsPage, word, error);
    } finally {
        showLoadingState(detailsPage, false);
    }
}

// 顯示 API Key 錯誤
function showApiKeyError(detailsPage: HTMLElement): void {
    const detailsContent = detailsPage.querySelector('.details-content');
    if (detailsContent) {
        detailsContent.innerHTML = `
            <div class="error-message">
                請先在設定頁面設定 API Key
            </div>
        `;
    }
}

// 顯示分析錯誤
function showAnalysisError(detailsPage: HTMLElement, word: Word, error: any): void {
    const detailsContent = detailsPage.querySelector('.details-content');
    if (detailsContent) {
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        detailsContent.innerHTML = `
            <div class="error-message">
                <h4>分析時發生錯誤</h4>
                <p>${errorMessage}</p>
                <button class="retry-btn">重試</button>
            </div>
        `;

        const retryBtn = detailsContent.querySelector('.retry-btn') as HTMLElement;
        if (retryBtn) {
            retryBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                delete wordAnalysisCache[word.text];
                await chrome.storage.local.set({ wordAnalysisCache });
                await loadWordDetails(detailsPage, word);
            });
        }
    }
}

// 顯示載入狀態
function showLoadingState(detailsPage: HTMLElement, isLoading: boolean): void {
    const loadingOverlay = detailsPage.querySelector('.loading-overlay') as HTMLElement;
    const detailsSections = detailsPage.querySelector('.details-sections') as HTMLElement;

    if (loadingOverlay) {
        loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    }
    if (detailsSections) {
        detailsSections.style.opacity = isLoading ? '0.5' : '1';
    }
}

// 設置詳細頁面事件監聽器
function setupDetailsPageEventListeners(detailsPage: HTMLElement, word: Word): void {
    // 返回按鈕功能
    detailsPage.querySelector('.back-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        detailsPage.classList.remove('active');
        document.body.style.overflow = '';
    });

    // 重新分析按鈕
    detailsPage.querySelector('.reanalyze-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await reanalyzeWord(detailsPage, word);
    });

    addSpeakButtonListeners(detailsPage, word);
}

// 重新分析單字
async function reanalyzeWord(detailsPage: HTMLElement, word: Word): Promise<void> {
    try {
        showLoadingState(detailsPage, true);

        // 清除快取
        delete wordAnalysisCache[word.text];
        await chrome.storage.local.set({ wordAnalysisCache });

        // 重新分析
        const details = await analyzeWordOnDemand(word);
        if (details) {
            updateDetailsContent(detailsPage, details, word);
            showToast('重新分析完成');
        }
    } catch (error) {
        console.error('重新分析失敗:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        showToast(`重新分析失敗: ${errorMessage}`, false, true);
    } finally {
        showLoadingState(detailsPage, false);
    }
} 