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
    logoImg.style.width = '32px';
    logoImg.style.height = '32px';
    logoImg.style.objectFit = 'contain';
    logoImg.style.pointerEvents = 'none'; // 防止圖片本身接收點擊事件

    floatingLogo.appendChild(logoImg);

    // 設定樣式 - 靠在滾動條旁邊
    Object.assign(floatingLogo.style, {
        position: 'fixed',
        top: '50%',
        right: '20px',
        width: '48px',
        height: '48px',
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

    // 添加懸停效果（移除位移動畫）
    floatingLogo.addEventListener('mouseenter', () => {
        if (floatingLogo && !isDragging) {
            floatingLogo.style.opacity = '1';
            floatingLogo.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.25)';
            floatingLogo.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        }
    });

    floatingLogo.addEventListener('mouseleave', () => {
        if (floatingLogo && !isDragging) {
            floatingLogo.style.opacity = '0.9';
            floatingLogo.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
            floatingLogo.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
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
            floatingLogo.style.transition = 'none'; // 拖拽時移除所有動畫
            floatingLogo.style.transform = 'none'; // 拖拽時移除 transform
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
        const maxX = window.innerWidth - 48; // 使用實際寬度
        const maxY = window.innerHeight - 48; // 使用實際高度

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
        floatingLogo.style.transition = 'opacity 0.3s, background-color 0.3s, box-shadow 0.3s';
        floatingLogo.style.opacity = '0.9';

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