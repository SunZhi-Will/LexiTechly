/// <reference types="chrome"/>

// 浮動 logo 相關變數
let floatingLogo: HTMLElement | null = null;
let isReadingMode = false;

// 創建浮動logo
export function createFloatingLogo(onToggleReadingMode: () => void): void {
    // 檢查是否應該隱藏懸浮圖示
    chrome.storage.sync.get(['hideFloatingLogo'], (result) => {
        // 如果 hideFloatingLogo 未設置或為 false，則顯示懸浮圖示
        if (result.hideFloatingLogo === undefined) {
            // 初始化設定
            chrome.storage.sync.set({ 'hideFloatingLogo': false });
        }
        
        if (result.hideFloatingLogo) {
            return; // 如果設定為隱藏，則不創建懸浮圖示
        }
        
        if (floatingLogo) return; // 避免重複創建

        floatingLogo = document.createElement('div');
        floatingLogo.id = 'lexitechly-floating-logo';

        // 使用 PNG 圖片作為 logo
        const logoImg = document.createElement('img');
        logoImg.src = chrome.runtime.getURL('images/icon128.png');
        logoImg.style.width = '24px'; // 縮小圖示
        logoImg.style.height = '24px'; // 縮小圖示
        logoImg.style.objectFit = 'contain';
        logoImg.style.pointerEvents = 'none'; // 防止圖片本身接收點擊事件

        // 創建關閉按鈕
        const closeButton = document.createElement('button');
        closeButton.className = 'lexitechly-close-btn';
        closeButton.innerHTML = '×';
        closeButton.style.display = 'none'; // 預設隱藏

        floatingLogo.appendChild(logoImg);
        floatingLogo.appendChild(closeButton);

        // 設定樣式 - 靠在滾動條旁邊
        Object.assign(floatingLogo.style, {
            position: 'fixed',
            top: '50%',
            right: '20px',
            width: '36px', // 縮小容器
            height: '36px', // 縮小容器
            borderRadius: '50%',
            cursor: 'pointer',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(8px)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
            opacity: '0.9',
            transform: 'translateY(-50%)', // 只保留初始垂直置中
            transition: 'opacity 0.3s, background-color 0.3s, box-shadow 0.3s' // 只保留顏色和陰影的動畫
        });

        // 拖拽相關變數
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        let clickStartTime = 0;
        let hasMovedDuringDrag = false;

        // 拖拽開始
        floatingLogo.addEventListener('mousedown', (e) => {
            // 如果點擊的是關閉按鈕，不啟動拖拽
            if ((e.target as HTMLElement).classList.contains('lexitechly-close-btn')) {
                return;
            }

            e.preventDefault();
            isDragging = true;
            hasMovedDuringDrag = false;
            clickStartTime = Date.now();

            const rect = floatingLogo!.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;

            if (floatingLogo) {
                floatingLogo.classList.add('lexitechly-dragging');
                floatingLogo.style.cursor = 'grabbing';
                floatingLogo.style.transition = 'none';
                floatingLogo.style.transform = 'none';
                floatingLogo.style.opacity = '1';
            }

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        // 拖拽移動
        function handleMouseMove(e: MouseEvent): void {
            if (!isDragging || !floatingLogo) return;

            hasMovedDuringDrag = true;

            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;

            // 限制在視窗範圍內
            const maxX = window.innerWidth - floatingLogo.offsetWidth;
            const maxY = window.innerHeight - floatingLogo.offsetHeight;

            const constrainedX = Math.max(0, Math.min(maxX, x));
            const constrainedY = Math.max(0, Math.min(maxY, y));

            floatingLogo.style.left = `${constrainedX}px`;
            floatingLogo.style.top = `${constrainedY}px`;
            floatingLogo.style.right = 'auto';
            floatingLogo.style.bottom = 'auto';
            floatingLogo.style.transform = 'none';

            // 儲存位置到 localStorage
            localStorage.setItem('lexitechly-logo-position', JSON.stringify({
                x: constrainedX,
                y: constrainedY
            }));
        }

        // 拖拽結束
        function handleMouseUp(e: MouseEvent): void {
            if (!floatingLogo) return;

            isDragging = false;
            
            // 如果點擊的是關閉按鈕，不處理點擊事件
            if ((e.target as HTMLElement).classList.contains('lexitechly-close-btn')) {
                return;
            }

            floatingLogo.classList.remove('lexitechly-dragging');
            floatingLogo.style.cursor = 'pointer';
            floatingLogo.style.transition = 'opacity 0.3s, background-color 0.3s, box-shadow 0.3s';
            floatingLogo.style.opacity = '0.9';

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            // 如果是短時間點擊且沒有移動，則觸發切換模式
            const clickDuration = Date.now() - clickStartTime;
            if (clickDuration < 200 && !hasMovedDuringDrag) {
                isReadingMode = !isReadingMode;
                onToggleReadingMode();
                floatingLogo.classList.toggle('reading-mode', isReadingMode);
            }
        }

        // 顯示/隱藏關閉按鈕
        floatingLogo.addEventListener('mouseenter', () => {
            if (closeButton) {
                closeButton.style.display = 'flex';
            }
            if (floatingLogo && !isDragging) {
                floatingLogo.style.opacity = '1';
                floatingLogo.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.25)';
                floatingLogo.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            }
        });

        floatingLogo.addEventListener('mouseleave', () => {
            if (closeButton) {
                closeButton.style.display = 'none';
            }
            if (floatingLogo && !isDragging) {
                floatingLogo.style.opacity = '0.9';
                floatingLogo.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
                floatingLogo.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            }
        });

        // 關閉按鈕點擊事件
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止觸發 logo 的點擊事件
            if (floatingLogo && floatingLogo.parentNode) {
                // 如果在閱讀模式中，先關閉閱讀模式
                if (isReadingMode) {
                    isReadingMode = false;
                    onToggleReadingMode();
                }
                floatingLogo.parentNode.removeChild(floatingLogo);
                floatingLogo = null;
                // 儲存設定到 storage
                chrome.storage.sync.set({ 'hideFloatingLogo': true });
            }
        });

        // 將 logo 添加到頁面
        document.body.appendChild(floatingLogo);

        // 載入儲存的位置
        const savedPosition = localStorage.getItem('lexitechly-logo-position');
        if (savedPosition) {
            try {
                const { x, y } = JSON.parse(savedPosition);
                if (floatingLogo) {
                    floatingLogo.style.left = `${x}px`;
                    floatingLogo.style.top = `${y}px`;
                    floatingLogo.style.right = 'auto';
                    floatingLogo.style.transform = 'none';
                }
            } catch (error) {
                console.error('無法載入懸浮圖示位置:', error);
            }
        }
    });
}

