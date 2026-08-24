import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Injectable, Logger } from '@nestjs/common';
import {
  EnvelopeCompletedEmail,
  EnvelopeDeclinedEmail,
  EnvelopeVoidedEmail,
  MailService,
  PasswordResetEmail,
  SigningInvitationEmail,
  SigningReminderEmail,
} from './mail.service';

/**
 * The production transport: SES v2.
 *
 * Message bodies are built here rather than with SES templates, exactly as the spec
 * requires — content that lives in a SES template is content that is not in git, cannot
 * be reviewed in a pull request, and cannot be rolled back with the deploy.
 *
 * No credentials are constructed: the API assumes its role via OIDC from Vercel and the
 * SDK's default provider chain does the rest. The configuration set is what routes send,
 * delivery, bounce, and complaint events to SNS and from there into `EnvelopeEvent`, so
 * it is attached to every message, not only to the signing ones.
 */
@Injectable()
export class SesMailService extends MailService {
  private readonly logger = new Logger(SesMailService.name);
  private readonly client: SESv2Client;
  private readonly from: string;
  private readonly configurationSet?: string;

  constructor() {
    super();
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error('MAIL_TRANSPORT=ses requires MAIL_FROM');

    this.from = from;
    this.configurationSet = process.env.SES_CONFIGURATION_SET || undefined;
    this.client = new SESv2Client({ region: process.env.AWS_REGION || 'eu-central-1' });
  }

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    await this.send(
      message.to,
      'Reset your Devscribed password',
      `<p>Hi ${escape(message.firstName)},</p>` +
        `<p>Use the link below to choose a new password.</p>` +
        button(message.resetUrl, 'Reset password'),
    );
  }

  async sendSigningInvitation(message: SigningInvitationEmail): Promise<void> {
    await this.send(
      message.to,
      `${message.senderName} has sent you "${message.envelopeTitle}" to sign`,
      invitationBody(message, 'has sent you a document to sign'),
    );
  }

  async sendSigningReminder(message: SigningReminderEmail): Promise<void> {
    await this.send(
      message.to,
      `Reminder: "${message.envelopeTitle}" is waiting for your signature`,
      invitationBody(message, 'is still waiting for your signature'),
    );
  }

  async sendEnvelopeCompleted(message: EnvelopeCompletedEmail): Promise<void> {
    await this.send(
      message.to,
      `Completed: "${message.envelopeTitle}"`,
      `<p>Hi ${escape(message.recipientName)},</p>` +
        `<p>"${escape(message.envelopeTitle)}" has been signed by everyone. ` +
        `Your copy is available until ${escape(message.downloadExpiresAt.toDateString())}.</p>` +
        button(message.downloadUrl, 'Download the signed document'),
    );
  }

  async sendEnvelopeDeclined(message: EnvelopeDeclinedEmail): Promise<void> {
    await this.send(
      message.to,
      `Declined: "${message.envelopeTitle}"`,
      `<p>Hi ${escape(message.recipientName)},</p>` +
        `<p>${escape(message.declinedByName)} declined to sign ` +
        `"${escape(message.envelopeTitle)}".</p>` +
        (message.declineReason ? `<p>Reason: ${escape(message.declineReason)}</p>` : ''),
    );
  }

  async sendEnvelopeVoided(message: EnvelopeVoidedEmail): Promise<void> {
    await this.send(
      message.to,
      `Withdrawn: "${message.envelopeTitle}"`,
      `<p>Hi ${escape(message.recipientName)},</p>` +
        `<p>${escape(message.voidedByName)} withdrew "${escape(message.envelopeTitle)}". ` +
        `No further signatures are needed.</p>` +
        `<p>Reason: ${escape(message.voidReason)}</p>`,
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [to] },
        ...(this.configurationSet ? { ConfigurationSetName: this.configurationSet } : {}),
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: `<html><body>${html}</body></html>`, Charset: 'UTF-8' },
              // A text part is not decoration: HTML-only mail is a spam signal, and
              // deliverability is the whole reason for the DKIM and MAIL FROM setup.
              Text: { Data: toText(html), Charset: 'UTF-8' },
            },
          },
        },
      }),
    );
    this.logger.debug(`Sent "${subject}" to ${to}`);
  }
}

function invitationBody(message: SigningInvitationEmail, lead: string): string {
  return (
    `<p>Hi ${escape(message.recipientName)},</p>` +
    `<p>${escape(message.senderName)} at ${escape(message.organizationName)} ${lead}: ` +
    `<strong>${escape(message.envelopeTitle)}</strong>.</p>` +
    button(message.signingUrl, 'Review and sign') +
    `<p>This link expires on ${escape(message.expiresAt.toDateString())}. ` +
    `Do not forward it — it is yours alone.</p>`
  );
}

function button(url: string, label: string): string {
  return `<p><a href="${escape(url)}">${escape(label)}</a></p><p>${escape(url)}</p>`;
}

/** Enough of a text part to be readable; the HTML part is the designed one. */
function toText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Local rather than imported from `@devscribed/validation`: the escaping there is for
 * document substitution and is owned by the template rules, and an email body must not
 * start silently depending on a change made for a contract placeholder.
 */
function escape(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
