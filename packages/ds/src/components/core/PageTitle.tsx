import React from 'react';

export interface PageTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  title?: string;
  /** Wins over `title` when both are given — for a heading with tagged content inside it. */
  children?: React.ReactNode;
}

/**
 * PageTitle — a single `<h1>` whose type steps up with the viewport: the headline-6 step by
 * default, headline-5 from 768px and headline-4 from 1200px, so the sizes are 16/24 (500),
 * 20/30 (450) and 24/36 (450) with letter-spacing -0.32px, -0.32px and -0.7px.
 *
 * Those are media queries, so they cannot be inline — the three steps live in `base.css` as
 * `.page-title`, the one global rule this component leans on. That is the layout rule the
 * whole system follows: CSS holds only what an inline style cannot express.
 *
 * §17 — the title may be a node. A heading that has to tag a name and an email inside itself
 * needs children rather than a string, and the `<h1>` needs to be reachable by a test.
 */
export function PageTitle({ title, children, className, ...rest }: PageTitleProps) {
  return (
    <h1 {...rest} className={['page-title', className].filter(Boolean).join(' ')}>
      {children != null ? children : title}
    </h1>
  );
}
