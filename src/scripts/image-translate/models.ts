/**
 * 圖片翻譯用的模型：固定在某個版本（Hugging Face 的 commit），並附 SHA-256
 *
 * 模型是資料不是程式碼，第一次使用時下載、存在 offscreen 文件的 Cache Storage；
 * 下載後先比對雜湊，對不上就丟掉並回報錯誤，不會拿被換掉的檔案去跑。
 * 換版本時：改 commit、重新下載算 sha256 與 size。
 */

import type { SourceLang } from './protocol';

// 模型存在擴充功能自己的 Cache Storage（offscreen 文件寫入，設定頁可清除，兩邊同一個來源）
// 沿用改名前（LexiTechly）的快取名稱：改掉會讓使用者重新下載辨識模型
export const MODEL_CACHE = 'lexitechly-image-translate-models-v1';

export interface ModelFile {
    url: string;
    sha256: string;
    size: number;
}

// ogkalu/comic-text-and-bubble-detector（Apache-2.0），RT-DETR-v2 小模型 int8
const DETECTOR_BASE = 'https://huggingface.co/ogkalu/comic-text-and-bubble-detector/resolve/16e8a622f91fabc6b5b65c96d32d1183f8843546';
// snowfluke/ppu-paddle-ocr-models（PaddleOCR 模型的 ONNX 轉檔，Apache-2.0）
const OCR_BASE = 'https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/bf1d5edb0335d3262be7caf13f766ba274b4cadd';

export const DETECTOR_MODEL: ModelFile = {
    url: `${DETECTOR_BASE}/detector-v4-s_int8.onnx`,
    sha256: '5fe9e4f576e49d4e7e8b0e029d6d3cdc252abd4694113e1cae120e62c931ea79',
    size: 11120765
};

export interface OcrModelSet {
    detection: ModelFile;
    recognition: ModelFile;
    dictionary: ModelFile;
}

const PP_OCR_V5_MOBILE_DET: ModelFile = {
    url: `${OCR_BASE}/detection/PP-OCRv5_mobile_det_infer.onnx`,
    sha256: 'd7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924',
    size: 4748769
};

// 各語言選的模型依 P0 實測：韓文只能用韓文專用模型（中日英統一模型完全讀不了韓文），
// 日文用 japan v3（比 v6 統一模型準、小、快），中文用 v6 small
export const OCR_MODELS: Record<SourceLang, OcrModelSet> = {
    ko: {
        detection: PP_OCR_V5_MOBILE_DET,
        recognition: {
            url: `${OCR_BASE}/recognition/multi/korean/v5/korean_PP-OCRv5_mobile_rec_infer.onnx`,
            sha256: 'ee0dfde503d787c91fd0455daae2eb85311b4b5bdcddf85a54d8c1e0adc157de',
            size: 13443278
        },
        dictionary: {
            url: `${OCR_BASE}/recognition/multi/korean/v5/ppocrv5_korean_dict.txt`,
            sha256: 'a3792cbb41215a43e555e16ff4a7f7b18db5dd80cd058637098f0d872f2dd9d6',
            size: 47452
        }
    },
    ja: {
        detection: PP_OCR_V5_MOBILE_DET,
        recognition: {
            url: `${OCR_BASE}/recognition/multi/japan/v3/japan_PP-OCRv3_mobile_rec_infer.onnx`,
            sha256: '45b0872d8e93ea6293c9f7a5aed101b4c73b94e3c5f9076ac6176bdd0506ef22',
            size: 10031937
        },
        dictionary: {
            url: `${OCR_BASE}/recognition/multi/japan/v3/japan_dict.txt`,
            sha256: 'ef0dedf763530a436043372cff6e0886451a40cd203eb8fd9f11384041bbf437',
            size: 17333
        }
    },
    zh: {
        detection: {
            url: `${OCR_BASE}/detection/ort/PP-OCRv6_small_det.ort`,
            sha256: 'c21be8d8268f0f45e2693b1d52432a290a56d008f6c1ff28b4baa7c35bab250e',
            size: 9982352
        },
        recognition: {
            url: `${OCR_BASE}/recognition/ort/PP-OCRv6_small_rec.ort`,
            sha256: '40bccd9fa3ae2d14d724bf9d020c8f0edfc801489477b92f7449162a538366df',
            size: 21290816
        },
        dictionary: {
            url: `${OCR_BASE}/recognition/ppocrv6_dict.txt`,
            sha256: '41557512862dfe31970cf22407742b629725461dd84c0d8771bde9c87c2202c8',
            size: 74948
        }
    }
};

/** 全部會用到的模型檔（同一個檔案只列一次） */
export function allModelFiles(): ModelFile[] {
    const files = [DETECTOR_MODEL, ...Object.values(OCR_MODELS).flatMap((set) => [set.detection, set.recognition, set.dictionary])];
    return files.filter((file, i) => files.findIndex((other) => other.url === file.url) === i);
}

/** 某個語言第一次使用時要下載的總位元組（偵測模型 + 該語言的 OCR 模型） */
export function downloadSizeFor(lang: SourceLang): number {
    const set = OCR_MODELS[lang];
    return DETECTOR_MODEL.size + set.detection.size + set.recognition.size + set.dictionary.size;
}

/** 各語言第一次使用的下載量範圍（自動判斷時事先不知道是哪個語言，說明裡寫範圍） */
export function downloadSizeRange(): { min: number; max: number } {
    const sizes = (Object.keys(OCR_MODELS) as SourceLang[]).map(downloadSizeFor);
    return { min: Math.min(...sizes), max: Math.max(...sizes) };
}
