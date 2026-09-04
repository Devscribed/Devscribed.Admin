'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  BackTo,
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  InfoBanner,
  MailOutlineIcon,
  PageTabs,
  Preloader,
  TextInput,
  TimeOutlineIcon,
} from '@devscribed/ds';
import { useToast } from '@/toast';
import {
  MEMBER_MESSAGES,
  MESSAGES,
  canReadProfile,
  validateJobTitle,
  type Role,
} from '@devscribed/validation';
import { useSession } from '@/layout/session-context';
import { ContractDetails } from '@/members/ContractDetails';
import { RoleSelect } from './RoleSelect';
import { VacationPanel } from './VacationPanel';

interface MemberDetail {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: 'active' | 'removed';
  joinedAt: string;
  jobTitle: string | null;
  /** Nullable — `Account.timezone` is only auto-detected at signup (spec 01) and has
   * no back-fill for older/seeded accounts. */
  timezone: string | null;
  avatarInitials: string;
  isLastAdmin: boolean;
  canEditRole: boolean;
  canEditJobTitle: boolean;
  availableRoles: Role[];
  callerRole: Role;
  /** Spec 07 — server-computed: true when the caller may open the Vacation tab
   * (admin/manager on any active member, or a user on their own active membership). */
  canViewVacation: boolean;
  /** Whether this record is the caller's own — what the Contract details tab gates on. */
  isSelf: boolean;
}

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; detail: MemberDetail };

/** Live inline validation as the visitor types — same rule the server enforces via
 * `validateJobTitle` (max 100 chars, empty allowed), reused rather than duplicated. */
function jobTitleError(value: string): string | null {
  const result = validateJobTitle(value);
  return result.valid ? null : result.error;
}

/**
 * Built per-render from `detail` — only the Vacation tab is conditionally enabled
 * (spec 07: `disabled: !detail.canViewVacation`, the API decides). The other
 * placeholder tabs stay permanently disabled until their own specs land.
 *
 * Contract details (documents spec 03) is not drawn at all rather than drawn disabled:
 * the rest of these are placeholders for screens nobody can reach yet, whereas this one
 * exists and is simply not the caller's to read. A control the caller cannot use is never
 * rendered — the same rule the sidebar follows.
 */
function buildTabs(canViewVacation: boolean, showContractDetails: boolean) {
  return [
    { value: 'about', label: 'About', testId: 'member-detail-tab-about' },
    { value: 'vacation', label: 'Vacation', disabled: !canViewVacation, testId: 'member-detail-tab-vacation' },
    ...(showContractDetails
      ? [
          {
            value: 'contract-details',
            label: 'Contract details',
            testId: 'member-detail-tab-contract-details',
          },
        ]
      : []),
    { value: 'projects', label: 'Projects', disabled: true, testId: 'member-detail-tab-projects' },
    { value: 'roles', label: 'Roles', disabled: true, testId: 'member-detail-tab-roles' },
    { value: 'payments', label: 'Payments', disabled: true, testId: 'member-detail-tab-payments' },
  ];
}

/**
 * `?tab=` opens the screen on a tab, so a tab is addressable — you can send somebody a link
 * to a member's contract details rather than to the member and a sentence about which tab
 * to press. Unknown or unreachable values fall back to About.
 *
 * Read from `location` once rather than through `useSearchParams`, and that is not a
 * shortcut. `useSearchParams` subscribes the component to the router, which re-renders it
 * after hydration — and this screen seeds its form fields from the loaded member on mount,
 * so an extra mount silently discards whatever the visitor had typed. The Save button then
 * goes back to disabled because nothing looks dirty any more, which is exactly how it was
 * found. The tab is an *initial* value; nothing here needs to hear about later changes.
 */
function initialTab(): string {
  if (typeof window === 'undefined') return 'about';
  return new URLSearchParams(window.location.search).get('tab') ?? 'about';
}

