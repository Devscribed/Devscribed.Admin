'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/ds';
import { FINANCIALS_MESSAGES, MESSAGES } from '@devscribed/validation';
import { VacationFinancialsModal } from './VacationFinancialsModal';

/** The `financials` object in the GET `.../vacation` response (admin/manager only). */
export interface VacationFinancials {
  monthlySalary: number;
  clientHourlyRate: number;
  vacationReservePercent: number;
  isReservePercentManual: boolean;
  vacationDaysPerYear: number;
  currency: string;
}

/** The `balance` object — all numbers are zero by contract until spec 08 adds accrual. */
interface VacationBalance {
  /** Currency reserve balance; `null` in the user-own payload (no money shown). */
  reserveBalance: number | null;
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalDaysPerYear: number;
}

interface VacationResponse {
  financials: VacationFinancials | null;
  balance: VacationBalance | null;
  canEdit: boolean;
  canReviewRequests: boolean;
  canSubmitRequest: boolean;
}

type PanelState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: VacationResponse };

/**
 * Money rendered as `$3,000.00 USD` — two decimals with thousands separators. The
 * leading symbol is best-effort from `Intl.NumberFormat`'s currency style; when the
 * runtime lacks a symbol for the code it falls back to the bare formatted number plus
 * the raw code, so the ISO code is always present either way.
 */
function formatCurrency(amount: number, currency: string): string {
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount);
    return `${formatted} ${currency}`;
  } catch {
    return `${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency}`;
  }
}

/** Card-shaped bordered block — nested inside spec 05's outer `Card`, so it is a plain
 * `<section>` rather than a second DS `Card` (which would double-frame). */
function cardStyle(): React.CSSProperties {
  return {
    border: '1px solid var(--divider)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--sp-8)',
  };
}

const microLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  fontSize: 'var(--fs-15)',
  color: 'var(--text)',
};

/**
 * The Vacation tab panel (spec 07). Fetches `GET .../vacation` on mount, then renders
 * one of the four documented shapes (unconfigured admin/manager, unconfigured user,
 * configured admin/manager, configured user) purely from the payload's `financials` /
 * `balance` / `canEdit` — no client-side role re-derivation.
 */
export function VacationPanel({ orgId, memberId }: { orgId: string; memberId: string }) {
  const [state, setState] = useState<PanelState>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch(`/api/organizations/${orgId}/members/${memberId}/vacation`, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setState({ kind: 'error', message: body?.message ?? MESSAGES.generic });
        return;
      }
      const data = (await response.json()) as VacationResponse;
      setState({ kind: 'ready', data });
    } catch {
      setState({ kind: 'error', message: MESSAGES.generic });
    }
  }, [orgId, memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') return <VacationSkeleton />;

  if (state.kind === 'error') {
    return (
      <div style={{ padding: 'var(--sp-8) 0', color: 'var(--text-muted)', fontSize: 'var(--fs-15)' }}>
        {state.message}
      </div>
    );
  }

  const { data } = state;
  const { financials, balance, canEdit } = data;

  // Unconfigured — no financials record exists yet (`balance` is null by contract).
  const unconfigured = balance === null;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
        {unconfigured ? (
          <EmptyState canEdit={canEdit} onSetup={() => setModalOpen(true)} />
        ) : (
          <>
            {financials && canEdit && (
              <FinancialsCard financials={financials} onEdit={() => setModalOpen(true)} />
            )}
            <BalanceCard balance={balance} currency={financials?.currency ?? null} />
          </>
        )}
      </div>

      {canEdit && (
        <VacationFinancialsModal
          orgId={orgId}
          memberId={memberId}
          open={modalOpen}
          financials={financials}
          onClose={() => setModalOpen(false)}
          onSaved={() => void load()}
        />
      )}
    </>
  );
}

