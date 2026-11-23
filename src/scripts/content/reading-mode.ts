/// <reference types="chrome"/>

import { highlightWord, removeWordHighlight, highlightWordInElement } from './highlight';
import { createFloatingLogo, updateLogoAppearance } from './floating-logo';
import { queryWordInfo, queryWordInfoWithTranslationOnly, checkPageTheme, updateTooltipTheme } from './word-query';
import { getWordFromElement, disableAllLinks, enableAllLinks } from './word-utils';

// 查閱模式相關變數
let isReadingMode = false;
let hoverTimer: number | null = null;
let countdownTimer: number | null = null;
let currentTooltip: HTMLElement | null = null;
let currentWord = '';
let currentElement: HTMLElement | null = null;
let lastMouseEvent: MouseEvent | null = null;
let currentHighlight: HTMLElement | null = null; // 當前選取的高亮
let lockedHighlight: HTMLElement | null = null; // 鎖定狀態的高亮
let lastMouseMoveTime = 0;
let mouseMoveThrottleDelay = 50; // 減少到50ms，讓反應更靈敏
let disabledElements: HTMLElement[] = []; // 儲存被禁用的元素
let selectionLookupButton: HTMLElement | null = null; // 選取英文後的懸浮查詢按鈕
let selectionButtonShowTime = 0; // 上次顯示按鈕的時間，用於避免 mouseup 後的 click 立刻關閉

/** 判斷選取文字是否可查詢（含英文即可顯示懸浮按鈕） */
function isEnglishText(text: string): boolean {
    const t = text.trim();
    if (!t || t.length > 500) return false; // 過長不顯示按鈕
    return (t.match(/[a-zA-Z]/g) || []).length >= 1;
}

// 從選取範圍查詢（供右鍵選單或懸浮按鈕使用，閱讀模式開關狀態不影響）
export async function lookupSelectionFromContextMenu(selectedText: string): Promise<void> {
    const text = (selectedText || window.getSelection()?.toString() || '').trim();
    if (!text) return;

    let rect: DOMRect | null = null;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
        try {
            const range = selection.getRangeAt(0);
            rect = range.getBoundingClientRect();
        } catch {
            rect = null;
        }
    }

    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top : window.innerHeight / 3;

    await showWordTooltip(text, x, y);
}

/** 取得目前選取範圍的視窗座標（用於懸浮按鈕定位） */
function getSelectionRect(): DOMRect | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try {
        return sel.getRangeAt(0).getBoundingClientRect();
    } catch {
        return null;
    }
}

/** 顯示選取英文後的懸浮查詢按鈕（緊湊圖示，位於選取右下方） */
function showSelectionLookupButton(rect: DOMRect | { left: number; top: number; right: number; bottom: number; width: number; height: number }, selectedText: string): void {
    hideSelectionLookupButton();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lexitechly-selection-lookup-btn';
    btn.setAttribute('aria-label', '查詢選取內容');
    // 翻譯／查詢圖示（小圓點、半透明）
    btn.innerHTML = `
        <svg class="lexitechly-selection-lookup-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
        </svg>
    `;
    btn.dataset.selectedText = selectedText;

    const size = 24;
    const gap = 6;
    const maxLeft = window.innerWidth - size - 10;
    const maxTop = window.innerHeight - size - 10;

    // 強制轉成數字，避免 DOMRect 失效或 spread 後變成 NaN（會導致 style 沒有 left/top）
    const r = {
        left: Number(rect.left),
        top: Number(rect.top),
        right: Number(rect.right),
        bottom: Number(rect.bottom),
        width: Number(rect.width),
        height: Number(rect.height)
    };
    // 選取右下方再往右一點（單字右下角外側）
    let left = r.right + gap;
    let top = r.bottom + gap;
    if (!Number.isFinite(left)) left = 10;
    if (!Number.isFinite(top)) top = 10;
    left = Math.max(10, Math.min(left, maxLeft));
    top = Math.max(10, Math.min(top, maxTop));

    btn.style.position = 'fixed';
    btn.style.left = left + 'px';
    btn.style.top = top + 'px';
    btn.style.width = size + 'px';
    btn.style.height = size + 'px';
    btn.style.zIndex = '99998';

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = btn.dataset.selectedText || '';
        hideSelectionLookupButton();
        if (text) lookupSelectionFromContextMenu(text);
    });

    document.body.appendChild(btn);
    selectionLookupButton = btn;
    selectionButtonShowTime = Date.now();
}

