(function () {
    const errorMessage = document.getElementById('accept-invite-error');
    const content = document.getElementById('accept-invite-content');
    const orgNameEl = document.getElementById('accept-invite-org-name');
    const roleEl = document.getElementById('accept-invite-role');
    const greeting = document.getElementById('accept-invite-greeting');
    const form = document.getElementById('accept-invite-form');
    const firstNameGroup = document.getElementById('accept-first-name-group');
    const lastNameGroup = document.getElementById('accept-last-name-group');
    const firstNameInput = document.getElementById('accept-first-name');
    const lastNameInput = document.getElementById('accept-last-name');
    const passwordInput = document.getElementById('accept-password');
    const passwordToggle = document.getElementById('accept-password-toggle');
    const fieldErrorFirstName = document.getElementById('field-error-firstName');
    const fieldErrorLastName = document.getElementById('field-error-lastName');
    const fieldErrorPassword = document.getElementById('field-error-password');
    const orgSwitchWarning = document.getElementById('accept-org-switch-warning');
    const orgSwitchConfirmGroup = document.getElementById('accept-org-switch-confirm-group');
    const orgSwitchConfirm = document.getElementById('accept-org-switch-confirm');
    const submitBtn = document.getElementById('accept-submit-button');

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    let accountExists = false;
    let orgSwitch = false;

    function validateName(value, label) {
        const trimmed = (value || '').trim();
        if (!trimmed) return `${label} is required`;
        if (trimmed.length > 50) return `${label} must be at most 50 characters`;
        if (!/^[\p{L}\s'-]+$/u.test(trimmed)) return `${label} may contain only letters, hyphens, apostrophes, and spaces`;
        return null;
    }

    function validatePassword(value) {
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (value.length > 128) return 'Password must be at most 128 characters';
        if (!/[a-zA-Z]/.test(value)) return 'Password must contain at least one letter';
        if (!/\d/.test(value)) return 'Password must contain at least one digit';
        return null;
    }

    function showTokenError(message) {
        content.style.display = 'none';
        errorMessage.textContent = message;
        errorMessage.style.display = '';
    }

    function updateSubmitState() {
        if (orgSwitch && !orgSwitchConfirm.checked) {
            submitBtn.disabled = true;
            return;
        }

        if (accountExists) {
            submitBtn.disabled = passwordInput.value.length === 0;
            return;
        }

        const valid = !validateName(firstNameInput.value, 'First name')
            && !validateName(lastNameInput.value, 'Last name')
            && !validatePassword(passwordInput.value);
        submitBtn.disabled = !valid;
    }

    async function init() {
        if (!token) {
            showTokenError('This invitation is no longer valid');
            return;
        }

        try {
            const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/validate`);
            const data = await res.json();

            if (!res.ok) {
                showTokenError(data.message || 'This invitation is no longer valid');
                return;
            }

            orgNameEl.textContent = `You've been invited to join ${data.organizationName}`;
            roleEl.textContent = `as a ${data.role}`;
            accountExists = data.accountExists;
            orgSwitch = data.orgSwitch;

            if (accountExists) {
                greeting.style.display = '';
                firstNameGroup.style.display = 'none';
                lastNameGroup.style.display = 'none';
            } else {
                greeting.style.display = 'none';
                firstNameGroup.style.display = '';
                lastNameGroup.style.display = '';
            }

            if (orgSwitch) {
                let text = `Accepting this invitation will remove you from ${data.oldOrganizationName}. All your data in that organization will be permanently deleted.`;
                if (data.lastAdmin) {
                    text += ` You are the last administrator of ${data.oldOrganizationName}. Leaving will mean that organization has no administrator.`;
                }
                orgSwitchWarning.textContent = text;
                orgSwitchWarning.style.display = '';
                orgSwitchConfirmGroup.style.display = '';
            }

            content.style.display = '';
            updateSubmitState();
        } catch {
            showTokenError('Something went wrong. Please try again.');
        }
    }

    firstNameInput.addEventListener('blur', () => {
        fieldErrorFirstName.textContent = validateName(firstNameInput.value, 'First name') || '';
        updateSubmitState();
    });
    lastNameInput.addEventListener('blur', () => {
        fieldErrorLastName.textContent = validateName(lastNameInput.value, 'Last name') || '';
        updateSubmitState();
    });
    passwordInput.addEventListener('blur', () => {
        if (!accountExists) {
            fieldErrorPassword.textContent = validatePassword(passwordInput.value) || '';
        }
        updateSubmitState();
    });

    [firstNameInput, lastNameInput, passwordInput].forEach((input) => {
        input.addEventListener('input', () => {
            errorMessage.style.display = 'none';
            updateSubmitState();
        });
    });

    orgSwitchConfirm.addEventListener('change', updateSubmitState);

    passwordToggle.addEventListener('click', () => {
        const showing = passwordInput.type === 'text';
        passwordInput.type = showing ? 'password' : 'text';
        passwordToggle.textContent = showing ? 'Show' : 'Hide';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        fieldErrorFirstName.textContent = '';
        fieldErrorLastName.textContent = '';
        fieldErrorPassword.textContent = '';
        errorMessage.style.display = 'none';

        if (!accountExists) {
            const firstNameError = validateName(firstNameInput.value, 'First name');
            const lastNameError = validateName(lastNameInput.value, 'Last name');
            const passwordError = validatePassword(passwordInput.value);
            if (firstNameError || lastNameError || passwordError) {
                fieldErrorFirstName.textContent = firstNameError || '';
                fieldErrorLastName.textContent = lastNameError || '';
                fieldErrorPassword.textContent = passwordError || '';
                return;
            }
        }

        submitBtn.disabled = true;
        firstNameInput.readOnly = true;
        lastNameInput.readOnly = true;
        passwordInput.readOnly = true;

        try {
            const payload = {
                token,
                password: passwordInput.value,
                orgSwitchConfirmed: orgSwitch ? orgSwitchConfirm.checked : false,
            };
            if (!accountExists) {
                payload.firstName = firstNameInput.value.trim();
                payload.lastName = lastNameInput.value.trim();
                payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            }

            const res = await fetch('/api/invitations/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (res.ok) {
                window.location.href = data.redirectTo || '/members';
                return;
            }

            if (res.status === 409) {
                orgSwitch = true;
                orgSwitchWarning.textContent = buildOrgSwitchText(data.oldOrganizationName, data.lastAdmin);
                orgSwitchWarning.style.display = '';
                orgSwitchConfirmGroup.style.display = '';
                return;
            }

            if (data.errors) {
                if (data.errors.firstName) fieldErrorFirstName.textContent = data.errors.firstName;
                if (data.errors.lastName) fieldErrorLastName.textContent = data.errors.lastName;
                if (data.errors.password) fieldErrorPassword.textContent = data.errors.password;
                return;
            }

            if (data.message === 'This invitation has expired' || data.message === 'This invitation is no longer valid') {
                showTokenError(data.message);
                return;
            }

            if (data.message === 'Incorrect password') {
                fieldErrorPassword.textContent = data.message;
                return;
            }

            errorMessage.textContent = data.message || 'Something went wrong. Please try again.';
            errorMessage.style.display = '';
        } catch {
            errorMessage.textContent = 'Something went wrong. Please try again.';
            errorMessage.style.display = '';
        } finally {
            firstNameInput.readOnly = false;
            lastNameInput.readOnly = false;
            passwordInput.readOnly = false;
            updateSubmitState();
        }
    });

    function buildOrgSwitchText(oldOrganizationName, lastAdmin) {
        let text = `Accepting this invitation will remove you from ${oldOrganizationName}. All your data in that organization will be permanently deleted.`;
        if (lastAdmin) {
            text += ` You are the last administrator of ${oldOrganizationName}. Leaving will mean that organization has no administrator.`;
        }
        return text;
    }

    init();
})();
