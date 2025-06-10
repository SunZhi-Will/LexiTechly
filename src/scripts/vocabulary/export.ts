import { Word } from './types.js';

/**
 * 將單字列表轉換為 CSV 格式
 * @param words 單字列表
 * @returns CSV 格式的字串
 */
export function convertToCSV(words: Word[]): string {
    // CSV 標題列
    const headers = ['Word', 'Translation', 'Level', 'Added Time', 'Example'];
    
    // 將單字資料轉換為 CSV 行
    const rows = words.map(word => {
        const addedDate = word.addedTime ? new Date(word.addedTime).toISOString() : '';
        return [
            word.text || '',
            word.translation || '',
            word.level || '',
            addedDate,
            word.example || ''
        ].map(field => `"${field.replace(/"/g, '""')}"`).join(',');
    });
    
    // 組合標題和資料行
    return [headers.join(','), ...rows].join('\n');
}

/**
 * 下載 CSV 檔案
 * @param content CSV 內容
 * @param filename 檔案名稱
 */
export function downloadCSV(content: string, filename: string = 'vocabulary.csv'): void {
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
} 