'use client';

import { notFound, useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { HIRING_MESSAGES } from '@devscribed/validation';
import { Badge, Button, Card, SectionLabel, Skeleton, Toast } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { formatDuration } from '@/hiring/format';
import type { Vacancy } from '@/hiring/types';

type State = { status: 'loading' } | { status: 'ready'; vacancy: Vacancy } | { status: 'gone' };

/**
 * The vacancy detail page. The booking link is first because copying it is the reason
 * to visit; Board, Edit and the actions menu arrive with the phases that own them.
 */
export default function VacancyDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; vacancyId: string }>;
}) {
  const { orgId, vacancyId } = use(params);
  const search = useSearchParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [toast, setToast] = useState<string | null>(null);

  // Raised here rather than on the list, so it survives the navigation that follows a
  // successful create.
  useEffect(() => {
    if (search.get('created') === '1') setToast(HIRING_MESSAGES.toast.vacancyCreated);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/vacancies/${vacancyId}`,
        { credentials: 'same-origin' },
      );
      if (cancelled) return;
      if (response.status === 403 || response.status === 404) {
        setState({ status: 'gone' });
        return;
      }
      if (!response.ok) return;
      setState({ status: 'ready', vacancy: await response.json() });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, vacancyId]);

  if (state.status === 'gone') notFound();

  if (state.status === 'loading') {
    return (
      <Card>
        <Skeleton rows={4} height={22} />
      </Card>
    );
  }

  const { vacancy } = state;
  const bookingUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}/book/${vacancy.publicSlug}`;

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setToast(HIRING_MESSAGES.toast.linkCopied);
    } catch {
      // The action never silently fails: if the clipboard is unavailable, the link
      // text is selected so it can be copied by hand.
      const node = document.querySelector('[data-testid="vacancy-booking-link"]');
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  return (
    <div data-testid="vacancy-detail">
      <PageHeader
        title={vacancy.title}
        subtitle={`${vacancy.status === 'open' ? 'Open' : 'Closed'} · ${formatDuration(
          vacancy.durationMinutes,
        )} · ${vacancy.interviewer.fullName}`}
      />

      <div style={{ display: 'grid', gap: 'var(--sp-10)' }}>
        <Card>
          <SectionLabel>Booking link</SectionLabel>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-8)',
              marginTop: 'var(--sp-4)',
            }}
          >
            <span
              data-testid="vacancy-booking-link"
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text)',
              }}
            >
              {bookingUrl}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={copyLink}
              data-testid="vacancy-copy-link-button"
            >
              Copy
            </Button>
          </div>
        </Card>

        <Card>
          <SectionLabel>Description</SectionLabel>
          <p
            style={{
              margin: 'var(--sp-4) 0 0',
              whiteSpace: 'pre-wrap',
              fontSize: 'var(--fs-15)',
              lineHeight: 'var(--lh-normal)',
              color: vacancy.description ? 'var(--text-sub)' : 'var(--text-muted)',
            }}
          >
            {vacancy.description || 'No description.'}
          </p>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-8)' }}>
            <Badge tone={vacancy.status === 'open' ? 'active' : 'inactive'}>
              {vacancy.status === 'open' ? 'Open' : 'Closed'}
            </Badge>
            <span
              data-testid="vacancy-detail-counts"
              style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
            >
              {vacancy.applicationCount} candidates · {vacancy.scheduledCount} scheduled
            </span>
          </div>
        </Card>
      </div>

      {toast && (
        <Toast
          tone="success"
          onDismiss={() => setToast(null)}
          data-testid={
            toast === HIRING_MESSAGES.toast.linkCopied ? 'toast-link-copied' : 'toast-vacancy-created'
          }
        >
          {toast}
        </Toast>
      )}
    </div>
  );
}
