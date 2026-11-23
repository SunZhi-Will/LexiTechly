/**
 * offscreen 文件裡的文字辨識引擎：對話框偵測（RT-DETR，onnxruntime-web）+ PaddleOCR（ppu-paddle-ocr）
 *
 * 為什麼在 offscreen 文件：service worker 不能開 Web Worker，ONNX Runtime 需要；內容腳本跑在別人的網頁裡，
 * 受網頁的 CSP 限制，而且會拖慢網頁。offscreen 文件是擴充功能自己的隱藏頁面，兩個問題都沒有。
 *
 * 只用 WASM：P0 實測偵測模型的 MaxPool（ceil_mode）在 ORT 的 WebGPU 後端會直接出錯，
 * OCR 用 WebGPU 也沒有比較快，所以整包只打包 WASM 版（vite.config.ts 把 onnxruntime-web 指到 onnxruntime-web/wasm）。
 * manifest 設了 COOP／COEP，offscreen 文件是跨來源隔離的，WASM 可以用多執行緒（見下方 numThreads）。
 */

import * as ort from 'onnxruntime-web/wasm';
import { PaddleOcrService, type RecognitionOptions } from 'ppu-paddle-ocr/web';
import { DETECTOR_MODEL, MODEL_CACHE, ModelFile, OCR_MODELS } from './models';
import { groupLines } from './group';
import { judge, nextCandidate, type LangVerdict } from './lang-detect';
import type { Box, ImageAnalysis, OcrLine, Region, RegionLabel, SourceLang } from './protocol';
import { boxArea, dedupeBoxes, dedupeOverlapping, intersection, planTiles, shiftBox } from './tiles';
import { inkMask, orientation, verticalColumns, type Column } from './vertical';

const DETECTOR_INPUT = 640;
const DETECTOR_THRESHOLD = 0.4;
const LABELS: RegionLabel[] = ['bubble', 'text_bubble', 'text_free'];
// 超過這個寬度先縮小再辨識：漫畫的字在這個寬度下已經夠大，再大只是變慢
const MAX_WIDTH = 1600;
// 比這窄的先放大到這個寬度（最多放大 MAX_UPSCALE 倍）
const MIN_WIDTH = 1200;
const MAX_UPSCALE = 2.5;
// 整頁 OCR 找字時輸入的最長邊上限：比這大才縮小。一塊最大是 MAX_WIDTH 寬、兩倍高（見 tiles.ts）
const DETECT_MAX_SIDE = MAX_WIDTH * 2;

ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/');
// 多執行緒 WASM 需要跨來源隔離（manifest 的 COOP／COEP）；沒有隔離時只能單執行緒
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)) : 1;

export class ModelDownloadError extends Error {}

type ProgressFn = (loaded: number, total: number) => void;

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function readWithProgress(response: Response, onChunk: (bytes: number) => void): Promise<ArrayBuffer> {
    if (!response.body) {
        const buffer = await response.arrayBuffer();
        onChunk(buffer.byteLength);
        return buffer;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        length += value.byteLength;
        onChunk(value.byteLength);
    }
    const out = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out.buffer;
}

/**
 * 從快取或網路取得模型；從網路下載的先比對 SHA-256，對不上就不存、不用
 */
async function loadModel(file: ModelFile, onChunk: (bytes: number) => void): Promise<ArrayBuffer> {
    const cache = await caches.open(MODEL_CACHE);
    const cached = await cache.match(file.url);
    if (cached) return cached.arrayBuffer();
    let response: Response;
    try {
        response = await fetch(file.url, { credentials: 'omit' });
    } catch (error) {
        throw new ModelDownloadError(String(error));
    }
    if (!response.ok) throw new ModelDownloadError(`HTTP ${response.status} ${file.url}`);
    const buffer = await readWithProgress(response, onChunk);
    if ((await sha256Hex(buffer)) !== file.sha256) {
        throw new ModelDownloadError(`checksum mismatch ${file.url}`);
    }
    await cache.put(file.url, new Response(buffer));
    return buffer;
}

async function isCached(file: ModelFile): Promise<boolean> {
    const cache = await caches.open(MODEL_CACHE);
    return Boolean(await cache.match(file.url));
}

/**
 * 一次載入多個模型，合併回報下載進度（已經在快取裡的不算進總量）
 */
