/// <reference types="chrome"/>

import { audioCache, cacheAudioData } from './storage.js';
import { showToast } from './ui.js';
import { textToSpeech, VOICE_OPTIONS, LANGUAGE_OPTIONS } from '../audio/geminiSpeech.js';

// 全域音訊變數
let currentAudio: HTMLAudioElement | null = null;
let lastPlayedText: string | null = null;
let lastPlayedSpeed: 'slow' | 'normal' | 'fast' = 'normal';

// 發音按鈕的 HTML 模板 - 使用更好看的播放圖示
export function getSpeakButtonHTML(size: 'small' | 'normal' | 'tiny' = 'normal'): string {
    let width, height;
    
    if (size === 'tiny') {
        width = 10;
        height = 10;
    } else if (size === 'small') {
        width = 14;
        height = 14;
    } else {
        width = 20;
        height = 20;
    }
    
    return `
        <svg class="play-icon" viewBox="0 0 24 24" width="${width}" height="${height}">
            <path d="M8 5v14l11-7z"/>
        </svg>
        <svg class="stop-icon" viewBox="0 0 24 24" width="${width}" height="${height}">
            <path d="M6 6h12v12H6z"/>
        </svg>
    `;
}

// 同步所有相同文字的按鈕狀態
function syncButtonStates(text: string, isPlaying: boolean, isLoading: boolean = false): void {
    // 找到所有相關的按鈕，包括沒有 data-text 屬性的按鈕
    const buttons = Array.from(document.querySelectorAll('.speak-btn')).filter(btn => {
        const button = btn as HTMLElement;
        return button.dataset.text === text || (!button.dataset.text && button.closest('.word-title-container')?.querySelector('.word-title')?.textContent === text);
    });

    buttons.forEach(btn => {
        const button = btn as HTMLElement;
        if (isPlaying) {
            button.classList.add('playing');
        } else {
            button.classList.remove('playing');
        }
        button.classList.toggle('loading', isLoading);
        (button as HTMLButtonElement).disabled = isLoading;
    });
}

/**
 * 語音播放功能 - 使用 Gemini API 優先，失敗時使用瀏覽器內建 TTS
 * @param text 要播放的文字
 * @param button 播放按鈕元素
 */
export async function speakWord(text: string, button?: HTMLElement): Promise<void> {
    try {
        // 防止重複觸發
        if (button && button.classList.contains('loading')) {
            return;
        }

        // 如果當前正在播放，停止播放
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
            syncButtonStates(text, false);
            return;
        }

        // 設定播放速度
        const isRepeating = text === lastPlayedText;
        const speed = isRepeating && lastPlayedSpeed === 'normal' ? 'slow' : 'normal';
        lastPlayedText = text;
        lastPlayedSpeed = speed;

        // 設置所有相同文字的按鈕為載入狀態
        syncButtonStates(text, true, true);

        // 先檢查快取中是否已有此語音
        if (audioCache[text]) {
            currentAudio = new Audio(audioCache[text]);
            await setupAndPlayAudio(currentAudio, speed, text);
            return;
        }

        // 如果快取中沒有，嘗試獲取並播放音頻
        await playAudio(text, speed, button);

    } catch (error) {
        console.error('語音播放失敗:', error);
        let errorMessage = '語音播放失敗: ';
        if (error instanceof DOMException) {
            if (error.name === 'NotAllowedError') {
                errorMessage += '瀏覽器阻擋自動播放，請用戶點擊觸發語音。';
            } else if (error.name === 'NotSupportedError') {
                errorMessage += '音訊格式不支援，請聯絡開發者。';
            } else {
                errorMessage += '瀏覽器安全限制或 CORS 問題，請檢查 API 回應與網路環境。';
            }
        } else if (typeof error === 'object' && error && 'message' in error) {
            const msg = String((error as any).message);
            if (msg.includes('API Key')) {
                errorMessage += 'API 金鑰錯誤或權限不足，請重新設定。';
            } else if (msg.includes('CORS')) {
                errorMessage += 'CORS 限制，請改用後端代理呼叫 Gemini API。';
            } else {
                errorMessage += msg;
            }
        } else {
            errorMessage += '未知錯誤';
        }
        showToast(errorMessage, false, true);
        // 重置所有相同文字的按鈕狀態
        syncButtonStates(text, false, false);
    }
}

/**
 * 音頻播放實現 - 包含多層降級策略
 */
