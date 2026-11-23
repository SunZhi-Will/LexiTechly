/**
 * 側邊面板：針對正在讀的頁面的學習對話。
 *
 * 面板會留在網頁旁邊（不像 popup 一失去焦點就關掉），所以對話放在這裡。
 * 文章內容向該分頁的內容腳本要；對話紀錄依網址存在 chrome.storage.session，關掉瀏覽器就清掉。
 */

import { AiError, generateText, hasApiKey } from './ai/client';
import { localizePage, t } from './i18n';
import { LEARNING_LANGUAGES, type LearningLang, type NativeLang } from './lang/languages';
import { getLanguageSettings, resolveLearningLangOrDefault } from './lang/settings';
import { renderMarkdown } from './sidepanel/markdown';
import { PAGE_CONTEXT_ACTION, PENDING_ASK_KEY, chatKey, type PageContext, type PendingAsk } from './sidepanel/protocol';
import { buildTutorPrompt, clipArticle, type TutorMode, type TutorTurn } from './sidepanel/tutor';

interface PageState {
    tabId: number;
    url: string;
    article: string;
    lang: LearningLang;
    native: NativeLang;
}

const messagesEl = document.getElementById('messages') as HTMLElement;
const emptyEl = document.getElementById('empty') as HTMLElement;
const noticeEl = document.getElementById('notice') as HTMLElement;
const titleEl = document.getElementById('page-title') as HTMLElement;
const badgeEl = document.getElementById('lang-badge') as HTMLElement;
const questionEl = document.getElementById('question') as HTMLTextAreaElement;
const sendButton = document.getElementById('send') as HTMLButtonElement;
const chips = [...document.querySelectorAll<HTMLButtonElement>('.chip')];

let page: PageState | null = null;
let turns: TutorTurn[] = [];
let busy = false;
/** 每次換頁就加一；回覆回來時不一樣代表使用者已經換到別頁，這個回覆不要顯示 */
let generation = 0;

function setNotice(message: string, isError = false): void {
    noticeEl.hidden = message === '';
    noticeEl.textContent = message;
    noticeEl.classList.toggle('error', isError);
}

function setControlsEnabled(enabled: boolean): void {
    questionEl.disabled = !enabled;
    sendButton.disabled = !enabled;
    for (const chip of chips) chip.disabled = !enabled;
}

