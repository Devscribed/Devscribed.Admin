'use client';

import { use } from 'react';
import { MemberDetailScreen } from './MemberDetailScreen';

/**
 * Spec 05 — Member Detail: About. Thin route wrapper, matching the pattern the
 * Members list (`../page.tsx`) already uses for resolving Next's async `params`.
 */
export default function MemberDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; memberId: string }>;
}) {
  const { orgId, memberId } = use(params);
  return <MemberDetailScreen orgId={orgId} memberId={memberId} />;
}
