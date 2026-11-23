/**
 * 整本翻譯：網址頁碼的翻頁（純函式）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextHash } from '../src/scripts/image-translate/protocol';

test('網址 # 後面是頁碼就加一，不是頁碼回傳 null', () => {
    assert.equal(nextHash('#1'), '#2');
    assert.equal(nextHash('#19'), '#20');
    assert.equal(nextHash('#page-3'), null);
    assert.equal(nextHash(''), null);
});
