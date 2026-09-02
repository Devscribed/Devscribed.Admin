'use client';

import { Card } from '@/ds';
import { ReportShellHeader } from '@/reports/ReportShell';

/**
 * Time & Activity — placeholder for the first slice. The full screen lands in
 * a later slice; this page still renders the report shell chrome so the
 * sidebar's sub-row navigates somewhere sensible and future E2E can stub-
 * navigate before the screen exists.
 */
export default function TimeAndActivityPlaceholderPage() {
  return (
    <div>
      <ReportShellHeader title="Time & Activity" subtitle="Hours per project, client, and member" />
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
