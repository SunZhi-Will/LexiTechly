/**
 * 整本翻譯（內容腳本，跑在使用者自己的分頁裡）：自己一頁一頁往下翻，每頁擷取、辨識、翻譯、存起來
 *
 * 用在不讓擴充功能直接讀圖片的網站：圖片只有顯示在畫面上才能擷取，所以在使用者的分頁裡翻一輪
 * （擴充功能只有這個分頁的 activeTab，另開視窗擷取不了）；翻好的頁存在本機（translation-store.ts），之後打開同一部漫畫直接貼上。
 * 不針對任何網站，翻頁方式自己試：
 * 1. 網址的 # 後面是頁碼（#5）就改頁碼；
 * 2. 直式長條（好幾頁圖由上往下排）就捲到下一張圖；捲到底就是翻完。長條頁面不按鍵盤，
 *    因為這種網站的 ←、→ 常常是上一話、下一話，會把使用者的分頁帶走（Pepper&Carrot 實際遇過）；
 * 3. 都不是就依序試 ←、→、PageDown、空白鍵（在網頁本身的環境按，閱讀器才收得到），記住有用的那一個。
 * 翻不動了、或翻回看過的頁，就當作整本翻完。
 *
 * 兩種跑法：
 * - 背景（hidden）：背景頁另開一個不切換過去的分頁跑這段，使用者正在看的分頁完全不動。
 *   背景分頁擷取不了畫面，只能直接抓原圖；網站不讓抓（每頁都要顯示在畫面上才讀得到）就停下回報 capture-only。
 * - 在這個分頁：上面那種跑不了的網站才用，會在使用者的分頁裡自動翻頁、擷取畫面。
 */

import { t } from './i18n';
import { imageUrl, isComicImage, visibleGeometry } from './auto-translate';
import {
    IMAGE_TRANSLATE_BATCH_KEY,
    IMAGE_TRANSLATE_BATCH_PROGRESS,
    IMAGE_TRANSLATE_LOOKUP,
    IMAGE_TRANSLATE_REQUEST,
    IMAGE_TRANSLATE_WAIT,
    nextHash,
    type BatchKeyRequest,
    type BatchProgress,
    type LangChoice,
    type LookupRequest,
    type SourceLang,
    type TranslateRequest,
    type TranslateResponse,
    type TranslatedImage
} from './protocol';

// 新的一頁出現後等這麼久再擷取（閱讀器常有淡入動畫）
const SETTLE_MS = 300;
// 等第一頁出現的上限；之後每次翻頁等新的一頁出現的上限
const FIRST_PAGE_TIMEOUT_MS = 20000;
const NEXT_PAGE_TIMEOUT_MS = 6000;
const MAX_PAGES = 400;
// 背景跑時，開頭這麼多頁都抓不到原圖，就當作這個網站背景翻不了
const CAPTURE_ONLY_PROBE_PAGES = 3;
// 同一頁有兩張（跨頁模式）時，比最大那張小太多的不算漫畫頁
const SECONDARY_IMAGE_RATIO = 0.2;

type NextMethod = { kind: 'hash' } | { kind: 'scroll' } | { kind: 'key'; key: string; keyCode: number };

