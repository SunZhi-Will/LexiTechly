/**
 * 把譯文畫回圖上：抹掉原文、在原位置排上譯文（在內容腳本的 canvas 上畫，用的是使用者電腦上的字型）
 *
 * - 對話框內：取區塊內最多的顏色填滿（白底對話框幾乎看不出痕跡）
 * - 框外文字：半透明圓角底色（畫面上的字背後是圖，填單色會很突兀，P4 再換修補演算法）
 * - 字色：背景亮就用區塊內最深的顏色，背景暗就用白字加黑邊
 * - 原文是直排、譯文是中文或日文：譯文也直排（由右而左），英文一律橫排
 */

import type { Locale } from './i18n';
import { layoutBoxes } from './group';
import type { Box, TranslatedBlock } from './protocol';
import { COLUMN_SPACING, LINE_HEIGHT, VERTICAL_ADVANCE, fitText, fitVertical } from './typeset';

const FONT_FAMILY: Record<Locale, string> = {
    'zh-TW': '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif',
    'zh-CN': '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", "Heiti SC", sans-serif',
    ja: '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif',
    en: '"Segoe UI", system-ui, -apple-system, sans-serif'
};
// 抹字範圍比原文區塊外擴幾像素，蓋掉字的反鋸齒邊緣
const ERASE_PAD = 6;

interface Palette {
    background: string;
    foreground: string;
    backgroundIsLight: boolean;
}

function luminance(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function samplePalette(ctx: CanvasRenderingContext2D, [x0, y0, x1, y1]: Box): Palette {
    const width = Math.max(1, Math.round(x1 - x0));
    const height = Math.max(1, Math.round(y1 - y0));
    const { data } = ctx.getImageData(Math.round(x0), Math.round(y0), width, height);
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    let darkest = { lum: Infinity, rgb: [0, 0, 0] };
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // 每個通道量化成 16 階再數，避免 JPEG 雜訊把同一種白分散成幾百種
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        bucket.n++;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        buckets.set(key, bucket);
        const lum = luminance(r, g, b);
        if (lum < darkest.lum) darkest = { lum, rgb: [r, g, b] };
    }
    let top = { n: 0, r: 255, g: 255, b: 255 };
    for (const bucket of buckets.values()) if (bucket.n > top.n) top = bucket;
    const bg = top.n ? [top.r / top.n, top.g / top.n, top.b / top.n].map(Math.round) : [255, 255, 255];
    const backgroundIsLight = luminance(bg[0], bg[1], bg[2]) > 128;
    const fg = backgroundIsLight ? darkest.rgb : [255, 255, 255];
    return { background: `rgb(${bg.join(',')})`, foreground: `rgb(${fg.join(',')})`, backgroundIsLight };
}

function clampBox([x0, y0, x1, y1]: Box, width: number, height: number, pad: number): Box {
    return [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(width, x1 + pad), Math.min(height, y1 + pad)];
}

// 直排時要轉 90 度的字：長音、破折號、刪節號、括號、英數字（直排時英數字側躺）
const ROTATE_IN_VERTICAL = /[ー\u2014\u2013\-~～…‥（）()「」『』【】〈〉《》\[\]{}｛｝:：;；=＝_A-Za-z0-9]/;
// 直排時放在字格右上角的標點
const TOP_RIGHT_IN_VERTICAL = /[，。、．,.]/;

export interface DrawOptions {
    // 字級下限（畫布像素）：依圖片實際顯示的大小換算，確保畫面上看得清楚
    minFont?: number;
}

export function drawTranslations(ctx: CanvasRenderingContext2D, blocks: TranslatedBlock[], locale: Locale, options: DrawOptions = {}): void {
    const { width, height } = ctx.canvas;
    const family = FONT_FAMILY[locale];
    const fontAt = (size: number) => `600 ${size}px ${family}`;
    const measure = (text: string, size: number) => {
        ctx.font = fontAt(size);
        return ctx.measureText(text).width;
    };

    // 字級：不比原文大（上限是原文字大小的 1.1 倍），也不小於畫面上看得清楚的下限
    const fitOptions = (block: TranslatedBlock) => ({
        minFont: options.minFont,
        maxFont: block.fontHint > 0 ? Math.max(options.minFont ?? 0, Math.round(block.fontHint * 1.1)) : undefined
    });

    // 先把所有原文抹掉、再一起排譯文：邊抹邊畫的話，後面區塊抹字的底色會蓋到前面已經畫好的譯文
    const shown = blocks.filter((block) => block.translation.trim());
    const areas = layoutBoxes(shown);
    const palettes = shown.map((block) => {
        const erase = clampBox(block.box, width, height, ERASE_PAD);
        return { erase, palette: samplePalette(ctx, erase) };
    });
    shown.forEach((block, index) => {
        const { erase, palette } = palettes[index];
        ctx.fillStyle = palette.background;
        if (block.label === 'text_free') {
            ctx.globalAlpha = 0.92;
            ctx.beginPath();
            ctx.roundRect(erase[0], erase[1], erase[2] - erase[0], erase[3] - erase[1], 10);
            ctx.fill();
            ctx.globalAlpha = 1;
        } else {
            ctx.fillRect(erase[0], erase[1], erase[2] - erase[0], erase[3] - erase[1]);
        }
    });

    shown.forEach((block, index) => {
        const { palette } = palettes[index];
        const area = areas[index];
        const boxWidth = area[2] - area[0];
        const boxHeight = area[3] - area[1];
        const centerX = (area[0] + area[2]) / 2;
        const centerY = (area[1] + area[3]) / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = palette.foreground;
        const draw = (text: string, x: number, y: number, size: number) => {
            if (!palette.backgroundIsLight) {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
                ctx.lineWidth = Math.max(2, size / 7);
                ctx.lineJoin = 'round';
                ctx.strokeText(text, x, y);
            }
            ctx.fillText(text, x, y);
        };

        if (block.vertical && locale !== 'en') {
            const { fontSize, columns } = fitVertical(block.translation, boxWidth, boxHeight, fitOptions(block));
            ctx.font = fontAt(fontSize);
            const columnWidth = fontSize * COLUMN_SPACING;
            const advance = fontSize * VERTICAL_ADVANCE;
            const longest = Math.max(...columns.map((column) => column.length));
            const firstX = centerX + ((columns.length - 1) * columnWidth) / 2;
            const firstY = centerY - ((longest - 1) * advance) / 2;
            columns.forEach((column, c) => {
                const x = firstX - c * columnWidth;
                column.forEach((ch, i) => {
                    const y = firstY + i * advance;
                    if (ROTATE_IN_VERTICAL.test(ch)) {
                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate(Math.PI / 2);
                        draw(ch, 0, 0, fontSize);
                        ctx.restore();
                    } else if (TOP_RIGHT_IN_VERTICAL.test(ch)) {
                        draw(ch, x + fontSize * 0.32, y - fontSize * 0.32, fontSize);
                    } else {
                        draw(ch, x, y, fontSize);
                    }
                });
            });
            return;
        }

        const { fontSize, lines } = fitText(block.translation, boxWidth, boxHeight, measure, fitOptions(block));
        ctx.font = fontAt(fontSize);
        const firstY = centerY - ((lines.length - 1) * fontSize * LINE_HEIGHT) / 2;
        lines.forEach((line, i) => draw(line, centerX, firstY + i * fontSize * LINE_HEIGHT, fontSize));
    });
}
