import {
  HttpSignWellClient,
  type SignWellRawRequest,
  type SignWellRawResponse,
} from '../src/signature/signwell/signwell-http-client';
import { ProviderUnavailableError } from '../src/signature/signing-provider';
import type { SignWellCreateDocumentBody } from '../src/signature/signwell/signwell-types';

/**
 * specs/documents/04-signature-providers.md, requirements 13 and 14 and edge case 22 —
 * the driver that protects a budget of ten creates and twenty reads per minute.
 *
 * The transport is the seam, not `fetch`: every rule under test is the client's own
 * (retry on 429, retry on 5xx, a breaker that opens on consecutive failures and closes
 * after its window), and injecting `sleep` and `now` is what makes "the delays grow" and
 * "the breaker closes" assertions rather than sleeps.
 */

const CREATE_BODY: SignWellCreateDocumentBody = {
  test_mode: true,
  draft: false,
  files: [{ name: 'agreement.pdf', file_base64: 'JVBERi0=' }],
  recipients: [
    { id: '1', name: 'Pat Owner', email: 'company@acme.com', signing_order: 1, send_email: false },
  ],
  apply_signing_order: true,
  text_tags: true,
  embedded_signing: true,
  embedded_signing_notifications: false,
  reminders: false,
  expires_in: 7,
  name: 'Contractor agreement',
  metadata: { envelope_id: 'env-1', organization_id: 'org-1' },
  allow_decline: true,
  allow_reassign: false,
};

interface Harness {
  client: HttpSignWellClient;
  requests: SignWellRawRequest[];
  delays: number[];
  advance: (ms: number) => void;
}

function harness(answer: (attempt: number) => SignWellRawResponse | Error): Harness {
  const requests: SignWellRawRequest[] = [];
  const delays: number[] = [];
  let clock = 1_000_000;

  const client = new HttpSignWellClient(
    async (request) => {
      requests.push(request);
      const outcome = answer(requests.length);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    {
      baseUrl: 'https://www.signwell.com/api/v1',
      apiKey: 'test-key',
      // Recorded rather than waited on: the case is about the shape of the backoff.
      sleep: async (ms: number) => {
        delays.push(ms);
        clock += ms;
      },
      now: () => clock,
    },
  );

  return { client, requests, delays, advance: (ms: number) => { clock += ms; } };
}

const ok = (body: unknown): SignWellRawResponse => ({
  status: 200,
  headers: {},
  body: Buffer.from(JSON.stringify(body), 'utf8'),
});

describe('SignWell HTTP client', () => {
  describe('TC-04-INT-21: The rate limiter and circuit breaker protect the budget', () => {
    it('backs off through three 429s and succeeds on the fourth attempt', async () => {
      const { client, requests, delays } = harness((attempt) =>
        attempt <= 3
          ? { status: 429, headers: { 'x-ratelimit-remaining': '0' }, body: Buffer.alloc(0) }
          : ok({ id: 'sw-1', status: 'Created' }),
      );

      const document = await client.createDocument(CREATE_BODY);

      expect(document.id).toBe('sw-1');
      expect(requests).toHaveLength(4);
      // Three waits, each longer than the one before it.
      expect(delays).toHaveLength(3);
      for (let index = 1; index < delays.length; index++) {
        expect(delays[index]).toBeGreaterThan(delays[index - 1]);
      }
    });

    it('opens after five consecutive failures and then fails without a network attempt', async () => {
      const { client, requests } = harness(() => ({
        status: 500,
        headers: {},
        body: Buffer.alloc(0),
      }));

      await expect(client.createDocument(CREATE_BODY)).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
      const spent = requests.length;
      expect(spent).toBe(5);

      // Fails fast: the same observable outcome as a timeout, without spending a call.
      await expect(client.getDocument('sw-1')).rejects.toMatchObject({
        detail: 'circuit_open',
      });
      expect(requests.length).toBe(spent);
    });

    it('closes again once the breaker window has passed', async () => {
      let failing = true;
      const { client, requests, advance } = harness(() =>
        failing ? { status: 500, headers: {}, body: Buffer.alloc(0) } : ok({ id: 'sw-2' }),
      );

      await expect(client.createDocument(CREATE_BODY)).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
      const spent = requests.length;
      await expect(client.getDocument('sw-1')).rejects.toMatchObject({ detail: 'circuit_open' });
      expect(requests.length).toBe(spent);

      failing = false;
      advance(60_001);

      expect(await client.getDocument('sw-2')).toMatchObject({ id: 'sw-2' });
      expect(requests.length).toBeGreaterThan(spent);
    });
  });
});
