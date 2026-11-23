/// <reference types="chrome"/>
import { AiError, generateText } from '../ai/client.js';
import { LEARNING_LANGUAGES, NATIVE_LANGUAGES, middleLevel, normalizeLevel, type LearningLang, type NativeLang } from '../lang/languages.js';
import { buildChatPrompt, buildPageAnalysisPrompt, buildPageVocabularyPrompt } from '../lang/prompts.js';
import { wordsIn } from '../lang/segment.js';
import { getLanguageSettings, resolveLearningLang } from '../lang/settings.js';

// 獲取頁面內容
export function getPageContent(): string {
    // 獲取主要文章內容
    const article = document.querySelector('article') || document.body;
    const text = article.innerText;
    return text;
}

const UNKNOWN_LANGUAGE_ERROR = '看不出這個頁面是哪種語言。請到設定指定要學習的語言後再試。';

/** 這段內容要當成哪種語言來學，以及說明要用哪種語言寫；判斷不出內容的語言時 lang 為 null */
async function resolvePageLanguages(content: string): Promise<{ lang: LearningLang | null; native: NativeLang }> {
    const settings = await getLanguageSettings();
    return { lang: resolveLearningLang(settings.learningLang, content), native: settings.nativeLang };
}

/** 整理 AI 回傳的單字：等級改成該語言分級系統的寫法，並記下語言與加入時間 */
function finishWord(word: Word, lang: LearningLang): Word {
    return {
        ...word,
        level: normalizeLevel(lang, word.level) ?? middleLevel(lang),
        lang,
        addedTime: Date.now()
    };
}

