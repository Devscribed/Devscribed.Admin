(function () {
    const skeleton = document.getElementById('account-settings-loading-skeleton');
    const content = document.getElementById('account-settings-content');
    const serverError = document.getElementById('account-server-error');

    const form = document.getElementById('account-settings-form');
    const firstNameInput = document.getElementById('edit-first-name-input');
    const lastNameInput = document.getElementById('edit-last-name-input');
    const phoneCountrySelect = document.getElementById('edit-phone-country-select');
    const phoneNumberInput = document.getElementById('edit-phone-number-input');
    const timezoneSelect = document.getElementById('edit-timezone-select');
    const firstDaySelect = document.getElementById('edit-first-day-select');
    const saveButton = document.getElementById('account-save-button');

    const fieldErrors = {
        firstName: document.getElementById('field-error-firstName'),
        lastName: document.getElementById('field-error-lastName'),
        phoneCountryCode: document.getElementById('field-error-phoneCountryCode'),
        phoneNumber: document.getElementById('field-error-phoneNumber'),
        timezone: document.getElementById('field-error-timezone'),
        firstDayOfWeek: document.getElementById('field-error-firstDayOfWeek'),
    };

    const toastSaved = document.getElementById('toast-account-saved');

    const changeEmailOpenButton = document.getElementById('change-email-open-button');
    const changeEmailOverlay = document.getElementById('change-email-modal-overlay');
    const changeEmailCloseButton = document.getElementById('change-email-close-button');
    const changeEmailCurrent = document.getElementById('change-email-current');
    const changeEmailForm = document.getElementById('change-email-form');
    const changeEmailNewInput = document.getElementById('change-email-new-input');
    const changeEmailSubmitButton = document.getElementById('change-email-submit-button');
    const changeEmailError = document.getElementById('change-email-error');
    const changeEmailFieldError = document.getElementById('field-error-newEmail');
    const changeEmailConfirmation = document.getElementById('change-email-confirmation-message');

    const changePasswordOpenButton = document.getElementById('change-password-open-button');
    const changePasswordOverlay = document.getElementById('change-password-modal-overlay');
    const changePasswordCloseButton = document.getElementById('change-password-close-button');
    const changePasswordForm = document.getElementById('change-password-form');
    const currentPasswordInput = document.getElementById('change-password-current-input');
    const newPasswordInput = document.getElementById('change-password-new-input');
    const confirmPasswordInput = document.getElementById('change-password-confirm-input');
    const changePasswordSubmitButton = document.getElementById('change-password-submit-button');
    const changePasswordError = document.getElementById('change-password-error');
    const changePasswordSuccess = document.getElementById('change-password-success-message');
    const changePasswordFieldErrors = {
        currentPassword: document.getElementById('field-error-currentPassword'),
        newPassword: document.getElementById('field-error-newPassword'),
        passwordConfirmation: document.getElementById('field-error-passwordConfirmation'),
    };

    let currentEmail = '';

    function showToast(el) {
        el.style.display = '';
        setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    function clearFieldError(el) {
        el.textContent = '';
    }

    // --- Edit Information validation (mirrors server-side rules) ---

    const namePattern = /^[\p{L}\s'-]+$/u;

    function validateName(value, label) {
        const trimmed = (value || '').trim();
        if (!trimmed) return `${label} is required`;
        if (trimmed.length > 50) return `${label} must be at most 50 characters`;
        if (!namePattern.test(trimmed)) return `${label} may contain only letters, hyphens, apostrophes, and spaces`;
        return null;
    }

    function validateFirstName() {
        const error = validateName(firstNameInput.value, 'First name');
        fieldErrors.firstName.textContent = error || '';
        return !error;
    }

    function validateLastName() {
        const error = validateName(lastNameInput.value, 'Last name');
        fieldErrors.lastName.textContent = error || '';
        return !error;
    }

    function phoneDigitsValid(countryCode, phoneNumber) {
        const digits = (phoneNumber.match(/\d/g) || []).join('');
        if (digits.length === 0) return false;
        const nanpLengths = { US: 10, CA: 10, GB: 10 };
        const nanp = ['US', 'CA'];
        const expected = nanpLengths[countryCode];
        if (expected !== undefined) {
            let d = digits;
            if (nanp.includes(countryCode) && d.length === expected + 1 && d[0] === '1') {
                d = d.slice(1);
            }
            return d.length === expected;
        }
        return digits.length >= 7 && digits.length <= 15;
    }

    function validatePhone() {
        const phoneNumber = phoneNumberInput.value.trim();
        const countryCode = phoneCountrySelect.value;

        if (phoneNumber && !countryCode) {
            fieldErrors.phoneCountryCode.textContent = 'Select a country code';
            fieldErrors.phoneNumber.textContent = '';
            return false;
        }
        fieldErrors.phoneCountryCode.textContent = '';

        if (!phoneNumber) {
            fieldErrors.phoneNumber.textContent = '';
            return true;
        }

        if (!phoneDigitsValid(countryCode, phoneNumber)) {
            fieldErrors.phoneNumber.textContent = 'Enter a valid phone number';
            return false;
        }
        fieldErrors.phoneNumber.textContent = '';
        return true;
    }

    function validateTimezone() {
        const error = timezoneSelect.value ? null : 'Timezone is required';
        fieldErrors.timezone.textContent = error || '';
        return !error;
    }

    function validateFirstDayOfWeek() {
        const value = firstDaySelect.value;
        const error = (value === 'Monday' || value === 'Sunday') ? null : 'Invalid first day of week';
        fieldErrors.firstDayOfWeek.textContent = error || '';
        return !error;
    }

    function validateAllEditInformation() {
        const results = [
            validateFirstName(),
            validateLastName(),
            validatePhone(),
            validateTimezone(),
            validateFirstDayOfWeek(),
        ];
        return results.every(Boolean);
    }

    firstNameInput.addEventListener('blur', validateFirstName);
    lastNameInput.addEventListener('blur', validateLastName);
    phoneNumberInput.addEventListener('blur', validatePhone);
    phoneCountrySelect.addEventListener('change', validatePhone);
    timezoneSelect.addEventListener('change', validateTimezone);
    firstDaySelect.addEventListener('change', validateFirstDayOfWeek);

    [firstNameInput, lastNameInput, phoneNumberInput].forEach((input) => {
        input.addEventListener('input', () => {
            serverError.style.display = 'none';
        });
    });

    async function loadSettings() {
        try {
            const res = await fetch('/api/account/settings');
            if (!res.ok) throw new Error('failed');
            const data = await res.json();

            currentEmail = data.email;
            firstNameInput.value = data.firstName || '';
            lastNameInput.value = data.lastName || '';
            phoneCountrySelect.value = data.phoneCountryCode || '';
            phoneNumberInput.value = data.phoneNumber || '';
            timezoneSelect.value = data.timezone || '';
            firstDaySelect.value = data.firstDayOfWeek || 'Monday';

            changeEmailCurrent.textContent = `Current email: ${currentEmail}`;

            skeleton.style.display = 'none';
            content.style.display = '';
        } catch {
            skeleton.style.display = 'none';
            serverError.textContent = 'Something went wrong. Please try again.';
            serverError.style.display = '';
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        serverError.style.display = 'none';

        if (!validateAllEditInformation()) return;

        saveButton.disabled = true;
        const originalText = saveButton.textContent;
        saveButton.textContent = 'Saving...';

        try {
            const res = await fetch('/api/account/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: firstNameInput.value.trim(),
                    lastName: lastNameInput.value.trim(),
                    phoneCountryCode: phoneCountrySelect.value || null,
                    phoneNumber: phoneNumberInput.value.trim() || null,
                    timezone: timezoneSelect.value,
                    firstDayOfWeek: firstDaySelect.value,
                }),
            });

            if (res.ok) {
                showToast(toastSaved);
            } else if (res.status >= 400 && res.status < 500) {
                const data = await res.json().catch(() => ({}));
                const errors = data.errors || {};
                Object.keys(fieldErrors).forEach((key) => {
                    fieldErrors[key].textContent = errors[key] || '';
                });
            } else {
                throw new Error('server error');
            }
        } catch {
            serverError.textContent = 'Something went wrong. Please try again.';
            serverError.style.display = '';
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = originalText;
        }
    });

    // --- Change email modal ---

    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    function validateNewEmail() {
        const value = changeEmailNewInput.value;
        let error = null;
        if (!value) error = 'Email is required';
        else if (value.length > 254) error = 'Email must be at most 254 characters';
        else if (!emailPattern.test(value)) error = 'Enter a valid email address';

        changeEmailFieldError.textContent = error || '';
        changeEmailSubmitButton.disabled = !!error;
        return !error;
    }

    function resetChangeEmailModal() {
        changeEmailForm.style.display = '';
        changeEmailForm.reset();
        changeEmailFieldError.textContent = '';
        changeEmailError.style.display = 'none';
        changeEmailConfirmation.style.display = 'none';
        changeEmailSubmitButton.disabled = true;
    }

    changeEmailOpenButton.addEventListener('click', () => {
        resetChangeEmailModal();
        changeEmailOverlay.style.display = '';
    });

    changeEmailCloseButton.addEventListener('click', () => {
        changeEmailOverlay.style.display = 'none';
    });

    changeEmailNewInput.addEventListener('blur', validateNewEmail);
    changeEmailNewInput.addEventListener('input', () => {
        changeEmailError.style.display = 'none';
        validateNewEmail();
    });

    changeEmailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateNewEmail()) return;

        changeEmailSubmitButton.disabled = true;
        const originalText = changeEmailSubmitButton.textContent;
        changeEmailSubmitButton.textContent = 'Sending...';

        try {
            const res = await fetch('/api/account/change-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newEmail: changeEmailNewInput.value }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                changeEmailForm.style.display = 'none';
                changeEmailConfirmation.textContent = `A confirmation link has been sent to ${changeEmailNewInput.value}. Please check your inbox.`;
                changeEmailConfirmation.style.display = '';
            } else {
                changeEmailError.textContent = data.message || 'Something went wrong. Please try again.';
                changeEmailError.style.display = '';
                changeEmailSubmitButton.disabled = false;
                changeEmailSubmitButton.textContent = originalText;
            }
        } catch {
            changeEmailError.textContent = 'Something went wrong. Please try again.';
            changeEmailError.style.display = '';
            changeEmailSubmitButton.disabled = false;
            changeEmailSubmitButton.textContent = originalText;
        }
    });

    // --- Change password modal ---

    function validatePasswordPolicy(value) {
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (value.length > 128) return 'Password must be at most 128 characters';
        if (!/[a-zA-Z]/.test(value)) return 'Password must contain at least one letter';
        if (!/\d/.test(value)) return 'Password must contain at least one digit';
        return null;
    }

    function validateCurrentPassword() {
        const error = currentPasswordInput.value ? null : 'Current password is required';
        changePasswordFieldErrors.currentPassword.textContent = error || '';
        return !error;
    }

    function validateNewPasswordField() {
        const error = validatePasswordPolicy(newPasswordInput.value);
        changePasswordFieldErrors.newPassword.textContent = error || '';
        return !error;
    }

    function validateConfirmPassword() {
        let error = null;
        if (!confirmPasswordInput.value) error = 'Please confirm your new password';
        else if (confirmPasswordInput.value !== newPasswordInput.value) error = 'Passwords do not match';
        changePasswordFieldErrors.passwordConfirmation.textContent = error || '';
        return !error;
    }

    function updateChangePasswordSubmitState() {
        const allFilled = currentPasswordInput.value && newPasswordInput.value && confirmPasswordInput.value;
        const allValid = !validatePasswordPolicy(newPasswordInput.value) && newPasswordInput.value === confirmPasswordInput.value;
        changePasswordSubmitButton.disabled = !(allFilled && allValid);
    }

    currentPasswordInput.addEventListener('blur', validateCurrentPassword);
    newPasswordInput.addEventListener('blur', validateNewPasswordField);
    confirmPasswordInput.addEventListener('blur', validateConfirmPassword);

    [currentPasswordInput, newPasswordInput, confirmPasswordInput].forEach((input) => {
        input.addEventListener('input', () => {
            changePasswordError.style.display = 'none';
            updateChangePasswordSubmitState();
        });
    });

    function resetChangePasswordModal() {
        changePasswordForm.style.display = '';
        changePasswordForm.reset();
        Object.values(changePasswordFieldErrors).forEach((el) => { el.textContent = ''; });
        changePasswordError.style.display = 'none';
        changePasswordSuccess.style.display = 'none';
        changePasswordSubmitButton.disabled = true;
    }

    changePasswordOpenButton.addEventListener('click', () => {
        resetChangePasswordModal();
        changePasswordOverlay.style.display = '';
    });

    changePasswordCloseButton.addEventListener('click', () => {
        changePasswordOverlay.style.display = 'none';
    });

    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const valid = [validateCurrentPassword(), validateNewPasswordField(), validateConfirmPassword()].every(Boolean);
        if (!valid) return;

        changePasswordSubmitButton.disabled = true;
        const originalText = changePasswordSubmitButton.textContent;
        changePasswordSubmitButton.textContent = 'Changing...';

        try {
            const res = await fetch('/api/account/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: currentPasswordInput.value,
                    newPassword: newPasswordInput.value,
                    passwordConfirmation: confirmPasswordInput.value,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                changePasswordForm.style.display = 'none';
                changePasswordSuccess.style.display = '';
            } else {
                changePasswordError.textContent = data.message || 'Something went wrong. Please try again.';
                changePasswordError.style.display = '';
                changePasswordSubmitButton.disabled = false;
                changePasswordSubmitButton.textContent = originalText;
            }
        } catch {
            changePasswordError.textContent = 'Something went wrong. Please try again.';
            changePasswordError.style.display = '';
            changePasswordSubmitButton.disabled = false;
            changePasswordSubmitButton.textContent = originalText;
        }
    });

    loadSettings();
})();
