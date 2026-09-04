import { INestApplication } from '@nestjs/common';
import { readdir } from 'fs/promises';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { Storage } from '../src/hiring/storage/storage';
import { StubCalendarProvider } from './stub-calendar.provider';
import { formatBookedWhen } from '@devscribed/validation';
import {
  CV_BYTES,
  TIME_ZONE,
  bootHiringApp,
  firstSlot,
  resetDatabase,
  signup,
} from './hiring.helpers';

/**
 * The public booking path, end to end: what a booking writes, what a repeat booking
 * does to the candidate it already knows, and what is left behind when the calendar
 * refuses half-way through.
 */
describe('Hiring — booking', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;
  let storage: Storage;

  const createVacancy = async (
    session: { organizationId: string; accountId: string; cookies: string[] },
    title = 'Senior React Engineer',
  ): Promise<{ id: string; slug: string }> => {
    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${session.organizationId}/hiring/vacancies`)
      .set('Cookie', session.cookies)
      .send({ title, interviewerAccountId: session.accountId, durationMinutes: 60 });

    if (response.status !== 201) {
      throw new Error(`Precondition failed: vacancy create answered ${response.status}`);
    }
    return { id: response.body.id, slug: response.body.publicSlug };
  };

  const book = (
    slug: string,
    values: { firstName: string; lastName: string; email: string; startUtc: string; note?: string },
  ) => {
    const call = request(app.getHttpServer())
      .post(`/api/book/${slug}`)
      .field('firstName', values.firstName)
      .field('lastName', values.lastName)
      .field('email', values.email)
      .field('startUtc', values.startUtc)
      .field('timeZone', TIME_ZONE);
    if (values.note) call.field('note', values.note);
    return call.attach('cv', CV_BYTES, {
      filename: 'jane-doe-cv.pdf',
      contentType: 'application/pdf',
    });
  };

  /** Everything `LocalFsStorage` currently holds — an empty root reads as none. */
  const storedFiles = async (): Promise<string[]> =>
    readdir(process.env.STORAGE_FS_ROOT!)
      .then((names) => names.sort())
      .catch(() => [] as string[]);

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
    calendar.reset();
    await resetDatabase(prisma);
  });

  /** TC-H02-INT-01 */
  it('creates exactly one event and one application', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);

    const response = await book(vacancy.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'Jane@Example.com',
      startUtc,
      note: 'Available from October.',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      vacancyTitle: 'Senior React Engineer',
      durationMinutes: 60,
      startUtc,
      email: 'jane@example.com',
      cvFileName: 'jane-doe-cv.pdf',
    });
    // Nothing internal comes back through the public endpoint.
    expect(response.body.applicationId).toBeUndefined();
    expect(response.body.candidateId).toBeUndefined();

    const events = [...calendar.events.entries()];
    expect(events).toHaveLength(1);
    const [eventId, event] = events[0];
    expect(event.mailbox).toBe('pat@acme.com');
    expect(event.draft.attendee.email).toBe('jane@example.com');
    expect(event.draft.attachment?.fileName).toBe('jane-doe-cv.pdf');

    const candidates = await prisma.candidate.findMany();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ email: 'jane@example.com', firstName: 'Jane' });

    const applications = await prisma.application.findMany();
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({
      status: 'scheduled',
      submittedName: 'Jane Doe',
      timeZone: 'UTC',
      graphEventId: eventId,
      cvFileName: 'jane-doe-cv.pdf',
      note: 'Available from October.',
    });
    expect(applications[0].start.toISOString()).toBe(startUtc);
    // 60-minute vacancy, 60 minutes booked.
    expect(applications[0].end.getTime() - applications[0].start.getTime()).toBe(60 * 60_000);

    // The stored key is opaque and application-generated — never the uploaded name, and
    // since 07 §07.35 never the application's id either: that shape is a single slot,
    // and this document is only the first the candidate may submit.
    const [version] = await prisma.applicationCv.findMany({
      where: { applicationId: applications[0].id },
    });
    expect(applications[0].cvKey).toBe(`${version.id}.pdf`);
    expect(applications[0].cvKey).not.toContain(applications[0].id);
    expect(applications[0].cvKey).not.toContain('jane');

    // Version one is written with the booking, in the same transaction: an application
    // whose first version was missing would read as one already replaced.
    expect(version).toMatchObject({
      key: applications[0].cvKey,
      fileName: 'jane-doe-cv.pdf',
      contentType: 'application/pdf',
      sizeBytes: CV_BYTES.length,
    });

    const stored = await storage.get(applications[0].cvKey!);
    expect(stored?.bytes.equals(CV_BYTES)).toBe(true);
    expect(stored?.contentType).toBe('application/pdf');
  });

  /** TC-H02-INT-02 */
  it('reuses the candidate on a second booking and overwrites their name', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancyA = await createVacancy(admin, 'React Engineer');
    const vacancyB = await createVacancy(admin, 'DotNet Engineer');

    const first = await book(vacancyA.slug, {
      firstName: 'Jon',
      lastName: 'Smith',
      email: 'jane@example.com',
      startUtc: await firstSlot(app, vacancyA.slug),
    });
    expect(first.status).toBe(201);

    const second = await book(vacancyB.slug, {
      firstName: 'Jonathan',
      lastName: 'Smith',
      email: 'jane@example.com',
      startUtc: await firstSlot(app, vacancyB.slug),
    });
    expect(second.status).toBe(201);

    const candidates = await prisma.candidate.findMany();
    expect(candidates).toHaveLength(1);
    // The latest booking wins: a typo in the first must not be permanent.
    expect(candidates[0]).toMatchObject({ firstName: 'Jonathan', lastName: 'Smith' });

    const applications = await prisma.application.findMany({ orderBy: { createdAt: 'asc' } });
    expect(applications).toHaveLength(2);
    expect(applications.map((a) => a.vacancyId).sort()).toEqual([vacancyA.id, vacancyB.id].sort());
    // History is intact — the first application still records what went into its invite.
    const forA = applications.find((a) => a.vacancyId === vacancyA.id)!;
    expect(forA.submittedName).toBe('Jon Smith');
  });

  /** TC-H02-INT-03 */
  it('blocks a repeat future booking for the same vacancy, naming the existing time', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancyA = await createVacancy(admin, 'React Engineer');
    const vacancyB = await createVacancy(admin, 'DotNet Engineer');
    const first = await firstSlot(app, vacancyA.slug);

    expect(
      (await book(vacancyA.slug, {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        startUtc: first,
      })).status,
    ).toBe(201);

    const repeat = await book(vacancyA.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: await firstSlot(app, vacancyA.slug),
    });

    expect(repeat.status).toBe(409);
    expect(repeat.body.error).toBe('already_booked');
    // The date, the time, and the zone of the interview they already have.
    expect(repeat.body.message).toBe(
      `You already have an interview for this position on ${formatBookedWhen(
        new Date(first),
        TIME_ZONE,
      )} (${TIME_ZONE}).`,
    );
    expect([...calendar.events.values()]).toHaveLength(1);
    expect(await prisma.application.count({ where: { vacancyId: vacancyA.id } })).toBe(1);

    // Another position is not a duplicate — one person applying to two roles is normal.
    const other = await book(vacancyB.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: await firstSlot(app, vacancyB.slug),
    });
    expect(other.status).toBe(201);
    expect(await prisma.application.count()).toBe(2);
  });

  /** TC-H02-INT-04 */
  it('lets a candidate whose interview is in the past book again', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);

    expect(
      (await book(vacancy.slug, {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        startUtc,
      })).status,
    ).toBe(201);

    // Interviewing three months ago makes someone a re-interview, not a duplicate, and
    // the only way to have a past application is for time to have passed.
    const past = new Date(Date.now() - 90 * 24 * 60 * 60_000);
    await prisma.application.updateMany({
      data: { start: past, end: new Date(past.getTime() + 60 * 60_000) },
    });
    calendar.reset();

    const again = await book(vacancy.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: await firstSlot(app, vacancy.slug),
    });

    expect(again.status).toBe(201);
    expect(await prisma.candidate.count()).toBe(1);
    expect(await prisma.application.count()).toBe(2);
  });

  /** TC-H02-INT-05 */
  it('never reveals the duplicate to an incomplete probe', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    expect(
      (await book(vacancy.slug, {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        startUtc: await firstSlot(app, vacancy.slug),
      })).status,
    ).toBe(201);

    // There is no endpoint that takes an email alone, so the cheapest probe available is
    // a submission missing the CV — and it is answered before the duplicate is looked up.
    const probe = await request(app.getHttpServer())
      .post(`/api/book/${vacancy.slug}`)
      .field('firstName', 'Jane')
      .field('lastName', 'Doe')
      .field('email', 'jane@example.com')
      .field('startUtc', await firstSlot(app, vacancy.slug))
      .field('timeZone', TIME_ZONE);

    expect(probe.status).toBe(422);
    expect(probe.body.fields.cv).toBe('Please attach your CV');
    expect(JSON.stringify(probe.body)).not.toContain('already have an interview');
  });

  /** TC-H02-INT-07 */
  it('leaves nothing behind when the calendar fails part-way', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);
    // Earlier tests in this run stored their own CVs, so the assertion is that this
    // booking added nothing — not that the directory is empty.
    const before = await storedFiles();
    calendar.failOnCreate = true;

    const response = await book(vacancy.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc,
    });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('booking_failed');

    expect([...calendar.events.values()]).toHaveLength(0);
    expect(await prisma.candidate.count()).toBe(0);
    expect(await prisma.application.count()).toBe(0);
    // The CV was stored before the event was attempted, so it must have been removed —
    // asserted against the directory itself, since no record survives to name the key.
    expect(await storedFiles()).toEqual(before);
  });

  it('cancels the event it created when the write that follows fails', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);
    // The vacancy disappears between the event and the application insert.
    const original = prisma.$transaction.bind(prisma);
    jest
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('write failed') as never);

    const response = await book(vacancy.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc,
    });

    expect(response.status).toBe(503);
    expect(calendar.cancelled).toHaveLength(1);
    expect([...calendar.events.values()]).toHaveLength(0);
    expect(await prisma.application.count()).toBe(0);
    prisma.$transaction = original;
  });

  it('rejects a start time that was never offered', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);
    // Inside the day, but off the 60-minute anchor.
    const offAnchor = new Date(new Date(startUtc).getTime() + 7 * 60_000).toISOString();

    const response = await book(vacancy.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: offAnchor,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('slot_taken');
    expect(await prisma.application.count()).toBe(0);
  });

  it('re-enforces CV validation on the server', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);

    const wrongType = await request(app.getHttpServer())
      .post(`/api/book/${vacancy.slug}`)
      .field('firstName', 'Jane')
      .field('lastName', 'Doe')
      .field('email', 'jane@example.com')
      .field('startUtc', startUtc)
      .field('timeZone', TIME_ZONE)
      .attach('cv', CV_BYTES, { filename: 'cv.pages', contentType: 'application/octet-stream' });

    expect(wrongType.status).toBe(422);
    expect(wrongType.body.fields.cv).toBe(
      'Unsupported file type. Accepted: .pdf, .doc, .docx, .rtf, .txt',
    );

    const missing = await request(app.getHttpServer())
      .post(`/api/book/${vacancy.slug}`)
      .field('firstName', 'Jane')
      .field('lastName', 'Doe')
      .field('email', 'jane@example.com')
      .field('startUtc', startUtc)
      .field('timeZone', TIME_ZONE);

    expect(missing.status).toBe(422);
    expect(missing.body.fields.cv).toBe('Please attach your CV');
    expect(await prisma.application.count()).toBe(0);
  });

  it('reveals nothing for an unknown slug', async () => {
    await signup(app, 'pat@acme.com');

    const response = await request(app.getHttpServer()).get('/api/book/does-not-exist-AAAAAAAAAAAA');

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('Acme');
  });

  it('keeps the interviewer out of the public vacancy response', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);

    const response = await request(app.getHttpServer()).get(`/api/book/${vacancy.slug}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      organizationName: 'Acme Inc',
      vacancy: {
        title: 'Senior React Engineer',
        description: null,
        durationMinutes: 60,
        status: 'open',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('pat@acme.com');
  });

  it('serves the CV only to a signed-in member of the organization', async () => {
    const admin = await signup(app, 'pat@acme.com', 'Acme Inc');
    const stranger = await signup(app, 'sam@globex.com', 'Globex');
    const vacancy = await createVacancy(admin);
    await book(vacancy.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: await firstSlot(app, vacancy.slug),
    });
    const application = (await prisma.application.findFirst())!;
    const path = `/api/organizations/${admin.organizationId}/hiring/applications/${application.id}/cv`;

    const anonymous = await request(app.getHttpServer()).get(path);
    expect(anonymous.status).toBe(401);

    const outsider = await request(app.getHttpServer())
      .get(
        `/api/organizations/${stranger.organizationId}/hiring/applications/${application.id}/cv`,
      )
      .set('Cookie', stranger.cookies);
    expect(outsider.status).toBe(404);

    const member = await request(app.getHttpServer()).get(path).set('Cookie', admin.cookies);
    expect(member.status).toBe(200);
    expect(member.headers['content-type']).toContain('application/pdf');
    expect(member.headers['content-disposition']).toContain('jane-doe-cv.pdf');
    expect(Buffer.from(member.body).equals(CV_BYTES)).toBe(true);
    // The storage key never reaches a client.
    expect(JSON.stringify(member.headers)).not.toContain(application.cvKey!);
  });
});
