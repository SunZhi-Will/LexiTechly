// 預先載入主題設定
chrome.storage.local.get('darkMode', ({ darkMode }) => {
    // 預設使用深色主題；若尚未設定則寫入 true 並套用
    const isDark = darkMode !== undefined ? darkMode === true : true;
    if (isDark) {
        document.documentElement.classList.add('dark-mode');
    }
    if (darkMode === undefined) {
        chrome.storage.local.set({ darkMode: true });
    }
});

export {}; 