async function playAudio(text: string, speed: 'slow' | 'normal' | 'fast', button?: HTMLElement): Promise<void> {
    try {
        // 嘗試使用 Gemini 語音 API
        const { apiKey }: { apiKey?: string } = await chrome.storage.local.get('apiKey');
        if (apiKey) {
            try {
                // 獲取語音設定
                const speechSettings = localStorage.getItem('speechSettings');
                const settings = speechSettings ? JSON.parse(speechSettings) : {
                    voice: VOICE_OPTIONS.PUCK,
                    language: LANGUAGE_OPTIONS.ENGLISH,
                    speed: 1.0,
                    pitch: 1.0
                };
                
                // 使用 Gemini 語音 API - 添加特殊指令優化輸出
                const audioData = await textToSpeech('請念出這段話(不要說其他多餘的話):' + text, apiKey, {
                    voice: settings.voice,
                    language: settings.language,
                    speakingRate: settings.speed,
                    pitch: settings.pitch
                });
                
                if (audioData) {
                    // 新增：檢查瀏覽器是否支援 audio/wav
                    const canPlayWav = (new Audio()).canPlayType('audio/wav');
                    if (!canPlayWav) {
                        showToast('瀏覽器不支援 WAV 格式音訊，請改用 Chrome/Edge 或聯絡開發者。', false, true);
                        syncButtonStates(text, false, false);
                        return;
                    }
                    const blob = new Blob([audioData], { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(blob);
                    // 下載按鈕
                    showDownloadButton(blob, text);
                    
                    // 轉換並儲存到快取
                    const audioBase64 = await blobToBase64(blob);
                    audioCache[text] = audioUrl;
                    currentAudio = new Audio(audioUrl);
                    
                    // 儲存到快取
                    const cacheSuccess = await cacheAudioData(text, audioBase64);
                    if (!cacheSuccess) {
                        console.warn('儲存空間不足，語音將不會被快取');
                    }
                    
                    await setupAndPlayAudio(currentAudio, speed, text);
                    return;
                }
            } catch (geminiError) {
                console.warn('Gemini 語音 API 失敗，使用瀏覽器內建語音:', geminiError);
            }
        }

        // 如果 Gemini API 失敗，使用瀏覽器內建語音
        console.warn('Gemini 語音 API 失敗，使用瀏覽器內建語音');
        await fallbackSpeak(text, text, speed);
    } catch (error) {
        throw error;
    }
}

/**
 * 設置音頻事件監聽並播放
 */
async function setupAndPlayAudio(audio: HTMLAudioElement, speed: 'slow' | 'normal' | 'fast', text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            // 設定播放速度
            audio.playbackRate = speed === 'slow' ? 0.7 : speed === 'fast' ? 1.3 : 1;

            // 播放結束時的處理
            audio.onended = () => {
                syncButtonStates(text, false);
                currentAudio = null;
                resolve();
            };

            // 播放錯誤處理
            audio.onerror = (e) => {
                console.error('音頻播放錯誤:', e);
                syncButtonStates(text, false);
                currentAudio = null;
                reject(new Error('音頻播放失敗'));
            };

            // 開始播放
            audio.play().then(() => {
                syncButtonStates(text, true);
            }).catch(error => {
                console.error('播放失敗:', error);
                syncButtonStates(text, false);
                currentAudio = null;
                reject(error);
            });
        } catch (error) {
            syncButtonStates(text, false);
            currentAudio = null;
            reject(error);
        }
    });
}

/**
 * 將 Blob 轉換為 base64 字串，用於儲存
 */
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            // 移除 data:audio/wav;base64, 前綴
            const base64Data = base64String.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * 降級使用瀏覽器內建語音
 */
async function fallbackSpeak(text: string, displayText: string, speed: 'slow' | 'normal' | 'fast' = 'normal'): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = speed === 'slow' ? 0.7 : speed === 'fast' ? 1.3 : 1;
            utterance.lang = 'en-US';

            utterance.onend = () => {
                syncButtonStates(displayText, false);
                resolve();
            };

            utterance.onerror = (event) => {
                console.error('語音合成錯誤:', event);
                syncButtonStates(displayText, false);
                reject(new Error('瀏覽器語音合成失敗'));
            };

            syncButtonStates(displayText, true);
            speechSynthesis.speak(utterance);
        } catch (error) {
            syncButtonStates(displayText, false);
            reject(error);
        }
    });
} 

// 新增：語音下載功能
function showDownloadButton(blob: Blob, text: string) {
    // 移除舊的下載按鈕
    document.querySelectorAll('.lexi-tts-download').forEach(btn => btn.remove());
    // 建立新按鈕
    const downloadBtn = document.createElement('a');
    downloadBtn.className = 'lexi-tts-download';
    downloadBtn.textContent = '下載語音';
    downloadBtn.style.marginLeft = '8px';
    downloadBtn.style.fontSize = '12px';
    downloadBtn.style.color = '#1a73e8';
    downloadBtn.style.cursor = 'pointer';
    downloadBtn.style.textDecoration = 'underline';
    downloadBtn.download = `${text.slice(0, 10)}.wav`;
    downloadBtn.href = URL.createObjectURL(blob);
    // 插入到第一個 .speak-btn 後面
    const btn = document.querySelector('.speak-btn');
    if (btn && btn.parentElement) {
        btn.parentElement.appendChild(downloadBtn);
    }
} 