const KEY_CANDIDATES: NextMethod[] = [
    { kind: 'key', key: 'ArrowLeft', keyCode: 37 },
    { kind: 'key', key: 'ArrowRight', keyCode: 39 },
    { kind: 'key', key: 'PageDown', keyCode: 34 },
    { kind: 'key', key: ' ', keyCode: 32 }
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 畫面上看得到的漫畫頁（最大的那張，跨頁模式時連同旁邊那張） */
export function visiblePages(): HTMLImageElement[] {
    const shown = Array.from(document.images)
        .filter((img) => isComicImage(img) && visibleGeometry(img))
        .map((img) => ({ img, area: img.getBoundingClientRect().width * img.getBoundingClientRect().height }))
        .sort((a, b) => b.area - a.area);
    if (shown.length === 0) return [];
    return shown.filter((entry) => entry.area >= shown[0].area * SECONDARY_IMAGE_RATIO).map((entry) => entry.img);
}

/** 排在頁面上（不是藏起來預載）的漫畫圖 */
function inFlowComicImages(): HTMLImageElement[] {
    return Array.from(document.images).filter((img) => isComicImage(img) && img.getBoundingClientRect().height > 0 && getComputedStyle(img).display !== 'none');
}

/** 直式長條：頁面上排了不只一張漫畫圖，而且可以往下捲 */
function isVerticalStrip(): boolean {
    return inFlowComicImages().length > 1 && document.documentElement.scrollHeight > window.innerHeight * 1.5;
}

export interface BatchUi {
    update(progress: { page: number; translated: number; saved: number }): void;
    finish(progress: { page: number; translated: number; saved: number; busy: boolean }): void;
}

type PageOutcome = 'saved' | 'translated' | 'busy' | 'needs-visible' | 'skipped';

export class BatchRunner {
    private stopped = false;
    private method: NextMethod | null = null;
    private hint: SourceLang | undefined;

    /** hidden：在背景分頁跑（不擷取畫面，計時交給背景頁） */
    constructor(private readonly lang: LangChoice, private readonly ui: BatchUi, private readonly hidden = false) {}

    /** 背景分頁的計時器會被瀏覽器放慢，改請背景頁計時；背景頁沒回應就退回自己計時 */
    private async wait(ms: number): Promise<void> {
        if (!this.hidden) {
            await sleep(ms);
            return;
        }
        const ok = await chrome.runtime.sendMessage({ type: IMAGE_TRANSLATE_WAIT, ms }).catch(() => false);
        if (!ok) await sleep(ms);
    }

    stop(): void {
        this.stopped = true;
    }

    async run(): Promise<void> {
        const seen = new Set<string>();
        let current: string[] = [];
        let page = 0;
        let translated = 0;
        let saved = 0;
        let busy = false;
        let needsVisible = 0;
        let reason: BatchProgress['reason'];
        while (!this.stopped && page < MAX_PAGES) {
            const pages = await this.waitForNewPage(current, page === 0 ? FIRST_PAGE_TIMEOUT_MS : NEXT_PAGE_TIMEOUT_MS);
            if (pages.length === 0) break;
            current = pages.map(imageUrl);
            // 翻回看過的頁：整本翻完了
            if (current.every((url) => seen.has(url))) break;
            page++;
            await this.wait(SETTLE_MS);
            for (const img of pages) {
                const url = imageUrl(img);
                if (seen.has(url) || this.stopped) continue;
                seen.add(url);
                this.ui.update({ page, translated, saved });
                const outcome = await this.translatePage(img, url);
                if (outcome === 'saved') saved++;
                else if (outcome === 'translated') translated++;
                else if (outcome === 'busy') busy = true;
                else if (outcome === 'needs-visible') needsVisible++;
            }
            // 背景跑：開頭幾頁都抓不到原圖，這個網站只能在畫面上擷取，不用再翻下去
            if (this.hidden && page >= CAPTURE_ONLY_PROBE_PAGES && translated === 0 && saved === 0 && needsVisible > 0) {
                reason = 'capture-only';
                break;
            }
            this.report({ page, translated, saved, needsVisible, finished: false });
            this.ui.update({ page, translated, saved });
            if (busy || this.stopped) break;
            if (!(await this.next(current))) break;
        }
        if (this.stopped && !reason) reason = 'stopped';
        this.ui.finish({ page, translated, saved, busy });
        this.report({ page, translated, saved, needsVisible, finished: true, busy, reason });
    }

    private async translatePage(img: HTMLImageElement, url: string): Promise<PageOutcome> {
        const lookup: LookupRequest = { type: IMAGE_TRANSLATE_LOOKUP, srcUrl: url };
        const stored = (await chrome.runtime.sendMessage(lookup).catch(() => null)) as TranslatedImage | null;
        if (stored) {
            this.hint = stored.sourceLang;
            return 'saved';
        }
        // 背景分頁擷取不了畫面：不給位置，背景頁就只會直接抓原圖
        const geometry = this.hidden ? null : visibleGeometry(img);
        if (!geometry && !this.hidden) return 'skipped';
        const request: TranslateRequest = {
            type: IMAGE_TRANSLATE_REQUEST,
            requestId: crypto.randomUUID(),
            srcUrl: url,
            lang: this.lang,
            hint: this.hint,
            geometry,
            prefetch: false
        };
        const response = (await chrome.runtime.sendMessage(request).catch(() => undefined)) as TranslateResponse | undefined;
        if (response?.ok) {
            this.hint = response.result.sourceLang;
            return 'translated';
        }
        if (response?.code === 'translate-busy') return 'busy';
        if (response?.code === 'capture-failed') return 'needs-visible';
        return 'skipped';
    }

    /** 等畫面上出現跟 previous 不同、而且載好的漫畫頁 */
    private async waitForNewPage(previous: string[], timeout: number): Promise<HTMLImageElement[]> {
        const before = previous.join('\n');
        for (const start = Date.now(); Date.now() - start < timeout && !this.stopped; ) {
            const pages = visiblePages();
            if (pages.length > 0 && pages.map(imageUrl).join('\n') !== before) return pages;
            await this.wait(150);
        }
        return [];
    }

    private async perform(method: NextMethod): Promise<void> {
        if (method.kind === 'hash') {
            const next = nextHash(location.hash);
            if (next) location.hash = next;
            return;
        }
        if (method.kind === 'scroll') {
            // 捲到目前這頁下面的第一張圖；還沒載入的圖量不到位置，就往下捲一個畫面讓它載入
            const bottom = Math.max(...visiblePages().map((img) => img.getBoundingClientRect().bottom));
            const below = inFlowComicImages()
                .map((img) => img.getBoundingClientRect().top)
                .filter((top) => top >= bottom - 4)
                .sort((a, b) => a - b)[0];
            window.scrollBy(0, below !== undefined ? below : window.innerHeight * 0.9);
            return;
        }
        const press: BatchKeyRequest = { type: IMAGE_TRANSLATE_BATCH_KEY, key: method.key, keyCode: method.keyCode };
        await chrome.runtime.sendMessage(press).catch(() => undefined);
    }

    /** 翻到下一頁；第一次自己試哪個方法有用，之後都用那個。翻不動回傳 false（整本翻完） */
    private async next(current: string[]): Promise<boolean> {
        const tryMethod = async (method: NextMethod) => {
            await this.perform(method);
            return (await this.waitForNewPage(current, NEXT_PAGE_TIMEOUT_MS)).length > 0;
        };
        if (this.method) {
            if (this.method.kind === 'scroll' && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) return false;
            return tryMethod(this.method);
        }
        const fallback: NextMethod[] = isVerticalStrip() ? [{ kind: 'scroll' }] : KEY_CANDIDATES;
        const candidates: NextMethod[] = [...(nextHash(location.hash) ? [{ kind: 'hash' } as NextMethod] : []), ...fallback];
        for (const method of candidates) {
            if (this.stopped) return false;
            if (await tryMethod(method)) {
                this.method = method;
                return true;
            }
        }
        return false;
    }

    private report(progress: Omit<BatchProgress, 'type'>): void {
        const message: BatchProgress = { type: IMAGE_TRANSLATE_BATCH_PROGRESS, ...progress };
        chrome.runtime.sendMessage(message).catch(() => undefined);
    }
}

/** 整本翻譯時的狀態列：跟自動翻譯同一個標籤名稱，擷取畫面時一起被藏起來 */
export class BatchPill {
    private readonly host = document.createElement('readloop-auto-translate');
    private readonly box = document.createElement('div');
    private readonly stopButton = document.createElement('button');
    private removeTimer: ReturnType<typeof setTimeout> | null = null;

    /** raised：自動翻譯的狀態列也開著時，往上移一點不要疊在一起 */
    constructor(onStop: () => void, raised = false) {
        const shadow = this.host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = `
:host { all: initial; }
.box { position: fixed; right: 16px; bottom: ${raised ? 72 : 16}px; z-index: 2147483647; max-width: min(320px, calc(100vw - 32px)); padding: 10px 14px;
  border-radius: 14px; background: rgba(24,24,27,.94); color: #f4f4f5; box-shadow: 0 8px 24px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.08);
  font: 600 13px/1.5 system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; }
.sub { font-weight: 400; font-size: 12px; color: #a1a1aa; margin-top: 2px; white-space: pre-line; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
button { margin-top: 8px; font: 600 12px/1 system-ui, sans-serif; border: 0; border-radius: 999px; padding: 7px 12px; cursor: pointer;
  background: rgba(255,255,255,.1); color: #f4f4f5; }
button:hover { background: rgba(255,255,255,.18); }
button.stop { color: #fca5a5; }
button.stop:hover { background: rgba(248,113,113,.18); }`;
        const stop = this.stopButton;
        stop.type = 'button';
        stop.className = 'stop';
        stop.textContent = t('manga.auto.stop');
        stop.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onStop();
        });
        this.box.className = 'box';
        shadow.append(style, this.box);
        document.documentElement.appendChild(this.host);
    }

    private button(label: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    private render(title: string, sub: string, buttons: HTMLButtonElement[]): void {
        const titleEl = document.createElement('div');
        titleEl.textContent = title;
        const subEl = document.createElement('div');
        subEl.className = 'sub';
        subEl.textContent = sub;
        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.append(...buttons);
        this.box.replaceChildren(titleEl, subEl, ...(buttons.length > 0 ? [actions] : []));
    }

    get isRemoved(): boolean {
        return !this.host.isConnected;
    }

    update({ page, translated, saved }: { page: number; translated: number; saved: number }): void {
        this.render(t('manga.batch.running', { page }), t('manga.batch.stats', { translated, saved }), [this.stopButton]);
    }

    /** 背景整本翻譯中：說明在另一個分頁翻、這頁可以照常看 */
    updateBackground({ page, translated, saved }: { page: number; translated: number; saved: number }): void {
        const sub = page === 0 ? t('manga.book.starting') : t('manga.batch.stats', { translated, saved });
        this.render(page === 0 ? t('manga.book.preparing') : t('manga.book.running', { page }), sub, [this.stopButton]);
    }

    /** 最後的結果；有 action 就多一個按鈕，否則過一陣子自己消失 */
    showFinal(title: string, sub: string, action?: { label: string; run: () => void }): void {
        const buttons: HTMLButtonElement[] = [];
        if (action) {
            buttons.push(this.button(action.label, () => {
                this.remove();
                action.run();
            }));
        }
        buttons.push(this.button(t('manga.book.close'), () => this.remove()));
        this.render(title, sub, buttons);
        if (this.removeTimer) clearTimeout(this.removeTimer);
        if (!action) this.removeTimer = setTimeout(() => this.remove(), 15000);
    }

    remove(): void {
        if (this.removeTimer) clearTimeout(this.removeTimer);
        this.host.remove();
    }

    finish({ page, translated, saved, busy }: { page: number; translated: number; saved: number; busy: boolean }): void {
        this.render(busy ? t('manga.batch.busy', { page }) : t('manga.batch.done'), t('manga.batch.stats', { translated, saved }), []);
    }
}
