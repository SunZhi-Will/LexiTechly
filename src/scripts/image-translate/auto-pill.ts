/**
 * 自動翻譯的工具列（固定在視窗右下角）：一排圖示，滑鼠移上去才顯示說明，不擋畫面
 *
 * 由左到右：狀態（燈號＋已翻譯張數）、原文語言、看原文、預翻下一頁、整本翻譯、更多（重翻、匯出）、停止。
 * 語言與「更多」點了在工具列上方彈出選單；按鈕回饋（例如「已存到下載資料夾」）與翻譯服務被擋的通知
 * 顯示成工具列上方的提示泡泡。
 *
 * 選語言放在開始的當下（依「選擇出現在動作當下」的原則），選過的語言依網站記住，下次直接用。
 */

import { t, type MessageKey } from './i18n';
import type { AutoState } from './auto-translate';
import type { LangChoice, SourceLang } from './protocol';

const FONT = 'system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif';

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
button { font: 600 12px/1.3 ${FONT}; border: 0; cursor: pointer; background: transparent; color: inherit; padding: 0; }
button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
svg { width: 18px; height: 18px; flex: none; }

.bar { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; align-items: center; gap: 2px; padding: 4px;
  border-radius: 999px; background: rgba(24, 24, 27, 0.92); color: #d4d4d8; font: 500 12px/1.4 ${FONT};
  box-shadow: 0 8px 24px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.08); }
