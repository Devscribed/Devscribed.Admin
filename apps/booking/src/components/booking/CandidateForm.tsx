"use client";

import styles from "./booking.module.css";
import {
  ACCEPTED_CV_EXTENSIONS,
  type CandidateFieldErrors,
} from "@/lib/bookings/validation";

export interface CandidateFormValues {
  firstName: string;
  lastName: string;
  email: string;
  note: string;
}

export interface CandidateFormProps {
  values: CandidateFormValues;
  errors: CandidateFieldErrors;
  /** Which fields should surface their error (after blur/submit). */
  showError: (field: keyof CandidateFieldErrors) => boolean;
  onChange: (patch: Partial<CandidateFormValues>) => void;
  onBlurField: (field: keyof CandidateFieldErrors) => void;
  onCvChange: (file: File | null) => void;
  cvFileName: string | null;
  disabled?: boolean;
  /** When true, name/email are shown read-only (Reschedule page, Phase 6). */
  readOnlyIdentity?: boolean;
}

const ACCEPT = ACCEPTED_CV_EXTENSIONS.join(",");

/** Candidate details form: name, email, CV upload, optional note. */
export function CandidateForm({
  values,
  errors,
  showError,
  onChange,
  onBlurField,
  onCvChange,
  cvFileName,
  disabled = false,
  readOnlyIdentity = false,
}: CandidateFormProps): React.JSX.Element {
  return (
    <div className={styles.form}>
      <div className={styles.row}>
        <TextField
          id="firstName"
          label="First name"
          required
          readOnly={readOnlyIdentity}
          value={values.firstName}
          error={showError("firstName") ? errors.firstName : undefined}
          disabled={disabled}
          onChange={(v) => onChange({ firstName: v })}
          onBlur={() => onBlurField("firstName")}
        />
        <TextField
          id="lastName"
          label="Last name"
          required
          readOnly={readOnlyIdentity}
          value={values.lastName}
          error={showError("lastName") ? errors.lastName : undefined}
          disabled={disabled}
          onChange={(v) => onChange({ lastName: v })}
          onBlur={() => onBlurField("lastName")}
        />
      </div>

      <TextField
        id="email"
        label="Email"
        type="email"
        required
        readOnly={readOnlyIdentity}
        value={values.email}
        error={showError("email") ? errors.email : undefined}
        disabled={disabled}
        onChange={(v) => onChange({ email: v })}
        onBlur={() => onBlurField("email")}
      />

      <div className={styles.field}>
        <label htmlFor="cv" className={styles.required}>
          CV
        </label>
        <input
          id="cv"
          type="file"
          accept={ACCEPT}
          disabled={disabled}
          aria-invalid={showError("cv") && Boolean(errors.cv)}
          aria-describedby={errors.cv ? "cv-error" : undefined}
          onChange={(e) => onCvChange(e.target.files?.[0] ?? null)}
        />
        {cvFileName && <span>Selected: {cvFileName}</span>}
        {showError("cv") && errors.cv && (
          <span id="cv-error" role="alert" className={styles.error}>
            {errors.cv}
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="note">Note (optional)</label>
        <textarea
          id="note"
          className={styles.textarea}
          rows={3}
          disabled={disabled}
          value={values.note}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </div>
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}

function TextField({
  id,
  label,
  value,
  type = "text",
  required = false,
  readOnly = false,
  error,
  disabled,
  onChange,
  onBlur,
}: TextFieldProps): React.JSX.Element {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={required ? styles.required : undefined}>
        {label}
      </label>
      {readOnly ? (
        <div className={styles.readonlyValue} id={id}>
          {value}
        </div>
      ) : (
        <input
          id={id}
          type={type}
          className={styles.input}
          value={value}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      )}
      {error && (
        <span id={`${id}-error`} role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
