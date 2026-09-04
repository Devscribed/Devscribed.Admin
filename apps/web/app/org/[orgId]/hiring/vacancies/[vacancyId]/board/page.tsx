import { redirect } from 'next/navigation';

/**
 * The board, forwarded to the screen it became (01 §08.27).
 *
 * The board did not go away — it moved one route up, underneath the vacancy's own header,
 * because the design has one screen where there were two. So this address is not dead: it
 * is the long way round to the same columns. It survives as a redirect because it
 * travelled — in bookmarks, in the rail people used yesterday, and in whatever anybody
 * pasted into a chat while the two were separate pages.
 *
 * A **server** redirect rather than a `useEffect`, so nobody watches a page mount only to
 * be sent elsewhere, and no request is spent on a screen that will not be drawn. The
 * permission check is not skipped by going this way: the destination asks the same two
 * endpoints under the same guards, and a caller who may not read this vacancy still lands
 * on its not-found state.
 */
export default async function VacancyBoardRedirect({
  params,
}: {
  params: Promise<{ orgId: string; vacancyId: string }>;
}) {
  const { orgId, vacancyId } = await params;
  redirect(`/org/${orgId}/hiring/vacancies/${vacancyId}`);
}
