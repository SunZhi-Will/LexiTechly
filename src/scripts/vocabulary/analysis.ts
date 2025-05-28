/// <reference types="chrome"/>

import { Word, WordDetails } from './types.js';
import { wordAnalysisCache, accumulatedVocabulary } from './storage.js';

// AI 分析單字詳細資訊
export async function analyzeWordDetails(word: string, apiKey: string): Promise<WordDetails> {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    const prompt = `
        分析英文單字 "${word}" 並提供以下資訊：
        1. 相似詞（最多5個，每個包含英文單字和中文翻譯）
        2. 反義詞（最多5個，每個包含英文單字和中文翻譯）
        3. 例句（3個，包含中文翻譯）
        4. 用法說明（中文說明，100字以內）

        請直接回傳 JSON 格式：
        {
            "synonyms": [
                {"text": "相似詞1", "translation": "中文翻譯1"},
                {"text": "相似詞2", "translation": "中文翻譯2"}
            ],
            "antonyms": [
                {"text": "反義詞1", "translation": "中文翻譯1"},
                {"text": "反義詞2", "translation": "中文翻譯2"}
            ],
            "examples": [
                {"sentence": "英文例句1", "translation": "中文翻譯1"},
                {"sentence": "英文例句2", "translation": "中文翻譯2"}
            ],
            "usage": "用法說明（中文）",
            "translation": "單字的中文翻譯"
        }
    `;

    try {
        const response = await fetch(`${API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!response.ok) {
            throw new Error('API 請求失敗');
        }

        const data = await response.json();
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('無效的 AI 回應格式');
        }

        const text = data.candidates[0].content.parts[0].text.trim();
        const jsonText = text.replace(/```json\n?|\n?```/g, '').trim();
        const result: WordDetails = JSON.parse(jsonText);

        return result;
    } catch (error) {
        console.error('分析失敗:', error);
        throw new Error((error as Error).message || '無法取得詳細資訊');
    }
}

// 手動分析單字詳細資訊（用戶點擊時觸發）
export async function analyzeWordOnDemand(word: Word): Promise<WordDetails | null> {
    // 如果已經有分析結果，直接返回
    if (wordAnalysisCache[word.text]) {
        return wordAnalysisCache[word.text];
    }

    try {
        const { apiKey }: { apiKey?: string } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
            throw new Error('請先設定 API Key');
        }

        console.log(`開始分析單字: ${word.text}`);
        const details = await analyzeWordDetails(word.text, apiKey);

        wordAnalysisCache[word.text] = details;
        await chrome.storage.local.set({ wordAnalysisCache });

        console.log(`完成分析單字: ${word.text}`);

        // 更新該單字的顯示狀態
        const wordCards = document.querySelectorAll('.word-card');
        wordCards.forEach(card => {
            const wordTitle = card.querySelector('.word-text');
            if (wordTitle && wordTitle.textContent === word.text) {
                card.classList.add('analyzed');
            }
        });

        return details;
    } catch (error) {
        console.error(`分析單字 "${word.text}" 失敗:`, error);
        throw error;
    }
} 