function EmptyState({ canEdit, onSetup }: { canEdit: boolean; onSetup: () => void }) {
  const message = canEdit
    ? // admin/manager empty copy — fixed verbatim by the business spec.
      'Vacation tracking has not been set up for this member yet.'
    : // user-own empty copy — fixed verbatim by the business spec.
      'Vacation tracking has not been set up for your account yet. Please contact your manager.';
  return (
    <div
      data-testid="vacation-empty-state"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--sp-6)',
        textAlign: 'center',
        padding: 'var(--sp-12) var(--sp-8)',
      }}
    >
      <p style={{ color: 'var(--text-sub)', fontSize: 'var(--fs-15)', margin: 0, maxWidth: 360 }}>
        {message}
      </p>
      {canEdit && (
        <Button variant="primary" onClick={onSetup} data-testid="vacation-setup-btn">
          Set up financials
        </Button>
      )}
    </div>
  );
}

function FinancialsCard({
  financials,
  onEdit,
}: {
  financials: VacationFinancials;
  onEdit: () => void;
}) {
  const reserveSuffix = financials.isReservePercentManual ? '(manual)' : '(auto)';
  return (
    <section data-testid="vacation-financials-card" style={cardStyle()}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--sp-6)',
        }}
      >
        <div style={microLabel}>Financial Settings</div>
        <Button variant="secondary" size="sm" onClick={onEdit} data-testid="vacation-financials-edit-btn">
          Edit
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        <Row label="Monthly salary" value={formatCurrency(financials.monthlySalary, financials.currency)} />
        <Row label="Client hourly rate" value={formatCurrency(financials.clientHourlyRate, financials.currency)} />
        <Row
          label="Reserve percentage"
          value={`${financials.vacationReservePercent.toFixed(2)}% ${reserveSuffix}`}
        />
        <Row label="Vacation days per year" value={String(financials.vacationDaysPerYear)} />
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-6)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-13)' }}>{label}</span>
      <span style={{ color: 'var(--text)', fontSize: 'var(--fs-15)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function BalanceCard({ balance, currency }: { balance: VacationBalance; currency: string | null }) {
  return (
    <section data-testid="vacation-balance-card" style={cardStyle()}>
      <div style={{ ...microLabel, marginBottom: 'var(--sp-6)' }}>Vacation Balance</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-10)' }}>
        <Stat testId="vacation-available-days" value={balance.availableDays} label="available" large />
        <Stat testId="vacation-used-days" value={balance.usedDays} label="used" />
        <Stat testId="vacation-pending-days" value={balance.pendingDays} label="pending" />
      </div>

      {/* Money only for admin/manager, and only when the reserve balance is present. */}
      {balance.reserveBalance != null && (
        <div
          data-testid="vacation-reserve-amount"
          style={{
            marginTop: 'var(--sp-8)',
            fontSize: 'var(--fs-15)',
            color: 'var(--text)',
          }}
        >
          Reserve {formatCurrency(balance.reserveBalance, currency ?? 'USD')}
        </div>
      )}

      {/* User-own view: no money, an allowance line instead. */}
      {balance.reserveBalance == null && (
        <div
          style={{
            marginTop: 'var(--sp-8)',
            fontSize: 'var(--fs-13)',
            color: 'var(--text-sub)',
          }}
        >
          out of {balance.totalDaysPerYear} per year
        </div>
      )}
    </section>
  );
}

function Stat({
  testId,
  value,
  label,
  large,
}: {
  testId: string;
  value: number;
  label: string;
  large?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      <div
        data-testid={testId}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: large ? 'var(--fs-34)' : 'var(--fs-22)',
          lineHeight: 1,
          color: 'var(--text)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

/** Static token-colored blocks — the app ships no shimmer/skeleton primitive, matching
 * spec 05's `LoadingSkeleton`. */
function VacationSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <div
      data-testid="vacation-loading-skeleton"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)', padding: 'var(--sp-4) 0' }}
    >
      <div style={{ ...cardStyle(), display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        <div style={block(160, 18)} />
        <div style={block('100%', 14)} />
        <div style={block('100%', 14)} />
        <div style={block('70%', 14)} />
      </div>
      <div style={{ ...cardStyle(), display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        <div style={block(140, 18)} />
        <div style={block('60%', 28)} />
      </div>
    </div>
  );
}
