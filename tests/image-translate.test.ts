/**
 * 右鍵翻譯圖片：切塊、分組、排版、Google 翻譯端點的純函式
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeBoxes, dedupeOverlapping, planTiles } from '../src/scripts/image-translate/tiles';
import { groupLines, layoutBox, layoutBoxes, shouldTranslate } from '../src/scripts/image-translate/group';
import { fitText, tokenize, wrapText, type Measure } from '../src/scripts/image-translate/typeset';
import {
    TranslateHttpError,
    buildTranslateUrl,
    chunkTexts,
    parseTranslateResponse,
    translateTexts
} from '../src/scripts/image-translate/google-translate';
import type { Box, Region } from '../src/scripts/image-translate/protocol';

// ---------- 切塊 ----------

test('一般漫畫頁不切塊', () => {
    assert.deepEqual(planTiles(1200, 1660), [{ top: 0, height: 1660 }]);
});

test('條漫切成重疊的塊，最後一塊貼齊底部、涵蓋整張圖', () => {
    const tiles = planTiles(800, 10000);
    assert.ok(tiles.length > 1);
    assert.equal(tiles[0].top, 0);
    const last = tiles[tiles.length - 1];
    assert.equal(last.top + last.height, 10000);
    for (let i = 1; i < tiles.length; i++) {
        // 相鄰兩塊一定有重疊，對話框被切在邊界時至少有一塊包得住
        assert.ok(tiles[i].top < tiles[i - 1].top + tiles[i - 1].height);
    }
});

test('重疊區被兩塊各看到一次的框只留大的那個', () => {
    const items = [
        { label: 'bubble', box: [10, 900, 200, 1100] as Box },
        { label: 'bubble', box: [10, 900, 200, 1000] as Box },
        { label: 'text_bubble', box: [20, 920, 190, 990] as Box }
    ];
    const kept = dedupeBoxes(items, (a, b) => a.label === b.label);
    assert.equal(kept.length, 2);
    assert.deepEqual(kept.find((x) => x.label === 'bubble')!.box, [10, 900, 200, 1100]);
});

// ---------- 分組 ----------

const regions: Region[] = [
    { label: 'bubble', score: 0.9, box: [100, 100, 400, 300] },
    { label: 'text_bubble', score: 0.9, box: [150, 140, 350, 260] },
    { label: 'text_free', score: 0.8, box: [500, 500, 700, 560] }
];

test('文字行依位置分給區塊，由上而下接起來；韓文以空白相接', () => {
    const blocks = groupLines({
        regions,
        lines: [
            { text: '데려다주는 거야?', box: [160, 200, 340, 230], confidence: 0.9 },
            { text: '당근아!', box: [200, 150, 300, 180], confidence: 0.95 }
        ]
    }, 'ko');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].text, '당근아! 데려다주는 거야?');
    assert.deepEqual(blocks[0].bubbleBox, [100, 100, 400, 300]);
});

test('中日文多行直接相接', () => {
    const blocks = groupLines({
        regions,
        lines: [
            { text: 'もう', box: [200, 150, 300, 180], confidence: 0.9 },
            { text: '最高！', box: [200, 190, 300, 220], confidence: 0.9 }
        ]
    }, 'ja');
    assert.equal(blocks[0].text, 'もう最高！');
});

test('沒讀到真正的字（只有標點）不翻，保留原圖', () => {
    assert.equal(shouldTranslate('text_bubble', '. . .', 0.9), false);
    assert.equal(shouldTranslate('text_bubble', '!!!', 0.99), false);
    assert.equal(shouldTranslate('text_bubble', '好！', 0.6), true);
    assert.equal(shouldTranslate('text_bubble', 'n', 0.95), false);
    assert.equal(shouldTranslate('text_bubble', ' I.', 0.95), false);
    assert.equal(shouldTranslate('text_bubble', 'Hey!', 0.95), true);
    assert.equal(shouldTranslate('text_bubble', '네', 0.6), true);
});

test('框外文字要信心夠高、字夠多才翻（手繪狀聲詞跳過）', () => {
    assert.equal(shouldTranslate('text_free', '짝', 0.95), false);
    assert.equal(shouldTranslate('text_free', '짝짝', 0.95), true);
    assert.equal(shouldTranslate('text_free', '코모나 시민 여러분', 0.6), false);
    assert.equal(shouldTranslate('text_free', '코모나 시민 여러분', 0.7), true);
});

test('不在任何區塊裡的行被丟掉', () => {
    const blocks = groupLines({ regions, lines: [{ text: '雜訊', box: [800, 800, 850, 820], confidence: 0.9 }] }, 'zh');
    assert.equal(blocks.length, 0);
});

test('排版範圍：對話框內縮後比原文大就用對話框', () => {
    assert.deepEqual(layoutBox({ box: [150, 140, 350, 260], bubbleBox: null }), [150, 140, 350, 260]);
    const area = layoutBox({ box: [200, 180, 300, 220], bubbleBox: [100, 100, 400, 300] });
    assert.deepEqual(area.map(Math.round), [145, 134, 355, 266]);
});

test('排版範圍不伸進別的區塊：兩段話在同一個對話框裡，各自切在對方的邊界', () => {
    const bubbleBox: Box = [100, 100, 400, 500];
    const [upper, lower] = layoutBoxes([
        { box: [200, 150, 300, 250], bubbleBox },
        { box: [200, 320, 300, 420], bubbleBox }
    ]);
    assert.equal(upper[3], 320);
    assert.equal(lower[1], 250);
    // 仍然用對話框的寬度，也一定包住自己的原文
    assert.ok(upper[0] < 200 && upper[2] > 300 && upper[1] <= 150);
    assert.ok(lower[3] >= 420);
});

test('排版範圍：兩個原文區塊本身疊在一起時只用自己的原文區塊', () => {
    const bubbleBox: Box = [100, 100, 400, 500];
    const [first] = layoutBoxes([
        { box: [200, 150, 300, 300], bubbleBox },
        { box: [250, 250, 350, 400], bubbleBox }
    ]);
    assert.deepEqual(first, [200, 150, 300, 300]);
});

// ---------- 排版 ----------

// 假的量字：每個字寬等於字級，空白算半個字
const measure: Measure = (text, size) => [...text].reduce((sum, ch) => sum + (ch === ' ' ? size / 2 : size), 0);

test('斷詞：英文單字不拆開，中日韓逐字', () => {
    assert.deepEqual(tokenize('Hi there'), ['Hi', ' ', 'there']);
    assert.deepEqual(tokenize('你好！'), ['你', '好', '！']);
});

test('逐字斷行，標點不放在行首', () => {
    const lines = wrapText('我帶了衣服。', 30, 10, measure);
    assert.deepEqual(lines, ['我帶了', '衣服。']);
    // 第三個字剛好放不下時，後面的句號跟著上一行，不會自己一行
    assert.deepEqual(wrapText('你好。', 20, 10, measure), ['你好。']);
});

test('找出塞得下的最大字級', () => {
    const { fontSize, lines } = fitText('紅蘿蔔好可愛', 100, 100, measure);
    assert.ok(lines.length * fontSize * 1.18 <= 100);
    assert.ok(lines.every((line) => measure(line, fontSize) <= 100));
    // 再大一級就塞不下
    const bigger = wrapText('紅蘿蔔好可愛', 100, fontSize + 1, measure);
    assert.ok(bigger.length * (fontSize + 1) * 1.18 > 100 || bigger.some((l) => measure(l, fontSize + 1) > 100));
});

// ---------- Google 翻譯端點 ----------

test('一段一個 q 參數', () => {
    const url = new URL(buildTranslateUrl(['안녕', '네'], 'ko', 'zh-TW'));
    assert.equal(url.pathname, '/translate_a/t');
    assert.deepEqual(url.searchParams.getAll('q'), ['안녕', '네']);
    assert.equal(url.searchParams.get('client'), 'gtx');
});

test('解析多段與單段回應', () => {
    assert.deepEqual(parseTranslateResponse([['你好', 'ko'], ['是', 'ko']], 2), ['你好', '是']);
    assert.deepEqual(parseTranslateResponse(['你好'], 1), ['你好']);
    assert.deepEqual(parseTranslateResponse(['你好', 'ko'], 1), ['你好']);
    assert.throws(() => parseTranslateResponse([['你好', 'ko']], 2));
    assert.throws(() => parseTranslateResponse('<html>', 1));
});

test('網址太長時分批', () => {
    const texts = Array.from({ length: 30 }, (_, i) => `${'가'.repeat(40)}${i}`);
    const chunks = chunkTexts(texts, 'ko', 'zh-TW', 2000);
    assert.ok(chunks.length > 1);
    assert.deepEqual(chunks.flat(), texts);
    for (const chunk of chunks) assert.ok(buildTranslateUrl(chunk, 'ko', 'zh-TW').length <= 2000);
});

test('空字串不送出，結果放回原本的位置；全部是空的就不發請求', async () => {
    const sent: string[][] = [];
    const fakeFetch = (async (input: string) => {
        const q = new URL(input).searchParams.getAll('q');
        sent.push(q);
        return { ok: true, status: 200, json: async () => q.map((text) => [`譯:${text}`, 'ko']) };
    }) as unknown as typeof fetch;
    assert.deepEqual(await translateTexts(['가', ' ', '나'], 'ko', 'zh-TW', fakeFetch), ['譯:가', '', '譯:나']);
    assert.deepEqual(sent, [['가', '나']]);
    assert.deepEqual(await translateTexts(['', '  '], 'ko', 'zh-TW', fakeFetch), ['', '']);
    assert.equal(sent.length, 1);
});

test('被擋下時丟出帶狀態碼的錯誤', async () => {
    const blocked = (async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as typeof fetch;
    await assert.rejects(translateTexts(['가'], 'ko', 'zh-TW', blocked), (error: unknown) => error instanceof TranslateHttpError && error.status === 429);
});

// ---------- 直排 ----------

import { clearBorderInk, inkMask, orientation, verticalColumns } from '../src/scripts/image-translate/vertical';
import { countScripts, judge, nextCandidate } from '../src/scripts/image-translate/lang-detect';

/** 畫一張白底的灰階圖，把指定的矩形塗黑（模擬字） */
function canvasWith(width: number, height: number, rects: [number, number, number, number][]) {
    const data = new Uint8Array(width * height).fill(255);
    for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = 0;
    return { data, width, height };
}