async function loadModels(files: ModelFile[], onProgress: ProgressFn): Promise<ArrayBuffer[]> {
    const missing = await Promise.all(files.map(async (file) => !(await isCached(file))));
    const total = files.reduce((sum, file, i) => sum + (missing[i] ? file.size : 0), 0);
    let loaded = 0;
    if (total > 0) onProgress(0, total);
    return Promise.all(files.map((file) => loadModel(file, (bytes) => {
        loaded += bytes;
        onProgress(Math.min(loaded, total), total);
    })));
}

let detectorSession: ort.InferenceSession | null = null;
const ocrServices = new Map<SourceLang, PaddleOcrService>();

async function prepare(lang: SourceLang, onProgress: ProgressFn): Promise<{ detector: ort.InferenceSession; ocr: PaddleOcrService }> {
    const set = OCR_MODELS[lang];
    const needDetector = !detectorSession;
    const needOcr = !ocrServices.has(lang);
    const files = [...(needDetector ? [DETECTOR_MODEL] : []), ...(needOcr ? [set.detection, set.recognition, set.dictionary] : [])];
    const buffers = await loadModels(files, onProgress);
    if (needDetector) {
        detectorSession = await ort.InferenceSession.create(new Uint8Array(buffers.shift()!), { executionProviders: ['wasm'] });
    }
    if (needOcr) {
        const [detection, recognition, charactersDictionary] = buffers;
        const service = new PaddleOcrService({
            model: { detection, recognition, charactersDictionary },
            session: { executionProviders: ['wasm'], graphOptimizationLevel: 'all' },
            // 找字時不要先縮小：預設會把最長邊縮到 75%，小字的框切得太緊，行尾的字和「…」被切掉
            // （實測：「저 누나한테」讀成「저누나한」、「기회인가…?」讀成「기회가?」）。只能在這裡設，每次呼叫傳的會被忽略
            detection: { maxSideLength: DETECT_MAX_SIDE },
            // 型別把 charactersDictionary 標成必填，實際上 initialize() 會用 model.charactersDictionary 解析後填入
            recognition: { mainThreadYieldMs: 0 } as RecognitionOptions
        });
        await service.initialize();
        ocrServices.set(lang, service);
    }
    return { detector: detectorSession!, ocr: ocrServices.get(lang)! };
}

/**
 * 對話框偵測：圖片直接拉伸成 640×640（模型訓練時就是 resize 不裁切），RGB / 255，CHW
 */
async function detectRegions(session: ort.InferenceSession, canvas: OffscreenCanvas): Promise<Region[]> {
    const small = new OffscreenCanvas(DETECTOR_INPUT, DETECTOR_INPUT);
    const ctx = small.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0, DETECTOR_INPUT, DETECTOR_INPUT);
    const { data } = ctx.getImageData(0, 0, DETECTOR_INPUT, DETECTOR_INPUT);
    const plane = DETECTOR_INPUT * DETECTOR_INPUT;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
        input[i] = data[i * 4] / 255;
        input[plane + i] = data[i * 4 + 1] / 255;
        input[2 * plane + i] = data[i * 4 + 2] / 255;
    }
    const out = await session.run({
        images: new ort.Tensor('float32', input, [1, 3, DETECTOR_INPUT, DETECTOR_INPUT]),
        orig_target_sizes: new ort.Tensor('int64', BigInt64Array.from([BigInt(canvas.width), BigInt(canvas.height)]), [1, 2])
    });
    const scores = out.scores.data as Float32Array;
    const labels = out.labels.data as BigInt64Array;
    const boxes = out.boxes.data as Float32Array;
    const regions: Region[] = [];
    for (let i = 0; i < scores.length; i++) {
        const label = LABELS[Number(labels[i])];
        if (scores[i] < DETECTOR_THRESHOLD || !label) continue;
        const box = Array.from(boxes.slice(i * 4, i * 4 + 4), (v) => Math.round(v)) as Box;
        regions.push({ label, score: scores[i], box });
    }
    return regions;
}

async function recognizeLines(ocr: PaddleOcrService, canvas: OffscreenCanvas): Promise<OcrLine[]> {
    const result = await ocr.recognize(canvas as unknown as HTMLCanvasElement, { flatten: true, noCache: true });
    return result.results.map((item: { text: string; box: { x: number; y: number; width: number; height: number }; confidence: number }) => ({
        text: item.text,
        box: [item.box.x, item.box.y, item.box.x + item.box.width, item.box.y + item.box.height] as Box,
        confidence: item.confidence
    }));
}

