/**
 * 把 OCR 的文字行分給偵測到的文字區塊，組成要翻譯的段落：純函式
 *
 * P0 實測：整頁 OCR 一次再依位置分配，比逐塊裁切再 OCR 準也快。
 */

import type { Box, ImageAnalysis, OcrLine, SourceLang, TextBlock } from './protocol';
import { boxArea, intersection } from './tiles';

// 一行至少要有這麼多比例落在某個區塊裡，才算那個區塊的
const LINE_IN_REGION = 0.4;
// 文字區塊至少要有這麼多比例落在某個對話框裡，才把那個對話框當成它的排版範圍
const REGION_IN_BUBBLE = 0.6;
// 框外文字（旁白、畫面上的字）要翻的門檻：手繪狀聲詞多半 OCR 信心低或只有一兩個字
const FREE_TEXT_MIN_CONFIDENCE = 0.8;
const FREE_TEXT_MIN_CHARS = 3;

// 同一個區塊的多行怎麼接：韓文以空白分詞，中日文直接接
const JOINER: Record<SourceLang, string> = { ko: ' ', ja: '', zh: '' };

interface Draft {
    label: TextBlock['label'];
    box: Box;
    lines: OcrLine[];
}

export function groupLines(analysis: Pick<ImageAnalysis, 'regions' | 'lines'>, lang: SourceLang): TextBlock[] {
    const drafts: Draft[] = analysis.regions
        .filter((region) => region.label !== 'bubble')
        .map((region) => ({ label: region.label as Draft['label'], box: region.box, lines: [] }));
    const bubbles = analysis.regions.filter((region) => region.label === 'bubble');

    for (const line of analysis.lines) {
        const area = boxArea(line.box);
        if (area === 0) continue;
        let best: Draft | null = null;
        let bestRatio = LINE_IN_REGION;
        for (const draft of drafts) {
            const ratio = intersection(line.box, draft.box) / area;
            if (ratio > bestRatio) {
                best = draft;
                bestRatio = ratio;
            }
        }
        best?.lines.push(line);
    }

    const blocks: TextBlock[] = [];
    for (const draft of drafts) {
        if (draft.lines.length === 0) continue;
        // 橫排：由上而下、同一列由左而右；直排（大部分是又高又窄的欄）：由右而左
        const tall = draft.lines.filter((line) => line.box[3] - line.box[1] > (line.box[2] - line.box[0]) * 1.5).length;
        const vertical = tall > draft.lines.length / 2;
        if (vertical) draft.lines.sort((a, b) => b.box[2] - a.box[2] || a.box[1] - b.box[1]);
        else draft.lines.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
        const joined = draft.lines.map((line) => line.text.trim()).filter(Boolean).join(JOINER[lang]).trim();
        const text = lang === 'ja' ? fixJapaneseMisreads(joined) : joined;
        const confidence = draft.lines.reduce((sum, line) => sum + line.confidence, 0) / draft.lines.length;
        if (!shouldTranslate(draft.label, text, confidence)) continue;
        blocks.push({ label: draft.label, box: draft.box, bubbleBox: findBubble(draft.box, bubbles.map((b) => b.box)), text, confidence, vertical, fontHint: estimateFontSize(draft.lines, vertical) });
    }
    return blocks;
}

// 日文常見的辨識錯誤，只修幾乎不可能是原樣的寫法（讀錯會讓 Google 整句翻不好，都是實際遇過的）：
// - 小字擷取時，小寫假名（ゃょ）被讀成大寫（やよ）：「コハルちやん」
// - 直排的長音「ー」被讀成「！」：夾在兩個片假名中間的「！」幾乎一定是長音（「デ！ト」→「デート」）
// - 直排的波浪號「～」被讀成「Ｓ」：接在日文後面、在「☆♪！？…」前（全形Ｓ在句尾也算）
const KANA = '\u3041-\u3096\u30A1-\u30FA\u30FC';
const JAPANESE_MISREAD_FIXES: [RegExp, string][] = [
    [/ちやん/g, 'ちゃん'],
    [/ちよっと/g, 'ちょっと'],
    [/じやない/g, 'じゃない'],
    [/じやあ/g, 'じゃあ'],
    [new RegExp(`([\u30A1-\u30FA])[！!](?=[\u30A1-\u30FA])`, 'g'), '$1ー'],
    // 全形Ｓ（辨識模型讀錯時給的就是全形）：在符號前或句尾；半形 S 只在符號前（「サイズはS」這種是真的 S）
    [new RegExp(`([${KANA}\u4E00-\u9FFF])Ｓ(?=[☆★♪♡！？!?…。、]|$)`, 'g'), '$1～'],
    [new RegExp(`([${KANA}\u4E00-\u9FFF])S(?=[☆★♪♡！？!?…。、])`, 'g'), '$1～']
];

export function fixJapaneseMisreads(text: string): string {
    return JAPANESE_MISREAD_FIXES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

export function shouldTranslate(label: TextBlock['label'], text: string, confidence: number): boolean {
    // 沒讀到任何真正的字（只有標點、符號）：保留原圖，不然會把整個對話框擦成一個句點（P0 實測過）
    if (!/\p{L}/u.test(text)) return false;
    // 只有一兩個拉丁字母（「n」「I」）：多半是框線、網點被讀成字，翻了只會在圖上蓋一塊（實際遇過「비치 구역」被讀成「n」）
    if (/^[\s\p{P}]*\p{Script=Latin}{1,2}[\s\p{P}]*$/u.test(text)) return false;
    if (label === 'text_bubble') return true;
    return confidence >= FREE_TEXT_MIN_CONFIDENCE && [...text.replace(/\s/g, '')].length >= FREE_TEXT_MIN_CHARS;
}

/**
 * 原文的字大約多大：直排看欄寬、橫排看行高（OCR 的行框比字略大，打個折），取中位數
 */
export function estimateFontSize(lines: OcrLine[], vertical: boolean): number {
    const sizes = lines
        .map((line) => (vertical ? line.box[2] - line.box[0] : (line.box[3] - line.box[1]) * 0.8))
        .filter((size) => size > 0)
        .sort((a, b) => a - b);
    return sizes.length ? Math.round(sizes[Math.floor(sizes.length / 2)]) : 0;
}

function findBubble(box: Box, bubbles: Box[]): Box | null {
    const area = boxArea(box);
    let best: Box | null = null;
    let bestRatio = REGION_IN_BUBBLE;
    for (const bubble of bubbles) {
        const ratio = area > 0 ? intersection(box, bubble) / area : 0;
        if (ratio > bestRatio) {
            best = bubble;
            bestRatio = ratio;
        }
    }
    return best;
}

/**
 * 譯文的排版範圍：對話框內縮後與原文區塊取面積大的那個（譯文通常比原文長，對話框裡多半還有空間）
 */
export function layoutBox(block: Pick<TextBlock, 'box' | 'bubbleBox'>): Box {
    if (!block.bubbleBox) return block.box;
    const [x0, y0, x1, y1] = block.bubbleBox;
    const w = x1 - x0;
    const h = y1 - y0;
    // 對話框多半是橢圓，四角是空的，所以左右內縮 15%、上下 17%
    const inset: Box = [x0 + w * 0.15, y0 + h * 0.17, x1 - w * 0.15, y1 - h * 0.17];
    return boxArea(inset) > boxArea(block.box) ? inset : block.box;
}
