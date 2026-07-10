"use client";

import { useMemo, useState } from "react";

import {
  AvailabilityPicker,
  type AvailabilitySelection,
} from "@/components/availability/AvailabilityPicker";
import { CandidateForm, type CandidateFormValues } from "./CandidateForm";
import { ConfirmationView } from "./ConfirmationView";
import styles from "./booking.module.css";
import type { BookingResultDto } from "@/lib/bookings/dto";
import {
  type CandidateFieldErrors,
  hasErrors,
  validateCandidateFields,
} from "@/lib/bookings/validation";
import type { InterviewType } from "@/lib/interview-types";

type SubmitState =
  | { status: "idle" | "submitting" | "slot_taken" }
  | { status: "error"; message: string };

export interface BookingPageProps {
  interview: InterviewType;
}

/**
 * The full booking page: date/time picker + candidate form + Book action.
 * Book is enabled only when a slot is selected and all required fields are
 * valid; on success the confirmation view is shown.
 */
export function BookingPage({ interview }: BookingPageProps): React.JSX.Element {
  const [selection, setSelection] = useState<AvailabilitySelection | null>(null);
  const [values, setValues] = useState<CandidateFormValues>({
    firstName: "",
    lastName: "",
    email: "",
    note: "",
  });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [touched, setTouched] = useState<
    Partial<Record<keyof CandidateFieldErrors, boolean>>
  >({});
  const [attempted, setAttempted] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const [result, setResult] = useState<BookingResultDto | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  const errors = useMemo<CandidateFieldErrors>(
    () =>
      validateCandidateFields({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        cv: cvFile ? { name: cvFile.name, size: cvFile.size } : null,
      }),
    [values, cvFile],
  );

  const slotSelected = Boolean(selection?.slotStart);
  const submitting = submit.status === "submitting";
  const canBook = slotSelected && !hasErrors(errors) && !submitting;

  const showError = (field: keyof CandidateFieldErrors): boolean =>
    (attempted || Boolean(touched[field])) && Boolean(errors[field]);

  if (result) {
    return <ConfirmationView result={result} />;
  }

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setAttempted(true);
    if (!selection?.slotStart || hasErrors(errors) || !cvFile) return;

    setSubmit({ status: "submitting" });
    try {
      const fd = new FormData();
      fd.set("interview", interview.slug);
      fd.set("start", selection.slotStart);
      fd.set("timeZone", selection.timeZone);
      fd.set("firstName", values.firstName.trim());
      fd.set("lastName", values.lastName.trim());
      fd.set("email", values.email.trim());
      if (values.note.trim()) fd.set("note", values.note.trim());
      fd.set("cv", cvFile);

      const res = await fetch("/api/bookings", { method: "POST", body: fd });
      if (res.status === 201) {
        setResult((await res.json()) as BookingResultDto);
        return;
      }
      if (res.status === 409) {
        // Slot taken between selection and booking: refresh availability and
        // ask the candidate to pick another time.
        setSubmit({ status: "slot_taken" });
        setSelection(null);
        setPickerKey((k) => k + 1);
        return;
      }
      setSubmit({
        status: "error",
        message:
          "Something went wrong completing your booking. Please try again.",
      });
    } catch {
      setSubmit({ status: "error", message: "Network error. Please try again." });
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <AvailabilityPicker
        key={pickerKey}
        durationMinutes={interview.durationMinutes}
        onSelectionChange={setSelection}
      />

      <CandidateForm
        values={values}
        errors={errors}
        showError={showError}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        onBlurField={(field) =>
          setTouched((t) => ({ ...t, [field]: true }))
        }
        onCvChange={(file) => {
          setCvFile(file);
          setTouched((t) => ({ ...t, cv: true }));
        }}
        cvFileName={cvFile?.name ?? null}
        disabled={submitting}
      />

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.bookButton}
          disabled={!canBook}
        >
          {submitting ? "Booking…" : "Book"}
        </button>
        {!slotSelected && <span>Select a date and time to book.</span>}
      </div>

      <div aria-live="polite">
        {submit.status === "slot_taken" && (
          <p role="alert" className={styles.formError}>
            That time was just taken. Please choose another time.
          </p>
        )}
        {submit.status === "error" && (
          <p role="alert" className={styles.formError}>
            {submit.message}
          </p>
        )}
      </div>
    </form>
  );
}
