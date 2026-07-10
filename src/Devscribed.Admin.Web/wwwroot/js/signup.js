(function () {
    const form = document.getElementById('signup-form');
    const banner = document.getElementById('signup-error-banner');
    const submitBtn = document.getElementById('signup-submit');
    const toggleBtn = document.getElementById('password-toggle');
    const passwordInput = document.getElementById('password');

    const fields = {
        orgName: document.getElementById('orgName'),
        firstName: document.getElementById('firstName'),
        lastName: document.getElementById('lastName'),
        email: document.getElementById('email'),
        password: passwordInput,
    };

    const validators = {
        orgName(v) {
            const t = v.trim();
            if (!t) return 'Organization name is required';
            if (t.length > 100) return 'Organization name must be at most 100 characters';
            return null;
        },
        firstName(v) { return validateName(v, 'First name'); },
        lastName(v) { return validateName(v, 'Last name'); },
        email(v) {
            if (!v) return 'Email is required';
            if (v.length > 254) return 'Email must be at most 254 characters';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
            return null;
        },
        password(v) {
            if (!v) return 'Password is required';
            if (v.length < 8) return 'Password must be at least 8 characters';
            if (v.length > 128) return 'Password must be at most 128 characters';
            if (!/[a-zA-Z]/.test(v)) return 'Password must contain at least one letter';
            if (!/\d/.test(v)) return 'Password must contain at least one digit';
            return null;
        },
    };

    function validateName(v, label) {
        const t = v.trim();
        if (!t) return label + ' is required';
        if (t.length > 50) return label + ' must be at most 50 characters';
        if (!/^[\p{L}\s'\-]+$/u.test(t)) return label + ' may contain only letters, hyphens, apostrophes, and spaces';
        return null;
    }

    const touched = {};

    function showFieldError(name, msg) {
        const el = document.getElementById('field-error-' + name);
        const input = fields[name];
        if (msg) {
            el.textContent = msg;
            input.classList.add('input-error');
        } else {
            el.textContent = '';
            input.classList.remove('input-error');
        }
    }

    function validateField(name) {
        const msg = validators[name](fields[name].value);
        showFieldError(name, msg);
        return !msg;
    }

    function updateSubmitState() {
        const allValid = Object.keys(fields).every(name => !validators[name](fields[name].value));
        submitBtn.disabled = !allValid;
    }

    Object.keys(fields).forEach(name => {
        fields[name].addEventListener('blur', () => {
            touched[name] = true;
            validateField(name);
            updateSubmitState();
        });
        fields[name].addEventListener('input', () => {
            if (banner.style.display !== 'none') {
                banner.style.display = 'none';
                banner.textContent = '';
            }
            if (touched[name]) {
                validateField(name);
            }
            updateSubmitState();
        });
    });

    toggleBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        toggleBtn.querySelector('.eye-icon').style.display = isPassword ? 'none' : '';
        toggleBtn.querySelector('.eye-off-icon').style.display = isPassword ? '' : 'none';
        toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        let hasError = false;
        Object.keys(fields).forEach(name => {
            touched[name] = true;
            if (!validateField(name)) hasError = true;
        });
        if (hasError) return;

        submitBtn.disabled = true;
        Object.values(fields).forEach(f => f.readOnly = true);

        try {
            const res = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orgName: fields.orgName.value,
                    firstName: fields.firstName.value,
                    lastName: fields.lastName.value,
                    email: fields.email.value,
                    password: fields.password.value,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
            });

            if (res.ok) {
                window.location.href = '/members';
                return;
            }

            const data = await res.json();

            if (data.errors) {
                Object.entries(data.errors).forEach(([name, msg]) => {
                    showFieldError(name, msg);
                });
            } else if (data.message) {
                banner.textContent = data.message;
                banner.style.display = '';
            }
        } catch {
            banner.textContent = 'Something went wrong. Please try again.';
            banner.style.display = '';
        } finally {
            Object.values(fields).forEach(f => f.readOnly = false);
            updateSubmitState();
        }
    });
})();
