/**
 * Which calendar the application talks to, decided once at boot.
 *
 * `CALENDAR_PROVIDER` is read as given, in every environment, and defaults to Graph when
 * the tenant credentials are present and the fake otherwise; `NODE_ENV` plays no part
 * (hiring 00 §03.15). The fake creates no event and invites nobody, and an environment
 * that runs it has accepted that. What is still refused is a name with no provider behind
 * it, and Graph with any of its three variables missing.
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
