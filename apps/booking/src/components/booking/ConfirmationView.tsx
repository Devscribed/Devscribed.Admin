import { DateTime } from "luxon";

import styles from "./booking.module.css";
import type { BookingResultDto } from "@/lib/bookings/dto";

/**
 * Post-booking confirmation. The full Manage Booking page (reschedule/cancel)
 * arrives in Phase 5; this summarizes the booking and links to it.
 */
export function ConfirmationView({
  result,
}: {
  result: BookingResultDto;
}): React.JSX.Element {
  const when = DateTime.fromISO(result.start, { zone: "utc" })
    .setZone(result.timeZone)
    .toFormat("cccc, LLLL d, yyyy 'at' HH:mm");
  const { candidate } = result;

  return (
    <section className={styles.confirmation} aria-live="polite">
      <h2>You’re booked!</h2>
      <p>
        A calendar invite has been emailed to{" "}
        <strong>{candidate.email}</strong>. You can reschedule or cancel any
        time before the interview.
      </p>

      <dl className={styles.summaryList}>
        <dt>Interview</dt>
        <dd>
          {result.interview.name} ({result.interview.durationMinutes} min)
        </dd>
        <dt>When</dt>
        <dd>
          {when} ({result.timeZone})
        </dd>
        <dt>Name</dt>
        <dd>
          {candidate.firstName} {candidate.lastName}
        </dd>
        <dt>Email</dt>
        <dd>{candidate.email}</dd>
        {candidate.note && (
          <>
            <dt>Note</dt>
            <dd>{candidate.note}</dd>
          </>
        )}
      </dl>

      <p>
        <a href={result.manageUrl}>Manage your booking</a>
      </p>
    </section>
  );
}
