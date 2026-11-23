/**
 * 語言設定的兩個下拉選單（歡迎頁與 popup 設定頁共用）：要學的語言、解說用的語言。
 */

import { t } from '../i18n';
import { LEARNING_LANGUAGES, NATIVE_LANGUAGES, isLearningLang, isNativeLang } from './languages';
import { getLanguageSettings, saveLanguageSettings } from './settings';

function addOption(select: HTMLSelectElement, value: string, label: string): void {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
}

/**
 * 填入選項、選到目前的設定，並在使用者更改時存檔。
 * onSaved 在每次存檔後呼叫，讓頁面可以顯示「已儲存」之類的提示。
 */
export async function initLanguageSelects(
    learningSelect: HTMLSelectElement | null,
    nativeSelect: HTMLSelectElement | null,
    onSaved?: () => void
): Promise<void> {
    const settings = await getLanguageSettings();

    if (learningSelect) {
        learningSelect.textContent = '';
        addOption(learningSelect, 'auto', t('langAuto'));
        for (const language of Object.values(LEARNING_LANGUAGES)) {
            addOption(learningSelect, language.code, `${language.nativeName} (${language.levelSystem})`);
        }
        learningSelect.value = settings.learningLang;
        learningSelect.addEventListener('change', async () => {
            const value = learningSelect.value;
            if (value !== 'auto' && !isLearningLang(value)) return;
            await saveLanguageSettings({ learningLang: value });
            onSaved?.();
        });
    }

    if (nativeSelect) {
        nativeSelect.textContent = '';
        for (const language of Object.values(NATIVE_LANGUAGES)) {
            addOption(nativeSelect, language.code, language.nativeName);
        }
        nativeSelect.value = settings.nativeLang;
        nativeSelect.addEventListener('change', async () => {
            const value = nativeSelect.value;
            if (!isNativeLang(value)) return;
            await saveLanguageSettings({ nativeLang: value });
            onSaved?.();
        });
    }
}
