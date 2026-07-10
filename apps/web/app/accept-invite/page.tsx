import { Suspense } from 'react';
import AcceptInviteForm from './accept-form';

export default function AcceptInvitePage() {
  return (
    <main className="auth-shell">
      <div className="card" data-testid="accept-invite-screen">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </main>
  );
}
