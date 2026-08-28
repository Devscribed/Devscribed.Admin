/**
 * TEST-SUPPORT FIXTURE — not part of the product.
 *
 * Two things an E2E run cannot build through the product alone:
 *
 *  - **making the provider unreachable and then healthy inside one test** (TC-04-E2E-03),
 *    which no product action can do because a provider outage is not a feature;
 *  - **driving an envelope to completion**, which needs a human in a third party's widget.
 *
 * It sits behind the **existing** fence — `assertFixturesOpen` for the environment,
 * `resolveFixtureScope` for the caller — rather than growing a second one, and answers
 * 404 to everything else. Read the comment at the top of `fixture-gate.ts` before
 * changing either. It also answers 404 whenever the stub driver is not the one in use, so
 * the route simply does not exist in an environment that talks to the real SignWell.
 */
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { JobQueue } from '../queue/job-queue';
import { SignWellHttpClient } from '../signature/signwell/signwell-http-client';
import { StubSignWellHttpClient } from '../signature/signwell/stub-signwell-http-client';
import { assertFixturesOpen, resolveFixtureScope } from './fixture-gate';

interface HealthDto {
  healthy?: boolean;
}

interface CompleteDto {
  orgId?: string;
  envelopeId?: string;
}

@Controller('api/test/signwell')
export class TestSignWellStubController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly client: SignWellHttpClient,
    private readonly queue: JobQueue,
  ) {}

  /**
   * The widget the stub's `embedded_signing_url` points at.
   *
   * It is deliberately **ours**, on our own origin, reached through the web app's
   * `/api/*` rewrite: a stub whose frame pointed at the real provider would make the E2E
   * suite fetch a third party's page to render a signing screen, which is the one thing
   * the stub exists to prevent. It also means the shipped `frame-src 'self'` admits it,
   * so the suite proves the page works without depending on the widened policy.
   *
   * It emits the same `postMessage` shape the real widget does when a signer finishes, so
   * the parent page's origin check and its "a message is a hint, never a fact" handling
   * are exercised rather than assumed.
   */
  @Get('widget')
  @Header('Content-Type', 'text/html; charset=utf-8')
  widget(@Query('document') document?: string, @Headers('authorization') authorization?: string) {
    assertFixturesOpen(authorization);
    this.stub();
    const label = (document ?? '').replace(/[^a-zA-Z0-9-]/g, '');
    return (
      '<!doctype html><html><head><meta charset="utf-8"><title>Signing</title></head>' +
      '<body style="font-family:sans-serif;padding:24px">' +
      `<p data-testid="stub-widget">Stub signing widget for ${label}</p>` +
      '<button id="finish" type="button">Finish</button>' +
      '<script>document.getElementById("finish").addEventListener("click",function(){' +
      'parent.postMessage({action:"completed"},"*");});</script>' +
      '</body></html>'
    );
  }

  /** TC-04-E2E-03 — 503 from every call, then healthy again, without restarting anything. */
  @Post('health')
  @HttpCode(200)
  async health(@Body() dto: HealthDto, @Headers('authorization') authorization?: string) {
    assertFixturesOpen(authorization);
    const stub = this.stub();
    stub.setHealthy(dto?.healthy !== false);
    return { healthy: stub.isHealthy() };
  }

  /**
   * Marks the stub's document completed and makes the envelope due for convergence, so a
   * browser test can reach a completed SignWell envelope the same way the product does —
   * through the reconciler — rather than by writing the columns a completion produces.
   */
  @Post('complete')
  @HttpCode(200)
  async complete(
    @Body() dto: CompleteDto,
    @Req() request: Request,
    @Headers('authorization') authorization?: string,
  ) {
    assertFixturesOpen(authorization);
    const stub = this.stub();
    const scope = await resolveFixtureScope(
      this.prisma,
      this.sessions,
      request,
      (dto?.orgId ?? '').trim() || undefined,
    );

    const envelope = await this.prisma.envelope.findFirst({
      // Scoped by the caller's organization wherever there is one; never by the id alone
      // on a deployment.
      where: {
        id: (dto?.envelopeId ?? '').trim(),
        ...(scope === null ? {} : { organizationId: scope }),
      },
      select: { id: true, providerRef: true },
    });
    if (!envelope || !envelope.providerRef) throw new NotFoundException('No such envelope');

    if (!stub.completeDocument(envelope.providerRef)) {
      throw new NotFoundException('The stub holds no document for that envelope');
    }

    // The envelope is made stale rather than completed here: the product's own
    // convergence is what must complete it, and requirement 27's ordering — download,
    // store, then mark complete — is exactly what the test is downstream of.
    await this.prisma.envelope.update({
      where: { id: envelope.id },
      data: { providerSyncedAt: null },
    });
    await this.queue.enqueue({ name: 'provider-reconcile', envelopeId: envelope.id, payload: {
      providerKey: 'signwell',
      providerRef: envelope.providerRef,
    } });

    return { envelopeId: envelope.id };
  }

  /**
   * The route exists only under the stub driver. Under the real client it is a 404, like
   * every other fixture in an environment that was not built to host one.
   */
  private stub(): StubSignWellHttpClient {
    if (!(this.client instanceof StubSignWellHttpClient)) throw new NotFoundException();
    return this.client;
  }
}
