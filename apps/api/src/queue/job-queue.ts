import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The one job the area has today. Named rather than a bare string so a second job type
 * (reminders, a re-render on retry) is a union member and every `switch` over it stops
 * compiling until it is handled.
 */
export type JobName = 'pdf-render';

export interface Job {
  name: JobName;
  /**
   * The FIFO group key. Renders for one envelope never run concurrently, which is what
   * makes the write-once PDF rule (requirement 29) hold under a redelivery rather than
   * merely being unlikely to be violated.
   */
  envelopeId: string;
  payload?: Record<string, unknown>;
}

export type JobHandler = (job: Job) => Promise<void>;

/**
 * Deferred work.
 *
 * Rendering the final PDF must never block the signing request (requirement 27) and must
 * never be able to lose a captured signature (requirement 31). Both properties belong to
 * the port rather than to a driver, so both live here: jobs enqueued inside
 * `afterCommit` are held until the transaction commits, and a dispatch that fails is
 * logged, never thrown back at the signer whose signature is already recorded.
 *
 * Abstract class rather than interface: Nest uses the class as the DI token.
 */
export abstract class JobQueue {
  protected readonly log = new Logger(JobQueue.name);

  /**
   * Jobs buffered by the innermost `afterCommit`. `AsyncLocalStorage` rather than an
   * instance field because the API serves concurrent requests: an instance field would
   * let one request's commit dispatch another request's uncommitted job.
   */
  private readonly pending = new AsyncLocalStorage<Job[]>();

  /** Dispatches in flight, so tests can await quiescence deterministically. */
  private readonly inFlight = new Set<Promise<void>>();

  async enqueue(job: Job): Promise<void> {
    const buffer = this.pending.getStore();
    if (buffer) {
      buffer.push(job);
      return;
    }

    // Outside a transaction scope there is nothing to wait for, but the caller still
    // must not be blocked by the dispatch.
    this.track(this.safeDispatch(job));
  }

  /**
   * Registers the in-process consumer. The SQS driver has no consumer in this process —
   * the render Lambda is the consumer — so it accepts the registration and ignores it,
   * which keeps the calling code identical under both drivers.
   */
  abstract registerHandler(name: JobName, handler: JobHandler): void;

  /**
   * Wraps the unit of work that enqueues — in practice, the `prisma.$transaction` call.
   *
   * Every job enqueued inside `work` is held until it resolves, i.e. until the
   * transaction has committed, and is dropped entirely if it throws. Without this the
   * handler could read an envelope that is not yet visible to another connection, or do
   * work for a transaction that then rolled back.
   */
  async afterCommit<T>(work: () => Promise<T>): Promise<T> {
    const buffer: Job[] = [];
    const result = await this.pending.run(buffer, work);

    // Reached only when `work` resolved: a throw propagates above this line and the
    // buffered jobs are discarded with the transaction, which is the point.
    for (const job of buffer) this.track(this.safeDispatch(job));

    return result;
  }

  /** Awaits every dispatch this queue has started. For tests; production never calls it. */
  async whenIdle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  /** Runs the job for real — in-process for inline, an SQS publish for the AWS driver. */
  protected abstract dispatch(job: Job): Promise<void>;

  /**
   * Requirement 31 in one place: by the time a job is dispatched the signature is
   * already committed, so a failure here is an operational problem to be logged and
   * retried, never an error to hand back to the signer.
   */
  private async safeDispatch(job: Job): Promise<void> {
    try {
      await this.dispatch(job);
    } catch (error) {
      const reason = error instanceof Error ? error.stack || error.message : String(error);
      this.log.error(`Job ${job.name} for envelope ${job.envelopeId} failed: ${reason}`);
    }
  }

  private track(promise: Promise<void>): void {
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise));
  }
}
