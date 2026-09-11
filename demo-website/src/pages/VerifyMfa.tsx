import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/Button';
import { ClockHint } from '@/components/ClockHint';
import { CodeInput } from '@/components/CodeInput';
import { Input } from '@/components/Input';
import { useAuth } from '@/context/useAuth';
import { MfaError, redeemRecoveryCode, verifyLoginCode } from '@/services/mfaService';
import { logout } from '@/services/userService';
import { TOTP_DIGITS } from '@/utils/constants';

/** Which credential the user is presenting. */
type Mode = 'code' | 'recovery';

/**
 * The second factor at sign-in.
 *
 * Reached after the password check, when the account has an active device. The
 * user presents either a code from their authenticator or a recovery code.
 *
 * ## What this screen genuinely is, and is not
 *
 * This is **UI-level gating**. The Firebase session already exists by the time
 * you get here - the password created it - so a determined user could bypass
 * this screen by editing client state. It is honest about that in the note at
 * the bottom.
 *
 * A production system closes that hole on the server: verification happens in a
 * Cloud Function which then mints a custom token or sets a custom claim, and
 * the Firestore rules refuse to serve account data until that claim is present.
 * The browser then cannot skip the step, because skipping it yields a session
 * the database will not talk to.
 *
 * `examples/integration-examples/` shows that shape. The demo stops short of it
 * because Cloud Functions need a billing plan.
 */
export function VerifyMfa() {
  const { user, profile, markMfaVerified } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('code');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  async function submitCode(submitted: string) {
    if (user === null || busy) return;

    setBusy(true);
    setError(null);

    try {
      await verifyLoginCode(user.uid, submitted);
      markMfaVerified();
      void navigate('/dashboard', { replace: true });
    } catch (caught) {
      setError(caught instanceof MfaError ? caught.message : 'Verification failed.');
      setFailedAttempts((count) => count + 1);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function submitRecoveryCode() {
    if (user === null || busy) return;

    setBusy(true);
    setError(null);

    try {
      await redeemRecoveryCode(user.uid, recoveryCode);
      markMfaVerified();
      // Straight to the dashboard, which prompts to enrol a replacement device.
      // Someone using a recovery code has lost their phone, and leaving them
      // with one fewer code and no new device is how people end up locked out.
      void navigate('/dashboard', { replace: true, state: { usedRecoveryCode: true } });
    } catch (caught) {
      setError(caught instanceof MfaError ? caught.message : 'That recovery code was rejected.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    await logout();
    void navigate('/login', { replace: true });
  }

  return (
    <AuthCard
      title="Two-factor verification"
      description={
        profile === null
          ? 'Enter the code from your authenticator.'
          : `Signing in as ${profile.nlrIdentity}. Enter the code from your authenticator.`
      }
    >
      <div className="space-y-4">
        {error !== null && <Alert tone="error">{error}</Alert>}

        {mode === 'code' && <ClockHint attempts={failedAttempts} />}

        {mode === 'code' ? (
          <>
            <CodeInput
              value={code}
              onChange={setCode}
              onComplete={(value) => void submitCode(value)}
              error={undefined}
              disabled={busy}
              autoFocus
              label={`${TOTP_DIGITS}-digit code`}
            />

            <Button
              onClick={() => void submitCode(code)}
              loading={busy}
              disabled={code.length !== TOTP_DIGITS}
              fullWidth
              size="lg"
            >
              Verify
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode('recovery');
                setError(null);
              }}
              className="w-full text-center text-sm text-accent-600 hover:text-accent-700"
            >
              Lost your device? Use a recovery code
            </button>
          </>
        ) : (
          <>
            <Input
              label="Recovery code"
              placeholder="A7K2M-9XQR4"
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              hint="One of the ten codes you saved when you turned MFA on. Each works once."
              disabled={busy}
            />

            <Button
              onClick={() => void submitRecoveryCode()}
              loading={busy}
              disabled={recoveryCode.trim().length < 8}
              fullWidth
              size="lg"
            >
              Use recovery code
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode('code');
                setError(null);
              }}
              className="w-full text-center text-sm text-accent-600 hover:text-accent-700"
            >
              Back to entering a code
            </button>
          </>
        )}

        <div className="border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => void cancel()}
            className="text-sm text-slate-500 hover:text-navy-900"
          >
            Cancel and sign out
          </button>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            In this demo the code is checked in your browser. A real deployment verifies it on a
            server and refuses to release account data until it has - see the note in{' '}
            <code className="font-mono">mfaService.ts</code>.
          </p>
        </div>
      </div>
    </AuthCard>
  );
}
