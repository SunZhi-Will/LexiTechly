/// <reference types="chrome"/>

import { highlightWord, removeWordHighlight, highlightWordInElement } from './highlight';
import { createFloatingLogo, updateLogoAppearance } from './floating-logo';
import { queryWordInfo, checkPageTheme, updateTooltipTheme } from './word-query';
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

// 切換查閱模式
function toggleReadingMode(): void {
    isReadingMode = !isReadingMode;
    updateLogoAppearance(isReadingMode);

    if (isReadingMode) {
        showToast('✨ 查閱模式已開啟！懸停單字後點選查看詳情', false, false, true);
        enableWordHover();
        disabledElements = disableAllLinks();
    } else {
        showToast('📖 查閱模式已關閉', false, false, false);
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

    // 查詢單字詳情
    try {
        const { apiKey } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
            updateTooltipContent(tooltip, word, '請先設定 API Key');
            return;
        }

        const result = await queryWordInfo(word, apiKey);
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
        const { accumulatedVocabulary = [] } = await chrome.storage.local.get('accumulatedVocabulary');

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
            showToast(`📝 "${wordData.word}" 已加入單字列表`, false, false, true);
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
    if (isError) iconHtml = '❌';
    else if (isSuccess) iconHtml = '✅';
    else if (isLoading) iconHtml = '<div class="lexitechly-spinner-small"></div>';

    toast.innerHTML = `
        <div class="lexitechly-toast-content">
            ${iconHtml ? `<span class="lexitechly-toast-icon">${iconHtml}</span>` : ''}
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
    // 檢查頁面是否為有效的網頁
    if (window.location.protocol === 'chrome-extension:' ||
        window.location.protocol === 'chrome:' ||
        window.location.protocol === 'about:') {
        return;
    }

    // 等待頁面載入完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => createFloatingLogo(toggleReadingMode));
    } else {
        createFloatingLogo(toggleReadingMode);
    }

    // 監聽點擊事件以隱藏提示
    document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.lexitechly-tooltip') && !target.closest('#lexitechly-floating-logo')) {
            removeTooltip();
        }
    });
}

// 高亮相關功能
export { highlightWord, removeWordHighlight, highlightWordInElement };

// 查閱模式主要功能
export { initReadingMode };