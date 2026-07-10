import "server-only";

import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

import { getGraphConfig } from "@/lib/config";

let cachedClient: Client | undefined;

/**
 * A Microsoft Graph client authenticated with the app-only
 * (client-credentials) flow. Cached for the lifetime of the server process.
 *
 * App-only auth means every request must target a specific user's mailbox
 * explicitly (e.g. `/users/{email}/...`); there is no signed-in user.
 */
export function getGraphClient(): Client {
  if (cachedClient) return cachedClient;

  const { tenantId, clientId, clientSecret } = getGraphConfig();

  const credential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret,
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  cachedClient = Client.initWithMiddleware({ authProvider });
  return cachedClient;
}
