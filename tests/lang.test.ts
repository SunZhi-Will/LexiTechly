import assert from 'node:assert/strict';
import { test } from 'node:test';

import { charBelongsToLang, detectLearningLang } from '../src/scripts/lang/detect';
import {
    LEARNING_LANGUAGES,
    LEVELS,
    levelRank,
    levelsFor,
    middleLevel,
    nativeLangFromUiLanguage,
    normalizeLevel,
    type LearningLang
} from '../src/scripts/lang/languages';
import {
    buildPageAnalysisPrompt,
    buildPageVocabularyPrompt,
    buildWordDetailsPrompt,
    buildWordQueryPrompt
} from '../src/scripts/lang/prompts';
import { resolveLearningLang } from '../src/scripts/lang/settings';
import { wordAt, wordsIn } from '../src/scripts/lang/segment';

const SAMPLES: Record<LearningLang, string> = {
    en: 'The weather was beautiful this morning, and they have decided that it would be a good day for a walk in the park.',
    ja: '今日は天気がとても良いので、友達と一緒に公園へ散歩に行くことにしました。日本語の勉強も続けています。',
    ko: '오늘은 날씨가 아주 좋아서 친구와 함께 공원에 산책하러 가기로 했습니다. 한국어 공부도 계속하고 있습니다.',
    zh: '今天天气非常好，所以我们决定和朋友一起去公园散步。学习中文也在继续。',
    es: 'El tiempo estaba muy bonito esta mañana, y los niños han decidido que es un buen día para pasear por el parque con sus amigos.',
    fr: 'Le temps était très beau ce matin, et les enfants ont décidé que cette journée est parfaite pour une promenade dans le parc avec nous.',
    de: 'Das Wetter war heute Morgen sehr schön, und die Kinder haben entschieden, dass es ein guter Tag für einen Spaziergang mit der Familie ist.'
};

test('每個學習語言都有對應的分級系統，等級由易到難', () => {
    for (const language of Object.values(LEARNING_LANGUAGES)) {
        assert.ok(LEVELS[language.levelSystem].length >= 5, language.code);
        assert.equal(levelRank(language.code, levelsFor(language.code)[0]), 0);
    }
    assert.deepEqual(levelsFor('ja'), ['N5', 'N4', 'N3', 'N2', 'N1']);
    assert.equal(middleLevel('en'), 'B1');
    assert.equal(middleLevel('ja'), 'N3');
});

test('normalizeLevel: 整理各種寫法，認不出來回傳 null', () => {
    assert.equal(normalizeLevel('en', 'b2'), 'B2');
    assert.equal(normalizeLevel('fr', 'CEFR C1 (advanced)'), 'C1');
    assert.equal(normalizeLevel('ja', 'JLPT N3'), 'N3');
    assert.equal(normalizeLevel('ja', 'n-1'), 'N1');
    assert.equal(normalizeLevel('ko', 'TOPIK 4級'), 'TOPIK4');
    assert.equal(normalizeLevel('ko', '2'), 'TOPIK2');
    assert.equal(normalizeLevel('zh', 'HSK 5'), 'HSK5');
    assert.equal(normalizeLevel('en', '專有名詞'), null);
    assert.equal(normalizeLevel('ja', 'B2'), null);
    assert.equal(normalizeLevel('en', undefined), null);
});

test('nativeLangFromUiLanguage: 由瀏覽器語言推測解說語言', () => {
    assert.equal(nativeLangFromUiLanguage('zh-TW'), 'zh-TW');
    assert.equal(nativeLangFromUiLanguage('zh-HK'), 'zh-TW');
    assert.equal(nativeLangFromUiLanguage('zh-CN'), 'zh-CN');
    assert.equal(nativeLangFromUiLanguage('zh'), 'zh-CN');
    assert.equal(nativeLangFromUiLanguage('ja'), 'ja');
    assert.equal(nativeLangFromUiLanguage('ko-KR'), 'ko');
    assert.equal(nativeLangFromUiLanguage('en-GB'), 'en');
    assert.equal(nativeLangFromUiLanguage('pt-BR'), 'en');
});

test('detectLearningLang: 七種語言各自認得出來', () => {
    for (const lang of Object.keys(SAMPLES) as LearningLang[]) {
        assert.equal(detectLearningLang(SAMPLES[lang]), lang, lang);
    }
});

test('detectLearningLang: 漢字比假名多的日文仍是日文，英文夾雜少量中文仍是英文', () => {
    assert.equal(detectLearningLang('東京都知事選挙の結果が発表された。'), 'ja');
    assert.equal(detectLearningLang(`${SAMPLES.en} ${SAMPLES.en} （翻譯：天氣很好）`), 'en');
});

test('detectLearningLang: 沒有文字或看不出語言時回傳 null', () => {
    assert.equal(detectLearningLang(''), null);
    assert.equal(detectLearningLang('12345 !!! ???'), null);
    assert.equal(detectLearningLang('Lorem ipsum dolor sit amet consectetur adipiscing elit sed'), null);
});

