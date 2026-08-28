'use client';

import { use } from 'react';
import { ProjectDetailScreen } from './ProjectDetailScreen';

/**
 * Spec 11 — Project detail. Thin route wrapper resolving Next's async `params`, matching
 * the members detail page pattern.
 */
export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId, projectId } = use(params);
  return <ProjectDetailScreen orgId={orgId} projectId={projectId} />;
}
