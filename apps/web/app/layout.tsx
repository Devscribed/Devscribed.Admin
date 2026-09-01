import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/toast';
import '@ds/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Teammerly',
  description: 'One account, one organization.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* Some browser extensions (session recorders, form fillers, extension-based
          dev tools) inject `__processed_*` and similar markers onto <body> before
          React hydrates. That is a client-only mutation the SSR HTML cannot include,
          so React reports a hydration mismatch on every request that runs in such a
          browser. suppressHydrationWarning on the body silences the diff without
          hiding real mismatches on the tree inside — that scope is one node only. */}
      <body suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
