(function () {
    const form = document.getElementById('login-form');
    const errorMessage = document.getElementById('login-error-message');
    const submitBtn = document.getElementById('login-submit');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    function clearError() {
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = '';
    }

    [emailInput, passwordInput].forEach((input) => {
        input.addEventListener('input', clearError);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        submitBtn.disabled = true;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailInput.value,
                    password: passwordInput.value,
                }),
            });

            if (res.ok) {
                window.location.href = '/members';
                return;
            }

            const data = await res.json();
            showError(data.message || 'Invalid email or password');
        } catch {
            showError('Something went wrong. Please try again.');
        } finally {
            submitBtn.disabled = false;
        }
    });
})();
