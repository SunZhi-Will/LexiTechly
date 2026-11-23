/**
 * 直排文字（日文漫畫的對白幾乎都是直排）：判斷方向、切欄、切字（純函式，只吃灰階像素）
 *
 * OCR 的辨識模型只會讀橫排；把直排的欄整欄轉 90 度，每個字都會躺著，讀不出來（實測 F1 接近 0）。
 * PaddleOCR 的文字偵測也不會把直排切成一欄一欄，常把整個對話框當一塊。所以在對話框偵測模型找到的
 * 文字區塊裡，自己用墨跡投影切：
 * 1. 依區塊背景把字變成墨跡遮罩（深字淺底或淺字深底都可以）。
 * 2. 直向投影找出一欄一欄（中間有空白分隔），橫向投影找出一行一行；欄比較像就是直排。
 * 3. 直排：每一欄再用橫向投影切成一個一個字（字裡的空隙，例如「三」「二」，依高度合併回一個字），
 *    由右而左、由上而下排好；呼叫端把每個字立正排成一橫行，交給橫排的辨識模型。
 *    又細又長的筆畫（直排的「ー」「…」）標成要轉 90 度，排成橫的才會被讀成長音與刪節號。
 */

export interface Gray {
    data: Uint8Array;
    width: number;
    height: number;
}

export interface Span {
    start: number;
    end: number; // 不含
}

export interface Glyph {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    // 直排的長音、刪節號：轉 90 度後才是橫排的樣子
    rotate: boolean;
}

export interface Column {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    // 這一欄一個字大約多大（像素）；呼叫端排成橫行、決定要不要放大時用它，不用欄寬
    glyphSize: number;
    glyphs: Glyph[];
}

/** Otsu 門檻：把灰階分成兩群 */
export function otsuThreshold(data: Uint8Array): number {
    const hist = new Array<number>(256).fill(0);
    for (const v of data) hist[v]++;
    const total = data.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let weightB = 0;
    let best = 0;
    let threshold = 127;
    for (let i = 0; i < 256; i++) {
        weightB += hist[i];
        if (weightB === 0) continue;
        const weightF = total - weightB;
        if (weightF === 0) break;
        sumB += i * hist[i];
        const meanB = sumB / weightB;
        const meanF = (sum - sumB) / weightF;
        const between = weightB * weightF * (meanB - meanF) ** 2;
        if (between > best) {
            best = between;
            threshold = i;
        }
    }
    return threshold;
}

/**
 * 墨跡遮罩：1 是字。以多數像素為背景（對話框裡底色占多數），另一群就是字
 */
export function inkMask({ data, width, height }: Gray): Uint8Array {
    const threshold = otsuThreshold(data);
    let dark = 0;
    for (const v of data) if (v <= threshold) dark++;
    const inkIsDark = dark < data.length / 2;
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) mask[i] = (inkIsDark ? data[i] <= threshold : data[i] > threshold) ? 1 : 0;
    return clearBorderInk(mask, width, height);
}

/**
 * 去掉碰到裁切邊緣的墨跡：文字區塊常會框到一點對話框的外框，外框一定碰到邊緣，字不會（呼叫端有留邊）
 */
export function clearBorderInk(mask: Uint8Array, width: number, height: number): Uint8Array {
    const out = mask.slice();
    const stack: number[] = [];
    const push = (i: number) => {
        if (out[i]) {
            out[i] = 0;
            stack.push(i);
        }
    };
    for (let x = 0; x < width; x++) {
        push(x);
        push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
        push(y * width);
        push(y * width + width - 1);
    }
    while (stack.length) {
        const i = stack.pop()!;
        const x = i % width;
        const y = (i - x) / width;
        if (x > 0) push(i - 1);
        if (x < width - 1) push(i + 1);
        if (y > 0) push(i - width);
        if (y < height - 1) push(i + width);
    }
    return out;
}

/** 連續有墨跡的區段；minGap 以內的空白視為同一段，短於 minLength 的段（雜點）丟掉 */
export function spans(profile: ArrayLike<number>, minInk: number, minGap: number, minLength: number): Span[] {
    const raw: Span[] = [];
    let start = -1;
    for (let i = 0; i <= profile.length; i++) {
        const on = i < profile.length && profile[i] >= minInk;
        if (on && start < 0) start = i;
        if (!on && start >= 0) {
            raw.push({ start, end: i });
            start = -1;
        }
    }
    const merged: Span[] = [];
    for (const span of raw) {
        const last = merged[merged.length - 1];
        if (last && span.start - last.end <= minGap) last.end = span.end;
        else merged.push({ ...span });
    }
    return merged.filter((s) => s.end - s.start >= minLength);
}

