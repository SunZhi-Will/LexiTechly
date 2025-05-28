// Toast 提示功能
export function showToast(message: string, isLoading: boolean = false, isError: boolean = false): void {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);

        // 添加 Toast 樣式
        const style = document.createElement('style');
        style.textContent = `
            #toast {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background-color: #323232;
                color: white;
                padding: 12px 24px;
                border-radius: 4px;
                font-size: 14px;
                z-index: 10000;
                display: none;
                align-items: center;
                gap: 8px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            #toast.error {
                background-color: #d32f2f;
            }
        `;
        document.head.appendChild(style);
    }

    toast.className = 'toast' + (isError ? ' error' : '');
    toast.textContent = message;
    toast.style.display = 'flex';
    setTimeout(() => {
        if (toast) {
            toast.style.display = 'none';
        }
    }, 3000);
} 