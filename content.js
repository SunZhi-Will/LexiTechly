// 確認 content script 已載入
console.log('Content script loaded');

function getPageContent() {
    // 獲取主要文章內容
    const article = document.querySelector('article') || document.body;
    const text = article.innerText;
    return text;
}

// 監聽來自 popup 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received:', request);

    if (request.action === 'analyze') {
        const content = getPageContent();

        // 檢查是否為英文內容
        if (!checkIfEnglish(content)) {
            sendResponse({
                error: '此頁面似乎不是英文內容。請選擇英文文章進行分析。',
                level: null,
                text: null
            });
            return true;
        }

        analyzeContent(content, request.apiKey).then(result => {
            console.log('Analysis result:', result);
            sendResponse(result);
        });
        return true;
    } else if (request.action === 'chat') {
        const content = getPageContent();
        chatWithAI(content, request.message, request.apiKey, request.history).then(result => {
            sendResponse(result);
        });
        return true;
    }
});

async function analyzeContent(content, apiKey) {
    try {
        // 檢查文本是否為英文
        if (!checkIfEnglish(content)) {
            return {
                error: '此頁面似乎不是英文內容。請選擇英文文章進行分析。',
                level: null,
                text: null
            };
        }

        const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
        const maxRetries = 3;
        let retryCount = 0;
        let lastError;

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
                const response = await fetch(`${API_URL}?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
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
                    })
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

                const data = await response.json();
                console.log('API Response:', data);

                if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                    throw new Error('無效的 API 回應格式');
                }

                const result = data.candidates[0].content.parts[0].text.trim();
                console.log('Raw result:', result);

                // 解析 JSON 回應並進行格式驗證
                let analysisResult;
                try {
                    analysisResult = JSON.parse(result);
                    console.log('Parsed result:', analysisResult);

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

                    const requiredFields = ['vocabulary', 'grammar', 'topic'];
                    for (const field of requiredFields) {
                        if (!analysisResult.analysis[field] || typeof analysisResult.analysis[field] !== 'string') {
                            throw new Error(`分析結果缺少有效的 ${field} 屬性`);
                        }
                    }

                    if (!['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(analysisResult.level)) {
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
                        error: null
                    };

                } catch (parseError) {
                    console.error('JSON 解析錯誤:', parseError);
                    console.error('原始回應:', result);
                    throw new Error('無法解析 API 回應: ' + parseError.message);
                }
            } catch (error) {
                lastError = error;
                if (retryCount >= maxRetries - 1) {
                    throw error;
                }
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw lastError || new Error('達到最大重試次數');

    } catch (error) {
        console.error('分析錯誤:', error);
        return {
            error: error.message === 'HTTP error! status: 429'
                ? '系統暫時忙碌,請稍後再試'
                : error.message === 'NOT_ENGLISH'
                    ? '此頁面似乎不是英文內容。請選擇英文文章進行分析。'
                    : (error.message || '無法分析內容'),
            level: null,
            text: null
        };
    }
}

// 改進檢查英文內容的函數
function checkIfEnglish(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    // 移除標點符號、數字和特殊字符
    const cleanText = text.replace(/[0-9\.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

    // 取得前 200 個單詞進行檢查（增加樣本量）
    const words = cleanText.split(/\s+/).slice(0, 200);

    if (words.length < 10) { // 如果文本太短
        return false;
    }

    // 計算英文單詞的比例
    const englishWords = words.filter(word => {
        // 檢查是否主要由英文字母組成，且長度至少為 1
        return word.length > 0 && /^[a-zA-Z]+$/.test(word);
    });

    // 計算英文單詞的比例
    const englishRatio = englishWords.length / words.length;
    console.log('English ratio:', englishRatio);

    // 如果英文單詞比例低於 50%，判定為非英文內容
    return englishRatio > 0.5;
}

// 新增 AI 對話函數
async function chatWithAI(content, message, apiKey, history = []) {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    const maxRetries = 3;
    let retryCount = 0;
    let lastError;

    const prompt = `
        你現在是一個英語學習助手，請根據以下文本內容回答問題。
        回答時請使用繁體中文，並使用 Markdown 格式，可以：
        1. 使用 \`code\` 標記重要的英文單字或片語
        2. 使用引用區塊 > 來標記例句
        3. 使用清單列舉重點
        4. 使用粗體或斜體強調重要內容
        5. 使用代碼區塊顯示較長的例句或解釋

        文本內容：
        ---
        ${content}
        ---

        歷史對話：
        ${history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

        問題：${message}

        請提供清晰且結構化的回答，善用 Markdown 格式來提高可讀性。
        請確保所有回答都使用繁體中文。
    `;

    while (retryCount < maxRetries) {
        try {
            const response = await fetch(`${API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
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
                        maxOutputTokens: 1024
                    }
                })
            });

            if (response.status === 429) {
                const waitTime = Math.pow(2, retryCount) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                retryCount++;
                continue;
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Chat API Response:', data);

            if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('無效的 API 回應格式');
            }

            const reply = data.candidates[0].content.parts[0].text.trim();
            console.log('Chat reply:', reply);

            if (!reply) {
                throw new Error('回應內容為空');
            }

            return {
                reply: reply,
                error: null
            };
        } catch (error) {
            lastError = error;
            if (retryCount >= maxRetries - 1) {
                throw error;
            }
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    throw lastError || new Error('達到最大重試次數');
} 