(function () {
    const orgId = window.__membersOrgId;
    const searchInput = document.getElementById('members-search-input');
    const showRemovedCheckbox = document.getElementById('show-removed-checkbox');
    const skeleton = document.getElementById('members-loading-skeleton');
    const emptyState = document.getElementById('members-empty-state');
    const listContainer = document.getElementById('members-list');
    const tableBody = document.getElementById('members-table-body');
    const actionsHeader = document.getElementById('members-actions-header');

    const deleteDialogOverlay = document.getElementById('confirm-delete-dialog-overlay');
    const deleteDialogBody = document.getElementById('confirm-delete-body');
    const cancelDeleteButton = document.getElementById('cancel-delete-button');
    const confirmDeleteButton = document.getElementById('confirm-delete-button');

    const toastRemoved = document.getElementById('toast-member-removed');
    const toastRestored = document.getElementById('toast-member-restored');
    const toastError = document.getElementById('toast-members-error');

    let debounceTimer = null;
    let pendingDeleteId = null;
    let firstLoad = true;
    let openMenuEl = null;

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showToast(el, text) {
        if (text !== undefined) el.textContent = text;
        el.style.display = '';
        setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    function closeOpenMenu() {
        if (openMenuEl) {
            openMenuEl.style.display = 'none';
            openMenuEl = null;
        }
    }

    document.addEventListener('click', closeOpenMenu);

    function buildQuery() {
        const params = new URLSearchParams();
        const term = searchInput.value.trim();
        if (term) params.set('search', term);
        if (showRemovedCheckbox.checked) params.set('showRemoved', 'true');
        return params.toString();
    }

    async function loadMembers() {
        if (firstLoad) {
            skeleton.style.display = '';
            listContainer.style.display = 'none';
            emptyState.style.display = 'none';
        }

        try {
            const query = buildQuery();
            const res = await fetch(`/api/organizations/${orgId}/members${query ? '?' + query : ''}`);
            if (!res.ok) throw new Error('request failed');
            const data = await res.json();
            renderMembers(data.members, data.callerRole);
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
        } finally {
            firstLoad = false;
            skeleton.style.display = 'none';
        }
    }

    function renderMembers(members, callerRole) {
        const canManage = callerRole === 'admin' || callerRole === 'manager';
        actionsHeader.style.display = canManage ? '' : 'none';
        tableBody.innerHTML = '';

        if (!members || members.length === 0) {
            listContainer.style.display = 'none';
            emptyState.style.display = '';
            return;
        }

        emptyState.style.display = 'none';
        listContainer.style.display = '';

        for (const member of members) {
            const tr = document.createElement('tr');
            tr.setAttribute('data-testid', `member-row-${member.id}`);
            tr.className = 'member-row';

            const isRemoved = member.status === 'removed';

            let actionsCell = '';
            if (canManage) {
                let menuItems = '';
                if (!member.isSelf) {
                    if (isRemoved) {
                        menuItems = `<button type="button" class="menu-item" data-testid="member-action-restore" data-id="${member.id}">Restore</button>`;
                    } else if (member.isLastAdmin) {
                        menuItems = `<button type="button" class="menu-item" data-testid="member-action-delete" data-id="${member.id}" disabled title="Cannot remove the last admin">Delete</button>` +
                            `<span data-testid="delete-guard-message" class="guard-message">Cannot remove the last admin</span>`;
                    } else {
                        menuItems = `<button type="button" class="menu-item" data-testid="member-action-delete" data-id="${member.id}">Delete</button>`;
                    }
                }

                actionsCell = `<td class="actions-cell">
                    ${menuItems ? `<button type="button" class="row-actions-trigger" data-testid="member-row-actions-${member.id}">&#8942;</button>
                    <div class="row-actions-menu" style="display:none;">${menuItems}</div>` : ''}
                </td>`;
            }

            tr.innerHTML = `
                <td data-testid="member-name-${member.id}">${escapeHtml(member.fullName)}</td>
                <td><span data-testid="member-role-badge-${member.id}" class="role-badge">${escapeHtml(member.role)}</span></td>
                <td data-testid="member-email-${member.id}">${escapeHtml(member.email)}</td>
                ${canManage ? actionsCell : ''}
            `;

            if (isRemoved) {
                const nameCell = tr.querySelector(`[data-testid="member-name-${member.id}"]`);
                nameCell.insertAdjacentHTML('beforeend', ` <span data-testid="member-status-badge-${member.id}" class="status-badge removed">Removed</span>`);
            }

            tr.addEventListener('click', (e) => {
                if (e.target.closest('.actions-cell')) return;
                window.location.href = `/org/${orgId}/members/${member.id}`;
            });

            tableBody.appendChild(tr);
        }

        wireRowActions();
    }

    function wireRowActions() {
        tableBody.querySelectorAll('.row-actions-trigger').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = btn.nextElementSibling;
                const alreadyOpen = menu.style.display !== 'none';
                closeOpenMenu();
                if (!alreadyOpen) {
                    menu.style.display = '';
                    openMenuEl = menu;
                }
            });
        });

        tableBody.querySelectorAll('[data-testid="member-action-delete"]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                closeOpenMenu();
                openDeleteDialog(btn.dataset.id, btn.closest('tr'));
            });
        });

        tableBody.querySelectorAll('[data-testid="member-action-restore"]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeOpenMenu();
                restoreMember(btn.dataset.id);
            });
        });
    }

    function openDeleteDialog(memberId, rowEl) {
        pendingDeleteId = memberId;
        const nameEl = rowEl.querySelector(`[data-testid^="member-name-"]`);
        const fullName = nameEl ? nameEl.childNodes[0].textContent.trim() : 'this member';
        deleteDialogBody.textContent = `Are you sure you want to remove ${fullName}? They will lose access immediately.`;
        deleteDialogOverlay.style.display = '';
    }

    function closeDeleteDialog() {
        deleteDialogOverlay.style.display = 'none';
        pendingDeleteId = null;
    }

    cancelDeleteButton.addEventListener('click', closeDeleteDialog);

    confirmDeleteButton.addEventListener('click', async () => {
        const memberId = pendingDeleteId;
        if (!memberId) return;
        closeDeleteDialog();

        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast(toastRemoved);
            } else {
                showToast(toastError, data.message || 'Something went wrong. Please try again.');
            }
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
        }
        await loadMembers();
    });

    async function restoreMember(memberId) {
        try {
            const res = await fetch(`/api/organizations/${orgId}/members/${memberId}/restore`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast(toastRestored);
            } else {
                showToast(toastError, data.message || 'Something went wrong. Please try again.');
            }
        } catch {
            showToast(toastError, 'Something went wrong. Please try again.');
        }
        await loadMembers();
    }

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadMembers, 300);
    });

    showRemovedCheckbox.addEventListener('change', () => {
        loadMembers();
    });

    loadMembers();
})();
