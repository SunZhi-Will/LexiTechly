/// <reference types="chrome"/>
import { AiError, generateText } from '../ai/client.js';

import { speakWord } from '../vocabulary/audio.js';
import { LEARNING_LANGUAGES, NATIVE_LANGUAGES, normalizeLevel } from '../lang/languages.js';
import { buildShortWordQueryPrompt, buildWordQueryPrompt } from '../lang/prompts.js';
import { languagesForSnippet } from './page-lang.js';
import { isDarkTheme, themeVars } from './styles';

// 查單字結果型別（與 Gemini 回傳格式相容）
export interface WordQueryResult {
    html: string;
    wordData?: {
        word: string;
        level: string;
        translation: string;
        partOfSpeech: string;
        example: string;
        exampleTranslation: string;
        /** 讀音（日文的假名、中文的拼音），其他語言沒有 */
        reading?: string;
        /** 這個單字的語言 */
        lang?: string;
    };
}

/** 使用免費翻譯 + 免費字典 API 查單字（不需 API Key，類似 Google 翻譯） */
export async function queryWordInfoWithTranslationOnly(word: string): Promise<WordQueryResult> {
    const safeWord = word.trim();
    if (!safeWord) {
        return { html: '<div class="lexitechly-error">請輸入單字</div>' };
    }

    const { lang, native } = await languagesForSnippet(safeWord);
    const fromCode = LEARNING_LANGUAGES[lang].translateCode;
    const toCode = NATIVE_LANGUAGES[native].translateCode;

    let translation = '';
    let partOfSpeech = '';
    let example = '';
    let exampleTranslation = '';

    // 1) MyMemory：學習語言 → 解說語言的翻譯（免 API Key）；兩者相同時沒有東西可翻
    try {
        if (fromCode === toCode) throw new Error('same language');
        const encoded = encodeURIComponent(safeWord);
        const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${encodeURIComponent(`${fromCode}|${toCode}`)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Translation request failed');
        const data = await res.json();
        const match = data?.responseData?.translatedText;
        if (match && typeof match === 'string') {
            translation = match.trim();
        }
    } catch (e) {
        console.warn('MyMemory translation failed:', e);
    }

    // 2) Free Dictionary API：詞性與例句（只有英文，而且僅支援「單字」，片語會 404，免 API Key）
    const isPhrase = /\s/.test(safeWord);
    if (!isPhrase && lang === 'en') {
        try {
            const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(safeWord.toLowerCase())}`;
            const res = await fetch(dictUrl);
            if (!res.ok) throw new Error('Dictionary request failed');
            const entries = await res.json();
            if (Array.isArray(entries) && entries.length > 0) {
                const first = entries[0];
                const meanings = first.meanings;
                if (Array.isArray(meanings) && meanings.length > 0) {
                    partOfSpeech = meanings[0].partOfSpeech || '';
                    const defs = meanings[0].definitions;
                    if (Array.isArray(defs) && defs.length > 0 && defs[0].example) {
                        example = defs[0].example;
                        exampleTranslation = '';
                    }
                }
            }
        } catch (e) {
            console.warn('Free Dictionary API failed:', e);
        }
    }

    // 片語時若無詞性則顯示「詞組」
    if (isPhrase && !partOfSpeech) {
        partOfSpeech = '詞組';
    }

    const wordData = {
        word: safeWord,
        level: '',
        translation: translation || '（無翻譯）',
        partOfSpeech: partOfSpeech || '—',
        example: example || '—',
        exampleTranslation: exampleTranslation || (example ? '（見例句）' : '—'),
        lang
    };

    const html = `
        <div class="word-header">
            <div class="word-title-container">
                <strong class="word-title">${wordData.word}</strong>
                <button class="speak-btn small elegant" title="播放發音" data-text="${wordData.word}" data-lang="${wordData.lang ?? ''}">
                    <svg class="play-icon" viewBox="0 0 24 24" width="16" height="16">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    <svg class="stop-icon" viewBox="0 0 24 24" width="16" height="16">
                        <path d="M6 6h12v12H6z"/>
                    </svg>
                </button>
            </div>
            ${wordData.level ? `<span class="word-level">${wordData.level}</span>` : ''}
        </div>
        <div class="word-info">
            <div class="translation"><strong>翻譯：</strong>${wordData.translation}</div>
            <div class="part-of-speech"><strong>詞性：</strong>${wordData.partOfSpeech}</div>
            <div class="example">
                <div class="example-header">
                    <strong>例句：</strong>${wordData.example}
                    ${wordData.example !== '—' ? `
                    <button class="speak-btn small elegant" title="播放發音" data-text="${wordData.example}" data-lang="${wordData.lang ?? ''}">
                        <svg class="play-icon" viewBox="0 0 24 24" width="16" height="16">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        <svg class="stop-icon" viewBox="0 0 24 24" width="16" height="16">
                            <path d="M6 6h12v12H6z"/>
                        </svg>
                    </button>
                    ` : ''}
                </div>
                ${wordData.exampleTranslation ? `<em>${wordData.exampleTranslation}</em>` : ''}
            </div>
        </div>
    `;

    setTimeout(() => {
        document.querySelectorAll('.speak-btn').forEach(btn => {
            const button = btn as HTMLElement;
            if (!button.dataset.hasListener) {
                button.dataset.hasListener = 'true';
                button.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const text = button.dataset.text;
                    if (text) await speakWord(text, button, button.dataset.lang);
                });
            }
        });
    }, 0);

    return { html, wordData };
}

// 查詢單字資訊（Gemini API）
export async function queryWordInfo(word: string): Promise<WordQueryResult> {

    const { lang, native } = await languagesForSnippet(word);
    const basePrompt = buildWordQueryPrompt(word, lang, native);

    // 嘗試從模型回應中擷取可解析的 JSON，並修復常見格式問題
    const parseJsonSafely = (text: string) => {
        // 移除可能包裹的 fenced code block
        let cleaned = text.replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // 將智慧引號替換為標準雙引號
        cleaned = cleaned.replace(/[""]/g, '"').replace(/['']/g, "'");

        // 修復未轉義的換行符和特殊字符（在字串值中）
        const fixStringEscapes = (input: string): string => {
            let result = '';
            let inString = false;
            let escapeNext = false;

            for (let i = 0; i < input.length; i++) {
                const char = input[i];
                const prevChar = i > 0 ? input[i - 1] : '';

                if (escapeNext) {
                    result += char;
                    escapeNext = false;
                    continue;
                }

                if (char === '\\') {
                    escapeNext = true;
                    result += char;
                    continue;
                }

                if (char === '"' && prevChar !== '\\') {
                    inString = !inString;
                    result += char;
                    continue;
                }

                if (inString) {
                    // 在字串內：轉義未轉義的換行符、製表符和回車符
                    if (char === '\n' && prevChar !== '\\') {
                        result += '\\n';
                    } else if (char === '\r' && prevChar !== '\\') {
                        result += '\\r';
                    } else if (char === '\t' && prevChar !== '\\') {
                        result += '\\t';
                    } else if (char === '"' && prevChar !== '\\') {
                        // 如果字串內有未轉義的雙引號，轉義它
                        result += '\\"';
                    } else {
                        result += char;
                    }
                } else {
                    // 在字串外：正常處理
                    result += char;
                }
            }

            return result;
        };

        cleaned = fixStringEscapes(cleaned);

        // 移除物件和陣列結尾的多餘逗號
        cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

        // 嘗試找出第一段平衡的大括號內容
        const extractBalancedJson = (input: string): string | null => {
            let start = -1;
            let depth = 0;

            for (let i = 0; i < input.length; i++) {
                const ch = input[i];
                if (ch === '{') {
                    if (depth === 0) start = i;
                    depth++;
                } else if (ch === '}') {
                    if (depth > 0) depth--;
                    if (depth === 0 && start !== -1) {
                        return input.slice(start, i + 1);
                    }
                }
            }
            return null;
        };

        const candidates: string[] = [];

        // 先收集平衡括號的 JSON 區塊
        const balanced = extractBalancedJson(cleaned);
        if (balanced) {
            candidates.push(balanced);
        }

        // 若仍失敗，使用到最後一個右大括號的切片作為候選
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace !== -1) {
            candidates.push(cleaned.slice(0, lastBrace + 1));
        }

        // 最後加入原始清理文本，確保有嘗試所有可能
        candidates.push(cleaned);

        let lastError: unknown;
        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate);
                return { wordData: parsed, raw: candidate };
            } catch (err) {
                lastError = err;
            }
        }

        throw lastError ?? new Error('Unable to parse JSON response');
    };

    // 先嘗試主要請求，若失敗再用縮短提示重試
    const tryRequest = async (prompt: string, maxTokens: number) => {
        const { text, finishReason } = await generateText({
            prompt,
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: maxTokens,
            // 請求直接回傳 JSON，減少包裝文字造成解析失敗
            json: true
        });

        if (finishReason === 'MAX_TOKENS') {
            throw new Error('Model output truncated (MAX_TOKENS)');
        }

        return parseJsonSafely(text);
    };

    try {
        // 主請求：較高 token 上限，降低截斷風險
        const { wordData } = await tryRequest(basePrompt, 900);
        wordData.lang = lang;
        // 專有名詞等不在分級系統裡的，保留模型原本的寫法
        wordData.level = normalizeLevel(lang, wordData.level) ?? wordData.level;

        // 生成自訂 HTML
        const html = `
            <div class="word-header">
                <div class="word-title-container">
                    <strong class="word-title">${wordData.word}</strong>
                    ${wordData.reading ? `<span class="word-reading">${wordData.reading}</span>` : ''}
                    <button class="speak-btn small elegant" title="播放發音" data-text="${wordData.word}" data-lang="${wordData.lang ?? ''}">
                        <svg class="play-icon" viewBox="0 0 24 24" width="16" height="16">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        <svg class="stop-icon" viewBox="0 0 24 24" width="16" height="16">
                            <path d="M6 6h12v12H6z"/>
                        </svg>
                    </button>
                </div>
                <span class="word-level">${wordData.level}</span>
            </div>
            <div class="word-info">
                <div class="translation"><strong>翻譯：</strong>${wordData.translation}</div>
                <div class="part-of-speech"><strong>詞性：</strong>${wordData.partOfSpeech}</div>
                <div class="example">
                    <div class="example-header">
                        <strong>例句：</strong>${wordData.example}
                        <button class="speak-btn small elegant" title="播放發音" data-text="${wordData.example}" data-lang="${wordData.lang ?? ''}">
                            <svg class="play-icon" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                            <svg class="stop-icon" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M6 6h12v12H6z"/>
                            </svg>
                        </button>
                    </div>
                    <em>${wordData.exampleTranslation}</em>
                </div>
            </div>
        `;

        // 添加事件監聽器
        setTimeout(() => {
            document.querySelectorAll('.speak-btn').forEach(btn => {
                const button = btn as HTMLElement;
                if (!button.dataset.hasListener) {
                    button.dataset.hasListener = 'true';
                    button.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const text = button.dataset.text;
                        if (text) {
                            await speakWord(text, button, button.dataset.lang);
                        }
                    });
                }
            });
        }, 0);

        return { html, wordData };

    } catch (error) {
        // 金鑰、額度、連線問題再試也沒用，直接把原因告訴使用者
        if (error instanceof AiError && error.code !== 'bad-response') {
            const reason = document.createElement('span');
            reason.style.color = '#EF4444';
            reason.textContent = error.message;
            const title = document.createElement('strong');
            title.textContent = word;
            return { html: `<div class="lexitechly-error">${title.outerHTML}<br>${reason.outerHTML}</div>` };
        }
        // 若主請求失敗，縮短提示再試一次
        try {
            const shortPrompt = buildShortWordQueryPrompt(word, lang, native);
            const { wordData } = await tryRequest(shortPrompt, 900);
            wordData.lang = lang;
            wordData.level = normalizeLevel(lang, wordData.level) ?? wordData.level;

            const html = `
                <div class="word-header">
                    <div class="word-title-container">
                        <strong class="word-title">${wordData.word}</strong>
                    </div>
                    <span class="word-level">${wordData.level}</span>
                </div>
                <div class="word-info">
                    <div class="translation"><strong>翻譯：</strong>${wordData.translation}</div>
                    <div class="part-of-speech"><strong>詞性：</strong>${wordData.partOfSpeech}</div>
                    <div class="example">
                        <strong>例句：</strong>${wordData.example}
                        <em>${wordData.exampleTranslation}</em>
                    </div>
                </div>
            `;
            return { html, wordData };
        } catch (retryError) {
            const errorHtml = `
                <div class="lexitechly-error">
                    <strong>${word}</strong><br>
                    <span style="color: #d43c3c;">解析回應失敗，請稍後重試</span>
                </div>
            `;
            console.error('word query failed:', error, retryError);
            return { html: errorHtml };
        }
    }
}

// 檢測頁面主題
export function checkPageTheme(): boolean {
    return isDarkTheme();
}

// 更新 tooltip 主題
export function updateTooltipTheme(isDark: boolean): void {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(themeVars(isDark))) {
        root.style.setProperty(name, value);
    }
}
