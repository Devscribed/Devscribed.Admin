import { ManageScreen } from './ManageScreen';

/**
 * The product's second public route, and the only one addressed by a per-booking token
 * (spec 07).
 *
 * Like `/book/{slug}` it sits outside `/org/{orgId}` and renders in neither `AppShell`
 * nor `AuthLayout` — a candidate with no session must never be shown the application
 * frame or a sign-in prompt.
 *
 * The slug travels beside the token because the token alone would identify the booking
 * but not the organization: a link that no longer resolves still has to render the
 * wordmark, the vacancy title, and a "New booking" button that leads somewhere
 * (07 §03.13).
 */
export default async function ManagePage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  return <ManageScreen slug={slug} token={token} />;
}
