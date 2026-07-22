import { Suspense } from 'react';
import { ResetPasswordScreen } from './ResetPasswordScreen';

export const metadata = { title: 'Set a new password · Teammerly' };

/**
 * `useSearchParams` needs a Suspense boundary to prerender. The fallback is deliberately
 * empty: the screen's own checking state takes over the instant it mounts.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
