/// <reference types="chrome"/>

import { audioCache, cacheAudioData } from './storage.js';
import { showToast } from './ui.js';

// 全域音訊變數
let currentAudio: HTMLAudioElement | null = null;
let lastPlayedText: string | null = null;
let lastPlayedSpeed: 'slow' | 'normal' | 'fast' = 'normal';

// 發音按鈕的 HTML 模板
export function getSpeakButtonHTML(size: 'small' | 'normal' = 'normal'): string {
    return `
        <svg class="play-icon" viewBox="0 0 24 24" width="${size === 'small' ? '16' : '20'}" height="${size === 'small' ? '16' : '20'}">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
        <svg class="stop-icon" viewBox="0 0 24 24" width="${size === 'small' ? '16' : '20'}" height="${size === 'small' ? '16' : '20'}">
            <path d="M6 6h12v12H6z"/>
        </svg>
    `;
}

// 語音功能
export async function speakWord(text: string, button?: HTMLElement): Promise<void> {
    try {
        if (button && button.classList.contains('loading')) {
            return;
        }

        if (currentAudio && button?.classList.contains('playing')) {
            currentAudio.pause();
            currentAudio = null;
            button.classList.remove('playing');
            return;
        }

        document.querySelectorAll('.speak-btn').forEach(btn => {
            btn.classList.remove('playing');
        });

        const isRepeating = text === lastPlayedText;
        const speed = isRepeating && lastPlayedSpeed === 'normal' ? 'slow' : 'normal';
        lastPlayedText = text;
        lastPlayedSpeed = speed;

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        if (button) {
            button.classList.add('loading');
            if (speed === 'slow') {
                button.classList.add('slow');
            }
            (button as HTMLButtonElement).disabled = true;
        }

        try {
            if (audioCache[text]) {
                currentAudio = new Audio(audioCache[text]);
            } else {
                const { speechifyApiKey }: { speechifyApiKey?: string } = await chrome.storage.local.get('speechifyApiKey');
                if (!speechifyApiKey) {
                    throw new Error('請先在設定頁面設定語音 API Key');
                }

                const response = await fetch('https://api.sws.speechify.com/v1/audio/speech', {
                    method: 'POST',
                    headers: {
                        'accept': '*/*',
                        'content-type': 'application/json',
                        'Authorization': `Bearer ${speechifyApiKey}`
                    },
                    body: JSON.stringify({
                        voice_id: 'henry',
                        input: text,
                        output_format: 'mp3'
                    })
                });

                if (!response.ok) {
                    throw new Error('語音 API 請求失敗');
                }

                const data = await response.json();
                if (!data.audio_data) {
                    throw new Error('未收到音訊資料');
                }

                const audioBlob = await fetch(`data:audio/mp3;base64,${data.audio_data}`).then(r => r.blob());
                const audioUrl = URL.createObjectURL(audioBlob);
                audioCache[text] = audioUrl;
                currentAudio = new Audio(audioUrl);

                const cacheSuccess = await cacheAudioData(text, data.audio_data);
                if (!cacheSuccess) {
                    console.warn('儲存空間不足，語音將不會被快取');
                }
            }

            if (currentAudio) {
                currentAudio.playbackRate = speed === 'slow' ? 0.7 : 1.0;

                if (button) {
                    button.classList.add('playing');
                }

                currentAudio.addEventListener('ended', () => {
                    if (button) {
                        button.classList.remove('playing');
                    }
                    currentAudio = null;
                });

                currentAudio.addEventListener('error', () => {
                    if (button) {
                        button.classList.remove('playing');
                    }
                    currentAudio = null;
                });

                await currentAudio.play();
            }

        } catch (apiError) {
            console.warn('Speechify API 失敗，使用備用語音:', apiError);
            await fallbackSpeak(text, button, speed);
        } finally {
            if (button) {
                button.classList.remove('loading');
                button.classList.remove('slow');
                (button as HTMLButtonElement).disabled = false;
            }
        }

    } catch (error) {
        console.error('語音播放失敗:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        showToast(`語音播放失敗: ${errorMessage}`, false, true);
        if (button) {
            button.classList.remove('loading', 'playing');
            (button as HTMLButtonElement).disabled = false;
        }
    }
}

// 備用語音功能
async function fallbackSpeak(text: string, button?: HTMLElement, speed: 'slow' | 'normal' | 'fast' = 'normal'): Promise<void> {
    if (button?.classList.contains('playing')) {
        window.speechSynthesis.cancel();
        button.classList.remove('playing');
        return;
    }

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    window.speechSynthesis.cancel();

    return new Promise(async (resolve) => {
        try {
            let voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) {
                await new Promise<void>(resolveVoices => {
                    window.speechSynthesis.onvoiceschanged = () => {
                        voices = window.speechSynthesis.getVoices();
                        resolveVoices();
                    };
                });
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = speed === 'slow' ? 0.5 : 1;

            const englishVoice = voices.find(voice =>
                voice.lang.includes('en') && voice.name.includes('Female')
            ) || voices.find(voice =>
                voice.lang.includes('en')
            );

            if (englishVoice) {
                utterance.voice = englishVoice;
            }

            if (button) {
                button.classList.remove('loading');
                button.classList.add('playing');
                (button as HTMLButtonElement).disabled = false;
            }

            utterance.onend = () => {
                if (button) {
                    button.classList.remove('playing');
                    (button as HTMLButtonElement).disabled = false;
                }
                window.speechSynthesis.cancel();
                resolve();
            };

            utterance.onerror = () => {
                if (button) {
                    button.classList.remove('playing');
                    (button as HTMLButtonElement).disabled = false;
                }
                window.speechSynthesis.cancel();
                resolve();
            };

            window.speechSynthesis.speak(utterance);

        } catch (error) {
            if (button) {
                button.classList.remove('loading', 'playing');
                (button as HTMLButtonElement).disabled = false;
            }
            window.speechSynthesis.cancel();
            resolve();
        }
    });
} 