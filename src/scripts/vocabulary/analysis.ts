/// <reference types="chrome"/>

import { Word, WordDetails } from './types.js';
import { wordAnalysisCache, accumulatedVocabulary } from './storage.js';

// AI 分析單字詳細資訊
export async function analyzeWordDetails(word: string, apiKey: string): Promise<WordDetails> {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    const prompt = `
        分析英文單字 "${word}" 並提供以下資訊：
        1. 相似詞（最多5個，每個包含英文單字和中文翻譯）
        2. 反義詞（最多5個，每個包含英文單字和中文翻譯）
        3. 例句（3個，包含中文翻譯）
        4. 用法說明（中文說明，100字以內）

        ⚠️ 重要：請只回傳純 JSON 格式，不要包含任何其他文字、解釋或 markdown 標記（如 \`\`\`json）。
        必須嚴格遵守以下 JSON 格式，確保所有陣列元素之間都有逗號分隔：
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
        
        // 清理和修復 JSON 格式
        const cleanAndFixJSON = (jsonString: string): string => {
            // 移除可能的 markdown 代碼塊標記
            jsonString = jsonString.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

            // 移除開頭和結尾的非 JSON 字符
            const jsonStart = jsonString.indexOf('{');
            const jsonEnd = jsonString.lastIndexOf('}');

            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
            }

            // 將智慧引號替換為標準雙引號
            jsonString = jsonString.replace(/[""]/g, '"').replace(/['']/g, "'");
            
            // 修復常見的格式問題
            // 1. 修復物件之間缺少逗號：} { -> },{
            jsonString = jsonString.replace(/}\s*{/g, '},{');
            // 2. 修復陣列元素之間缺少逗號（帶換行）：}\n{ -> },\n{
            jsonString = jsonString.replace(/}\s*\n\s*{/g, '},\n{');
            // 3. 修復屬性之間缺少逗號：" " -> ","
            jsonString = jsonString.replace(/"\s*\n\s*"/g, '",\n"');

            // 修復未轉義的換行符和特殊字符（在字串值中）
            let result = '';
            let inString = false;
            let escapeNext = false;

            for (let i = 0; i < jsonString.length; i++) {
                const char = jsonString[i];
                const prevChar = i > 0 ? jsonString[i - 1] : '';

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
                        result += '\\"';
                    } else {
                        result += char;
                    }
                } else {
                    // 在字串外：正常處理
                    result += char;
                }
            }

            // 移除物件和陣列結尾的多餘逗號
            result = result.replace(/,(\s*[}\]])/g, '$1');

            // 修復陣列中缺少的逗號（在字串外）
            const fixArrayCommas = (input: string): string => {
                let output = '';
                let inString = false;
                let escapeNext = false;
                let arrayDepth = 0;
                let objectDepth = 0;
                let lastNonWhitespace = '';
                let lastValueEnd = false; // 標記上一個字符是否表示值結束

                for (let i = 0; i < input.length; i++) {
                    const char = input[i];
                    const prevChar = i > 0 ? input[i - 1] : '';
                    const nextChar = i < input.length - 1 ? input[i + 1] : '';

                    if (escapeNext) {
                        output += char;
                        escapeNext = false;
                        continue;
                    }

                    if (char === '\\') {
                        escapeNext = true;
                        output += char;
                        continue;
                    }

                    if (char === '"' && prevChar !== '\\') {
                        inString = !inString;
                        output += char;
                        if (!inString) {
                            lastNonWhitespace = '"';
                            lastValueEnd = true;
                        } else {
                            lastValueEnd = false;
                        }
                        continue;
                    }

                    if (inString) {
                        output += char;
                    } else {
                        // 追蹤結構深度
                        if (char === '[') {
                            arrayDepth++;
                            output += char;
                            lastNonWhitespace = '[';
                            lastValueEnd = false;
                        } else if (char === ']') {
                            arrayDepth--;
                            output += char;
                            lastNonWhitespace = ']';
                            lastValueEnd = true;
                        } else if (char === '{') {
                            objectDepth++;
                            output += char;
                            lastNonWhitespace = '{';
                            lastValueEnd = false;
                        } else if (char === '}') {
                            objectDepth--;
                            output += char;
                            lastNonWhitespace = '}';
                            lastValueEnd = true;
                        } else if (char === ',') {
                            output += char;
                            lastNonWhitespace = ',';
                            lastValueEnd = false;
                        } else if (/\s/.test(char)) {
                            // 空白字符
                            output += char;
                        } else {
                            // 檢查是否需要在陣列元素之間添加逗號
                            if (arrayDepth > 0 && 
                                lastValueEnd && 
                                lastNonWhitespace !== ',' && 
                                lastNonWhitespace !== '[' &&
                                (char === '{' || char === '[' || char === '"' || /[0-9tf\-]/.test(char))) {
                                output += ',';
                            }
                            
                            // 處理 true、false、null 關鍵字
                            const remaining = input.substring(i);
                            let keywordMatch = remaining.match(/^(true|false|null)/);
                            if (keywordMatch && (char === 't' || char === 'f' || char === 'n')) {
                                const keyword = keywordMatch[0];
                                output += keyword;
                                i += keyword.length - 1; // 跳過剩餘字符（-1 因為循環會 +1）
                                lastNonWhitespace = keyword[keyword.length - 1];
                                lastValueEnd = true;
                            } else {
                                output += char;
                                lastNonWhitespace = char;
                                // 檢查是否為值的結束
                                if (/[0-9]/.test(char)) {
                                    // 數字：檢查下一個字符是否為非數字字符（除了小數點和科學記號）
                                    if (!/[0-9.eE\+\-]/.test(nextChar)) {
                                        lastValueEnd = true;
                                    } else {
                                        lastValueEnd = false;
                                    }
                                } else {
                                    lastValueEnd = false;
                                }
                            }
                        }
                    }
                }

                return output;
            };

            result = fixArrayCommas(result);

            return result;
        };

        let jsonText = cleanAndFixJSON(text);
        
        // 嘗試解析，如果失敗則使用多種方法修復
        let result: WordDetails;
        try {
            result = JSON.parse(jsonText);
        } catch (parseError) {
            const error = parseError as Error;
            console.warn('第一次 JSON 解析失敗，嘗試修復:', error);
            console.warn('原始 AI 回應:', text.substring(0, 300));
            console.warn('清理後的 JSON 文本:', jsonText.substring(0, 300));
            
            // 嘗試更激進的清理
            try {
                jsonText = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
                const jsonStart = jsonText.indexOf('{');
                const jsonEnd = jsonText.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                    jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
                }
                
                // 修復物件屬性之間缺少逗號
                jsonText = jsonText.replace(/"\s*\n\s*"/g, '",\n"');
                
                // 修復陣列元素之間缺少逗號的情況
                jsonText = jsonText.replace(/}\s*\n\s*{/g, '},\n{');
                jsonText = jsonText.replace(/}\s*{/g, '},{');
                
                // 再次應用清理函數
                jsonText = cleanAndFixJSON(jsonText);
                console.warn('第二次清理後的 JSON:', jsonText.substring(0, 300));
                result = JSON.parse(jsonText);
            } catch (secondError) {
                const error2 = secondError as Error;
                console.error('第二次 JSON 解析也失敗:', error2);
                console.error('修復後的 JSON 文本:', jsonText);
                
                // 最後嘗試：提取第一個完整的 JSON 物件
                const firstBrace = jsonText.indexOf('{');
                if (firstBrace !== -1) {
                    let braceCount = 0;
                    let endPos = firstBrace;
                    let inString = false;
                    let escapeNext = false;
                    
                    for (let i = firstBrace; i < jsonText.length; i++) {
                        const char = jsonText[i];
                        const prevChar = i > 0 ? jsonText[i - 1] : '';
                        
                        if (escapeNext) {
                            escapeNext = false;
                            continue;
                        }
                        
                        if (char === '\\') {
                            escapeNext = true;
                            continue;
                        }
                        
                        if (char === '"' && prevChar !== '\\') {
                            inString = !inString;
                            continue;
                        }
                        
                        if (!inString) {
                            if (char === '{') {
                                braceCount++;
                            } else if (char === '}') {
                                braceCount--;
                                if (braceCount === 0) {
                                    endPos = i;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (endPos > firstBrace) {
                        jsonText = jsonText.substring(firstBrace, endPos + 1);
                        console.warn('提取的 JSON 物件:', jsonText);
                        result = JSON.parse(jsonText);
                    } else {
                        // 提供詳細的錯誤訊息
                        throw new Error(`JSON 解析失敗：${error2.message}\n原始 AI 回應片段：${text.substring(0, 200)}`);
                    }
                } else {
                    throw new Error(`JSON 解析失敗：找不到有效的 JSON 物件\n原始 AI 回應片段：${text.substring(0, 200)}`);
                }
            }
        }

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