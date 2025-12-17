// 語音功能模組
import { textToSpeech, VOICE_OPTIONS, LANGUAGE_OPTIONS, SpeechOptions } from '../audio/geminiSpeech.js';
import { AudioStorage } from '../storage/audioStorage.js';
import * as UI from './ui.js';

const audioStorage = new AudioStorage();

// 初始化語音頁面
export function initializeSpeechPage(): void {
    const generateSpeechButton = document.getElementById('generate-speech') as HTMLButtonElement;
    const speechTextArea = document.getElementById('speech-text') as HTMLTextAreaElement;
    const speechAudio = document.getElementById('speech-audio') as HTMLAudioElement;
    const speechResult = document.getElementById('speech-result') as HTMLDivElement;
    const errorMessage = document.getElementById('error-message') as HTMLDivElement;
    
    if (!generateSpeechButton || !speechTextArea || !speechAudio || !speechResult || !errorMessage) {
        console.error('語音頁面元素未找到');
        return;
    }
    
    // 讓音頻播放器初始不可見
    speechAudio.style.display = 'none';
    
    // 初始化語音設定值
    let currentVoice = VOICE_OPTIONS.PUCK;
    let currentLanguage = LANGUAGE_OPTIONS.ENGLISH;
    let currentSpeed = 1.0;
    let currentPitch = 1.0;
    
    // 加載已保存的設定
    loadSettings();
    
    // 生成語音按鈕點擊事件
    generateSpeechButton.addEventListener('click', async (): Promise<void> => {
        const text = speechTextArea.value.trim();
        if (!text) {
            showError('請輸入要轉換為語音的文字');
            return;
        }
        
        try {
            errorMessage.style.display = 'none';
            generateSpeechButton.disabled = true;
            generateSpeechButton.textContent = '生成中...';
            
            // 創建語音快取的鍵值
            const speechKey = `${text}_${currentVoice}_${currentLanguage}_${currentSpeed}_${currentPitch}`;
            
            // 檢查是否有快取
            const cachedAudio = await audioStorage.getAudio(speechKey);
            if (cachedAudio) {
                console.log('使用快取的語音');
                playAudio(cachedAudio);
                return;
            }
            
            // 直接從 Chrome Storage 獲取 API Key
            const { apiKey } = await chrome.storage.local.get('apiKey');
            if (!apiKey) {
                showError('請先在設定頁面設定 API Key');
                return;
            }
            
            const apiKeyString = typeof apiKey === 'string' ? apiKey : '';
            console.log('開始生成語音，API Key 前5位：', apiKeyString.substring(0, 5));
            
            // 設置語音選項
            const options: SpeechOptions = {
                voice: currentVoice,
                language: currentLanguage,
                speakingRate: currentSpeed,
                pitch: currentPitch
            };
            
            // 生成語音
            const audioData = await textToSpeech('請念出這段話(不要說其他多餘的話):' + text, apiKeyString, options);
            if (!audioData) {
                showError('無法生成語音，請稍後再試');
                return;
            }
            
            // 保存到快取
            await audioStorage.saveAudio(speechKey, audioData);
            
            // 播放語音
            playAudio(audioData);
        } catch (error) {
            console.error('語音生成錯誤:', error);
            showError('語音生成時發生錯誤: ' + (error as Error).message);
        } finally {
            generateSpeechButton.disabled = false;
            generateSpeechButton.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg> 生成語音';
        }
    });
    
    // 為選項控制元素添加事件監聽器
    const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
    if (voiceSelect) {
        voiceSelect.addEventListener('change', (e) => {
            currentVoice = (e.target as HTMLSelectElement).value;
            saveSettings();
        });
    }
    
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    if (languageSelect) {
        languageSelect.addEventListener('change', (e) => {
            currentLanguage = (e.target as HTMLSelectElement).value;
            saveSettings();
        });
    }
    
    const speedRange = document.getElementById('speed-range') as HTMLInputElement;
    if (speedRange) {
        speedRange.addEventListener('input', (e) => {
            currentSpeed = parseFloat((e.target as HTMLInputElement).value);
            const speedValue = document.getElementById('speed-value');
            if (speedValue) {
                speedValue.textContent = currentSpeed.toFixed(1);
            }
            saveSettings();
        });
    }
    
    const pitchRange = document.getElementById('pitch-range') as HTMLInputElement;
    if (pitchRange) {
        pitchRange.addEventListener('input', (e) => {
            currentPitch = parseFloat((e.target as HTMLInputElement).value);
            const pitchValue = document.getElementById('pitch-value');
            if (pitchValue) {
                pitchValue.textContent = currentPitch.toFixed(1);
            }
            saveSettings();
        });
    }
    
    // 播放音頻
    function playAudio(audioData: ArrayBuffer) {
        const blob = new Blob([audioData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        speechAudio.src = url;
        speechAudio.style.display = 'block';
        speechResult.style.display = 'block';
        
        speechAudio.play().catch(error => {
            console.error('音頻播放錯誤:', error);
            showError('無法播放音頻: ' + error.message);
        });
        
        // 釋放資源
        speechAudio.onended = () => {
            URL.revokeObjectURL(url);
        };
    }
    
    // 顯示錯誤訊息
    function showError(message: string) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        generateSpeechButton.disabled = false;
        generateSpeechButton.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg> 生成語音';
    }
    
    // 保存設置到 localStorage
    function saveSettings() {
        const settings = {
            voice: currentVoice,
            language: currentLanguage,
            speed: currentSpeed,
            pitch: currentPitch
        };
        
        localStorage.setItem('speechSettings', JSON.stringify(settings));
    }
    
    // 加載已保存的設置
    function loadSettings() {
        const savedSettings = localStorage.getItem('speechSettings');
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                currentVoice = settings.voice || VOICE_OPTIONS.PUCK;
                currentLanguage = settings.language || LANGUAGE_OPTIONS.ENGLISH;
                currentSpeed = settings.speed || 1.0;
                currentPitch = settings.pitch || 1.0;
                
                // 更新 UI
                const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
                if (voiceSelect) {
                    voiceSelect.value = currentVoice;
                }
                
                const langSelect = document.getElementById('language-select') as HTMLSelectElement;
                if (langSelect) {
                    langSelect.value = currentLanguage;
                }
                
                const speedRange = document.getElementById('speed-range') as HTMLInputElement;
                if (speedRange) {
                    speedRange.value = currentSpeed.toString();
                    const speedValue = document.getElementById('speed-value');
                    if (speedValue) {
                        speedValue.textContent = currentSpeed.toFixed(1);
                    }
                }
                
                const pitchRange = document.getElementById('pitch-range') as HTMLInputElement;
                if (pitchRange) {
                    pitchRange.value = currentPitch.toString();
                    const pitchValue = document.getElementById('pitch-value');
                    if (pitchValue) {
                        pitchValue.textContent = currentPitch.toFixed(1);
                    }
                }
            } catch (error) {
                console.error('無法加載語音設置:', error);
            }
        }
    }
} 