/** 隱藏選取查詢懸浮按鈕 */
function hideSelectionLookupButton(): void {
    if (selectionLookupButton && selectionLookupButton.parentNode) {
        selectionLookupButton.parentNode.removeChild(selectionLookupButton);
        selectionLookupButton = null;
    }
}

/** 處理選取結束：若含英文則顯示懸浮查詢按鈕（延遲顯示，避免被同一次手勢的 click 關閉） */
function handleSelectionEnd(): void {
    const sel = window.getSelection();
    const text = (sel?.toString() || '').trim();
    if (!text || !isEnglishText(text)) {
        hideSelectionLookupButton();
        return;
    }
    let rect = getSelectionRect();
    // 若無法取得選取範圍座標（如部分程式碼區塊），用視窗中央偏上作為 fallback
    if (!rect || rect.width <= 0 || rect.height <= 0) {
        const size = 24;
        const left = window.innerWidth / 2 - size;
        const top = Math.max(10, window.innerHeight / 4 - size);
        rect = {
            left,
            top,
            right: left + size,
            bottom: top + size,
            width: size,
            height: size,
            x: left,
            y: top,
            toJSON: () => ({})
        } as DOMRect;
    }
    // 立即快照為純數字，避免 100ms 後 DOMRect 失效或變成 NaN
    const capturedRect = {
        left: Number(rect.left),
        top: Number(rect.top),
        right: Number(rect.right),
        bottom: Number(rect.bottom),
        width: Number(rect.width),
        height: Number(rect.height)
    };
    const capturedText = text;
    // 延遲顯示，讓同一次手勢產生的 click 先觸發並被忽略（見下方 click 的 250ms 保護）
    setTimeout(() => {
        showSelectionLookupButton(capturedRect, capturedText);
    }, 100);
}

/** 處理選取變更：若選取被清空則隱藏懸浮按鈕（避免在延遲顯示前就清掉） */
function handleSelectionChange(): void {
    const sel = window.getSelection();
    const str = (sel?.toString() || '').trim();
    if (str === '' && selectionLookupButton) {
        hideSelectionLookupButton();
    }
}

// 切換查閱模式
function toggleReadingMode(): void {
    isReadingMode = !isReadingMode;
    updateLogoAppearance(isReadingMode);

    if (isReadingMode) {
        showToast('查閱模式已開啟！懸停單字後點選查看詳情', false, false, true);
        enableWordHover();
        disabledElements = disableAllLinks();
    } else {
        showToast('查閱模式已關閉', false, false, false);
        disableWordHover();
        clearAllTimersAndState();
        enableAllLinks(disabledElements);
        disabledElements = [];
    }
}

// 清除所有計時器和狀態
function clearAllTimersAndState(): void {
    // 清除懸停計時器
    if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }

    // 清除倒數計時器
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }

    // 清除提示和高亮
    removeTooltip();

    // 強制清除所有高亮（包括鎖定狀態）
    clearAllHighlights();

    // 重置狀態
    currentWord = '';
    currentElement = null;
    lastMouseEvent = null;
    currentHighlight = null;
    lockedHighlight = null;
    

}

// 清除所有高亮狀態（包括鎖定狀態）
function clearAllHighlights(): void {
    // 清除所有 span 高亮（包括鎖定狀態）
    const highlights = document.querySelectorAll('.lexitechly-word-highlight');
    highlights.forEach(highlight => {
        const parent = highlight.parentNode;
        if (parent && highlight.parentNode === parent) {
            parent.insertBefore(document.createTextNode(highlight.textContent || ''), highlight);
            parent.removeChild(highlight);
            parent.normalize();
        }
    });

    // 清除所有樣式高亮（包括鎖定狀態）
    const styledElements = document.querySelectorAll('[data-lexitechly-highlighted]');
    styledElements.forEach(element => {
        const htmlElement = element as HTMLElement;
        htmlElement.style.backgroundColor = '';
        htmlElement.style.borderRadius = '';
        htmlElement.style.boxShadow = '';
        htmlElement.style.cursor = '';
        htmlElement.style.pointerEvents = '';
        htmlElement.style.zIndex = '';
        htmlElement.removeAttribute('data-lexitechly-highlighted');
        htmlElement.removeAttribute('data-lexitechly-locked');
    });

    // 清除所有可能的高亮樣式（使用更廣泛的選擇器）
    const allPossibleHighlights = document.querySelectorAll('[style*="rgba(59, 130, 246"], [style*="rgba(34, 197, 94"], [data-lexitechly-locked]');
    allPossibleHighlights.forEach(element => {
        const htmlElement = element as HTMLElement;
        // 清除藍色選取高亮
        if (htmlElement.style.backgroundColor.includes('rgba(59, 130, 246')) {
            htmlElement.style.backgroundColor = '';
        }
        // 清除綠色鎖定高亮
        if (htmlElement.style.backgroundColor.includes('rgba(34, 197, 94')) {
            htmlElement.style.backgroundColor = '';
        }
        // 清除相關的 box-shadow
        if (htmlElement.style.boxShadow.includes('rgba(59, 130, 246') ||
            htmlElement.style.boxShadow.includes('rgba(34, 197, 94')) {
            htmlElement.style.boxShadow = '';
        }
        // 清除其他樣式
        if (htmlElement.style.borderRadius === '3px') {
            htmlElement.style.borderRadius = '';
        }
        htmlElement.style.cursor = '';
        htmlElement.style.pointerEvents = '';
        htmlElement.style.zIndex = '';
        htmlElement.removeAttribute('data-lexitechly-locked');

        // 移除點擊事件監聽器
        htmlElement.removeEventListener('click', handleWordClick);
    });

    // 清除 tooltip
    const tooltips = document.querySelectorAll('.lexitechly-tooltip');
    tooltips.forEach(tooltip => tooltip.remove());
}