// 兩欄、每欄三個「字」（20×20 的方塊，字距 4），右欄在 x=60..80、左欄在 x=20..40
const twoColumns = canvasWith(100, 100, [
    [60, 10, 80, 30], [60, 34, 80, 54], [60, 58, 80, 78],
    [20, 10, 40, 30], [20, 34, 40, 54], [20, 58, 40, 78]
]);

test('直排：判斷為直排，欄由右而左、每欄切成三個字', () => {
    const mask = inkMask(twoColumns);
    assert.equal(orientation(mask, 100, 100), 'vertical');
    const columns = verticalColumns(mask, 100, 100);
    assert.equal(columns.length, 2);
    assert.equal(columns[0].x0, 60);
    assert.equal(columns[1].x0, 20);
    assert.deepEqual(columns.map((c) => c.glyphs.length), [3, 3]);
});

test('橫排：兩行各三個字判斷為橫排', () => {
    const rows = canvasWith(100, 100, [
        [10, 20, 30, 40], [34, 20, 54, 40], [58, 20, 78, 40],
        [10, 60, 30, 80], [34, 60, 54, 80], [58, 60, 78, 80]
    ]);
    assert.equal(orientation(inkMask(rows), 100, 100), 'horizontal');
});

test('字裡的空隙（像「三」）合併回一個字', () => {
    // 一欄 20 寬：一個字由三條橫線組成（中間有空隙），下面再一個實心字
    const img = canvasWith(60, 80, [[20, 5, 40, 8], [20, 13, 40, 16], [20, 21, 40, 24], [20, 30, 40, 50]]);
    const columns = verticalColumns(inkMask(img), 60, 80);
    assert.equal(columns.length, 1);
    assert.equal(columns[0].glyphs.length, 2);
});

