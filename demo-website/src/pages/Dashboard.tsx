import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Icon } from '@/components/Icon';
import { RecoveryCodesPanel } from '@/components/RecoveryCodesPanel';
import { useAuth } from '@/context/useAuth';
import {
  activeDevicesOf,
  pendingDeviceOf,
  regenerateRecoveryCodes,
  revokeDevice,
  unusedRecoveryCodeCount,
  type StoredDevice,
} from '@/services/mfaService';
import { RECOVERY_CODE_COUNT } from '@/utils/constants';
import { firstNameOf } from '@/utils/identity';

/** Route state set by VerifyMfa after a recovery code is redeemed. */
type LocationState = { usedRecoveryCode?: boolean } | null;

/**
 * The signed-in landing page.
 *
 * Shows who you are, whether MFA is on, the enrolled devices, and the state of
 * your recovery codes. The profile comes from a live Firestore subscription in
 * `AuthProvider`, so revoking a device updates this screen immediately.
 */
export function Dashboard() {
  const { user, profile, error } = useAuth();
  const location = useLocation();

  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const usedRecoveryCode = (location.state as LocationState)?.usedRecoveryCode === true;

  if (profile === null) {
    return (
      <div className="bg-slate-50 py-12">
        <Container className="max-w-3xl">
          {error !== null ? (
            <Alert tone="error" title="Could not load your profile">
              {error}
            </Alert>
          ) : (
            <p className="text-sm text-slate-500">Loading your profile...</p>
          )}
        </Container>
      </div>
    );
  }

  const pending = pendingDeviceOf(profile);
  const active = activeDevicesOf(profile);
  const remainingCodes = unusedRecoveryCodeCount(profile);

  async function onRevoke(device: StoredDevice) {
    if (user === null) return;

    const isLastActive = active.length === 1 && device.status === 'active';
    const message = isLastActive
      ? `Revoke ${device.name}?\n\nThis is your only confirmed device, so revoking it turns MFA OFF and your account will be protected by its password alone.`
      : `Revoke ${device.name}?\n\nIt will stop being able to generate codes for this account. This cannot be undone - you would enrol it again from scratch.`;

    if (!window.confirm(message)) return;

    setBusyDeviceId(device.deviceId);
    setActionError(null);

    try {
      await revokeDevice(user.uid, device.deviceId);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not revoke that device.');
    } finally {
      setBusyDeviceId(null);
    }
  }

  async function onRegenerate() {
    if (user === null) return;

    if (
      !window.confirm(
        'Generate a new set of recovery codes?\n\nYour current codes stop working immediately, including any you have written down.',
      )
    ) {
      return;
    }

    setRegenerating(true);
    setActionError(null);

    try {
      const generated = await regenerateRecoveryCodes(user.uid);
      setNewCodes(generated.map((entry) => entry.code));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not generate new codes.');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="min-h-[70vh] bg-slate-50 py-10 sm:py-12">
      <Container className="max-w-3xl">
        <header>
          <h1 className="text-2xl">Welcome, {firstNameOf(profile.name)}</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Your NLR Identity account and its second-factor status.
          </p>
        </header>

        {usedRecoveryCode && (
          <Alert tone="warning" title="You signed in with a recovery code" className="mt-6">
            That code is now used and cannot work again. Enrol a replacement device, then generate
            a fresh set of codes - otherwise the next time you lose a device you have one fewer way
            back in.
          </Alert>
        )}

        {actionError !== null && (
          <Alert tone="error" className="mt-6">
            {actionError}
          </Alert>
        )}

        {newCodes !== null && (
          <div className="mt-6">
            <RecoveryCodesPanel
              codes={newCodes}
              identity={profile.nlrIdentity}
              onAcknowledge={() => setNewCodes(null)}
            />
          </div>
        )}

        {/* --- Identity ------------------------------------------------- */}
        <section className="mt-7 rounded-card border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-3 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
            Identity
          </h2>
          <dl className="divide-y divide-slate-100">
            <Row term="Name" value={profile.name} />
            <Row term="NLR Identity" value={profile.nlrIdentity} mono />
            <Row term="Username" value={profile.username} mono />
            <Row term="User ID" value={user?.uid ?? '-'} mono muted />
            <Row term="Created" value={new Date(profile.createdAt).toLocaleString()} />
          </dl>
        </section>

        {/* --- MFA status ----------------------------------------------- */}
        <section className="mt-6 rounded-card border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-3 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
            Multi-factor authentication
          </h2>

          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={
                  profile.mfaEnabled
                    ? 'mt-0.5 flex h-8 w-8 items-center justify-center rounded border border-green-200 bg-green-50 text-success-600'
                    : 'mt-0.5 flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400'
                }
              >
                <Icon name={profile.mfaEnabled ? 'check' : 'lock'} className="h-4 w-4" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-navy-900">Status</span>
                  <Badge tone={profile.mfaEnabled ? 'success' : 'warning'}>
                    {profile.mfaEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-600">
                  {profile.mfaEnabled
                    ? `Signing in asks for a code from ${active.length === 1 ? 'your device' : 'one of your devices'}.`
                    : 'Your account is protected by a password only. Enrol a device to add a second factor.'}
                </p>
              </div>
            </div>

            <Button to="/mfa-setup" size="lg" variant={profile.mfaEnabled ? 'secondary' : 'primary'}>
              {pending !== null
                ? 'Resume MFA setup'
                : profile.mfaEnabled
                  ? 'Add another device'
                  : 'Setup MFA'}
            </Button>
          </div>

          {pending !== null && (
            <div className="border-t border-slate-200 px-5 py-4">
              <Alert tone="info" title="Enrollment started but not confirmed">
                <span className="font-mono">{pending.name}</span> has a secret but has not been
                confirmed with a code from the device, so it cannot be used to sign in yet.
              </Alert>
            </div>
          )}
        </section>

        {/* --- Devices --------------------------------------------------- */}
        <section className="mt-6 rounded-card border border-slate-200 bg-white">
          <h2 className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
            Devices
            <span className="font-mono text-[0.6875rem] normal-case">
              {active.length} active / {profile.devices.length} total
            </span>
          </h2>

          {profile.devices.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No devices enrolled yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {profile.devices.map((device) => (
                <li
                  key={device.deviceId}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon name="devices" className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900">{device.name}</p>
                      <p className="truncate font-mono text-xs text-slate-400">
                        {device.deviceId}
                        {device.confirmedAt !== null &&
                          ` · confirmed ${new Date(device.confirmedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      tone={
                        device.status === 'active'
                          ? 'success'
                          : device.status === 'revoked'
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {device.status}
                    </Badge>

                    {device.status !== 'revoked' && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void onRevoke(device)}
                        loading={busyDeviceId === device.deviceId}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- Recovery codes -------------------------------------------- */}
        <section className="mt-6 rounded-card border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-3 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
            Recovery codes
          </h2>

          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Icon name="lifebuoy" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                {profile.recoveryCodes.length === 0 ? (
                  <p className="max-w-lg text-sm leading-relaxed text-slate-600">
                    None issued yet. They are generated automatically when you turn MFA on.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-navy-900">
                      {remainingCodes} of {profile.recoveryCodes.length} remaining
                    </p>
                    <p className="mt-1 max-w-lg text-sm leading-relaxed text-slate-600">
                      {remainingCodes === 0
                        ? 'All of your codes are used. Generate a new set now - without one you cannot get back in if you lose your device.'
                        : remainingCodes <= 3
                          ? 'You are running low. Generating a new set replaces all of them.'
                          : 'Each code works once. Stored hashed, so they cannot be shown again.'}
                    </p>
                  </>
                )}
              </div>
            </div>

            {profile.mfaEnabled && (
              <Button
                variant={remainingCodes === 0 ? 'primary' : 'secondary'}
                onClick={() => void onRegenerate()}
                loading={regenerating}
              >
                Generate new set
              </Button>
            )}
          </div>

          {profile.recoveryCodes.length > 0 && (
            <div className="border-t border-slate-200 px-5 py-4">
              <div className="flex flex-wrap gap-1.5">
                {profile.recoveryCodes.map((entry, index) => (
                  <span
                    key={`${entry.createdAt}-${index}`}
                    title={entry.used ? `Used ${entry.usedAt ?? ''}` : 'Unused'}
                    className={
                      entry.used
                        ? 'rounded border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs text-slate-400 line-through'
                        : 'rounded border border-green-200 bg-green-50 px-2 py-1 font-mono text-xs text-success-600'
                    }
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Only the used/unused state is shown. The codes themselves are stored as PBKDF2
                hashes and cannot be recovered from here - which is the point of hashing them.
              </p>
            </div>
          )}
        </section>

        <p className="mt-8 text-xs leading-relaxed text-slate-500">
          Educational demo. Codes are verified in your browser and device secrets are stored
          unencrypted on your own profile document, so the whole flow stays readable - see
          SECURITY.md before reusing any of this. A production build verifies server-side and
          issues {RECOVERY_CODE_COUNT} codes from a Cloud Function.
        </p>
      </Container>
    </div>
  );
}

/** One row of the identity table. */
function Row({
  term,
  value,
  mono = false,
  muted = false,
}: {
  term: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-slate-500">{term}</dt>
      <dd
        className={[
          'truncate text-sm',
          mono ? 'font-mono' : '',
          muted ? 'text-slate-400' : 'text-navy-900',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
