/// <reference types="chrome"/>

/**
 * 判斷目前網頁是不是深色：先看網頁自己標示的主題與實際背景色，
 * 都看不出來（背景透明）時，只有網頁宣告支援深色配色才參考系統偏好，免得白底網頁上出現深色字卡。
 */
export function isDarkTheme(): boolean {
    const html = document.documentElement;
    const body = document.body;

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

    // 背景色的亮度（YIQ）；透明或解析不出來時回傳 null
    const brightness = (color: string): number | null => {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) return null;
        if (match[4] !== undefined && Number(match[4]) === 0) return null;
        const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
        return (r * 299 + g * 587 + b * 114) / 1000;
    };

    for (const element of [body, html]) {
        const value = brightness(window.getComputedStyle(element).backgroundColor);
        if (value !== null) return value < 128;
    }

    // 沒設背景色的網頁預設是白底，只有網頁自己宣告支援深色配色時才跟著系統偏好
    const supportsDark = window.getComputedStyle(html).colorScheme.includes('dark');
    return supportsDark && (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
}

/** 注入網頁的介面用的顏色（和 popup、單字頁同一套品牌色） */
export function themeVars(isDark: boolean): Record<string, string> {
    return isDark
        ? {
            '--lexitechly-bg-primary': '#191d24',
            '--lexitechly-tooltip-bg': '#191d24',
            '--lexitechly-bg-secondary': '#232830',
            '--lexitechly-text-primary': '#e9ecf1',
            '--lexitechly-text-secondary': '#c3c9d3',
            '--lexitechly-text-muted': '#8b94a3',
            '--lexitechly-border': '#2f3540',
            '--lexitechly-shadow': 'rgba(0, 0, 0, 0.5)',
            '--lexitechly-accent': '#70a7ff',
            '--lexitechly-accent-soft': 'rgba(112, 167, 255, 0.16)',
            '--lexitechly-accent-soft-hover': 'rgba(112, 167, 255, 0.26)',
            '--lexitechly-on-accent': '#0c1524',
            '--lexitechly-logo-bg': 'rgba(35, 40, 48, 0.9)',
            '--lexitechly-logo-border': 'rgba(255, 255, 255, 0.14)'
        }
        : {
            '--lexitechly-bg-primary': '#ffffff',
            '--lexitechly-tooltip-bg': '#ffffff',
            '--lexitechly-bg-secondary': '#f1f4f8',
            '--lexitechly-text-primary': '#18202e',
            '--lexitechly-text-secondary': '#3d4656',
            '--lexitechly-text-muted': '#6b7585',
            '--lexitechly-border': '#e2e6ec',
            '--lexitechly-shadow': 'rgba(16, 24, 40, 0.16)',
            '--lexitechly-accent': '#2468e8',
            '--lexitechly-accent-soft': '#e8f0fe',
            '--lexitechly-accent-soft-hover': '#d8e5fd',
            '--lexitechly-on-accent': '#ffffff',
            '--lexitechly-logo-bg': 'rgba(255, 255, 255, 0.92)',
            '--lexitechly-logo-border': 'rgba(16, 24, 40, 0.1)'
        };
}