// 啟用單字懸停功能
function enableWordHover(): void {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleDocumentClick);
}

// 停用單字懸停功能
function disableWordHover(): void {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('click', handleDocumentClick);
}

// 處理滑鼠移動（在元素內移動時選取不同單字）
function handleMouseMove(event: MouseEvent): void {
    // 基於時間的節流處理
    const now = Date.now();
    if (now - lastMouseMoveTime < mouseMoveThrottleDelay) {
        return;
    }
    lastMouseMoveTime = now;

    const target = event.target as HTMLElement;

    // 跳過非文字節點和我們的擴充功能元素
    if (!target || target.nodeType !== Node.ELEMENT_NODE ||
        target.closest('#lexitechly-floating-logo') ||
        target.closest('.lexitechly-tooltip')) {
        return;
    }

    const word = getWordFromElement(target, event);
    if (word && word.length > 2) {
        // 如果是不同的單字，立即切換
        if (currentWord !== word) {
            // 清除之前的計時器
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }

            // 立即切換到新單字
            handleWordChange(word, target, event);
        }
    } else {
        // 如果沒有找到有效單字，清除當前選取
        if (currentWord) {
            removeWordHighlight();
            currentWord = '';
            currentElement = null;
            lastMouseEvent = null;
            currentHighlight = null;
        }
    }
}

// 處理單字切換的共用邏輯
function handleWordChange(word: string, target: HTMLElement, event: MouseEvent): void {
    // 如果是相同的單字，不重複處理，避免閃爍
    if (currentWord === word && currentElement === target) {
        return;
    }

    currentWord = word;
    currentElement = target;
    lastMouseEvent = event;

    // 清除之前的計時器
    if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }

    // 清除之前的選取高亮（但不清除鎖定高亮）
    removeWordHighlight();
    removeTooltip();

    // 高亮當前單字
    highlightWord(target, event);

    // 記錄當前高亮元素（排除鎖定狀態的元素）
    currentHighlight = document.querySelector('.lexitechly-word-highlight:not([data-lexitechly-locked])') ||
        document.querySelector('[data-lexitechly-highlighted]:not([data-lexitechly-locked])');

    // 立即顯示選取效果（淺藍色）
    if (currentHighlight) {
        currentHighlight.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
        currentHighlight.style.boxShadow = '0 0 0 1px rgba(59, 130, 246, 0.3)';
        currentHighlight.style.borderRadius = '3px';
        currentHighlight.style.cursor = 'pointer';
        currentHighlight.style.pointerEvents = 'auto'; // 確保可以點擊
        currentHighlight.style.zIndex = '10000'; // 確保在最上層

        // 添加點選事件監聽器
        currentHighlight.addEventListener('click', handleWordClick);
    }
}

