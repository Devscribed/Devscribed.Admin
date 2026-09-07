import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { NullRequestNotifier } from '../src/requests/null-request-notifier';
import { PrismaService } from '../src/prisma.service';
import { RequestNotificationsService } from '../src/requests/request-notifications.service';
import type {
  DeliveryOutcome,
  RequestNotificationDelivery,
} from '../src/requests/request-notifier';
import { RequestNotifier } from '../src/requests/request-notifier';

const TEST_BCRYPT_ROUNDS = 4;

/**
 * The port's own table of outcomes, reproduced by one double.
 *
 * Each mode is a row of the spec's adapter table or of an outcome `DeliveryOutcome`
 * allows — the shipped adapter itself in `ship`, a provider that throws, one that blocks
 * until released, one that never returns, and one that reports a delivery on a channel
 * this release ships no adapter for. Nothing here reproduces the spec's prose; the shape
 * under test is the port.
 */
type NotifierMode = 'ship' | 'throw' | 'block' | 'hang' | 'delivered';

class ProgrammableNotifier extends RequestNotifier {
  mode: NotifierMode = 'ship';
  readonly calls: RequestNotificationDelivery[] = [];
  /** Run on entry into a blocked call, before it waits. */
  onEnter: ((notification: RequestNotificationDelivery) => Promise<void>) | null = null;

  private gate = Promise.resolve();
  private open: (() => void) | null = null;
  private readonly shipped = new NullRequestNotifier();

  /** Close the gate a `block` call waits on. */
  hold(): void {
    this.gate = new Promise<void>((resolve) => {
      this.open = resolve;
    });
  }

  release(): void {
    this.open?.();
    this.open = null;
  }

  reset(mode: NotifierMode): void {
    this.mode = mode;
    this.calls.length = 0;
    this.onEnter = null;
    this.gate = Promise.resolve();
    this.open = null;
    if (mode === 'hang') this.hold();
  }

  async deliver(notification: RequestNotificationDelivery): Promise<DeliveryOutcome> {
    this.calls.push(notification);
    switch (this.mode) {
      case 'throw':
        throw new Error('provider refused the message');
      case 'delivered':
        return {
          status: 'delivered',
          channel: 'email',
          providerKey: 'test-email',
          providerRef: 'provider-ref-1',
        };
      case 'hang':
        // Never returns for the duration of the case: every row it is handed stays
        // `pending` while the screens are read. The gate is opened only in teardown, so
        // the suite itself can finish.
        await this.gate;
        return this.shipped.deliver(notification);
      case 'block':
        if (this.onEnter) await this.onEnter(notification);
        await this.gate;
        return this.shipped.deliver(notification);
      default:
        return this.shipped.deliver(notification);
    }
  }
}

