(function () {
    const orgId = window.__memberDetailOrgId;
    const memberId = window.__memberDetailMemberId;

    const skeleton = document.getElementById('member-detail-loading-skeleton');
    const notFound = document.getElementById('member-detail-not-found');
    const detailCard = document.getElementById('member-detail');

    const avatarEl = document.getElementById('member-detail-avatar');
    const nameEl = document.getElementById('member-detail-name');
    const roleBadgeEl = document.getElementById('member-detail-role-badge');
    const statusBadgeEl = document.getElementById('member-detail-status-badge');
    const joinedEl = document.getElementById('member-detail-joined');
    const emailEl = document.getElementById('member-detail-email');
    const timezoneEl = document.getElementById('member-detail-timezone');

    const roleFieldGroup = document.getElementById('role-field-group');
    const roleSelect = document.getElementById('member-role-select');
    const guardMessage = document.getElementById('role-change-guard-message');

    const jobTitleFieldGroup = document.getElementById('job-title-field-group');
    const jobTitleInput = document.getElementById('job-title-input');
    const jobTitleError = document.getElementById('field-error-jobTitle');

    const jobTitleReadonlyGroup = document.getElementById('job-title-readonly-group');
    const jobTitleReadonly = document.getElementById('job-title-readonly');

    const saveButton = document.getElementById('job-title-save-button');

    const toastSaved = document.getElementById('toast-member-saved');
    const toastError = document.getElementById('toast-member-detail-error');

    let currentData = null;

    function showToast(el, text) {
        if (text !== undefined) el.textContent = text;
        el.style.display = '';
        setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    function hashColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 55%, 45%)`;
    }

    function formatDate(iso) {
        try {
            const d = new Date(iso);
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch {
            return iso;
        }
    }

    function renderRoleOptions(data) {
        if (!data.canEditRole) {
            roleFieldGroup.style.display = 'none';
            roleSelect.removeAttribute('data-testid');
            return;
        }

        roleFieldGroup.style.display = '';
        roleSelect.setAttribute('data-testid', `member-role-select-${data.id}`);
        roleSelect.innerHTML = data.availableRoles
            .map((r) => `<option value="${r}" ${r === data.role ? 'selected' : ''}>${r}</option>`)
            .join('');

        const guardActive = data.isLastAdmin && data.role === 'admin';
        roleSelect.disabled = guardActive;
        roleSelect.title = guardActive ? 'Organization must retain at least one admin' : '';
        guardMessage.style.display = guardActive ? '' : 'none';
    }

    function renderJobTitle(data) {
        if (data.canEditJobTitle) {
            jobTitleFieldGroup.style.display = '';
            jobTitleReadonlyGroup.style.display = 'none';
            jobTitleInput.setAttribute('data-testid', 'job-title-input');
            jobTitleInput.value = data.jobTitle || '';
            jobTitleError.textContent = '';
        } else {
            jobTitleFieldGroup.style.display = 'none';
            jobTitleReadonlyGroup.style.display = '';
            jobTitleInput.removeAttribute('data-testid');
            jobTitleReadonly.textContent = data.jobTitle || '';
        }
    }

    function renderSaveButtonVisibility(data) {
        saveButton.style.display = (data.canEditRole || data.canEditJobTitle) ? '' : 'none';
    }

    function render(data) {
        currentData = data;

        avatarEl.textContent = data.avatarInitials;
        avatarEl.style.background = hashColor(data.fullName);
        nameEl.textContent = data.fullName;
        roleBadgeEl.textContent = data.role;
        statusBadgeEl.style.display = data.status === 'removed' ? '' : 'none';
        joinedEl.textContent = `Joined ${formatDate(data.joinedAt)}`;
        emailEl.textContent = data.email;
        timezoneEl.textContent = data.timezone;

        renderRoleOptions(data);
        renderJobTitle(data);
        renderSaveButtonVisibility(data);

        skeleton.style.display = 'none';
        notFound.style.display = 'none';
        detailCard.style.display = '';
    }

    async function load() {
        skeleton.style.display = '';
        detailCard.style.display = 'none';
        notFound.style.display = 'none';

        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}`);
            if (res.status === 404) {
                skeleton.style.display = 'none';
                notFound.style.display = '';
                return;
            }
            if (!res.ok) throw new Error('request failed');
            const data = await res.json();
            render(data);
        } catch {
            skeleton.style.display = 'none';
            showToast(toastError, 'Something went wrong. Please try again.');
        }
    }

    function validateJobTitle() {
        if (jobTitleInput.value.length > 100) {
            jobTitleError.textContent = 'Job title must be at most 100 characters';
            return false;
        }
        jobTitleError.textContent = '';
        return true;
    }

    jobTitleInput.addEventListener('input', () => {
        const valid = validateJobTitle();
        saveButton.disabled = !valid;
    });

    saveButton.addEventListener('click', async () => {
        if (!validateJobTitle()) return;

        const role = currentData.canEditRole ? roleSelect.value : currentData.role;
        const jobTitle = currentData.canEditJobTitle ? jobTitleInput.value : currentData.jobTitle;

        saveButton.disabled = true;
        const originalText = saveButton.textContent;
        saveButton.textContent = 'Saving...';

        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, jobTitle }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast(toastSaved);
                await load();
            } else {
                showToast(toastError, data.message || 'Something went wrong. Please try again.');
            }
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = originalText;
        }
    });

    load();
})();