test('直排的長音（細長直線）標成要轉 90 度', () => {
    const img = canvasWith(60, 80, [[20, 5, 40, 25], [28, 30, 32, 52]]);
    const glyphs = verticalColumns(inkMask(img), 60, 80)[0].glyphs;
    assert.equal(glyphs.length, 2);
    assert.equal(glyphs[0].rotate, false);
    assert.equal(glyphs[1].rotate, true);
});

test('碰到邊緣的墨跡（對話框外框）被清掉', () => {
    const mask = new Uint8Array(10 * 10);
    for (let y = 0; y < 10; y++) mask[y * 10] = 1; // 左邊整條外框
    mask[5 * 10 + 5] = 1; // 中間一個點
    const cleared = clearBorderInk(mask, 10, 10);
    assert.equal(cleared.reduce((a, b) => a + b, 0), 1);
    assert.equal(cleared[5 * 10 + 5], 1);
});

test('直排區塊的文字由右而左接起來', () => {
    const blocks = groupLines({
        regions: [{ label: 'text_bubble', score: 0.9, box: [0, 0, 100, 200] }],
        lines: [
            { text: 'えません', box: [10, 10, 30, 150], confidence: 0.9 },
            { text: '我が街の', box: [60, 10, 80, 150], confidence: 0.9 },
            { text: '女を忘れる', box: [35, 10, 55, 150], confidence: 0.9 }
        ]
    }, 'ja');
    assert.equal(blocks[0].text, '我が街の女を忘れるえません');
});

