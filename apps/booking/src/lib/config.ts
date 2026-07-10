/**
 * Server-only configuration, read from environment variables.
 *
 * Access Graph credentials via {@link getGraphConfig} and the hiring-manager
 * mailbox via the SettingsRepository (which, for now, reads this env value).
 * Kept as functions rather than module-level constants so a missing variable
 * fails at first use with a clear message, not at import time.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy apps/booking/.env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function getGraphConfig(): GraphConfig {
  return {
    tenantId: required("GRAPH_TENANT_ID"),
    clientId: required("GRAPH_CLIENT_ID"),
    clientSecret: required("GRAPH_CLIENT_SECRET"),
  };
}

/**
 * The hiring manager's mailbox address. In production this is an Admin
 * Dashboard setting; here it is env-backed. Callers should prefer the
 * SettingsRepository so the source can change without touching them.
 */
export function getHiringManagerEmail(): string {
  return required("HIRING_MANAGER_EMAIL");
}
