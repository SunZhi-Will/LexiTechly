import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGeminiBody, createGeminiByokProvider, parseGeminiStream } from '../src/scripts/ai/gemini-byok';
import { AiError } from '../src/scripts/ai/types';

function sse(...chunks: unknown[]): string {
    return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('');
}

function textChunk(text: string, extra: Record<string, unknown> = {}): unknown {
    return { candidates: [{ content: { parts: [{ text }] }, ...extra }] };
}

interface FakeCall {
    url: string;
    init: RequestInit;
}

function fakeFetch(responses: Array<Response | Error>): { fetchImpl: typeof fetch; calls: FakeCall[] } {
    const calls: FakeCall[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const next = responses.shift();
        if (!next) throw new Error('unexpected fetch');
        if (next instanceof Error) throw next;
        return next;
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
}

function provider(responses: Array<Response | Error>, apiKey = 'test-key') {
    const { fetchImpl, calls } = fakeFetch(responses);
    const slept: number[] = [];
    const instance = createGeminiByokProvider({
        getApiKey: async () => apiKey,
        fetchImpl,
        sleep: async (ms) => {
            slept.push(ms);
        }
    });
    return { instance, calls, slept };
}

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
    await assert.rejects(promise, (error: unknown) => error instanceof AiError && error.code === code);
}

test('buildGeminiBody: 只帶有指定的參數，json 會轉成 responseMimeType', () => {
    assert.deepEqual(buildGeminiBody({ prompt: 'hi' }), {
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: {}
    });
    assert.deepEqual(buildGeminiBody({ prompt: 'hi', temperature: 0, maxOutputTokens: 10, json: true }), {
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10, responseMimeType: 'application/json' }
    });
});

test('parseGeminiStream: 把多個事件的文字接起來，並記下停止原因', () => {
    const body = sse(textChunk('{"a":'), textChunk('1}', { finishReason: 'STOP' }));
    assert.deepEqual(parseGeminiStream(body), { text: '{"a":1}', finishReason: 'STOP' });
});

test('parseGeminiStream: 略過思考內容、壞掉的事件與非 data 的行', () => {
    const body = [
        ': keep-alive',
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: '想一下', thought: true }] } }] })}`,
        'data: {not json',
        `data: ${JSON.stringify(textChunk('答案', { finishReason: 'MAX_TOKENS' }))}`,
        'data: [DONE]',
        ''
    ].join('\r\n');
    assert.deepEqual(parseGeminiStream(body), { text: '答案', finishReason: 'MAX_TOKENS' });
});

test('parseGeminiStream: 沒有內容時回傳空字串', () => {
    assert.deepEqual(parseGeminiStream(''), { text: '', finishReason: undefined });
});

test('generate: 金鑰放在標頭、不在網址上，並走串流端點', async () => {
    const { instance, calls } = provider([new Response(sse(textChunk('ok')), { status: 200 })], '  secret-key  ');
    const result = await instance.generate({ prompt: 'hello', json: true });
    assert.equal(result.text, 'ok');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes(':streamGenerateContent?alt=sse'));
    assert.ok(!calls[0].url.includes('secret-key'));
    assert.equal((calls[0].init.headers as Record<string, string>)['x-goog-api-key'], 'secret-key');
    assert.equal(calls[0].init.credentials, 'omit');
});

test('generate: 沒有金鑰時不發請求', async () => {
    const { instance, calls } = provider([], '   ');
    await rejectsWith(instance.generate({ prompt: 'x' }), 'no-key');
    assert.equal(calls.length, 0);
});

test('generate: 429 會等待後重試，成功就回傳', async () => {
    const { instance, calls, slept } = provider([
        new Response('', { status: 429 }),
        new Response('', { status: 429 }),
        new Response(sse(textChunk('done')), { status: 200 })
    ]);
    assert.equal((await instance.generate({ prompt: 'x' })).text, 'done');
    assert.equal(calls.length, 3);
    assert.deepEqual(slept, [1000, 2000]);
});

test('generate: 一直 429 最後回報額度問題', async () => {
    const { instance, calls } = provider([
        new Response('', { status: 429 }),
        new Response('', { status: 429 }),
        new Response('', { status: 429 })
    ]);
    await rejectsWith(instance.generate({ prompt: 'x' }), 'quota');
    assert.equal(calls.length, 3);
});

test('generate: 401、403 與提到金鑰的 400 是金鑰錯誤，其他 400 不是', async () => {
    await rejectsWith(provider([new Response('', { status: 403 })]).instance.generate({ prompt: 'x' }), 'invalid-key');
    await rejectsWith(provider([new Response('', { status: 401 })]).instance.generate({ prompt: 'x' }), 'invalid-key');
    await rejectsWith(
        provider([new Response('API key not valid. Please pass a valid API key.', { status: 400 })]).instance.generate({ prompt: 'x' }),
        'invalid-key'
    );
    await rejectsWith(
        provider([new Response('Invalid JSON payload', { status: 400 })]).instance.generate({ prompt: 'x' }),
        'bad-response'
    );
});

test('generate: 連線失敗、伺服器錯誤與空回應各自對應的錯誤', async () => {
    await rejectsWith(provider([new TypeError('Failed to fetch')]).instance.generate({ prompt: 'x' }), 'network');
    await rejectsWith(provider([new Response('', { status: 500 })]).instance.generate({ prompt: 'x' }), 'bad-response');
    await rejectsWith(provider([new Response(sse({ candidates: [] }), { status: 200 })]).instance.generate({ prompt: 'x' }), 'bad-response');
});
