import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Injectable, Logger } from '@nestjs/common';
import { Job, JobHandler, JobName, JobQueue } from './job-queue';

/**
 * The production driver: `devscribed-pdf-render-{env}.fifo`.
 *
 * The message group id is the envelope id, so two deliveries of the same job can never
 * render one envelope concurrently — that is the mechanism behind the write-once PDF
 * rule under retries. Deduplication is content-based on the queue, so no explicit
 * deduplication id is sent; identical payloads inside the 5-minute window collapse,
 * which is exactly the redelivery we want collapsed.
 */
@Injectable()
export class SqsJobQueue extends JobQueue {
  private readonly logger = new Logger(SqsJobQueue.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor() {
    super();
    const queueUrl = process.env.PDF_RENDER_QUEUE_URL;
    if (!queueUrl) throw new Error('JOB_QUEUE=sqs requires PDF_RENDER_QUEUE_URL');

    this.queueUrl = queueUrl;
    this.client = new SQSClient({ region: process.env.AWS_REGION || 'eu-central-1' });
  }

  registerHandler(_name: JobName, _handler: JobHandler): void {
    // Deliberately ignored. The consumer is the render Lambda, which is deployed from
    // Terraform and never runs inside the API process. Accepting the call rather than
    // throwing is what lets the envelope service register its handler unconditionally.
  }

  protected async dispatch(job: Job): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(job),
        MessageGroupId: job.envelopeId,
      }),
    );
    this.logger.debug(`Enqueued ${job.name} for envelope ${job.envelopeId}`);
  }
}
