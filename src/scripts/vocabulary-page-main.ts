/// <reference types="chrome"/>

import { Word, FilterOptions } from './vocabulary/types.js';
import { loadVocabulary, accumulatedVocabulary } from './vocabulary/storage.js';
import { filterAndSortWords } from './vocabulary/filters.js';
import { updateWordDisplay } from './vocabulary/word-display.js';
import { showToast } from './vocabulary/ui.js';

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
            allWords = changes.accumulatedVocabulary.newValue || [];
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

// 初始化頁面
async function initializePage(): Promise<void> {
    try {
        // 載入深色模式設定
        const { darkMode }: { darkMode?: boolean } = await chrome.storage.local.get('darkMode');
        if (darkMode) {
            document.body.classList.add('dark-mode');
        }

        // 載入詞彙數據
        allWords = await loadVocabulary();

        // 設置事件監聽器
        setupFilterListeners();
        setupStorageListener();
        setupCustomEventListeners();

        // 初始顯示
        await updateDisplay();

    } catch (error) {
        console.error('初始化頁面失敗:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        showToast('初始化頁面失敗: ' + errorMessage, false, true);
    }
}

// 啟動頁面
document.addEventListener('DOMContentLoaded', initializePage); 