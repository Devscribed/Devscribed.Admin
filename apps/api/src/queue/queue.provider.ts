import type { Provider } from '@nestjs/common';
import { InlineJobQueue } from './inline-job-queue';
import { JobQueue } from './job-queue';
import { SqsJobQueue } from './sqs-job-queue';

/**
 * Same convention as every other port here: an explicit `JOB_QUEUE` wins, and the inline
 * driver is the default whenever we are not in production.
 */
export function selectJobQueue(): typeof InlineJobQueue | typeof SqsJobQueue {
  const configured = process.env.JOB_QUEUE;
  if (configured === 'sqs') return SqsJobQueue;
  if (configured === 'inline') return InlineJobQueue;

  return process.env.NODE_ENV === 'production' ? SqsJobQueue : InlineJobQueue;
}

export const jobQueueProvider: Provider = {
  provide: JobQueue,
  useClass: selectJobQueue(),
};
