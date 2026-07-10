import Link from "next/link";

import { INTERVIEW_TYPES } from "@/lib/interview-types";

/**
 * Dev landing page listing the public booking links. Not a spec page — a
 * convenience index while the individual booking routes are built out.
 */
export default function HomePage(): React.JSX.Element {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Book an interview</h1>
      <p>Choose an interview length:</p>
      <ul>
        {INTERVIEW_TYPES.map((type) => (
          <li key={type.slug}>
            <Link href={`/${type.slug}`}>{type.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