// ---------- 原文語言自動判斷 ----------

test('數各種文字', () => {
    assert.deepEqual(countScripts('당근아! もう最高'), { hangul: 3, kana: 2, han: 2, letters: 7 });
});

test('日文：有假名、大部分區塊讀得到才算', () => {
    assert.equal(judge('ja', ['もう最高！', 'コンテストに運べばいい'], 2).accepted, true);
    // 只有漢字：像中文，不算日文
    assert.equal(judge('ja', ['你能想到帶我去大賽現場', '讓人佩服'], 2).accepted, false);
    // 大部分區塊讀不到
    assert.equal(judge('ja', ['もう最高！'], 4).accepted, false);
});

test('韓文與中文的判斷', () => {
    assert.equal(judge('ko', ['당근아! 이런 귀여운 것', '좋았어'], 2).accepted, true);
    assert.equal(judge('ko', ['ㅋ', 'abc'], 2).accepted, false);
    assert.equal(judge('zh', ['你能想到帶我去大賽現場', '讓人佩服'], 2).accepted, true);
    assert.equal(judge('zh', ['もう最高', 'コンテスト'], 2).accepted, false);
});

test('沒過關時依讀到的字選下一個語言', () => {
    // 日文模型讀中文：漢字多、沒有假名 → 試中文，不必下載韓文模型
    assert.equal(nextCandidate(['你能想到帶我去大賽現場'], ['ja']), 'zh');
    // 讀到一堆假名 → 日文
    assert.equal(nextCandidate(['もうさいこう'], ['ko']), 'ja');
    // 幾乎讀不到字 → 依序試還沒試過的
    assert.equal(nextCandidate(['x'], ['ja']), 'ko');
    assert.equal(nextCandidate([], ['ja', 'ko', 'zh']), null);
});

