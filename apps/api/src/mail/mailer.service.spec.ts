import { MailerService } from './mailer.service';

describe('MailerService (in-memory capture)', () => {
  let mailer: MailerService;

  beforeEach(() => {
    mailer = new MailerService();
  });

  it('captures sent emails and returns the most recent for a recipient', async () => {
    await mailer.send({ to: 'pat@acme.com', subject: 'First', text: 'one' });
    await mailer.send({ to: 'pat@acme.com', subject: 'Second', text: 'two' });

    const last = mailer.getLastTo('pat@acme.com');
    expect(last?.subject).toBe('Second');
    expect(mailer.getAll()).toHaveLength(2);
  });

  it('matches recipients case-insensitively', async () => {
    await mailer.send({ to: 'Pat@Acme.com', subject: 'Hi', text: 'body' });
    expect(mailer.getLastTo('pat@acme.com')?.subject).toBe('Hi');
  });

  it('returns undefined when no email was sent to the recipient', () => {
    expect(mailer.getLastTo('nobody@acme.com')).toBeUndefined();
  });

  it('clear() discards captured emails', async () => {
    await mailer.send({ to: 'pat@acme.com', subject: 'Hi', text: 'body' });
    mailer.clear();
    expect(mailer.getAll()).toHaveLength(0);
  });
});
