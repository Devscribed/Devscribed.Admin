import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/toast';
import { ViewportStamp } from '@/layout/ViewportStamp';
import '@devscribed/ds/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Teammerly',
  description: 'One account, one organization.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /* `suppressHydrationWarning` on `<html>` because the viewport stamp below writes `data-bp`,
       `data-pointer` and `data-motion` onto this node before React hydrates, and the server
       cannot have sent them — it does not know the viewport. React sees three attributes it did
       not render and reports a mismatch on the element. The scope is one node, and it is the same
       node whose attributes are deliberately client-only. */
    <html lang="en" suppressHydrationWarning>
      {/* Some browser extensions (session recorders, form fillers, extension-based
          dev tools) inject `__processed_*` and similar markers onto <body> before
          React hydrates. That is a client-only mutation the SSR HTML cannot include,
          so React reports a hydration mismatch on every request that runs in such a
          browser. suppressHydrationWarning on the body silences the diff without
          hiding real mismatches on the tree inside — that scope is one node only. */}
      <body suppressHydrationWarning>
        {/* First in the body, and synchronous, so `<html>` carries its three attributes before
            anything below is parsed and no component draws the wrong form and then corrects it
            (design-system 01 §02.7-02.8).

            **Not in `<head>`, and that is a finding rather than a preference.** A `<head>` element
            rendered by an App Router root layout is discarded by Next along with its children —
            measured: the script appeared nowhere in the served HTML and none of the three
            attributes was ever set. The body's first child runs during parsing, while
            `document.documentElement` already exists and before any content has painted, which is
            what the requirement actually asks for. */}
        <ViewportStamp />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
