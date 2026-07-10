(function () {
    const loading = document.getElementById('confirm-email-loading');
    const successMessage = document.getElementById('confirm-email-success-message');
    const errorMessage = document.getElementById('confirm-email-error');
    const loginLinkWrapper = document.getElementById('confirm-email-login-link-wrapper');

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    async function init() {
        if (!token) {
            showError('This confirmation link is no longer valid');
            return;
        }

        try {
            const res = await fetch('/api/account/confirm-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });
            const data = await res.json().catch(() => ({}));

            loading.style.display = 'none';

            if (res.ok) {
                successMessage.style.display = '';
                loginLinkWrapper.style.display = '';
            } else {
                showError(data.message || 'This confirmation link is no longer valid');
            }
        } catch {
            loading.style.display = 'none';
            showError('Something went wrong. Please try again.');
        }
    }

    function showError(message) {
        loading.style.display = 'none';
        errorMessage.textContent = message;
        errorMessage.style.display = '';
        loginLinkWrapper.style.display = 'none';
    }

    init();
})();
