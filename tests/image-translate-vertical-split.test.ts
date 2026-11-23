/**
 * 直排切欄：黏在一起的兩欄要在低谷切開，本來就寬的一欄（大字）不切
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitWideColumns } from '../src/scripts/image-translate/vertical';

const W = 100;
const H = 60;

function maskWith(fill: (x: number, y: number) => boolean): Uint8Array {
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = fill(x, y) ? 1 : 0;
    return mask;
}

test('兩欄之間只剩一點點墨跡：在低谷切開', () => {
    // 10–20 是一欄；30–50 是兩欄黏在一起（39–40 只有零星墨跡）；60–70 是一欄
    const mask = maskWith((x, y) => (x >= 10 && x < 20) || (x >= 30 && x < 39) || (x >= 41 && x < 50) || (x >= 60 && x < 70) || ((x === 39 || x === 40) && y === 5));
    const parts = splitWideColumns(mask, W, H, [{ start: 10, end: 20 }, { start: 30, end: 50 }, { start: 60, end: 70 }]);
    assert.equal(parts.length, 4);
    assert.ok(parts[1].end <= 41 && parts[2].start >= 39, JSON.stringify(parts));
});

test('本來就寬的一欄（中間墨跡很多）：不切', () => {
    const mask = maskWith((x) => (x >= 10 && x < 20) || (x >= 30 && x < 50) || (x >= 60 && x < 70));
    const parts = splitWideColumns(mask, W, H, [{ start: 10, end: 20 }, { start: 30, end: 50 }, { start: 60, end: 70 }]);
    assert.deepEqual(parts, [{ start: 10, end: 20 }, { start: 30, end: 50 }, { start: 60, end: 70 }]);
});

test('只有一欄：不切', () => {
    const mask = maskWith((x) => x >= 30 && x < 50);
    assert.deepEqual(splitWideColumns(mask, W, H, [{ start: 30, end: 50 }]), [{ start: 30, end: 50 }]);
});
