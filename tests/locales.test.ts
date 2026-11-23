import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

// 測試編譯後在 .test-build/tests/ 底下執行，專案根目錄在上兩層
const ROOT = resolve(__dirname, '..', '..');
const LOCALES_DIR = resolve(ROOT, 'src/assets/_locales');

type Messages = Record<string, { message: string }>;

function readText(path: string): string {
    return readFileSync(resolve(ROOT, path), 'utf8');
}

function loadLocale(locale: string): Messages {
    return JSON.parse(readFileSync(resolve(LOCALES_DIR, locale, 'messages.json'), 'utf8')) as Messages;
}

const locales = readdirSync(LOCALES_DIR).filter((name) => !name.startsWith('.'));
const manifest = JSON.parse(readText('manifest.json')) as { default_locale: string };
const defaultKeys = Object.keys(loadLocale(manifest.default_locale)).sort();

function matches(text: string, pattern: RegExp): string[] {
    return [...text.matchAll(pattern)].map((match) => match[1]);
}

test('每個語系的 key 都和預設語系一致，而且沒有空字串', () => {
    assert.ok(locales.includes(manifest.default_locale));
    for (const locale of locales) {
        const messages = loadLocale(locale);
        assert.deepEqual(Object.keys(messages).sort(), defaultKeys, `${locale} 的 key 和 ${manifest.default_locale} 不一致`);
        for (const [key, value] of Object.entries(messages)) {
            assert.ok(value.message.trim().length > 0, `${locale}/${key} 是空的`);
        }
    }
});

test('商店顯示的說明不超過 132 個字元', () => {
    for (const locale of locales) {
        const { message } = loadLocale(locale).extDescription;
        assert.ok(message.length <= 132, `${locale} 的 extDescription 有 ${message.length} 個字元`);
    }
});

test('manifest、歡迎頁與程式用到的 key 都有定義', () => {
    const used = [
        ...matches(readText('manifest.json'), /__MSG_(\w+)__/g),
        ...matches(readText('src/pages/welcome.html'), /data-i18n(?:-placeholder|-title)?="(\w+)"/g),
        ...matches(readText('src/scripts/welcome.ts'), /\bt\('(\w+)'/g),
        ...matches(readText('src/scripts/background.ts'), /\bt\('(\w+)'/g),
        ...matches(readText('src/scripts/lang/settings-ui.ts'), /\bt\('(\w+)'/g)
    ];
    assert.ok(used.length > 0);
    for (const key of used) {
        assert.ok(defaultKeys.includes(key), `字串檔裡沒有 ${key}`);
    }
});

test('字串檔裡沒有用不到的 key', () => {
    const sources = ['manifest.json', 'src/pages/welcome.html', 'src/scripts/welcome.ts', 'src/scripts/background.ts', 'src/scripts/lang/settings-ui.ts']
        .map(readText)
        .join('\n');
    for (const key of defaultKeys) {
        assert.ok(sources.includes(key), `${key} 沒有被用到`);
    }
});
