// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node
import {
  GoogleGenAI,
  LiveServerMessage,
  MediaResolution,
  Modality,
  Session,
} from '@google/genai';

const responseQueue: LiveServerMessage[] = [];
let session: Session | undefined = undefined;
let detectedSampleRate: number = 24000; // 默認使用更高采樣率

// 可用的語音選項
export const VOICE_OPTIONS = {
  PUCK: 'Puck',     // 自然、友好的女聲
  NANO: 'Nano',     // 輕快、年輕的女聲
  HELIOS: 'Helios', // 成熟、穩重的男聲
  COBALT: 'Cobalt'  // 清晰、專業的女聲
};

// 可用的語言選項
export const LANGUAGE_OPTIONS = {
  ENGLISH: 'en-US',
  CHINESE: 'zh'     // 中文
};

// 語音生成選項接口
export interface SpeechOptions {
  voice?: string;     // 語音類型
  language?: string;  // 語言
  pitch?: number;     // 音調 (0.25-4.0)
  speakingRate?: number; // 語速 (0.25-4.0)
  temperature?: number; // 溫度 (0.0-1.0)
}

async function handleTurn(): Promise<LiveServerMessage[]> {
  const turn: LiveServerMessage[] = [];
  let done = false;
  while (!done) {
    const message = await waitMessage();
    turn.push(message);
    if (message.serverContent && message.serverContent.turnComplete) {
      done = true;
    }
  }
  return turn;
}

