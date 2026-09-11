import { useEffect, useState } from 'react';
import { Alert } from './Alert';
import { TOTP_PERIOD_SECONDS } from '@/utils/constants';

/**
 * Shown after a code is rejected, to point at the usual culprit.
 *
 * "That code is not correct" is technically true and practically useless. The
 * overwhelmingly common cause of a correct-looking code being rejected is that
 * the two clocks disagree - TOTP has no other shared input, so a phone even a
 * minute out produces codes for a different time step.
 *
 * This shows what time *this* browser thinks it is, so the user can glance at
 * their phone and compare. That single comparison resolves most reports of
 * "I typed it right and it said wrong".
 *
 * It deliberately does not show an expected code, which would hand anyone
 * looking over the user's shoulder a working second factor.
 */
export function ClockHint({ attempts }: { attempts: number }) {
  const [now, setNow] = useState(() => new Date());

  // Tick, so the displayed time is live rather than frozen at first render.
  // A stale clock readout on a panel about clock skew would be its own joke.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // One wrong code is usually a typo or a code that rolled mid-entry. Repeated
  // failures are what suggest a systematic problem, so hold this back until
  // then rather than blaming the clock for every slip.
  if (attempts < 2) return null;

  const utc = now.toISOString().slice(11, 19);
  const local = now.toLocaleTimeString();
  const secondsLeft = TOTP_PERIOD_SECONDS - (Math.floor(now.getTime() / 1000) % TOTP_PERIOD_SECONDS);

  return (
    <Alert tone="info" title="Codes failing repeatedly? Check the clocks">
      <p className="leading-relaxed">
        A code is derived from the shared secret and the current time, and nothing else. If your
        phone&rsquo;s clock is more than about {TOTP_PERIOD_SECONDS} seconds away from this
        one, every code it produces will be rejected.
      </p>

      <dl className="mt-2.5 space-y-1 font-mono text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">This browser (UTC)</dt>
          <dd>{utc}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">This browser (local)</dt>
          <dd>{local}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Current code expires in</dt>
          <dd>{secondsLeft}s</dd>
        </div>
      </dl>

      <p className="mt-2.5 leading-relaxed">
        Compare that with your phone. If they differ, turn on{' '}
        <strong className="font-medium">Set time automatically</strong> on whichever device is
        wrong - on Android that is Settings &rsaquo; System &rsaquo; Date &amp; time. Emulators
        drift particularly badly.
      </p>
    </Alert>
  );
}
