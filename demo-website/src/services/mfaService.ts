/**
 * MFA enrollment, verification, device management, and recovery.
 *
 * The full second-factor lifecycle, in the order it happens:
 *
 *   beginEnrollment    -> generate a secret, render a QR, device is `pending`
 *   confirmEnrollment  -> first code verifies, device becomes `active`
 *   verifyLoginCode    -> a code at sign-in
 *   redeemRecoveryCode -> the way back in when the device is gone
 *   revokeDevice       -> stop trusting one device
 *
 * ## Where verification runs, and why that matters
 *
 * Every verification in this file executes **in the browser**. In production
 * that is wrong: a client can claim any result it likes, so a browser saying
 * "valid" proves nothing to a server.
 *
 * The demo does it client-side because Cloud Functions need a billing plan, and
 * nobody should have to enter card details to learn how MFA works. The logic
 * lives in `totpService.ts` and `recoveryService.ts`, both free of React and
 * Firebase, so moving it server-side is a copy-paste -
 * `examples/integration-examples/` shows exactly that.
 *
 * The limitation is stated in the UI too, not only in this comment. A demo that
 * quietly pretends to be secure teaches the wrong lesson.
 */

import {
  fetchUserProfile,
  saveDevices,
  saveDevicesAndRecoveryCodes,
  saveRecoveryCodes,
  type StoredDevice,
  type StoredRecoveryCode,
  type UserProfile,
} from '@/firebase/firestore';
import {
  ENROLLMENT_EXPIRY_MINUTES,
  SECRET_LENGTH_BYTES,
  TOTP_ALGORITHM,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
} from '@/utils/constants';
import { counterFor, verifyTotp } from './totpService';
import {
  findMatchingCode,
  generateRecoveryCodes as createRecoveryCodes,
  type GeneratedRecoveryCode,
} from './recoveryService';

/** Issuer name shown in the authenticator app's account list. */
export const ISSUER = 'NLR Identity';

/** RFC 4648 Base32 alphabet. Base32, not Base64 - see `docs/totp-working.md`. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes bytes as Base32.
 *
 * Base32 rather than Base64 for a human reason: the alphabet has no `0`/`O` or
 * `1`/`l`/`I` confusion, so a setup key can be read aloud or typed by hand when
 * a camera is not available.
 */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let output = '';

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Generates a new shared secret.
 *
 * `crypto.getRandomValues` is the browser's CSPRNG. `Math.random()` is not, is
 * seeded predictably, and has been the root cause of real token-prediction
 * vulnerabilities. Twenty bytes (160 bits) is the length RFC 4226 recommends.
 */
export function generateSecret(lengthBytes: number = SECRET_LENGTH_BYTES): string {
  const bytes = new Uint8Array(lengthBytes);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export type OtpauthParams = {
  secret: string;
  nlrIdentity: string;
  issuer?: string;
};

/**
 * Builds the `otpauth://` provisioning URI encoded into the QR code.
 *
 * The label is `Issuer:account`, both halves URI-encoded. The colon separator
 * is written literally - encoding it would collapse the label into one
 * meaningless string.
 */
export function buildOtpauthUri({ secret, nlrIdentity, issuer = ISSUER }: OtpauthParams): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(nlrIdentity)}`;

  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: TOTP_ALGORITHM,
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  // URLSearchParams encodes a space as `+`, which is correct for HTML form
  // submission and wrong here: an authenticator that parses this with a plain
  // URI parser shows the issuer as "NLR+Identity".
  const query = params.toString().replace(/\+/g, '%20');

  return `otpauth://totp/${label}?${query}`;
}

/** Formats a secret in groups of four, for manual entry. */
export function formatSecretForDisplay(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(' ');
}

export type EnrollmentChallenge = {
  deviceId: string;
  deviceName: string;
  secret: string;
  otpauthUri: string;
  /** ISO timestamp after which a real implementation would discard the secret. */
  expiresAt: string;
};