// 注入CSS樣式
export function injectStyles(): void {
    const styleId = 'lexitechly-content-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;

    const vars = Object.entries(themeVars(isDarkTheme()))
        .map(([name, value]) => `${name}: ${value};`)
        .join('\n            ');
    const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', sans-serif`;

    style.textContent = `
        :root {
            ${vars}
        }

        @keyframes lexitechly-spin {
            to { transform: rotate(360deg); }
        }

        .lexitechly-spinner,
        .lexitechly-spinner-small {
            border: 2px solid var(--lexitechly-accent-soft-hover);
            border-top-color: var(--lexitechly-accent);
            border-radius: 50%;
            width: 16px;
            height: 16px;
            animation: lexitechly-spin 0.8s linear infinite;
            margin-right: 8px;
            flex-shrink: 0;
        }

        .lexitechly-spinner-small {
            width: 14px;
            height: 14px;
            margin-right: 0;
            display: inline-block;
            border-color: rgba(255, 255, 255, 0.3);
            border-top-color: #fff;
        }

        .lexitechly-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 6px 0;
            color: var(--lexitechly-text-secondary) !important;
        }

        /* 單字高亮 */
        .lexitechly-word-highlight {
            background-color: color-mix(in srgb, var(--lexitechly-accent) 18%, transparent);
            border-radius: 3px;
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--lexitechly-accent) 40%, transparent);
        }

        /* 字卡 */
        .lexitechly-tooltip {
            position: absolute !important;
            background: var(--lexitechly-tooltip-bg) !important;
            color: var(--lexitechly-text-primary) !important;
            border: 1px solid var(--lexitechly-border) !important;
            border-radius: 14px !important;
            padding: 0 !important;
            box-shadow: 0 12px 32px var(--lexitechly-shadow), 0 2px 6px var(--lexitechly-shadow) !important;
            z-index: 99999 !important;
            font-family: ${font} !important;
            font-size: 14px !important;
            line-height: 1.5 !important;
            text-align: left !important;
            max-width: 360px !important;
            min-width: 260px !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            cursor: move !important;
            user-select: none !important;
            transition: opacity 0.2s, box-shadow 0.2s !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
        }

        .lexitechly-tooltip * {
            box-sizing: border-box !important;
            font-family: inherit !important;
        }

        .lexitechly-tooltip.dragging {
            box-shadow: 0 20px 48px var(--lexitechly-shadow), 0 4px 12px var(--lexitechly-shadow) !important;
            transition: none !important;
            z-index: 100000 !important;
        }

        .lexitechly-tooltip-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 6px 8px 6px 14px !important;
            border-bottom: 1px solid var(--lexitechly-border) !important;
            background: var(--lexitechly-bg-secondary) !important;
            cursor: move !important;
        }

        .lexitechly-tooltip-title {
            font-size: 12px !important;
            font-weight: 600 !important;
            color: var(--lexitechly-text-muted) !important;
        }

        .lexitechly-tooltip-actions {
            display: flex !important;
            align-items: center !important;
            gap: 2px !important;
        }

        .lexitechly-tooltip-close,
        .lexitechly-tooltip-vocabulary {
            width: 26px !important;
            height: 26px !important;
            border: none !important;
            background: transparent !important;
            color: var(--lexitechly-text-muted) !important;
            font-size: 18px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 7px !important;
            transition: background 0.15s, color 0.15s !important;
            padding: 0 !important;
            margin: 0 !important;
            line-height: 1 !important;
        }

        .lexitechly-tooltip-close:hover,
        .lexitechly-tooltip-vocabulary:hover {
            background: var(--lexitechly-accent-soft) !important;
            color: var(--lexitechly-accent) !important;
        }

        .lexitechly-tooltip-vocabulary svg {
            width: 15px !important;
            height: 15px !important;
            pointer-events: none !important;
        }

        .lexitechly-tooltip-content {
            color: var(--lexitechly-text-primary) !important;
            width: 100% !important;
            display: block !important;
            padding: 14px !important;
            overflow-wrap: break-word !important;
            word-break: break-word !important;
        }

        /* 字卡內容 */
        .lexitechly-tooltip .word-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            gap: 8px !important;
            margin: 0 0 10px !important;
            padding: 0 !important;
            border: none !important;
            width: 100% !important;
        }

        .lexitechly-tooltip .word-title-container {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            flex: 1 !important;
            min-width: 0 !important;
        }

        .lexitechly-tooltip .word-title {
            font-size: 18px !important;
            font-weight: 700 !important;
            color: var(--lexitechly-text-primary) !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
        }

        .lexitechly-tooltip .word-level {
            background-color: var(--lexitechly-accent-soft) !important;
            color: var(--lexitechly-accent) !important;
            padding: 2px 9px !important;
            border-radius: 999px !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            letter-spacing: 0.04em !important;
            flex-shrink: 0 !important;
            white-space: nowrap !important;
        }

        .lexitechly-tooltip .word-info > div {
            margin: 0 0 6px !important;
            line-height: 1.6 !important;
            color: var(--lexitechly-text-secondary) !important;
            width: 100% !important;
            overflow-wrap: break-word !important;
            word-break: break-word !important;
        }

        .lexitechly-tooltip .word-info > div:last-child {
            margin-bottom: 0 !important;
        }

        .lexitechly-tooltip .word-info strong {
            font-weight: 600 !important;
            color: var(--lexitechly-text-muted) !important;
        }

        .lexitechly-tooltip .translation {
            font-size: 15px !important;
            color: var(--lexitechly-text-primary) !important;
        }

        .lexitechly-tooltip .part-of-speech {
            font-size: 13px !important;
            color: var(--lexitechly-text-muted) !important;
        }

        .lexitechly-tooltip .example {
            margin-top: 10px !important;
            padding: 10px 12px !important;
            border-radius: 10px !important;
            background-color: var(--lexitechly-bg-secondary) !important;
            color: var(--lexitechly-text-secondary) !important;
            font-size: 13px !important;
        }

        .lexitechly-tooltip .example-header {
            display: flex !important;
            align-items: flex-start !important;
            gap: 8px !important;
            margin-bottom: 4px !important;
        }

        .lexitechly-tooltip .example-header strong {
            flex: 1 !important;
        }

        .lexitechly-tooltip .example em {
            font-style: normal !important;
            color: var(--lexitechly-text-primary) !important;
        }

        /* 發音按鈕 */
        .lexitechly-tooltip .speak-btn {
            width: 26px !important;
            height: 26px !important;
            min-width: 26px !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            background-color: var(--lexitechly-accent-soft) !important;
            border-radius: 50% !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            transition: background-color 0.15s, transform 0.15s !important;
            position: relative !important;
            overflow: hidden !important;
            flex-shrink: 0 !important;
        }

        .lexitechly-tooltip .speak-btn:hover {
            background-color: var(--lexitechly-accent-soft-hover) !important;
        }

        .lexitechly-tooltip .speak-btn:active {
            transform: scale(0.92);
        }

        .lexitechly-tooltip .speak-btn svg {
            width: 14px;
            height: 14px;
            fill: var(--lexitechly-accent);
        }

        .lexitechly-tooltip .speak-btn.playing {
            background-color: var(--lexitechly-accent) !important;
        }

        .lexitechly-tooltip .speak-btn.playing svg {
            fill: var(--lexitechly-on-accent);
        }

        .lexitechly-tooltip .speak-btn svg.stop-icon,
        .lexitechly-tooltip .speak-btn.playing svg.play-icon {
            display: none;
        }

        .lexitechly-tooltip .speak-btn.playing svg.stop-icon {
            display: block;
        }

        .lexitechly-tooltip .speak-btn.loading {
            pointer-events: none;
        }

        .lexitechly-tooltip .speak-btn.loading svg {
            opacity: 0;
        }

        .lexitechly-tooltip .speak-btn.loading::after {
            content: '';
            position: absolute;
            width: 12px;
            height: 12px;
            border: 2px solid transparent;
            border-top-color: var(--lexitechly-accent);
            border-radius: 50%;
            animation: lexitechly-spin 0.8s linear infinite;
        }

        .lexitechly-error {
            color: var(--lexitechly-text-secondary) !important;
            text-align: center;
            padding: 12px;
        }

        /* 提示訊息 */
        .lexitechly-toast {
            font-family: ${font};
            font-weight: 500;
            line-height: 1.5;
            background: #18202e !important;
            color: #ffffff !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            box-shadow: 0 12px 32px rgba(16, 24, 40, 0.28);
        }

        .lexitechly-toast-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: #ffffff !important;
        }

        .lexitechly-toast-icon {
            display: flex;
            align-items: center;
        }

        .lexitechly-toast-icon svg {
            width: 16px;
            height: 16px;
        }

        .lexitechly-toast-icon.is-error {
            color: #ff8a8a;
        }

        .lexitechly-toast-icon.is-success {
            color: #5fd69b;
        }

        /* 懸浮圖示 */
        #lexitechly-floating-logo {
            border: 1px solid var(--lexitechly-logo-border) !important;
            background: var(--lexitechly-logo-bg) !important;
            box-shadow: 0 4px 14px var(--lexitechly-shadow) !important;
        }

        #lexitechly-floating-logo:hover {
            opacity: 1 !important;
            box-shadow: 0 6px 20px var(--lexitechly-shadow) !important;
        }

        /* 查閱模式開啟中：品牌色外框 */
        #lexitechly-floating-logo.reading-mode {
            opacity: 1 !important;
            border-color: var(--lexitechly-accent) !important;
            box-shadow: 0 0 0 3px var(--lexitechly-accent-soft-hover), 0 4px 14px var(--lexitechly-shadow) !important;
        }

        .lexitechly-close-btn {
            position: absolute;
            top: -7px;
            right: -7px;
            width: 18px;
            height: 18px;
            padding: 0;
            border-radius: 50%;
            background: var(--lexitechly-bg-primary);
            border: 1px solid var(--lexitechly-border);
            color: var(--lexitechly-text-muted);
            font-size: 13px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 2px 6px var(--lexitechly-shadow);
            transition: color 0.15s, background 0.15s;
            z-index: 10001;
        }

        .lexitechly-close-btn:hover {
            color: #d43c3c;
        }

        .lexitechly-dragging {
            transition: none !important;
            z-index: 10001 !important;
            cursor: grabbing !important;
        }

        /* 選取英文後的查詢按鈕 */
        .lexitechly-selection-lookup-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            width: 26px !important;
            height: 26px !important;
            border: none !important;
            border-radius: 50% !important;
            background: var(--lexitechly-accent) !important;
            color: var(--lexitechly-on-accent) !important;
            box-shadow: 0 2px 8px var(--lexitechly-shadow) !important;
            cursor: pointer !important;
            user-select: none !important;
            opacity: 0.92 !important;
            transition: transform 0.15s, opacity 0.15s !important;
            font-family: inherit !important;
        }

        .lexitechly-selection-lookup-btn:hover {
            transform: scale(1.1) !important;
            opacity: 1 !important;
        }

        .lexitechly-selection-lookup-btn:active {
            transform: scale(0.95) !important;
        }

        .lexitechly-selection-lookup-btn .lexitechly-selection-lookup-icon {
            flex-shrink: 0 !important;
        }
    `;

    document.head.appendChild(style);
}
