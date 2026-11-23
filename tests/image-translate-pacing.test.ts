/**
 * 翻譯請求的排隊與限速、Gemini 429 的處理（不打網路：假的 fetch 與 chrome.storage）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRetryDelay } from '../src/scripts/image-translate/gemini-translate';
import { Pacer, TranslateBusyError, resetGeminiPacerForTest, translateForImage } from '../src/scripts/image-translate/translate-engines';

test('排隊器：一次只跑一個，開始時間至少間隔 intervalMs', async () => {
    const pacer = new Pacer(40);
    const starts: number[] = [];
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
        starts.push(Date.now());
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
    };
    await Promise.all([pacer.run(task), pacer.run(task), pacer.run(task)]);
    assert.equal(maxRunning, 1);
    assert.ok(starts[1] - starts[0] >= 38, `gap ${starts[1] - starts[0]}`);
    assert.ok(starts[2] - starts[1] >= 38, `gap ${starts[2] - starts[1]}`);
});

test('排隊器：前一個失敗不會卡住後面的', async () => {
    const pacer = new Pacer(0);
    await assert.rejects(pacer.run(async () => { throw new Error('x'); }));
    assert.equal(await pacer.run(async () => 'ok'), 'ok');
});

test('429 的等待時間：Retry-After 標頭優先，其次是 retryDelay', () => {
    assert.equal(parseRetryDelay('12', ''), 12000);
    assert.equal(parseRetryDelay(null, '{"error":{"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37s"}]}}'), 37000);
    assert.equal(parseRetryDelay(null, '{"retryDelay": "1.5s"}'), 1500);
    assert.equal(parseRetryDelay(null, 'nothing here'), null);
});

// ---------- Gemini 經過排隊器的整條流程 ----------

function installFakes(responses: Array<() => Response>): { calls: number[] } {
    const calls: number[] = [];
    (globalThis as Record<string, unknown>).chrome = {
        storage: { local: { get: async () => ({ apiKey: 'k' }) } }
    };
    globalThis.fetch = (async () => {
        calls.push(Date.now());
        const next = responses.shift();
        if (!next) throw new Error('unexpected request');
        return next();
    }) as unknown as typeof fetch;
    return { calls };
}

const ok = (texts: string[]) => () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(texts) }] } }] }), { status: 200 });
const quota = (retryDelay: string) => () => new Response(JSON.stringify({ error: { details: [{ retryDelay }] } }), { status: 429 });

test('Gemini 被短暫擋下：等 Gemini 建議的時間後重試成功，之後的請求放慢', async () => {
    resetGeminiPacerForTest(0);
    const { calls } = installFakes([quota('0.05s'), ok(['甲']), ok(['乙'])]);
    const pacing = { throttledIntervalMs: 80, maxInlineWaitMs: 1000 };
    const first = await translateForImage(['a'], 'ko', 'zh-TW', 'gemini', pacing);
    assert.deepEqual(first, ['甲']);
    assert.ok(calls[1] - calls[0] >= 45, `retry waited ${calls[1] - calls[0]}ms`);
    const second = await translateForImage(['b'], 'ko', 'zh-TW', 'gemini', pacing);
    assert.deepEqual(second, ['乙']);
    // 被擋過之後，間隔拉長到 throttledIntervalMs
    assert.ok(calls[2] - calls[1] >= 75, `throttled gap ${calls[2] - calls[1]}ms`);
});

test('Gemini 要等太久：不原地等，回報忙碌與可以再試的時間', async () => {
    resetGeminiPacerForTest(0);
    installFakes([quota('120s')]);
    const before = Date.now();
    await assert.rejects(
        translateForImage(['a'], 'ko', 'zh-TW', 'gemini', { throttledIntervalMs: 0, maxInlineWaitMs: 1000 }),
        (error: unknown) => error instanceof TranslateBusyError && error.retryAt >= before + 119000
    );
});

test('Gemini 重試後還是被擋：回報忙碌，不再重試第三次', async () => {
    resetGeminiPacerForTest(0);
    const { calls } = installFakes([quota('0.01s'), quota('30s')]);
    await assert.rejects(
        translateForImage(['a'], 'ko', 'zh-TW', 'gemini', { throttledIntervalMs: 0, maxInlineWaitMs: 1000 }),
        TranslateBusyError
    );
    assert.equal(calls.length, 2);
});

test('Gemini 同時來好幾張：一次送一張，不會一波連發', async () => {
    resetGeminiPacerForTest(30);
    const { calls } = installFakes([ok(['1']), ok(['2']), ok(['3'])]);
    const results = await Promise.all(['a', 'b', 'c'].map((text) => translateForImage([text], 'ko', 'en', 'gemini')));
    assert.deepEqual(results, [['1'], ['2'], ['3']]);
    assert.ok(calls[1] - calls[0] >= 28 && calls[2] - calls[1] >= 28, `gaps ${calls[1] - calls[0]}, ${calls[2] - calls[1]}`);
});
