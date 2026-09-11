import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Internal route. Renders a react-router `<Link>`. */
  to?: string;
  /** External URL. Renders an `<a>`. */
  href?: string;
  /** Adds the safety attributes every external link needs. */
  external?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  /** Shows a spinner and blocks further clicks. */
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-control border font-medium ' +
  'transition-colors duration-150 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<ButtonVariant, string> = {
  // Solid accent. One per screen region - if everything is primary, nothing is.
  primary:
    'bg-accent-600 border-accent-600 text-white hover:bg-accent-700 hover:border-accent-700 active:bg-accent-800',
  // Bordered neutral. The default for anything that is not the main action.
  secondary:
    'bg-white border-slate-300 text-navy-900 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100',
  // Borderless, for tertiary actions and navigation.
  ghost: 'bg-transparent border-transparent text-slate-600 hover:text-navy-900 hover:bg-slate-100',
  // Destructive actions only: revoking a device, deleting an account.
  danger: 'bg-white border-slate-300 text-danger-600 hover:bg-red-50 hover:border-danger-600',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-11 px-5 text-[0.9375rem]',
};

/** Small inline spinner. The only animation in the design system. */
function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M8 1.5a6.5 6.5 0 016.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The project's only button.
 *
 * Renders a `<Link>` for internal routes, an `<a>` for external URLs, and a
 * `<button>` otherwise - so navigation stays real navigation. Right-click,
 * middle-click, and screen readers all keep working, which a div with an
 * onClick handler would quietly break.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  to,
  href,
  external = false,
  type = 'button',
  onClick,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
}: ButtonProps) {
  const classes = cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className);

  if (to !== undefined) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  if (href !== undefined) {
    return (
      <a
        href={href}
        className={classes}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
