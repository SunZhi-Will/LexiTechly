/// <reference types="chrome"/>

import { getSpeakButtonHTML, speakWord } from '../vocabulary/audio.js';

// 查詢單字資訊
export async function queryWordInfo(word: string, apiKey: string): Promise<{ html: string, wordData?: any }> {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    const prompt = `
    請為英文單字 "${word}" 提供簡潔的學習資訊，以JSON格式回應：

    {
        "word": "${word}",
        "level": "CEFR等級",
        "translation": "主要中文翻譯",
        "partOfSpeech": "詞性",
        "example": "簡短英文例句",
        "exampleTranslation": "例句中文翻譯"
    }

    要求：
    1. 使用繁體中文
    2. 不要包含任何音標
    3. 例句要簡短實用（15字以內）
    4. 如果是專有名詞，level 欄位填入「專有名詞」
    5. 只回應純JSON格式，不要任何額外說明
    6. 確保JSON格式正確，可以被解析
    `;

    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 300
        }
    };

    const response = await fetch(`${API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        throw new Error('API request failed');
    }

    const data = await response.json();

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid API response');
    }

    let result = data.candidates[0].content.parts[0].text.trim();

    // 清理回應，移除可能的 markdown 標記
    result = result.replace(/^```json\s*/i, '');
    result = result.replace(/^```\s*/i, '');
    result = result.replace(/\s*```$/i, '');

    try {
        // 解析 JSON
        const wordData = JSON.parse(result);

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

    } catch (parseError) {
        // 如果解析失敗，返回簡單的錯誤 HTML
        const errorHtml = `
            <div class="lexitechly-error">
                <strong>${word}</strong><br>
                <span style="color: #EF4444;">解析回應失敗</span>
            </div>
        `;
        return { html: errorHtml };
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