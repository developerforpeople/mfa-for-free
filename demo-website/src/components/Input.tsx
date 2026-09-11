import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type InputProps = {
  label: string;
  /** Validation message. Its presence switches the field to the error style. */
  error?: string;
  /** Help text shown under the field when there is no error. */
  hint?: ReactNode;
  /** Fixed text after the input, e.g. the `@nlr.com` domain suffix. */
  suffix?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

/**
 * Labelled text input.
 *
 * `forwardRef` because React Hook Form's `register()` needs the underlying DOM
 * node to read values and to focus the first invalid field on submit.
 *
 * The accessibility wiring is the part worth copying: a real `<label>` bound by
 * id, `aria-invalid` when the field fails, and `aria-describedby` pointing at
 * the message so a screen reader announces *why* the field was rejected instead
 * of just that something is wrong. `role="alert"` makes the message announce
 * when it appears.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, suffix, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const hasError = error !== undefined && error !== '';

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-navy-900">
        {label}
      </label>

      <div
        className={cn(
          'mt-1.5 flex items-stretch overflow-hidden rounded-control border bg-white transition-colors',
          hasError
            ? 'border-danger-600 focus-within:border-danger-600'
            : 'border-slate-300 focus-within:border-accent-600',
        )}
      >
        <input
          {...props}
          id={inputId}
          ref={ref}
          aria-invalid={hasError}
          aria-describedby={hasError || hint !== undefined ? messageId : undefined}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none"
        />

        {suffix !== undefined && (
          <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-500">
            {suffix}
          </span>
        )}
      </div>

      {hasError ? (
        <p id={messageId} role="alert" className="mt-1.5 text-xs text-danger-600">
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p id={messageId} className="mt-1.5 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
});
