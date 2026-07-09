/** An email to be sent. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** A captured email (as returned by the dev mail sink). */
export interface SentEmail extends OutgoingEmail {
  id: string;
  /** ISO timestamp. */
  sentAt: string;
}