/** Generates a random device id. Not a secret - it only needs to be unique. */
function generateDeviceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `dev_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Begins enrollment: generates a secret and records a pending device.
 *
 * The device is written as `pending`, never `active`. Activation requires a
 * code the server can reproduce, which proves the secret arrived intact - see
 * `confirmEnrollment`. Activating on display would leave accounts protected by
 * devices that never actually received anything.
 */
export async function beginEnrollment(
  uid: string,
  deviceName: string,
): Promise<EnrollmentChallenge> {
  const profile = await fetchUserProfile(uid);
  if (profile === null) {
    throw new Error('Profile not found. Sign out and sign in again.');
  }

  const secret = generateSecret();
  const deviceId = generateDeviceId();
  const now = new Date();

  const device: StoredDevice = {
    deviceId,
    name: deviceName.trim(),
    secret,
    status: 'pending',
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    createdAt: now.toISOString(),
    confirmedAt: null,
    lastUsedCounter: null,
    revokedAt: null,
  };

  // Any earlier pending device is dropped. Several half-finished enrollments
  // means several live unconfirmed secrets - more attack surface, no benefit.
  const devices = [...profile.devices.filter((d) => d.status !== 'pending'), device];

  await saveDevices(uid, devices, hasActiveDevice(devices));

  const expiresAt = new Date(now.getTime() + ENROLLMENT_EXPIRY_MINUTES * 60_000).toISOString();

  return {
    deviceId,
    deviceName: device.name,
    secret,
    otpauthUri: buildOtpauthUri({ secret, nlrIdentity: profile.nlrIdentity }),
    expiresAt,
  };
}

export type ConfirmResult = {
  device: StoredDevice;
  /**
   * Recovery codes, present only when this enrollment switched MFA on.
   *
   * Issued at the same moment the user gains a factor they can lose. Deferring
   * them to a settings page nobody visits is how support tickets are made.
   */
  recoveryCodes: GeneratedRecoveryCode[] | null;
};

/**
 * Confirms an enrollment with the first code from the device.
 *
 * This is the handshake. A code the server can reproduce proves two things at
 * once: the secret arrived intact, and the two clocks agree closely enough to
 * keep working. Only now does the device become `active`.
 */
export async function confirmEnrollment(
  uid: string,
  deviceId: string,
  code: string,
): Promise<ConfirmResult> {
  const profile = await fetchUserProfile(uid);
  if (profile === null) throw new MfaError('Profile not found.', 'no-profile');

  const device = profile.devices.find((d) => d.deviceId === deviceId);
  if (device === undefined) throw new MfaError('That device is not enrolled.', 'no-device');

  if (device.status === 'active') {
    throw new MfaError('That device is already confirmed.', 'already-active');
  }

  const result = await verifyTotp({
    secret: device.secret,
    code,
    digits: device.digits,
    period: device.period,
  });

  if (!result.valid) {
    throw new MfaError(
      result.reason === 'malformed'
        ? `Enter the ${String(device.digits)}-digit code from your authenticator.`
        : 'That code is not correct. Check that your device clock is set automatically, then try the current code.',
      result.reason,
    );
  }

  const confirmed: StoredDevice = {
    ...device,
    status: 'active',
    confirmedAt: new Date().toISOString(),
    lastUsedCounter: result.counter,
  };

  const devices = profile.devices.map((d) => (d.deviceId === deviceId ? confirmed : d));

  // Issue recovery codes the first time MFA is switched on for this account.
  const isFirstActivation = !profile.mfaEnabled;
  const generated = isFirstActivation ? await createRecoveryCodes() : null;

  if (generated !== null) {
    await saveDevicesAndRecoveryCodes(uid, devices, true, toStoredCodes(generated));
  } else {
    await saveDevices(uid, devices, true);
  }

  return { device: confirmed, recoveryCodes: generated };
}

/**
 * Verifies a code at sign-in, against every active device.
 *
 * An identity may have a phone and a tablet; each has its own secret, so each
 * is tried until one matches. The successful counter is recorded, so the same
 * code cannot be replayed.
 */
export async function verifyLoginCode(uid: string, code: string): Promise<StoredDevice> {
  const profile = await fetchUserProfile(uid);
  if (profile === null) throw new MfaError('Profile not found.', 'no-profile');

  const active = profile.devices.filter((d) => d.status === 'active');
  if (active.length === 0) {
    throw new MfaError('No confirmed device is enrolled on this account.', 'no-device');
  }

  let sawReplay = false;

  for (const device of active) {
    const result = await verifyTotp({
      secret: device.secret,
      code,
      digits: device.digits,
      period: device.period,
      lastUsedCounter: device.lastUsedCounter ?? undefined,
    });

    if (result.valid) {
      const used: StoredDevice = { ...device, lastUsedCounter: result.counter };
      const devices = profile.devices.map((d) => (d.deviceId === device.deviceId ? used : d));
      await saveDevices(uid, devices, true);
      return used;
    }

    if (result.reason === 'replayed') sawReplay = true;
  }

  throw new MfaError(
    sawReplay
      ? 'That code has already been used. Wait for your authenticator to show the next one.'
      : 'That code is not correct.',
    sawReplay ? 'replayed' : 'mismatch',
  );
}

/**
 * Redeems a recovery code.
 *
 * Success burns the code permanently. Using one means the device is gone, so it
 * is also the caller's cue to make the user enrol a new one.
 */
export async function redeemRecoveryCode(uid: string, code: string): Promise<void> {
  const profile = await fetchUserProfile(uid);
  if (profile === null) throw new MfaError('Profile not found.', 'no-profile');

  // Used codes are passed as empty strings rather than filtered out, so the
  // index returned still lines up with the stored array.
  const candidateHashes = profile.recoveryCodes.map((entry) => (entry.used ? '' : entry.hash));
  const index = await findMatchingCode(code, candidateHashes);

  if (index < 0) {
    throw new MfaError('That recovery code is not valid, or has already been used.', 'mismatch');
  }

  const updated = profile.recoveryCodes.map((entry, i) =>
    i === index ? { ...entry, used: true, usedAt: new Date().toISOString() } : entry,
  );

  await saveRecoveryCodes(uid, updated);
}

/** Generates and stores a fresh set, replacing any existing one. */
export async function regenerateRecoveryCodes(uid: string): Promise<GeneratedRecoveryCode[]> {
  const generated = await createRecoveryCodes();
  await saveRecoveryCodes(uid, toStoredCodes(generated));
  return generated;
}

/**
 * Revokes a device.
 *
 * Immediate, with no grace period - a lost phone is an emergency. The record is
 * kept as `revoked` rather than deleted, so the user can still see that it
 * existed and when it stopped being trusted.
 *
 * If this was the last active device, MFA switches off. The caller must say so
 * in plain language before calling this.
 */
export async function revokeDevice(uid: string, deviceId: string): Promise<void> {
  const profile = await fetchUserProfile(uid);
  if (profile === null) throw new MfaError('Profile not found.', 'no-profile');

  const devices = profile.devices.map((device) =>
    device.deviceId === deviceId
      ? { ...device, status: 'revoked' as const, revokedAt: new Date().toISOString() }
      : device,
  );

  await saveDevices(uid, devices, hasActiveDevice(devices));
}

/** Discards a pending enrollment - the "start over" path on the setup page. */
export async function cancelEnrollment(uid: string, deviceId: string): Promise<void> {
  const profile = await fetchUserProfile(uid);
  if (profile === null) return;

  const devices = profile.devices.filter((device) => device.deviceId !== deviceId);
  await saveDevices(uid, devices, hasActiveDevice(devices));
}

/* --- Helpers -------------------------------------------------------------- */

function toStoredCodes(generated: GeneratedRecoveryCode[]): StoredRecoveryCode[] {
  const createdAt = new Date().toISOString();
  return generated.map((entry) => ({
    hash: entry.hash,
    used: false,
    createdAt,
    usedAt: null,
  }));
}

function hasActiveDevice(devices: StoredDevice[]): boolean {
  return devices.some((device) => device.status === 'active');
}

/** The pending device on a profile, if there is one. */
export function pendingDeviceOf(profile: UserProfile): StoredDevice | null {
  return profile.devices.find((device) => device.status === 'pending') ?? null;
}

/** Active (confirmed) devices on a profile. */
export function activeDevicesOf(profile: UserProfile): StoredDevice[] {
  return profile.devices.filter((device) => device.status === 'active');
}

/** How many recovery codes remain unused. */
export function unusedRecoveryCodeCount(profile: UserProfile): number {
  return profile.recoveryCodes.filter((entry) => !entry.used).length;
}

/** The current time step, re-exported for display and debugging. */
export { counterFor };

/** An MFA failure, phrased for a user. */
export class MfaError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = 'MfaError';
    this.reason = reason;
  }
}

export type { StoredDevice, GeneratedRecoveryCode };
