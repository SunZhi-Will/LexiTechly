/// <reference types="chrome"/>
import { GEMINI_GENERATE_URL } from '../ai-models.js';

import { speakWord } from '../vocabulary/audio.js';
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
    };
}

/** 使用免費翻譯 + 免費字典 API 查單字（不需 API Key，類似 Google 翻譯） */
export async function queryWordInfoWithTranslationOnly(word: string): Promise<WordQueryResult> {
    const safeWord = word.trim();
    if (!safeWord) {
        return { html: '<div class="lexitechly-error">請輸入單字</div>' };
    }

    let translation = '';
    let partOfSpeech = '';
    let example = '';
    let exampleTranslation = '';

    // 1) MyMemory：英 → 繁中翻譯（免 API Key）
    try {
        const encoded = encodeURIComponent(safeWord);
        const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|zh-TW`;
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

    // 2) Free Dictionary API：詞性與例句（僅支援「單字」，片語會 404，免 API Key）
    const isPhrase = /\s/.test(safeWord);
    if (!isPhrase) {
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
        exampleTranslation: exampleTranslation || (example ? '（見例句）' : '—')
    };

    const html = `
        <div class="word-header">
            <div class="word-title-container">
                <strong class="word-title">${wordData.word}</strong>
                <button class="speak-btn small elegant" title="播放發音" data-text="${wordData.word}">
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
            <div class="translation"><strong>中文：</strong>${wordData.translation}</div>
            <div class="part-of-speech"><strong>詞性：</strong>${wordData.partOfSpeech}</div>
            <div class="example">
                <div class="example-header">
                    <strong>例句：</strong>${wordData.example}
                    ${wordData.example !== '—' ? `
                    <button class="speak-btn small elegant" title="播放發音" data-text="${wordData.example}">
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
                    if (text) await speakWord(text, button);
                });
            }
        });
    }, 0);

    return { html, wordData };
}

// 查詢單字資訊（Gemini API）
export async function queryWordInfo(word: string, apiKey: string): Promise<WordQueryResult> {
    const API_URL = GEMINI_GENERATE_URL;

    const basePrompt = `
    只回傳 JSON，描述英文單字 "${word}"：
    {
      "word": "${word}",
      "level": "CEFR等級(或專有名詞)",
      "translation": "主要中文翻譯",
      "partOfSpeech": "詞性",
      "example": "簡短英文例句(<=15字)",
      "exampleTranslation": "例句中文翻譯"
    }
    規則：繁體中文；無音標；確保 JSON 可解析；不要額外說明或 Markdown。
    `;

    const buildRequest = (prompt: string, maxOutputTokens: number) => ({
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens,
            // 請求直接回傳 JSON，減少包裝文字造成解析失敗
            responseMimeType: "application/json"
        }
    });

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
        const response = await fetch(`${API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildRequest(prompt, maxTokens))
        });

        if (!response.ok) {
            throw new Error('API request failed');
        }

        const data = await response.json();
        const candidate = data?.candidates?.[0];
        const firstTextPart = candidate?.content?.parts?.find((p: any) => typeof p?.text === 'string' && p.text.trim());

        if (candidate?.finishReason === 'MAX_TOKENS') {
            throw new Error('Model output truncated (MAX_TOKENS)');
        }
        if (!firstTextPart?.text) {
            throw new Error('Invalid API response');
        }

        const result = firstTextPart.text.trim();
        return parseJsonSafely(result);
    };

    try {
        // 主請求：較高 token 上限，降低截斷風險
        const { wordData } = await tryRequest(basePrompt, 900);

        // 生成自訂 HTML
        const html = `
            <div class="word-header">
                <div class="word-title-container">
                    <strong class="word-title">${wordData.word}</strong>
                    <button class="speak-btn small elegant" title="播放發音" data-text="${wordData.word}">
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
                <div class="translation"><strong>中文：</strong>${wordData.translation}</div>
                <div class="part-of-speech"><strong>詞性：</strong>${wordData.partOfSpeech}</div>
                <div class="example">
                    <div class="example-header">
                        <strong>例句：</strong>${wordData.example}
                        <button class="speak-btn small elegant" title="播放發音" data-text="${wordData.example}">
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
                            await speakWord(text, button);
                        }
                    });
                }
            });
        }, 0);

        return { html, wordData };

    } catch (error) {
        // 若主請求失敗，縮短提示再試一次
        try {
            const shortPrompt = `只回傳可解析的 JSON：{"word":"${word}","level":"","translation":"","partOfSpeech":"","example":"","exampleTranslation":""}`;
            const { wordData } = await tryRequest(shortPrompt, 900);

            const html = `
                <div class="word-header">
                    <div class="word-title-container">
                        <strong class="word-title">${wordData.word}</strong>
                    </div>
                    <span class="word-level">${wordData.level}</span>
                </div>
                <div class="word-info">
                    <div class="translation"><strong>中文：</strong>${wordData.translation}</div>
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
