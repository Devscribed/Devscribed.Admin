/**
 * Which calendar the application talks to, decided once at boot.
 *
 * This mirrors `storage.config.ts` and for the same reason. A production process
 * running the fake calendar would take bookings, write applications, and create no
 * event at all — so nobody receives an invite, and the interviewer's calendar stays
 * empty while the board fills up. That is the same class of silent loss as discarding
 * an uploaded CV, and it gets the same treatment: refuse to start.
 */

export type CalendarProviderName = 'graph' | 'fake';

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export type CalendarConfig =
  | { provider: 'graph'; graph: GraphConfig }
  | { provider: 'fake'; graph: null };

export class CalendarConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarConfigError';
  }
}

const GRAPH_VARIABLES = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'] as const;

/** An empty variable is an unset one: `.env` files declare keys they do not fill in. */
const value = (raw: string | undefined): string | undefined => {
  const trimmed = (raw ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * `CALENDAR_PROVIDER` is optional and rarely set: an environment with Graph credentials
 * means Graph, and one without means the fake. Being explicit is still allowed, and is
 * the only way to run the fake alongside real credentials.
 */
export function resolveCalendarConfig(env: NodeJS.ProcessEnv = process.env): CalendarConfig {
  const configured = value(env.CALENDAR_PROVIDER);
  const provider: CalendarProviderName =
    (configured as CalendarProviderName | undefined) ??
    (value(env.GRAPH_TENANT_ID) ? 'graph' : 'fake');

  if (provider !== 'graph' && provider !== 'fake') {
    throw new CalendarConfigError(
      `CALENDAR_PROVIDER must be "graph" or "fake", not "${configured}".`,
    );
  }

  if (provider === 'fake') {
    if (env.NODE_ENV === 'production') {
      throw new CalendarConfigError(
        'CALENDAR_PROVIDER=fake cannot be used in production: bookings would create no ' +
          'calendar event, so neither the candidate nor the interviewer would be invited. ' +
          `Set ${GRAPH_VARIABLES.join(', ')} before starting.`,
      );
    }
    return { provider, graph: null };
  }

  const missing = GRAPH_VARIABLES.filter((name) => !value(env[name]));
  if (missing.length > 0) {
    throw new CalendarConfigError(
      `CALENDAR_PROVIDER=graph requires ${missing.join(', ')}, which ${
        missing.length === 1 ? 'is' : 'are'
      } not set.`,
    );
  }

  return {
    provider,
    graph: {
      tenantId: value(env.GRAPH_TENANT_ID)!,
      clientId: value(env.GRAPH_CLIENT_ID)!,
      clientSecret: value(env.GRAPH_CLIENT_SECRET)!,
    },
  };
}
