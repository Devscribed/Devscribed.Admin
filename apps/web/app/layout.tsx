import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Montserrat, Poppins } from 'next/font/google';
import { ToastProvider } from '@/toast';
import { ViewportStamp } from '@/layout/ViewportStamp';
import '@devscribed/ds/styles.css';
import './globals.css';

/**
 * PATCH-027 — the product's typeface, actually loaded.
 *
 * `--font-family-base` has named `'Poppins', sans-serif` since the design system was
 * written and nothing ever fetched it: a machine with Poppins installed drew the product,
 * one without drew whatever its generic sans is, and nobody could tell which they were
 * looking at.
 *
 * **Poppins carries no Cyrillic.** Even where it is installed, a Cyrillic name falls
 * through, per glyph, to whatever the browser picks next — and that family has no 500, so
 * a request for the system's `--font-weight-medium` resolves down to 400. That is why a
 * Latin name in a list is medium and a Cyrillic one beside it is not: not a missing style,
 * a missing face.
 *
 * Montserrat is the second half of the stack for that reason and no other: it is a
 * geometric sans of the same build as Poppins, it carries Cyrillic, and it carries the
 * weights the system asks for — so the fallback is a decision rather than an accident, and
 * a name in either script is drawn at the weight it was asked to be.
 */
const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const montserrat = Montserrat({
  subsets: ['cyrillic', 'cyrillic-ext', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
});

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
       node whose attributes are deliberately client-only.

       The two font variables are server-rendered on the same node and are unaffected by it:
       `suppressHydrationWarning` silences the attribute diff, it does not stop React writing
       what it did render. */
    <html lang="en" className={`${poppins.variable} ${montserrat.variable}`} suppressHydrationWarning>
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