// 處理單字點選
function handleWordClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (!currentWord || !currentHighlight) {
        return;
    }

    // 使用點選時的實際滑鼠位置
    const clickX = event.pageX;
    const clickY = event.pageY;

    // 保存鎖定的單字資訊
    const lockedWord = currentWord;

    // 清除之前的鎖定狀態
    if (lockedHighlight && lockedHighlight !== currentHighlight) {
        clearLockedHighlight();
    }

    // 將當前選取變成鎖定狀態
    lockedHighlight = currentHighlight;
    lockedHighlight.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
    lockedHighlight.style.boxShadow = '0 0 0 1px rgba(34, 197, 94, 0.4)';
    lockedHighlight.style.cursor = 'default';
    lockedHighlight.style.zIndex = '10001'; // 確保鎖定狀態在更上層
    lockedHighlight.setAttribute('data-lexitechly-locked', 'true');

    // 移除點選事件監聽器
    lockedHighlight.removeEventListener('click', handleWordClick);

    // 顯示查詢結果 - 使用點選位置
    showWordTooltip(lockedWord, clickX, clickY);

    // 重置選取狀態，但保持鎖定狀態
    currentHighlight = null;
    currentWord = '';
    currentElement = null;
    lastMouseEvent = null;
}

// 處理滑鼠離開
function handleMouseOut(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement;

    // 如果滑鼠移動到tooltip或logo，不要清除
    if (relatedTarget && (
        relatedTarget.closest('.lexitechly-tooltip') ||
        relatedTarget.closest('#lexitechly-floating-logo'))) {
        return;
    }

    // 檢查是否真的離開了當前元素區域
    if (relatedTarget && target.contains(relatedTarget)) {
        return; // 還在同一個元素內，不處理
    }

    // 立即清除選取狀態，但不影響鎖定狀態
    if (currentHighlight) {
        removeWordHighlight(); // 只清除選取高亮，不清除鎖定高亮
        currentWord = '';
        currentElement = null;
        lastMouseEvent = null;
        currentHighlight = null;
    }
}

// 顯示單字提示
async function showWordTooltip(word: string, x: number, y: number): Promise<void> {
    // 重新檢測並更新主題顏色
    const isDark = checkPageTheme();
    updateTooltipTheme(isDark);

    // 先移除現有提示（但只有在沒有鎖定時）
    if (currentTooltip && !lockedHighlight) {
        currentTooltip.remove();
        currentTooltip = null;
    }

    // 創建載入提示
    const tooltip = document.createElement('div');
    tooltip.className = 'lexitechly-tooltip';
    tooltip.innerHTML = `
        <div class="lexitechly-tooltip-header">
            <span class="lexitechly-tooltip-title">單字查詢</span>
            <div class="lexitechly-tooltip-actions">
                <button class="lexitechly-tooltip-vocabulary" title="查看單字列表"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2V5Zm0 15a2 2 0 0 0 2 2h13M9 8h6"/></svg></button>
                <button class="lexitechly-tooltip-close" title="關閉字卡">×</button>
            </div>
        </div>
        <div class="lexitechly-tooltip-content">
            <div class="lexitechly-loading">
                <div class="lexitechly-spinner"></div>
                <span>查詢中...</span>
            </div>
        </div>
    `;

    // 直接使用傳入的座標，添加簡單偏移
    tooltip.style.position = 'absolute';
    tooltip.style.left = `${x + 15}px`;  // 右偏移 15px
    tooltip.style.top = `${y - 60}px`;   // 上偏移 60px
    tooltip.style.zIndex = '99999';

    document.body.appendChild(tooltip);
    currentTooltip = tooltip;

    // 添加拖拉功能
    addTooltipDragFunctionality(tooltip);

    // 添加關閉按鈕功能
    addTooltipCloseButton(tooltip);

    // 添加跳轉到單字列表功能
    addTooltipVocabularyButton(tooltip);

    // 查詢單字詳情
    try {
        const { apiKey, wordLookupProvider } = await chrome.storage.local.get(['apiKey', 'wordLookupProvider']);
        const useTranslationOnly = wordLookupProvider === 'translation-only';

        if (!useTranslationOnly && !apiKey) {
            updateTooltipContent(tooltip, word, '請先設定 API Key，或到設定中切換為「僅翻譯（免 API Key）」');
            return;
        }

        const result = useTranslationOnly
            ? await queryWordInfoWithTranslationOnly(word)
            : await queryWordInfo(word, apiKey as string);

        updateTooltipContent(tooltip, word, result.html);

        // 如果查詢成功且有單字資料，加入到單字列表
        if (result.wordData) {
            await addWordToList(result.wordData);
        }
    } catch (parseError) {
        // 如果解析失敗，返回簡單的錯誤 HTML
        updateTooltipContent(tooltip, word, '解析回應失敗');
    }
}

