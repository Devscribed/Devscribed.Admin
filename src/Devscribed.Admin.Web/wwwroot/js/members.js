(function () {
    const openButton = document.getElementById('invite-open-button');
    const closeButton = document.getElementById('invite-close-button');
    const overlay = document.getElementById('invite-modal-overlay');
    const form = document.getElementById('invite-form');
    const emailInput = document.getElementById('invite-email');
    const roleSelect = document.getElementById('invite-role');
    const submitBtn = document.getElementById('invite-submit-button');
    const errorMessage = document.getElementById('invite-error-message');
    const fieldErrorEmail = document.getElementById('field-error-email');
    const toast = document.getElementById('toast-invite-sent');

    function emailIsValid(value) {
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
    }

    function updateSubmitState() {
        const value = emailInput.value.trim();
        submitBtn.disabled = value.length === 0 || !emailIsValid(value);
    }

    function resetForm() {
        form.reset();
        fieldErrorEmail.textContent = '';
        errorMessage.style.display = 'none';
        updateSubmitState();
    }

    function openModal() {
        resetForm();
        overlay.style.display = '';
    }

    function closeModal() {
        overlay.style.display = 'none';
    }

    if (openButton) openButton.addEventListener('click', openModal);
    if (closeButton) closeButton.addEventListener('click', closeModal);

    emailInput.addEventListener('input', () => {
        errorMessage.style.display = 'none';
        updateSubmitState();
    });

    emailInput.addEventListener('blur', () => {
        const value = emailInput.value.trim();
        if (value.length === 0) {
            fieldErrorEmail.textContent = 'Email is required';
        } else if (!emailIsValid(value)) {
            fieldErrorEmail.textContent = 'Enter a valid email address';
        } else {
            fieldErrorEmail.textContent = '';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const value = emailInput.value.trim();
        if (!emailIsValid(value)) {
            fieldErrorEmail.textContent = value.length === 0 ? 'Email is required' : 'Enter a valid email address';
            return;
        }

        submitBtn.disabled = true;
        emailInput.readOnly = true;
        roleSelect.disabled = true;

        try {
            const res = await fetch('/api/invitations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: value, role: roleSelect.value }),
            });

            const data = await res.json();

            if (res.ok) {
                closeModal();
                toast.textContent = `Invitation sent to ${value}`;
                toast.style.display = '';
                setTimeout(() => { toast.style.display = 'none'; }, 4000);
                return;
            }

            errorMessage.textContent = data.message || 'Something went wrong. Please try again.';
            errorMessage.style.display = '';
        } catch {
            errorMessage.textContent = 'Something went wrong. Please try again.';
            errorMessage.style.display = '';
        } finally {
            submitBtn.disabled = false;
            emailInput.readOnly = false;
            roleSelect.disabled = false;
            updateSubmitState();
        }
    });
})();
