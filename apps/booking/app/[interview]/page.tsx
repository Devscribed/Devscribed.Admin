import { notFound } from "next/navigation";

import { BookingPage } from "@/components/booking/BookingPage";
import { getInterviewTypeBySlug } from "@/lib/interview-types";

/**
 * Public booking page for one interview type: logo, interview name, and the
 * booking flow (date/time picker + candidate form + Book).
 */
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ interview: string }>;
}): Promise<React.JSX.Element> {
  const { interview } = await params;
  const interviewType = getInterviewTypeBySlug(interview);
  if (!interviewType) notFound();

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1rem" }}>
      <div aria-label="Company logo" style={{ fontWeight: 700 }}>
        Devscribed
      </div>
      <h1>{interviewType.name}</h1>
      <BookingPage interview={interviewType} />
    </main>
  );
}
