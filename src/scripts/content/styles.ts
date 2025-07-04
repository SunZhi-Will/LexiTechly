/// <reference types="chrome"/>

// 檢測深色主題
function isDarkTheme(): boolean {
    // 檢查 CSS 媒體查詢
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return true;
    }

    // 檢查 HTML 元素的 data-theme 或 class
    const html = document.documentElement;
    const body = document.body;

    // 常見的深色主題標識
    const darkIndicators = [
        'dark', 'dark-theme', 'dark-mode', 'theme-dark',
        'night', 'night-mode', 'black-theme'
    ];

    for (const indicator of darkIndicators) {
        if (html.classList.contains(indicator) ||
            body.classList.contains(indicator) ||
            html.getAttribute('data-theme')?.includes(indicator) ||
            body.getAttribute('data-theme')?.includes(indicator)) {
            return true;
        }
    }

    // 檢查背景顏色
    const bodyStyles = window.getComputedStyle(body);
    const htmlStyles = window.getComputedStyle(html);

    const bodyBg = bodyStyles.backgroundColor;
    const htmlBg = htmlStyles.backgroundColor;

    // 檢查是否為深色背景
    const checkDarkColor = (color: string): boolean => {
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
            return false;
        }

        // 解析 RGB 值
        const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            const [, r, g, b] = rgbMatch.map(Number);
            // 計算亮度 (使用 YIQ 公式)
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness < 128; // 如果亮度小於 128 認為是深色
        }

        return false;
    };

    return checkDarkColor(bodyBg) || checkDarkColor(htmlBg);
}

