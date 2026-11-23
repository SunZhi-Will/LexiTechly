/**
 * 框選翻譯的純函式：選取範圍換算、裁切範圍、組成區塊、併回原本的譯文
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegionBlock, regionBlock, selectionInCoverage, selectionOnImage } from '../src/scripts/image-translate/region';
import type { TranslatedBlock } from '../src/scripts/image-translate/protocol';

const close = (actual: number[], expected: number[]) => actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-6, `${actual} ≈ ${expected}`));

test('畫面上的框換成占圖片的比例，超出圖片的部分裁掉', () => {
    const image = { x: 100, y: 50, width: 400, height: 800 };
    const inside = selectionOnImage({ x: 200, y: 250, width: 100, height: 200 }, image)!;
    close([inside.left, inside.top, inside.width, inside.height], [0.25, 0.25, 0.25, 0.25]);
    const clipped = selectionOnImage({ x: 0, y: 0, width: 200, height: 250 }, image)!;
    close([clipped.left, clipped.top, clipped.width, clipped.height], [0, 0, 0.25, 0.25]);
    assert.equal(selectionOnImage({ x: 600, y: 0, width: 50, height: 50 }, image), null);
});

test('選取範圍換成占分析圖的比例；整張圖時不變，只擷取一部分時換算', () => {
    const selection = { left: 0.2, top: 0.5, width: 0.2, height: 0.1 };
    const full = selectionInCoverage(selection, { left: 0, top: 0, width: 1, height: 1 })!;
    close([full.left, full.top, full.width, full.height], [0.2, 0.5, 0.2, 0.1]);
    const half = selectionInCoverage(selection, { left: 0, top: 0.4, width: 1, height: 0.5 })!;
    close([half.left, half.top, half.width, half.height], [0.2, 0.2, 0.2, 0.2]);
});

test('選取範圍大半不在分析過的那塊裡：回傳 null', () => {
    assert.equal(selectionInCoverage({ left: 0.2, top: 0.85, width: 0.2, height: 0.1 }, { left: 0, top: 0, width: 1, height: 0.88 }), null);
    assert.equal(selectionInCoverage({ left: 0.2, top: 0.95, width: 0.2, height: 0.05 }, { left: 0, top: 0, width: 1, height: 0.5 }), null);
});

test('框裡讀到的字組成一個區塊，座標換回整張分析圖；框外文字的門檻不適用', () => {
    // 裁切範圍是 1000×2000 這張圖的 (100, 200)–(300, 400)；辨識時放大成 400×400
    const block = regionBlock(
        {
            width: 400,
            height: 400,
            lines: [
                { text: '短', box: [40, 40, 360, 120], confidence: 0.3 },
                { text: '句', box: [40, 200, 200, 280], confidence: 0.3 }
            ]
        },
        { left: 0.1, top: 0.1, width: 0.2, height: 0.1 },
        { width: 1000, height: 2000 },
        'zh'
    )!;
    assert.equal(block.text, '短句');
    assert.equal(block.label, 'text_bubble');
    close(block.box, [120, 220, 280, 340]);
    close(block.bubbleBox!, [100, 200, 300, 400]);
});

test('框裡沒有讀到字：回傳 null', () => {
    assert.equal(regionBlock({ width: 100, height: 100, lines: [{ text: '  ', box: [0, 0, 10, 10], confidence: 1 }] }, { left: 0, top: 0, width: 1, height: 1 }, { width: 100, height: 100 }, 'ja'), null);
});

const translated = (box: [number, number, number, number], translation: string, bubbleBox: [number, number, number, number] | null = null): TranslatedBlock => ({
    label: 'text_bubble', box, bubbleBox, text: translation, confidence: 1, vertical: false, fontHint: 20, translation
});

test('併回原本的譯文：大半在框裡的舊區塊換掉，其他保留', () => {
    const old = [translated([100, 100, 200, 150], '翻錯的'), translated([400, 400, 500, 450], '別的對話框')];
    const merged = mergeRegionBlock(old, translated([110, 105, 190, 145], '新的', [90, 90, 210, 160]));
    assert.deepEqual(merged.map((b) => b.translation), ['別的對話框', '新的']);
});

test('併回原本的譯文：只沾到邊的舊區塊保留', () => {
    const old = [translated([100, 100, 200, 200], '旁邊的')];
    const merged = mergeRegionBlock(old, translated([180, 180, 260, 260], '新的', [180, 180, 260, 260]));
    assert.deepEqual(merged.map((b) => b.translation), ['旁邊的', '新的']);
});