// 將單字加入到單字列表
async function addWordToList(wordData: any): Promise<void> {
    try {
        // 獲取現有的單字列表（使用正確的 key）
        const result = await chrome.storage.local.get('accumulatedVocabulary');
        const accumulatedVocabulary: any[] = Array.isArray(result.accumulatedVocabulary) 
            ? result.accumulatedVocabulary 
            : [];

        // 轉換資料格式以符合現有系統
        const newWord = {
            text: wordData.word,
            level: wordData.level,
            translation: wordData.translation,
            example: wordData.example,
            addedTime: Date.now()
        };

        // 檢查是否已存在相同單字
        const existingWordIndex = accumulatedVocabulary.findIndex((w: any) =>
            w.text && w.text.toLowerCase() === newWord.text.toLowerCase()
        );

        if (existingWordIndex !== -1) {
            // 更新現有單字的資料和時間戳
            accumulatedVocabulary[existingWordIndex] = {
                ...accumulatedVocabulary[existingWordIndex],
                ...newWord,
                addedTime: Date.now()
            };
        } else {
            // 新增單字到列表最前面
            accumulatedVocabulary.unshift(newWord);
        }

        // 儲存更新後的列表
        await chrome.storage.local.set({ accumulatedVocabulary });

        // 顯示成功通知
        setTimeout(() => {
            showToast(`"${wordData.word}" 已加入單字列表`, false, false, true);
        }, 1000);

    } catch (error) {
        // 靜默處理錯誤，不影響查詢功能
    }
}

// 更新提示內容
function updateTooltipContent(tooltip: HTMLElement, word: string, content: string): void {
    const contentDiv = tooltip.querySelector('.lexitechly-tooltip-content');

    if (contentDiv) {
        if (content.includes('請先設定') || content.includes('查詢失敗')) {
            contentDiv.innerHTML = `
                <div class="lexitechly-error">
                    <strong>${word}</strong><br>
                    <span style="color: #EF4444;">${content}</span>
                </div>
            `;
        } else {
            contentDiv.innerHTML = content;
        }

        // 確保 tooltip 可見
        tooltip.style.display = 'block';
        tooltip.style.visibility = 'visible';
        tooltip.style.opacity = '1';
    }

    // 添加關閉按鈕事件監聽器
    addTooltipCloseButton(tooltip);

    // 添加跳轉到單字列表按鈕事件監聽器
    addTooltipVocabularyButton(tooltip);
}

// 移除提示
function removeTooltip(): void {
    // 永遠不要移除鎖定狀態的 tooltip
    if (lockedHighlight) {
        return;
    }

    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

// 處理文檔點選
function handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // 如果點選在我們的UI元素上，不處理
    if (target.closest('#lexitechly-floating-logo') ||
        target.closest('.lexitechly-tooltip') ||
        target.hasAttribute('data-lexitechly-disabled')) {
        return;
    }

    // 如果點選在鎖定的高亮上，不處理
    if (target.closest('[data-lexitechly-locked]')) {
        return;
    }

    // 如果點選在關閉按鈕上，不處理（讓關閉按鈕自己處理）
    if (target.classList.contains('lexitechly-tooltip-close')) {
        return;
    }

    // 如果點選在跳轉按鈕上，不處理（讓跳轉按鈕自己處理）
    if (target.classList.contains('lexitechly-tooltip-vocabulary')) {
        return;
    }

    // 如果點選在例句標題上，不處理（讓播放按鈕自己處理）
    if (target.closest('.example-header')) {
        return;
    }

    // 點擊其他地方：清除所有狀態（包括鎖定狀態）
    // 清除鎖定狀態
    clearLockedHighlight();

    // 清除選取狀態
    removeWordHighlight();
    currentWord = '';
    currentElement = null;
    lastMouseEvent = null;
    currentHighlight = null;
}

// 清除鎖定狀態的高亮
function clearLockedHighlight(): void {
    if (lockedHighlight) {
        lockedHighlight.style.backgroundColor = '';
        lockedHighlight.style.boxShadow = '';
        lockedHighlight.style.cursor = '';
        lockedHighlight.removeAttribute('data-lexitechly-locked');
        lockedHighlight = null;

        // 清除相關的 tooltip
        if (currentTooltip) {
            currentTooltip.remove();
            currentTooltip = null;
        }
    }
}

