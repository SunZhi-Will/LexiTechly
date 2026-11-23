/**
 * 自動翻譯模式（內容腳本）：翻這頁所有的漫畫圖，換頁或新出現的圖也跟著翻
 *
 * 通用做法，不針對任何網站：
 * - 掃描頁面上夠大的 <img>；MutationObserver 盯著新加入的圖與 src 改變（單張閱讀器換頁就是換 src）。
 * - PerformanceObserver 收集網頁載入過的圖片網址：閱讀器常在背景預載下一頁（不在 DOM 裡），
 *   這些網址抓得到原圖就先翻好；使用者翻到那一頁時直接貼上，不用等。
 * - 順序：畫面上看得到的優先，其次是頁面上其他的圖，再來是預載的網址，最後（開了「預翻下一頁」時）
 *   把閱讀器已經載好、藏在頁面裡的下一頁短暫顯示出來擷取。
 * - 同時最多處理兩張：一張在等翻譯（網路）時，另一張可以先辨識；擷取畫面一次只做一張。
 * - 結果依圖片網址快取在這個分頁裡；同一張圖再出現（往回翻頁）直接貼上。
 * - 抓不到原圖的網站（不允許跨來源讀取）只能讓圖出現在畫面上再擷取，不繞過網站的防盜連。
 *
 * 使用者要看得出它在做什麼：每次狀態改變都回報 AutoState（正在做什麼、各結果的張數），由右下角狀態列顯示；
 * 畫面上正在處理的那張圖也直接標出「辨識中／翻譯中」，失敗時標出原因幾秒鐘。
 */

import { t } from './i18n';
import { TranslationOverlay } from './overlay';
import {
    IMAGE_TRANSLATE_LOOKUP,
    IMAGE_TRANSLATE_REQUEST,
    translationKey,
    type ImageGeometry,
    type LookupRequest,
    type LangChoice,
    type ProgressMessage,
    type SourceLang,
    type TranslateRequest,
    type TranslateResponse,
    type TranslatedImage
} from './protocol';

// 比這小的圖不是漫畫頁（圖示、頭像、按鈕）
const MIN_NATURAL_SIDE = 300;
// 畫面上至少要露出這麼多才算「看得到」，擷取畫面才有意義
const MIN_VISIBLE_PX = 120;
// 預載網址：解碼後太小的資源（圖示）直接不收；0 代表跨來源拿不到大小，先收下讓背景頁判斷
const PREFETCH_MIN_BYTES = 60 * 1024;
// 預先翻譯最多收這麼多個網址，避免無限捲動的頁面把佇列塞爆
const PREFETCH_LIMIT = 40;
const SCROLL_THROTTLE_MS = 250;
// 畫面上那張圖失敗時，原因標示多久
const FAILURE_BADGE_MS = 3500;
// 圖片出現（或換頁）後等這麼久再擷取畫面：閱讀器換頁常有淡入動畫，太早截到的是半透明的字，小字會讀不出來
const CAPTURE_SETTLE_MS = 250;
// 同時處理幾張（辨識在 offscreen 文件裡排隊，第二張主要是讓翻譯的網路等待和下一張的辨識重疊）
const MAX_IN_FLIGHT = 2;
// 預翻下一頁：顯示擷取用的圖層之後等這麼久（圖片解碼、畫面重畫）
const FLASH_SETTLE_FRAMES = 2;
const MB = 1024 * 1024;

type Entry =
    | { status: 'pending' }
    | { status: 'done'; result: TranslatedImage }
    | { status: 'needs-visible' }
    | { status: 'no-text' }
    | { status: 'unreadable' }
    | { status: 'failed' }
    | { status: 'skipped' };

interface Job {
    url: string;
    img: HTMLImageElement | null;
    geometry: ImageGeometry | null;
    prefetch: boolean;
    // 預翻下一頁：把藏在頁面裡、已經載好的圖短暫顯示在全螢幕圖層上擷取
    flash: boolean;
}