function columnProfile(mask: Uint8Array, width: number, height: number, y0 = 0, y1 = height): number[] {
    const profile = new Array<number>(width).fill(0);
    for (let y = y0; y < y1; y++) for (let x = 0; x < width; x++) profile[x] += mask[y * width + x];
    return profile;
}

function rowProfile(mask: Uint8Array, width: number, x0 = 0, x1 = width, height = mask.length / width): number[] {
    const profile = new Array<number>(height).fill(0);
    for (let y = 0; y < height; y++) for (let x = x0; x < x1; x++) profile[y] += mask[y * width + x];
    return profile;
}

/**
 * 判斷直排或橫排：直排時，直向投影會切出幾條「又高又窄」的欄；橫排時，橫向投影會切出幾條「又寬又矮」的行。
 * 比較兩種切法裡「像文字欄／行」的段落的總長度。用總長度而不是條數：只有一欄的短對話框，
 * 旁邊碰巧有一小段對話框尾巴，條數會一比一打平（實際遇過，整句被當成橫排而漏翻），總長度則差很多。
 */
export function orientation(mask: Uint8Array, width: number, height: number): 'vertical' | 'horizontal' {
    const cols = spans(columnProfile(mask, width, height), 1, 2, 3);
    const rows = spans(rowProfile(mask, width), 1, 2, 3);
    const extent = (span: Span, along: 'x' | 'y') => {
        // 這一欄（行）裡最長的一段連續墨跡（字與字的小空隙算連續，欄與欄、行與行之間的大空白不算）
        const profile = along === 'x' ? rowProfile(mask, width, span.start, span.end) : columnProfile(mask, width, height, span.start, span.end);
        const inner = spans(profile, 1, Math.max(4, (span.end - span.start) * 0.6), 1);
        return inner.reduce((longest, s) => Math.max(longest, s.end - s.start), 0);
    };
    const score = (list: Span[], along: 'x' | 'y') => list.reduce((sum, span) => {
        const length = extent(span, along);
        return sum + (length / Math.max(1, span.end - span.start) >= 2 ? length : 0);
    }, 0);
    const colScore = score(cols, 'x');
    const rowScore = score(rows, 'y');
    return colScore > rowScore ? 'vertical' : 'horizontal';
}

/**
 * 直排時要轉 90 度才是橫排樣子的符號：長音「ー」、波浪號「～」、破折號（一條連續的細長筆畫），
 * 以及刪節號（三個以上分開的小點）。驚嘆號「！」也是細長的，但它是「上面一條、下面一個點」，
 * 直排時本來就直立，轉了反而讀錯。
 * 以前只看「比一個字高、寬不到四成」，粗體字的「ー」「～」過不了門檻而沒轉，被讀成「！」「Ｓ」，
 * 整句翻錯（使用者匯出的辨識紀錄：「デ！トするんだＳ☆」）。
 */
function isSidewaysMark(mask: Uint8Array, width: number, x0: number, x1: number, piece: Span, columnWidth: number): boolean {
    const glyphWidth = x1 - x0;
    const h = piece.end - piece.start;
    const thin = glyphWidth < columnWidth * 0.5 && h > glyphWidth * 2 && h > columnWidth * 0.55;
    if (!thin) return false;
    const strokes = spans(rowProfile(mask, width, x0, x1).slice(piece.start, piece.end), 1, 0, 1);
    const exclamation = strokes.length === 2 && strokes[1].end - strokes[1].start < (strokes[0].end - strokes[0].start) * 0.5;
    return !exclamation;
}

/** 這一欄墨跡的水平中心（墨跡量的中位數位置）：欄邊零星的對話框邊緣、效果線拉不動它 */
function inkCenter(mask: Uint8Array, width: number, height: number, col: Span): number {
    const profile = columnProfile(mask, width, height).slice(col.start, col.end);
    const total = profile.reduce((sum, v) => sum + v, 0);
    let acc = 0;
    for (let i = 0; i < profile.length; i++) {
        acc += profile[i];
        if (acc >= total / 2) return col.start + i + 0.5;
    }
    return (col.start + col.end) / 2;
}

/** 這一段是不是細長的一條（驚嘆號上面那一條、直排的長音） */
function isThin(mask: Uint8Array, width: number, height: number, col: Span, piece: Span, size: number): boolean {
    const [x0, x1] = inkExtent(mask, width, height, col, piece);
    return x1 - x0 < size * 0.5 && piece.end - piece.start > (x1 - x0) * 2;
}

/** 一段範圍裡墨跡的左右邊界（落在欄內）；沒有墨跡時回傳整欄 */
function inkExtent(mask: Uint8Array, width: number, height: number, col: Span, rows: Span): [number, number] {
    const inner = spans(columnProfile(mask, width, height, rows.start, rows.end).slice(col.start, col.end), 1, 0, 1);
    if (inner.length === 0) return [col.start, col.end];
    return [col.start + inner[0].start, col.start + inner[inner.length - 1].end];
}

