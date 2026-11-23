/**
 * 疊在圖片上的那一層：處理中的狀態、第一次使用的說明、譯文圖、「看原文／關閉」按鈕
 *
 * 滑鼠移到翻好的區塊上，浮出適中大小的完整譯文（下面附原文）：小對話框裡的字縮得很小時，用這個看意思。
 * 浮動框不吃滑鼠（閱讀器常用點擊翻頁），靠監聽滑鼠移動自己判斷游標在哪個區塊；切到「看原文」時也有作用。
 *
 * 掛在 <html> 底下、用 shadow DOM 隔開網頁的 CSS；每一幀跟著圖片的位置與大小移動（捲動、版面變動都跟得上），
 * 圖片從網頁上被移除時自己消失。整層 pointer-events: none，只有按鈕吃滑鼠，不擋網頁原本的點擊。
 */

import { t } from './i18n';
import type { Locale } from './i18n';
import type { Box, ResultMessage } from './protocol';
import { drawTranslations } from './render';

const STYLE = `
:host { all: initial; }
.root { position: absolute; pointer-events: none; z-index: 2147483646; }
canvas { position: absolute; display: block; }
.status { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); max-width: calc(100% - 24px);
  padding: 8px 14px; border-radius: 999px; background: rgba(20, 20, 20, 0.86); color: #fff;
  font: 500 13px/1.4 system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
.status.error { background: rgba(200, 40, 50, 0.92); }
.notice { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); width: min(340px, calc(100% - 24px));
  padding: 14px 16px; border-radius: 12px; background: #fff; color: #1a1a1a; pointer-events: auto;
  font: 400 13px/1.55 system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.28); }
.notice strong { display: block; font-size: 14px; margin-bottom: 6px; }
.notice .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
button { font: 600 12px/1 system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; border: 0; border-radius: 999px;
  padding: 8px 12px; cursor: pointer; pointer-events: auto; }
.primary { background: #1a1a1a; color: #fff; }
.secondary { background: #ececec; color: #1a1a1a; }
.toolbar { position: absolute; right: 8px; top: 8px; display: flex; gap: 6px; }
.toolbar button { background: rgba(20, 20, 20, 0.8); color: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
.tip { position: fixed; z-index: 2147483647; pointer-events: none; display: none; max-width: 320px; padding: 9px 12px; border-radius: 10px;
  background: #fff; color: #1a1a1a; box-shadow: 0 6px 24px rgba(0,0,0,.3);
  font: 500 15px/1.55 system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; }
.tip .original { margin-top: 4px; font-size: 12px; color: #777; }
`;

// 譯文在畫面上希望至少這麼大（CSS 像素）；對話框塞不下時會再縮小，譯文不超出對話框，看不清楚可以把滑鼠移到區塊上看完整譯文
const MIN_SHOWN_FONT_PX = 9;

export class TranslationOverlay {
    private readonly host = document.createElement('lexitechly-image-translation');
    private readonly root: HTMLDivElement;
    private frame = 0;
    private removed = false;
    private canvas: HTMLCanvasElement | null = null;
    private readonly tip: HTMLDivElement;
    private result: ResultMessage | null = null;
    private hovered: number = -1;

    // toolbar：單張翻譯時每張圖有自己的「看原文／關閉」；自動翻譯時由右下角的狀態列統一控制，不顯示
    constructor(private readonly image: HTMLImageElement, private readonly options: { toolbar?: boolean } = {}) {
        const shadow = this.host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = STYLE;
        this.root = document.createElement('div');
        this.root.className = 'root';
        this.tip = document.createElement('div');
        this.tip.className = 'tip';
        // 浮動框放在譯文層外面：切到「看原文」（譯文層藏起來）時一樣看得到
        shadow.append(style, this.root, this.tip);
        document.documentElement.appendChild(this.host);
        this.follow();
    }

    /** 游標在哪個區塊上：把畫面座標換成譯文圖的座標，對話框範圍也算（比原文區塊好指） */
    private blockAt(x: number, y: number): number {
        const result = this.result;
        if (!result) return -1;
        const rect = this.image.getBoundingClientRect();
        const left = rect.left + result.coverage.left * rect.width;
        const top = rect.top + result.coverage.top * rect.height;
        const width = result.coverage.width * rect.width;
        const height = result.coverage.height * rect.height;
        if (width <= 0 || height <= 0 || x < left || y < top || x > left + width || y > top + height) return -1;
        const px = ((x - left) / width) * result.width;
        const py = ((y - top) / height) * result.height;
        const inside = ([x0, y0, x1, y1]: Box) => px >= x0 && px <= x1 && py >= y0 && py <= y1;
        return result.blocks.findIndex((block) => block.translation.trim() && (inside(block.box) || (block.bubbleBox !== null && inside(block.bubbleBox))));
    }

