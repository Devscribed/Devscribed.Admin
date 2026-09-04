import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import type { Response } from 'superagent';
import { HIRING_MESSAGES } from '@devscribed/validation';
import { PrismaService } from '../src/prisma.service';
import { Storage } from '../src/hiring/storage/storage';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  CV_BYTES,
  TIME_ZONE,
  addMember,
  bookedApplication,
  bootHiringApp,
  createVacancy,
  firstSlot,
  firstSlots,
  manageTokenFor,
  resetDatabase,
  signInAs,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * The candidate replaces their own CV (spec 07 §07, phase four).
 *
 * Three rules shape nearly every test below, and each of them is a decision the obvious
 * implementation gets wrong.
 *
 * **Nothing is deleted.** Every version is kept, in `ApplicationCv` and in storage: the
 * hiring record is permanent, and what the candidate submitted at booking is evidence
 * the interviewer may already have read (07 §07.33). Only the denormalized `cv*` columns
 * move, and they name the current version.
 *
 * **Only the candidate can do it.** There is no team-side route and no team-side
 * affordance (07 §07.37). "The candidate corrected their own CV" and "somebody in the
 * organization swapped it" are very different facts about a hiring record.
 *
 * **The migration moves no files.** Keys written under the old `{applicationId}{extension}`
 * shape stay exactly as they are; the back-fill records them verbatim (00 §03.17).
 */
