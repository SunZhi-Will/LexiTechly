/**
 * 框選翻譯的選取層：蓋住整個視窗，使用者拖出一個框；按 Esc 或右鍵取消
 *
 * 選取層吃掉滑鼠事件（不往網頁傳），拖曳時閱讀器才不會當成點擊翻頁。
 * 放開滑鼠後找框底下的漫畫圖（重疊面積最大的那張），換成占那張圖的比例。
 */

import { isComicImage } from './auto-translate';
import type { ViewportRect } from './protocol';
import { selectionOnImage, type Fraction } from './region';

const STYLE = `
:host { all: initial; }
.layer { position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair; background: rgba(0, 0, 0, 0.18); }
.box { position: fixed; display: none; border: 2px solid #38bdf8; border-radius: 4px; background: rgba(56, 189, 248, 0.12);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.32); pointer-events: none; }
.hint { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); max-width: calc(100% - 32px); pointer-events: none;
  padding: 9px 16px; border-radius: 999px; background: rgba(20, 20, 20, 0.9); color: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.3);
  font: 500 13px/1.45 system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; }
`;

// 比這小的框當成誤觸，繼續等使用者重新拖
const MIN_SIDE_PX = 8;

/** 讓使用者拖出一個框；回傳框的位置（視窗座標，CSS 像素），取消時回傳 null */
export function selectRegion(hint: string): Promise<ViewportRect | null> {
    return new Promise((resolve) => {
        const host = document.createElement('readloop-region-select');
        const shadow = host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = STYLE;
        const layer = document.createElement('div');
        layer.className = 'layer';
        const box = document.createElement('div');
        box.className = 'box';
        const tip = document.createElement('div');
        tip.className = 'hint';
        tip.textContent = hint;
        layer.append(box, tip);
        shadow.append(style, layer);

        let start: { x: number; y: number } | null = null;
        let current: ViewportRect | null = null;

        const rectFrom = (x: number, y: number): ViewportRect => ({
            x: Math.min(start!.x, x),
            y: Math.min(start!.y, y),
            width: Math.abs(x - start!.x),
            height: Math.abs(y - start!.y)
        });

        const finish = (rect: ViewportRect | null) => {
            window.removeEventListener('keydown', onKey, true);
            host.remove();
            resolve(rect);
        };

        const swallow = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            swallow(event);
            finish(null);
        };

        layer.addEventListener('pointerdown', (event) => {
            swallow(event);
            if (event.button !== 0) {
                finish(null);
                return;
            }
            layer.setPointerCapture(event.pointerId);
            start = { x: event.clientX, y: event.clientY };
            current = null;
        });
        layer.addEventListener('pointermove', (event) => {
            swallow(event);
            if (!start) return;
            current = rectFrom(event.clientX, event.clientY);
            Object.assign(box.style, { display: 'block', left: `${current.x}px`, top: `${current.y}px`, width: `${current.width}px`, height: `${current.height}px` });
        });
        layer.addEventListener('pointerup', (event) => {
            swallow(event);
            if (!start) return;
            const rect = rectFrom(event.clientX, event.clientY);
            start = null;
            if (rect.width < MIN_SIDE_PX || rect.height < MIN_SIDE_PX) {
                box.style.display = 'none';
                return;
            }
            finish(rect);
        });
        for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'contextmenu', 'wheel', 'touchstart', 'touchmove']) {
            layer.addEventListener(type, swallow, { passive: false });
        }
        window.addEventListener('keydown', onKey, true);
        document.documentElement.appendChild(host);
    });
}

/** 框底下的漫畫圖（重疊面積最大的那張）與框占那張圖的比例 */
export function imageUnder(selection: ViewportRect): { img: HTMLImageElement; selection: Fraction } | null {
    let best: { img: HTMLImageElement; selection: Fraction; area: number } | null = null;
    for (const img of Array.from(document.images).filter(isComicImage)) {
        const rect = img.getBoundingClientRect();
        const fraction = selectionOnImage(selection, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
        if (!fraction) continue;
        const area = fraction.width * rect.width * fraction.height * rect.height;
        if (!best || area > best.area) best = { img, selection: fraction, area };
    }
    return best && { img: best.img, selection: best.selection };
}