interface Running {
    job: Job;
    // 畫面上看得到的那張的狀態層（「辨識中／翻譯中」）；不在畫面上的沒有
    overlay: TranslationOverlay | null;
    background: boolean;
}

export interface AutoStats {
    translated: number;
    noText: number;
    unreadable: number;
    failed: number;
    // 抓不到原圖、要等出現在畫面上才能擷取的張數
    waitingVisible: number;
}

export type AutoActivity =
    | { kind: 'analyze'; prefetch: boolean }
    | { kind: 'translate'; prefetch: boolean }
    | { kind: 'download'; loaded: number; total: number }
    | { kind: 'idle' }
    // 翻譯服務被擋；retryAt 之後可以再試
    | { kind: 'busy'; retryAt: number };

export interface AutoState {
    stats: AutoStats;
    activity: AutoActivity;
    // 自動判斷時，最近一張判斷出來的原文語言
    detected?: SourceLang;
    // 「預翻下一頁」有沒有開
    prefetchNext: boolean;
}

export function imageUrl(img: HTMLImageElement): string {
    return img.currentSrc || img.src;
}

const FLASH_TAG = 'lexitechly-flash';

function isOurs(img: HTMLImageElement): boolean {
    return Boolean(img.closest(`lexitechly-image-translation, lexitechly-auto-translate, ${FLASH_TAG}`));
}

export function isComicImage(img: HTMLImageElement): boolean {
    return img.complete && img.naturalWidth >= MIN_NATURAL_SIDE && img.naturalHeight >= MIN_NATURAL_SIDE && !isOurs(img) && /^(https?:|data:|blob:)/.test(imageUrl(img));
}

export function visibleGeometry(img: HTMLImageElement): ImageGeometry | null {
    const rect = img.getBoundingClientRect();
    const visibleWidth = Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left);
    const visibleHeight = Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top);
    if (visibleWidth < MIN_VISIBLE_PX || visibleHeight < MIN_VISIBLE_PX) return null;
    const style = getComputedStyle(img);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return null;
    return {
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight }
    };
}

export class AutoTranslator {
    private readonly cache = new Map<string, Entry>();
    private readonly overlays = new Map<HTMLImageElement, { url: string; overlay: TranslationOverlay }>();
    private readonly prefetchUrls: string[] = [];
    private readonly requestIds = new Set<string>();
    private mutationObserver: MutationObserver | null = null;
    private performanceObserver: PerformanceObserver | null = null;
    private scrollTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly running = new Map<string, Running>();
    // 按了「重翻這頁」的圖：不要拿之前存的譯文，重新擷取、辨識
    private readonly fresh = new Set<string>();
    // 有一張正在等擷取畫面：擷取一次只做一張（藏介面、預翻的圖層都只有一份）
    private capturing = false;
    private scheduled = false;
    private stopped = false;
    private paused = false;
    private showOriginal = false;
    private prefetchNext = false;
    private flashLayer: HTMLElement | null = null;
    private activity: AutoActivity = { kind: 'idle' };
    // 最近一張判斷出的語言：下一張先試它（同一部作品通常同一種語言），自動判斷就不用每張都試好幾種
    private detected: SourceLang | undefined;

    constructor(private lang: LangChoice, private readonly onChange: (state: AutoState) => void) {}

