import { Word } from './types.js';
import { accumulatedVocabulary } from './storage.js';
import { getSpeakButtonHTML } from './audio.js';

// 格式化單字列表
export function formatWordList(words: Word[], type: string): string {
    if (!words || words.length === 0) return '無';

    return words.map(word => {
        const wordText = typeof word === 'object' ? word.text : word;
        const translation = typeof word === 'object' ? word.translation : '';

        // 安全檢查，確保 wordText 存在且為字串
        if (!wordText || typeof wordText !== 'string') return '';

        const isInList = accumulatedVocabulary.some(w =>
            w.text && typeof w.text === 'string' &&
            wordText && typeof wordText === 'string' &&
            w.text.toLowerCase() === wordText.toLowerCase()
        );

        return `
            <div class="word-chip clickable${isInList ? ' added' : ''}" data-word="${wordText}" data-type="${type}">
                ${wordText}
                ${translation ? `<span class="word-translation">${translation}</span>` : ''}
                ${!isInList ? `
                    <span class="add-icon" title="點擊單字添加到列表">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                    </span>
                ` : ''}
            </div>
        `;
    }).filter(html => html !== '').join(''); // 過濾掉空字串
}

// 格式化例句
export function formatExamples(examples: Array<{ sentence: string; translation: string }>): string {
    if (!examples || examples.length === 0) return '無資料';
    return examples.map(example => `
        <div class="example-item">
            <div class="example-text">
                ${example.sentence || ''}
                <button class="speak-btn small" title="播放發音" data-text="${example.sentence || ''}">
                    ${getSpeakButtonHTML('small')}
                </button>
            </div>
            <div class="example-translation">${example.translation || ''}</div>
        </div>
    `).join('');
} 