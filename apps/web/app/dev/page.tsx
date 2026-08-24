import { DevConsole } from './DevConsole';

/**
 * LOCAL DEVELOPMENT AFFORDANCE — not part of the product.
 *
 * A single screen that makes the document-signing flow walkable in a browser without curl
 * and without touching the database. It closes two gaps and dies with them:
 *
 *  - the outbox exists because local mail goes to an in-memory sink, so the second
 *    signer's magic link has nowhere to be read. **A real mail transport retires it.**
 *  - the role switcher exists because signup always creates an `admin` and there is no
 *    invite flow. **user-management spec 04 retires it.**
 *
 * It is deliberately outside `/org/[orgId]`: it needs no session, no org scope, and no
 * application shell, and it must never appear in the product's navigation. The only way
 * here is typing the address. The API endpoints behind it 404 in production, at which
 * point this page renders its "not available" state rather than a broken screen.
 */
export const metadata = { title: 'Development console' };

export default function DevPage() {
  return <DevConsole />;
}
