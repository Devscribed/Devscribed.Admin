import Link from 'next/link';
import { AuthLayout } from '@/ds';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in · Teammerly' };

/**
 * The cross-account link lives in `AuthLayout`'s footer, outside the card, mirroring
 * /signup exactly — a visitor learns one place to look for it.
 */
export default function LoginPage() {
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          New to Teammerly?{' '}
          <Link href="/signup" data-testid="login-signup-link">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
