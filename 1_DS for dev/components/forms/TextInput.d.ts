export interface TextInputProps {
  label?: string;
  description?: string;
  error?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}

export function TextInput(props: TextInputProps): JSX.Element;
