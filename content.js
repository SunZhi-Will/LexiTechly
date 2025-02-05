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
        analyzeContent(content, request.apiKey).then(result => {
            console.log('Analysis result:', result);
            sendResponse(result);
        });
        return true; // 保持連接開啟
    } else if (request.action === 'chat') {
        const content = getPageContent();
        chatWithAI(content, request.message, request.apiKey, request.history).then(result => {
            sendResponse(result);
        });
        return true;
    }
});

async function analyzeContent(content, apiKey) {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    try {
        // 檢查文本是否為英文
        const isEnglish = checkIfEnglish(content);
        if (!isEnglish) {
            return {
                error: '此頁面似乎不是英文內容。請選擇英文文章進行分析。'
            };
        }

        const prompt = `
            你是一個英文程度分析專家。請分析以下英文文本的難度等級。
            請使用 JSON 格式回應，格式如下：
            {
                "level": "B2",  // 必須是 A1、A2、B1、B2、C1、C2 其中之一
                "analysis": {
                    "vocabulary": "詞彙：簡短的難度說明",  // 20字以內
                    "grammar": "語法：簡短的結構說明",     // 20字以內
                    "topic": "主題：簡短的難度說明"        // 20字以內
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

            請只回傳 JSON 格式的分析結果，不要有其他說明文字。
        `;

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

        // 解析 JSON 回應
        const analysisResult = JSON.parse(result);
        console.log('Parsed result:', analysisResult);

        if (!analysisResult.level || !analysisResult.analysis) {
            throw new Error('回應格式不正確');
        }

        if (!['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(analysisResult.level)) {
            throw new Error(`無效的 CEFR 等級: ${analysisResult.level}`);
        }

        // 直接返回解析後的結果
        return {
            level: analysisResult,
            error: null
        };
    } catch (error) {
        console.error('分析錯誤:', error);
        return {
            error: error.message || '無法分析內容'
        };
    }
}

// 檢查文本是否為英文
function checkIfEnglish(text) {
    // 移除標點符號和數字
    const cleanText = text.replace(/[0-9\.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

    // 取得前 100 個單詞進行檢查
    const words = cleanText.split(/\s+/).slice(0, 100);

    // 計算英文單詞的比例
    const englishWords = words.filter(word => {
        // 檢查是否主要由英文字母組成
        return /^[a-zA-Z]+$/.test(word);
    });

    // 如果英文單詞比例低於 60%，判定為非英文內容
    return (englishWords.length / words.length) > 0.6;
}

// 新增 AI 對話函數
async function chatWithAI(content, message, apiKey, history = []) {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    const prompt = `
        你現在是一個英語學習助手，請根據以下文本內容回答問題。
        回答時請使用中文，並使用 Markdown 格式，可以：
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
    `;

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
        console.error('Chat API 錯誤:', error);
        return {
            reply: null,
            error: error.message || '無法取得回應'
        };
    }
} 