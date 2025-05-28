/// <reference types="chrome"/>

export function showToast(message: string, isLoading: boolean = false, isError: boolean = false, isSuccess: boolean = false): void {
    // 移除現有的 toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    let toastClass = 'toast';
    if (isError) toastClass += ' error';
    else if (isLoading) toastClass += ' loading';
    else if (isSuccess) toastClass += ' success';

    toast.className = toastClass;

    let icon = '';
    if (isError) icon = '<span class="toast-icon">❌</span>';
    else if (isSuccess) icon = '<span class="toast-icon">✅</span>';
    else if (isLoading) icon = '<div class="loading-spinner"></div>';

    toast.innerHTML = `
        <div class="toast-content">
            ${icon}
            <span>${message}</span>
        </div>
    `;

    document.body.appendChild(toast);

    // 顯示動畫
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // 自動隱藏（除非是載入中）
    if (!isLoading) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

export function showConfirmDialog(
    title: string,
    message: string,
    items: string[] = [],
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText: string = '確認',
    cancelText: string = '取消'
): void {
    // 創建對話框容器
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.style.display = 'flex';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    let itemsHtml = '';
    if (items.length > 0) {
        itemsHtml = `
            <ul>
                ${items.map(item => `<li>${item}</li>`).join('')}
            </ul>
        `;
    }

    dialog.innerHTML = `
        <h3>${title}</h3>
        <div class="confirm-dialog-content">
            ${message}
            ${itemsHtml}
        </div>
        <div class="confirm-dialog-buttons">
            <button class="confirm-dialog-btn cancel">${cancelText}</button>
            <button class="confirm-dialog-btn confirm">${confirmText}</button>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 添加事件監聽器
    const cancelBtn = dialog.querySelector('.confirm-dialog-btn.cancel') as HTMLButtonElement;
    const confirmBtn = dialog.querySelector('.confirm-dialog-btn.confirm') as HTMLButtonElement;

    const closeDialog = () => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 200);
    };

    cancelBtn.addEventListener('click', () => {
        closeDialog();
        if (onCancel) onCancel();
    });

    confirmBtn.addEventListener('click', () => {
        closeDialog();
        onConfirm();
    });

    // 點擊背景關閉
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeDialog();
            if (onCancel) onCancel();
        }
    });

    // ESC 鍵關閉
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeDialog();
            if (onCancel) onCancel();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

export function showError(message: string): void {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

export function switchPage(pageId: string): void {
    // 隱藏所有頁面
    document.querySelectorAll('.page').forEach(page => {
        (page as HTMLElement).style.display = 'none';
    });

    // 移除所有導航項目的 active 類別
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // 顯示選中的頁面
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.style.display = 'block';
    }

    // 添加 active 類別到選中的導航項目
    const activeNavItem = document.querySelector(`[data-page="${pageId}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }
} 