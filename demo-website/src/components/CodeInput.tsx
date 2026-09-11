import { useId } from 'react';
import { cn } from '@/utils/cn';

export type CodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Submitted when the field reaches `digits` characters. */
  onComplete?: (value: string) => void;
  digits?: number;
  label?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

/**
 * Entry field for a one-time code.
 *
 * A single wide input rather than one box per digit. Per-digit boxes look
 * impressive and are consistently worse: they break paste, confuse screen
 * readers, and fight password managers and SMS autofill. One input with
 * `inputMode="numeric"` and `autoComplete="one-time-code"` gets the numeric
 * keypad on mobile and lets the platform offer the code automatically.
 *
 * Non-digits are stripped as you type, so pasting `482 931` works.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  digits = 6,
  label = 'Verification code',
  error,
  disabled = false,
  autoFocus = false,
}: CodeInputProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasError = error !== undefined && error !== '';

  function handleChange(raw: string) {
    const cleaned = raw.replace(/\D/g, '').slice(0, digits);
    onChange(cleaned);

    // Submit as soon as the code is complete. Making someone press a button
    // after typing the last digit is a step with no purpose.
    if (cleaned.length === digits && onComplete !== undefined) {
      onComplete(cleaned);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-navy-900">
        {label}
      </label>

      <input
        id={id}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={digits}
        placeholder={'0'.repeat(digits)}
        aria-invalid={hasError}
        aria-describedby={hasError ? messageId : undefined}
        className={cn(
          'mt-1.5 w-full rounded-control border bg-white px-3 py-2.5 text-center font-mono',
          'text-2xl tracking-[0.4em] text-navy-900 transition-colors',
          'placeholder:text-slate-300 focus:outline-none disabled:bg-slate-50',
          hasError
            ? 'border-danger-600 focus:border-danger-600'
            : 'border-slate-300 focus:border-accent-600',
        )}
      />

      {hasError && (
        <p id={messageId} role="alert" className="mt-1.5 text-xs text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
