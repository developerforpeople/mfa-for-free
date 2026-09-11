import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type ContainerProps = {
  children: ReactNode;
  /** `wide` is for full sections, `narrow` for reading-width prose. */
  width?: 'wide' | 'narrow';
  className?: string;
};

/**
 * Horizontal layout wrapper.
 *
 * One component owns the page gutter and max width so that every section lines
 * up. If you find yourself writing `max-w-*` and `px-*` in a section, use this
 * instead.
 */
export function Container({ children, width = 'wide', className }: ContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-5 sm:px-8',
        width === 'wide' ? 'max-w-6xl' : 'max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