test('文字行去重只看幾乎完全重疊的框：大框不會吃掉裡面的字行', () => {
    const lines = [
        { text: 'o', box: [0, 0, 300, 400] as Box },
        { text: '月明かりが', box: [100, 50, 125, 300] as Box },
        { text: '月明かりが', box: [101, 52, 125, 301] as Box }
    ];
    const kept = dedupeOverlapping(lines);
    assert.equal(kept.length, 2);
    assert.ok(kept.some((line) => line.text === '月明かりが'));
});

// ---------- 直排排版與字級下限 ----------

import { COLUMN_SPACING, fitVertical, splitColumns } from '../src/scripts/image-translate/typeset';

test('直排譯文：依每欄字數切欄，標點不放在欄首', () => {
    assert.deepEqual(splitColumns('親愛的米卡', 2), [['親', '愛'], ['的', '米'], ['卡']]);
    // 第三個字是句號：跟著上一欄，不自成一欄的開頭
    assert.deepEqual(splitColumns('你好。再見', 2), [['你', '好', '。'], ['再', '見']]);
});

test('直排譯文：欄數乘欄距不超過寬度，字級盡量大', () => {
    const text = '親愛的米卡今天非常感謝您';
    const { fontSize, columns } = fitVertical(text, 60, 200);
    assert.ok(columns.length * fontSize * COLUMN_SPACING <= 60);
    // 再大一級就放不下（同樣的切欄規則）
    const next = fontSize + 1;
    const nextColumns = splitColumns(text, Math.floor(200 / (next * 1.08)));
    assert.ok(nextColumns.length * next * COLUMN_SPACING > 60);
});

test('字級下限只是希望值：塞不下就繼續縮小，譯文不超出對話框', () => {
    const shrunk = fitText('這段譯文很長很長', 60, 40, measure, { minFont: 24 });
    assert.ok(shrunk.fontSize < 24);
    assert.ok(shrunk.lines.length * shrunk.fontSize * 1.18 <= 40);
    assert.ok(shrunk.lines.every((line) => measure(line, shrunk.fontSize) <= 60));
    const vertical = fitVertical('很長很長很長很長', 30, 40, { minFont: 22 });
    assert.ok(vertical.fontSize < 22);
    assert.ok(vertical.columns.length * vertical.fontSize * COLUMN_SPACING <= 30);
    // 放得下時照樣用希望的下限以上
    assert.ok(fitText('好', 100, 100, measure, { minFont: 24 }).fontSize >= 24);
});

test('直排譯文的最長一欄不超過對話框高度', () => {
    const { fontSize, columns } = fitVertical('親愛的朋友今天真的非常感謝你願意陪我一起來', 80, 120);
    const longest = Math.max(...columns.map((c) => c.length));
    assert.ok(longest * fontSize * 1.08 <= 120 + fontSize * 0.5);
});

test('直排區塊標記為直排，橫排的不是', () => {
    const regionsOnly = [{ label: 'text_bubble' as const, score: 0.9, box: [0, 0, 100, 200] as Box }];
    const vertical = groupLines({ regions: regionsOnly, lines: [{ text: 'もう最高', box: [40, 10, 60, 150], confidence: 0.9 }] }, 'ja');
    assert.equal(vertical[0].vertical, true);
    const horizontal = groupLines({ regions: regionsOnly, lines: [{ text: 'もう最高', box: [10, 40, 90, 60], confidence: 0.9 }] }, 'ja');
    assert.equal(horizontal[0].vertical, false);
});

// ---------- 譯文字級不超過原文 ----------

import { estimateFontSize } from '../src/scripts/image-translate/group';

test('估計原文字的大小：直排看欄寬、橫排看行高，取中位數', () => {
    const columns = [
        { text: 'a', box: [0, 0, 20, 200] as Box, confidence: 1 },
        { text: 'b', box: [30, 0, 52, 200] as Box, confidence: 1 },
        { text: 'c', box: [60, 0, 84, 100] as Box, confidence: 1 }
    ];
    assert.equal(estimateFontSize(columns, true), 22);
    assert.equal(estimateFontSize([{ text: 'x', box: [0, 0, 200, 30], confidence: 1 }], false), 24);
    assert.equal(estimateFontSize([], true), 0);
});

