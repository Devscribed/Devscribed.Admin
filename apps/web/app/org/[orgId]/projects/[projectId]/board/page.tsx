'use client';

import { use } from 'react';
import { BoardScreen } from './BoardScreen';

/**
 * Spec 13 — Board view route. Thin wrapper resolving Next's async `params`, matching
 * the project detail page pattern.
 */
export default function BoardPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId, projectId } = use(params);
  return <BoardScreen orgId={orgId} projectId={projectId} />;
}
