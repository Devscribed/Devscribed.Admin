import Link from 'next/link';
import { AuthLayout } from '@/ds';
import { SignupForm } from './SignupForm';

export const metadata = { title: 'Create your organization · Teammerly' };

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your organization"
      subtitle="One account, one organization. You'll be its first admin."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" data-testid="signup-login-link" style={{ textDecoration: 'none' }}>
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
}