describe('Hiring — CV replacement', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;
  let storage: Storage;

  /** A second document, plainly not the one the booking carried. */
  const DOCX_BYTES = Buffer.from('a corrected CV, in a different format');
  const DOCX = {
    fileName: 'corrected.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  const view = (slug: string, token: string) =>
    request(app.getHttpServer()).get(`/api/manage/${slug}/${token}`);

  /** The public replacement endpoint, exactly as the manage page calls it. */
  const replaceCv = (
    slug: string,
    token: string,
    file: { bytes: Buffer; fileName: string; contentType: string } = {
      bytes: DOCX_BYTES,
      ...DOCX,
    },
  ) =>
    request(app.getHttpServer())
      .post(`/api/manage/${slug}/${token}/cv`)
      .attach('cv', file.bytes, { filename: file.fileName, contentType: file.contentType });

  /**
   * The authenticated CV endpoint, read as bytes.
   *
   * Superagent buffers a response into a `Buffer` only for the few types its parser
   * table calls binary — `application/pdf` and `application/octet-stream` among them,
   * and **not** the OOXML type a `.docx` is served as. Left to itself it hands back an
   * empty object, and an assertion against that would say nothing at all about what the
   * endpoint actually served.
   */
  const downloadCv = (session: Signed, applicationId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/cv`)
      .set('Cookie', session.cookies)
      .buffer(true)
      .parse(binaryParser);

  /** Books through the public endpoint and hands back the row it wrote. */
  async function book(
    slug: string,
    values: { email?: string; startUtc?: string; cv?: Buffer; fileName?: string } = {},
  ): Promise<{ id: string; token: string; startUtc: string }> {
    const startUtc = values.startUtc ?? (await firstSlot(app, slug));
    const email = values.email ?? 'jane@example.com';

    const response = await request(app.getHttpServer())
      .post(`/api/book/${slug}`)
      .field('firstName', 'Jane')
      .field('lastName', 'Doe')
      .field('email', email)
      .field('startUtc', startUtc)
      .field('timeZone', TIME_ZONE)
      .attach('cv', values.cv ?? CV_BYTES, {
        filename: values.fileName ?? 'jane-doe-cv.pdf',
        contentType: 'application/pdf',
      });

    if (response.status !== 201) {
      throw new Error(`Precondition failed: booking answered ${response.status}`);
    }
    const { id } = await bookedApplication(prisma, { startUtc, email });
    return { id, token: await manageTokenFor(prisma, id), startUtc };
  }

  const versionsOf = (applicationId: string) =>
    prisma.applicationCv.findMany({ where: { applicationId }, orderBy: { uploadedAt: 'asc' } });

  beforeAll(async () => {
    const harness = await bootHiringApp();
    app = harness.app;
    prisma = harness.prisma;
    calendar = harness.calendar;
    storage = app.get(Storage);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    calendar.reset();
  });

  /* ---------------------------------------------------------------- *
   * TC-H07-INT-08
   * ---------------------------------------------------------------- */

  /** TC-H07-INT-08 */
  it('keeps every version, and points the record at the newest', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const [original] = await versionsOf(booked.id);
    const response = await replaceCv(vacancy.slug, booked.token);
    expect(response.status).toBe(200);

    // 1. Two rows, and both files still in storage. Nothing is ever deleted: what the
    //    candidate submitted at booking is evidence the interviewer may have read.
    const versions = await versionsOf(booked.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ id: original.id, key: original.key, fileName: 'jane-doe-cv.pdf' });
    expect(versions[1]).toMatchObject({
      fileName: DOCX.fileName,
      contentType: DOCX.contentType,
      sizeBytes: DOCX_BYTES.length,
    });

    const first = await storage.get(versions[0].key);
    const second = await storage.get(versions[1].key);
    expect(first?.bytes.equals(CV_BYTES)).toBe(true);
    expect(first?.contentType).toBe('application/pdf');
    expect(second?.bytes.equals(DOCX_BYTES)).toBe(true);

    // The new key is the CV's own id — the shape that lets a second version exist.
    expect(versions[1].key).toBe(`${versions[1].id}.docx`);
    expect(versions[1].key).not.toBe(versions[0].key);

    // 2. The denormalized columns name the newest version, and only those four moved.
    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application).toMatchObject({
      cvKey: versions[1].key,
      cvFileName: DOCX.fileName,
      cvContentType: DOCX.contentType,
      cvSizeBytes: DOCX_BYTES.length,
    });
    expect(application.start.toISOString()).toBe(booked.startUtc);
    expect(application.isCancelled).toBe(false);

    // 3. The authenticated endpoint serves it — the card's View and Download both point
    //    there, and neither knows anything about versions.
    const download = await downloadCv(admin, booked.id);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain(DOCX.fileName);
    expect(Buffer.from(download.body).equals(DOCX_BYTES)).toBe(true);

    // 4. And the interviewer is holding the current one, not the superseded one.
    const [event] = [...calendar.events.values()];
    expect(event.draft.attachment?.fileName).toBe(DOCX.fileName);
    expect(event.draft.attachment?.bytes.equals(DOCX_BYTES)).toBe(true);
    expect(calendar.attachments).toHaveLength(1);
  });

  /**
   * A move is not a re-booking and a replacement is not a move: the event keeps its id,
   * its times and its attendee through both (07 §07.36, §12.57).
   */
  it('swaps the attachment without moving, cancelling or recreating the event', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);
    const before = [...calendar.events.entries()][0];

    expect((await replaceCv(vacancy.slug, booked.token)).status).toBe(200);

    const after = [...calendar.events.entries()][0];
    expect(after[0]).toBe(before[0]);
    expect(calendar.updated).toHaveLength(0);
    expect(calendar.cancelled).toHaveLength(0);
    expect(after[1].draft.startUtc).toEqual(before[1].draft.startUtc);
    expect(after[1].draft.attendee).toEqual(before[1].draft.attendee);
    expect(after[1].draft.body).toBe(before[1].draft.body);
  });

  /**
   * The response is `GET`'s body, which names no file. The page that just uploaded one
   * already knows what it sent, and the link is forwardable (07 §04.21).
   */
  it('answers with the record, and still names no file and nobody', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const response = await replaceCv(vacancy.slug, booked.token);

    expect(response.body).toEqual({
      organizationName: 'Acme Inc',
      vacancy: { title: 'Senior React Engineer', durationMinutes: 60, status: 'open' },
      booking: {
        startUtc: booked.startUtc,
        durationMinutes: 60,
        timeZone: TIME_ZONE,
        hasCv: true,
      },
    });
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(DOCX.fileName);
    expect(body).not.toContain('jane-doe-cv.pdf');
    expect(body).not.toContain('jane@example.com');
    expect(body).not.toContain('Jane');
  });

  /**
   * "Replacing is reachable without rescheduling, and rescheduling is reachable without
   * replacing" (07 §07.32). A candidate who spotted a typo must not have to move their
   * interview, and one who only wants a different Tuesday must not be asked about a CV.
   */
  it('is neither gated behind a reschedule nor a precondition of one', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    // Replaced, with nothing rescheduled: the interview is where it was.
    expect((await replaceCv(vacancy.slug, booked.token)).status).toBe(200);
    const afterReplace = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(afterReplace.start.toISOString()).toBe(firstStart);

    // Rescheduled, with nothing replaced: the CV is the one it was.
    const moved = await request(app.getHttpServer())
      .post(`/api/manage/${vacancy.slug}/${booked.token}/reschedule`)
      .send({ startUtc: secondStart, timeZone: TIME_ZONE });
    expect(moved.status).toBe(200);

    const afterMove = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(afterMove.start.toISOString()).toBe(secondStart);
    expect(afterMove.cvKey).toBe(afterReplace.cvKey);
    expect(await versionsOf(booked.id)).toHaveLength(2);
  });

  /**
   * Unlimited, and recorded as such rather than limited: a holder of one manage link can
   * upload 10 MB repeatedly and nothing is ever deleted (07 §15.70). A test that asserted
   * a cap would be asserting a mitigation the spec deliberately does not ship.
   */
  it('accepts replacement after replacement, keeping all of them', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    for (const name of ['second.pdf', 'third.rtf', 'fourth.txt']) {
      const response = await replaceCv(vacancy.slug, booked.token, {
        bytes: Buffer.from(`contents of ${name}`),
        fileName: name,
        contentType: 'application/octet-stream',
      });
      expect(response.status).toBe(200);
    }

    const versions = await versionsOf(booked.id);
    expect(versions.map((version) => version.fileName)).toEqual([
      'jane-doe-cv.pdf',
      'second.pdf',
      'third.rtf',
      'fourth.txt',
    ]);
    // Every key distinct, and every file still readable.
    expect(new Set(versions.map((version) => version.key)).size).toBe(4);
    for (const version of versions) {
      expect(await storage.get(version.key)).not.toBeNull();
    }
    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application.cvFileName).toBe('fourth.txt');
  });

  /* ---------------------------------------------------------------- *
   * Validation, and the states that refuse
   * ---------------------------------------------------------------- */

  /** 02's CV rules, unchanged and re-run on the server (07 validation rule 5). */
  it('re-enforces the booking page CV rules, with the booking page messages', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const unsupported = await replaceCv(vacancy.slug, booked.token, {
      bytes: Buffer.from('not a CV'),
      fileName: 'cv.pages',
      contentType: 'application/octet-stream',
    });
    expect(unsupported.status).toBe(422);
    expect(unsupported.body).toEqual({
      error: 'validation',
      fields: { cv: HIRING_MESSAGES.booking.cv.unsupportedType },
    });

    const empty = await replaceCv(vacancy.slug, booked.token, {
      bytes: Buffer.alloc(0),
      fileName: 'cv.pdf',
      contentType: 'application/pdf',
    });
    expect(empty.status).toBe(422);
    expect(empty.body.fields.cv).toBe(HIRING_MESSAGES.booking.cv.empty);

    const missing = await request(app.getHttpServer()).post(
      `/api/manage/${vacancy.slug}/${booked.token}/cv`,
    );
    expect(missing.status).toBe(422);
    expect(missing.body.fields.cv).toBe(HIRING_MESSAGES.booking.cv.required);

    // Nothing was written by any of the three.
    expect(await versionsOf(booked.id)).toHaveLength(1);
    expect(calendar.attachments).toHaveLength(0);
  });

  /**
   * Every non-live cause is one answer here too, exactly as it is on `GET` (07 §04.18) —
   * a stale link must not confirm that a particular person booked a particular interview.
   */
  it('answers 404 for every state a replacement cannot happen in', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const other = await createVacancy(app, admin, { title: 'Backend Engineer' });
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);

    const cancelled = await book(vacancy.slug, { startUtc: firstStart });
    await request(app.getHttpServer())
      .post(`/api/manage/${vacancy.slug}/${cancelled.token}/cancel`)
      .expect(200);

    const live = await book(vacancy.slug, {
      email: 'sam@example.com',
      startUtc: secondStart,
    });
    // A booking whose interview has begun: the row is wound back rather than waited for.
    const past = await book(other.slug, { email: 'lee@example.com' });
    await prisma.application.update({
      where: { id: past.id },
      data: { start: new Date(Date.now() - 60_000), end: new Date(Date.now() - 30_000) },
    });

    const refusals = [
      await replaceCv(vacancy.slug, cancelled.token),
      await replaceCv(other.slug, past.token),
      await replaceCv(vacancy.slug, 'AAAAAAAAAAAAAAAAAAAAAA'),
      await replaceCv(vacancy.slug, 'not-a-token'),
      // A live token on the wrong vacancy's slug is a link that does not resolve, not a
      // redirect to fix.
      await replaceCv(other.slug, live.token),
    ];

    for (const refusal of refusals) {
      expect(refusal.status).toBe(404);
      expect(refusal.body.error).toBeUndefined();
    }
    expect(calendar.attachments).toHaveLength(0);

    // An unknown slug is the one bare 404, and answers the same way.
    expect((await replaceCv('no-such-vacancy', live.token)).status).toBe(404);
  });

  /** Closing a vacancy stops new applicants; it does not renege on this one (07 §13.60). */
  it('still replaces on a closed vacancy', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);
    await prisma.vacancy.update({ where: { id: vacancy.id }, data: { status: 'closed' } });

    expect((await view(vacancy.slug, booked.token)).body.booking).not.toBeNull();
    expect((await replaceCv(vacancy.slug, booked.token)).status).toBe(200);
    expect(await versionsOf(booked.id)).toHaveLength(2);
  });

  /**
   * The calendar goes before the row, so a refusal leaves the record naming the CV it
   * already named — and leaves nothing behind in storage either, because nothing pointed
   * at the file yet.
   */
  it('changes nothing when the calendar refuses the new attachment', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);
    const before = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });

    calendar.failOnAttach = true;
    const response = await replaceCv(vacancy.slug, booked.token);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'cv_replace_failed',
      message: HIRING_MESSAGES.manage.cvReplaceFailed,
    });

    const after = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(after.cvKey).toBe(before.cvKey);
    expect(after.cvFileName).toBe(before.cvFileName);
    expect(await versionsOf(booked.id)).toHaveLength(1);
    // The original is still served, and still the one the interviewer holds.
    expect((await storage.get(before.cvKey!))?.bytes.equals(CV_BYTES)).toBe(true);
    expect([...calendar.events.values()][0].draft.attachment?.fileName).toBe('jane-doe-cv.pdf');

    // And a retry once the calendar recovers lands normally.
    calendar.failOnAttach = false;
    expect((await replaceCv(vacancy.slug, booked.token)).status).toBe(200);
    expect(await versionsOf(booked.id)).toHaveLength(2);
  });

  /* ---------------------------------------------------------------- *
   * The team cannot do this — 07 §07.37, 04 §07.34
   * ---------------------------------------------------------------- */

  /**
   * Not "the team's button is hidden" but "no endpoint offers it". "The candidate
   * corrected their own CV" and "somebody in the organization swapped it" are different
   * facts about a hiring record, and only the first is available.
   */
  it('offers the team no way to replace or delete a CV', async () => {
    const admin = await signup(app, 'pat@acme.com');
    // A `user` who interviews: the narrowest role that may still reschedule and cancel
    // this very interview, which is what makes the refusal below about the action rather
    // than about the caller.
    const sam = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'user',
    });
    const vacancy = await createVacancy(app, admin, { interviewerAccountId: sam.accountId });
    const booked = await book(vacancy.slug);
    const base = `/api/organizations/${admin.organizationId}/hiring/applications/${booked.id}`;

    // One at a time, and built as they are sent: every `request(app.getHttpServer())`
    // shares the one server instance, and the first response closes the ephemeral port
    // out from under any sibling that was constructed alongside it.
    const upload = (cookies: string[], method: 'post' | 'put') =>
      request(app.getHttpServer())
        [method](`${base}/cv`)
        .set('Cookie', cookies)
        .attach('cv', DOCX_BYTES, { filename: DOCX.fileName, contentType: DOCX.contentType });

    expect((await upload(admin.cookies, 'post')).status).toBe(404);
    expect((await upload(admin.cookies, 'put')).status).toBe(404);
    expect(
      (await request(app.getHttpServer()).delete(`${base}/cv`).set('Cookie', admin.cookies)).status,
    ).toBe(404);

    // Not even the assigned interviewer, who may reschedule and cancel this interview.
    const interviewer = await signInAs(app, {
      email: 'sam@acme.com',
      accountId: sam.accountId,
      organizationId: admin.organizationId,
    });
    expect((await upload(interviewer.cookies, 'post')).status).toBe(404);

    // The record is exactly as the booking left it.
    expect(await versionsOf(booked.id)).toHaveLength(1);
    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application.cvFileName).toBe('jane-doe-cv.pdf');
  });

  /* ---------------------------------------------------------------- *
   * The card's timeline — 07 §11.52, §07.38
   * ---------------------------------------------------------------- */

  /**
   * Both sources reach the card, apart: a version carries a filename and a size that have
   * no place in an event row, so it is never written as one (07 §11.52).
   */
  it('sends the versions to the card without writing a schedule event for them', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);
    const { candidateId } = await bookedApplication(prisma, {
      startUtc: booked.startUtc,
      email: 'jane@example.com',
    });

    expect((await replaceCv(vacancy.slug, booked.token)).status).toBe(200);

    const events = await prisma.applicationScheduleEvent.findMany({
      where: { applicationId: booked.id },
    });
    expect(events.map((event) => event.type)).toEqual(['booked']);

    const card = await request(app.getHttpServer())
      .get(`/api/organizations/${admin.organizationId}/hiring/candidates/${candidateId}`)
      .set('Cookie', admin.cookies)
      .expect(200);

    const [application] = card.body.applications;
    // Newest first, the order the history expands into.
    expect(application.cvVersions.map((version: { fileName: string }) => version.fileName)).toEqual([
      DOCX.fileName,
      'jane-doe-cv.pdf',
    ]);
    expect(application.cvVersions[0].sizeBytes).toBe(DOCX_BYTES.length);
    // The card's CV row names the current one, which is the newest version.
    expect(application.cv).toEqual({
      fileName: DOCX.fileName,
      sizeBytes: DOCX_BYTES.length,
    });
    // No storage key ever leaves the server, versions included (04 §07.33).
    const versions = await versionsOf(booked.id);
    for (const version of versions) {
      expect(JSON.stringify(card.body)).not.toContain(version.key);
    }
  });

  /* ---------------------------------------------------------------- *
   * TC-H07-INT-14
   * ---------------------------------------------------------------- */

  /**
   * TC-H07-INT-14
   *
   * The back-fill's own statement, lifted out of the shipped migration and run against
   * rows wound back to their pre-release shape: keys under `{applicationId}{extension}`,
   * and no `ApplicationCv` rows at all.
   *
   * Reading the SQL rather than restating it is the point. A test that reimplemented the
   * INSERT would pass while the shipped migration rewrote every key to the new shape and
   * left every file unreachable.
   */
  it('back-fills one row per CV, rewrites no key, and moves no file', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart, thirdStart] = await firstSlots(app, vacancy.slug, 3);

    const oneBytes = Buffer.from('%PDF-1.4 the first candidate CV');
    const twoBytes = Buffer.from('%PDF-1.4 a different candidate CV');
    const one = await book(vacancy.slug, {
      email: 'one@example.com',
      startUtc: firstStart,
      cv: oneBytes,
      fileName: 'one.pdf',
    });
    const two = await book(vacancy.slug, {
      email: 'two@example.com',
      startUtc: secondStart,
      cv: twoBytes,
      fileName: 'two.pdf',
    });
    // A record that lost its CV — the one application the back-fill must skip.
    const three = await book(vacancy.slug, { email: 'three@example.com', startUtc: thirdStart });

    // Wind all three back: no version rows, and the two survivors' files moved to the
    // old single-slot key shape their keys would have had before this release.
    await prisma.applicationCv.deleteMany();
    const oldKeys = new Map<string, string>();
    for (const [application, bytes] of [
      [one, oneBytes],
      [two, twoBytes],
    ] as const) {
      const current = await prisma.application.findUniqueOrThrow({
        where: { id: application.id },
      });
      const oldKey = `${application.id}.pdf`;
      await storage.put(oldKey, bytes, 'application/pdf');
      await storage.delete(current.cvKey!);
      await prisma.application.update({
        where: { id: application.id },
        data: { cvKey: oldKey },
      });
      oldKeys.set(application.id, oldKey);
    }
    const lostKey = (await prisma.application.findUniqueOrThrow({ where: { id: three.id } })).cvKey!;
    await storage.delete(lostKey);
    await prisma.application.update({
      where: { id: three.id },
      data: { cvKey: null, cvFileName: null, cvContentType: null, cvSizeBytes: null },
    });

    await runCvBackfill(prisma);
    // Twice, because the spec asks for a migration that adds nothing on a re-run.
    await runCvBackfill(prisma);

    // 1. One row per application **with** a CV — two, not three.
    const rows = await prisma.applicationCv.findMany();
    expect(rows).toHaveLength(2);
    expect(await versionsOf(three.id)).toHaveLength(0);

    // 2. Every key byte-identical to the `Application.cvKey` it was built from; none was
    //    rewritten to the `{cvId}` shape.
    for (const [applicationId, oldKey] of oldKeys) {
      const [row] = await versionsOf(applicationId);
      expect(row.key).toBe(oldKey);
      expect(row.key).not.toBe(`${row.id}.pdf`);
      expect(row.uploadedAt).toBeInstanceOf(Date);
    }

    // 3. Both files still readable at their original keys, with their original bytes and
    //    content types. Nothing was copied, renamed or deleted.
    const [rowOne] = await versionsOf(one.id);
    const [rowTwo] = await versionsOf(two.id);
    expect(rowOne).toMatchObject({ fileName: 'one.pdf', contentType: 'application/pdf' });
    expect(rowTwo).toMatchObject({ fileName: 'two.pdf', contentType: 'application/pdf' });
    expect((await storage.get(rowOne.key))?.bytes.equals(oneBytes)).toBe(true);
    expect((await storage.get(rowTwo.key))?.bytes.equals(twoBytes)).toBe(true);
    expect((await storage.get(rowOne.key))?.contentType).toBe('application/pdf');

    // 4. A replacement after the migration writes a new row under the new shape, and the
    //    original row and its file both remain.
    expect((await replaceCv(vacancy.slug, one.token)).status).toBe(200);

    const afterReplacement = await versionsOf(one.id);
    expect(afterReplacement).toHaveLength(2);
    expect(afterReplacement[0].key).toBe(oldKeys.get(one.id));
    expect(afterReplacement[1].key).toBe(`${afterReplacement[1].id}.docx`);
    expect((await storage.get(afterReplacement[0].key))?.bytes.equals(oneBytes)).toBe(true);
    expect((await storage.get(afterReplacement[1].key))?.bytes.equals(DOCX_BYTES)).toBe(true);
  });

  /**
   * An application whose CV was back-filled reads back through the authenticated
   * endpoint exactly as a freshly booked one does — the old key still addresses the file.
   */
  it('serves a back-filled CV from the key it has always had', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const current = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    const oldKey = `${booked.id}.pdf`;
    await storage.put(oldKey, CV_BYTES, 'application/pdf');
    await storage.delete(current.cvKey!);
    await prisma.applicationCv.deleteMany();
    await prisma.application.update({ where: { id: booked.id }, data: { cvKey: oldKey } });

    await runCvBackfill(prisma);

    const download = await downloadCv(admin, booked.id);
    expect(download.status).toBe(200);
    expect(Buffer.from(download.body).equals(CV_BYTES)).toBe(true);
  });
});

/**
 * Reads a response body as bytes, whatever its content type.
 *
 * The stock parsers turn everything they do not recognise as binary into an empty
 * object, so a `.docx` has to be collected off the stream by hand.
 */
function binaryParser(
  res: Response,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  // The value `.parse` is handed is the raw `IncomingMessage`, which superagent's own
  // `Response` type does not describe.
  const stream = res as unknown as NodeJS.ReadableStream & {
    setEncoding(encoding: string): unknown;
  };

  stream.setEncoding('binary');
  let data = '';
  stream.on('data', (chunk: string) => {
    data += chunk;
  });
  stream.on('end', () => callback(null, Buffer.from(data, 'binary')));
}

/**
 * The CV back-fill, lifted verbatim out of the shipped migration.
 *
 * Split on `;` at the end of a line, so the multi-line `INSERT … SELECT` survives intact.
 * Only the back-fill runs — the DDL around it has already been applied to this database
 * by `prisma migrate reset`.
 */
async function runCvBackfill(prisma: PrismaService): Promise<void> {
  const sql = readFileSync(
    join(__dirname, '..', 'prisma', 'migrations', '20260828170000_application_cv', 'migration.sql'),
    'utf8',
  );

  const statements = sql
    .split(/;\s*\n/)
    // The migration is heavily commented, and a comment block belongs to the statement
    // that follows it — so the leading `--` lines come off before anything is matched.
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((statement) => statement.startsWith('INSERT INTO "ApplicationCv"'));

  if (statements.length !== 1) {
    throw new Error(`Expected one back-fill statement, found ${statements.length}`);
  }
  await prisma.$executeRawUnsafe(statements[0]);
}
