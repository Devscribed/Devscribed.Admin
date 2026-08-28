import { Injectable, Logger } from '@nestjs/common';
import { Job, JobHandler, JobName, JobQueue } from './job-queue';

/**
 * The development and test driver: the handler runs in this process.
 *
 * Two properties it shares with SQS and must not lose. The job runs **after** the
 * request's transaction has committed — `JobQueue.afterCommit` holds it — and a handler
 * that throws is swallowed into a logged failure, because by then the signature is
 * already recorded and requirement 31 says a render crash must not lose it. What the
 * inline driver does not have is a retry budget or a dead-letter queue; locally, the
 * log is the dead-letter queue.
 */
@Injectable()
export class InlineJobQueue extends JobQueue {
  private readonly logger = new Logger(InlineJobQueue.name);
  private readonly handlers = new Map<JobName, JobHandler>();

  registerHandler(name: JobName, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  protected async dispatch(job: Job): Promise<void> {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      // Not thrown: an unhandled job name is a wiring bug, and the caller is a committed
      // transaction that cannot do anything useful with the exception.
      this.logger.warn(`No handler registered for job ${job.name}; dropping it`);
      return;
    }

    this.logger.debug(`Running ${job.name} inline for envelope ${job.envelopeId}`);
    await handler(job);
  }
}