async function waitMessage(): Promise<LiveServerMessage> {
  let done = false;
  let message: LiveServerMessage | undefined = undefined;
  while (!done) {
    message = responseQueue.shift();
    if (message) {
      handleModelTurn(message);
      done = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return message!;
}

const audioParts: string[] = [];
function handleModelTurn(message: LiveServerMessage) {
  if(message.serverContent?.modelTurn?.parts) {
    const part = message.serverContent?.modelTurn?.parts?.[0];

    if(part?.fileData) {
      console.log(`File: ${part?.fileData.fileUri}`);
    }

    if (part?.inlineData) {
      const inlineData = part?.inlineData;
      // 檢查 mimeType 信息，嘗試提取采樣率
      if (inlineData.mimeType) {
        const rateMatch = inlineData.mimeType.match(/rate=(\d+)/);
        if (rateMatch && rateMatch[1]) {
          detectedSampleRate = parseInt(rateMatch[1], 10);
          console.log(`檢測到采樣率: ${detectedSampleRate}Hz`);
        }
      }
      audioParts.push(inlineData?.data ?? '');
    }

    if(part?.text) {
      console.log(part?.text);
    }
  }
}

// 在瀏覽器環境中不使用這個函數
// function saveBinaryFile(fileName: string, content: Buffer) {
//   writeFile(fileName, content, 'utf8', (err) => {
//     if (err) {
//       console.error(`Error writing file ${fileName}:`, err);
//       return;
//     }
//     console.log(`Appending stream content to file ${fileName}.`);
//   });
// }

interface WavConversionOptions {
  numChannels : number,
  sampleRate: number,
  bitsPerSample: number
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function createWavFile(audioData: string[], options: WavConversionOptions): ArrayBuffer {
  const {
    numChannels,
    sampleRate,
    bitsPerSample,
  } = options;

  // 計算音頻數據總長度
  let dataLength = 0;
  const audioBuffers = audioData.map(data => {
    const buffer = base64ToArrayBuffer(data);
    dataLength += buffer.byteLength;
    return buffer;
  });

  // 創建 WAV 頭部
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  
  // 44 bytes for WAV header
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // "RIFF" chunk descriptor
  view.setUint8(0, 'R'.charCodeAt(0));
  view.setUint8(1, 'I'.charCodeAt(0));
  view.setUint8(2, 'F'.charCodeAt(0));
  view.setUint8(3, 'F'.charCodeAt(0));
  
  // Chunk size (file size - 8)
  view.setUint32(4, 36 + dataLength, true);
  
  // "WAVE" format
  view.setUint8(8, 'W'.charCodeAt(0));
  view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0));
  view.setUint8(11, 'E'.charCodeAt(0));
  
  // "fmt " sub-chunk
  view.setUint8(12, 'f'.charCodeAt(0));
  view.setUint8(13, 'm'.charCodeAt(0));
  view.setUint8(14, 't'.charCodeAt(0));
  view.setUint8(15, ' '.charCodeAt(0));
  
  // Sub-chunk size (16 for PCM)
  view.setUint32(16, 16, true);
  
  // Audio format (1 for PCM)
  view.setUint16(20, 1, true);
  
  // Number of channels
  view.setUint16(22, numChannels, true);
  
  // Sample rate
  view.setUint32(24, sampleRate, true);
  
  // Byte rate
  view.setUint32(28, byteRate, true);
  
  // Block align
  view.setUint16(32, blockAlign, true);
  
  // Bits per sample
  view.setUint16(34, bitsPerSample, true);
  
  // "data" sub-chunk
  view.setUint8(36, 'd'.charCodeAt(0));
  view.setUint8(37, 'a'.charCodeAt(0));
  view.setUint8(38, 't'.charCodeAt(0));
  view.setUint8(39, 'a'.charCodeAt(0));
  
  // Sub-chunk size (data length)
  view.setUint32(40, dataLength, true);
  
  // 創建完整的 WAV 文件
  const wavFile = new Uint8Array(44 + dataLength);
  wavFile.set(new Uint8Array(wavHeader), 0);
  
  let offset = 44;
  for (const buffer of audioBuffers) {
    wavFile.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  
  return wavFile.buffer;
}

export async function textToSpeech(
  text: string, 
  apiKey: string,
  options: SpeechOptions = {}
): Promise<ArrayBuffer | null> {
  if (!apiKey) {
    console.error('textToSpeech 錯誤: API Key 未提供');
    throw new Error('API Key 未提供');
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey,
  });

  // 重置音頻部分和采樣率
  audioParts.length = 0;
  detectedSampleRate = 24000;
  
  // 設置默認值
  const voice = options.voice || VOICE_OPTIONS.PUCK;
  const language = options.language || LANGUAGE_OPTIONS.ENGLISH;
  const speakingRate = options.speakingRate || 1.0;
  const pitch = options.pitch || 1.0;
  const temperature = options.temperature ?? 1;

  // 使用較新的模型
  const model = 'models/gemini-2.0-flash-live-001';

  // config 結構與 Bash/curl 一致
  const config = {
    responseModalities: [
      Modality.AUDIO,
    ],
    temperature,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: voice,
          speakingRate: speakingRate,
          pitch: pitch
        }
      }
    },
  };

  try {
    console.log('正在連接到 Gemini API...');
    session = await ai.live.connect({
      model,
      callbacks: {
        onopen: function () {
          console.debug('連接已開啟');
        },
        onmessage: function (message: LiveServerMessage) {
          console.debug('收到消息:', message.serverContent ? '伺服器內容' : '其他消息');
          responseQueue.push(message);
        },
        onerror: function (e: ErrorEvent) {
          console.error('API 錯誤:', e.message);
        },
        onclose: function (e: CloseEvent) {
          console.debug('連接已關閉:', e.reason);
        },
      },
      config
    });

    console.log('連接成功，發送文本進行語音生成...');
    session.sendClientContent({
      turns: [
        text
      ]
    });

    console.log('等待語音響應...');
    await handleTurn();
    console.log('語音生成已完成');
  } catch (error) {
    console.error('語音生成過程中發生錯誤:', error);
    throw error;
  } finally {
    if (session) {
      session.close();
      console.log('API 會話已關閉');
    }
  }

  // 如果有音頻數據，將其轉換為 WAV 格式
  if (audioParts.length > 0) {
    console.log(`收集到 ${audioParts.length} 個音頻部分`);
    console.log(`正在使用采樣率 ${detectedSampleRate}Hz 生成音頻`);
    const options: WavConversionOptions = {
      numChannels: 1,
      sampleRate: detectedSampleRate, // 使用檢測到的采樣率
      bitsPerSample: 16
    };
    
    const wavBuffer = createWavFile(audioParts, options);
    console.log(`WAV 文件生成成功，大小: ${wavBuffer.byteLength} 字節`);
    return wavBuffer;
  } else {
    console.error('未收到任何音頻數據');
    return null;
  }
} 