/**
 * 一個字大約多大：用這一欄每一段墨跡的寬度（第 75 百分位）估，不用整欄的寬度。
 * 欄裡夾到一點對話框邊緣或效果線時，整欄會變寬；以前拿欄寬當字的大小，會把兩個字併成一個
 * （使用者的辨識紀錄：「コハルちゃん？」被切成四塊，讀成「ん３」）。
 */
function glyphSizeOf(mask: Uint8Array, width: number, height: number, col: Span, runs: Span[]): number {
    const columnWidth = col.end - col.start;
    const widths = runs
        .filter((run) => run.end - run.start >= 2)
        .map((run) => {
            const [x0, x1] = inkExtent(mask, width, height, col, run);
            return x1 - x0;
        })
        .sort((a, b) => a - b);
    if (widths.length === 0) return columnWidth;
    const p75 = widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.75))];
    return Math.max(4, Math.min(columnWidth, Math.max(p75, columnWidth * 0.35)));
}

/**
 * 直排：切成欄（由右而左），每欄切成字（由上而下）
 */
export function verticalColumns(mask: Uint8Array, width: number, height: number): Column[] {
    const colSpans = spans(columnProfile(mask, width, height), 1, 2, 3);
    if (colSpans.length === 0) return [];
    const typicalWidth = colSpans.map((s) => s.end - s.start).sort((a, b) => a - b)[Math.floor(colSpans.length / 2)];
    // 窄得不像一欄字的段（小假名、標點會貼在欄的右上，但寬度仍接近一欄）合併到旁邊的欄
    const columns: Span[] = [];
    for (const span of colSpans) {
        const last = columns[columns.length - 1];
        if (last && (span.end - span.start < typicalWidth * 0.45 || last.end - last.start < typicalWidth * 0.45) && span.start - last.end < typicalWidth * 0.5) {
            last.end = span.end;
        } else {
            columns.push({ ...span });
        }
    }

    const result: Column[] = [];
    for (const col of columns.reverse()) {
        const runs = spans(rowProfile(mask, width, col.start, col.end), 1, 0, 1);
        const size = glyphSizeOf(mask, width, height, col, runs);
        const center = inkCenter(mask, width, height, col);
        // 字裡的空隙：把相鄰的段合併，直到再合併就會比一個字高。
        // 驚嘆號的點跟上面那一條隔得比較開，另外判斷：前一段是細長的一條、這一段是小點，就併成一個「！」
        const pieces: Span[] = [];
        for (const run of runs) {
            const last = pieces[pieces.length - 1];
            const gap = last ? run.start - last.end : Infinity;
            const fits = last && run.end - last.start <= size * 1.12 && gap < size * 0.35;
            const exclamationDot = last && run.end - run.start < size * 0.4 && run.end - last.start <= size * 1.4 && gap < size * 0.6 && isThin(mask, width, height, col, last, size);
            if (last && (fits || exclamationDot)) last.end = run.end;
            else pieces.push({ ...run });
        }
        const glyphs: Glyph[] = [];
        for (const piece of pieces) {
            const h = piece.end - piece.start;
            if (h < 2) continue;
            // 判斷要不要轉向時看這個字自己的墨跡範圍
            const [x0, x1] = inkExtent(mask, width, height, col, piece);
            const rotate = isSidewaysMark(mask, width, x0, x1, piece, size);
            // 一般的字：以這一欄墨跡的中心、約 1.25 個字寬為一格。保留字在格子裡的位置（直排的「、」在右上角，
            // 緊貼著裁會被讀成「-」），又不會把欄邊夾到的對話框邊緣、效果線一起裁進來
            const cell: [number, number] = [Math.max(col.start, Math.round(center - size * 0.62)), Math.min(col.end, Math.round(center + size * 0.62))];
            // 太長的段多半是好幾個字黏在一起（例如連續的「ーー」），平均切開
            const count = rotate ? 1 : Math.max(1, Math.round(h / (size * 1.05)));
            for (let i = 0; i < count; i++) {
                const y0 = piece.start + Math.round((h * i) / count);
                const y1 = piece.start + Math.round((h * (i + 1)) / count);
                const [gx0, gx1] = rotate ? [x0, x1] : cell;
                glyphs.push({ x0: gx0, x1: Math.max(gx1, gx0 + 1), y0, y1, rotate });
            }
        }
        if (glyphs.length === 0) continue;
        result.push({ x0: col.start, x1: col.end, y0: glyphs[0].y0, y1: glyphs[glyphs.length - 1].y1, glyphSize: size, glyphs });
    }
    return result;
}
