/**
 * 斷詞：找出文字裡的單字與游標所在的單字。
 *
 * - 拉丁字母的語言用字母連續出現的範圍當作單字（含重音字母與字中的撇號、連字號）。
 * - 日文、中文沒有空白分詞，韓文的詞尾黏在詞上，都交給瀏覽器內建的 Intl.Segmenter。
 */

import { charBelongsToLang } from './detect';
import { LEARNING_LANGUAGES, type LearningLang } from './languages';

export interface WordSpan {
    word: string;
    /** 在原字串中的起點（含） */
    start: number;
    /** 在原字串中的終點（不含） */
    end: number;
}

const LATIN_WORD = /[A-Za-zÀ-ɏ]+(?:['’\-][A-Za-zÀ-ɏ]+)*/g;

const segmenters = new Map<LearningLang, Intl.Segmenter>();

function segmenterFor(lang: LearningLang): Intl.Segmenter {
    let segmenter = segmenters.get(lang);
    if (!segmenter) {
        segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
        segmenters.set(lang, segmenter);
    }
    return segmenter;
}

function normalize(word: string, lang: LearningLang): string {
    return LEARNING_LANGUAGES[lang].script === 'latin' ? word.toLowerCase() : word;
}

function hasLangChar(word: string, lang: LearningLang): boolean {
    for (const char of word) {
        if (charBelongsToLang(char, lang)) return true;
    }
    return false;
}

/** 文字裡所有屬於這個語言、長度足夠的單字，依出現順序 */
export function wordsIn(text: string, lang: LearningLang): WordSpan[] {
    const { script, minWordLength } = LEARNING_LANGUAGES[lang];
    const spans: WordSpan[] = [];

    if (script === 'latin') {
        for (const match of text.matchAll(LATIN_WORD)) {
            const word = match[0];
            if (word.length < minWordLength) continue;
            const start = match.index ?? 0;
            spans.push({ word: normalize(word, lang), start, end: start + word.length });
        }
        return spans;
    }

    for (const part of segmenterFor(lang).segment(text)) {
        if (!part.isWordLike) continue;
        const word = part.segment;
        if ([...word].length < minWordLength || !hasLangChar(word, lang)) continue;
        spans.push({ word, start: part.index, end: part.index + word.length });
    }
    return spans;
}

/**
 * 字串中某個位置所在的單字；那個位置不是這個語言的文字（空白、標點、其他語言）時回傳 null。
 * offset 指向字元之間，會先看右邊的字元，沒有才看左邊，和瀏覽器回報的游標位置一致。
 */
export function wordAt(text: string, offset: number, lang: LearningLang): WordSpan | null {
    if (offset < 0 || offset > text.length) return null;
    for (const span of wordsIn(text, lang)) {
        if (offset >= span.start && offset < span.end) return span;
    }
    // 游標在單字的最後一個字元後面
    for (const span of wordsIn(text, lang)) {
        if (offset === span.end) return span;
    }
    return null;
}
