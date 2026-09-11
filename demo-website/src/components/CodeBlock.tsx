import { useState } from 'react';
import { cn } from '@/utils/cn';

export type CodeBlockProps = {
  /** Lines of shell or code. Passed as an array so copy-to-clipboard is exact. */
  lines: string[];
  /** Optional filename or shell label shown in the header bar. */
  label?: string;
  className?: string;
};

/**
 * Terminal-style code block with a copy button.
 *
 * Lines beginning with `#` are dimmed as comments. This is a deliberately
 * simple renderer rather than a syntax highlighter: pulling in Prism or Shiki
 * to colour four shell commands would be a large dependency for a small gain.
 */
export function CodeBlock({ lines, label, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      // Revert the label so the button does not stay stuck on "Copied".
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be blocked (insecure origin, denied permission).
      // Failing quietly is correct here - the code is still on screen and
      // selectable, so nothing is actually broken.
    }
  }

  return (
    <div
      className={cn('overflow-hidden rounded-card border border-slate-200 bg-navy-950', className)}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
        <span className="font-mono text-xs text-slate-400">{label ?? 'bash'}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded px-1.5 py-0.5 text-xs text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3.5">
        <code className="font-mono text-[0.8125rem] leading-relaxed">
          {lines.map((line, i) => (
            <span
              key={i}
              className={cn('block', line.startsWith('#') ? 'text-slate-500' : 'text-slate-100')}
            >
              {line === '' ? ' ' : line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
