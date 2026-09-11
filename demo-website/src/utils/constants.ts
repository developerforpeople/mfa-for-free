/**
 * Protocol constants used in explanatory UI copy.
 *
 * These mirror the defaults in RFC 6238 and the `otpauth://` Key Uri Format.
 * They live here so that the landing page, the docs, the verification service
 * and the authenticator app all quote the same numbers instead of drifting
 * apart.
 */

/** Seconds a TOTP code stays valid. RFC 6238 recommends 30. */
export const TOTP_PERIOD_SECONDS = 30;

/** Number of digits shown to the user. 6 is universal; 8 is permitted. */
export const TOTP_DIGITS = 6;

/** HMAC hash used by effectively every deployed authenticator. */
export const TOTP_ALGORITHM = 'SHA1' as const;

/**
 * Time steps accepted either side of the current one, to tolerate clock drift.
 * One step each way is ~90 seconds of tolerance. Widening this multiplies an
 * attacker's brute-force surface - see `docs/totp-working.md`.
 */
export const TOTP_DRIFT_WINDOW = 1;

/** Length in bytes of a generated shared secret. 20 bytes = 160 bits. */
export const SECRET_LENGTH_BYTES = 20;

/** How many single-use recovery codes are issued per identity. */
export const RECOVERY_CODE_COUNT = 10;

/** Minutes a pending enrollment stays valid before the secret is discarded. */
export const ENROLLMENT_EXPIRY_MINUTES = 10;