describe('Request notifications (requests spec 03)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let notifier: ProgrammableNotifier;
  let notifications: RequestNotificationsService;

  const server = () => app.getHttpServer();

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
    email: string;
  }

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName: 'Pat',
      lastName: 'Owner',
      email,
      password: 'Passw0rd',
    });
    const accountId = response.body.account.id as string;
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId } });
    return {
      cookies: response.headers['set-cookie'] as unknown as string[],
      accountId,
      organizationId: response.body.organization.id as string,
      membershipId: membership.id,
      email,
    };
  };

  const login = (email: string, password = 'Passw0rd') =>
    request(server()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: { email: string; role: string },
  ): Promise<Signed> => {
    const passwordHash = await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: { email: opts.email, passwordHash, firstName: 'Test', lastName: 'User' },
    });
    const membership = await prisma.membership.create({
      data: { accountId: account.id, organizationId, role: opts.role, status: 'active' },
    });
    const cookies = (await login(opts.email)).headers['set-cookie'] as unknown as string[];
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: membership.id,
      email: opts.email,
    };
  };

  interface Rig {
    admin: Signed;
    requester: Signed;
    contact: { cookies: string[]; clientMembershipId: string; email: string };
    clientId: string;
    projectId: string;
    clientTopicId: string;
  }

  /**
   * An organization holding a client with one contact, a project of that client the
   * requester works on, and an admin who is party to nothing.
   */
  const buildRig = async (prefix: string): Promise<Rig> => {
    const admin = await signupAdmin(`${prefix}-admin@acme.test`, `Acme ${prefix}`);
    const clientResponse = await request(server())
      .post(`/api/organizations/${admin.organizationId}/clients`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Acme Client' });
    expect(clientResponse.status).toBe(201);
    const clientId = clientResponse.body.client.id as string;

    const projectResponse = await request(server())
      .post(`/api/organizations/${admin.organizationId}/projects`)
      .set('Cookie', admin.cookies)
      .send({ name: `${prefix} Redesign`, clientId });
    expect(projectResponse.status).toBe(201);
    const projectId = (projectResponse.body.project?.id ?? projectResponse.body.id) as string;

    const requester = await createMember(admin.organizationId, {
      email: `${prefix}-requester@acme.test`,
      role: 'user',
    });
    const assigned = await request(server())
      .post(`/api/organizations/${admin.organizationId}/projects/${projectId}/members`)
      .set('Cookie', admin.cookies)
      .send({ membershipIds: [requester.membershipId] });
    expect(assigned.status).toBe(200);

    const email = `${prefix}-contact@acme.example`;
    const invited = await request(server())
      .post(`/api/organizations/${admin.organizationId}/clients/${clientId}/contacts`)
      .set('Cookie', admin.cookies)
      .send({ email });
    expect(invited.status).toBe(201);
    const token = mail.sentInvitations.filter((m) => m.to === email).slice(-1)[0].token;
    const accepted = await request(server()).post('/api/invitations/accept').send({
      token,
      firstName: 'Dana',
      lastName: 'Stone',
      password: 'Passw0rd',
    });
    expect(accepted.status).toBe(200);
    const row = await prisma.clientMembership.findFirstOrThrow({ where: { account: { email } } });
    const cookies = (await login(email)).headers['set-cookie'] as unknown as string[];

    const topic = await prisma.requestTopic.findFirstOrThrow({
      where: { organizationId: admin.organizationId, audience: 'client', name: 'Access' },
    });

    return {
      admin,
      requester,
      contact: { cookies, clientMembershipId: row.id, email },
      clientId,
      projectId,
      clientTopicId: topic.id,
    };
  };

  const raiseRequest = async (rig: Rig, title = 'Warehouse access'): Promise<string> => {
    const response = await request(server())
      .post(`/api/organizations/${rig.admin.organizationId}/requests`)
      .set('Cookie', rig.requester.cookies)
      .send({
        topicId: rig.clientTopicId,
        title,
        projectId: rig.projectId,
        assigneeKind: 'client',
        assigneeClientMembershipId: rig.contact.clientMembershipId,
      });
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  const postMessage = (cookies: string[], orgId: string, requestId: string, body: string) =>
    request(server())
      .post(`/api/organizations/${orgId}/requests/${requestId}/messages`)
      .set('Cookie', cookies)
      .send({ body });

  beforeAll(async () => {
    notifier = new ProgrammableNotifier();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .overrideProvider(RequestNotifier)
      .useValue(notifier)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
    notifications = app.get(RequestNotificationsService);
  });

  afterAll(async () => {
    notifier.release();
    await app.close();
  });

  beforeEach(async () => {
    notifier.reset('ship');
    await prisma.requestNotification.deleteMany();
    await prisma.requestEvent.deleteMany();
    await prisma.requestMessage.deleteMany();
    await prisma.request.deleteMany();
    await prisma.requestTopic.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.clientMembership.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
  });

  afterEach(async () => {
    // Nothing may be left blocked between cases: a drain still waiting on the gate would
    // be waited on by the next case's `settled()`.
    notifier.release();
    await notifications.settled();
  });

  // TC-03-INT-24
  it('writes a row per recipient with its event, and the shipped adapter skips every one', async () => {
    const rig = await buildRig('int24');
    const requestId = await raiseRequest(rig);
    expect(
      (await postMessage(rig.requester.cookies, rig.admin.organizationId, requestId, 'Any news?'))
        .status,
    ).toBe(201);
    const answered = await request(server())
      .post(`/api/organizations/${rig.admin.organizationId}/requests/${requestId}/answer`)
      .set('Cookie', rig.contact.cookies)
      .send({});
    expect(answered.status).toBe(200);

    // The route does not wait for delivery, so neither can the assertion: it waits for
    // the drain the route scheduled instead of reading the instant the route answered.
    await notifications.settled();

    const rows = await prisma.requestNotification.findMany({
      where: { requestId },
      include: { event: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(3);
    const actions = rows.map((row) => row.event.action).sort();
    expect(actions).toEqual(['created', 'message_posted', 'status_changed']);

    for (const row of rows) {
      expect(row.event.requestId).toBe(requestId);
      expect(row.status).toBe('skipped');
      expect(row.channel).toBe('none');
      expect(row.providerKey).toBeNull();
      expect(row.handledAt).not.toBeNull();
      expect(row.attempts).toBe(1);
    }

    // The shipped adapter makes no outbound call of any kind: no mail message of any
    // type reached the sink beyond the invitation the rig itself sent.
    expect(mail.sent.filter((message) => message.type !== 'invitation')).toHaveLength(0);
  });

  // TC-03-INT-25
  it('notifies the other party and nobody else, never the actor', async () => {
    const rig = await buildRig('int25');
    // An admin who is party to nothing: they hold view-all-requests and may read the
    // request, which makes them no recipient.
    const requestId = await raiseRequest(rig);
    await notifications.settled();
    await prisma.requestNotification.deleteMany();

    const byRequester = await postMessage(
      rig.requester.cookies,
      rig.admin.organizationId,
      requestId,
      'Any news?',
    );
    expect(byRequester.status).toBe(201);
    await notifications.settled();

    const afterRequester = await prisma.requestNotification.findMany({ where: { requestId } });
    expect(afterRequester).toHaveLength(1);
    expect(afterRequester[0].recipientKind).toBe('client');
    expect(afterRequester[0].recipientId).toBe(rig.contact.clientMembershipId);

    await prisma.requestNotification.deleteMany();

    const byContact = await postMessage(
      rig.contact.cookies,
      rig.admin.organizationId,
      requestId,
      'Working on it.',
    );
    expect(byContact.status).toBe(201);
    await notifications.settled();

    const afterContact = await prisma.requestNotification.findMany({ where: { requestId } });
    expect(afterContact).toHaveLength(1);
    expect(afterContact[0].recipientKind).toBe('member');
    expect(afterContact[0].recipientId).toBe(rig.requester.membershipId);

    const everyRecipient = await prisma.requestNotification.findMany();
    expect(
      everyRecipient.filter((row) => row.recipientId === rig.admin.membershipId),
    ).toHaveLength(0);
  });

  // TC-03-INT-26
  it('calls the notifier only after the commit, and holds no lock while it blocks', async () => {
    const rig = await buildRig('int26');

    notifier.reset('block');
    notifier.hold();

    let rowCommittedWhenCalled: boolean | null = null;
    let calledAt: number | null = null;
    notifier.onEnter = async (notification) => {
      calledAt = Date.now();
      // Read through the ordinary client, outside any transaction of the route's: the
      // row is visible, so the transaction that wrote it has committed.
      const row = await prisma.requestNotification.findUnique({
        where: { id: notification.id },
      });
      rowCommittedWhenCalled = row !== null;
    };

    const answeredAt = Date.now();
    const requestId = await raiseRequest(rig, 'Blocked provider');
    const routeReturnedAt = Date.now();
    expect(routeReturnedAt).toBeGreaterThanOrEqual(answeredAt);

    // The route has answered while the double is still held.
    await waitFor(() => calledAt !== null);
    expect(rowCommittedWhenCalled).toBe(true);

    // And it holds no row lock on the request: another write on the same row goes
    // through while the provider is still blocked.
    const posted = await postMessage(
      rig.requester.cookies,
      rig.admin.organizationId,
      requestId,
      'Still open for business.',
    );
    expect(posted.status).toBe(201);

    notifier.release();
    await notifications.settled();
  });

  // TC-03-INT-27
  it('leaves the request exactly as committed when the notifier throws', async () => {
    const rig = await buildRig('int27');
    notifier.reset('throw');

    const requestId = await raiseRequest(rig, 'Throwing provider');
    const answered = await request(server())
      .post(`/api/organizations/${rig.admin.organizationId}/requests/${requestId}/answer`)
      .set('Cookie', rig.contact.cookies)
      .send({});
    expect(answered.status).toBe(200);
    await notifications.settled();

    const read = await request(server())
      .get(`/api/organizations/${rig.admin.organizationId}/requests/${requestId}`)
      .set('Cookie', rig.requester.cookies);
    expect(read.status).toBe(200);
    expect(read.body.request.status).toBe('answered');
    expect(read.body.events.map((event: { action: string }) => event.action).sort()).toEqual([
      'created',
      'status_changed',
    ]);

    const rows = await prisma.requestNotification.findMany({ where: { requestId } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe('failed');
      expect(row.lastError).toBeTruthy();
      // Never an address: none is stored on the row and none is resolved to write one.
      expect(row.lastError).not.toContain(rig.contact.email);
      expect(row.lastError).not.toContain(rig.requester.email);
      expect(row.lastError).not.toContain('@');
    }
  });

  // TC-03-INT-28
  it('cannot produce a second row for one event and recipient', async () => {
    const rig = await buildRig('int28');
    const requestId = await raiseRequest(rig);
    await notifications.settled();

    const posted = await postMessage(
      rig.requester.cookies,
      rig.admin.organizationId,
      requestId,
      'Any news?',
    );
    expect(posted.status).toBe(201);
    await notifications.settled();

    const event = await prisma.requestEvent.findFirstOrThrow({
      where: { requestId, action: 'message_posted' },
    });
    const rows = await prisma.requestNotification.findMany({ where: { eventId: event.id } });
    expect(rows).toHaveLength(1);
    const attemptsAfterFirstDrain = rows[0].attempts;

    // Dispatching the same event's row again delivers it at most once more: the row has
    // left `pending`, so the handled row is not attempted a second time.
    notifications.dispatch([rows[0].id]);
    await notifications.settled();
    const afterSecondDispatch = await prisma.requestNotification.findMany({
      where: { eventId: event.id },
    });
    expect(afterSecondDispatch).toHaveLength(1);
    expect(afterSecondDispatch[0].attempts).toBe(attemptsAfterFirstDrain);

    // And a second row for the same event and recipient is rejected by the constraint,
    // not by a check-then-write.
    await expect(
      prisma.requestNotification.create({
        data: {
          organizationId: rig.admin.organizationId,
          requestId,
          eventId: event.id,
          recipientKind: rows[0].recipientKind,
          recipientId: rows[0].recipientId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(await prisma.requestNotification.count({ where: { eventId: event.id } })).toBe(1);
  });

  // TC-03-INT-29
  it('answers every read path identically while no row has ever been delivered', async () => {
    const rig = await buildRig('int29');
    const orgId = rig.admin.organizationId;

    // The baseline: one request handled by the shipped adapter.
    const handledId = await raiseRequest(rig, 'Handled request');
    await notifications.settled();

    notifier.reset('hang');
    const pendingId = await raiseRequest(rig, 'Pending request');
    expect(
      (await postMessage(rig.requester.cookies, orgId, pendingId, 'Any news?')).status,
    ).toBe(201);
    const answered = await request(server())
      .post(`/api/organizations/${orgId}/requests/${pendingId}/answer`)
      .set('Cookie', rig.contact.cookies)
      .send({});
    expect(answered.status).toBe(200);

    const pendingRows = await prisma.requestNotification.findMany({
      where: { requestId: pendingId },
    });
    expect(pendingRows.length).toBeGreaterThan(0);
    expect(pendingRows.every((row) => row.status === 'pending')).toBe(true);

    // Both parties read the same product they would with every row handled.
    const contactList = await request(server())
      .get(`/api/organizations/${orgId}/requests`)
      .set('Cookie', rig.contact.cookies);
    expect(contactList.status).toBe(200);
    expect(contactList.body.requests.map((row: { id: string }) => row.id).sort()).toEqual(
      [handledId, pendingId].sort(),
    );
    // The badge counts the non-terminal requests addressed to them, `answered` included,
    // which is exactly what it counts with every row handled.
    expect(contactList.body.counts.waitingOnMe).toBe(2);
    expect(contactList.body.counts.total).toBe(2);

    const requesterList = await request(server())
      .get(`/api/organizations/${orgId}/requests`)
      .set('Cookie', rig.requester.cookies);
    expect(requesterList.status).toBe(200);
    expect(requesterList.body.requests).toHaveLength(2);

    const detail = await request(server())
      .get(`/api/organizations/${orgId}/requests/${pendingId}`)
      .set('Cookie', rig.contact.cookies);
    expect(detail.status).toBe(200);
    expect(detail.body.request.status).toBe('answered');
    expect(detail.body.messages).toHaveLength(1);
  });

  // TC-03-INT-30
  it('stores a delivery on a channel this release ships no adapter for', async () => {
    const rig = await buildRig('int30');
    notifier.reset('delivered');

    const requestId = await raiseRequest(rig, 'Delivered by a future adapter');
    await notifications.settled();

    const rows = await prisma.requestNotification.findMany({ where: { requestId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'delivered',
      channel: 'email',
      providerKey: 'test-email',
      providerRef: 'provider-ref-1',
    });
    expect(rows[0].handledAt).not.toBeNull();
  });
});

/** Spin until a condition holds, or give up — used only to wait on a scheduled drain. */
async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('condition never held');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