// 顯示Toast通知
function showToast(message: string, isLoading: boolean = false, isError: boolean = false, isSuccess: boolean = false): void {
    // 移除現有toast
    const existingToast = document.querySelector('.lexitechly-toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'lexitechly-toast';

    let iconHtml = '';
    if (isError) iconHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3v.01"/></svg>';
    else if (isSuccess) iconHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
    else if (isLoading) iconHtml = '<div class="lexitechly-spinner-small"></div>';

    toast.innerHTML = `
        <div class="lexitechly-toast-content">
            ${iconHtml ? `<span class="lexitechly-toast-icon${isError ? ' is-error' : isSuccess ? ' is-success' : ''}">${iconHtml}</span>` : ''}
            <span>${message}</span>
        </div>
    `;

    // 設定toast基本樣式（位置和動畫相關）
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '10002',
        borderRadius: '12px',
        padding: '12px 20px',
        fontSize: '14px',
        minWidth: '200px',
        maxWidth: '400px',
        textAlign: 'center',
        opacity: '0',
        transition: 'opacity 0.3s ease'
    });

    document.body.appendChild(toast);

    // 顯示動畫
    setTimeout(() => {
        toast.style.opacity = '1';
    }, 10);

    // 自動隱藏（除非是載入中）
    if (!isLoading) {
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

// 初始化查閱模式
function initReadingMode(): void {
    console.log('LexiTechly: 初始化查閱模式...');
    
    // 檢查頁面是否為有效的網頁
    if (window.location.protocol === 'chrome-extension:' ||
        window.location.protocol === 'chrome:' ||
        window.location.protocol === 'about:') {
        console.log('LexiTechly: 不支援的頁面類型，跳過初始化');
        return;
    }

    // 創建浮動 logo
    try {
        createFloatingLogo(toggleReadingMode);
        console.log('LexiTechly: 浮動 logo 創建成功');
    } catch (error) {
        console.error('LexiTechly: 浮動 logo 創建失敗', error);
    }

    // 監聽點擊事件以隱藏提示
    document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.lexitechly-tooltip') && !target.closest('#lexitechly-floating-logo')) {
            removeTooltip();
        }
        // 點擊在非懸浮查詢按鈕處時隱藏選取查詢按鈕（剛顯示 250ms 內不隱藏，避免 mouseup 後的 click 立刻關閉）
        if (!target.closest('.lexitechly-selection-lookup-btn') && (Date.now() - selectionButtonShowTime > 250)) {
            hideSelectionLookupButton();
        }
    });

    // 選取英文後顯示懸浮查詢按鈕：選取結束時檢查
    document.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('selectionchange', handleSelectionChange);

    console.log('LexiTechly: 查閱模式初始化完成');
}

// 高亮相關功能
export { highlightWord, removeWordHighlight, highlightWordInElement };

// 查閱模式主要功能
export { initReadingMode };

