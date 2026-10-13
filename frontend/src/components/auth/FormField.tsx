import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  error,
  optional = false,
  children,
}: FormFieldProps) {
  return (
    <div className={`form-field${error ? ' form-field--invalid' : ''}`}>
      <div className="form-field__heading">
        <label htmlFor={htmlFor}>{label}</label>
        {optional && <span>Không bắt buộc</span>}
      </div>
      {children}
      {error && (
        <p className="form-field__error" id={`${htmlFor}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
