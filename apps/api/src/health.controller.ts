import { Controller, Get } from '@nestjs/common';

/** Liveness probe — confirms the API process is up (does not check the DB). */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
