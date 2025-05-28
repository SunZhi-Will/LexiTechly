/// <reference types="chrome"/>

// 浮動 logo 相關變數
let floatingLogo: HTMLElement | null = null;
let isReadingMode = false;

// 創建浮動logo
export function createFloatingLogo(onToggleReadingMode: () => void): void {
    if (floatingLogo) return; // 避免重複創建

    floatingLogo = document.createElement('div');
    floatingLogo.id = 'lexitechly-floating-logo';
    floatingLogo.setAttribute('data-tooltip', '拖拽移動位置 | 點擊切換查閱模式');

    // 使用 PNG 圖片作為 logo
    const logoImg = document.createElement('img');
    logoImg.src = chrome.runtime.getURL('images/icon128.png');
    logoImg.style.width = '24px';
    logoImg.style.height = '24px';
    logoImg.style.objectFit = 'contain';
    logoImg.style.pointerEvents = 'none'; // 防止圖片本身接收點擊事件

    floatingLogo.appendChild(logoImg);

    // 設定樣式 - 靠在滾動條旁邊
    Object.assign(floatingLogo.style, {
        position: 'fixed',
        top: '50%',
        right: '15px', // 距離右邊15px，避開滾動條
        width: '32px',
        height: '32px',
        borderRadius: '50%', // 圓形
        cursor: 'pointer', // 改為指標
        zIndex: '10000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '2px 2px 8px rgba(0, 0, 0, 0.1)',
        opacity: '0.7',
        transition: 'all 0.3s ease',
        transform: 'translateY(-50%)' // 垂直居中
    });

    // 拖拽相關變數
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let clickStartTime = 0;
    let hasMovedDuringDrag = false;

    // 添加懸停效果
    floatingLogo.addEventListener('mouseenter', () => {
        if (floatingLogo && !isDragging) {
            floatingLogo.style.opacity = '1';

            // 檢查是否有自定義位置
            const savedPosition = localStorage.getItem('lexitechly-logo-position');
            if (savedPosition) {
                // 有自定義位置時，只放大，不使用 translateY
                floatingLogo.style.transform = 'scale(1.1)';
            } else {
                // 預設位置時，使用 translateY + 放大
                floatingLogo.style.transform = 'translateY(-50%) scale(1.1)';
            }

            floatingLogo.style.boxShadow = '2px 4px 16px rgba(0, 0, 0, 0.2)';
            floatingLogo.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        }
    });

    floatingLogo.addEventListener('mouseleave', () => {
        if (floatingLogo && !isDragging) {
            floatingLogo.style.opacity = '0.7';

            // 檢查是否有自定義位置
            const savedPosition = localStorage.getItem('lexitechly-logo-position');
            if (savedPosition) {
                // 有自定義位置時，清除 transform
                floatingLogo.style.transform = 'none';
            } else {
                // 預設位置時，保持 translateY
                floatingLogo.style.transform = 'translateY(-50%)';
            }

            floatingLogo.style.boxShadow = '2px 2px 8px rgba(0, 0, 0, 0.1)';
            floatingLogo.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
        }
    });

    // 拖拽開始
    floatingLogo.addEventListener('mousedown', (e: MouseEvent) => {
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

            // 檢查是否有自定義位置
            const savedPosition = localStorage.getItem('lexitechly-logo-position');
            if (savedPosition) {
                // 有自定義位置時，只放大，不使用 translateY
                floatingLogo.style.transform = 'scale(1.05)';
            } else {
                // 預設位置時，使用 translateY + 放大
                floatingLogo.style.transform = 'translateY(-50%) scale(1.05)';
            }

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
        const maxX = window.innerWidth - 32;
        const maxY = window.innerHeight - 32;

        const constrainedX = Math.max(0, Math.min(maxX, x));
        const constrainedY = Math.max(0, Math.min(maxY, y));

        floatingLogo.style.left = `${constrainedX}px`;
        floatingLogo.style.top = `${constrainedY}px`;
        floatingLogo.style.right = 'auto';
        floatingLogo.style.bottom = 'auto';
        floatingLogo.style.transform = 'none'; // 拖拽時清除 transform

        // 儲存位置到 localStorage
        localStorage.setItem('lexitechly-logo-position', JSON.stringify({
            x: constrainedX,
            y: constrainedY
        }));
    }

    // 拖拽結束
    function handleMouseUp(): void {
        if (!floatingLogo) return;

        const clickDuration = Date.now() - clickStartTime;

        // 如果是短時間點擊且沒有移動，則觸發切換模式
        if (clickDuration < 200 && !hasMovedDuringDrag) {
            onToggleReadingMode();
        }

        isDragging = false;
        hasMovedDuringDrag = false;

        floatingLogo.classList.remove('lexitechly-dragging');
        floatingLogo.style.cursor = 'pointer';
        floatingLogo.style.transition = 'all 0.3s ease';

        // 保持當前位置，不自動回到預設位置
        floatingLogo.style.opacity = '0.7';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }

    // 載入儲存的位置
    const savedPosition = localStorage.getItem('lexitechly-logo-position');
    if (savedPosition) {
        try {
            const { x, y } = JSON.parse(savedPosition);
            floatingLogo.style.left = `${x}px`;
            floatingLogo.style.top = `${y}px`;
            floatingLogo.style.right = 'auto';
            floatingLogo.style.bottom = 'auto';
            floatingLogo.style.transform = 'none';
        } catch (error) {
            // 如果解析失敗，使用預設位置
        }
    }

    document.body.appendChild(floatingLogo);
    // 初始化時設定為未啟用狀態
    updateLogoAppearance(false);

    // 首次顯示時的引導提示
    const hasSeenGuide = localStorage.getItem('lexitechly-drag-guide-shown');
    if (!hasSeenGuide) {
        setTimeout(() => {
            showToast('💡 新功能：logo 現在可以拖拽移動位置了！', false, false, true);
            localStorage.setItem('lexitechly-drag-guide-shown', 'true');
        }, 2000);
    }
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