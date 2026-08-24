'use client';

/**
 * SPEC-03 STUB — the member detail screen.
 *
 * Spec 03 puts **Contract details** on a tab of the member detail screen, but that
 * screen belongs to **user-management spec 05**, which is not implemented: the members
 * area is a flat list with no detail route at all. Rather than hang the tab off nothing,
 * this is the minimum that makes spec 03 real — a route, a `PageHeader`, and a two-tab
 * strip. Spec 05 takes this file over and expands it; the Vacation, Projects and
 * Payments tabs the spec-03 mockup shows belong to that spec and are deliberately
 * *not* invented here, because a tab that leads nowhere is a dead control.
 *
 * The "About" tab exists so the strip is not a single lonely tab, and shows only what
 * the members list already knows.
 */

import { useRouter } from 'next/navigation';
import { use, useEffect, useState, type ReactNode } from 'react';
import { canReadProfile } from '@devscribed/validation';
import { Badge, Button, Card, InfoBanner, Spinner, Tabs } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { apiRequest } from '@/documents/api';
import { ToastProvider } from '@/documents/toast';
import { ContractDetails } from '@/members/ContractDetails';
import { membersUrl, type MemberRow } from '@/members/api';

type Tab = 'about' | 'contract-details';

export default function MemberDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; memberId: string }>;
}) {
  const { orgId, memberId } = use(params);
  return (
    <ToastProvider>
      <MemberDetailScreen orgId={orgId} memberId={memberId} />
    </ToastProvider>
  );
}

function MemberDetailScreen({ orgId, memberId }: { orgId: string; memberId: string }) {
  const router = useRouter();
  const session = useSession();

  const [member, setMember] = useState<MemberRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>('about');

  /**
   * The fill form's "Open profile" link (spec 03's Alt Flow "Incomplete profile") has to
   * land on Contract details, not on About. Read from `location` rather than
   * `useSearchParams` for the same reason the envelope detail screen does: the hook
   * forces a Suspense boundary around the whole screen for one optional query flag.
   */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'contract-details') {
      setTab('contract-details');
    }
  }, []);

  /**
   * There is no `GET .../members/{memberId}` in any implemented spec, so the row comes
   * out of the list endpoint spec 04 already exposes. When spec 05 adds a detail
   * endpoint this becomes a single read; nothing else on the screen changes.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiRequest<MemberRow[]>(membersUrl(orgId));
      if (cancelled) return;
      if (!result.ok) {
        setMissing(true);
        return;
      }
      const found = result.data.find((row) => row.id === memberId);
      if (found) setMember(found);
      else setMissing(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, memberId]);

  /**
   * `isSelf` decides whether the viewer may see their own PII (permission matrix, the
   * "user (own)" column). The membership row's `accountId` answers it directly when the
   * API sends it; the documented list shape does not promise it, so the fallback is the
   * email, which the row does carry and which is unique per account.
   */
  const isSelf =
    member !== null &&
    (member.accountId === session.account.id ||
      member.email.trim().toLowerCase() === session.account.email.trim().toLowerCase());

  const showContractDetails = member !== null && canReadProfile(session.role, isSelf);

  if (missing) {
    return (
      <>
        <PageHeader title="Member" />
        <InfoBanner tone="error" data-testid="member-not-found">
          This member is not part of this organization.
        </InfoBanner>
      </>
    );
  }

  if (member === null) {
    return (
      <div
        data-testid="member-loading"
        style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center', color: 'var(--accent)' }}
      >
        <Spinner size={22} />
        <span style={{ fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>Loading member…</span>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={member.name}
        subtitle={member.email}
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="member-back-btn"
            onClick={() => router.push(`/org/${orgId}/members`)}
          >
            Back to members
          </Button>
        }
      />

      <div data-testid="member-detail-tabs">
        <Tabs
          items={[
            { value: 'about', label: <span data-testid="member-detail-tab-about">About</span> },
            // Absent, not disabled, for a viewer the matrix gives no read access to
            // (TC-03-E2E-07 asserts the tab is gone).
            ...(showContractDetails
              ? [
                  {
                    value: 'contract-details',
                    label: (
                      <span data-testid="member-detail-tab-contract-details">
                        Contract details
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
          value={tab}
          onChange={(next: string) => setTab(next as Tab)}
          style={{ marginBottom: 'var(--sp-10)' }}
        />
      </div>

      {tab === 'about' && (
        <Card title="About" data-testid="member-about">
          <div style={{ display: 'grid', gap: '11px' }}>
            <AboutRow label="Name" value={member.name} />
            <AboutRow label="Email" value={member.email} />
            <AboutRow label="Role" value={member.role} capitalize />
            <AboutRow
              label="Status"
              value={
                <Badge tone={member.status === 'active' ? 'active' : 'inactive'}>
                  {member.status}
                </Badge>
              }
            />
          </div>
        </Card>
      )}

      {tab === 'contract-details' && showContractDetails && (
        <ContractDetails
          orgId={orgId}
          memberId={member.id}
          role={session.role}
          isSelf={isSelf}
        />
      )}
    </>
  );
}

function AboutRow({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: ReactNode;
  capitalize?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)' }}>
      <span style={{ flex: '0 0 150px', fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 'var(--fs-15)',
          color: 'var(--text)',
          textTransform: capitalize ? 'capitalize' : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}
