// 預先載入主題設定
chrome.storage.local.get('darkMode', ({ darkMode }) => {
    if (darkMode) {
        document.documentElement.classList.add('dark-mode');
    }
}); 

export {}; 