    private onMouseMove = (event: MouseEvent): void => {
        const index = this.removed ? -1 : this.blockAt(event.clientX, event.clientY);
        if (index < 0) {
            if (this.hovered >= 0) this.tip.style.display = 'none';
            this.hovered = -1;
            return;
        }
        if (index !== this.hovered) {
            const block = this.result!.blocks[index];
            const translation = document.createElement('div');
            translation.textContent = block.translation;
            const original = document.createElement('div');
            original.className = 'original';
            original.textContent = block.text;
            this.tip.replaceChildren(translation, original);
            this.tip.style.display = 'block';
            this.hovered = index;
        }
        // 跟著游標，靠近視窗邊緣時翻到另一側
        const gap = 16;
        const { offsetWidth: w, offsetHeight: h } = this.tip;
        const left = event.clientX + gap + w > window.innerWidth ? event.clientX - gap - w : event.clientX + gap;
        const top = event.clientY + gap + h > window.innerHeight ? event.clientY - gap - h : event.clientY + gap;
        this.tip.style.left = `${Math.max(4, left)}px`;
        this.tip.style.top = `${Math.max(4, top)}px`;
    };

    private follow = (): void => {
        if (this.removed) return;
        if (!this.image.isConnected) {
            this.remove();
            return;
        }
        const rect = this.image.getBoundingClientRect();
        const style = this.root.style;
        style.left = `${rect.left + window.scrollX}px`;
        style.top = `${rect.top + window.scrollY}px`;
        style.width = `${rect.width}px`;
        style.height = `${rect.height}px`;
        this.frame = requestAnimationFrame(this.follow);
    };

    private clear(): void {
        for (const child of Array.from(this.root.children)) {
            if (child !== this.canvas) child.remove();
        }
    }

    setStatus(text: string, isError = false): void {
        this.clear();
        const status = document.createElement('div');
        status.className = isError ? 'status error' : 'status';
        status.textContent = text;
        this.root.appendChild(status);
    }

    /** 第一次使用的說明；回傳使用者按了繼續還是取消 */
    confirmNotice(title: string, body: string): Promise<boolean> {
        this.clear();
        return new Promise((resolve) => {
            const notice = document.createElement('div');
            notice.className = 'notice';
            const heading = document.createElement('strong');
            heading.textContent = title;
            const text = document.createElement('div');
            text.textContent = body;
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = this.button(t('manga.notice.cancel'), 'secondary', () => resolve(false));
            const ok = this.button(t('manga.notice.continue'), 'primary', () => resolve(true));
            actions.append(cancel, ok);
            notice.append(heading, text, actions);
            this.root.appendChild(notice);
        });
    }

    private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    async showResult(result: ResultMessage): Promise<void> {
        const base = new Image();
        base.src = result.image;
        await base.decode();
        const canvas = document.createElement('canvas');
        canvas.width = result.width;
        canvas.height = result.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
        // 畫布會被縮放成圖片在畫面上的大小；字級下限用「畫面上至少 12 個 CSS 像素」換算回畫布像素
        const shownWidth = this.image.getBoundingClientRect().width * result.coverage.width;
        const canvasPerCss = shownWidth > 0 ? result.width / shownWidth : 1;
        drawTranslations(ctx, result.blocks, result.targetLang as Locale, { minFont: Math.round(MIN_SHOWN_FONT_PX * canvasPerCss) });

        const { left, top, width, height } = result.coverage;
        Object.assign(canvas.style, { left: `${left * 100}%`, top: `${top * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` });
        this.canvas?.remove();
        this.canvas = canvas;
        if (!this.result) document.addEventListener('mousemove', this.onMouseMove, { passive: true, capture: true });
        this.result = result;
        this.clear();
        this.root.appendChild(canvas);
        if (this.options.toolbar === false) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'toolbar';
        const toggle = this.button(t('manga.toolbar.showOriginal'), '', () => {
            const hidden = canvas.style.visibility === 'hidden';
            canvas.style.visibility = hidden ? 'visible' : 'hidden';
            toggle.textContent = t(hidden ? 'manga.toolbar.showOriginal' : 'manga.toolbar.showTranslation');
        });
        const close = this.button(t('manga.toolbar.close'), '', () => this.remove());
        toolbar.append(toggle, close);
        this.root.appendChild(toolbar);
    }

    /** 自動翻譯的「看原文」：整層藏起來，不移除 */
    setVisible(visible: boolean): void {
        this.root.style.display = visible ? '' : 'none';
    }

    removeLater(ms: number): void {
        setTimeout(() => this.remove(), ms);
    }

    remove(): void {
        if (this.removed) return;
        this.removed = true;
        cancelAnimationFrame(this.frame);
        document.removeEventListener('mousemove', this.onMouseMove, { capture: true });
        this.host.remove();
    }

    get isRemoved(): boolean {
        return this.removed;
    }
}