// 為漂浮卡片添加拖拉功能
function addTooltipDragFunctionality(tooltip: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let dragDistance = 0;
    const DRAG_THRESHOLD = 5; // 拖拉閾值，超過此距離才算是拖拉

    // 滑鼠按下事件
    function handleMouseDown(e: MouseEvent): void {
        // 檢查是否點擊在播放按鈕、跳轉按鈕或關閉按鈕上，如果是則不啟動拖拉
        const target = e.target as HTMLElement;
        if (target.closest('.speak-btn') || 
            target.closest('.lexitechly-tooltip-vocabulary') || 
            target.closest('.lexitechly-tooltip-close') ||
            target.closest('.example-header')) {
            return;
        }

        // 防止拖拉時觸發其他事件
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        dragDistance = 0; // 重置拖拉距離
        
        // 獲取當前位置
        const rect = tooltip.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        // 添加拖拉樣式
        tooltip.classList.add('dragging');
        
        // 防止文字選擇
        document.body.style.userSelect = 'none';
        
        // 改變游標樣式
        document.body.style.cursor = 'grabbing';
        
        // 添加觸覺反饋（如果支援）
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        // 顯示提示訊息
        showToast('按 ESC 鍵取消拖拉', false, false, false);

        // 添加事件監聽器
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('keydown', handleKeyDown);
    }

    // 滑鼠移動事件
    function handleMouseMove(e: MouseEvent): void {
        if (!isDragging) return;
        
        // 防止頁面滾動
        e.preventDefault();

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        // 計算拖拉距離
        dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // 計算新位置
        const newLeft = initialLeft + deltaX;
        const newTop = initialTop + deltaY;

        // 確保卡片不會完全移出視窗
        const tooltipRect = tooltip.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let finalLeft = newLeft;
        let finalTop = newTop;

        // 限制左邊界
        if (finalLeft < 0) finalLeft = 0;
        if (finalLeft + tooltipRect.width > windowWidth) {
            finalLeft = windowWidth - tooltipRect.width;
        }

        // 限制上邊界
        if (finalTop < 0) finalTop = 0;
        if (finalTop + tooltipRect.height > windowHeight) {
            finalTop = windowHeight - tooltipRect.height;
        }
        
        // 添加邊界視覺提示
        if (finalLeft === 0 || finalLeft + tooltipRect.width === windowWidth ||
            finalTop === 0 || finalTop + tooltipRect.height === windowHeight) {
            tooltip.style.border = '2px solid #ff6b6b';
        } else {
            tooltip.style.border = '1px solid var(--lexitechly-border)';
        }

        // 更新位置
        tooltip.style.left = `${finalLeft}px`;
        tooltip.style.top = `${finalTop}px`;
    }

    // 鍵盤事件處理
    function handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && isDragging) {
            // 取消拖拉，恢復原始位置
            tooltip.style.left = `${initialLeft}px`;
            tooltip.style.top = `${initialTop}px`;
            
            isDragging = false;
            dragDistance = 0;
            
            // 恢復樣式
            tooltip.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            
            // 恢復邊框樣式
            tooltip.style.border = '1px solid var(--lexitechly-border)';
            
            // 移除事件監聽器
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('keydown', handleKeyDown);
        }
    }

    // 滑鼠釋放事件
    function handleMouseUp(e: MouseEvent): void {
        if (!isDragging) return;
        
        // 防止事件傳播
        e.preventDefault();
        e.stopPropagation();

        isDragging = false;
        dragDistance = 0; // 重置拖拉距離

        // 恢復樣式
        tooltip.classList.remove('dragging');
        
        // 恢復文字選擇
        document.body.style.userSelect = '';
        
        // 恢復游標樣式
        document.body.style.cursor = '';
        
        // 恢復邊框樣式
        tooltip.style.border = '1px solid var(--lexitechly-border)';
        
        // 添加觸覺反饋（如果支援）
        if (navigator.vibrate) {
            navigator.vibrate(25);
        }

        // 移除事件監聽器
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('keydown', handleKeyDown);
    }

    // 添加拖拉事件監聽器（在整個字卡和標題欄上）
    tooltip.addEventListener('mousedown', handleMouseDown as EventListener);
    
    // 特別為標題欄添加拖拉事件（確保標題欄也可以拖拉）
    const header = tooltip.querySelector('.lexitechly-tooltip-header');
    if (header) {
        header.addEventListener('mousedown', handleMouseDown as EventListener);
    }

    // 為例句標題添加拖拉事件（但排除播放按鈕）
    const exampleHeaders = tooltip.querySelectorAll('.example-header');
    exampleHeaders.forEach(exampleHeader => {
        exampleHeader.addEventListener('mousedown', (e: Event) => {
            const mouseEvent = e as MouseEvent;
            const target = mouseEvent.target as HTMLElement;
            if (!target.closest('.speak-btn')) {
                handleMouseDown(mouseEvent);
            }
        });
    });

    // 防止拖拉時觸發點擊事件
    tooltip.addEventListener('click', (e) => {
        if (isDragging && dragDistance > DRAG_THRESHOLD) {
            e.preventDefault();
            e.stopPropagation();
        }
    });
}

// 添加字卡關閉按鈕功能
function addTooltipCloseButton(tooltip: HTMLElement): void {
    const closeButton = tooltip.querySelector('.lexitechly-tooltip-close');
    if (closeButton) {
        // 移除舊的事件監聽器（如果有的話）
        closeButton.removeEventListener('click', handleTooltipClose as EventListener);
        // 添加新的事件監聽器
        closeButton.addEventListener('click', handleTooltipClose as EventListener);
    }
}

// 處理字卡關閉
function handleTooltipClose(event: Event): void {
    const mouseEvent = event as MouseEvent;
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();

    // 清除鎖定狀態的高亮
    clearLockedHighlight();

    // 清除選取狀態
    removeWordHighlight();
    currentWord = '';
    currentElement = null;
    lastMouseEvent = null;
    currentHighlight = null;

    // 顯示關閉通知
    showToast('字卡已關閉', false, false, false);
}

// 添加跳轉到單字列表按鈕功能
function addTooltipVocabularyButton(tooltip: HTMLElement): void {
    const vocabularyButton = tooltip.querySelector('.lexitechly-tooltip-vocabulary');
    if (vocabularyButton) {
        // 移除舊的事件監聽器（如果有的話）
        vocabularyButton.removeEventListener('click', handleTooltipVocabulary as EventListener);
        // 添加新的事件監聽器
        vocabularyButton.addEventListener('click', handleTooltipVocabulary as EventListener);
    }
}

