import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { cn } from '@/utils/cn';

export type AlertTone = 'error' | 'warning' | 'info' | 'success';

export type AlertProps = {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
};

const tones: Record<AlertTone, string> = {
  error: 'border-red-200 bg-red-50 text-danger-600',
  warning: 'border-amber-200 bg-amber-50 text-warning-600',
  info: 'border-accent-200 bg-accent-50 text-accent-700',
  success: 'border-green-200 bg-green-50 text-success-600',
};

/**
 * Inline message block for form errors and status notices.
 *
 * Errors carry `role="alert"` so screen readers announce them when they appear -
 * a failed sign-in that is only visible on screen is invisible to anyone using
 * a screen reader, which is a real accessibility failure and an easy one to fix.
 */
export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-card border px-3.5 py-3 text-sm', tones[tone], className)}
    >
      <Icon
        name={tone === 'success' ? 'check' : tone === 'info' ? 'book' : 'shield'}
        className="mt-0.5 h-4 w-4"
      />
      <div className="min-w-0 flex-1">
        {title !== undefined && <p className="font-medium">{title}</p>}
        <div className={cn('leading-relaxed', title !== undefined && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  );
}
