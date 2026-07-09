(function () {
    const form = document.getElementById('login-form');
    const banner = document.getElementById('login-error-banner');
    const submitBtn = document.getElementById('login-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        banner.style.display = 'none';
        submitBtn.disabled = true;

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (res.ok) {
                window.location.href = '/members';
                return;
            }

            const data = await res.json();
            banner.textContent = data.message || 'Invalid email or password';
            banner.style.display = '';
        } catch {
            banner.textContent = 'Something went wrong. Please try again.';
            banner.style.display = '';
        } finally {
            submitBtn.disabled = false;
        }
    });
})();
