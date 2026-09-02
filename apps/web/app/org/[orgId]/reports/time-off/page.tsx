'use client';

import { Card } from '@/ds';
import { ReportShellHeader } from '@/reports/ReportShell';

/**
 * Time Off — placeholder for the first slice. The full screen lands in a
 * later slice; the report shell chrome renders so the sidebar sub-row
 * navigates somewhere and future E2E can stub-navigate before the screen
 * exists.
 */
export default function TimeOffPlaceholderPage() {
  return (
    <div>
      <ReportShellHeader title="Time Off" subtitle="Vacation and holidays for a date range" />
      <Card>
        <div
          style={{
            padding: 'var(--sp-8) var(--sp-4)',
            textAlign: 'center',
            color: 'var(--text-sub)',
            fontSize: 'var(--fs-14)',
            lineHeight: 'var(--lh-loose)',
          }}
        >
          Coming in a later release.
        </div>
      </Card>
    </div>
  );
}