export function MemberDetailScreen({ orgId, memberId }: { orgId: string; memberId: string }) {
  const router = useRouter();
  const session = useSession();
  const { showToast } = useToast();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [role, setRole] = useState<Role | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobTitleErr, setJobTitleErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);

  const fetchDetail = useCallback(async (): Promise<
    { ok: true; detail: MemberDetail } | { ok: false; message: string }
  > => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
        credentials: 'same-origin',
      });
      if (response.status === 404) {
        return { ok: false, message: MEMBER_MESSAGES.memberNotFound };
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return { ok: false, message: body?.message ?? MESSAGES.generic };
      }
      const detail = (await response.json()) as MemberDetail;
      return { ok: true, detail };
    } catch {
      return { ok: false, message: MESSAGES.generic };
    }
  }, [orgId, memberId]);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const result = await fetchDetail();
    if (result.ok) {
      setState({ kind: 'ready', detail: result.detail });
      setRole(result.detail.role);
      setJobTitle(result.detail.jobTitle ?? '');
      setJobTitleErr(null);
    } else {
      setState({ kind: 'error', message: result.message });
    }
  }, [fetchDetail]);

  useEffect(() => {
    void load();
  }, [load]);

  const detail = state.kind === 'ready' ? state.detail : null;

  const dirty = useMemo(() => {
    if (!detail) return false;
    const roleChanged = detail.canEditRole && role !== null && role !== detail.role;
    const jobTitleChanged = detail.canEditJobTitle && jobTitle !== (detail.jobTitle ?? '');
    return roleChanged || jobTitleChanged;
  }, [detail, role, jobTitle]);

  function handleJobTitleChange(value: string) {
    setJobTitle(value);
    setJobTitleErr(jobTitleError(value));
  }

  async function handleSave() {
    if (!detail || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ role: role ?? detail.role, jobTitle }),
      });

      if (response.ok) {
        // Refetch rather than hand-crafting the next state locally — the server is
        // the single source of truth for `canEditRole`/`canEditJobTitle`/`isLastAdmin`/
        // `availableRoles`, which can all shift after a role change (requirement 7:
        // values "survive a page reload").
        const result = await fetchDetail();
        if (result.ok) {
          setState({ kind: 'ready', detail: result.detail });
          setRole(result.detail.role);
          setJobTitle(result.detail.jobTitle ?? '');
        }
        setJobTitleErr(null);
        setSaving(false);
        showToast('toast-member-saved', 'Changes saved');
        return;
      }

      const body = await response.json().catch(() => null);
      if (body?.errors?.jobTitle) {
        setJobTitleErr(body.errors.jobTitle);
      } else {
        showToast('toast-member-save-error', body?.message ?? MESSAGES.generic, 'error');
      }
    } catch {
      showToast('toast-member-save-error', MESSAGES.generic, 'error');
    }
    setSaving(false);
  }

  const tabs = detail
    ? buildTabs(detail.canViewVacation, canReadProfile(session.role, detail.isSelf))
    : [];
  /** What is actually shown — an unreachable `?tab=` resolves to About. */
  const shownTab = tabs.some((tab) => tab.value === activeTab && !tab.disabled)
    ? activeTab
    : 'about';

  const showForm = !!detail && (detail.canEditRole || detail.canEditJobTitle);
  const roleGuarded = !!detail && detail.isLastAdmin && detail.role === 'admin';

  return (
    <div data-testid="member-detail" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-7)' }}>
        <BackTo
          label="Back to members"
          href={`/org/${orgId}/members`}
          data-testid="member-detail-back-link"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            router.push(`/org/${orgId}/members`);
          }}
        />
      </div>

      {state.kind === 'loading' && <Preloader data-testid="member-detail-loading" />}

      {state.kind === 'error' && (
        <EmptyState data-testid="member-detail-not-found">{state.message}</EmptyState>
      )}

      {detail && (
        /* §12 — `clip` off. It was for `RoleSelect` on the About tab, whose list a clipping card
           cut off; the list is a portal now (§95) and needs nothing here. Left off all the same:
           nothing in this card runs edge to edge, so clipping would only ever cut off something
           that hangs out of it. */
        <Card clip={false}>
          <Header detail={detail} />

          <div style={{ marginTop: 'var(--space-7)' }}>
            <PageTabs tabs={tabs} active={shownTab} onChange={setActiveTab} label="Member sections" />
          </div>

          <div style={{ paddingTop: 'var(--space-7)' }}>
            {shownTab === 'vacation' ? (
              <VacationPanel orgId={orgId} memberId={memberId} memberName={detail.fullName} />
            ) : shownTab === 'contract-details' ? (
              <ContractDetails
                orgId={orgId}
                memberId={detail.id}
                role={session.role ?? ''}
                isSelf={detail.isSelf}
              />
            ) : showForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {detail.canEditRole && (
                  <div>
                    <RoleSelect
                      memberId={detail.id}
                      value={role ?? detail.role}
                      availableRoles={detail.availableRoles}
                      disabled={roleGuarded || saving}
                      onChange={setRole}
                    />
                    {roleGuarded && (
                      <div style={{ marginTop: 'var(--space-3)' }}>
                        <InfoBanner
                          variant="warning"
                          role="status"
                          aria-live="polite"
                          data-testid="role-change-guard-message"
                        >
                          {MEMBER_MESSAGES.lastAdminGuard}
                        </InfoBanner>
                      </div>
                    )}
                  </div>
                )}

                {detail.canEditJobTitle && (
                  <TextInput
                    label="Job title"
                    placeholder="Enter a job title"
                    value={jobTitle}
                    onChange={(event) => handleJobTitleChange(event.target.value)}
                    readOnly={saving}
                    data-testid="job-title-input"
                    error={jobTitleErr ?? undefined}
                    errorId="field-error-jobTitle"
                  />
                )}

                <div>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    preloader={saving}
                    disabled={saving || !!jobTitleErr || !dirty}
                    data-testid="job-title-save-button"
                  >
                    {saving ? 'Saving' : 'Save changes'}
                  </Button>
                </div>
              </div>
            ) : (
              <ReadonlyJobTitle jobTitle={detail.jobTitle} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Header({ detail }: { detail: MemberDetail }) {
  const joined = new Date(detail.joinedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'var(--space-2)',
      }}
    >
      <Avatar name={detail.fullName} initials={detail.avatarInitials} size={64} decorative />

      <h2
        data-testid="member-detail-name"
        style={{
          margin: 0,
          marginTop: 'var(--space-2)',
          fontSize: 'var(--headline-5-size)',
          lineHeight: 'var(--headline-5-line)',
          letterSpacing: 'var(--headline-5-tracking)',
          fontWeight: 'var(--headline-5-weight)',
          color: 'var(--text-primary)',
        }}
      >
        {detail.fullName}
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* §59 — a role is a label on a person, not a status about them, which is the call
            the members list already made on the same value. */}
        <Badge
          status="neutral"
          outlined
          data-testid="member-detail-role-badge"
          style={{ textTransform: 'capitalize' }}
        >
          {detail.role}
        </Badge>
        {detail.status === 'removed' && (
          <Badge status="inactive" data-testid="member-detail-removed-badge">
            Removed
          </Badge>
        )}
      </div>

      <div
        style={{
          marginTop: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          alignItems: 'center',
          fontSize: 'var(--font-size-s)',
          color: 'var(--text-tertiary)',
        }}
      >
        <div data-testid="member-detail-joined">Joined {joined}</div>
        <div
          data-testid="member-detail-email"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <MailOutlineIcon aria-hidden style={{ flexShrink: 0 }} />
          {detail.email}
        </div>
        <div
          data-testid="member-detail-timezone"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <TimeOutlineIcon aria-hidden style={{ flexShrink: 0 }} />
          {detail.timezone ?? '\u2014'}
        </div>
      </div>
    </div>
  );
}

/**
 * Shared by the user/viewer read-only view AND the removed-member view — the API's
 * `canEditRole`/`canEditJobTitle` flags are already `false` for both cases (a removed
 * member's flags are false regardless of caller role; a user/viewer's are false
 * regardless of target status), so no extra role/status branching is needed here.
 * Role itself is not repeated here — the business spec is explicit that it is "shown
 * as a static badge in the header only."
 */
function ReadonlyJobTitle({ jobTitle }: { jobTitle: string | null }) {
  if (!jobTitle) return null;
  return (
    <div>
      <FieldLabel>Job title</FieldLabel>
      <div data-testid="job-title-readonly" style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>
        {jobTitle}
      </div>
    </div>
  );
}
