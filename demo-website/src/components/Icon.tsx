import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type IconName =
  | 'shield'
  | 'qr'
  | 'clock'
  | 'lock'
  | 'devices'
  | 'lifebuoy'
  | 'github'
  | 'book'
  | 'arrow-right'
  | 'check';

export type IconProps = {
  name: IconName;
  className?: string;
};

/**
 * Inline SVG icon set.
 *
 * Icons are drawn here rather than pulled from a package for two reasons: the
 * set is small enough that a dependency is not worth it, and inline paths
 * inherit `currentColor`, so an icon always matches the text beside it.
 *
 * All paths are drawn on a 24x24 grid with a 1.6 stroke, matching the
 * restrained line-icon style used across the site. No filled or coloured
 * illustrations - they read as decoration, and this is a documentation site.
 */
export function Icon({ name, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('h-5 w-5 shrink-0', className)}
    >
      {paths[name]}
    </svg>
  );
}

const paths: Record<IconName, ReactNode> = {
  shield: <path d="M12 3l7 2.6v5.2c0 4.2-2.9 7.7-7 8.7-4.1-1-7-4.5-7-8.7V5.6L12 3z" />,
  qr: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h3v3h-3zM20.5 14v3M17.5 20.5h3M14 20.5h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5" />
      <path d="M8 10.5V7.8a4 4 0 018 0v2.7" />
    </>
  ),
  devices: (
    <>
      <rect x="2.5" y="5" width="12" height="9" rx="1.5" />
      <rect x="16.5" y="9" width="5" height="10" rx="1.2" />
      <path d="M6 17.5h5" />
    </>
  ),
  lifebuoy: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M14.5 9.5L18 6M9.5 9.5L6 6M14.5 14.5L18 18M9.5 14.5L6 18" />
    </>
  ),
  github: (
    <path
      d="M12 2.6a9.4 9.4 0 00-3 18.3c.5.1.6-.2.6-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.8.8.1-.6.3-1.1.6-1.3-2.1-.2-4.3-1-4.3-4.6 0-1 .4-1.9 1-2.5-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.6 1a9 9 0 014.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.6.6.6 1 1.5 1 2.5 0 3.6-2.2 4.4-4.3 4.6.3.3.6.9.6 1.8v2.7c0 .3.2.6.7.5A9.4 9.4 0 0012 2.6z"
      strokeWidth={0}
      fill="currentColor"
    />
  ),
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 015.5 4H10a2.5 2.5 0 012.5 2.5V20a2 2 0 00-2-2H4z" />
      <path d="M20.5 5.5A1.5 1.5 0 0019 4h-4.5A2.5 2.5 0 0012 6.5V20a2 2 0 012-2h6.5z" />
    </>
  ),
  'arrow-right': <path d="M5 12h13m-5.5-5.5L18 12l-5.5 5.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};
