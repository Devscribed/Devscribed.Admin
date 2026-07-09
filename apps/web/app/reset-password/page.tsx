import { Suspense } from 'react';
import ResetPasswordForm from './reset-form';

export default function ResetPasswordPage() {
  return (
    <main className="auth-shell">
      <div className="card">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