async function loadCanvas(dataUrl: string): Promise<OffscreenCanvas> {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    // 太大的縮小；太小的（擷取畫面時圖片被縮到視窗大小，小字只剩十幾像素）先放大再辨識
    const scale = bitmap.width > MAX_WIDTH ? MAX_WIDTH / bitmap.width : bitmap.width < MIN_WIDTH ? Math.min(MAX_UPSCALE, MIN_WIDTH / bitmap.width) : 1;
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
}

function cropTile(canvas: OffscreenCanvas, top: number, height: number): OffscreenCanvas {
    if (top === 0 && height === canvas.height) return canvas;
    const tile = new OffscreenCanvas(canvas.width, height);
    tile.getContext('2d')!.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
    return tile;
}

// 直排區塊裁切時留的邊（外框會碰到邊緣，切欄前會被清掉）
const VERTICAL_PAD = 6;
// 欄寬（約等於字的大小）小於這個就放大排出來的橫行，放大到 TARGET_GLYPH_PX，最多 MAX_GLYPH_ZOOM 倍
const SMALL_GLYPH_PX = 36;
const TARGET_GLYPH_PX = 44;
const MAX_GLYPH_ZOOM = 3;
// 直排排成的橫行：每行上下留白、批次辨識時一張圖的高度上限
const ROW_PAD = 6;
const STACK_MAX_HEIGHT = 1600;

function grayOf(canvas: OffscreenCanvas, [x0, y0, x1, y1]: Box): { data: Uint8Array; width: number; height: number } {
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    const { data } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, width, height);
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    return { data: gray, width, height };
}

interface VerticalPlan {
    crop: Box;
    columns: Column[];
    // 字太小時排出來的橫行要放大的倍數
    zoom: number;
}

/** 判斷一個文字區塊是不是直排；是就切好欄（還不辨識），不是回傳 null */
function planVertical(tile: OffscreenCanvas, region: Region): VerticalPlan | null {
    const [rx0, ry0, rx1, ry1] = region.box;
    const crop: Box = [Math.max(0, rx0 - VERTICAL_PAD), Math.max(0, ry0 - VERTICAL_PAD), Math.min(tile.width, rx1 + VERTICAL_PAD), Math.min(tile.height, ry1 + VERTICAL_PAD)];
    const gray = grayOf(tile, crop);
    const mask = inkMask(gray);
    if (orientation(mask, gray.width, gray.height) !== 'vertical') return null;
    const columns = verticalColumns(mask, gray.width, gray.height);
    if (columns.length === 0) return null;
    // 字太小（擷取畫面時常只有二十幾像素）就把排出來的橫行放大再辨識：實測把「ちキ」讀對成「ちゃ」
    const cells = columns.map((column) => column.glyphSize).sort((a, b) => a - b);
    const typicalCell = cells[Math.floor(cells.length / 2)];
    const zoom = typicalCell > 0 && typicalCell < SMALL_GLYPH_PX ? Math.min(MAX_GLYPH_ZOOM, TARGET_GLYPH_PX / typicalCell) : 1;
    return { crop, columns, zoom };
}

interface RowLayout {
    plan: VerticalPlan;
    column: Column;
    cell: number;
    sizes: { w: number; h: number }[];
    height: number;
    width: number;
}

function layoutRow(plan: VerticalPlan, column: Column): RowLayout {
    const { zoom } = plan;
    const cell = column.glyphSize * zoom;
    const sizes = column.glyphs.map((g) => (g.rotate ? { w: (g.y1 - g.y0) * zoom, h: (g.x1 - g.x0) * zoom } : { w: (g.x1 - g.x0) * zoom, h: (g.y1 - g.y0) * zoom }));
    const height = Math.round(Math.max(cell * 1.3, ...sizes.map((size) => size.h)) + ROW_PAD * 2);
    const width = Math.round(sizes.reduce((sum, size) => sum + size.w + cell * 0.12, ROW_PAD * 2));
    return { plan, column, cell, sizes, height, width };
}

