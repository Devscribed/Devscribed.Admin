(function () {
    const errorMessage = document.getElementById('reset-error-message');
    const form = document.getElementById('reset-form');
    const successMessage = document.getElementById('reset-success-message');
    const loginLinkWrapper = document.getElementById('reset-login-link-wrapper');
    const submitBtn = document.getElementById('reset-submit');
    const passwordInput = document.getElementById('password');
    const passwordConfirmInput = document.getElementById('passwordConfirm');
    const fieldErrorPassword = document.getElementById('field-error-password');
    const fieldErrorPasswordConfirm = document.getElementById('field-error-password-confirm');

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    function showInvalidTokenState() {
        form.style.display = 'none';
        errorMessage.textContent = 'This reset link is invalid or has expired';
        errorMessage.style.display = '';
        loginLinkWrapper.style.display = '';
    }

    function showFormState() {
        form.style.display = '';
        errorMessage.style.display = 'none';
        loginLinkWrapper.style.display = 'none';
    }

    function validatePasswordPolicy(value) {
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (value.length > 128) return 'Password must be at most 128 characters';
        if (!/[a-zA-Z]/.test(value)) return 'Password must contain at least one letter';
        if (!/\d/.test(value)) return 'Password must contain at least one digit';
        return null;
    }

    async function init() {
        if (!token) {
            showInvalidTokenState();
            return;
        }

        try {
            const res = await fetch(`/api/reset-password/validate?token=${encodeURIComponent(token)}`);
            const data = await res.json();
            if (data.valid) {
                showFormState();
            } else {
                showInvalidTokenState();
            }
        } catch {
            showInvalidTokenState();
        }
    }

    [passwordInput, passwordConfirmInput].forEach((input) => {
        input.addEventListener('input', () => {
            errorMessage.style.display = 'none';
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        fieldErrorPassword.textContent = '';
        fieldErrorPasswordConfirm.textContent = '';

        const passwordError = validatePasswordPolicy(passwordInput.value);
        if (passwordError) {
            fieldErrorPassword.textContent = passwordError;
            return;
        }

        if (passwordInput.value !== passwordConfirmInput.value) {
            fieldErrorPasswordConfirm.textContent = 'Passwords do not match';
            return;
        }

        submitBtn.disabled = true;

        try {
            const res = await fetch('/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    password: passwordInput.value,
                    passwordConfirmation: passwordConfirmInput.value,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                form.style.display = 'none';
                successMessage.style.display = '';
                loginLinkWrapper.style.display = '';
                return;
            }

            if (data.message === 'Passwords do not match') {
                fieldErrorPasswordConfirm.textContent = data.message;
            } else if (data.message === 'This reset link is invalid or has expired') {
                showInvalidTokenState();
            } else {
                fieldErrorPassword.textContent = data.message;
            }
        } catch {
            errorMessage.textContent = 'Something went wrong. Please try again.';
            errorMessage.style.display = '';
        } finally {
            submitBtn.disabled = false;
        }
    });

    init();
})();
