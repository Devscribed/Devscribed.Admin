import type { Provider } from '@nestjs/common';
import { ConsoleMailService } from './console-mail.service';
import { InMemoryMailService } from './in-memory-mail.service';
import { MailService } from './mail.service';
import { SesMailService } from './ses-mail.service';

/**
 * Transport selection — the idiom every other port in this codebase now copies.
 *
 * The sink is the default outside production: it logs the link exactly like the console
 * transport *and* records it, which is what lets an E2E run read a reset mail or a
 * signing invitation. Defaulting rather than requiring `MAIL_TRANSPORT=memory` matters
 * because Playwright reuses an already-running dev server — if the sink were opt-in,
 * whether the suite passed would depend on how that server happened to be started.
 *
 * An explicit `MAIL_TRANSPORT` always wins, and `/api/test/mail` stays 404 in production
 * regardless of what is selected here.
 */
export function selectMailTransport():
  | typeof InMemoryMailService
  | typeof ConsoleMailService
  | typeof SesMailService {
  const configured = process.env.MAIL_TRANSPORT;
  if (configured === 'memory') return InMemoryMailService;
  if (configured === 'console') return ConsoleMailService;
  if (configured === 'ses') return SesMailService;

  return process.env.NODE_ENV === 'production' ? SesMailService : InMemoryMailService;
}

export const mailProvider: Provider = {
  provide: MailService,
  useClass: selectMailTransport(),
};
