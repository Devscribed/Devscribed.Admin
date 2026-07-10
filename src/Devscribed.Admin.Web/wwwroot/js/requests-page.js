(function () {
    const orgId = window.__requestsOrgId;

    const filterSelect = document.getElementById('requests-status-filter');
    const skeleton = document.getElementById('requests-loading-skeleton');
    const emptyState = document.getElementById('requests-empty-state');
    const list = document.getElementById('requests-list');
    const badge = document.getElementById('sidebar-requests-badge');

    const toastApproved = document.getElementById('toast-request-approved');
    const toastRejected = document.getElementById('toast-request-rejected');
    const toastCancelled = document.getElementById('toast-request-cancelled');
    const toastError = document.getElementById('toast-requests-error');

    const rejectModalOverlay = document.getElementById('vacation-reject-modal-overlay');
    const rejectCloseButton = document.getElementById('vacation-reject-close-button');
    const rejectCancelButton = document.getElementById('vacation-reject-cancel-btn');
    const rejectForm = document.getElementById('vacation-reject-form');
    const rejectSummary = document.getElementById('vacation-reject-summary');
    const rejectCommentInput = document.getElementById('vacation-reject-comment-input');
    const rejectConfirmBtn = document.getElementById('vacation-reject-confirm-btn');
    const rejectCommentError = document.getElementById('field-error-reviewerComment');

    let lastRequests = [];
    let rejectRequestId = null;
    let rejectMemberId = null;
    let pinnedIds = new Set();

    function showToast(el, text) {
        if (text !== undefined) el.textContent = text;
        el.style.display = '';
        setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    function formatDateRange(startStr, endStr) {
        const start = new Date(startStr + 'T00:00:00Z');
        const end = new Date(endStr + 'T00:00:00Z');
        const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        return `${fmt(start)} – ${fmt(end)}`;
    }

    function hashColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 55%, 45%)`;
    }

    const statusBadges = {
        pending: { label: '● Pending', className: 'status-pending' },
        approved: { label: '✓ Approved', className: 'status-approved' },
        rejected: { label: '✗ Rejected', className: 'status-rejected' },
        cancelled: { label: '○ Cancelled', className: 'status-cancelled' },
    };

    function renderCard(r) {
        const card = document.createElement('div');
        card.className = 'requests-card';
        card.dataset.testid = `requests-card-${r.id}`;

        const badgeInfo = statusBadges[r.status] || { label: r.status, className: '' };
        const fullName = `${r.member.firstName} ${r.member.lastName}`;

        let actionsHtml = '';
        if (r.status === 'pending' && !r.isOwnRequest) {
            actionsHtml = `
                <div class="requests-card-actions">
                    <button type="button" data-testid="requests-card-approve-${r.id}" data-action="approve" data-id="${r.id}" data-member="${r.member.membershipId}">Approve</button>
                    <button type="button" data-testid="requests-card-reject-${r.id}" data-action="reject" data-id="${r.id}" data-member="${r.member.membershipId}">Reject</button>
                </div>`;
        } else if (r.status === 'approved') {
            actionsHtml = `
                <div class="requests-card-actions">
                    <button type="button" data-testid="requests-card-cancel-${r.id}" data-action="cancel" data-id="${r.id}" data-member="${r.member.membershipId}">Cancel</button>
                </div>`;
        }

        const reviewerCommentHtml = (r.status === 'rejected' && r.reviewerComment)
            ? `<div data-testid="requests-card-reviewer-comment-${r.id}">"${r.reviewerComment}"</div>`
            : '';

        const reviewedByHtml = (r.reviewedBy)
            ? `<div data-testid="requests-card-reviewed-by-${r.id}">Reviewed by ${r.reviewedBy}</div>`
            : '';

        card.innerHTML = `
            <div class="requests-card-member-row">
                <div class="avatar-circle" data-testid="requests-card-avatar-${r.id}" style="width:40px;height:40px;font-size:1rem;background:${hashColor(fullName)};">${r.member.initials}</div>
                <a href="/org/${orgId}/members/${r.member.membershipId}" data-testid="requests-card-member-name-${r.id}">${fullName}</a>
            </div>
            <div data-testid="requests-card-dates-${r.id}">${formatDateRange(r.startDate, r.endDate)}</div>
            <div data-testid="requests-card-days-${r.id}">${r.workingDays} working days</div>
            <div data-testid="requests-card-balance-${r.id}">${r.memberBalance.availableDays} days available</div>
            <div data-testid="requests-card-deduction-${r.id}">$${Number(r.deductionAmount).toFixed(2)}</div>
            <div data-testid="requests-card-status-${r.id}" class="${badgeInfo.className}">${badgeInfo.label}</div>
            ${actionsHtml}
            ${reviewerCommentHtml}
            ${reviewedByHtml}
        `;
        return card;
    }

    function render(data, status) {
        lastRequests = data.requests || [];

        if (badge) {
            if (data.pendingCount > 0) {
                badge.textContent = String(data.pendingCount);
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        }

        list.innerHTML = '';

        if (lastRequests.length === 0) {
            list.style.display = 'none';
            emptyState.style.display = '';
            emptyState.textContent = status === 'pending' ? 'No pending requests.' : `No ${status} requests.`;
        } else {
            emptyState.style.display = 'none';
            list.style.display = '';
            lastRequests.forEach((r) => list.appendChild(renderCard(r)));
        }

        skeleton.style.display = 'none';
    }

    async function load() {
        skeleton.style.display = '';
        emptyState.style.display = 'none';
        list.style.display = 'none';

        const status = filterSelect.value;
        try {
            const res = await fetch(`/api/organizations/${orgId}/requests?status=${status}`);
            if (!res.ok) throw new Error('request failed');
            const data = await res.json();
            pinnedIds = new Set((data.requests || []).map((r) => r.id));
            render(data, status);
        } catch {
            skeleton.style.display = 'none';
            showToast(toastError, 'Something went wrong. Please try again.');
        }
    }

    // After approving/rejecting/cancelling, keep previously-visible cards on screen (updated in place)
    // even if they no longer match the active status filter, per spec's "card updates in place" behavior.
    async function refreshAfterAction() {
        try {
            const res = await fetch(`/api/organizations/${orgId}/requests?status=all`);
            if (!res.ok) throw new Error('request failed');
            const data = await res.json();
            const filtered = (data.requests || []).filter((r) => pinnedIds.has(r.id));
            render({ requests: filtered, pendingCount: data.pendingCount, totalCount: data.totalCount }, filterSelect.value);
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
        }
    }

    filterSelect.addEventListener('change', load);

    async function reviewRequest(memberId, id, decision, comment) {
        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}/vacation/requests/${id}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, comment }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast(decision === 'approved' ? toastApproved : toastRejected);
                await refreshAfterAction();
                return true;
            } else {
                showToast(toastError, data.message || 'Something went wrong. Please try again.');
                return false;
            }
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
            return false;
        }
    }

    async function cancelRequest(memberId, id) {
        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}/vacation/requests/${id}/cancel`, { method: 'PUT' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast(toastCancelled, data.refunded ? 'Request cancelled and reserve refunded' : 'Request cancelled');
                await refreshAfterAction();
            } else {
                showToast(toastError, data.message || 'Something went wrong. Please try again.');
            }
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
        }
    }

    function openRejectModal(memberId, id) {
        rejectRequestId = id;
        rejectMemberId = memberId;
        rejectCommentError.textContent = '';
        rejectForm.reset();
        const req = lastRequests.find((r) => r.id === id);
        rejectSummary.textContent = req ? `Rejecting: ${formatDateRange(req.startDate, req.endDate)} (${req.workingDays} day(s))` : '';
        rejectModalOverlay.style.display = '';
    }

    function closeRejectModal() {
        rejectModalOverlay.style.display = 'none';
        rejectRequestId = null;
        rejectMemberId = null;
    }

    rejectCloseButton.addEventListener('click', closeRejectModal);
    rejectCancelButton.addEventListener('click', closeRejectModal);

    rejectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        rejectCommentError.textContent = '';

        if (rejectCommentInput.value.length > 500) {
            rejectCommentError.textContent = 'Comment must be at most 500 characters';
            return;
        }

        rejectConfirmBtn.disabled = true;
        const ok = await reviewRequest(rejectMemberId, rejectRequestId, 'rejected', rejectCommentInput.value || null);
        rejectConfirmBtn.disabled = false;
        if (ok) closeRejectModal();
    });

    list.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const memberId = btn.dataset.member;

        if (action === 'approve') {
            reviewRequest(memberId, id, 'approved', null);
        } else if (action === 'reject') {
            openRejectModal(memberId, id);
        } else if (action === 'cancel') {
            if (confirm('Cancel this approved vacation? The reserve will be refunded.')) cancelRequest(memberId, id);
        }
    });

    load();
})();
