import { Suspense } from 'react';
import { AcceptInviteScreen } from './AcceptInviteScreen';

export const metadata = { title: "You're invited · Teammerly" };

/**
 * `useSearchParams` needs a Suspense boundary to prerender. The fallback is deliberately
 * empty: the screen's own checking state takes over the instant it mounts, same pattern
 * as `/reset-password`.
 */
export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteScreen />
    </Suspense>
  );
}
