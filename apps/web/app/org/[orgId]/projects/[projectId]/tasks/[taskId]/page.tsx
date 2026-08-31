'use client';

import { use } from 'react';
import { TaskDetailScreen } from './TaskDetailScreen';

/** Spec 13 — Task detail route. Thin wrapper resolving Next's async `params`. */
export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string; taskId: string }>;
}) {
  const { orgId, projectId, taskId } = use(params);
  return <TaskDetailScreen orgId={orgId} projectId={projectId} taskId={taskId} />;
}
