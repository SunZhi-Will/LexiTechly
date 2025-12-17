/// <reference types="chrome"/>

import { getSpeakButtonHTML, speakWord } from '../vocabulary/audio.js';

// 查詢單字資訊
export async function queryWordInfo(word: string, apiKey: string): Promise<{ html: string, wordData?: any }> {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
                    <span style="color: #EF4444;">解析回應失敗，請稍後重試</span>
                </div>
            `;
            console.error('word query failed:', error, retryError);
            return { html: errorHtml };
        }
    }
}

// 檢測頁面主題
export function checkPageTheme(): boolean {
    // 檢查 CSS 媒體查詢
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return true;
    }

    // 檢查 HTML 元素的 data-theme 或 class
    const html = document.documentElement;
    const body = document.body;

    // 常見的深色主題標識
    const darkIndicators = [
        'dark', 'dark-theme', 'dark-mode', 'theme-dark',
        'night', 'night-mode', 'black-theme'
    ];

    for (const indicator of darkIndicators) {
        if (html.classList.contains(indicator) ||
            body.classList.contains(indicator) ||
            html.getAttribute('data-theme')?.includes(indicator) ||
            body.getAttribute('data-theme')?.includes(indicator)) {
            return true;
        }
    }

    // 檢查背景顏色
    const bodyStyles = window.getComputedStyle(body);
    const htmlStyles = window.getComputedStyle(html);

    const bodyBg = bodyStyles.backgroundColor;
    const htmlBg = htmlStyles.backgroundColor;

    // 檢查是否為深色背景
    const checkDarkColor = (color: string): boolean => {
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
            return false;
        }

        // 解析 RGB 值
        const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            const [, r, g, b] = rgbMatch.map(Number);
            // 計算亮度 (使用 YIQ 公式)
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness < 128; // 如果亮度小於 128 認為是深色
        }

        return false;
    };

    return checkDarkColor(bodyBg) || checkDarkColor(htmlBg);
}

// 更新 tooltip 主題
export function updateTooltipTheme(isDark: boolean): void {
    // 更新 CSS 變數
    const root = document.documentElement;

    if (isDark) {
        root.style.setProperty('--lexitechly-tooltip-bg', 'rgba(31, 41, 55, 0.98)');
        root.style.setProperty('--lexitechly-text-primary', '#F9FAFB');
        root.style.setProperty('--lexitechly-text-secondary', '#D1D5DB');
        root.style.setProperty('--lexitechly-text-muted', '#9CA3AF');
        root.style.setProperty('--lexitechly-border', 'rgba(75, 85, 99, 0.3)');
        root.style.setProperty('--lexitechly-shadow', 'rgba(0, 0, 0, 0.3)');
        root.style.setProperty('--lexitechly-bg-secondary', 'rgba(55, 65, 81, 0.9)');
    } else {
        root.style.setProperty('--lexitechly-tooltip-bg', 'rgba(255, 255, 255, 0.98)');
        root.style.setProperty('--lexitechly-text-primary', '#1F2937');
        root.style.setProperty('--lexitechly-text-secondary', '#374151');
        root.style.setProperty('--lexitechly-text-muted', '#6B7280');
        root.style.setProperty('--lexitechly-border', 'rgba(229, 231, 235, 0.3)');
        root.style.setProperty('--lexitechly-shadow', 'rgba(0, 0, 0, 0.1)');
        root.style.setProperty('--lexitechly-bg-secondary', 'rgba(249, 250, 251, 0.9)');
    }
} 