// 處理跳轉到單字列表
function handleTooltipVocabulary(event: Event): void {
    const mouseEvent = event as MouseEvent;
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();

    // 檢查是否在支援的頁面上
    const currentUrl = window.location.href;
    const isGmail = currentUrl.includes('mail.google.com');
    
    console.log('準備打開單字列表，當前頁面:', currentUrl);
    
    if (isGmail) {
        console.log('在 Gmail 頁面上，可能需要特殊處理');
    }

    // 檢查 chrome.runtime 是否可用
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        console.error('chrome.runtime 不可用');
        showToast('擴充功能環境不可用', false, true, false);
        return;
    }

    // 獲取當前選中的單字
    const currentWord = getCurrentWord();
    console.log('當前選中的單字:', currentWord);

    // 嘗試切換到單字列表頁面
    try {
        console.log('嘗試切換到單字列表頁面...');
        
        // 使用 Promise 包裝訊息發送，添加重試機制
        const sendMessageWithRetry = async (retries = 3): Promise<any> => {
            for (let i = 0; i < retries; i++) {
                try {
                    return await new Promise((resolve, reject) => {
                        // 設定超時時間
                        const timeout = setTimeout(() => {
                            reject(new Error('訊息發送超時'));
                        }, 5000);

                        // 嘗試發送到 background script
                        chrome.runtime.sendMessage({ 
                            action: 'switchToVocabularyPage',
                            source: 'reading-mode',
                            currentUrl: currentUrl,
                            word: currentWord // 傳遞當前單字
                        }, (response) => {
                            clearTimeout(timeout);
                            if (chrome.runtime.lastError) {
                                console.warn('Background script 通訊失敗，嘗試直接發送到 popup:', chrome.runtime.lastError);
                                // 如果 background script 不可用，嘗試直接發送到 popup
                                chrome.runtime.sendMessage({ 
                                    action: 'switchToVocabularyPage',
                                    source: 'reading-mode',
                                    currentUrl: currentUrl,
                                    word: currentWord // 傳遞當前單字
                                }, (popupResponse) => {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                    } else {
                                        resolve(popupResponse);
                                    }
                                });
                            } else {
                                resolve(response);
                            }
                        });
                    });
                } catch (error) {
                    console.warn(`第 ${i + 1} 次嘗試失敗:`, error);
                    if (i === retries - 1) {
                        throw error;
                    }
                    // 等待一段時間後重試
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
        };

        // 嘗試發送訊息
        sendMessageWithRetry()
            .then((response: any) => {
                console.log('收到回應:', response);
                if (response && response.success) {
                    const wordText = currentWord ? `「${currentWord}」` : '';
                    showToast(`已在新標籤頁開啟單字列表${wordText}`, false, false, true);
                } else if (response && response.error) {
                    showToast(`無法打開單字列表: ${response.error}`, false, true, false);
                } else {
                    showToast('無法打開單字列表', false, true, false);
                }
            })
            .catch((error: any) => {
                console.error('無法切換到單字列表:', error);
                const errorMessage = error.message || '未知錯誤';
                
                if (errorMessage.includes('Could not establish connection')) {
                    // 針對 Gmail 的特殊處理
                    if (isGmail) {
                        showToast('Gmail 頁面限制，正在嘗試直接開啟單字列表...', false, true, false);
                    } else {
                        showToast('連線問題，正在嘗試直接開啟單字列表...', false, true, false);
                    }
                } else if (errorMessage.includes('Receiving end does not exist')) {
                    showToast('擴充功能未回應，正在嘗試直接開啟單字列表...', false, true, false);
                } else if (errorMessage.includes('超時')) {
                    showToast('連線超時，正在嘗試直接開啟單字列表...', false, true, false);
                } else {
                    showToast(`無法打開單字列表: ${errorMessage}`, false, true, false);
                }
            });
    } catch (error) {
        console.error('打開單字列表時發生錯誤:', error);
        showToast('無法打開單字列表', false, true, false);
    }
}

// 獲取當前選中的單字
function getCurrentWord(): string {
    // 如果有當前選中的單字，返回它
    if (currentWord && currentWord.trim()) {
        return currentWord.trim();
    }
    
    // 如果沒有，嘗試從選取的文字中獲取
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
        return selection.toString().trim();
    }
    
    return '';
}