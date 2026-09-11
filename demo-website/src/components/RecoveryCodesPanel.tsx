import { useState } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';
import { Icon } from './Icon';
import { formatCodesForDownload } from '@/services/recoveryService';

export type RecoveryCodesPanelProps = {
  codes: string[];
  identity: string;
  /** Called once the user confirms they have saved them. */
  onAcknowledge?: () => void;
};

/**
 * Shows a freshly generated set of recovery codes.
 *
 * This is the only moment these codes exist in readable form - the server keeps
 * only PBKDF2 hashes and genuinely cannot show them again. The panel therefore
 * does three things deliberately:
 *
 *   - makes copying and downloading easy, because the alternative is a user who
 *     skips the step and finds out months later
 *   - says plainly that they will not be shown again
 *   - requires an explicit acknowledgement rather than a dismissible toast
 */
export function RecoveryCodesPanel({ codes, identity, onAcknowledge }: RecoveryCodesPanelProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be denied. The codes are on screen and selectable,
      // so nothing is actually lost.
    }
  }

  function download() {
    const blob = new Blob([formatCodesForDownload(codes, identity)], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `nlr-identity-recovery-codes-${identity.split('@')[0] ?? 'account'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Release the blob. Without this the file stays in memory for the life of
    // the document.
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-card border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-3.5">
        <h2 className="text-[0.9375rem] font-semibold text-navy-900">
          Save your recovery codes
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Each code works once. They are the way back in if you lose your device.
        </p>
      </div>

      <div className="p-5">
        <Alert tone="warning" title="You will not see these again">
          They are stored hashed, exactly like a password, so nobody - including this site - can
          display them a second time. Save them somewhere safe and offline now.
        </Alert>

        <ul className="mt-4 grid grid-cols-1 gap-1.5 rounded border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          {codes.map((code, index) => (
            <li
              key={code}
              className="flex items-center gap-2.5 font-mono text-sm text-navy-900"
            >
              <span className="w-5 shrink-0 text-right text-xs text-slate-400">{index + 1}.</span>
              <span className="tracking-wide select-all">{code}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button variant="secondary" onClick={() => void copyAll()}>
            <Icon name="check" className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy all'}
          </Button>
          <Button variant="secondary" onClick={download}>
            Download as .txt
          </Button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Treat these like passwords: anyone holding one can bypass your second factor. Do not
          store them in the same place as your password, and do not photograph them.
        </p>

        {onAcknowledge !== undefined && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-accent-600"
              />
              I have saved these codes somewhere safe.
            </label>

            <Button
              className="mt-4"
              size="lg"
              disabled={!confirmed}
              onClick={onAcknowledge}
              fullWidth
            >
              Continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
