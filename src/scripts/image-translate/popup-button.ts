/**
 * popup 主頁的「翻譯這頁的圖片」按鈕：和快捷鍵走同一條路，切換目前分頁的自動翻譯。
 * 旁邊顯示快捷鍵目前的設定；快捷鍵被其他擴充功能占用時 Chrome 不會指派，這裡會顯示「未設定」並提供設定連結。
 */

import * as UI from '../popup/ui.js';
import { IMAGE_TRANSLATE_PAGE_TOGGLE, TRANSLATE_COMMAND, type PageToggleRequest } from './protocol';

const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

async function showShortcut(): Promise<void> {
    const label = document.getElementById('translate-images-shortcut');
    if (!label) return;
    const commands = await chrome.commands.getAll().catch(() => []);
    const shortcut = commands.find((command) => command.name === TRANSLATE_COMMAND)?.shortcut;
    label.textContent = shortcut ? shortcut : '未設定（可能被其他擴充功能占用）';
}

async function togglePageTranslation(button: HTMLButtonElement): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== 'number') {
        UI.showToast('找不到目前的分頁', false, true);
        return;
    }
    button.disabled = true;
    try {
        const request: PageToggleRequest = { type: IMAGE_TRANSLATE_PAGE_TOGGLE, tabId: tab.id };
        const ok = (await chrome.runtime.sendMessage(request)) === true;
        if (ok) {
            // 翻譯的進度與控制列都在網頁上，popup 留著會擋住畫面
            window.close();
        } else {
            UI.showToast('這個頁面不能翻譯圖片（例如瀏覽器內建頁面或擴充功能商店）', false, true);
        }
    } catch (error) {
        UI.showToast('啟動圖片翻譯失敗，請重新整理頁面後再試', false, true);
    } finally {
        button.disabled = false;
    }
}

export function initImageTranslateButton(): void {
    const button = document.getElementById('translate-page-images') as HTMLButtonElement | null;
    if (!button) return;
    button.addEventListener('click', () => void togglePageTranslation(button));
    document.getElementById('translate-images-shortcut-link')?.addEventListener('click', (event) => {
        event.preventDefault();
        void chrome.tabs.create({ url: SHORTCUTS_URL });
    });
    void showShortcut();
}
