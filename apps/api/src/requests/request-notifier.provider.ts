import type { Provider } from '@nestjs/common';
import { NullRequestNotifier } from './null-request-notifier';
import { RequestNotifier } from './request-notifier';

/**
 * Adapter selection for the notification port, in the port's own file, the idiom
 * `mail/mail.provider.ts` established.
 *
 * There is exactly one adapter today and it delivers nothing (REQ-03-038), so there is
 * nothing to select between and no environment variable to read. An adapter spec adds
 * its own driver and its own condition here; nothing else in this bundle moves.
 */
export const requestNotifierProvider: Provider = {
  provide: RequestNotifier,
  useClass: NullRequestNotifier,
};
