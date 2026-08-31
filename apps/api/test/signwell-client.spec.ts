import {
  HttpSignWellClient,
  ProviderRejectedRequestError,
  fieldPathsFromErrorBody,
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
  text_tags: false,
  fields: [
    [
      {
        api_id: 'Signature_1',
        type: 'signature',
        recipient_id: '1',
        page: 1,
        x: 81,
        y: 136.7,
        width: 240,
        height: 36,
        required: true,
      },
    ],
  ],
  embedded_signing: true,
  embedded_signing_notifications: false,
  reminders: false,
  expires_in: 7,
  name: 'Contractor agreement',
  metadata: { envelope_id: 'env-1', organization_id: 'org-1' },
  allow_decline: true,
  allow_reassign: false,
};

/**
 * The lookup requirement 26 makes a parameter of `createDocument`. These three cases are
 * about the retry machinery rather than about adoption, so theirs finds nothing — which
 * is exactly what they were assuming before the parameter existed.
 */
const NO_EXISTING_DOCUMENT = async () => null;

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

      const document = await client.createDocument(CREATE_BODY, NO_EXISTING_DOCUMENT);

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

      await expect(client.createDocument(CREATE_BODY, NO_EXISTING_DOCUMENT)).rejects.toBeInstanceOf(
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

      await expect(client.createDocument(CREATE_BODY, NO_EXISTING_DOCUMENT)).rejects.toBeInstanceOf(
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

  /**
   * **TC-04-INT-03, at the layer that can see it.**
   *
   * The case also exists in `signwell-send.spec.ts`, where it proves the send adopts
   * rather than creating twice. It has to exist here as well, and the reason is precisely
   * why the defect survived that one: there, `SignWellHttpClient` itself is stubbed, so
   * one adapter call is one stub call and the five-attempt retry loop inside the real
   * client never runs at all. Everything below is about what happens *between* those five
   * attempts, which is the only place a duplicate can be created.
   */
  describe('TC-04-INT-03: A create that failed without a response adopts the existing document', () => {
    it('does not repeat a create that may have landed, and adopts what it finds', async () => {
      const landed = { id: 'sw-landed', status: 'Created', metadata: { envelope_id: 'env-1' } };
      const { client, requests, delays } = harness(() => {
        // The 10s deadline in `fetchTransport` firing after SignWell committed the
        // document: the answer is lost, the document is not.
        const timeout = new Error('The operation was aborted due to timeout');
        timeout.name = 'TimeoutError';
        return timeout;
      });

      let lookups = 0;
      const document = await client.createDocument(CREATE_BODY, async () => {
        lookups += 1;
        return landed;
      });

      // The document that already exists, not a second one.
      expect(document.id).toBe('sw-landed');
      // One POST and no more: the retry was stopped before it could create a duplicate
      // carrying the real counterparties and a working signing link.
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
      expect(requests).toHaveLength(1);
      expect(lookups).toBe(1);
      // And the lookup ran after the backoff, not instead of it.
      expect(delays).toHaveLength(1);
    });

    it('still retries when the lookup shows the create never landed', async () => {
      const { client, requests } = harness((attempt) =>
        attempt === 1
          ? { status: 502, headers: {}, body: Buffer.alloc(0) }
          : ok({ id: 'sw-1', status: 'Created' }),
      );

      let lookups = 0;
      const document = await client.createDocument(CREATE_BODY, async () => {
        lookups += 1;
        return null;
      });

      // A 5xx may have been answered in front of a write that landed, so it is asked
      // about; nothing was there, so the create is repeated and succeeds.
      expect(document.id).toBe('sw-1');
      expect(requests).toHaveLength(2);
      expect(lookups).toBe(1);
    });

    it('does not spend a lookup on a 429, which the limiter refused before processing', async () => {
      const { client, requests } = harness((attempt) =>
        attempt <= 2
          ? { status: 429, headers: { 'x-ratelimit-remaining': '0' }, body: Buffer.alloc(0) }
          : ok({ id: 'sw-1', status: 'Created' }),
      );

      let lookups = 0;
      const document = await client.createDocument(CREATE_BODY, async () => {
        lookups += 1;
        return null;
      });

      expect(document.id).toBe('sw-1');
      expect(requests).toHaveLength(3);
      // Reads are a hundred and twenty a minute and creates are ten, but a rejection that
      // was never processed cannot have created anything, so none is spent here.
      expect(lookups).toBe(0);
    });
  });

  /**
   * **TC-04-INT-24, at the layer that can see it.** BUG-002.
   *
   * The other half is in `signwell-send.spec.ts`, where the real adapter proves it runs
   * no orphan scan after a refusal. This half needs the real client: the mapping from a
   * status to an error, and the field path taken out of the body, are its own and are
   * invisible from a suite that stubs it.
   */
  describe('TC-04-INT-24: A 4xx is a permanent refusal, not an outage', () => {
    /** The body a refused create actually came back with. */
    const refusal = (): SignWellRawResponse => ({
      status: 422,
      headers: {},
      body: Buffer.from(
        JSON.stringify({
          errors: {
            files: {
              file_1: {
                file_data: ['is invalid', 'The document could not be read'],
              },
            },
          },
        }),
        'utf8',
      ),
    });

    it('names the field, spends one attempt, and asks for no orphan', async () => {
      const { client, requests, delays } = harness(refusal);

      let lookups = 0;
      const failure = await client
        .createDocument(CREATE_BODY, async () => {
          lookups += 1;
          return null;
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(ProviderRejectedRequestError);
      // The distinction the sender feels: this is not an outage, and nothing that
      // branches on one may treat it as one.
      expect(failure).not.toBeInstanceOf(ProviderUnavailableError);
      expect(failure).toMatchObject({ status: 422, fieldPath: 'files.file_1.file_data' });

      // Retrying a refusal changes nothing, and nothing was created to adopt.
      expect(requests).toHaveLength(1);
      expect(delays).toHaveLength(0);
      expect(lookups).toBe(0);
    });

    it('keeps the address and discards the provider’s prose', () => {
      const body = refusal().body;
      expect(fieldPathsFromErrorBody(body)).toEqual(['files.file_1.file_data']);
      // Requirement 36 — the projection may be logged; the body may not. Nothing the
      // provider wrote about the document survives the extraction.
      expect(JSON.stringify(fieldPathsFromErrorBody(body))).not.toContain('could not be read');
    });

    it('degrades to a refusal with no field when the body names none', async () => {
      const { client } = harness(() => ({
        status: 403,
        headers: {},
        body: Buffer.from('Forbidden', 'utf8'),
      }));

      const failure = await client.createDocument(CREATE_BODY, NO_EXISTING_DOCUMENT).then(
        () => null,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(ProviderRejectedRequestError);
      expect(failure).toMatchObject({ status: 403, fieldPath: null, detail: 'status_403' });
    });

    it('leaves a 5xx an outage, retried on the same budget', async () => {
      const { client, requests } = harness(() => ({
        status: 503,
        headers: {},
        body: Buffer.alloc(0),
      }));

      await expect(
        client.createDocument(CREATE_BODY, NO_EXISTING_DOCUMENT),
      ).rejects.toBeInstanceOf(ProviderUnavailableError);
      expect(requests).toHaveLength(5);
    });
  });
});
