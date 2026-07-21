import * as React from 'react';

export interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/** Search input with a leading magnifier glyph. 42px, 10px radius. */
export declare function SearchField(props: SearchFieldProps): JSX.Element;