    start(): void {
        this.mutationObserver = new MutationObserver((records) => {
            for (const record of records) {
                if (record.type === 'attributes' && record.target instanceof HTMLImageElement) this.refresh(record.target);
            }
            this.schedule();
        });
        this.mutationObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset'] });
        document.addEventListener('load', this.onLoad, true);
        window.addEventListener('scroll', this.onScroll, { passive: true, capture: true });
        window.addEventListener('resize', this.onScroll, { passive: true });
        try {
            this.performanceObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries() as PerformanceResourceTiming[]) this.notePrefetch(entry);
            });
            this.performanceObserver.observe({ type: 'resource', buffered: true });
        } catch {
            this.performanceObserver = null;
        }
        this.emit();
        this.schedule();
    }

    stop(): void {
        this.stopped = true;
        this.removeFlash();
        this.mutationObserver?.disconnect();
        this.performanceObserver?.disconnect();
        document.removeEventListener('load', this.onLoad, true);
        window.removeEventListener('scroll', this.onScroll, { capture: true });
        window.removeEventListener('resize', this.onScroll);
        for (const { overlay } of this.overlays.values()) overlay.remove();
        this.overlays.clear();
    }

    /** 換原文語言：之前的結果都作廢 */
    setLanguage(lang: LangChoice): void {
        this.lang = lang;
        this.detected = undefined;
        this.cache.clear();
        for (const { overlay } of this.overlays.values()) overlay.remove();
        this.overlays.clear();
        this.paused = false;
        this.activity = { kind: 'idle' };
        this.emit();
        this.schedule();
    }

    /** 「預翻下一頁」開關：開了才會把藏在頁面裡的下一頁短暫顯示出來擷取（會閃一下） */
    setPrefetchNext(enabled: boolean): void {
        this.prefetchNext = enabled;
        this.emit();
        this.schedule();
    }

    /** 背景頁擷取完畫面了：拿掉預翻的圖層，下一張可以開始擷取 */
    onCaptureDone(): void {
        this.removeFlash();
        if (this.capturing) {
            this.capturing = false;
            this.schedule();
        }
    }

    setShowOriginal(showOriginal: boolean): void {
        this.showOriginal = showOriginal;
        for (const { overlay } of this.overlays.values()) overlay.setVisible(!showOriginal);
    }

    /** 重翻畫面上看得到的圖：清掉它們的結果，重新擷取、辨識（有對話框漏翻時用） */
    retranslateVisible(): void {
        for (const img of Array.from(document.images).filter(isComicImage)) {
            if (!visibleGeometry(img)) continue;
            this.cache.delete(imageUrl(img));
            this.fresh.add(imageUrl(img));
            this.overlays.get(img)?.overlay.remove();
            this.overlays.delete(img);
        }
        this.paused = false;
        this.activity = { kind: 'idle' };
        this.emit();
        this.schedule();
    }

    /** 畫面上看得到的圖的辨識紀錄（擷取到的圖、偵測到的區塊、每一行讀到的字、譯文） */
    visibleDiagnostics(): { url: string; result: TranslatedImage }[] {
        const out: { url: string; result: TranslatedImage }[] = [];
        for (const img of Array.from(document.images).filter(isComicImage)) {
            const url = imageUrl(img);
            const entry = this.cache.get(url);
            if (visibleGeometry(img) && entry?.status === 'done') out.push({ url, result: entry.result });
        }
        return out;
    }

    /** 翻譯服務被擋時暫停；按快捷鍵重新開始 */
    get isPaused(): boolean {
        return this.paused;
    }

    ownsRequest(requestId: string): boolean {
        return this.requestIds.has(requestId);
    }

    /** 背景頁回報這張的進度：第一次下載模型、辨識中、翻譯中 */
    onProgress(message: ProgressMessage): void {
        const run = this.running.get(message.requestId);
        if (!run) return;
        if (message.phase === 'download' && message.total) {
            this.activity = { kind: 'download', loaded: message.loaded ?? 0, total: message.total };
            run.overlay?.setStatus(t('manga.status.downloading', { loaded: ((message.loaded ?? 0) / MB).toFixed(1), total: (message.total / MB).toFixed(1) }));
        } else if (message.phase === 'analyze') {
            // 開始辨識代表擷取（如果有）已經完成，下一張可以擷取了
            this.onCaptureDone();
            this.activity = { kind: 'analyze', prefetch: run.background };
            run.overlay?.setStatus(t('manga.status.analyzing'));
        } else if (message.phase === 'translate') {
            this.activity = { kind: 'translate', prefetch: run.background };
            run.overlay?.setStatus(t('manga.status.translating'));
        }
        this.emit();
    }

    private stats(): AutoStats {
        const stats: AutoStats = { translated: 0, noText: 0, unreadable: 0, failed: 0, waitingVisible: 0 };
        for (const entry of this.cache.values()) {
            if (entry.status === 'done') stats.translated++;
            else if (entry.status === 'no-text') stats.noText++;
            else if (entry.status === 'unreadable') stats.unreadable++;
            else if (entry.status === 'failed') stats.failed++;
            else if (entry.status === 'needs-visible') stats.waitingVisible++;
        }
        return stats;
    }

    private emit(): void {
        if (!this.stopped) this.onChange({ stats: this.stats(), activity: this.activity, detected: this.detected, prefetchNext: this.prefetchNext });
    }

    private onLoad = (event: Event): void => {
        if (event.target instanceof HTMLImageElement) {
            this.refresh(event.target);
            this.schedule();
        }
    };

    private onScroll = (): void => {
        if (this.scrollTimer) return;
        this.scrollTimer = setTimeout(() => {
            this.scrollTimer = null;
            this.schedule();
        }, SCROLL_THROTTLE_MS);
    };

    private notePrefetch(entry: PerformanceResourceTiming): void {
        if (entry.initiatorType !== 'img' && entry.initiatorType !== 'css') return;
        if (!/^https?:/.test(entry.name) || this.prefetchUrls.length >= PREFETCH_LIMIT) return;
        if (entry.decodedBodySize > 0 && entry.decodedBodySize < PREFETCH_MIN_BYTES) return;
        if (!this.prefetchUrls.includes(entry.name)) {
            this.prefetchUrls.push(entry.name);
            this.schedule();
        }
    }

    /** 一張圖換了網址（換頁）：拿掉舊的譯文層，新網址已經翻好就直接貼 */
    private refresh(img: HTMLImageElement): void {
        const current = this.overlays.get(img);
        const url = imageUrl(img);
        if (current && current.url !== url) {
            current.overlay.remove();
            this.overlays.delete(img);
        }
        const entry = this.cache.get(url);
        if (entry?.status === 'done' && !this.overlays.has(img) && isComicImage(img)) this.show(img, url, entry.result);
    }

    private show(img: HTMLImageElement, url: string, result: TranslatedImage, overlay?: TranslationOverlay): void {
        const layer = overlay ?? new TranslationOverlay(img, { toolbar: false });
        this.overlays.set(img, { url, overlay: layer });
        layer.setVisible(!this.showOriginal);
        layer.showResult({ type: 'LEXITECHLY_IMAGE_TRANSLATE_RESULT', ...result }).catch(() => layer.remove());
    }

    private schedule(): void {
        if (this.scheduled || this.stopped || this.paused) return;
        this.scheduled = true;
        setTimeout(() => {
            this.scheduled = false;
            this.pump();
        }, 0);
    }

    private nextJob(): Job | null {
        for (const [img, { overlay }] of this.overlays) {
            if (!img.isConnected || overlay.isRemoved) this.overlays.delete(img);
        }
        const images = Array.from(document.images).filter(isComicImage);
        // 1. 畫面上看得到、還沒翻的（包括之前抓不到原圖、等它出現在畫面上的）
        for (const img of images) {
            const url = imageUrl(img);
            const entry = this.cache.get(url);
            if (entry?.status === 'done') {
                if (!this.overlays.has(img)) this.show(img, url, entry.result);
                continue;
            }
            if (entry && entry.status !== 'needs-visible') continue;
            const geometry = visibleGeometry(img);
            if (geometry) return { url, img, geometry, prefetch: false, flash: false };
        }
        // 2. 頁面上其他還沒翻的圖（不在畫面上：只能抓原圖）
        for (const img of images) {
            const url = imageUrl(img);
            if (!this.cache.has(url)) return { url, img, geometry: null, prefetch: false, flash: false };
        }
        // 3. 閱讀器在背景預載的網址
        for (const url of this.prefetchUrls) {
            if (!this.cache.has(url)) return { url, img: null, geometry: null, prefetch: true, flash: false };
        }
        // 4. 預翻下一頁：抓不到原圖、藏在頁面裡（閱讀器預載好）的圖。只在其他都做完、沒有在處理的時候做，
        //    免得使用者正在看的那頁還沒翻好就先閃
        if (this.prefetchNext && this.running.size === 0) {
            for (const img of images) {
                const url = imageUrl(img);
                if (this.cache.get(url)?.status === 'needs-visible' && !visibleGeometry(img)) return { url, img, geometry: null, prefetch: false, flash: true };
            }
        }
        return null;
    }

    private pump(): void {
        if (this.stopped || this.paused) return;
        while (this.running.size < MAX_IN_FLIGHT) {
            const job = this.nextJob();
            if (!job) break;
            // 要擷取畫面的一次一張：等前一張擷取完再開始
            if ((job.geometry || job.flash) && this.capturing) break;
            void this.run(job);
        }
        if (this.running.size === 0 && this.activity.kind !== 'idle' && this.activity.kind !== 'busy') {
            this.activity = { kind: 'idle' };
            this.emit();
        }
    }

    /** 預翻下一頁：把圖顯示在全螢幕圖層上（圖片本來就是網頁載好的，不會再下載），等畫面重畫好回傳它的位置 */
    private async showFlash(url: string): Promise<ImageGeometry | null> {
        this.removeFlash();
        const layer = document.createElement(FLASH_TAG);
        layer.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#111;display:flex;align-items:center;justify-content:center;pointer-events:none');
        const img = document.createElement('img');
        img.setAttribute('style', 'max-width:100vw;max-height:100vh;object-fit:contain;display:block');
        img.src = url;
        layer.appendChild(img);
        document.documentElement.appendChild(layer);
        this.flashLayer = layer;
        try {
            await img.decode();
        } catch {
            this.removeFlash();
            return null;
        }
        for (let i = 0; i < FLASH_SETTLE_FRAMES; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
        return this.flashLayer === layer ? visibleGeometry(img) : null;
    }

    private removeFlash(): void {
        this.flashLayer?.remove();
        this.flashLayer = null;
    }

    private async run(job: Job): Promise<void> {
        const requestId = crypto.randomUUID();
        const capture = Boolean(job.geometry || job.flash);
        this.cache.set(job.url, { status: 'pending' });
        const run: Running = { job, overlay: null, background: job.prefetch || !job.geometry };
        this.running.set(requestId, run);
        this.requestIds.add(requestId);
        if (capture) this.capturing = true;
        try {
            // 之前翻過（存在本機）：直接貼上，不用擷取、辨識、翻譯
            if (!this.fresh.delete(job.url) && translationKey(job.url)) {
                const lookup: LookupRequest = { type: IMAGE_TRANSLATE_LOOKUP, srcUrl: job.url };
                const stored = (await chrome.runtime.sendMessage(lookup)) as TranslatedImage | null;
                if (this.stopped) return;
                if (stored) {
                    this.handleResponse(job, { ok: true, result: stored }, null);
                    return;
                }
            }
            if (job.img && job.geometry) {
                // 要擷取畫面的：先等畫面穩定，再重新量一次位置；這段時間換頁了就放回去重新挑
                await new Promise((resolve) => setTimeout(resolve, CAPTURE_SETTLE_MS));
                const geometry = visibleGeometry(job.img);
                if (this.stopped || this.paused || imageUrl(job.img) !== job.url || !geometry) {
                    this.cache.delete(job.url);
                    return;
                }
                job.geometry = geometry;
                this.overlays.get(job.img)?.overlay.remove();
                run.overlay = new TranslationOverlay(job.img, { toolbar: false });
                run.overlay.setStatus(t('manga.status.analyzing'));
                this.overlays.set(job.img, { url: job.url, overlay: run.overlay });
            } else if (job.flash) {
                job.geometry = await this.showFlash(job.url);
                if (this.stopped || !job.geometry) {
                    this.cache.set(job.url, { status: 'unreadable' });
                    return;
                }
            }
            this.activity = { kind: 'analyze', prefetch: run.background };
            this.emit();
            const request: TranslateRequest = {
                type: IMAGE_TRANSLATE_REQUEST,
                requestId,
                srcUrl: job.url,
                lang: this.lang,
                hint: this.detected,
                geometry: job.geometry,
                prefetch: job.prefetch,
                // 預翻的圖已經知道抓不到原圖，直接擷取，圖層閃的時間越短越好
                skipFetch: job.flash
            };
            const response = (await chrome.runtime.sendMessage(request)) as TranslateResponse | undefined;
            if (this.stopped) return;
            this.handleResponse(job, response, run.overlay);
        } catch {
            this.cache.set(job.url, { status: 'failed' });
            this.showFailure(job, run.overlay, 'manga.error.analyze');
        } finally {
            if (job.flash) this.removeFlash();
            if (capture) this.onCaptureDone();
            this.running.delete(requestId);
            this.requestIds.delete(requestId);
            if (this.running.size === 0 && !this.paused) this.activity = { kind: 'idle' };
            this.emit();
            this.schedule();
        }
    }

    /** 畫面上那張圖失敗：在圖上標出原因幾秒，之後拿掉，原圖照常可看 */
    private showFailure(job: Job, overlay: TranslationOverlay | null, key: 'manga.error.noText' | 'manga.error.capture' | 'manga.error.analyze' | 'manga.error.translate' | 'manga.error.noKey'): void {
        if (!overlay || !job.img) return;
        overlay.setStatus(t(key), true);
        const img = job.img;
        setTimeout(() => {
            if (this.overlays.get(img)?.overlay === overlay) this.overlays.delete(img);
            overlay.remove();
        }, FAILURE_BADGE_MS);
    }

    private handleResponse(job: Job, response: TranslateResponse | undefined, overlay: TranslationOverlay | null): void {
        if (response?.ok) {
            this.cache.set(job.url, { status: 'done', result: response.result });
            this.detected = response.result.sourceLang;
            // 這段時間使用者可能已經換頁：只貼在目前還顯示這個網址的圖上
            for (const img of Array.from(document.images)) {
                if (imageUrl(img) !== job.url || !isComicImage(img)) continue;
                const existing = this.overlays.get(img);
                this.show(img, job.url, response.result, existing?.url === job.url ? existing.overlay : undefined);
            }
            return;
        }
        const code = response?.code ?? 'analyze-failed';
        if (code === 'translate-busy') {
            // 被擋就停下來，免得一直打；這張圖留著沒翻，重新開始時會再試
            this.cache.delete(job.url);
            overlay?.remove();
            if (job.img && this.overlays.get(job.img)?.overlay === overlay) this.overlays.delete(job.img);
            this.paused = true;
            this.activity = { kind: 'busy', retryAt: response?.retryAt ?? Date.now() };
            return;
        }
        if (response?.needsVisible) {
            this.cache.set(job.url, { status: 'needs-visible' });
            return;
        }
        if (code === 'skipped') {
            this.cache.set(job.url, { status: 'skipped' });
            overlay?.remove();
            return;
        }
        if (code === 'no-text') {
            this.cache.set(job.url, { status: 'no-text' });
            this.showFailure(job, overlay, 'manga.error.noText');
        } else if (code === 'capture-failed') {
            this.cache.set(job.url, { status: 'unreadable' });
            this.showFailure(job, overlay, 'manga.error.capture');
        } else {
            this.cache.set(job.url, { status: 'failed' });
            this.showFailure(job, overlay, code === 'translate-failed' ? 'manga.error.translate' : code === 'translate-no-key' ? 'manga.error.noKey' : 'manga.error.analyze');
        }
    }
}
