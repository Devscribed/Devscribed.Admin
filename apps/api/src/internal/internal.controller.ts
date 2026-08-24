import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { EnvelopeSweepService } from './envelope-sweep.service';
import { InternalTaskGuard } from './internal-task.guard';

/**
 * Machine-to-machine endpoints. Authorized by `INTERNAL_TASK_SECRET`, never by a
 * session, and never reachable from the browser.
 */
@Controller('api/internal')
@UseGuards(InternalTaskGuard)
export class InternalController {
  constructor(private readonly sweep: EnvelopeSweepService) {}

  @Post('envelopes/sweep')
  @HttpCode(200)
  runSweep() {
    return this.sweep.run();
  }
}
