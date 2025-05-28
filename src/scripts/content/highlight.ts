/// <reference types="chrome"/>

// 高亮單字
export function highlightWord(element: HTMLElement, event: MouseEvent): void {
    // 使用改進的單字獲取邏輯
    const word = getWordFromElement(element, event);
    if (!word) return;

    // 檢查是否已經有相同的高亮存在，避免重複處理
    const existingHighlight = document.querySelector('.lexitechly-word-highlight') ||
        document.querySelector('[data-lexitechly-highlighted]');

    if (existingHighlight) {
        // 檢查現有高亮的單字是否與要高亮的單字相同
        const existingWord = existingHighlight.textContent?.toLowerCase().trim();
        if (existingWord === word) {
            return; // 已經高亮了相同的單字，不需要重複處理
        }
    }

    // 方法1：嘗試精確範圍高亮
    if (tryRangeHighlight(element, event, word)) {
        return;
    }

    // 方法2：在元素中搜尋並高亮單字
    if (tryElementWordHighlight(element, word)) {
        return;
    }

    // 方法3：直接對元素加樣式（備用方法）
    applyElementHighlight(element);
}

// 嘗試精確範圍高亮
function tryRangeHighlight(element: HTMLElement, event: MouseEvent, word: string): boolean {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) {
        return false;
    }

    const textNode = range.startContainer;
    const fullText = textNode.textContent || '';
    const offset = range.startOffset;

    // 找到單字邊界
    let start = offset;
    let end = offset;

    while (start > 0 && /[a-zA-Z]/.test(fullText[start - 1])) {
        start--;
    }

    while (end < fullText.length && /[a-zA-Z]/.test(fullText[end])) {
        end++;
    }

    const foundWord = fullText.substring(start, end).toLowerCase();
    if (foundWord !== word || foundWord.length < 3) {
        return false;
    }

    // 創建高亮範圍
    const wordRange = document.createRange();
    wordRange.setStart(textNode, start);
    wordRange.setEnd(textNode, end);

    // 創建高亮元素
    const highlight = document.createElement('span');
    highlight.className = 'lexitechly-word-highlight';

    try {
        wordRange.surroundContents(highlight);
        return true;
    } catch (error) {
        return false;
    }
}

// 嘗試在元素中搜尋並高亮特定單字
function tryElementWordHighlight(element: HTMLElement, word: string): boolean {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
    );

    let textNode;
    while (textNode = walker.nextNode()) {
        const text = textNode.textContent || '';
        const wordRegex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
        const match = text.match(wordRegex);

        if (match && match.index !== undefined) {
            try {
                const range = document.createRange();
                range.setStart(textNode, match.index);
                range.setEnd(textNode, match.index + word.length);

                const highlight = document.createElement('span');
                highlight.className = 'lexitechly-word-highlight';
                range.surroundContents(highlight);
                return true;
            } catch (error) {
                // 繼續嘗試其他節點
                continue;
            }
        }
    }
    return false;
}

// 直接對元素加樣式（備用方法）
function applyElementHighlight(element: HTMLElement): void {
    element.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
    element.style.borderRadius = '3px';
    element.style.boxShadow = '0 0 0 1px rgba(59, 130, 246, 0.3)';
    element.setAttribute('data-lexitechly-highlighted', 'true');
}

// 轉義正則表達式特殊字符
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 清除單字高亮
export function removeWordHighlight(): void {
    // 直接清除span高亮，但不清除鎖定狀態的高亮
    const highlights = document.querySelectorAll('.lexitechly-word-highlight:not([data-lexitechly-locked])');
    highlights.forEach(highlight => {
        const parent = highlight.parentNode;
        if (parent && highlight.parentNode === parent) {
            parent.insertBefore(document.createTextNode(highlight.textContent || ''), highlight);
            parent.removeChild(highlight);
            parent.normalize();
        }
    });

    // 直接清除樣式高亮，但不清除鎖定狀態的高亮
    const styledElements = document.querySelectorAll('[data-lexitechly-highlighted]:not([data-lexitechly-locked])');
    styledElements.forEach(element => {
        const htmlElement = element as HTMLElement;
        htmlElement.style.backgroundColor = '';
        htmlElement.style.borderRadius = '';
        htmlElement.style.boxShadow = '';
        htmlElement.removeAttribute('data-lexitechly-highlighted');
    });

    // 清除非鎖定狀態的高亮樣式
    const allHighlighted = document.querySelectorAll('[style*="rgba("]:not([data-lexitechly-locked])');
    allHighlighted.forEach(element => {
        const htmlElement = element as HTMLElement;
        // 只清除非鎖定狀態的藍色高亮
        if (htmlElement.style.backgroundColor.includes('rgba(59, 130, 246')) {
            htmlElement.style.backgroundColor = '';
        }
        if (htmlElement.style.boxShadow.includes('rgba(59, 130, 246')) {
            htmlElement.style.boxShadow = '';
        }
        if (htmlElement.style.animation) {
            htmlElement.style.animation = '';
        }
    });
}

