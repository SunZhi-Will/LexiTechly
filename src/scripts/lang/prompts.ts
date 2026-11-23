/**
 * AI prompt：學習語言與解說語言都是參數。
 *
 * 指示用英文寫（模型對英文指示最穩定），再明確要求「說明文字用解說語言」。
 * 回傳的 JSON 欄位名稱固定，呼叫端的解析不用跟著語言改。
 */

import { LEARNING_LANGUAGES, NATIVE_LANGUAGES, levelsFor, type LearningLang, type NativeLang } from './languages';

interface Names {
    learning: string;
    native: string;
    system: string;
    levels: string;
}

function names(lang: LearningLang, native: NativeLang): Names {
    const language = LEARNING_LANGUAGES[lang];
    return {
        learning: language.englishName,
        native: NATIVE_LANGUAGES[native].promptName,
        system: language.levelSystem,
        levels: levelsFor(lang).join(', ')
    };
}

/** 日文、中文要附讀音，其他語言不用 */
function readingRule(lang: LearningLang): string {
    if (lang === 'ja') return 'the reading in hiragana';
    if (lang === 'zh') return 'the reading in pinyin with tone marks';
    return 'an empty string';
}

export function buildPageAnalysisPrompt(content: string, lang: LearningLang, native: NativeLang): string {
    const n = names(lang, native);
    return `
You are an expert at assessing ${n.learning} reading difficulty for language learners.
Assess the ${n.system} level of the ${n.learning} text below.

Respond with JSON in exactly this shape:
{
    "level": "one of: ${n.levels}",
    "analysis": {
        "vocabulary": "short note on vocabulary difficulty",
        "grammar": "short note on sentence structure",
        "topic": "short note on how specialised the topic is"
    }
}

What to look at:
1. Vocabulary: word difficulty and the share of technical terms
2. Grammar: sentence complexity and the structures used
3. Topic: how specialised the content is

Text:
---
${content}
---

Rules:
1. Return only the JSON, with no other text.
2. "level" must be exactly one of: ${n.levels}.
3. Write the three notes in ${n.native}, each at most 20 characters or 12 words.
`;
}

export function buildPageVocabularyPrompt(text: string, lang: LearningLang, native: NativeLang): string {
    const n = names(lang, native);
    return `
Pick the most useful ${n.learning} words for a learner from the text below and describe each one.
Respond with JSON containing at most 20 words:

{
    "vocabulary": [
        {
            "text": "the word in its dictionary form, in ${n.learning}",
            "level": "one of: ${n.levels}",
            "translation": "translation in ${n.native}",
            "example": "a short example sentence in ${n.learning}",
            "phonetic": "${readingRule(lang)}"
        }
    ]
}

Rules:
1. Choose words that are worth learning and skip the most basic ones.
2. "level" must be exactly one of: ${n.levels} (${n.system}).
3. Write every "translation" in ${n.native}.
4. Return only valid JSON, with no other text or comments.

Text:
---
${text}
---
`;
}

export function buildWordQueryPrompt(word: string, lang: LearningLang, native: NativeLang): string {
    const n = names(lang, native);
    return `
Return only JSON describing the ${n.learning} word "${word}":
{
  "word": "${word}",
  "level": "one of: ${n.levels}, or \\"proper noun\\" written in ${n.native}",
  "translation": "main translation in ${n.native}",
  "partOfSpeech": "part of speech, written in ${n.native}",
  "reading": "${readingRule(lang)}",
  "example": "a short example sentence in ${n.learning}",
  "exampleTranslation": "the example translated into ${n.native}"
}
Rules: the JSON must be parseable; no extra text and no Markdown.
`;
}

/** 第一次回應解析失敗時用的精簡版 */
export function buildShortWordQueryPrompt(word: string, lang: LearningLang, native: NativeLang): string {
    const n = names(lang, native);
    return `Return only parseable JSON for the ${n.learning} word "${word}", with translation, partOfSpeech and exampleTranslation written in ${n.native} and level being one of ${n.levels}: {"word":"${word}","level":"","translation":"","partOfSpeech":"","reading":"","example":"","exampleTranslation":""}`;
}

export function buildWordDetailsPrompt(word: string, lang: LearningLang, native: NativeLang): string {
    const n = names(lang, native);
    return `
Analyse the ${n.learning} word "${word}" for a language learner.

Return JSON in exactly this shape, with no other text:
{
    "synonyms": [
        {"text": "a similar ${n.learning} word", "translation": "its translation in ${n.native}"}
    ],
    "antonyms": [
        {"text": "an opposite ${n.learning} word", "translation": "its translation in ${n.native}"}
    ],
    "examples": [
        {"sentence": "an example sentence in ${n.learning}", "translation": "its translation in ${n.native}"},
        {"sentence": "another example sentence in ${n.learning}", "translation": "its translation in ${n.native}"}
    ],
    "usage": "how the word is used, written in ${n.native}",
    "translation": "the word translated into ${n.native}"
}

Rules:
1. At most 5 synonyms and at most 5 antonyms; use an empty array when there are none.
2. Give 2 or 3 examples that show different uses.
3. Every "text" and "sentence" is in ${n.learning}; every "translation" and the "usage" note are in ${n.native}.
`;
}

export function buildChatPrompt(
    content: string,
    message: string,
    history: Array<{ text: string; type: 'user' | 'ai' }>,
    lang: LearningLang,
    native: NativeLang
): string {
    const n = names(lang, native);
    const conversation = history.map((entry) => `${entry.type === 'user' ? 'User' : 'Assistant'}: ${entry.text}`).join('\n');
    return `
You are a ${n.learning} learning assistant. Answer the user's question about the ${n.learning} article below.
Answer in ${n.native}.

Article:
---
${content}
---

${conversation ? `Conversation so far:\n${conversation}\n` : ''}
User question: ${message}

In your answer:
1. Answer the question directly.
2. Point out what is worth learning about ${n.learning} here.
3. Give useful examples or explanations.
`;
}
