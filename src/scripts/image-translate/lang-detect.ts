/**
 * 原文語言自動判斷（純函式）
 *
 * OCR 模型依語言不同（韓文專用、日文專用、中文），用錯模型幾乎讀不出字（韓文模型讀日文、統一模型讀韓文都接近 0）。
 * 同一個網站常有各種語言的作品，所以不能依網站記住一種語言。做法：先用最可能的語言辨識，
 * 看讀出來的字是不是那個語言的文字、而且大部分文字區塊都讀得到；不是就換下一個語言再試。
 */

import type { SourceLang } from './protocol';

export interface ScriptCounts {
    hangul: number;
    kana: number;
    han: number;
    letters: number;
}

export function countScripts(text: string): ScriptCounts {
    const counts: ScriptCounts = { hangul: 0, kana: 0, han: 0, letters: 0 };
    for (const ch of text) {
        if (!/\p{L}/u.test(ch)) continue;
        counts.letters++;
        if (/\p{Script=Hangul}/u.test(ch)) counts.hangul++;
        else if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) counts.kana++;
        else if (/\p{Script=Han}/u.test(ch)) counts.han++;
    }
    return counts;
}

function expectedChars(lang: SourceLang, c: ScriptCounts): number {
    return lang === 'ko' ? c.hangul : lang === 'ja' ? c.kana + c.han : c.han;
}

export interface LangVerdict {
    lang: SourceLang;
    accepted: boolean;
    // 用來在都沒過關時挑最好的那個
    score: number;
}

/**
 * 判斷某個語言的辨識結果像不像真的：regionTexts 是每個文字區塊讀到的字，regionCount 是偵測到的文字區塊數
 */
export function judge(lang: SourceLang, regionTexts: string[], regionCount: number): LangVerdict {
    const total = countScripts(regionTexts.join(''));
    const readable = regionTexts.filter((text) => expectedChars(lang, countScripts(text)) >= 2).length;
    const coverage = readable / Math.max(1, regionCount);
    const ratio = total.letters ? expectedChars(lang, total) / total.letters : 0;
    let accepted = coverage >= 0.5;
    if (lang === 'ko') accepted &&= ratio >= 0.6;
    // 日文一定有假名；只有漢字多半是中文
    if (lang === 'ja') accepted &&= ratio >= 0.7 && total.kana / Math.max(1, total.letters) >= 0.08;
    if (lang === 'zh') accepted &&= ratio >= 0.7 && total.kana / Math.max(1, total.letters) < 0.03;
    return { lang, accepted, score: coverage * ratio };
}

/**
 * 沒過關時下一個要試的語言：依這次讀到的字推測（漢字多、沒有假名 → 中文；讀得到假名 → 日文；其他 → 韓文），
 * 避免不必要地下載別的語言模型
 */
export function nextCandidate(regionTexts: string[], tried: SourceLang[]): SourceLang | null {
    const c = countScripts(regionTexts.join(''));
    const order: SourceLang[] = [];
    if (c.hangul > c.kana + c.han) order.push('ko');
    if (c.kana >= 3) order.push('ja');
    if (c.han > 0 && c.kana < 3) order.push('zh');
    order.push('ja', 'ko', 'zh');
    return order.find((lang) => !tried.includes(lang)) ?? null;
}
