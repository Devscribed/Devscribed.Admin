import { BookingScreen } from './BookingScreen';

/**
 * The product's only public route. It sits outside `/org/{orgId}` deliberately: the
 * slug carries its own 72 bits of entropy, so the URL needs no organization segment
 * and stays correct when a second organization exists.
 *
 * It renders in neither `AppShell` nor `AuthLayout` — a visitor with no session must
 * never be shown the application frame or a sign-in prompt.
 */
export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingScreen slug={slug} />;
}
