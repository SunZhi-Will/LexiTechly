// 從元素中獲取單字（改善版）
export function getWordFromElement(element: HTMLElement, event: MouseEvent): string {
    // 方法1：嘗試使用點擊位置獲取單字
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
        const word = extractWordFromTextNode(range.startContainer, range.startOffset);
        if (word) return word;
    }

    // 方法2：搜尋元素內的所有文字節點
    const word = findWordInElement(element, event);
    if (word) return word;

    // 方法3：從元素文字中提取最近的單字（更保守）
    const fallbackWord = extractNearestWord(element, event);
    if (fallbackWord) return fallbackWord;

    return '';
}

// 從文字節點中提取單字
export function extractWordFromTextNode(textNode: Node, offset: number): string {
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
export function findWordInElement(element: HTMLElement, event: MouseEvent): string {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
    );

    let textNode;
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    let directHitWord = ''; // 直接命中的單字
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

                // 更嚴格的精確檢查：滑鼠必須真正在單字範圍內
                if (mouseX >= rect.left && mouseX <= rect.right &&
                    mouseY >= rect.top && mouseY <= rect.bottom) {
                    directHitWord = word.toLowerCase();
                    break; // 找到直接命中就停止
                }

                // 計算滑鼠到單字中心的距離，用於找最近的單字
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const distance = Math.sqrt(
                    Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
                );

                // 只考慮在更小範圍內的單字（減少跳動）
                const maxDistance = 25; // 減少最大距離到25px
                if (distance < closestDistance && distance < maxDistance) {
                    closestDistance = distance;
                    closestWord = word.toLowerCase();
                }
            } catch (error) {
                // 忽略範圍創建錯誤，繼續下一個單字
                continue;
            }
        }

        // 如果找到直接命中，就不用繼續搜尋了
        if (directHitWord) {
            break;
        }
    }

    // 優先返回直接命中的單字，其次是最近的單字
    return directHitWord || closestWord;
}

// 提取最近的單字（備用方法）
export function extractNearestWord(element: HTMLElement, event: MouseEvent): string {
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

// 禁用所有連結
export function disableAllLinks(): HTMLElement[] {
    const disabledElements: HTMLElement[] = [];

    // 禁用連結
    const links = document.querySelectorAll('a');
    links.forEach(link => {
        const htmlLink = link as HTMLElement;
        htmlLink.style.pointerEvents = 'none';
        htmlLink.style.opacity = '0.6';
        htmlLink.setAttribute('data-lexitechly-disabled', 'true');
        disabledElements.push(htmlLink);
    });

    // 禁用按鈕
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        const htmlButton = button as HTMLElement;
        htmlButton.style.pointerEvents = 'none';
        htmlButton.style.opacity = '0.6';
        htmlButton.setAttribute('data-lexitechly-disabled', 'true');
        disabledElements.push(htmlButton);
    });

    // 禁用其他可點擊元素
    const clickableElements = document.querySelectorAll('[onclick], [role="button"], [role="link"], input[type="submit"], input[type="button"]');
    clickableElements.forEach(element => {
        const htmlElement = element as HTMLElement;
        htmlElement.style.pointerEvents = 'none';
        htmlElement.style.opacity = '0.6';
        htmlElement.setAttribute('data-lexitechly-disabled', 'true');
        disabledElements.push(htmlElement);
    });

    return disabledElements;
}

// 啟用所有連結
export function enableAllLinks(disabledElements: HTMLElement[]): void {
    disabledElements.forEach(element => {
        element.style.pointerEvents = '';
        element.style.opacity = '';
        element.removeAttribute('data-lexitechly-disabled');
    });
} 