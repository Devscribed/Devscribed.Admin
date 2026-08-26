/**
 * The email/timezone icons on the header. Meridian's icon dictionary has no mail
 * glyph and only a "timesheets" clock glyph reused for time-of-day contexts — both
 * paths below are lifted verbatim from `1_DS for dev/templates/meridian-app/
 * MeridianApp.dc.html` (`icMail`, `P.timesheets`/`icClock`) rather than invented, so
 * this screen's icons match the rest of the product exactly. Never emoji, per the
 * design system's voice rules.
 */
export function MailIcon() {
  return (
    <svg
      width={15}
      height={13}
      viewBox="0 0 24 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ color: 'var(--text-faint)', flexShrink: 0 }}
    >
      <path d="M2 3h20v16H2zM2 4l10 8 10-8" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      style={{ color: 'var(--text-faint)', flexShrink: 0 }}
    >
      <path d="M13.15 14.275C13.2833 14.425 13.4583 14.5 13.675 14.5C13.8917 14.5 14.075 14.4167 14.225 14.25C14.3917 14.1 14.475 13.9125 14.475 13.6875C14.475 13.4625 14.4 13.275 14.25 13.125L10.825 9.7V5.4C10.825 5.2 10.7542 5.02917 10.6125 4.8875C10.4708 4.74583 10.2917 4.675 10.075 4.675C9.85833 4.675 9.67917 4.74583 9.5375 4.8875C9.39583 5.02917 9.325 5.20833 9.325 5.425V10C9.325 10.1 9.34167 10.1917 9.375 10.275C9.40833 10.3583 9.45833 10.4417 9.525 10.525L13.15 14.275ZM10 20C8.63333 20 7.34167 19.7375 6.125 19.2125C4.90833 18.6875 3.84583 17.9708 2.9375 17.0625C2.02917 16.1542 1.3125 15.0917 0.7875 13.875C0.2625 12.6583 0 11.3667 0 10C0 8.63333 0.2625 7.34167 0.7875 6.125C1.3125 4.90833 2.02917 3.84583 2.9375 2.9375C3.84583 2.02917 4.90833 1.3125 6.125 0.7875C7.34167 0.2625 8.63333 0 10 0C11.3667 0 12.6583 0.2625 13.875 0.7875C15.0917 1.3125 16.1542 2.02917 17.0625 2.9375C17.9708 3.84583 18.6875 4.90833 19.2125 6.125C19.7375 7.34167 20 8.63333 20 10C20 11.3667 19.7375 12.6583 19.2125 13.875C18.6875 15.0917 17.9708 16.1542 17.0625 17.0625C16.1542 17.9708 15.0917 18.6875 13.875 19.2125C12.6583 19.7375 11.3667 20 10 20Z" />
    </svg>
  );
}