/** 把一批橫行上下疊成一張圖：每一欄的字立正排成一行 */
function drawRows(tile: OffscreenCanvas, rows: RowLayout[]): { canvas: OffscreenCanvas; centers: number[] } {
    const gap = Math.max(...rows.map((row) => row.height)) * 0.6;
    const canvas = new OffscreenCanvas(Math.max(...rows.map((row) => row.width)), Math.round(rows.reduce((sum, row) => sum + row.height + gap, gap)));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const centers: number[] = [];
    let y = gap;
    for (const { plan, column, cell, sizes, height } of rows) {
        let x = ROW_PAD;
        column.glyphs.forEach((g, i) => {
            const { w, h } = sizes[i];
            const top = y + (height - h) / 2;
            const sx = plan.crop[0] + g.x0;
            const sy = plan.crop[1] + g.y0;
            const sw = g.x1 - g.x0;
            const sh = g.y1 - g.y0;
            if (g.rotate) {
                // 直排的長音、刪節號轉成橫的
                ctx.save();
                ctx.translate(x + w, top);
                ctx.rotate(Math.PI / 2);
                ctx.drawImage(tile, sx, sy, sw, sh, 0, 0, sw * plan.zoom, sh * plan.zoom);
                ctx.restore();
            } else {
                ctx.drawImage(tile, sx, sy, sw, sh, x, top, w, h);
            }
            x += w + cell * 0.12;
        });
        centers.push(y + height / 2);
        y += height + gap;
    }
    return { canvas, centers };
}

/**
 * 直排辨識：這一頁所有直排區塊的每一欄，各自排成一橫行，疊成幾張圖批次辨識（以前一個區塊辨識一次，
 * 一頁十幾個對話框要將近兩秒）；讀回來的行依高度對回是哪一欄。每張圖不超過 STACK_MAX_HEIGHT，
 * 太高的圖辨識函式庫會先縮小，小字就讀不出來。
 */
async function recognizeColumns(ocr: PaddleOcrService, tile: OffscreenCanvas, plans: VerticalPlan[]): Promise<OcrLine[]> {
    const rows = plans.flatMap((plan) => plan.columns.map((column) => layoutRow(plan, column)));
    const batches: RowLayout[][] = [];
    let current: RowLayout[] = [];
    let height = 0;
    for (const row of rows) {
        if (current.length > 0 && height + row.height * 1.6 > STACK_MAX_HEIGHT) {
            batches.push(current);
            current = [];
            height = 0;
        }
        current.push(row);
        height += row.height * 1.6;
    }
    if (current.length > 0) batches.push(current);

    const lines: OcrLine[] = [];
    for (const batch of batches) {
        const { canvas, centers } = drawRows(tile, batch);
        const result = await ocr.recognize(canvas as unknown as HTMLCanvasElement, { flatten: true, noCache: true });
        const perRow: { text: string; x: number; confidence: number }[][] = batch.map(() => []);
        for (const item of result.results as { text: string; box: { x: number; y: number; width: number; height: number }; confidence: number }[]) {
            const center = item.box.y + item.box.height / 2;
            let row = 0;
            for (let i = 1; i < centers.length; i++) if (Math.abs(centers[i] - center) < Math.abs(centers[row] - center)) row = i;
            perRow[row].push({ text: item.text, x: item.box.x, confidence: item.confidence });
        }
        batch.forEach(({ plan, column }, i) => {
            const items = perRow[i].sort((a, b) => a.x - b.x);
            const text = items.map((item) => item.text).join('');
            if (!text.trim()) return;
            lines.push({
                text,
                box: [plan.crop[0] + column.x0, plan.crop[1] + column.y0, plan.crop[0] + column.x1, plan.crop[1] + column.y1],
                confidence: items.reduce((sum, item) => sum + item.confidence, 0) / items.length
            });
        });
    }
    return lines;
}

function copyCanvas(source: OffscreenCanvas): OffscreenCanvas {
    const copy = new OffscreenCanvas(source.width, source.height);
    copy.getContext('2d')!.drawImage(source, 0, 0);
    return copy;
}

