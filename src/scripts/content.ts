/// <reference types="chrome"/>

export { }; // 使此檔案成為模組

function getPageContent(): string {
    // 獲取主要文章內容
    const article = document.querySelector('article') || document.body;
    const text = article.innerText;
    return text;
}

// 監聽來自 popup 的訊息
chrome.runtime.onMessage.addListener((
    request: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ChromeResponse) => void
): boolean => {

    if (request.action === 'analyze') {
        const content = getPageContent();

        // 檢查是否為英文內容
        if (!checkIfEnglish(content)) {
            sendResponse({
                error: '此頁面似乎不是英文內容。請選擇英文文章進行分析。',
                level: undefined,
                text: undefined
            });
            return true;
        }

        if (!request.apiKey) {
            sendResponse({
                error: 'API Key 未提供'
            });
            return true;
        }

        analyzeContent(content, request.apiKey).then(result => {
            // console.log('Analysis result:', result);
            sendResponse(result);
        }).catch(error => {
            sendResponse({
                error: error.message || '分析失敗'
            });
        });
        return true;
    } else if (request.action === 'chat') {
        const content = getPageContent();

        if (!request.apiKey || !request.message) {
            sendResponse({
                error: 'API Key 或訊息未提供'
            });
            return true;
        }

        chatWithAI(content, request.message, request.apiKey, request.history || []).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({
                error: error.message || '聊天失敗'
            });
        });
        return true;
    } else if (request.action === 'analyzeVocabulary') {
        const content = getPageContent();

        if (!request.apiKey) {
            sendResponse({
                error: 'API Key 未提供'
            });
            return true;
        }

        analyzePageVocabulary(content, request.apiKey).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({
                error: error.message || '單字分析失敗'
            });
        });
        return true;
    }

    return false;
});