test('字級上限：對話框很空也不會放得比原文大', () => {
    assert.ok(fitText('好', 400, 400, measure, { maxFont: 20 }).fontSize <= 20);
    assert.ok(fitVertical('好', 400, 400, { maxFont: 20 }).fontSize <= 20);
    // 下限大於上限、而且放得下時以下限為準（看得清楚優先）
    assert.equal(fitText('好', 400, 400, measure, { minFont: 24, maxFont: 20 }).fontSize, 24);
});

test('只有一欄的短對話框，旁邊有一小段對話框尾巴，仍判斷為直排（不被打平成橫排而漏翻）', () => {
    // 一欄七個字（x=23..45），左下角有一小段尾巴（x=2..19，只在最下面一個字的高度）
    const glyphs: [number, number, number, number][] = Array.from({ length: 7 }, (_, i) => [23, 14 + i * 21, 45, 30 + i * 21]);
    const img = canvasWith(60, 170, [...glyphs, [4, 148, 19, 162]]);
    assert.equal(orientation(inkMask(img), 60, 170), 'vertical');
});

// ---------- 小寫假名誤讀修正 ----------

import { fixJapaneseMisreads } from '../src/scripts/image-translate/group';

test('小字擷取把「ゃょ」讀成「やよ」：只修幾乎不可能是原樣的拼法', () => {
    assert.equal(fixJapaneseMisreads('コハルちやん？'), 'コハルちゃん？');
    assert.equal(fixJapaneseMisreads('ちよっと待って'), 'ちょっと待って');
    assert.equal(fixJapaneseMisreads('そうじやない'), 'そうじゃない');
    // 正常的「や」「よ」不動
    assert.equal(fixJapaneseMisreads('置きやすい'), '置きやすい');
    assert.equal(fixJapaneseMisreads('しようよ'), 'しようよ');
});

test('日文區塊套用小寫假名修正，其他語言不動', () => {
    const regionsOnly = [{ label: 'text_bubble' as const, score: 0.9, box: [0, 0, 100, 200] as Box }];
    const line = { text: 'コハルちやん？', box: [40, 10, 60, 150] as Box, confidence: 0.9 };
    assert.equal(groupLines({ regions: regionsOnly, lines: [line] }, 'ja')[0].text, 'コハルちゃん？');
    assert.equal(groupLines({ regions: regionsOnly, lines: [{ ...line, text: '小春ちやん' }] }, 'zh')[0].text, '小春ちやん');
});

test('直排符號讀錯的修正：片假名之間的「！」是長音、句尾的 S 是波浪號', () => {
    // 使用者匯出的辨識紀錄裡的實際例子
    assert.equal(fixJapaneseMisreads('コハルちゃんとデ！トするんだＳ☆'), 'コハルちゃんとデートするんだ～☆');
    // 正常的驚嘆號、英文 S 不動
    assert.equal(fixJapaneseMisreads('デート！楽しみ'), 'デート！楽しみ');
    assert.equal(fixJapaneseMisreads('サイズはS'), 'サイズはS');
    assert.equal(fixJapaneseMisreads('SNSで見た'), 'SNSで見た');
});

test('直排：粗的長音（連續細長筆畫）要轉，驚嘆號（一條加一點）不轉', () => {
    // 一欄 24 寬：第一個字是實心方塊，第二個是粗的長音（寬 9、高 22），第三個是驚嘆號（一條 + 一點）
    const img = canvasWith(60, 120, [[18, 5, 42, 27], [26, 32, 35, 54], [27, 62, 33, 78], [27, 82, 33, 87]]);
    const glyphs = verticalColumns(inkMask(img), 60, 120)[0].glyphs;
    assert.deepEqual(glyphs.map((g) => g.rotate), [false, true, false]);
});

