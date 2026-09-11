import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ClockHint } from '@/components/ClockHint';
import { CodeInput } from '@/components/CodeInput';
import { Container } from '@/components/Container';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/Input';
import { RecoveryCodesPanel } from '@/components/RecoveryCodesPanel';
import { useAuth } from '@/context/useAuth';
import {
  beginEnrollment,
  cancelEnrollment,
  confirmEnrollment,
  formatSecretForDisplay,
  MfaError,
  type EnrollmentChallenge,
} from '@/services/mfaService';
import { deviceNameSchema, type DeviceNameFormValues } from '@/utils/validation';
import { TOTP_DIGITS, TOTP_PERIOD_SECONDS } from '@/utils/constants';

/** Which step of enrollment the user is on. */
type Step = 'name' | 'scan' | 'saved';

/**
 * MFA enrollment, end to end.
 *
 * Three steps:
 *
 *   1. name the device
 *   2. scan the QR, then type the first code to confirm it
 *   3. save the recovery codes
 *
 * Step 2 is the one that matters. Until a code from the device verifies, the
 * secret might never have arrived - a closed tab, a bad camera, a typo - so the
 * device stays `pending` and MFA stays off. Confirming proves the transfer
 * worked and that the two clocks agree.
 */
export function MFASetup() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('name');
  const [challenge, setChallenge] = useState<EnrollmentChallenge | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secretRevealed, setSecretRevealed] = useState(false);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DeviceNameFormValues>({
    resolver: zodResolver(deviceNameSchema),
    defaultValues: { deviceName: '' },
  });

  // Render the QR whenever a new challenge is issued.
  useEffect(() => {
    if (challenge === null) {
      setQrDataUrl(null);
      return;
    }

    // Guards against a slow render resolving after the challenge has changed.
    let active = true;

    void QRCode.toDataURL(challenge.otpauthUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      // Plain black on white. A QR code is read by a camera, and tinting one to
      // match a brand palette is how you get a code a phone cannot resolve in
      // poor light.
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setError('Could not render the QR code. The setup key below still works.');
      });

    return () => {
      active = false;
    };
  }, [challenge]);

  async function onNameSubmit(values: DeviceNameFormValues) {
    if (user === null) return;
    setError(null);

    try {
      const next = await beginEnrollment(user.uid, values.deviceName);
      setChallenge(next);
      setSecretRevealed(false);
      setStep('scan');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start enrollment.');
    }
  }

  async function onConfirm(submitted: string) {
    if (user === null || challenge === null || confirming) return;

    setConfirming(true);
    setCodeError(null);

    try {
      const result = await confirmEnrollment(user.uid, challenge.deviceId, submitted);

      if (result.recoveryCodes !== null) {
        setRecoveryCodes(result.recoveryCodes.map((entry) => entry.code));
        setStep('saved');
      } else {
        // MFA was already on, so no new codes were issued - this was simply an
        // additional device.
        void navigate('/dashboard', { replace: true });
      }
    } catch (caught) {
      setCodeError(caught instanceof MfaError ? caught.message : 'Could not confirm that code.');
      setFailedAttempts((count) => count + 1);
      setCode('');
    } finally {
      setConfirming(false);
    }
  }

  async function startOver() {
    if (user === null || challenge === null) return;

    try {
      await cancelEnrollment(user.uid, challenge.deviceId);
    } finally {
      setChallenge(null);
      setQrDataUrl(null);
      setCode('');
      setCodeError(null);
      setStep('name');
    }
  }

  const stepNumber = step === 'name' ? 1 : step === 'scan' ? 2 : 3;

  return (
    <div className="min-h-[70vh] bg-slate-50 py-10 sm:py-12">
      <Container className="max-w-3xl">
        <header>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl">Set up MFA</h1>
            <Badge tone="accent">Step {stepNumber} of 3</Badge>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
            Enrollment links a device to your identity by handing it a shared secret, exactly once.
            After that the device generates codes offline and the two sides never exchange the
            secret again.
          </p>
        </header>

        {error !== null && (
          <Alert tone="error" className="mt-6">
            {error}
          </Alert>
        )}

        {step === 'name' && (
          <section className="mt-7 rounded-card border border-slate-200 bg-white p-6">
            <h2 className="text-[0.9375rem] font-semibold text-navy-900">Name your device</h2>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-slate-600">
              You will see this name when revoking a device later, so make it one you will
              recognise in six months.
            </p>

            <form
              onSubmit={(event) => void handleSubmit(onNameSubmit)(event)}
              noValidate
              className="mt-5 max-w-sm space-y-4"
            >
              <Input
                label="Device name"
                placeholder="Pixel 8"
                error={errors.deviceName?.message}
                {...register('deviceName')}
              />
              <Button type="submit" size="lg" loading={isSubmitting}>
                Generate enrollment QR
              </Button>
            </form>

            {profile !== null && profile.devices.length > 0 && (
              <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
                Starting a new enrollment discards any earlier pending device. Several
                half-finished enrollments means several live unconfirmed secrets, which is attack
                surface for no benefit.
              </p>
            )}
          </section>
        )}

        {step === 'scan' && challenge !== null && (
          <>
            <section className="mt-7 rounded-card border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-3.5">
                <h2 className="text-[0.9375rem] font-semibold text-navy-900">
                  Scan this QR code with your authenticator app
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Enrolling <span className="font-mono text-slate-600">{challenge.deviceName}</span>
                </p>
              </div>

              <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:gap-8">
                <div className="mx-auto sm:mx-0">
                  {qrDataUrl === null ? (
                    <div className="flex h-[260px] w-[260px] items-center justify-center rounded border border-slate-200 bg-slate-50 text-sm text-slate-400">
                      Rendering...
                    </div>
                  ) : (
                    <img
                      src={qrDataUrl}
                      alt={`Enrollment QR code for ${challenge.deviceName}`}
                      width={260}
                      height={260}
                      className="rounded border border-slate-200"
                    />
                  )}
                </div>

                <div className="min-w-0">
                  <h3 className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Or enter the setup key manually
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    For a device with no camera. The key is Base32, which avoids the characters
                    people confuse when reading them aloud.
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-navy-900">
                      {secretRevealed
                        ? formatSecretForDisplay(challenge.secret)
                        : '•'.repeat(24)}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSecretRevealed((shown) => !shown)}
                    >
                      {secretRevealed ? 'Hide' : 'Reveal'}
                    </Button>
                  </div>

                  <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs">
                    <Detail term="Algorithm" value="SHA1 (HMAC)" />
                    <Detail term="Digits" value={String(TOTP_DIGITS)} />
                    <Detail term="Period" value={`${String(TOTP_PERIOD_SECONDS)} seconds`} />
                    <Detail term="Device status" value="pending" />
                  </dl>
                </div>
              </div>

              <div className="border-t border-slate-200 px-6 py-4">
                <h3 className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                  Provisioning URI
                </h3>
                <p className="mt-1.5 text-sm text-slate-600">
                  This is what the QR image actually encodes - the QR is just a way for a camera to
                  read it.
                </p>
                <pre className="mt-2.5 overflow-x-auto rounded border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <code className="font-mono text-xs break-all text-slate-700">
                    {challenge.otpauthUri}
                  </code>
                </pre>
              </div>
            </section>

            <Alert tone="warning" title="Treat this screen like a password" className="mt-6">
              Anyone who photographs this QR code has your second factor. A real deployment shows
              it once, expires it within minutes, and never renders it again.
            </Alert>

            <section className="mt-6 rounded-card border border-slate-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-accent-200 bg-accent-50 text-accent-600">
                  <Icon name="check" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[0.9375rem] font-semibold text-navy-900">
                    Confirm the device
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
                    Type the current {TOTP_DIGITS}-digit code from your authenticator. Reproducing
                    it here proves the secret arrived intact and that both clocks agree - until
                    then the device stays pending and MFA stays off.
                  </p>

                  <div className="mt-5 max-w-xs">
                    <CodeInput
                      value={code}
                      onChange={setCode}
                      onComplete={(value) => void onConfirm(value)}
                      error={codeError ?? undefined}
                      disabled={confirming}
                      autoFocus
                      label="Code from your device"
                    />
                  </div>

                  {failedAttempts >= 2 && (
                    <div className="mt-4 max-w-xl">
                      <ClockHint attempts={failedAttempts} />
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button
                      onClick={() => void onConfirm(code)}
                      loading={confirming}
                      disabled={code.length !== TOTP_DIGITS}
                    >
                      Confirm and enable MFA
                    </Button>
                    <Button variant="ghost" onClick={() => void startOver()}>
                      Discard and start over
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {step === 'saved' && recoveryCodes !== null && (
          <div className="mt-7">
            <Alert tone="success" title="MFA is on" className="mb-5">
              Your device is confirmed. From now on, signing in asks for a code from it.
            </Alert>

            <RecoveryCodesPanel
              codes={recoveryCodes}
              identity={profile?.nlrIdentity ?? 'your account'}
              onAcknowledge={() => void navigate('/dashboard', { replace: true })}
            />
          </div>
        )}
      </Container>
    </div>
  );
}

/** One row of the enrollment parameter list. */
function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{term}</dt>
      <dd className="font-mono text-slate-700">{value}</dd>
    </div>
  );
}