.btn { position: relative; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; transition: background .15s, color .15s; }
.btn:hover, .btn.open { background: rgba(255,255,255,.12); color: #fff; }
.btn.on { color: #4ade80; }
.btn.danger:hover { background: rgba(248,113,113,.18); color: #fca5a5; }
.btn.text { width: auto; min-width: 34px; padding: 0 9px; border-radius: 999px; font-weight: 700; font-size: 12.5px; }
.badge { position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 0 2px rgba(24,24,27,.92); }
.status { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px 0 10px; border-radius: 999px; color: #f4f4f5; font-weight: 600; cursor: default; }
.sep { width: 1px; height: 18px; margin: 0 3px; background: rgba(255,255,255,.12); }

.dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; flex: none; }
.dot.working { animation: pulse 1s ease-in-out infinite; }
.dot.idle { background: #71717a; }
.dot.busy { background: #f87171; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }

/* 滑鼠移上去（或用鍵盤移到）才出現的說明 */
[data-tip]:hover::after, [data-tip]:focus-visible::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 10px); right: 0;
  width: max-content; max-width: 240px; padding: 6px 9px; border-radius: 8px; background: #fafafa; color: #18181b;
  font: 500 12px/1.45 ${FONT}; white-space: pre-line; text-align: left; pointer-events: none; box-shadow: 0 4px 14px rgba(0,0,0,.25); z-index: 2; }
.bar:has(.menu) [data-tip]:hover::after { display: none; }
/* 說明出現時先藏起提示泡泡，兩個疊在同一個位置 */
.bar:has([data-tip]:hover) .bubble { visibility: hidden; }

.bubble, .menu { position: absolute; bottom: calc(100% + 10px); right: 0; border-radius: 12px; background: rgba(24, 24, 27, 0.96); color: #f4f4f5;
  box-shadow: 0 8px 24px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.08); }
.bubble { width: max-content; max-width: min(300px, calc(100vw - 32px)); padding: 8px 12px; font-size: 12.5px; line-height: 1.5; }
.bubble.error { color: #fecaca; }
.bubble b { display: block; color: #fca5a5; }
.menu { min-width: 180px; padding: 4px; }
.menu-title { padding: 6px 10px 4px; color: #a1a1aa; font-size: 11.5px; }
.menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 8px; text-align: left; font-weight: 500; font-size: 12.5px; }
.menu button:hover { background: rgba(255,255,255,.1); }
.menu button.on { color: #4ade80; }
.menu svg { width: 16px; height: 16px; color: #a1a1aa; }

/* 第一次使用的說明：完整的小卡片 */
.panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(320px, calc(100vw - 32px)); padding: 14px; border-radius: 16px;
  background: rgba(24, 24, 27, 0.95); color: #f4f4f5; font: 400 13px/1.5 ${FONT}; box-shadow: 0 12px 32px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.07); }
.panel .title { font-weight: 700; font-size: 14px; }
.panel .body { margin-top: 6px; color: #d4d4d8; }
.row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; justify-content: flex-end; }
.row button { padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,.1); }
.row button:hover { background: rgba(255,255,255,.18); }
.row button.primary { background: #fafafa; color: #18181b; }
`;

const svg = (paths: string) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
    eye: svg('<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
    languages: svg('<path d="M2 3.5h6M5 2v1.5M3.5 3.5c.3 2.3 1.8 4 3.5 4.8M6.5 3.5C6.2 6 4.5 7.8 2.5 8.6M8.5 14l2.75-6.5L14 14M9.4 12h3.7"/>'),
    prefetch: svg('<path d="M2 4l5 4-5 4zM8.5 4l5 4-5 4z"/>'),
    book: svg('<path d="M8 4.5C6.8 3.4 4.8 3 2 3v9.5c2.8 0 4.8.4 6 1.5 1.2-1.1 3.2-1.5 6-1.5V3c-2.8 0-4.8.4-6 1.5zM8 4.5V14"/>'),
    more: svg('<circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/>'),
    close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    refresh: svg('<path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3h-3"/>'),
    download: svg('<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>')
};

export const LANG_NAMES: Record<LangChoice, MessageKey> = {
    auto: 'manga.lang.auto',
    ko: 'manga.lang.ko',
    ja: 'manga.lang.ja',
    zh: 'manga.lang.zh'
};

// 工具列上的語言只放一兩個字
const LANG_SHORT: Record<SourceLang, MessageKey> = {
    ko: 'manga.lang.short.ko',
    ja: 'manga.lang.short.ja',
    zh: 'manga.lang.short.zh'
};

export interface PillHandlers {
    onToggleOriginal(showOriginal: boolean): void;
    onChangeLanguage(): void;
    onStop(): void;
    // 重翻畫面上看得到的圖（有對話框漏翻時）
    onRetranslate(): void;
    // 把畫面上這頁的辨識紀錄存成檔案（回報漏翻用，只存在使用者自己的電腦）
    onExport(): void;
    // 預翻下一頁的開關
    onTogglePrefetch(enabled: boolean): void;
    // 在這個分頁整本翻譯
    onBatch(): void;
}

type Menu = { kind: 'more' } | { kind: 'lang'; resolve: (lang: LangChoice | null) => void };

export class AutoPill {
    private readonly host = document.createElement('lexitechly-auto-translate');
    private readonly box: HTMLDivElement;
    private showOriginal = false;
    private menu: Menu | null = null;
    private last: { lang: LangChoice; state: AutoState } | null = null;
    // 暫時顯示在工具列上方的一句話（例如「已存到下載資料夾」），幾秒後消失
    private flashText = '';
    private flashTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly handlers: PillHandlers) {
        const shadow = this.host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = STYLE;
        this.box = document.createElement('div');
        shadow.append(style, this.box);
        document.documentElement.appendChild(this.host);
    }

    private el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.append(...children);
        return node;
    }

    private icon(name: keyof typeof ICONS): HTMLSpanElement {
        const span = document.createElement('span');
        span.style.display = 'contents';
        span.innerHTML = ICONS[name];
        return span;
    }

    private button(content: (Node | string)[], onClick: () => void, className = '', tip = ''): HTMLButtonElement {
        const button = this.el('button', className, ...content);
        button.type = 'button';
        if (tip) {
            button.dataset.tip = tip;
            button.setAttribute('aria-label', tip);
        }
        button.addEventListener('click', (event) => {
            // 閱讀器常把整頁的點擊拿去翻頁，按鈕的點擊不要傳出去
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    private rerender(): void {
        if (this.last) this.showRunning(this.last.lang, this.last.state);
    }

    private closeMenu(): void {
        if (this.menu?.kind === 'lang') this.menu.resolve(null);
        this.menu = null;
    }

    private toggleMenu(kind: 'more'): void {
        const wasOpen = this.menu?.kind === kind;
        this.closeMenu();
        if (!wasOpen) this.menu = { kind };
        this.rerender();
    }

    /** 選原文語言：工具列在時從語言按鈕上方彈出選單 */
    chooseLanguage(): Promise<LangChoice | null> {
        return new Promise((resolve) => {
            this.closeMenu();
            this.menu = { kind: 'lang', resolve };
            this.rerender();
        });
    }

    confirmNotice(title: string, body: string): Promise<boolean> {
        return new Promise((resolve) => {
            const row = this.el('div', 'row',
                this.button([t('manga.notice.cancel')], () => resolve(false)),
                this.button([t('manga.notice.continue')], () => resolve(true), 'primary'));
            this.box.className = 'panel';
            this.box.replaceChildren(this.el('div', 'title', title), this.el('div', 'body', body), row);
        });
    }

    private activityText({ activity }: AutoState): string {
        switch (activity.kind) {
            case 'download':
                return t('manga.auto.activityDownload', { loaded: (activity.loaded / 1048576).toFixed(1), total: (activity.total / 1048576).toFixed(1) });
            case 'analyze':
                return t(activity.prefetch ? 'manga.auto.activityPrefetch' : 'manga.auto.activityAnalyze');
            case 'translate':
                return t(activity.prefetch ? 'manga.auto.activityPrefetch' : 'manga.auto.activityTranslate');
            default:
                return t('manga.auto.idle');
        }
    }

    private statsText({ stats }: AutoState): string {
        const parts = [t('manga.auto.statTranslated', { count: stats.translated })];
        if (stats.noText) parts.push(t('manga.auto.statNoText', { count: stats.noText }));
        if (stats.waitingVisible) parts.push(t('manga.auto.statWaiting', { count: stats.waitingVisible }));
        if (stats.unreadable) parts.push(t('manga.auto.statUnreadable', { count: stats.unreadable }));
        if (stats.failed) parts.push(t('manga.auto.statFailed', { count: stats.failed }));
        return parts.join(' ・ ');
    }

    private langLabel(lang: LangChoice, detected: SourceLang | undefined): string {
        if (lang !== 'auto') return t(LANG_NAMES[lang]);
        return detected ? t('manga.lang.detected', { lang: t(LANG_NAMES[detected]) }) : t('manga.lang.auto');
    }

    showRunning(lang: LangChoice, state: AutoState): void {
        this.last = { lang, state };
        const busy = state.activity.kind === 'busy';

        const status = this.el('div', 'status', this.el('span', `dot ${busy ? 'busy' : state.activity.kind === 'idle' ? 'idle' : 'working'}`), String(state.stats.translated));
        status.dataset.tip = `${this.activityText(state)}\n${this.statsText(state)}`;
        status.tabIndex = 0;

        const shown = lang === 'auto' ? state.detected : lang;
        const langButton = this.button([shown ? t(LANG_SHORT[shown]) : this.icon('languages')], () => {
            if (this.menu?.kind === 'lang') {
                this.closeMenu();
                this.rerender();
            } else {
                this.handlers.onChangeLanguage();
            }
        }, `btn text${this.menu?.kind === 'lang' ? ' open' : ''}`, t('manga.auto.tipLanguage', { lang: this.langLabel(lang, state.detected) }));

        const original = this.button([this.icon('eye')], () => {
            this.showOriginal = !this.showOriginal;
            this.handlers.onToggleOriginal(this.showOriginal);
            this.rerender();
        }, this.showOriginal ? 'btn on' : 'btn', t(this.showOriginal ? 'manga.toolbar.showTranslation' : 'manga.toolbar.showOriginal'));
        original.setAttribute('aria-pressed', String(this.showOriginal));

        // 還有圖要等出現在畫面上才讀得到、又沒開預翻時，在圖示上加一個小黃點提示
        const hint = !state.prefetchNext && state.stats.waitingVisible > 0;
        const prefetchTip = `${t(state.prefetchNext ? 'manga.auto.prefetchOn' : 'manga.auto.prefetchOff')}\n${hint ? t('manga.auto.prefetchHint', { count: state.stats.waitingVisible }) : t('manga.auto.prefetchDesc')}`;
        const prefetch = this.button([this.icon('prefetch'), ...(hint ? [this.el('span', 'badge')] : [])],
            () => this.handlers.onTogglePrefetch(!state.prefetchNext), state.prefetchNext ? 'btn on' : 'btn', prefetchTip);
        prefetch.setAttribute('aria-pressed', String(state.prefetchNext));

        const batch = this.button([this.icon('book')], () => this.handlers.onBatch(), 'btn', `${t('manga.auto.batch')}\n${t('manga.auto.batchDesc')}`);
        const more = this.button([this.icon('more')], () => this.toggleMenu('more'), `btn${this.menu?.kind === 'more' ? ' open' : ''}`, t('manga.auto.more'));
        const stop = this.button([this.icon('close')], () => this.handlers.onStop(), 'btn danger', t('manga.auto.stop'));

        const overlay: Node[] = [];
        if (this.menu) {
            overlay.push(this.renderMenu(this.menu, lang));
        } else if (busy && state.activity.kind === 'busy') {
            const minutes = Math.max(1, Math.ceil((state.activity.retryAt - Date.now()) / 60000));
            overlay.push(this.el('div', 'bubble error', this.el('b', '', t('manga.auto.busyTitle')), t('manga.auto.busyBody', { minutes })));
        } else if (this.flashText) {
            overlay.push(this.el('div', 'bubble', this.flashText));
        }

        this.box.className = 'bar';
        this.box.replaceChildren(status, this.el('span', 'sep'), langButton, original, prefetch, batch, more, stop, ...overlay);
    }

    private renderMenu(menu: Menu, current: LangChoice): HTMLDivElement {
        if (menu.kind === 'lang') {
            const langs: LangChoice[] = ['auto', 'ko', 'ja', 'zh'];
            return this.el('div', 'menu',
                this.el('div', 'menu-title', t('manga.auto.chooseLanguage')),
                ...langs.map((lang) => this.button([t(LANG_NAMES[lang])], () => {
                    this.menu = null;
                    menu.resolve(lang);
                }, lang === current ? 'on' : '')));
        }
        const item = (icon: keyof typeof ICONS, label: string, run: () => void) => this.button([this.icon(icon), label], () => {
            this.menu = null;
            this.rerender();
            run();
        });
        return this.el('div', 'menu',
            item('refresh', t('manga.auto.retranslate'), () => this.handlers.onRetranslate()),
            item('download', t('manga.auto.export'), () => this.handlers.onExport()));
    }

    /** 在工具列上方暫時顯示一句話（按了按鈕之後的回饋） */
    flash(text: string, ms = 6000): void {
        this.flashText = text;
        if (this.flashTimer) clearTimeout(this.flashTimer);
        this.flashTimer = setTimeout(() => {
            this.flashText = '';
            this.rerender();
        }, ms);
        this.rerender();
    }

    remove(): void {
        this.closeMenu();
        if (this.flashTimer) clearTimeout(this.flashTimer);
        this.host.remove();
    }
}
