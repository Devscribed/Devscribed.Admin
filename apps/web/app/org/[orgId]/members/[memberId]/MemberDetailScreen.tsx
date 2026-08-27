'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, InfoBanner, Input, Tabs } from '@/ds';
import { errorNode } from '@/field-error';
import { useToast } from '@/toast';
import { MEMBER_MESSAGES, MESSAGES, validateJobTitle, type Role } from '@devscribed/validation';
import { AvatarInitials } from './AvatarInitials';
import { ClockIcon, MailIcon } from './icons';
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
 */
function buildTabs(canViewVacation: boolean) {
  return [
    { value: 'about', label: 'About', testId: 'member-detail-tab-about' },
    { value: 'vacation', label: 'Vacation', disabled: !canViewVacation, testId: 'member-detail-tab-vacation' },
    { value: 'projects', label: 'Projects', disabled: true, testId: 'member-detail-tab-projects' },
    { value: 'roles', label: 'Roles', disabled: true, testId: 'member-detail-tab-roles' },
    { value: 'payments', label: 'Payments', disabled: true, testId: 'member-detail-tab-payments' },
  ];
}

export function MemberDetailScreen({ orgId, memberId }: { orgId: string; memberId: string }) {
  const { showToast } = useToast();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [role, setRole] = useState<Role | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobTitleErr, setJobTitleErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('about');

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

  const showForm = !!detail && (detail.canEditRole || detail.canEditJobTitle);
  const roleGuarded = !!detail && detail.isLastAdmin && detail.role === 'admin';

  return (
    <div data-testid="member-detail" style={{ maxWidth: 600, margin: '0 auto' }}>
      <Link
        href={`/org/${orgId}/members`}
        data-testid="member-detail-back-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-14)',
          color: 'var(--text-sub)',
          textDecoration: 'none',
          marginBottom: 'var(--sp-10)',
        }}
      >
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
          &#8592;
        </span>
        Back to members
      </Link>

      {state.kind === 'loading' && <LoadingSkeleton />}

      {state.kind === 'error' && (
        <div
          data-testid="member-detail-not-found"
          style={{ padding: 'var(--sp-12) 0', color: 'var(--text-muted)', fontSize: 'var(--fs-15)' }}
        >
          {state.message}
        </div>
      )}

      {detail && (
        <Card>
          <Header detail={detail} />

          <div style={{ marginTop: 'var(--sp-10)' }}>
            <Tabs items={buildTabs(detail.canViewVacation)} value={activeTab} onChange={setActiveTab} />
          </div>

          <div style={{ paddingTop: 'var(--sp-10)' }}>
            {activeTab === 'vacation' ? (
              <VacationPanel orgId={orgId} memberId={memberId} memberName={detail.fullName} />
            ) : showForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
                {detail.canEditRole && (
                  <div>
                    <RoleSelect
                      memberId={detail.id}
                      value={role ?? detail.role}
                      availableRoles={detail.availableRoles}
                      disabled={roleGuarded || saving}
                      guardMessage={MEMBER_MESSAGES.lastAdminGuard}
                      onChange={setRole}
                    />
                    {roleGuarded && (
                      <div style={{ marginTop: 'var(--sp-4)' }}>
                        <InfoBanner
                          tone="warning"
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
                  <Input
                    label="Job title"
                    placeholder="Enter a job title"
                    value={jobTitle}
                    onChange={(event: { target: { value: string } }) =>
                      handleJobTitleChange(event.target.value)
                    }
                    disabled={saving}
                    data-testid="job-title-input"
                    aria-invalid={jobTitleErr ? true : undefined}
                    aria-describedby={jobTitleErr ? 'field-error-jobTitle' : undefined}
                    error={jobTitleErr ? errorNode('jobTitle', jobTitleErr) : undefined}
                  />
                )}

                <div>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    loading={saving}
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
        gap: 'var(--sp-3)',
      }}
    >
      <AvatarInitials fullName={detail.fullName} initials={detail.avatarInitials} />

      <div
        data-testid="member-detail-name"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-20)',
          letterSpacing: '-.4px',
          color: 'var(--text)',
          marginTop: 'var(--sp-4)',
        }}
      >
        {detail.fullName}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Badge
          tone="info"
          dot={false}
          outline
          data-testid="member-detail-role-badge"
          style={{ textTransform: 'capitalize' }}
        >
          {detail.role}
        </Badge>
        {detail.status === 'removed' && (
          <Badge tone="inactive" data-testid="member-detail-removed-badge">
            Removed
          </Badge>
        )}
      </div>

      <div
        style={{
          marginTop: 'var(--sp-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-3)',
          alignItems: 'center',
        }}
      >
        <div data-testid="member-detail-joined" style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          Joined {joined}
        </div>
        <div
          data-testid="member-detail-email"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
        >
          <MailIcon />
          {detail.email}
        </div>
        <div
          data-testid="member-detail-timezone"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
        >
          <ClockIcon />
          {detail.timezone ?? '—'}
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
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-11)',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 4,
        }}
      >
        Job title
      </div>
      <div data-testid="job-title-readonly" style={{ fontSize: 'var(--fs-15)', color: 'var(--text)' }}>
        {jobTitle}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <div
      data-testid="member-detail-loading-skeleton"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-6)', padding: 'var(--sp-12) 0' }}
    >
      <div style={block(64, 64, 999)} />
      <div style={block(160, 20)} />
      <div style={block(80, 20, 20)} />
      <div style={block(140, 14)} />
      <div style={block(180, 14)} />
      <div style={{ width: '100%', height: 1, background: 'var(--divider)', margin: 'var(--sp-8) 0' }} />
      <div style={block('100%', 46)} />
      <div style={block('100%', 46)} />
      <div style={block(140, 44)} />
    </div>
  );
}
