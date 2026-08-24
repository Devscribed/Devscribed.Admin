import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { LocalChromiumPdfRenderer } from '../src/pdf/local-chromium-pdf-renderer';
import { InlineJobQueue } from '../src/queue/inline-job-queue';
import type { Job } from '../src/queue/job-queue';
import { PRESIGNED_URL_TTL_SECONDS } from '../src/storage/file-storage';
import { LocalFileStorage, verifyLocalDownload } from '../src/storage/local-file-storage';

/**
 * The local drivers behind the four documents-area ports, plus the mail sink's new
 * message types.
 *
 * Deliberately hermetic: no database, no Nest application, no network. These are the
 * pieces the rest of the suite assumes work, so they must not be able to fail for a
 * reason that belongs to something else.
 */
describe('infrastructure drivers', () => {
  describe('LocalFileStorage', () => {
    let root: string;
    let storage: LocalFileStorage;

    beforeAll(async () => {
      // A scratch directory rather than the real .local-storage, so a test run cannot
      // read or clobber whatever a developer produced by hand.
      root = await fs.mkdtemp(path.join(os.tmpdir(), 'devscribed-storage-'));
      process.env.LOCAL_STORAGE_DIR = root;
      storage = new LocalFileStorage();
    });

    afterAll(async () => {
      delete process.env.LOCAL_STORAGE_DIR;
      await fs.rm(root, { recursive: true, force: true });
    });

    it('round-trips bytes under a nested key', async () => {
      const key = 'signed/org-1/envelope-1/abc123.pdf';
      const bytes = Buffer.from('%PDF-1.4 pretend contract');

      await storage.put(key, bytes, 'application/pdf');

      expect(await storage.exists(key)).toBe(true);
      expect(await storage.get(key)).toEqual(bytes);
      expect(await storage.contentTypeOf(key)).toBe('application/pdf');
    });

    it('reports a missing key as absent rather than throwing', async () => {
      expect(await storage.exists('signed/org-1/envelope-1/nope.pdf')).toBe(false);
    });

    it('refuses a key that would escape the storage root', async () => {
      await expect(storage.put('signed/../../etc/passwd', Buffer.from('x'), 'text/plain'))
        .rejects.toThrow(/Unsafe storage key/);
    });

    it('produces a download URL that verifies, and stops verifying once it expires', async () => {
      const key = 'signed/org-1/envelope-2/def456.pdf';
      await storage.put(key, Buffer.from('%PDF-1.4'), 'application/pdf');

      const url = new URL(await storage.presignedUrl(key, PRESIGNED_URL_TTL_SECONDS));
      const expires = Number(url.searchParams.get('expires'));
      const signature = url.searchParams.get('signature') ?? '';

      expect(url.pathname).toBe('/api/local-files');
      expect(url.searchParams.get('key')).toBe(key);
      expect(storage.verify(key, expires, signature)).toBe(true);

      // Tampering with the key must not be enough to reach a different document, and an
      // expired link must fail the way a stale presigned S3 URL does.
      expect(storage.verify('signed/org-1/envelope-1/abc123.pdf', expires, signature)).toBe(false);
      const secret = process.env.SESSION_SECRET || 'dev-only-insecure-secret';
      const past = Math.floor(Date.now() / 1000) - 1;
      expect(verifyLocalDownload(key, past, signature, secret)).toBe(false);
    });
  });

  describe('InlineJobQueue', () => {
    const job: Job = { name: 'pdf-render', envelopeId: 'envelope-1' };

    it('runs the registered handler, but only once the transaction has committed', async () => {
      const queue = new InlineJobQueue();
      const ran: Job[] = [];
      queue.registerHandler('pdf-render', async (received) => {
        ran.push(received);
      });

      let committed = false;
      await queue.afterCommit(async () => {
        await queue.enqueue(job);
        // Requirement 27's real constraint: the handler must not observe a transaction
        // that has not landed yet.
        expect(ran).toHaveLength(0);
        committed = true;
      });
      await queue.whenIdle();

      expect(committed).toBe(true);
      expect(ran).toEqual([job]);
    });

    it('swallows a handler failure into a logged error', async () => {
      const queue = new InlineJobQueue();
      queue.registerHandler('pdf-render', async () => {
        throw new Error('Chromium fell over');
      });
      const logged = jest.spyOn(queue['log'], 'error').mockImplementation(() => undefined);

      // Requirement 31: the signature is already committed by the time this runs, so a
      // render failure must never propagate back out of the queue.
      await expect(queue.afterCommit(() => queue.enqueue(job))).resolves.toBeUndefined();
      await expect(queue.whenIdle()).resolves.toBeUndefined();

      expect(logged).toHaveBeenCalledWith(expect.stringContaining('Chromium fell over'));
      logged.mockRestore();
    });

    it('drops the job when the transaction throws', async () => {
      const queue = new InlineJobQueue();
      const ran: Job[] = [];
      queue.registerHandler('pdf-render', async (received) => {
        ran.push(received);
      });

      await expect(
        queue.afterCommit(async () => {
          await queue.enqueue(job);
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      await queue.whenIdle();

      expect(ran).toEqual([]);
    });
  });

  describe('PdfRenderer', () => {
    // Whichever driver resolves — real Chromium, or the built-in fallback writer on a
    // machine with no browser installed — the completion path must end with bytes it can
    // hash and store. That is the property, and it is the one worth asserting.
    it('produces bytes that begin with %PDF', async () => {
      const renderer = new LocalChromiumPdfRenderer();

      const pdf = await renderer.render(
        '<html><body><h1>Consulting Agreement</h1><p>Signed by both parties.</p></body></html>',
      );

      expect(pdf.length).toBeGreaterThan(0);
      expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
      // A hashable artefact is the whole point; an empty or truncated file would hash
      // just as happily, so the trailer is checked too.
      expect(pdf.toString('latin1')).toContain('%%EOF');
    }, 60_000);
  });

  describe('InMemoryMailService', () => {
    const base = {
      to: 'signer@acme.com',
      recipientName: 'Sam Signer',
      envelopeTitle: 'Consulting Agreement',
      organizationName: 'Acme',
    };
    const expiresAt = new Date('2026-01-01T00:00:00.000Z');

    const sendAll = async (mail: InMemoryMailService) => {
      await mail.sendPasswordReset({
        to: base.to,
        firstName: 'Sam',
        token: 'reset-token',
        resetUrl: 'http://localhost:3000/reset-password?token=reset-token',
      });
      await mail.sendSigningInvitation({
        ...base,
        senderName: 'Alex Admin',
        signingUrl: 'http://localhost:3000/sign/invite-token',
        expiresAt,
      });
      await mail.sendSigningReminder({
        ...base,
        senderName: 'Alex Admin',
        signingUrl: 'http://localhost:3000/sign/invite-token',
        expiresAt,
        reminderNumber: 1,
      });
      await mail.sendEnvelopeCompleted({
        ...base,
        downloadUrl: 'http://localhost:4000/api/local-files?key=signed',
        downloadExpiresAt: expiresAt,
        completedAt: expiresAt,
      });
      await mail.sendEnvelopeDeclined({
        ...base,
        declinedByName: 'Sam Signer',
        declineReason: 'Wrong counterparty',
        declinedAt: expiresAt,
      });
      await mail.sendEnvelopeVoided({
        ...base,
        voidedByName: 'Alex Admin',
        voidReason: 'Superseded',
        voidedAt: expiresAt,
      });
    };

    it('records every message type', async () => {
      const mail = new InMemoryMailService();

      await sendAll(mail);

      expect(mail.sent.map((message) => message.type)).toEqual([
        'password_reset',
        'signing_invitation',
        'signing_reminder',
        'envelope_completed',
        'envelope_declined',
        'envelope_voided',
      ]);
    });

    it('discriminates by type in lastFor, and keeps the single-argument form meaning a reset', async () => {
      const mail = new InMemoryMailService();

      await sendAll(mail);

      // The two-argument form is what an envelope test needs: the same address received
      // six messages and only one of them is the invitation.
      expect(mail.lastFor(base.to, 'signing_invitation')?.signingUrl).toBe(
        'http://localhost:3000/sign/invite-token',
      );
      expect(mail.lastFor(base.to, 'signing_reminder')?.reminderNumber).toBe(1);
      expect(mail.lastFor(base.to, 'envelope_declined')?.declineReason).toBe('Wrong counterparty');
      expect(mail.lastFor(base.to, 'envelope_voided')?.voidReason).toBe('Superseded');
      expect(mail.lastFor(base.to, 'envelope_completed')?.downloadUrl).toContain('local-files');

      // The pre-existing callers pass one argument and expect the reset — that has to
      // keep meaning what it meant before the signing messages existed.
      expect(mail.lastFor(base.to)?.token).toBe('reset-token');

      // Address matching is still case- and whitespace-insensitive.
      expect(mail.lastFor('  SIGNER@ACME.COM  ', 'signing_invitation')).toBeDefined();
      expect(mail.lastFor('nobody@acme.com', 'signing_invitation')).toBeUndefined();
    });

    it('leaves nothing recorded when the transport fails', async () => {
      const mail = new InMemoryMailService();
      mail.failNextSend();

      // Requirement 11 depends on this: the send transaction rolls back on a rejected
      // message, so the sink must not claim the message went out.
      await expect(
        mail.sendSigningInvitation({
          ...base,
          senderName: 'Alex Admin',
          signingUrl: 'http://localhost:3000/sign/invite-token',
          expiresAt,
        }),
      ).rejects.toThrow('Simulated mail transport failure');

      expect(mail.sent).toHaveLength(0);
    });
  });
});
