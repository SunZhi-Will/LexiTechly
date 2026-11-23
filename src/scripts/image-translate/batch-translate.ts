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
 */

import { t } from './i18n';
import { imageUrl, isComicImage, visibleGeometry } from './auto-translate';
import {
    IMAGE_TRANSLATE_BATCH_KEY,
    IMAGE_TRANSLATE_BATCH_PROGRESS,
    IMAGE_TRANSLATE_LOOKUP,
    IMAGE_TRANSLATE_REQUEST,
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

export class BatchRunner {
    private stopped = false;
    private method: NextMethod | null = null;
    private hint: SourceLang | undefined;

    constructor(private readonly lang: LangChoice, private readonly ui: BatchUi) {}

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
        while (!this.stopped && page < MAX_PAGES) {
            const pages = await this.waitForNewPage(current, page === 0 ? FIRST_PAGE_TIMEOUT_MS : NEXT_PAGE_TIMEOUT_MS);
            if (pages.length === 0) break;
            current = pages.map(imageUrl);
            // 翻回看過的頁：整本翻完了
            if (current.every((url) => seen.has(url))) break;
            page++;
            await sleep(SETTLE_MS);
            for (const img of pages) {
                const url = imageUrl(img);
                if (seen.has(url) || this.stopped) continue;
                seen.add(url);
                this.ui.update({ page, translated, saved });
                const outcome = await this.translatePage(img, url);
                if (outcome === 'saved') saved++;
                else if (outcome === 'translated') translated++;
                else if (outcome === 'busy') busy = true;
            }
            this.report(page, translated, saved, false);
            this.ui.update({ page, translated, saved });
            if (busy || this.stopped) break;
            if (!(await this.next(current))) break;
        }
        this.ui.finish({ page, translated, saved, busy });
        this.report(page, translated, saved, true, busy);
    }

    private async translatePage(img: HTMLImageElement, url: string): Promise<'saved' | 'translated' | 'busy' | 'skipped'> {
        const lookup: LookupRequest = { type: IMAGE_TRANSLATE_LOOKUP, srcUrl: url };
        const stored = (await chrome.runtime.sendMessage(lookup).catch(() => null)) as TranslatedImage | null;
        if (stored) {
            this.hint = stored.sourceLang;
            return 'saved';
        }
        const geometry = visibleGeometry(img);
        if (!geometry) return 'skipped';
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
        return response?.code === 'translate-busy' ? 'busy' : 'skipped';
    }

    /** 等畫面上出現跟 previous 不同、而且載好的漫畫頁 */
    private async waitForNewPage(previous: string[], timeout: number): Promise<HTMLImageElement[]> {
        const before = previous.join('\n');
        for (const start = Date.now(); Date.now() - start < timeout && !this.stopped; ) {
            const pages = visiblePages();
            if (pages.length > 0 && pages.map(imageUrl).join('\n') !== before) return pages;
            await sleep(150);
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

    private report(page: number, translated: number, saved: number, finished: boolean, busy = false): void {
        const progress: BatchProgress = { type: IMAGE_TRANSLATE_BATCH_PROGRESS, page, translated, saved, finished, busy };
        chrome.runtime.sendMessage(progress).catch(() => undefined);
    }
}

/** 整本翻譯時的狀態列：跟自動翻譯同一個標籤名稱，擷取畫面時一起被藏起來 */
export class BatchPill {
    private readonly host = document.createElement('readloop-auto-translate');
    private readonly box = document.createElement('div');
    private readonly stopButton = document.createElement('button');

    constructor(onStop: () => void) {
        const shadow = this.host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = `
:host { all: initial; }
.box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; max-width: min(320px, calc(100vw - 32px)); padding: 10px 14px;
  border-radius: 14px; background: rgba(24,24,27,.94); color: #f4f4f5; box-shadow: 0 8px 24px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.08);
  font: 600 13px/1.5 system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; }
.sub { font-weight: 400; font-size: 12px; color: #a1a1aa; margin-top: 2px; }
button { margin-top: 8px; font: 600 12px/1 system-ui, sans-serif; border: 0; border-radius: 999px; padding: 7px 12px; cursor: pointer;
  background: rgba(255,255,255,.1); color: #fca5a5; }
button:hover { background: rgba(248,113,113,.18); }`;
        const stop = this.stopButton;
        stop.type = 'button';
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

    private render(title: string, sub: string, withStop: boolean): void {
        const titleEl = document.createElement('div');
        titleEl.textContent = title;
        const subEl = document.createElement('div');
        subEl.className = 'sub';
        subEl.textContent = sub;
        this.box.replaceChildren(titleEl, subEl, ...(withStop ? [this.stopButton] : []));
    }

    update({ page, translated, saved }: { page: number; translated: number; saved: number }): void {
        this.render(t('manga.batch.running', { page }), t('manga.batch.stats', { translated, saved }), true);
    }

    remove(): void {
        this.host.remove();
    }

    finish({ page, translated, saved, busy }: { page: number; translated: number; saved: number; busy: boolean }): void {
        this.render(busy ? t('manga.batch.busy', { page }) : t('manga.batch.done'), t('manga.batch.stats', { translated, saved }), false);
    }
}
