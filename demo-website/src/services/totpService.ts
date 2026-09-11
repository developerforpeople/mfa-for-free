/**
 * TOTP generation and verification, for the relying party.
 *
 * This is the other half of the handshake. `authenticator-app` computes a code
 * from a secret and the clock; this computes the same code independently and
 * compares. Neither side sends the other anything to make it happen.
 *
 * Implemented with the Web Crypto API (`crypto.subtle`), which is available in
 * every browser and in Node 18+, so the exact same module runs in the demo and
 * in a Cloud Function. See `docs/totp-working.md` for the algorithm.
 *
 * ## Read this before copying the pattern
 *
 * Verification here runs **in the browser**. That is wrong for production, and
 * the project says so loudly - a client can claim any result it likes, so a
 * browser saying "the code was valid" proves nothing to a server.
 *
 * The demo does it anyway because Cloud Functions require a billing plan, and a
 * student should not have to enter a credit card to see how MFA works. The code
 * is written so that moving it server-side is a copy-paste: no DOM, no React,
 * no Firebase imports. `examples/integration-examples/` shows it deployed
 * properly.
 */

/** RFC 4648 Base32 alphabet. Base32, not Base64 - see `docs/totp-working.md`. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Seconds a code is valid. */
export const TOTP_PERIOD = 30;

/** Digits shown to the user. */
export const TOTP_DIGITS = 6;

/**
 * Time steps accepted either side of the current one.
 *
 * One step is about 90 seconds of total tolerance, which covers a slightly wrong
 * phone clock and a user who starts typing at second 29. Widening it is
 * tempting and wrong: every extra step multiplies the brute-force surface and
 * extends how long a stolen code stays usable.
 */
export const TOTP_DRIFT_WINDOW = 1;

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** Maps the `otpauth://` spelling onto the Web Crypto name. */
function subtleHashName(algorithm: TotpAlgorithm): string {
  switch (algorithm) {
    case 'SHA256':
      return 'SHA-256';
    case 'SHA512':
      return 'SHA-512';
    case 'SHA1':
      return 'SHA-1';
  }
}

/** Thrown when a secret is not decodable Base32. */
export class InvalidSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSecretError';
  }
}

/**
 * Decodes Base32 text into bytes.
 *
 * Tolerant of lowercase, spaces, hyphens and `=` padding, because those are all
 * ways the same key legitimately arrives from a user pasting it.
 */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/=+$/, '');

  if (cleaned === '') {
    throw new InvalidSecretError('The secret is empty.');
  }

  const output: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of cleaned) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value < 0) {
      throw new InvalidSecretError(`"${char}" is not a valid Base32 character.`);
    }

    buffer = (buffer << 5) | value;
    bits += 5;

    if (bits >= 8) {
      output.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  if (output.length === 0) {
    throw new InvalidSecretError('The secret is too short to be a key.');
  }

  return new Uint8Array(output);
}

/** The time step for an instant: how many whole periods since the epoch. */
export function counterFor(at: Date = new Date(), period: number = TOTP_PERIOD): number {
  return Math.floor(at.getTime() / 1000 / period);
}

/**
 * Computes the code for a given counter.
 *
 * Async because Web Crypto is async. That propagates outward, which is why
 * every verification function in this file returns a promise.
 */
export async function generateForCounter(
  secret: string,
  counter: number,
  digits: number = TOTP_DIGITS,
  algorithm: TotpAlgorithm = 'SHA1',
): Promise<string> {
  const keyBytes = base32Decode(secret);

  // Step 1: the counter as an 8-byte big-endian integer.
  const message = new ArrayBuffer(8);
  // `setBigUint64` rather than two 32-bit halves: the counter exceeds 2^32 in
  // the year 6053, but using the 64-bit write keeps it correct by construction
  // rather than by luck.
  new DataView(message).setBigUint64(0, BigInt(counter), false);

  // Step 2: HMAC.
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: { name: subtleHashName(algorithm) } },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));

  // Step 3: dynamic truncation - the offset comes from the hash itself, so the
  // position an attacker would have to predict is unpredictable.
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  // The 0x7f mask is an interoperability fix, not a security measure: it makes
  // signed and unsigned 32-bit languages agree.

  // Step 4: reduce and zero-pad. One code in ten starts with a zero, and losing
  // it is the classic "it rejects my code sometimes" bug.
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** Computes the code for an instant. */
export async function generateTotp(
  secret: string,
  at: Date = new Date(),
  digits: number = TOTP_DIGITS,
  period: number = TOTP_PERIOD,
  algorithm: TotpAlgorithm = 'SHA1',
): Promise<string> {
  return generateForCounter(secret, counterFor(at, period), digits, algorithm);
}

/**
 * Compares two strings without leaking their contents through timing.
 *
 * A plain `===` on strings can return early at the first differing character,
 * and the timing difference tells an attacker how many leading characters they
 * guessed correctly - which turns a 10^6 search into roughly 60 guesses.
 *
 * This walks every character regardless and accumulates the differences.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

export type VerifyOptions = {
  secret: string;
  code: string;
  at?: Date;
  digits?: number;
  period?: number;
  algorithm?: TotpAlgorithm;
  window?: number;
  /**
   * The last counter that already succeeded for this device.
   *
   * Anything at or below it is refused as a replay. Pass it whenever you have
   * it - without this, a code read over a shoulder or captured by a proxy stays
   * usable for the rest of its window.
   */
  lastUsedCounter?: number;
};

export type VerifyResult =
  | { valid: true; counter: number }
  | { valid: false; reason: 'mismatch' | 'replayed' | 'malformed' };

/**
 * Verifies a submitted code.
 *
 * Checks the current step plus `window` steps either side, in constant time,
 * and refuses any counter that has already been used.
 */
export async function verifyTotp(options: VerifyOptions): Promise<VerifyResult> {
  const {
    secret,
    code,
    at = new Date(),
    digits = TOTP_DIGITS,
    period = TOTP_PERIOD,
    algorithm = 'SHA1',
    window = TOTP_DRIFT_WINDOW,
    lastUsedCounter,
  } = options;

  const submitted = code.replace(/\s/g, '');

  if (!new RegExp(`^\\d{${digits}}$`).test(submitted)) {
    return { valid: false, reason: 'malformed' };
  }

  const current = counterFor(at, period);
  let replayed = false;

  for (let offset = -window; offset <= window; offset++) {
    const counter = current + offset;
    if (counter < 0) continue;

    let expected: string;
    try {
      expected = await generateForCounter(secret, counter, digits, algorithm);
    } catch {
      return { valid: false, reason: 'malformed' };
    }

    if (timingSafeEqual(submitted, expected)) {
      // The code is genuine. Whether it is *acceptable* is a separate question:
      // a counter that already succeeded is a replay, not a fresh proof.
      if (lastUsedCounter !== undefined && counter <= lastUsedCounter) {
        replayed = true;
        continue;
      }
      return { valid: true, counter };
    }
  }

  return { valid: false, reason: replayed ? 'replayed' : 'mismatch' };
}

/** Whole seconds until the current code rolls. */
export function secondsRemaining(at: Date = new Date(), period: number = TOTP_PERIOD): number {
  return period - (Math.floor(at.getTime() / 1000) % period);
}
