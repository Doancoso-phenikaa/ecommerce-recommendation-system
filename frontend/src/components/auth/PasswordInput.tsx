import { useState, type ChangeEvent } from 'react';

interface PasswordInputProps {
  id: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  hasError?: boolean;
}

export function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  hasError = false,
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="password-input">
      <input
        id={id}
        name={name}
        type={isVisible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id}-error` : undefined}
        required
      />
      <button
        type="button"
        className="password-input__toggle"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={isVisible}
      >
        {isVisible ? 'Ẩn' : 'Hiện'}
      </button>
    </div>
  );
}
