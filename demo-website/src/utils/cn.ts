/**
 * Joins class names, dropping anything falsy.
 *
 * A three-line helper instead of a dependency, because the only thing this
 * project needs from `clsx` is conditional classes:
 *
 *     cn('rounded-card border', isActive && 'border-accent-600')
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
