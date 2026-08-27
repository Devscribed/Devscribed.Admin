import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { Injectable, Logger } from '@nestjs/common';
import { PdfRenderer } from './pdf-renderer';

/** What `devscribed-pdf-render-{env}` returns. Base64 because Lambda speaks JSON. */
interface RenderResponse {
  pdfBase64?: string;
  error?: string;
}

/**
 * The production driver: a synchronous invoke of the render function.
 *
 * Synchronous is right even for the final document, because the *caller* is already
 * asynchronous — the completion path enqueues an SQS job and the queue's consumer is
 * what runs this. Requirement 27 keeps rendering off the signing request; it does not
 * ask for a second layer of asynchrony underneath the queue.
 */
@Injectable()
export class LambdaPdfRenderer extends PdfRenderer {
  private readonly logger = new Logger(LambdaPdfRenderer.name);
  private readonly client: LambdaClient;
  private readonly functionName: string;

  constructor() {
    super();
    const functionName = process.env.PDF_RENDER_FUNCTION;
    if (!functionName) throw new Error('PDF_RENDERER=lambda requires PDF_RENDER_FUNCTION');

    this.functionName = functionName;
    this.client = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-1' });
  }

  async render(html: string): Promise<Buffer> {
    const response = await this.client.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify({ html }), 'utf8'),
      }),
    );

    // An unhandled exception inside the function still returns HTTP 200 with
    // `FunctionError` set, so checking the status code alone would treat a crash as a
    // successful empty render.
    if (response.FunctionError) {
      throw new Error(
        `${this.functionName} failed: ${response.FunctionError} ${decode(response.Payload)}`,
      );
    }

    const parsed = JSON.parse(decode(response.Payload) || '{}') as RenderResponse;
    if (!parsed.pdfBase64) {
      throw new Error(`${this.functionName} returned no PDF: ${parsed.error ?? 'unknown reason'}`);
    }

    const bytes = Buffer.from(parsed.pdfBase64, 'base64');
    this.logger.debug(`Rendered ${bytes.length} bytes via ${this.functionName}`);
    return bytes;
  }
}

function decode(payload: Uint8Array | undefined): string {
  return payload ? Buffer.from(payload).toString('utf8') : '';
}
