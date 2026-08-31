export interface MembersMultiFieldProps {
  label?: string;
  placeholder?: string;
  value?: any[];
  onChange?: (value: any[]) => void;
  options?: any[];
  selectAllLabel?: string;
}

export function MembersMultiField(props: MembersMultiFieldProps): JSX.Element;