async function analyzeContent(content: string, apiKey: string): Promise<ChromeResponse> {
    try {
        // 檢查文本是否為英文
        if (!checkIfEnglish(content)) {
            return {
                error: '此頁面似乎不是英文內容。請選擇英文文章進行分析。',
                level: undefined,
                text: undefined
            };
        }

        const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
        const maxRetries = 3;
        let retryCount = 0;
        let lastError: Error | undefined;

        const prompt = `
        你是一個英文程度分析專家。請分析以下英文文本的難度等級。
        請使用 JSON 格式回應，格式如下：
        {
            "level": "B2",  // 必須是 A1、A2、B1、B2、C1、C2 其中之一
            "analysis": {
                "vocabulary": "簡短的難度說明",  // 20字以內
                "grammar": "簡短的結構說明",     // 20字以內
                "topic": "簡短的難度說明"        // 20字以內
            }
        }

        分析重點：
        1. 詞彙：單字難度和專業術語比例
        2. 語法：句型複雜度和時態使用
        3. 主題：內容專業程度

        文本內容：
        ---
        ${content}
        ---

        請注意：
        1. 只回傳 JSON 格式的分析結果，不要有其他說明文字
        2. 所有說明文字必須使用繁體中文
        3. 分析內容要簡潔有力，每項不超過20個字
    `;

        while (retryCount < maxRetries) {
            try {
                const requestBody: GeminiRequest = {
                    contents: [{
                        role: "user",
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 1,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 8192,
                        responseMimeType: "application/json"
                    }
                };

                const response = await fetch(`${API_URL}?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });

                if (response.status === 429) {
                    // 如果遇到限制,等待一段時間後重試
                    const waitTime = Math.pow(2, retryCount) * 1000; // 指數退避
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retryCount++;
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data: GeminiResponse = await response.json();

                if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
                    throw new Error('無效的 API 回應格式');
                }

                const result = data.candidates[0].content.parts[0].text.trim();

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
                    jsonString = jsonString.replace(/```json\s*/g, '').replace(/```\s*/g, '');

                    // 移除開頭和結尾的非 JSON 字符
                    const jsonStart = jsonString.indexOf('{');
                    const jsonEnd = jsonString.lastIndexOf('}');

                    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                        jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
                    }

                    // 修復常見的 JSON 格式問題
                    jsonString = jsonString
                        .replace(/,\s*}/g, '}')  // 移除物件結尾的多餘逗號
                        .replace(/,\s*]/g, ']')  // 移除陣列結尾的多餘逗號
                        .replace(/'/g, '"')      // 將單引號替換為雙引號
                        .replace(/(\w+):/g, '"$1":'); // 為屬性名添加雙引號

                    return jsonString;
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

                const validLevels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
                if (!validLevels.includes(analysisResult.level)) {
                    throw new Error(`無效的 CEFR 等級: ${analysisResult.level}`);
                }

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
                if (retryCount >= maxRetries - 1) {
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

function checkIfEnglish(text: string): boolean {
    // 移除標點符號和數字
    const cleanText = text.replace(/[^\p{L}\s]/gu, '');

    // 計算英文字母的比例
    const englishChars = cleanText.match(/[a-zA-Z]/g);
    const totalChars = cleanText.replace(/\s/g, '');

    if (!englishChars || totalChars.length === 0) {
        return false;
    }

    const englishRatio = englishChars.length / totalChars.length;

    // 如果英文字母比例超過 70%，認為是英文內容
    return englishRatio > 0.7;
}

async function chatWithAI(
    content: string,
    message: string,
    apiKey: string,
    history: Array<{ text: string; type: 'user' | 'ai' }> = []
): Promise<ChromeResponse> {
    try {
        const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

        // 建構對話歷史
        const conversationHistory = history.map(msg =>
            `${msg.type === 'user' ? '使用者' : 'AI'}：${msg.text}`
        ).join('\n');

        const prompt = `
        你是一個英文學習助手。基於以下英文文章內容，回答使用者的問題。
        請用繁體中文回答，並提供實用的英文學習建議。

        文章內容：
        ---
        ${content}
        ---

        ${conversationHistory ? `對話歷史：\n${conversationHistory}\n` : ''}

        使用者問題：${message}

        請提供詳細且有幫助的回答，包括：
        1. 直接回答問題
        2. 相關的英文學習要點
        3. 實用的例句或說明
    `;

        const requestBody: GeminiRequest = {
            contents: [{
                role: "user",
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048
            }
        };

        const response = await fetch(`${API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: GeminiResponse = await response.json();

        if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
            throw new Error('無效的 API 回應格式');
        }

        const aiResponse = data.candidates[0].content.parts[0].text.trim();

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

async function analyzePageVocabulary(text: string, apiKey: string): Promise<ChromeResponse> {
    try {
        const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

        const prompt = `
        請分析以下英文文本中的重要單字，並提供詳細資訊。
        請以 JSON 格式回應，包含最多 20 個重要單字：

        {
            "vocabulary": [
                {
                    "text": "單字",
                    "level": "CEFR等級(A1-C2)",
                    "translation": "中文翻譯",
                    "example": "例句",
                    "phonetic": "音標(可選)"
                }
            ]
        }

        分析重點：
        1. 選擇對學習者有價值的單字
        2. 避免過於簡單的基礎單字
        3. 提供準確的 CEFR 等級
        4. 翻譯使用繁體中文
        5. 確保回應是有效的 JSON 格式

        文本內容：
        ---
        ${text}
        ---

        重要：請只回傳有效的 JSON 格式，不要有其他說明文字或註解。
    `;

        const requestBody: GeminiRequest = {
            contents: [{
                role: "user",
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.3,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 4096,
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(`${API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: GeminiResponse = await response.json();

        if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
            throw new Error('無效的 API 回應格式');
        }

        let result = data.candidates[0].content.parts[0].text.trim();

        // 清理和修復 JSON 格式
        function cleanAndFixJSON(jsonString: string): string {
            // 移除可能的 markdown 代碼塊標記
            jsonString = jsonString.replace(/```json\s*/g, '').replace(/```\s*/g, '');

            // 移除開頭和結尾的非 JSON 字符
            const jsonStart = jsonString.indexOf('{');
            const jsonEnd = jsonString.lastIndexOf('}');

            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
            }

            // 修復常見的 JSON 格式問題
            jsonString = jsonString
                .replace(/,\s*}/g, '}')  // 移除物件結尾的多餘逗號
                .replace(/,\s*]/g, ']')  // 移除陣列結尾的多餘逗號
                .replace(/'/g, '"')      // 將單引號替換為雙引號
                .replace(/(\w+):/g, '"$1":'); // 為屬性名添加雙引號

            return jsonString;
        }

        try {
            // 嘗試直接解析
            const parsedResult: { vocabulary: Word[] } = JSON.parse(result);

            if (!parsedResult.vocabulary || !Array.isArray(parsedResult.vocabulary)) {
                throw new Error('無效的單字分析結果格式');
            }

            // 為每個單字添加時間戳記
            const vocabularyWithTimestamp = parsedResult.vocabulary.map(word => ({
                ...word,
                addedTime: Date.now()
            }));

            return {
                vocabulary: vocabularyWithTimestamp,
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
                const vocabularyWithTimestamp = parsedResult.vocabulary.map(word => ({
                    ...word,
                    addedTime: Date.now()
                }));

                return {
                    vocabulary: vocabularyWithTimestamp,
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