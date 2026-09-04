import { redirect } from 'next/navigation';

/**
 * My interviews, forwarded to what it became (03 §06.25).
 *
 * The screen is gone; the list it showed is the candidate database's `Assigned to me`
 * scope, so the old address is not dead — it is the long way round to a tab. The route
 * survives as this redirect because it travelled: it is in bookmarks, in the rail people
 * used yesterday, and in whatever anyone pasted into a chat.
 *
 * A **server** redirect rather than a `useEffect`, so nobody watches a page mount only to
 * be sent elsewhere, and no request is spent on a screen that will not be drawn. It is
 * the one page under this shell that is not a client component, which is why it renders
 * nothing at all.
 */
export default async function MyInterviewsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/org/${orgId}/hiring/candidates?scope=mine`);
}