// 注入CSS樣式
export function injectStyles(): void {
    const styleId = 'lexitechly-content-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;

    // 根據主題選擇顏色變數
    const isDark = isDarkTheme();

    style.textContent = `
        /* 顏色變數 */
        :root {
            --lexitechly-bg-primary: ${isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
            --lexitechly-bg-secondary: ${isDark ? 'rgba(55, 65, 81, 0.9)' : 'rgba(249, 250, 251, 0.9)'};
            --lexitechly-text-primary: ${isDark ? '#F9FAFB' : '#1F2937'};
            --lexitechly-text-secondary: ${isDark ? '#D1D5DB' : '#374151'};
            --lexitechly-text-muted: ${isDark ? '#9CA3AF' : '#6B7280'};
            --lexitechly-border: ${isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.3)'};
            --lexitechly-shadow: ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'};
            --lexitechly-logo-bg: ${isDark ? 'rgba(55, 65, 81, 0.8)' : 'rgba(255, 255, 255, 0.7)'};
            --lexitechly-logo-border: ${isDark ? 'rgba(75, 85, 99, 0.4)' : 'rgba(255, 255, 255, 0.3)'};
            --lexitechly-tooltip-bg: ${isDark ? 'rgba(31, 41, 55, 0.98)' : 'rgba(255, 255, 255, 0.98)'};
        }

        /* Spinner 動畫 */
        @keyframes lexitechly-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .lexitechly-spinner {
            border: 2px solid ${isDark ? '#374151' : '#f3f3f3'};
            border-top: 2px solid #4F46E5;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            animation: lexitechly-spin 1s linear infinite;
            margin-right: 8px;
        }

        .lexitechly-spinner-small {
            border: 1px solid ${isDark ? '#374151' : '#f3f3f3'};
            border-top: 1px solid #4F46E5;
            border-radius: 50%;
            width: 12px;
            height: 12px;
            animation: lexitechly-spin 1s linear infinite;
            display: inline-block;
        }

        /* 播放按鈕樣式 */
.speak-btn {
    width: 28px;
    height: 28px;
    min-width: 28px;
    padding: 0;
    margin: 0;
    border: none;
    background-color: #e8f0fe;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
}

.speak-btn.elegant {
    background-color: #f0f7ff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.speak-btn:hover {
    background-color: #d2e3fc;
    transform: scale(1.05);
}

.speak-btn:active {
    transform: scale(0.95);
}

.speak-btn svg {
    width: 16px;
    height: 16px;
    fill: #1a73e8;
    transition: all 0.2s ease;
}

.speak-btn.playing {
    background-color: #1a73e8;
}

.speak-btn.playing svg {
    fill: white;
}

.speak-btn svg.play-icon {
    display: block;
}

.speak-btn svg.stop-icon {
    display: none;
}

.speak-btn.playing svg.play-icon {
    display: none;
}

.speak-btn.playing svg.stop-icon {
    display: block;
}

/* 載入動畫 */
.speak-btn.loading {
    pointer-events: none;
}

.speak-btn.loading svg {
    opacity: 0;
}

.speak-btn.loading::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid transparent;
    border-top-color: #1a73e8;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

/* 深色模式樣式 */
.dark-mode .speak-btn {
    background-color: rgba(100, 181, 246, 0.15);
}

.dark-mode .speak-btn:hover {
    background-color: rgba(100, 181, 246, 0.25);
}

.dark-mode .speak-btn svg {
    fill: #64b5f6;
}

.dark-mode .speak-btn.playing {
    background-color: #64b5f6;
}

.dark-mode .speak-btn.playing svg {
    fill: #2d2d2d;
}

.dark-mode .speak-btn.loading::after {
    border-top-color: #64b5f6;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
} 

        .lexitechly-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--lexitechly-text-primary) !important;
        }

        /* 單字高亮效果 - 簡化版本，無特效 */
        .lexitechly-word-highlight {
            background-color: rgba(59, 130, 246, 0.15);
            border-radius: 3px;
            box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.3);
        }

        /* 移除所有動畫和特效 */
        @keyframes lexitechly-highlight-glow {
            /* 空動畫，實際不使用 */
        }

        /* 查詢脈動動畫 */
        @keyframes lexitechly-query-pulse {
            0% { 
                transform: scale(1);
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.6);
            }
            50% { 
                transform: scale(1.02);
                box-shadow: 0 4px 12px rgba(79, 70, 229, 0.8);
            }
            100% { 
                transform: scale(1);
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.6);
            }
        }

        /* 提示框樣式 */
        .lexitechly-tooltip {
            position: absolute !important;
            background: var(--lexitechly-tooltip-bg) !important;
            color: var(--lexitechly-text-primary) !important;
            border: 1px solid var(--lexitechly-border) !important;
            border-radius: 8px !important;
            padding: 12px !important;
            box-shadow: 0 4px 12px var(--lexitechly-shadow) !important;
            z-index: 99999 !important;
            font-family: Arial, sans-serif !important;
            font-size: 14px !important;
            max-width: 300px !important;
            min-width: 200px !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        .lexitechly-tooltip-content {
            word-wrap: break-word !important;
            color: var(--lexitechly-text-primary) !important;
            width: 100% !important;
            display: block !important;
        }

        /* 單字資訊樣式 */
        .word-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            border-bottom: 1px solid var(--lexitechly-border);
            padding-bottom: 8px;
        }

        .word-title {
            font-size: 18px;
            color: var(--lexitechly-text-primary) !important;
            text-transform: capitalize;
        }

        .word-level {
            background-color: #4F46E5;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }

        .word-info > div {
            margin-bottom: 8px;
            line-height: 1.5;
            color: var(--lexitechly-text-secondary) !important;
        }

        .word-info > div:last-child {
            margin-bottom: 0;
        }

        .translation {
            color: var(--lexitechly-text-secondary) !important;
        }

        .part-of-speech {
            color: var(--lexitechly-text-muted) !important;
        }

        .example {
            color: var(--lexitechly-text-secondary) !important;
            background-color: var(--lexitechly-bg-secondary) !important;
            padding: 8px;
            border-radius: 6px;
            border-left: 3px solid #4F46E5;
        }

        .example em {
            color: var(--lexitechly-text-muted) !important;
            font-size: 13px;
        }


        .lexitechly-error {
            color: var(--lexitechly-text-secondary) !important;
            text-align: center;
            padding: 12px;
        }

        .lexitechly-toast {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: var(--lexitechly-bg-primary) !important;
            color: var(--lexitechly-text-primary) !important;
            border: 1px solid var(--lexitechly-border) !important;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 8px 32px var(--lexitechly-shadow);
        }

        .lexitechly-toast-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: var(--lexitechly-text-primary) !important;
        }

        .lexitechly-toast-icon {
            display: flex;
            align-items: center;
        }

        /* 浮動logo樣式 */
        #lexitechly-floating-logo {
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 2px solid var(--lexitechly-logo-border);
            background: var(--lexitechly-logo-bg);
            box-shadow: 0 4px 12px var(--lexitechly-shadow);
        }

        #lexitechly-floating-logo:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 20px var(--lexitechly-shadow);
            background: ${isDark ? 'rgba(75, 85, 99, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
        }

        #lexitechly-floating-logo:active {
            transform: scale(1.05);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        /* 關閉按鈕樣式 */
        .lexitechly-close-btn {
            position: absolute;
            top: -8px;
            right: -8px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: ${isDark ? 'rgba(75, 85, 99, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
            border: 1px solid ${isDark ? 'rgba(156, 163, 175, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
            color: ${isDark ? '#F9FAFB' : '#374151'};
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            z-index: 10001;
        }

        .lexitechly-close-btn:hover {
            background: ${isDark ? 'rgba(107, 114, 128, 0.9)' : 'rgba(255, 255, 255, 1)'};
            transform: scale(1.1);
            box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
        }

        /* 位置指示器 */
        #lexitechly-floating-logo::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 4px;
            height: 4px;
            background: ${isDark ? 'rgba(156, 163, 175, 0.6)' : 'rgba(255, 255, 255, 0.6)'};
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        #lexitechly-floating-logo:hover::before {
            opacity: 1;
        }

        /* 拖拽時的動畫效果 */
        .lexitechly-dragging {
            transition: none !important;
            z-index: 10001 !important;
            filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.3));
            cursor: grabbing !important;
        }

        /* 讀取模式下的半透明效果 */
        #lexitechly-floating-logo.reading-mode {
            background: rgba(79, 70, 229, 0.8);
            border-color: rgba(79, 70, 229, 0.9);
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        }

        #lexitechly-floating-logo.reading-mode:hover {
            background: rgba(79, 70, 229, 0.9);
            box-shadow: 0 6px 20px rgba(79, 70, 229, 0.5);
        }
    `;

    document.head.appendChild(style);
} 