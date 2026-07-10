(function () {
    const orgId = window.__memberDetailOrgId;
    const memberId = window.__memberDetailMemberId;

    const skeleton = document.getElementById('vacation-loading-skeleton');
    const emptyState = document.getElementById('vacation-empty-state');
    const emptyMessage = document.getElementById('vacation-empty-message');
    const setupBtn = document.getElementById('vacation-setup-btn');
    const defaultState = document.getElementById('vacation-default-state');

    const financialsCard = document.getElementById('vacation-financials-card');
    const salaryValue = document.getElementById('vacation-salary-value');
    const rateValue = document.getElementById('vacation-rate-value');
    const reserveValue = document.getElementById('vacation-reserve-value');
    const daysValue = document.getElementById('vacation-days-value');
    const editBtn = document.getElementById('vacation-financials-edit-btn');

    const availableDaysEl = document.getElementById('vacation-available-days');
    const usedDaysEl = document.getElementById('vacation-used-days');
    const pendingDaysEl = document.getElementById('vacation-pending-days');
    const balanceCaption = document.getElementById('vacation-balance-caption');
    const reserveAmountRow = document.getElementById('vacation-reserve-amount-row');
    const reserveAmountEl = document.getElementById('vacation-reserve-amount');

    const transactionsCard = document.getElementById('vacation-transactions-card');
    const transactionsTable = document.getElementById('vacation-transactions-table');
    const transactionsBody = document.getElementById('vacation-transactions-body');
    const noTransactions = document.getElementById('vacation-no-transactions');

    const modalOverlay = document.getElementById('vacation-financials-modal-overlay');
    const closeButton = document.getElementById('vacation-financials-close-button');
    const cancelButton = document.getElementById('vacation-financials-cancel-btn');
    const form = document.getElementById('vacation-financials-form');
    const salaryInput = document.getElementById('vacation-salary-input');
    const rateInput = document.getElementById('vacation-rate-input');
    const currencySelect = document.getElementById('vacation-currency-select');
    const daysInput = document.getElementById('vacation-days-input');
    const modeAuto = document.getElementById('vacation-reserve-mode-auto');
    const modeManual = document.getElementById('vacation-reserve-mode-manual');
    const percentInput = document.getElementById('vacation-reserve-percent-input');
    const preview = document.getElementById('vacation-reserve-preview');
    const saveBtn = document.getElementById('vacation-financials-save-btn');

    const fieldErrors = {
        monthlySalary: document.getElementById('field-error-monthlySalary'),
        clientHourlyRate: document.getElementById('field-error-clientHourlyRate'),
        vacationDaysPerYear: document.getElementById('field-error-vacationDaysPerYear'),
        currency: document.getElementById('field-error-currency'),
        vacationReservePercent: document.getElementById('field-error-vacationReservePercent'),
    };

    const toastSaved = document.getElementById('toast-financials-saved');
    const toastError = document.getElementById('toast-member-detail-error');
    const toastRequestSubmitted = document.getElementById('toast-request-submitted');
    const toastRequestApproved = document.getElementById('toast-request-approved');
    const toastRequestRejected = document.getElementById('toast-request-rejected');
    const toastRequestCancelled = document.getElementById('toast-request-cancelled');

    const requestBtn = document.getElementById('vacation-request-btn');
    const requestsCard = document.getElementById('vacation-requests-card');
    const requestsList = document.getElementById('vacation-requests-list');
    const noRequests = document.getElementById('vacation-no-requests');

    const requestModalOverlay = document.getElementById('vacation-request-modal-overlay');
    const requestCloseButton = document.getElementById('vacation-request-close-button');
    const requestCancelButton = document.getElementById('vacation-request-cancel-btn');
    const requestForm = document.getElementById('vacation-request-form');
    const startDateInput = document.getElementById('vacation-start-date-input');
    const endDateInput = document.getElementById('vacation-end-date-input');
    const workingDaysPreview = document.getElementById('vacation-working-days-preview');
    const availableDaysPreview = document.getElementById('vacation-available-days-preview');
    const requestSubmitBtn = document.getElementById('vacation-request-submit-btn');
    const requestError = document.getElementById('vacation-request-error');
    const requestFieldErrors = {
        startDate: document.getElementById('field-error-startDate'),
        endDate: document.getElementById('field-error-endDate'),
    };

    const rejectModalOverlay = document.getElementById('vacation-reject-modal-overlay');
    const rejectCloseButton = document.getElementById('vacation-reject-close-button');
    const rejectCancelButton = document.getElementById('vacation-reject-cancel-btn');
    const rejectForm = document.getElementById('vacation-reject-form');
    const rejectSummary = document.getElementById('vacation-reject-summary');
    const rejectCommentInput = document.getElementById('vacation-reject-comment-input');
    const rejectConfirmBtn = document.getElementById('vacation-reject-confirm-btn');
    const rejectCommentError = document.getElementById('field-error-reviewerComment');

    let lastData = null;
    let rejectRequestId = null;

    function countWeekdays(startStr, endStr) {
        if (!startStr || !endStr) return 0;
        const start = new Date(startStr + 'T00:00:00Z');
        const end = new Date(endStr + 'T00:00:00Z');
        if (end < start) return 0;
        let count = 0;
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
            const day = d.getUTCDay();
            if (day !== 0 && day !== 6) count++;
        }
        return count;
    }

    function formatDateRange(startStr, endStr) {
        const start = new Date(startStr + 'T00:00:00Z');
        const end = new Date(endStr + 'T00:00:00Z');
        const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        return `${fmt(start)} – ${fmt(end)}`;
    }

    const statusBadges = {
        pending: { label: '● Pending', className: 'status-pending' },
        approved: { label: '✓ Approved', className: 'status-approved' },
        rejected: { label: '✗ Rejected', className: 'status-rejected' },
        cancelled: { label: '○ Cancelled', className: 'status-cancelled' },
    };

    function renderRequests(data) {
        const requests = data.requests || [];
        requestsCard.style.display = '';
        requestsList.innerHTML = '';

        if (requests.length === 0) {
            noRequests.style.display = '';
            return;
        }
        noRequests.style.display = 'none';

        requests.forEach((r) => {
            const row = document.createElement('div');
            row.className = 'vacation-request-row';
            row.dataset.testid = `vacation-request-row-${r.id}`;

            const badge = statusBadges[r.status] || { label: r.status, className: '' };
            const amountHtml = data.canReviewRequests ? `<span>$${Number(r.deductionAmount).toFixed(2)}</span>` : '';

            let actionsHtml = '';
            if (r.status === 'pending') {
                if (data.canReviewRequests && !r.isOwnRequest) {
                    actionsHtml += `<button type="button" data-testid="vacation-request-approve-${r.id}" data-action="approve" data-id="${r.id}">Approve</button>`;
                    actionsHtml += `<button type="button" data-testid="vacation-request-reject-${r.id}" data-action="reject" data-id="${r.id}">Reject</button>`;
                } else if (r.isOwnRequest) {
                    actionsHtml += `<button type="button" data-testid="vacation-request-cancel-${r.id}" data-action="cancel-pending" data-id="${r.id}">Cancel</button>`;
                } else if (data.canReviewRequests) {
                    actionsHtml += `<button type="button" data-testid="vacation-request-cancel-${r.id}" data-action="cancel-pending" data-id="${r.id}">Cancel</button>`;
                }
            } else if (r.status === 'approved' && data.canReviewRequests) {
                actionsHtml += `<button type="button" data-testid="vacation-request-cancel-${r.id}" data-action="cancel-approved" data-id="${r.id}">Cancel</button>`;
            }

            const commentHtml = (r.status === 'rejected' && r.reviewerComment)
                ? `<div data-testid="vacation-request-reviewer-comment-${r.id}">"${r.reviewerComment}"</div>`
                : '';

            row.innerHTML = `
                <div data-testid="vacation-request-dates-${r.id}">${formatDateRange(r.startDate, r.endDate)}</div>
                <div data-testid="vacation-request-days-${r.id}">${r.workingDays} day(s)</div>
                <div data-testid="vacation-request-status-${r.id}" class="${badge.className}">${badge.label}</div>
                ${amountHtml}
                <div class="vacation-request-actions">${actionsHtml}</div>
                ${commentHtml}
            `;
            requestsList.appendChild(row);
        });
    }

    requestsList.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'approve') {
            await reviewRequest(id, 'approved', null);
        } else if (action === 'reject') {
            openRejectModal(id);
        } else if (action === 'cancel-pending') {
            if (confirm('Cancel this vacation request?')) await cancelRequest(id);
        } else if (action === 'cancel-approved') {
            if (confirm('Cancel this approved vacation? The reserve will be refunded.')) await cancelRequest(id);
        }
    });

    async function reviewRequest(id, decision, comment) {
        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}/vacation/requests/${id}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, comment }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast(decision === 'approved' ? toastRequestApproved : toastRequestRejected);
                await load();
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

    async function cancelRequest(id) {
        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}/vacation/requests/${id}/cancel`, { method: 'PUT' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast(toastRequestCancelled, data.refunded ? 'Request cancelled and reserve refunded' : 'Request cancelled');
                await load();
            } else {
                showToast(toastError, data.message || 'Something went wrong. Please try again.');
            }
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
        }
    }

    function openRequestModal() {
        requestError.textContent = '';
        requestFieldErrors.startDate.textContent = '';
        requestFieldErrors.endDate.textContent = '';
        requestForm.reset();
        workingDaysPreview.textContent = '0';
        availableDaysPreview.textContent = lastData && lastData.balance ? lastData.balance.availableDays : '0';
        requestModalOverlay.style.display = '';
    }

    function closeRequestModal() {
        requestModalOverlay.style.display = 'none';
    }

    requestBtn.addEventListener('click', openRequestModal);
    requestCloseButton.addEventListener('click', closeRequestModal);
    requestCancelButton.addEventListener('click', closeRequestModal);

    function updateWorkingDaysPreview() {
        workingDaysPreview.textContent = countWeekdays(startDateInput.value, endDateInput.value);
    }
    startDateInput.addEventListener('input', updateWorkingDaysPreview);
    endDateInput.addEventListener('input', updateWorkingDaysPreview);

    requestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        requestError.textContent = '';
        requestFieldErrors.startDate.textContent = '';
        requestFieldErrors.endDate.textContent = '';

        if (!startDateInput.value) {
            requestFieldErrors.startDate.textContent = 'Start date must be today or later';
            return;
        }
        if (!endDateInput.value) {
            requestFieldErrors.endDate.textContent = 'End date must be on or after start date';
            return;
        }
        if (startDateInput.value.slice(0, 4) !== endDateInput.value.slice(0, 4)) {
            requestError.textContent = 'Start and end dates must be within the same calendar year';
            return;
        }

        requestSubmitBtn.disabled = true;
        const originalText = requestSubmitBtn.textContent;
        requestSubmitBtn.textContent = 'Submitting...';

        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}/vacation/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate: startDateInput.value, endDate: endDateInput.value }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 201) {
                closeRequestModal();
                showToast(toastRequestSubmitted);
                await load();
            } else if (data.errors) {
                Object.entries(data.errors).forEach(([field, message]) => {
                    if (requestFieldErrors[field]) requestFieldErrors[field].textContent = message;
                });
            } else {
                requestError.textContent = data.message || 'Something went wrong. Please try again.';
            }
        } catch {
            requestError.textContent = 'Something went wrong. Please try again.';
        } finally {
            requestSubmitBtn.disabled = false;
            requestSubmitBtn.textContent = originalText;
        }
    });

    function openRejectModal(id) {
        rejectRequestId = id;
        rejectCommentError.textContent = '';
        rejectForm.reset();
        const req = (lastData.requests || []).find((r) => r.id === id);
        rejectSummary.textContent = req ? `Rejecting: ${formatDateRange(req.startDate, req.endDate)} (${req.workingDays} day(s))` : '';
        rejectModalOverlay.style.display = '';
    }

    function closeRejectModal() {
        rejectModalOverlay.style.display = 'none';
        rejectRequestId = null;
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
        const ok = await reviewRequest(rejectRequestId, 'rejected', rejectCommentInput.value || null);
        rejectConfirmBtn.disabled = false;
        if (ok) closeRejectModal();
    });

    let loaded = false;

    function showToast(el, text) {
        if (text !== undefined) el.textContent = text;
        el.style.display = '';
        setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    function clearFieldErrors() {
        Object.values(fieldErrors).forEach((el) => { el.textContent = ''; });
    }

    function formatMoney(value, currency) {
        return `${Number(value).toFixed(2)} ${currency}`;
    }

    function formatDate(iso) {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function renderTransactions(transactions, currency) {
        if (!transactions) {
            transactionsCard.style.display = 'none';
            return;
        }

        transactionsCard.style.display = '';
        transactionsBody.innerHTML = '';

        if (transactions.length === 0) {
            transactionsTable.style.display = 'none';
            noTransactions.style.display = '';
            return;
        }

        noTransactions.style.display = 'none';
        transactionsTable.style.display = '';

        transactions.forEach((txn) => {
            const tr = document.createElement('tr');
            tr.dataset.testid = 'vacation-transaction-row';

            const sign = txn.amount >= 0 ? '+' : '−';
            const amountClass = txn.amount >= 0 ? 'amount-positive' : 'amount-negative';
            const typeLabel = txn.type.charAt(0).toUpperCase() + txn.type.slice(1);
            const autoLabel = txn.isAutoGenerated ? ' <span class="auto-label">(auto)</span>' : '';
            const createdByLabel = txn.isAutoGenerated ? 'System' : (txn.createdBy || '');

            tr.innerHTML = `
                <td>${formatDate(txn.createdAt)}</td>
                <td>${typeLabel}${autoLabel}</td>
                <td class="${amountClass}">${sign}${Math.abs(txn.amount).toFixed(2)} ${currency || ''}</td>
                <td>${txn.description || ''}</td>
                <td>${createdByLabel}</td>
            `;
            transactionsBody.appendChild(tr);
        });
    }

    function calculateReservePercent(monthlySalary, clientHourlyRate, vacationDaysPerYear) {
        const dailySalary = (monthlySalary * 12) / 260;
        const annualVacationCost = dailySalary * vacationDaysPerYear;
        const expectedAnnualBilling = clientHourlyRate * 2080;
        if (!expectedAnnualBilling) return 0;
        return Math.round((annualVacationCost / expectedAnnualBilling) * 100 * 100) / 100;
    }

    function updatePreview() {
        const salary = parseFloat(salaryInput.value);
        const rate = parseFloat(rateInput.value);
        const days = parseInt(daysInput.value, 10);

        if (modeAuto.checked) {
            percentInput.disabled = true;
            if (!isNaN(salary) && !isNaN(rate) && !isNaN(days) && rate > 0) {
                const pct = calculateReservePercent(salary, rate, days);
                percentInput.value = pct.toFixed(2);
                preview.textContent = `auto-calc preview: ${pct.toFixed(2)}%`;
            } else {
                preview.textContent = '';
            }
        } else {
            percentInput.disabled = false;
            preview.textContent = '';
        }
    }

    [salaryInput, rateInput, daysInput].forEach((el) => el.addEventListener('input', updatePreview));
    modeAuto.addEventListener('change', updatePreview);
    modeManual.addEventListener('change', updatePreview);

    function openModal(financials) {
        clearFieldErrors();
        form.reset();
        if (financials) {
            salaryInput.value = financials.monthlySalary;
            rateInput.value = financials.clientHourlyRate;
            currencySelect.value = financials.currency;
            daysInput.value = financials.vacationDaysPerYear;
            if (financials.isReservePercentManual) {
                modeManual.checked = true;
                percentInput.value = financials.vacationReservePercent;
            } else {
                modeAuto.checked = true;
            }
        } else {
            daysInput.value = 20;
            modeAuto.checked = true;
        }
        updatePreview();
        modalOverlay.style.display = '';
    }

    function closeModal() {
        modalOverlay.style.display = 'none';
    }

    closeButton.addEventListener('click', closeModal);
    cancelButton.addEventListener('click', closeModal);
    setupBtn.addEventListener('click', () => openModal(null));
    editBtn.addEventListener('click', () => openModal(lastFinancials));

    let lastFinancials = null;

    function render(data) {
        lastFinancials = data.financials;
        lastData = data;
        const canEdit = data.canEdit;

        if (!data.balance) {
            emptyState.style.display = '';
            defaultState.style.display = 'none';
            financialsCard.style.display = 'none';
            requestBtn.style.display = 'none';
            if (canEdit) {
                emptyMessage.textContent = 'Vacation tracking has not been set up for this member yet.';
                setupBtn.style.display = '';
            } else {
                emptyMessage.textContent = 'Vacation tracking has not been set up for your account yet. Please contact your manager.';
                setupBtn.style.display = 'none';
            }
            renderTransactions(null, null);
        } else {
            emptyState.style.display = 'none';
            defaultState.style.display = '';

            if (canEdit) {
                financialsCard.style.display = '';
                salaryValue.textContent = formatMoney(data.financials.monthlySalary, data.financials.currency);
                rateValue.textContent = formatMoney(data.financials.clientHourlyRate, data.financials.currency);
                reserveValue.textContent = `${Number(data.financials.vacationReservePercent).toFixed(2)}% (${data.financials.isReservePercentManual ? 'manual' : 'auto'})`;
                daysValue.textContent = data.financials.vacationDaysPerYear;
            } else {
                financialsCard.style.display = 'none';
            }

            availableDaysEl.textContent = data.balance.availableDays;
            usedDaysEl.textContent = data.balance.usedDays;
            pendingDaysEl.textContent = data.balance.pendingDays;

            if (data.balance.reserveBalance !== null && data.balance.reserveBalance !== undefined) {
                reserveAmountRow.style.display = '';
                reserveAmountEl.textContent = formatMoney(data.balance.reserveBalance, data.financials ? data.financials.currency : '');
                balanceCaption.textContent = '';
            } else {
                reserveAmountRow.style.display = 'none';
                balanceCaption.textContent = `out of ${data.balance.totalDaysPerYear} per year`;
            }

            renderTransactions(data.transactions, data.financials ? data.financials.currency : '');
            renderRequests(data);

            if (data.canSubmitRequest) {
                requestBtn.style.display = '';
                const noDays = data.balance.availableDays <= 0;
                requestBtn.disabled = noDays;
                requestBtn.title = noDays ? 'No vacation days available' : '';
            } else {
                requestBtn.style.display = 'none';
            }
        }

        skeleton.style.display = 'none';
    }

    async function load() {
        skeleton.style.display = '';
        emptyState.style.display = 'none';
        defaultState.style.display = 'none';

        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}/vacation`);
            if (!res.ok) throw new Error('request failed');
            const data = await res.json();
            render(data);
        } catch {
            skeleton.style.display = 'none';
            showToast(toastError, 'Something went wrong. Please try again.');
        }
    }

    function validateClientSide() {
        clearFieldErrors();
        let valid = true;

        const salary = parseFloat(salaryInput.value);
        if (isNaN(salary) || salary < 0.01 || salary > 999999.99) {
            fieldErrors.monthlySalary.textContent = 'Monthly salary must be between 0.01 and 999,999.99';
            valid = false;
        }

        const rate = parseFloat(rateInput.value);
        if (isNaN(rate) || rate < 0.01 || rate > 9999.99) {
            fieldErrors.clientHourlyRate.textContent = 'Client hourly rate must be between 0.01 and 9,999.99';
            valid = false;
        }

        const days = parseInt(daysInput.value, 10);
        if (isNaN(days) || days < 1 || days > 365) {
            fieldErrors.vacationDaysPerYear.textContent = 'Vacation days per year must be between 1 and 365';
            valid = false;
        }

        if (!currencySelect.value) {
            fieldErrors.currency.textContent = 'Invalid currency code';
            valid = false;
        }

        if (modeManual.checked) {
            const pct = parseFloat(percentInput.value);
            if (isNaN(pct) || pct < 0.01 || pct > 99.99) {
                fieldErrors.vacationReservePercent.textContent = 'Reserve percentage must be between 0.01 and 99.99';
                valid = false;
            }
        }

        return valid;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateClientSide()) return;

        saveBtn.disabled = true;
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';

        const isManual = modeManual.checked;
        const payload = {
            monthlySalary: parseFloat(salaryInput.value),
            clientHourlyRate: parseFloat(rateInput.value),
            vacationDaysPerYear: parseInt(daysInput.value, 10),
            currency: currencySelect.value,
            isReservePercentManual: isManual,
            vacationReservePercent: isManual ? parseFloat(percentInput.value) : null,
        };

        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}/vacation/financials`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                closeModal();
                showToast(toastSaved);
                await load();
            } else if (data.errors) {
                Object.entries(data.errors).forEach(([field, message]) => {
                    if (fieldErrors[field]) fieldErrors[field].textContent = message;
                });
            } else {
                showToast(toastError, data.message || 'Something went wrong. Please try again.');
            }
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    });

    window.__loadVacationTab = function () {
        if (!loaded) {
            loaded = true;
            load();
        }
    };
})();
