/**
 * 語言偵測：看文字系統判斷日、韓、中；拉丁字母的語言再用常見虛詞分辨英、西、法、德。
 * 純函式，沒有外部相依，結果只取樣前面一段文字。
 */

import { LEARNING_LANGUAGES, type LearningLang, type Script } from './languages';

const SAMPLE_LENGTH = 6000;

const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

/** 一個字元屬於哪種文字系統；標點、數字、空白回傳 null */
export function scriptOfChar(char: string): 'kana' | 'hangul' | 'han' | 'latin' | null {
    if (KANA.test(char)) return 'kana';
    if (HANGUL.test(char)) return 'hangul';
    if (HAN.test(char)) return 'han';
    if (LATIN.test(char)) return 'latin';
    return null;
}

/** 這個字元是不是某個語言會用到的文字 */
export function charBelongsToScript(char: string, script: Script): boolean {
    const kind = scriptOfChar(char);
    if (kind === null) return false;
    switch (script) {
        case 'latin':
            return kind === 'latin';
        case 'japanese':
            return kind === 'kana' || kind === 'han';
        case 'korean':
            return kind === 'hangul';
        case 'chinese':
            return kind === 'han';
    }
}

export function charBelongsToLang(char: string, lang: LearningLang): boolean {
    return charBelongsToScript(char, LEARNING_LANGUAGES[lang].script);
}

// 各語言最常見、又不太會出現在其他語言裡的虛詞
const STOPWORDS: Record<'en' | 'es' | 'fr' | 'de', ReadonlySet<string>> = {
    en: new Set(['the', 'and', 'of', 'to', 'is', 'that', 'it', 'was', 'for', 'with', 'this', 'are', 'have', 'from', 'not', 'but', 'they', 'you', 'which', 'were', 'been', 'their', 'would', 'what', 'there']),
    es: new Set(['el', 'los', 'las', 'que', 'y', 'es', 'por', 'con', 'para', 'una', 'del', 'como', 'más', 'pero', 'sus', 'este', 'esta', 'también', 'fue', 'muy', 'está', 'son', 'entre', 'cuando', 'porque']),
    fr: new Set(['le', 'les', 'des', 'et', 'est', 'une', 'dans', 'pour', 'que', 'qui', 'pas', 'sur', 'avec', 'sont', 'ce', 'cette', 'mais', 'nous', 'vous', 'aux', 'été', 'être', 'plus', 'du', 'au']),
    de: new Set(['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'für', 'auf', 'dem', 'den', 'von', 'zu', 'sich', 'auch', 'als', 'wird', 'sind', 'aber', 'oder', 'wie', 'einer', 'nach'])
};

function detectLatinLanguage(sample: string): LearningLang | null {
    const words = sample.toLowerCase().match(/[a-zÀ-ɏ]+/g);
    if (!words || words.length === 0) return null;

    let best: LearningLang | null = null;
    let bestCount = 0;
    for (const lang of Object.keys(STOPWORDS) as Array<keyof typeof STOPWORDS>) {
        let count = 0;
        for (const word of words) {
            if (STOPWORDS[lang].has(word)) count++;
        }
        if (count > bestCount) {
            best = lang;
            bestCount = count;
        }
    }
    // 虛詞太少（例如只有幾個單字或一串專有名詞）就不猜
    if (bestCount < 2 && words.length > 5) return null;
    return best;
}

/**
 * 判斷一段文字主要是哪種學習語言；判斷不出來（太短、沒有文字、不是支援的語言）回傳 null。
 *
 * 日文的判斷依據是假名：日文文章一定有假名，中文沒有；所以只要假名占一定比例就是日文，
 * 即使漢字比假名多。
 */
export function detectLearningLang(text: string): LearningLang | null {
    const sample = text.slice(0, SAMPLE_LENGTH);
    let kana = 0;
    let hangul = 0;
    let han = 0;
    let latin = 0;
    for (const char of sample) {
        switch (scriptOfChar(char)) {
            case 'kana':
                kana++;
                break;
            case 'hangul':
                hangul++;
                break;
            case 'han':
                han++;
                break;
            case 'latin':
                latin++;
                break;
        }
    }

    const total = kana + hangul + han + latin;
    if (total === 0) return null;

    const cjk = kana + hangul + han;
    // 以東亞文字為主的頁面（英文頁面夾雜幾個漢字不算）
    if (cjk / total >= 0.3) {
        if (hangul >= kana && hangul >= han * 0.5 && hangul > 0) return 'ko';
        if (kana / cjk >= 0.1) return 'ja';
        if (han > 0) return 'zh';
        if (kana > 0) return 'ja';
    }
    if (latin / total >= 0.5) return detectLatinLanguage(sample);
    return null;
}
