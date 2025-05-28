import { Word, FilteredWordArray, FilterOptions } from './types.js';

// 搜尋和排序功能
export function filterAndSortWords(words: Word[], filters: FilterOptions): FilteredWordArray {
    let filteredWords = [...words];

    if (filters.level && filters.level !== 'all') {
        filteredWords = filteredWords.filter(word => word.level === filters.level);
    }

    if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredWords = filteredWords.filter(word =>
            (word.text && typeof word.text === 'string' && word.text.toLowerCase().includes(searchTerm)) ||
            (word.translation && typeof word.translation === 'string' && word.translation.toLowerCase().includes(searchTerm))
        );
    }

    if (filters.sort) {
        switch (filters.sort) {
            case 'level':
                const levelOrder: Record<string, number> = { 'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6 };
                filteredWords.sort((a, b) => {
                    const levelA = levelOrder[a.level || ''] || 0;
                    const levelB = levelOrder[b.level || ''] || 0;
                    if (levelA !== levelB) return levelA - levelB;
                    return (a.text || '').localeCompare(b.text || '');
                });
                break;
            case 'alphabet':
                filteredWords.sort((a, b) => (a.text || '').localeCompare(b.text || ''));
                break;
            case 'time':
            case 'latest':
                filteredWords.sort((a, b) => (b.addedTime || 0) - (a.addedTime || 0));
                break;
        }
    }

    const result: FilteredWordArray = filteredWords;
    result.isFiltered = true;
    return result;
} 