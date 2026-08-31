'use client';

import { use } from 'react';
import { ListScreen } from './ListScreen';

/** Spec 13 — List view route. Thin wrapper resolving Next's async `params`. */
export default function ListPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId, projectId } = use(params);
  return <ListScreen orgId={orgId} projectId={projectId} />;
}
