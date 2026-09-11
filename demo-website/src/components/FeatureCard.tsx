import { Icon, type IconName } from './Icon';

export type FeatureCardProps = {
  icon: IconName;
  title: string;
  description: string;
  /** Which build phase delivers this. Shown as a small footer note. */
  phase?: string;
};

/**
 * A single feature in the features grid.
 *
 * Presentational only - no data fetching, no state. Note the restrained
 * styling: hairline border, 6px radius, no shadow until hover. Cards that glow
 * or float are the fastest way to make a security tool look untrustworthy.
 */
export function FeatureCard({ icon, title, description, phase }: FeatureCardProps) {
  return (
    <article className="group rounded-card border border-slate-200 bg-white p-5 transition-colors duration-150 hover:border-slate-300">
      <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded border border-slate-200 bg-slate-50 text-accent-600 transition-colors duration-150 group-hover:border-accent-200 group-hover:bg-accent-50">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </div>
      <h3 className="text-[0.9375rem] font-semibold text-navy-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>
      {phase !== undefined && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">{phase}</p>
      )}
    </article>
  );
}
