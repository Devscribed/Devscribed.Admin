import { Suspense } from 'react';
import { ConfirmEmailScreen } from './ConfirmEmailScreen';

export const metadata = { title: 'Confirm your email · Teammerly' };

/**
 * `useSearchParams` needs a Suspense boundary to prerender. The fallback is deliberately
 * empty: the screen's own checking state takes over the instant it mounts — identical to
 * `app/reset-password/page.tsx`.
 */
export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmEmailScreen />
    </Suspense>
  );
}