/** 一塊（整頁或長條圖的一段）：直排區塊切欄辨識，其餘用整頁 OCR 的結果 */
async function recognizeTile(ocr: PaddleOcrService, tile: OffscreenCanvas, regions: Region[]): Promise<OcrLine[]> {
    // 直排先做，而且整頁 OCR 給它一份複本：辨識函式庫會在傳進去的畫布上畫前處理的結果，
    // 原本的畫布被改過之後，直排區塊讀到的像素就不對了（實際遇過：頁面上半部的直排對話框全部讀不到）
    const textRegions = regions.filter((region) => region.label !== 'bubble');
    const plans = new Map<Region, VerticalPlan>();
    for (const region of textRegions) {
        const plan = planVertical(tile, region);
        if (plan) plans.set(region, plan);
    }
    const verticalLines = plans.size > 0 ? await recognizeColumns(ocr, tile, [...plans.values()]) : [];
    // 整頁的文字區塊全是直排（日文漫畫常見）：不用再跑整頁 OCR，省下大約三分之一的時間
    if (textRegions.length > 0 && plans.size === textRegions.length) return verticalLines;

    const lines = await recognizeLines(ocr, copyCanvas(tile));
    // 整頁 OCR 在直排區塊裡讀到的多半是亂碼，換成切欄辨識的結果。亂碼常是一個蓋住整個對話框的大框，
    // 所以從兩邊看：這行大半落在區塊裡，或區塊有一部分被這行蓋住，都丟掉
    const verticalRegions = [...plans.keys()];
    const outside = lines.filter((line) => verticalRegions.every((region) => {
        const overlap = intersection(line.box, region.box);
        return overlap / Math.max(1, boxArea(line.box)) < 0.5 && overlap / Math.max(1, boxArea(region.box)) < 0.3;
    }));
    return [...outside, ...verticalLines];
}

async function analyzeWith(canvas: OffscreenCanvas, lang: SourceLang, onProgress: ProgressFn): Promise<ImageAnalysis> {
    const { detector, ocr } = await prepare(lang, onProgress);
    const regions: Region[] = [];
    const lines: OcrLine[] = [];
    for (const { top, height } of planTiles(canvas.width, canvas.height)) {
        const tile = cropTile(canvas, top, height);
        const tileRegions = await detectRegions(detector, tile);
        for (const region of tileRegions) regions.push({ ...region, box: shiftBox(region.box, top) });
        for (const line of await recognizeTile(ocr, tile, tileRegions)) lines.push({ ...line, box: shiftBox(line.box, top) });
    }
    return {
        width: canvas.width,
        height: canvas.height,
        regions: dedupeBoxes(regions, (a, b) => a.label === b.label),
        // 文字行只去掉「同一行在兩塊重疊區各讀一次」：大小相近、幾乎完全重疊。不能用包含關係，
        // 否則一個大的亂碼框會把裡面真正的字行當成重複刪掉（實際遇過）
        lines: dedupeOverlapping(lines)
    };
}

/**
 * 分析一張圖：太長的圖切成重疊的幾塊分別偵測與辨識，再合併、去掉重疊區重複的框。
 * 回傳的座標是「縮放後」那張圖的座標，width／height 也是縮放後的尺寸。
 *
 * lang 為 'auto' 時自動判斷原文語言：先試 hint（同一部作品上一頁判斷出的語言），讀出來不像那個語言
 * 就依讀到的字換下一個語言（見 lang-detect.ts），都不過關就用最像的那個。
 */
export async function analyzeImage(dataUrl: string, lang: SourceLang | 'auto', hint: SourceLang | undefined, onProgress: ProgressFn): Promise<ImageAnalysis & { lang: SourceLang }> {
    const canvas = await loadCanvas(dataUrl);
    if (lang !== 'auto') return { ...(await analyzeWith(canvas, lang, onProgress)), lang };

    const tried: SourceLang[] = [];
    let best: { analysis: ImageAnalysis; verdict: LangVerdict } | null = null;
    let candidate: SourceLang | null = hint ?? 'ja';
    while (candidate) {
        tried.push(candidate);
        const analysis = await analyzeWith(canvas, candidate, onProgress);
        const textRegions = analysis.regions.filter((region) => region.label !== 'bubble').length;
        // 沒有任何文字區塊：不用再試別的語言
        if (textRegions === 0) return { ...analysis, lang: candidate };
        const texts = groupLines(analysis, candidate).map((block) => block.text);
        const verdict = judge(candidate, texts, textRegions);
        if (verdict.accepted) return { ...analysis, lang: candidate };
        if (!best || verdict.score > best.verdict.score) best = { analysis, verdict };
        candidate = nextCandidate(texts, tried);
    }
    return { ...best!.analysis, lang: best!.verdict.lang };
}
