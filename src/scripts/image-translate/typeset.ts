/**
 * 譯文排版：斷行與找最大字級（純函式，量字寬的函式由呼叫端提供，測試時可以換成假的）
 */

export type Measure = (text: string, fontSize: number) => number;

export interface FitResult {
    fontSize: number;
    lines: string[];
}

export const LINE_HEIGHT = 1.18;
const MIN_FONT = 9;
const MAX_FONT = 72;

/**
 * 切成可以斷行的單位：連續的英數字（含撇號、連字號）是一個詞，空白單獨一個，其他每個字一個（中日韓）
 */
export function tokenize(text: string): string[] {
    return text.match(/[\p{Script=Latin}\p{N}'’\-]+|\s+|./gsu) ?? [];
}

// 這些標點不該出現在行首，遇到時跟著上一行
const NO_LINE_START = /^[，。、．,.!?！？…）)」』】〉》:：;；~～ー]$/u;

export function wrapText(text: string, maxWidth: number, fontSize: number, measure: Measure): string[] {
    const lines: string[] = [];
    let line = '';
    for (const token of tokenize(text)) {
        const next = line + token;
        if (line.trim() && measure(next, fontSize) > maxWidth && !NO_LINE_START.test(token)) {
            lines.push(line.trim());
            line = /^\s+$/.test(token) ? '' : token;
        } else {
            line = next;
        }
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
}

export interface FitOptions {
    // 希望的字級下限（呼叫端依圖片實際顯示的大小換算，畫面上看得清楚）；這個字級還塞不下時會再縮小，
    // 譯文一定放在對話框裡，不超出（看不清楚時可以把滑鼠移到區塊上看完整譯文）
    minFont?: number;
    // 字級上限（原文的字大小）：對話框很空時也不要放得比原文大
    maxFont?: number;
}

// 真的塞不下時最多縮到這麼小；再小也看不見了，這時才允許超出
const ABSOLUTE_MIN_FONT = 5;

/**
 * 找最大、而且塞得下的字級：先在「希望的下限～上限」之間找，找不到再往下找到 ABSOLUTE_MIN_FONT
 */
function largestFitting<T>(options: FitOptions, tryAt: (size: number) => { fits: boolean; value: T }): { fontSize: number; value: T } {
    const preferredMin = Math.max(ABSOLUTE_MIN_FONT, options.minFont ?? MIN_FONT);
    const max = Math.max(preferredMin, Math.min(MAX_FONT, options.maxFont ?? MAX_FONT));
    const search = (low: number, high: number) => {
        let found: { fontSize: number; value: T } | null = null;
        while (low <= high) {
            const size = (low + high) >> 1;
            const attempt = tryAt(size);
            if (attempt.fits) {
                found = { fontSize: size, value: attempt.value };
                low = size + 1;
            } else {
                high = size - 1;
            }
        }
        return found;
    };
    return search(preferredMin, max) ?? search(ABSOLUTE_MIN_FONT, preferredMin - 1) ?? { fontSize: ABSOLUTE_MIN_FONT, value: tryAt(ABSOLUTE_MIN_FONT).value };
}

/**
 * 最大、而且完整塞進 width × height 的字級與斷行
 */
export function fitText(text: string, width: number, height: number, measure: Measure, options: FitOptions = {}): FitResult {
    const { fontSize, value } = largestFitting(options, (size) => {
        const lines = wrapText(text, width, size, measure);
        return { fits: lines.length * size * LINE_HEIGHT <= height && lines.every((l) => measure(l, size) <= width), value: lines };
    });
    return { fontSize, lines: value };
}

// ---------- 直排（原文是直排、譯文是中文或日文時，譯文也直排） ----------

// 直排時每個字往下前進的距離、欄與欄的距離（都是字級的倍數）
export const VERTICAL_ADVANCE = 1.08;
export const COLUMN_SPACING = 1.25;

export interface VerticalFit {
    fontSize: number;
    // 由右而左的每一欄，每欄由上而下的字
    columns: string[][];
}

/**
 * 把譯文依每欄字數切成欄；標點不放在欄首，跟著上一欄（那一欄會多一個字）
 */
export function splitColumns(text: string, perColumn: number): string[][] {
    const chars = Array.from(text.replace(/\s+/g, ''));
    const columns: string[][] = [];
    let column: string[] = [];
    for (const ch of chars) {
        if (column.length >= perColumn && !(NO_LINE_START.test(ch) && column.length === perColumn)) {
            columns.push(column);
            column = [];
        }
        column.push(ch);
    }
    if (column.length) columns.push(column);
    return columns;
}

export function fitVertical(text: string, width: number, height: number, options: FitOptions = {}): VerticalFit {
    const { fontSize, value } = largestFitting(options, (size) => {
        const columns = splitColumns(text, Math.max(1, Math.floor(height / (size * VERTICAL_ADVANCE))));
        const longest = Math.max(0, ...columns.map((column) => column.length));
        // 欄數放得進寬度、最長那欄放得進高度（標點跟著上一欄時那欄會多一個小字，留半個字的餘裕）
        const fits = columns.length * size * COLUMN_SPACING <= width && longest * size * VERTICAL_ADVANCE <= height + size * 0.5;
        return { fits, value: columns };
    });
    return { fontSize, columns: value };
}