// 備用高亮方法：直接在元素中高亮單字
export function highlightWordInElement(element: HTMLElement, event: MouseEvent): void {
    const word = getWordFromElement(element, event);
    if (!word) return;

    // 嘗試在元素中高亮特定單字
    if (tryElementWordHighlight(element, word)) {
        return;
    }

    // 備用：直接對元素加樣式
    applyElementHighlight(element);
}

// 從元素中獲取單字（與 reading-mode.ts 保持一致）
function getWordFromElement(element: HTMLElement, event: MouseEvent): string {
    // 方法1：嘗試使用點擊位置獲取單字
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
        const word = extractWordFromTextNode(range.startContainer, range.startOffset);
        if (word) return word;
    }

    // 方法2：搜尋元素內的所有文字節點
    const word = findWordInElement(element, event);
    if (word) return word;

    // 方法3：從元素文字中提取最近的單字
    const fallbackWord = extractNearestWord(element, event);
    if (fallbackWord) return fallbackWord;

    return '';
}

// 從文字節點中提取單字
function extractWordFromTextNode(textNode: Node, offset: number): string {
    const fullText = textNode.textContent || '';

    // 找到單字邊界
    let start = offset;
    let end = offset;

    while (start > 0 && /[a-zA-Z]/.test(fullText[start - 1])) {
        start--;
    }

    while (end < fullText.length && /[a-zA-Z]/.test(fullText[end])) {
        end++;
    }

    const word = fullText.substring(start, end).toLowerCase();
    return word.length > 2 ? word : '';
}

// 在元素中搜尋單字
function findWordInElement(element: HTMLElement, event: MouseEvent): string {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
    );

    let textNode;
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    let closestWord = '';
    let closestDistance = Infinity;

    while (textNode = walker.nextNode()) {
        const text = textNode.textContent || '';
        if (!/[a-zA-Z]/.test(text)) continue;

        // 使用正則表達式找到所有單字及其位置
        const wordPattern = /\b[a-zA-Z]{3,}\b/g;
        let match;

        while ((match = wordPattern.exec(text)) !== null) {
            const word = match[0];
            const wordIndex = match.index;

            // 創建單字範圍
            const range = document.createRange();
            try {
                range.setStart(textNode, wordIndex);
                range.setEnd(textNode, wordIndex + word.length);

                const rect = range.getBoundingClientRect();

                // 精確檢查滑鼠是否在單字範圍內（增加容錯範圍）
                const tolerance = 2; // 2px 容錯
                if (mouseX >= rect.left - tolerance && mouseX <= rect.right + tolerance &&
                    mouseY >= rect.top - tolerance && mouseY <= rect.bottom + tolerance) {
                    return word.toLowerCase();
                }

                // 計算滑鼠到單字中心的距離，用於找最近的單字
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const distance = Math.sqrt(
                    Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
                );

                // 只考慮在合理範圍內的單字（避免選取太遠的單字）
                const maxDistance = 50; // 最大50px距離
                if (distance < closestDistance && distance < maxDistance) {
                    closestDistance = distance;
                    closestWord = word.toLowerCase();
                }
            } catch (error) {
                // 忽略範圍創建錯誤，繼續下一個單字
                continue;
            }
        }
    }

    // 如果沒有直接命中的單字，返回最近的單字（如果在合理範圍內）
    return closestWord;
}

// 提取最近的單字（備用方法）
function extractNearestWord(element: HTMLElement, event: MouseEvent): string {
    const text = element.textContent || '';
    const words = text.match(/\b[a-zA-Z]{3,}\b/g);

    if (!words || words.length === 0) return '';

    // 如果只有一個單字，檢查滑鼠是否在元素範圍內
    if (words.length === 1) {
        const rect = element.getBoundingClientRect();
        const mouseX = event.clientX;
        const mouseY = event.clientY;

        // 只有在元素範圍內才返回單字
        if (mouseX >= rect.left && mouseX <= rect.right &&
            mouseY >= rect.top && mouseY <= rect.bottom) {
            return words[0].toLowerCase();
        }
        return '';
    }

    // 多個單字時，更保守地選擇
    const rect = element.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const relativeY = event.clientY - rect.top;

    // 確保滑鼠確實在元素內
    if (relativeX < 0 || relativeX > rect.width ||
        relativeY < 0 || relativeY > rect.height) {
        return '';
    }

    // 簡單估算：根據滑鼠在元素中的相對位置選擇單字
    const elementWidth = rect.width;
    const elementHeight = rect.height;

    // 計算滑鼠位置比例
    const xRatio = Math.max(0, Math.min(1, relativeX / elementWidth));
    const yRatio = Math.max(0, Math.min(1, relativeY / elementHeight));

    // 根據位置比例選擇單字
    const wordIndex = Math.floor((xRatio + yRatio) / 2 * words.length);
    const selectedIndex = Math.max(0, Math.min(words.length - 1, wordIndex));

    return words[selectedIndex].toLowerCase();
} 