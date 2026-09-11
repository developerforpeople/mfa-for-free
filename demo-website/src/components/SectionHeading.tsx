import { cn } from '@/utils/cn';

export type SectionHeadingProps = {
  /** Small uppercase label above the title. Optional. */
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
};

/**
 * Consistent heading block for every section.
 *
 * Left-aligned by default: documentation reads better left-aligned, and
 * centred body copy is one of the tells of a generic landing page.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow !== undefined && (
        <p className="mb-2.5 text-xs font-semibold tracking-[0.08em] text-accent-600 uppercase">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl sm:text-[1.75rem]">{title}</h2>
      {description !== undefined && <p className="mt-3 text-slate-600">{description}</p>}
    </div>
  );
}