// 更新logo外觀
export function updateLogoAppearance(readingMode: boolean): void {
    if (!floatingLogo) return;

    isReadingMode = readingMode;

    if (isReadingMode) {
        floatingLogo.classList.add('reading-mode');
        // 添加綠色發光效果表示啟用
        floatingLogo.style.boxShadow = '0 2px 12px rgba(16, 185, 129, 0.4)';
        floatingLogo.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'; // 綠色背景
        floatingLogo.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else {
        floatingLogo.classList.remove('reading-mode');
        // 恢復正常樣式
        floatingLogo.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        floatingLogo.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
        floatingLogo.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    }
}

// 顯示Toast通知 - 簡化版本
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

// 監聽來自 popup 的消息
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'updateFloatingLogo') {
        if (message.show) {
            // 如果當前沒有顯示懸浮圖示，則創建它
            if (!floatingLogo) {
                createFloatingLogo(() => {
                    // 切換閱讀模式的回調函數
                    isReadingMode = !isReadingMode;
                    floatingLogo?.classList.toggle('reading-mode', isReadingMode);
                });
            }
        } else {
            // 如果當前顯示著懸浮圖示，則移除它
            if (floatingLogo && floatingLogo.parentNode) {
                floatingLogo.parentNode.removeChild(floatingLogo);
                floatingLogo = null;
            }
        }
    }
}); 