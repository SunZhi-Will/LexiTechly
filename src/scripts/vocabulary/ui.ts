// Toast 提示功能
export function showToast(message: string, isLoading: boolean = false, isError: boolean = false): void {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
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