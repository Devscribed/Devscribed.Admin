import { Controller, Get } from '@nestjs/common';

/**
 * Liveness for the load balancer, and nothing else.
 *
 * **It deliberately does not touch the database.** A health check is what decides
 * whether a task keeps receiving traffic, so a check that fails when Postgres blips
 * takes every task out of service at once and turns a recoverable database hiccup into
 * a total outage. The API cannot serve without its database either way — but a task
 * that is up and waiting for the database to come back is worth strictly more than no
 * tasks at all.
 *
 * It is a controller rather than a middleware so it goes through the same routing the
 * rest of the API does: if the Nest application failed to compose, this 404s, which is
 * exactly the answer a deploy gate wants.
 */
@Controller('api/health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}
