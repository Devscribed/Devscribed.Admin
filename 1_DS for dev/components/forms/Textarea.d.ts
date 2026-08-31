export interface TextAreaProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Applies the global `.errorInput` treatment (red border + red glow). */
  error?: boolean;
  /** 8px message pinned 16px below the field; only rendered together with `error`. */
  errorMessage?: string;
}

export function TextArea(props: TextAreaProps): JSX.Element;
