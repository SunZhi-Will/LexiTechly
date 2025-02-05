// 從 chrome.storage 讀取單字資料
async function loadVocabulary() {
    const { accumulatedVocabulary, currentPageVocabulary } =
        await chrome.storage.local.get(['accumulatedVocabulary', 'currentPageVocabulary']);

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
        const card = document.createElement('div');
        card.className = 'word-card';
        card.innerHTML = `
            <div class="word-header">
                <div class="word-text">${word.text}</div>
                <div class="word-level">${word.level || 'N/A'}</div>
            </div>
            <div class="word-details">${word.definition || '暫無釋義'}</div>
            <div class="word-translation">${word.translation || '暫無翻譯'}</div>
        `;
        grid.appendChild(card);
    });

    // 更新總數
    document.getElementById('total-count').textContent = words.length;
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