function addBubble(kind: 'user' | 'assistant' | 'error' | 'pending', text: string): HTMLElement {
    emptyEl.hidden = true;
    const bubble = document.createElement('div');
    bubble.className = `message ${kind}`;
    if (kind === 'assistant') {
        // renderMarkdown 會先把模型的輸出整段跳脫，只產生固定的幾種標籤
        bubble.innerHTML = renderMarkdown(text);
    } else {
        bubble.textContent = text;
    }
    messagesEl.append(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
}

function renderConversation(): void {
    messagesEl.querySelectorAll('.message').forEach((element) => element.remove());
    emptyEl.hidden = turns.length > 0;
    for (const turn of turns) addBubble(turn.role, turn.text);
}

async function saveConversation(): Promise<void> {
    if (!page) return;
    await chrome.storage.session.set({ [chatKey(page.url)]: turns }).catch(() => undefined);
}

async function fetchPageContext(tabId: number): Promise<PageContext | null> {
    try {
        const response = (await chrome.tabs.sendMessage(tabId, { action: PAGE_CONTEXT_ACTION })) as PageContext | undefined;
        return response && typeof response.text === 'string' ? response : null;
    } catch {
        return null;
    }
}

/** 讀取目前分頁的內容，並切換到這個網址的對話 */
async function loadPage(): Promise<void> {
    const current = ++generation;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (current !== generation) return;

    page = null;
    turns = [];
    badgeEl.hidden = true;
    titleEl.textContent = tab?.title || '';

    const url = tab?.url ?? '';
    if (!tab?.id || !/^https?:/.test(url)) {
        renderConversation();
        setControlsEnabled(false);
        setNotice(t('panelNoticeUnsupported'));
        return;
    }

    const context = await fetchPageContext(tab.id);
    if (current !== generation) return;
    if (!context) {
        renderConversation();
        setControlsEnabled(false);
        setNotice(t('panelNoticeReload'));
        return;
    }

    const settings = await getLanguageSettings();
    const lang = resolveLearningLangOrDefault(settings.learningLang, context.text);
    const stored = await chrome.storage.session.get(chatKey(url)).catch(() => ({} as Record<string, unknown>));
    if (current !== generation) return;

    page = { tabId: tab.id, url, article: context.text, lang, native: settings.nativeLang };
    const saved = stored[chatKey(url)];
    turns = Array.isArray(saved) ? (saved as TutorTurn[]) : [];
    titleEl.textContent = context.title || tab.title || url;
    badgeEl.textContent = LEARNING_LANGUAGES[lang].nativeName;
    badgeEl.hidden = false;
    renderConversation();
    setControlsEnabled(!busy);

    if (context.text.trim().length === 0) {
        setNotice(t('panelNoticeEmpty'));
    } else if (!(await hasApiKey())) {
        setNotice(t('panelNoticeNoKey'), true);
    } else if (clipArticle(context.text).clipped) {
        setNotice(t('panelNoticeClipped'));
    } else {
        setNotice('');
    }
}

/** 送出一輪對話。selection 有給就直接用（右鍵選單），沒給而且是 explain 時去問網頁目前選了什麼 */
async function send(mode: TutorMode, input: string, selection?: string): Promise<void> {
    if (busy || !page) return;
    const target = page;
    const current = generation;

    let userText = input.trim();
    let promptInput = userText;
    if (mode === 'explain') {
        const selected = (selection ?? (await fetchPageContext(target.tabId))?.selection ?? '').trim();
        if (current !== generation) return;
        if (!selected) {
            setNotice(t('panelNoticeNoSelection'));
            return;
        }
        promptInput = selected.slice(0, 2000);
        userText = `${t('panelActionExplain')}\n${promptInput}`;
    } else if (mode === 'quiz') {
        userText = t('panelActionQuiz');
    } else if (mode === 'summary') {
        userText = t('panelActionSummary');
    }
    if (!userText) return;

    busy = true;
    setControlsEnabled(false);
    setNotice('');
    const history = [...turns];
    turns.push({ role: 'user', text: userText });
    addBubble('user', userText);
    const pending = addBubble('pending', t('panelThinking'));

    try {
        const { text } = await generateText({
            prompt: buildTutorPrompt({ mode, article: target.article, input: promptInput, history, lang: target.lang, native: target.native }),
            temperature: 0.6,
            maxOutputTokens: 4096
        });
        if (current !== generation) return;
        pending.remove();
        turns.push({ role: 'assistant', text });
        addBubble('assistant', text);
        await saveConversation();
    } catch (error) {
        if (current !== generation) return;
        pending.remove();
        // 這一輪沒有成功，不留在紀錄裡，使用者可以直接再問一次
        turns.pop();
        const reason = error instanceof AiError ? error.message : t('panelErrorGeneric');
        addBubble('error', reason);
    } finally {
        busy = false;
        if (current === generation) {
            setControlsEnabled(page !== null);
            questionEl.focus();
        } else {
            setControlsEnabled(page !== null);
        }
    }
}

/** 右鍵選單「解說選取的文字」交過來的請求 */
async function takePendingAsk(): Promise<void> {
    const stored = await chrome.storage.session.get(PENDING_ASK_KEY).catch(() => ({} as Record<string, unknown>));
    const pending = stored[PENDING_ASK_KEY] as PendingAsk | undefined;
    if (!pending || typeof pending.text !== 'string') return;
    await chrome.storage.session.remove(PENDING_ASK_KEY);
    // 太舊的請求（例如面板當時沒開成功）就不處理
    if (Date.now() - pending.createdAt > 30_000) return;
    if (!page || page.tabId !== pending.tabId) await loadPage();
    await send('explain', '', pending.text);
}

function init(): void {
    localizePage();
    setControlsEnabled(false);

    document.getElementById('ask-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const question = questionEl.value;
        if (!question.trim() || busy || !page) return;
        questionEl.value = '';
        void send('ask', question);
    });

    questionEl.addEventListener('keydown', (event) => {
        // 輸入法選字中的 Enter 不送出
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            (document.getElementById('ask-form') as HTMLFormElement).requestSubmit();
        }
    });

    for (const chip of chips) {
        chip.addEventListener('click', () => void send(chip.dataset.mode as TutorMode, ''));
    }

    document.getElementById('clear')?.addEventListener('click', () => {
        if (busy) return;
        turns = [];
        renderConversation();
        void saveConversation();
    });

    // 使用者切換分頁或在同一個分頁換頁時，跟著換內容
    chrome.tabs.onActivated.addListener(() => void loadPage());
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.active) void loadPage();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'session' && changes[PENDING_ASK_KEY]?.newValue) void takePendingAsk();
    });

    void loadPage().then(takePendingAsk);
}

init();