// ---------- 本機譯文儲存的鍵與整本翻譯的翻頁 ----------

import { translationKey } from '../src/scripts/image-translate/protocol';

test('譯文的鍵：去掉主機（圖床常換子網域），blob:／data: 不存', () => {
    assert.equal(translationKey('https://a.cdn.example/webp/1/abc.webp'), '/webp/1/abc.webp');
    assert.equal(translationKey('https://b.cdn.example/webp/1/abc.webp'), translationKey('https://a.cdn.example/webp/1/abc.webp'));
    assert.equal(translationKey('https://cdn.example/img.jpg?w=800'), '/img.jpg?w=800');
    assert.equal(translationKey('blob:https://site.example/1234'), null);
    assert.equal(translationKey('data:image/png;base64,AAAA'), null);
    assert.equal(translationKey('not a url'), null);
});

// ---------- Gemini 翻譯（不打網路，用假的 fetch） ----------

import { GeminiKeyError, GeminiQuotaError, buildGeminiPrompt, parseGeminiTranslations, translateWithGemini } from '../src/scripts/image-translate/gemini-translate';

function geminiReply(texts: string[]): unknown {
    return { candidates: [{ content: { parts: [{ text: JSON.stringify(texts) }] } }] };
}

test('Gemini：解析 JSON 陣列，包在 ```json 裡也行；數量不符就丟錯', () => {
    assert.deepEqual(parseGeminiTranslations(geminiReply(['你好', '再見']), 2), ['你好', '再見']);
    const fenced = { candidates: [{ content: { parts: [{ text: '```json\n["一"]\n```' }] } }] };
    assert.deepEqual(parseGeminiTranslations(fenced, 1), ['一']);
    assert.throws(() => parseGeminiTranslations(geminiReply(['只有一句']), 2));
    assert.throws(() => parseGeminiTranslations({}, 1));
});

test('Gemini：提示詞寫明語言與數量', () => {
    const prompt = buildGeminiPrompt(['안녕', '뭐야'], 'ko', 'zh-TW');
    assert.match(prompt, /Korean/);
    assert.match(prompt, /Traditional Chinese/);
    assert.match(prompt, /exactly 2 strings/);
});

test('Gemini：空白段落不送、譯文放回原位置，金鑰放在標頭不放網址', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(geminiReply(['甲', '乙'])), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await translateWithGemini(['a', '  ', 'b'], 'ja', 'zh-TW', 'k', fakeFetch);
    assert.deepEqual(out, ['甲', '', '乙']);
    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.ok(!url.includes('key='));
    assert.equal((init.headers as Record<string, string>)['x-goog-api-key'], 'k');
    assert.equal(JSON.parse(String(init.body)).contents[0].parts[0].text.split('\n').pop(), JSON.stringify(['a', 'b']));
});

test('Gemini：沒有金鑰、金鑰無效、額度用完各自丟對應的錯', async () => {
    const reply = (status: number, body = '') => (async () => new Response(body, { status })) as unknown as typeof fetch;
    await assert.rejects(translateWithGemini(['a'], 'ko', 'en', '', reply(200)), GeminiKeyError);
    await assert.rejects(translateWithGemini(['a'], 'ko', 'en', 'k', reply(400, '{"error":{"message":"API key not valid"}}')), GeminiKeyError);
    await assert.rejects(translateWithGemini(['a'], 'ko', 'en', 'k', reply(403)), GeminiKeyError);
    await assert.rejects(translateWithGemini(['a'], 'ko', 'en', 'k', reply(429)), GeminiQuotaError);
    await assert.rejects(translateWithGemini(['a'], 'ko', 'en', 'k', reply(400, '{"error":{"message":"bad request"}}')), (e: Error) => !(e instanceof GeminiKeyError));
});
