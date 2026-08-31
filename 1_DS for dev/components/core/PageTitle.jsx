import React from 'react';

/**
 * PageTitle — recreated from components/shared/PageTitle: a single <h1> whose type steps up
 * with the viewport. PageTitle.module.scss applies @include headLine6 by default,
 * headLine5 from 768px and headLine4 from 1200px, so the sizes are 16/24 (500), 20/30 (450)
 * and 24/36 (450) with letter-spacing -0.32px, -0.32px and -0.7px.
 * Those are media queries, so they cannot be inline — the three steps live in base.css as
 * `.page-title`, the one global rule this component leans on (like .input-label elsewhere).
 *
 * §17 — `...rest` and a node title. Prod's every page title is a bare string because prod's
 * every page title is a bare string; a heading that has to tag a name and an email inside
 * itself needs children, and the `<h1>` needs to be reachable by a test.
 */
export function PageTitle({ title, children, className, ...rest }) {
  return (
    <h1 {...rest} className={['page-title', className].filter(Boolean).join(' ')}>
      {children != null ? children : title}
    </h1>
  );
}
