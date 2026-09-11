import { cn } from '@/utils/cn';

export type FlowStep = {
  /** Which side of the system performs this step. */
  actor: 'User' | 'Website' | 'Server' | 'Device';
  title: string;
  description: string;
  /** What crosses the wire during this step, if anything. */
  transfers?: string;
  /** Marks a step that happens with no network connection at all. */
  offline?: boolean;
};

export type FlowDiagramProps = {
  steps: FlowStep[];
  className?: string;
};

/** Actor labels are colour-coded so the two sides of the handshake are visible. */
const actorStyles: Record<FlowStep['actor'], string> = {
  User: 'border-slate-200 bg-slate-50 text-slate-600',
  Website: 'border-accent-200 bg-accent-50 text-accent-700',
  Server: 'border-navy-200 bg-navy-50 text-navy-700',
  Device: 'border-green-200 bg-green-50 text-success-600',
};

/**
 * Vertical, numbered authentication flow.
 *
 * Rendered as an ordered list with a connecting rail rather than as an image,
 * so the sequence is readable by a screen reader, selectable as text, and
 * legible on a phone. A flow chart exported as a PNG is a flow chart nobody
 * can search, translate, or read at 320px.
 */
export function FlowDiagram({ steps, className }: FlowDiagramProps) {
  return (
    <ol className={cn('relative', className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Rail: the connecting line between step markers. */}
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute top-8 left-[15px] h-[calc(100%-2rem)] w-px bg-slate-200"
              />
            )}

            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white font-mono text-xs font-medium text-slate-500">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[0.6875rem] font-medium',
                    actorStyles[step.actor],
                  )}
                >
                  {step.actor}
                </span>
                <h3 className="text-sm font-semibold text-navy-900">{step.title}</h3>
                {step.offline === true && (
                  <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[0.6875rem] text-slate-500">
                    offline
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.description}</p>

              {step.transfers !== undefined && (
                <p className="mt-2 font-mono text-xs text-slate-400">
                  <span className="text-slate-500">transfers:</span> {step.transfers}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