test('resolveLearningLang: 有指定就照指定，auto 才偵測', () => {
    assert.equal(resolveLearningLang('ja', SAMPLES.en), 'ja');
    assert.equal(resolveLearningLang('auto', SAMPLES.ko), 'ko');
    assert.equal(resolveLearningLang('auto', '12345'), null);
});

test('charBelongsToLang: 依文字系統判斷', () => {
    assert.ok(charBelongsToLang('a', 'en'));
    assert.ok(charBelongsToLang('é', 'fr'));
    assert.ok(!charBelongsToLang('あ', 'en'));
    assert.ok(charBelongsToLang('あ', 'ja'));
    assert.ok(charBelongsToLang('学', 'ja'));
    assert.ok(charBelongsToLang('学', 'zh'));
    assert.ok(!charBelongsToLang('あ', 'zh'));
    assert.ok(charBelongsToLang('한', 'ko'));
    assert.ok(!charBelongsToLang('学', 'ko'));
    assert.ok(!charBelongsToLang('1', 'en'));
    assert.ok(!charBelongsToLang(' ', 'ja'));
});

test('wordsIn: 英文轉小寫、略過太短的字，保留撇號與連字號', () => {
    assert.deepEqual(
        wordsIn("It's a Well-Known fact, no?", 'en').map((span) => span.word),
        ["it's", 'well-known', 'fact']
    );
});

test('wordsIn: 法文、德文保留重音字母，兩個字母的字也算', () => {
    assert.deepEqual(wordsIn('Où est le café ?', 'fr').map((span) => span.word), ['où', 'est', 'le', 'café']);
    assert.deepEqual(wordsIn('Die Straße ist schön.', 'de').map((span) => span.word), ['die', 'straße', 'ist', 'schön']);
});

test('wordsIn: 日文、中文、韓文用斷詞器，位置對得回原字串', () => {
    const japanese = '私は学生です。';
    const jaSpans = wordsIn(japanese, 'ja');
    assert.ok(jaSpans.length >= 3);
    assert.ok(jaSpans.some((span) => span.word === '学生'));
    for (const span of jaSpans) {
        assert.equal(japanese.slice(span.start, span.end), span.word);
    }

    const zhSpans = wordsIn('我喜欢学习中文。', 'zh');
    assert.ok(zhSpans.length >= 3);
    assert.ok(zhSpans.every((span) => !/[。，]/.test(span.word)));

    assert.deepEqual(wordsIn('저는 학생입니다.', 'ko').map((span) => span.word), ['저는', '학생입니다']);
});

test('wordsIn: 只取屬於該語言的文字', () => {
    assert.deepEqual(wordsIn('学生 student 学校', 'en').map((span) => span.word), ['student']);
    assert.ok(wordsIn('学生 student 学校', 'ja').every((span) => span.word !== 'student'));
    assert.deepEqual(wordsIn('hello 123', 'ja'), []);
});

test('wordAt: 游標所在的單字，落在空白或其他語言上回傳 null', () => {
    const text = 'Hello brave new world';
    assert.equal(wordAt(text, 0, 'en')?.word, 'hello');
    assert.equal(wordAt(text, 8, 'en')?.word, 'brave');
    assert.equal(wordAt(text, 11, 'en')?.word, 'brave'); // 緊貼在字尾
    assert.equal(wordAt(text, text.length, 'en')?.word, 'world');
    assert.equal(wordAt('a  b', 2, 'en'), null);
    assert.equal(wordAt(text, 99, 'en'), null);

    const japanese = '私は学生です。';
    assert.equal(wordAt(japanese, japanese.indexOf('学'), 'ja')?.word, '学生');
    assert.equal(wordAt(japanese, japanese.indexOf('生'), 'ja')?.word, '学生');
    assert.equal(wordAt('学生 student', 4, 'ja'), null);
});

test('prompt: 帶入學習語言、解說語言與該語言的等級', () => {
    const analysis = buildPageAnalysisPrompt('本文', 'ja', 'zh-TW');
    assert.ok(analysis.includes('Japanese'));
    assert.ok(analysis.includes('JLPT'));
    assert.ok(analysis.includes('N5, N4, N3, N2, N1'));
    assert.ok(analysis.includes('Traditional Chinese as used in Taiwan'));
    assert.ok(analysis.includes('本文'));

    const vocabulary = buildPageVocabularyPrompt('text', 'en', 'ja');
    assert.ok(vocabulary.includes('A1, A2, B1, B2, C1, C2'));
    assert.ok(vocabulary.includes('translation in Japanese'));

    assert.ok(buildWordQueryPrompt('学生', 'ja', 'en').includes('hiragana'));
    assert.ok(buildWordQueryPrompt('学生', 'zh', 'en').includes('pinyin'));
    assert.ok(!buildWordQueryPrompt('casa', 'es', 'en').includes('hiragana'));
    assert.ok(buildWordDetailsPrompt('Haus', 'de', 'ko').includes('German word "Haus"'));
});
