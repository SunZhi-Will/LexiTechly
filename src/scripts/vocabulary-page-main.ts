/// <reference types="chrome"/>

import { Word, FilterOptions } from './vocabulary/types.js';
import { loadVocabulary, accumulatedVocabulary } from './vocabulary/storage.js';
import { filterAndSortWords } from './vocabulary/filters.js';
import { updateWordDisplay } from './vocabulary/word-display.js';
import { showToast } from './vocabulary/ui.js';
import { removePhoneticFromVocabulary } from './vocabulary/cleaner.js';

// 全域變數
let allWords: Word[] = [];
let currentFilters: FilterOptions = {
    level: '',
    search: '',
    sort: 'latest'
};

// 更新單字顯示
async function updateDisplay(): Promise<void> {
    try {
        const filteredWords = filterAndSortWords(allWords, currentFilters);
        await updateWordDisplay(filteredWords);
    } catch (error) {
        console.error('更新顯示失敗:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        showToast('更新顯示失敗: ' + errorMessage, false, true);
    }
}

// 設置篩選器事件監聽
function setupFilterListeners(): void {
    const levelFilter = document.getElementById('level-filter') as HTMLSelectElement;
    const searchFilter = document.getElementById('search-filter') as HTMLInputElement;
    const sortFilter = document.getElementById('sort-filter') as HTMLSelectElement;

    if (levelFilter) {
        levelFilter.addEventListener('change', (e) => {
            currentFilters.level = (e.target as HTMLSelectElement).value;
            updateDisplay();
        });
    }

    if (searchFilter) {
        searchFilter.addEventListener('input', (e) => {
            currentFilters.search = (e.target as HTMLInputElement).value;
            updateDisplay();
        });
    }

    if (sortFilter) {
        sortFilter.value = 'latest';
        sortFilter.addEventListener('change', (e) => {
            currentFilters.sort = (e.target as HTMLSelectElement).value;
            updateDisplay();
        });
    }
}

// 設置儲存變更監聽
function setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.accumulatedVocabulary) {
            const newValue = changes.accumulatedVocabulary.newValue;
            allWords = Array.isArray(newValue) ? newValue : [];
            updateDisplay();
        }
    });
}

// 設置自定義事件監聽
function setupCustomEventListeners(): void {
    window.addEventListener('updateWordDisplay', (event: any) => {
        const { sort, level, search } = event.detail;
        currentFilters = { sort, level, search };
        updateDisplay();
    });
}

// 獲取 URL 參數中的單字
function getWordFromUrl(): string | null {
    const urlParams = new URLSearchParams(window.location.search);
    const word = urlParams.get('word');
    return word ? decodeURIComponent(word) : null;
}

// 自動定位到指定單字並開啟詳細頁面
async function scrollToWord(targetWord: string): Promise<void> {
    try {
        console.log('嘗試定位到單字:', targetWord);
        
        // 等待一下讓頁面完全載入
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 查找對應的單字元素
        const wordElements = document.querySelectorAll('.word-card');
        console.log('找到單字卡片數量:', wordElements.length);
        let foundElement: Element | null = null;
        
        for (const element of wordElements) {
            const wordText = element.querySelector('.word-text');
            const textContent = wordText?.textContent;
            console.log('檢查單字:', textContent, '目標:', targetWord);
            if (wordText && textContent?.toLowerCase().includes(targetWord.toLowerCase())) {
                foundElement = element;
                console.log('找到匹配的單字:', textContent);
                break;
            }
        }
        
        if (foundElement) {
            // 滾動到該元素
            foundElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            // 添加高亮效果
            foundElement.classList.add('highlight-target');
            
            // 延遲一下再點擊，讓用戶看到高亮效果
            setTimeout(() => {
                // 嘗試點擊單字卡片來開啟詳細頁面
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                foundElement?.dispatchEvent(clickEvent);
                
                console.log('已點擊單字卡片:', targetWord);
                showToast(`已開啟單字「${targetWord}」的詳細資訊`, false, false);
            }, 1000);
            
            // 移除高亮效果
            setTimeout(() => {
                foundElement?.classList.remove('highlight-target');
            }, 3000);
            
            console.log('成功定位並開啟單字:', targetWord);
        } else {
            console.log('未找到單字:', targetWord);
            showToast(`未找到單字「${targetWord}」`, false, true);
        }
    } catch (error) {
        console.error('定位單字時發生錯誤:', error);
    }
}

// 初始化頁面
async function initializePage(): Promise<void> {
    try {
        // 載入深色模式設定
        const { darkMode }: { darkMode?: boolean } = await chrome.storage.local.get('darkMode');
        // 如果沒有儲存的設定，檢查系統偏好
        if (darkMode === undefined) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.classList.toggle('dark-mode', prefersDark);
            chrome.storage.local.set({ darkMode: prefersDark });
        } else {
            document.body.classList.toggle('dark-mode', darkMode);
        }

        // 清除單字列表中的KK音標
        await removePhoneticFromVocabulary();

        // 載入詞彙數據
        allWords = await loadVocabulary();

        // 設置事件監聽器
        setupFilterListeners();
        setupStorageListener();
        setupCustomEventListeners();

        // 初始顯示
        await updateDisplay();

        // 檢查 URL 參數中是否有指定單字
        const targetWord = getWordFromUrl();
        if (targetWord) {
            console.log('從 URL 參數獲取到目標單字:', targetWord);
            
            // 設置搜尋篩選器
            const searchFilter = document.getElementById('search-filter') as HTMLInputElement;
            if (searchFilter) {
                searchFilter.value = targetWord;
                currentFilters.search = targetWord;
                console.log('設置搜尋篩選器:', targetWord);
                await updateDisplay();
                console.log('更新顯示完成');
            }
            
            // 延遲一下再定位，確保頁面已完全載入
            setTimeout(() => {
                scrollToWord(targetWord);
            }, 1500); // 增加延遲時間確保過濾完成
        }

    } catch (error) {
        console.error('初始化頁面失敗:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        showToast('初始化頁面失敗: ' + errorMessage, false, true);
    }
}

// 啟動頁面
document.addEventListener('DOMContentLoaded', initializePage); 