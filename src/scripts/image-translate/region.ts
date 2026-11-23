/**
 * 框選翻譯的純函式：使用者在圖上拖出一個框，只辨識、翻譯框裡的字，再併回這張圖原本的譯文
 *
 * 座標有三層：
 * - 選取範圍：占「整張原圖」的比例（0 到 1），內容腳本依圖片在畫面上的位置算出來
 * - coverage：分析用的那張圖占整張原圖的哪一塊（抓得到原圖時是整張，只能擷取畫面時是看得到的那一塊）
 * - 區塊座標：分析用的那張圖的像素（ResultMessage 的 width／height），疊圖、併入舊譯文都用這個
 */

import { groupLines } from './group';
import { boxArea, intersection } from './tiles';
import type { Box, ImageAnalysis, OcrLine, SourceLang, TextBlock, TranslatedBlock, ViewportRect } from './protocol';

/** 一塊範圍占某張圖的比例 */
export interface Fraction {
    left: number;
    top: number;
    width: number;
    height: number;
}

// 選取範圍至少要有這麼多落在分析過的那張圖裡，才能併回原本的譯文
const MIN_INSIDE_COVERAGE = 0.6;
// 舊的區塊有這麼多落在選取範圍裡，就換成這次的譯文（框到翻錯的地方＝重翻那一塊）
const REPLACE_IF_INSIDE = 0.5;

/**
 * 畫面上拖出的框（CSS 像素）換成占圖片的比例，裁在圖片範圍內；框和圖片沒有重疊時回傳 null
 */
export function selectionOnImage(selection: ViewportRect, image: ViewportRect): Fraction | null {
    if (image.width <= 0 || image.height <= 0) return null;
    const x0 = Math.max(selection.x, image.x);
    const y0 = Math.max(selection.y, image.y);
    const x1 = Math.min(selection.x + selection.width, image.x + image.width);
    const y1 = Math.min(selection.y + selection.height, image.y + image.height);
    if (x1 <= x0 || y1 <= y0) return null;
    // 浮點誤差會算出 1.0000000000000002 這種值，背景頁檢查比例在 0 到 1 之間時會整個拒絕
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const left = clamp((x0 - image.x) / image.width);
    const top = clamp((y0 - image.y) / image.height);
    return { left, top, width: Math.min(1 - left, clamp((x1 - x0) / image.width)), height: Math.min(1 - top, clamp((y1 - y0) / image.height)) };
}

/**
 * 選取範圍（占整張原圖）換成占「分析用那張圖」的比例；大部分不在那張圖裡時回傳 null
 * （只擷取到畫面上看得到的一塊，使用者捲動後框到沒擷取的地方）
 */
export function selectionInCoverage(selection: Fraction, coverage: Fraction): Fraction | null {
    if (coverage.width <= 0 || coverage.height <= 0 || selection.width <= 0 || selection.height <= 0) return null;
    const x0 = Math.max(selection.left, coverage.left);
    const y0 = Math.max(selection.top, coverage.top);
    const x1 = Math.min(selection.left + selection.width, coverage.left + coverage.width);
    const y1 = Math.min(selection.top + selection.height, coverage.top + coverage.height);
    if (x1 <= x0 || y1 <= y0) return null;
    if ((x1 - x0) * (y1 - y0) < MIN_INSIDE_COVERAGE * selection.width * selection.height) return null;
    return {
        left: (x0 - coverage.left) / coverage.width,
        top: (y0 - coverage.top) / coverage.height,
        width: (x1 - x0) / coverage.width,
        height: (y1 - y0) / coverage.height
    };
}

/**
 * 裁出來那一塊的辨識結果，組成一個區塊（座標換回整張分析圖）：
 * 使用者自己框的，框裡讀到的字全部當成同一段話翻，不套框外文字的門檻；
 * 抹字只抹讀到字的地方，譯文可以排滿整個選取範圍。沒讀到字時回傳 null
 */
export function regionBlock(
    analysis: Pick<ImageAnalysis, 'width' | 'height' | 'lines'>,
    crop: Fraction,
    target: { width: number; height: number },
    lang: SourceLang
): TextBlock | null {
    if (analysis.width <= 0 || analysis.height <= 0) return null;
    const ox = crop.left * target.width;
    const oy = crop.top * target.height;
    const sx = (crop.width * target.width) / analysis.width;
    const sy = (crop.height * target.height) / analysis.height;
    const toTarget = ([x0, y0, x1, y1]: Box): Box => [ox + x0 * sx, oy + y0 * sy, ox + x1 * sx, oy + y1 * sy];
    const lines = analysis.lines.filter((line) => line.text.trim() && boxArea(line.box) > 0).map((line) => ({ ...line, box: toTarget(line.box) }));
    if (lines.length === 0) return null;
    const whole: Box = [ox, oy, ox + crop.width * target.width, oy + crop.height * target.height];
    const [block] = groupLines({ regions: [{ label: 'text_bubble', score: 1, box: whole }], lines }, lang);
    if (!block) return null;
    const textBox: Box = [
        Math.min(...lines.map((line) => line.box[0])),
        Math.min(...lines.map((line) => line.box[1])),
        Math.max(...lines.map((line) => line.box[2])),
        Math.max(...lines.map((line) => line.box[3]))
    ];
    return { ...block, box: textBox, bubbleBox: whole };
}

/**
 * 把框選翻好的區塊併進原本的譯文：大半落在選取範圍裡的舊區塊換掉（框到翻錯的地方就是重翻那一塊）
 */
export function mergeRegionBlock(blocks: TranslatedBlock[], block: TranslatedBlock): TranslatedBlock[] {
    const selection = block.bubbleBox ?? block.box;
    const kept = blocks.filter((old) => {
        const area = boxArea(old.box);
        return area === 0 || intersection(old.box, selection) / area < REPLACE_IF_INSIDE;
    });
    return [...kept, block];
}

/**
 * 一種讀法讀得好不好：讀到的字數乘上信心，再除以「碎成幾段」的平方根。
 * 用橫排去讀直排的字（或反過來），會碎成一大堆一兩個字的小段，字數也少；讀對方向時是幾段完整的句子。
 */
export function readingScore(lines: OcrLine[]): number {
    const kept = lines.filter((line) => line.text.trim());
    if (kept.length === 0) return 0;
    const weighted = kept.reduce((sum, line) => sum + [...line.text.replace(/\s/g, '')].length * line.confidence, 0);
    return weighted / Math.sqrt(kept.length);
}
