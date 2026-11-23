/**
 * 長條圖（條漫）切塊：純函式
 *
 * 對話框偵測模型的輸入固定是 640×640，OCR 也會把長邊縮到 1920 以內；一張 800×20000 的條漫整張丟進去，
 * 字會被縮到看不見。所以太長的圖切成上下重疊的幾塊分別處理，再把結果換回整張圖的座標、去掉重疊區重複的框。
 */

import type { Box } from './protocol';

export interface Tile {
    top: number;
    height: number;
}

// 高度超過寬度這麼多倍才切；一般漫畫頁約 1.4 倍，不切
const SPLIT_RATIO = 2;
// 每塊的高度約為寬度的 1.4 倍（接近一般漫畫頁的比例，偵測模型在這個比例下最準）
const TILE_RATIO = 1.4;
// 相鄰兩塊重疊的比例：對話框被切在邊界時，至少有一塊能完整包住它
const OVERLAP_RATIO = 0.25;

export function planTiles(width: number, height: number): Tile[] {
    if (height <= width * SPLIT_RATIO) {
        return [{ top: 0, height }];
    }
    const tileHeight = Math.round(width * TILE_RATIO);
    const step = Math.round(tileHeight * (1 - OVERLAP_RATIO));
    const tiles: Tile[] = [];
    for (let top = 0; ; top += step) {
        if (top + tileHeight >= height) {
            tiles.push({ top: Math.max(0, height - tileHeight), height: Math.min(tileHeight, height) });
            break;
        }
        tiles.push({ top, height: tileHeight });
    }
    return tiles;
}

export function shiftBox(box: Box, dy: number): Box {
    return [box[0], box[1] + dy, box[2], box[3] + dy];
}

export function boxArea(box: Box): number {
    return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}

export function intersection(a: Box, b: Box): number {
    const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    return w > 0 && h > 0 ? w * h : 0;
}

/**
 * 去掉幾乎完全重疊的框（IoU ≥ 0.5）：同一行字在相鄰兩塊的重疊區各讀到一次。留面積大的那個
 */
export function dedupeOverlapping<T extends { box: Box }>(items: T[]): T[] {
    const sorted = [...items].sort((a, b) => boxArea(b.box) - boxArea(a.box));
    const kept: T[] = [];
    for (const item of sorted) {
        const duplicate = kept.some((other) => {
            const overlap = intersection(item.box, other.box);
            return overlap / Math.max(1, boxArea(item.box) + boxArea(other.box) - overlap) >= 0.5;
        });
        if (!duplicate) kept.push(item);
    }
    return kept;
}

/**
 * 去掉重疊區重複的框：兩個框有一個大部分被另一個包住，就是同一個東西被兩塊各看到一次；
 * 留下面積大的那個（被切在邊界的那一份只有一半，比較小）
 */
export function dedupeBoxes<T extends { box: Box }>(items: T[], sameKind: (a: T, b: T) => boolean = () => true): T[] {
    const sorted = [...items].sort((a, b) => boxArea(b.box) - boxArea(a.box));
    const kept: T[] = [];
    for (const item of sorted) {
        const area = boxArea(item.box);
        const duplicate = kept.some((other) => sameKind(item, other) && area > 0 && intersection(item.box, other.box) / area >= 0.7);
        if (!duplicate) kept.push(item);
    }
    return kept;
}
