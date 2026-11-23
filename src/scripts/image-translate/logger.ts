/**
 * 圖片翻譯的記錄：警告才進 console，除錯訊息只在非正式版的建置輸出
 */

const PREFIX = '[LexiTechly 圖片翻譯]';

export const contentLogger = {
    debug(message: string, data?: unknown): void {
        if (import.meta.env.MODE !== 'production') console.debug(PREFIX, message, data ?? '');
    },
    warn(message: string, data?: unknown): void {
        console.warn(PREFIX, message, data ?? '');
    }
};
