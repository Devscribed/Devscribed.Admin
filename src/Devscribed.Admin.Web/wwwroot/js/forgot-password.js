(function () {
    const form = document.getElementById('forgot-form');
    const submitBtn = document.getElementById('forgot-submit');
    const emailInput = document.getElementById('email');
    const confirmationMessage = document.getElementById('forgot-confirmation-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        submitBtn.disabled = true;

        try {
            await fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput.value }),
            });
        } finally {
            form.style.display = 'none';
            confirmationMessage.textContent = 'If an account exists, a reset link has been sent.';
            confirmationMessage.style.display = '';
        }
    });
})();