/** MyMemory 翻譯（免 API Key），供本地單字分析使用；學習語言和解說語言相同時不翻 */
async function translateWithMyMemory(word: string, lang: LearningLang, native: NativeLang): Promise<string> {
    const from = LEARNING_LANGUAGES[lang].translateCode;
    const to = NATIVE_LANGUAGES[native].translateCode;
    if (from === to) return '';
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word.trim())}&langpair=${encodeURIComponent(`${from}|${to}`)}`;
        const res = await fetch(url);
        if (!res.ok) return '';
        const data = await res.json();
        const t = data?.responseData?.translatedText;
        return typeof t === 'string' ? t.trim() : '';
    } catch {
        return '';
    }
}

/** 本地內容難度分析（不需 API Key）：依字長、句長等簡單規則估計 CEFR。規則是為英文訂的，其他語言不適用 */
export async function analyzeContentLocal(content: string): Promise<ChromeResponse> {
    const { lang } = await resolvePageLanguages(content);
    if (!lang) {
        return { error: UNKNOWN_LANGUAGE_ERROR, level: undefined, text: undefined };
    }
    if (lang !== 'en') {
        return {
            error: `沒有 API Key 時只能估算英文文章的難度。要分析${LEARNING_LANGUAGES[lang].nativeName}文章，請先到設定填入 Gemini API Key。`,
            level: undefined,
            text: undefined
        };
    }

    const words = content.split(/\s+/).filter(Boolean);
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    if (words.length === 0) {
        return {
            error: '無法取得足夠文字內容',
            level: undefined,
            text: undefined
        };
    }

    const totalChars = words.join('').length;
    const avgWordLength = totalChars / words.length;
    const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
    const uniqueRatio = new Set(words.map(w => w.toLowerCase())).size / words.length;

    let level: CEFRLevel = 'B2';
    if (avgWordLength < 4 && avgSentenceLength < 8) level = 'A1';
    else if (avgWordLength < 4.5 && avgSentenceLength < 12) level = 'A2';
    else if (avgWordLength < 5 && avgSentenceLength < 15) level = 'B1';
    else if (avgWordLength < 5.5 && avgSentenceLength < 18) level = 'B2';
    else if (avgWordLength < 6) level = 'C1';
    else level = 'C2';

    const vocabularyDesc = uniqueRatio > 0.5 ? '詞彙較豐富，用字多元' : '詞彙難度適中';
    const grammarDesc = avgSentenceLength > 15 ? '句型較長、結構稍複雜' : '句型簡潔易懂';
    const topicDesc = level.startsWith('C') ? '主題可能較專業或抽象' : '主題較易理解';

    return {
        level: {
            level,
            analysis: {
                vocabulary: vocabularyDesc,
                grammar: grammarDesc,
                topic: topicDesc
            }
        },
        text: content,
        lang,
        error: undefined
    };
}

/** 本地單字提取與翻譯（不需 API Key）：擷取頁面上最常出現的單字並以 MyMemory 翻譯 */
export async function analyzePageVocabularyLocal(text: string): Promise<ChromeResponse> {
    const { lang, native } = await resolvePageLanguages(text);
    if (!lang) {
        return { error: UNKNOWN_LANGUAGE_ERROR, vocabulary: undefined };
    }

    // 太短的字多半是虛詞：拉丁字母的語言至少 4 個字母，其他語言至少 2 個字
    const minLength = LEARNING_LANGUAGES[lang].script === 'latin' ? 4 : 2;
    const count = new Map<string, number>();
    for (const { word } of wordsIn(text, lang)) {
        if ([...word].length < minLength) continue;
        count.set(word, (count.get(word) || 0) + 1);
    }

    const sorted = [...count.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([word]) => word);

    const vocabulary: Word[] = [];
    for (const word of sorted) {
        const translation = await translateWithMyMemory(word, lang, native);
        vocabulary.push({
            text: word,
            // 沒有 AI 就無從判斷等級，先放該語言的中間等級
            level: middleLevel(lang),
            translation: translation || '—',
            example: '',
            lang,
            addedTime: Date.now()
        });
    }

    return { vocabulary, lang, error: undefined };
}

// 分析內容
export async function analyzeContent(content: string): Promise<ChromeResponse> {
    try {
        const { lang, native } = await resolvePageLanguages(content);
        if (!lang) {
            return { error: UNKNOWN_LANGUAGE_ERROR, level: undefined, text: undefined };
        }

        const maxRetries = 3;
        let retryCount = 0;
        let lastError: Error | undefined;

        const prompt = buildPageAnalysisPrompt(content, lang, native);

        while (retryCount < maxRetries) {
            try {
                // 額度不足時的等待重試由背景頁的 AI 請求層處理
                const { text: result } = await generateText({
                    prompt,
                    temperature: 1,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                    json: true
                });

                // 解析 JSON 回應並進行格式驗證
                let analysisResult: {
                    level: CEFRLevel;
                    analysis: {
                        vocabulary: string;
                        grammar: string;
                        topic: string;
                    };
                };

                // 清理和修復 JSON 格式
                function cleanAndFixJSON(jsonString: string): string {
                    // 移除可能的 markdown 代碼塊標記
                    jsonString = jsonString.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

                    // 移除開頭和結尾的非 JSON 字符
                    const jsonStart = jsonString.indexOf('{');
                    const jsonEnd = jsonString.lastIndexOf('}');

                    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                        jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
                    }

                    // 將智慧引號替換為標準雙引號（在字串值之外）
                    jsonString = jsonString.replace(/[""]/g, '"').replace(/['']/g, "'");

                    // 修復常見的 JSON 格式問題（只處理結構性問題，不破壞字串內容）
                    // 移除物件和陣列結尾的多餘逗號（使用更精確的正則）
                    jsonString = jsonString
                        .replace(/,(\s*[}\]])/g, '$1')  // 移除物件/陣列結尾的多餘逗號
                        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'); // 為未加引號的屬性名添加雙引號

                    // 處理未轉義的換行符（在字串值中）
                    // 使用狀態機來正確處理字串內的內容
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
                            // 在字串內：轉義未轉義的換行符和製表符
                            if (char === '\n' && prevChar !== '\\') {
                                result += '\\n';
                            } else if (char === '\r' && prevChar !== '\\') {
                                result += '\\r';
                            } else if (char === '\t' && prevChar !== '\\') {
                                result += '\\t';
                            } else {
                                result += char;
                            }
                        } else {
                            // 在字串外：正常處理
                            result += char;
                        }
                    }

                    // 修復陣列中缺少的逗號（在字串外）
                    const fixArrayCommas = (input: string): string => {
                        let output = '';
                        let inString = false;
                        let escapeNext = false;
                        let arrayDepth = 0;
                        let lastNonWhitespace = '';

                        for (let i = 0; i < input.length; i++) {
                            const char = input[i];
                            const prevChar = i > 0 ? input[i - 1] : '';

                            if (escapeNext) {
                                output += char;
                                escapeNext = false;
                                if (!inString) {
                                    lastNonWhitespace = char;
                                }
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
                                }
                                continue;
                            }

                            if (inString) {
                                output += char;
                            } else {
                                // 追蹤陣列深度
                                if (char === '[') {
                                    arrayDepth++;
                                    output += char;
                                    lastNonWhitespace = '[';
                                } else if (char === ']') {
                                    arrayDepth--;
                                    output += char;
                                    lastNonWhitespace = ']';
                                } else if (/\s/.test(char)) {
                                    // 空白字符
                                    output += char;
                                } else {
                                    // 檢查是否需要在陣列元素之間添加逗號
                                    if (arrayDepth > 0 && 
                                        lastNonWhitespace !== ',' && 
                                        lastNonWhitespace !== '[' &&
                                        (lastNonWhitespace === '}' || lastNonWhitespace === ']' || lastNonWhitespace === '"') &&
                                        (char === '{' || char === '[' || char === '"')) {
                                        output += ',';
                                    }
                                    output += char;
                                    lastNonWhitespace = char;
                                }
                            }
                        }

                        return output;
                    };

                    result = fixArrayCommas(result);

                    return result;
                }

                try {
                    // 嘗試直接解析
                    analysisResult = JSON.parse(result);
                } catch (parseError) {
                    // 如果直接解析失敗，嘗試清理後再解析
                    try {
                        const cleanedResult = cleanAndFixJSON(result);
                        analysisResult = JSON.parse(cleanedResult);
                    } catch (secondParseError) {
                        throw new Error(`JSON 解析失敗。原始回應: ${result.substring(0, 200)}...`);
                    }
                }

                // 驗證結果格式
                if (!analysisResult || typeof analysisResult !== 'object') {
                    throw new Error('分析結果必須是一個物件');
                }

                if (!analysisResult.level || typeof analysisResult.level !== 'string') {
                    throw new Error('分析結果缺少有效的 level 屬性');
                }

                if (!analysisResult.analysis || typeof analysisResult.analysis !== 'object') {
                    throw new Error('分析結果缺少有效的 analysis 屬性');
                }

                const requiredFields: (keyof typeof analysisResult.analysis)[] = ['vocabulary', 'grammar', 'topic'];
                for (const field of requiredFields) {
                    if (!analysisResult.analysis[field] || typeof analysisResult.analysis[field] !== 'string') {
                        throw new Error(`分析結果缺少有效的 ${field} 屬性`);
                    }
                }

                const normalizedLevel = normalizeLevel(lang, analysisResult.level);
                if (!normalizedLevel) {
                    throw new Error(`無效的等級: ${analysisResult.level}`);
                }
                analysisResult.level = normalizedLevel;

                // 確保回傳格式正確
                return {
                    level: {
                        level: analysisResult.level,
                        analysis: {
                            vocabulary: analysisResult.analysis.vocabulary,
                            grammar: analysisResult.analysis.grammar,
                            topic: analysisResult.analysis.topic
                        }
                    },
                    text: content,
                    error: undefined
                };

            } catch (error) {
                lastError = error as Error;
                // 金鑰、額度、連線問題再試也沒用（額度已在背景頁重試過），直接回報；只有回應格式不對才重問
                const retryable = !(error instanceof AiError) || error.code === 'bad-response';
                if (!retryable || retryCount >= maxRetries - 1) {
                    throw error;
                }
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw lastError || new Error('達到最大重試次數');

    } catch (error) {
        return {
            error: (error as Error).message || '分析失敗，請稍後再試',
            level: undefined,
            text: undefined
        };
    }
}

// AI 聊天功能
export async function chatWithAI(
    content: string,
    message: string,
    history: Array<{ text: string; type: 'user' | 'ai' }> = []
): Promise<ChromeResponse> {
    try {

        const { lang, native } = await resolvePageLanguages(content);
        // 對話是針對已經分析過的頁面，判斷不出語言時當成英文
        const prompt = buildChatPrompt(content, message, history, lang ?? 'en', native);

        const { text: aiResponse } = await generateText({
            prompt,
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048
        });

        return {
            response: aiResponse,
            error: undefined
        };

    } catch (error) {
        console.error('聊天錯誤:', error);
        return {
            error: (error as Error).message || '聊天失敗，請稍後再試',
            response: undefined
        };
    }
}

// 分析頁面單字
export async function analyzePageVocabulary(text: string): Promise<ChromeResponse> {
    try {

        const { lang, native } = await resolvePageLanguages(text);
        if (!lang) {
            return { error: UNKNOWN_LANGUAGE_ERROR, vocabulary: undefined };
        }
        const prompt = buildPageVocabularyPrompt(text, lang, native);

        let { text: result } = await generateText({
            prompt,
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 4096,
            json: true
        });

        // 清理和修復 JSON 格式
        function cleanAndFixJSON(jsonString: string): string {
            // 移除可能的 markdown 代碼塊標記
            jsonString = jsonString.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

            // 移除開頭和結尾的非 JSON 字符
            const jsonStart = jsonString.indexOf('{');
            const jsonEnd = jsonString.lastIndexOf('}');

            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
            }

            // 將智慧引號替換為標準雙引號（在字串值之外）
            jsonString = jsonString.replace(/[""]/g, '"').replace(/['']/g, "'");

            // 修復常見的 JSON 格式問題（只處理結構性問題，不破壞字串內容）
            // 移除物件和陣列結尾的多餘逗號（使用更精確的正則）
            jsonString = jsonString
                .replace(/,(\s*[}\]])/g, '$1')  // 移除物件/陣列結尾的多餘逗號
                .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'); // 為未加引號的屬性名添加雙引號

            // 處理未轉義的換行符（在字串值中）
            // 使用狀態機來正確處理字串內的內容
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
                    // 在字串內：轉義未轉義的換行符和製表符
                    if (char === '\n' && prevChar !== '\\') {
                        result += '\\n';
                    } else if (char === '\r' && prevChar !== '\\') {
                        result += '\\r';
                    } else if (char === '\t' && prevChar !== '\\') {
                        result += '\\t';
                    } else {
                        result += char;
                    }
                } else {
                    // 在字串外：正常處理
                    result += char;
                }
            }

            // 修復陣列中缺少的逗號（在字串外）
            const fixArrayCommas = (input: string): string => {
                let output = '';
                let inString = false;
                let escapeNext = false;
                let arrayDepth = 0;
                let lastNonWhitespace = '';

                for (let i = 0; i < input.length; i++) {
                    const char = input[i];
                    const prevChar = i > 0 ? input[i - 1] : '';

                    if (escapeNext) {
                        output += char;
                        escapeNext = false;
                        if (!inString) {
                            lastNonWhitespace = char;
                        }
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
                        }
                        continue;
                    }

                    if (inString) {
                        output += char;
                    } else {
                        // 追蹤陣列深度
                        if (char === '[') {
                            arrayDepth++;
                            output += char;
                            lastNonWhitespace = '[';
                        } else if (char === ']') {
                            arrayDepth--;
                            output += char;
                            lastNonWhitespace = ']';
                        } else if (/\s/.test(char)) {
                            // 空白字符
                            output += char;
                        } else {
                            // 檢查是否需要在陣列元素之間添加逗號
                            if (arrayDepth > 0 && 
                                lastNonWhitespace !== ',' && 
                                lastNonWhitespace !== '[' &&
                                (lastNonWhitespace === '}' || lastNonWhitespace === ']' || lastNonWhitespace === '"') &&
                                (char === '{' || char === '[' || char === '"')) {
                                output += ',';
                            }
                            output += char;
                            lastNonWhitespace = char;
                        }
                    }
                }

                return output;
            };

            result = fixArrayCommas(result);

            return result;
        }

        try {
            // 嘗試直接解析
            const parsedResult: { vocabulary: Word[] } = JSON.parse(result);

            if (!parsedResult.vocabulary || !Array.isArray(parsedResult.vocabulary)) {
                throw new Error('無效的單字分析結果格式');
            }

            // 為每個單字添加時間戳記
            const vocabularyWithTimestamp = parsedResult.vocabulary.map(word => finishWord(word, lang));

            return {
                vocabulary: vocabularyWithTimestamp,
                lang,
                error: undefined
            };

        } catch (parseError) {
            // 如果直接解析失敗，嘗試清理後再解析
            try {
                const cleanedResult = cleanAndFixJSON(result);
                const parsedResult: { vocabulary: Word[] } = JSON.parse(cleanedResult);

                if (!parsedResult.vocabulary || !Array.isArray(parsedResult.vocabulary)) {
                    throw new Error('無效的單字分析結果格式');
                }

                // 為每個單字添加時間戳記
                const vocabularyWithTimestamp = parsedResult.vocabulary.map(word => finishWord(word, lang));

                return {
                    vocabulary: vocabularyWithTimestamp,
                lang,
                    error: undefined
                };

            } catch (secondParseError) {
                // 如果仍然失敗，提供更詳細的錯誤信息
                throw new Error(`JSON 解析失敗。原始回應: ${result.substring(0, 200)}...`);
            }
        }

    } catch (error) {
        return {
            error: (error as Error).message || '單字分析失敗，請稍後再試',
            vocabulary: undefined
        };
    }
} 