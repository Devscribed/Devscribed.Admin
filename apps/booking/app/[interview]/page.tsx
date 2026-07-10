import { notFound } from "next/navigation";

import { AvailabilityPicker } from "@/components/availability/AvailabilityPicker";
import { getInterviewTypeBySlug } from "@/lib/interview-types";

/**
 * Public booking page for one interview type. Phase 3 renders the logo,
 * interview name, and the date/time picker; the candidate details form and
 * Book action are added in Phase 4.
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
      <AvailabilityPicker durationMinutes={interviewType.durationMinutes} />
    </main>
  );
}
