import Link from 'next/link';
import { AuthLayout } from '@/ds';

export const metadata = { title: 'Sign in · Teammerly' };

/**
 * Placeholder shell. Spec 01 owns only the entry point into signup — the sign-in
 * form itself belongs to a later spec.
 *
 * The link carries `signup-login-link` because TC-01-E2E-07 names that selector for
 * the "Create an account" link on this page; the signup page uses the same id for its
 * counterpart link. The two are never on screen together.
 */
export default function LoginPage() {
  return (
    <AuthLayout title="Sign in" subtitle="Welcome back.">
      <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
        Sign-in is not available yet.
      </p>
      <p style={{ marginTop: 'var(--sp-8)', fontSize: 'var(--fs-14)' }}>
        <Link href="/signup" data-testid="signup-login-link" style={{ textDecoration: 'none' }}>
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
