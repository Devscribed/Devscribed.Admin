import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@devscribed/ds/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Teammerly',
  description: 'One account, one organization.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
