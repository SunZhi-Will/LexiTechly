/**
 * 歡迎頁：安裝後第一次開啟，說明不用設定就能用的功能，並讓使用者選擇要不要填 Gemini API Key。
 */

import { AiError, generateText, hasApiKey } from './ai/client';
import { localizePage, t } from './i18n';
import { initLanguageSelects } from './lang/settings-ui';

const TRANSLATE_COMMAND = 'translate-images';

/** 「翻譯圖片」那一行含快捷鍵，用 <kbd> 標出來；其餘文字照字串檔 */
async function renderImagesStep(): Promise<void> {
    const item = document.getElementById('step1-images');
    if (!item) return;
    const commands = await chrome.commands.getAll().catch(() => []);
    const shortcut = commands.find((command) => command.name === TRANSLATE_COMMAND)?.shortcut;

    // 用一個不會出現在文字裡的字元標出快捷鍵的位置，再把字串切成前後兩段
    const marker = '';
    const [before, after = ''] = t('welcomeStep1Images', marker).split(marker);
    item.textContent = '';
    item.append(before);
    if (shortcut) {
        const key = document.createElement('kbd');
        key.textContent = shortcut;
        item.append(key);
    } else {
        item.append(t('welcomeShortcutUnset'));
    }
    item.append(after);
}

function setStatus(message: string, kind: 'ok' | 'error' | '' = ''): void {
    const status = document.getElementById('key-status');
    if (!status) return;
    status.textContent = message;
    status.className = `key-status ${kind}`.trim();
}

async function saveAndTestKey(input: HTMLInputElement, button: HTMLButtonElement): Promise<void> {
    const apiKey = input.value.trim();
    if (!apiKey) {
        setStatus(t('welcomeKeyEmpty'), 'error');
        input.focus();
        return;
    }

    button.disabled = true;
    setStatus(t('welcomeKeyTesting'));
    try {
        await chrome.storage.local.set({ apiKey });
        // 問一個最短的問題，確認金鑰真的能用
        await generateText({ prompt: 'Reply with the single word: ok', temperature: 0 });
        input.value = '';
        setStatus(t('welcomeKeyOk'), 'ok');
    } catch (error) {
        const reason = error instanceof AiError ? error.message : String((error as Error)?.message ?? error);
        setStatus(t('welcomeKeyFailed', reason), 'error');
    } finally {
        button.disabled = false;
    }
}

async function init(): Promise<void> {
    localizePage();
    document.title = t('welcomeTitle');
    await renderImagesStep();
    await initLanguageSelects(
        document.getElementById('learning-lang') as HTMLSelectElement | null,
        document.getElementById('native-lang') as HTMLSelectElement | null
    );

    if (await hasApiKey()) setStatus(t('welcomeKeyAlreadySet'));

    const form = document.getElementById('key-form');
    const input = document.getElementById('api-key') as HTMLInputElement | null;
    const button = document.getElementById('save-key') as HTMLButtonElement | null;
    if (form && input && button) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            void saveAndTestKey(input, button);
        });
    }

    document.getElementById('done')?.addEventListener('click', () => {
        window.close();
    });
}

void init();
