/**
 * Recovery codes.
 *
 * Any second factor you can lose needs a documented way back, or MFA is just a
 * machine for locking people out of their own accounts. Recovery codes are that
 * way back: a set of single-use credentials, issued when MFA is switched on,
 * shown exactly once.
 *
 * They are **credentials, not data**. Everything here follows from that:
 *
 *   - stored hashed, never in plaintext
 *   - hashed with a slow KDF (PBKDF2), not a bare SHA-256
 *   - each one dies permanently the moment it is redeemed
 *   - the whole set is regenerated after any of them is used
 */

/**
 * Alphabet for generated codes.
 *
 * Excludes `0`/`O`, `1`/`I`/`L` and `U` - the characters people mistake for one
 * another when copying a code off a printed page under pressure, which is
 * exactly the situation recovery codes exist for. `U` goes because it is easily
 * confused with `V` in some fonts.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

/** Number of codes issued per set. */
export const RECOVERY_CODE_COUNT = 10;

/** Characters per code, excluding the separating dash. */
const CODE_LENGTH = 10;

/**
 * PBKDF2 iterations.
 *
 * A recovery code has far more entropy than a human password (10 characters
 * from a 30-character alphabet is about 49 bits), so this does not need the
 * iteration count you would use for passwords. It is still emphatically not a
 * single SHA-256: a fast hash makes an offline search of the keyspace
 * practical, and the whole point of hashing these is that a database dump must
 * not hand over working credentials.
 */
const PBKDF2_ITERATIONS = 210_000;

const SALT_BYTES = 16;
const HASH_BITS = 256;

/** A freshly generated code, in the only form the user will ever see it. */
export type GeneratedRecoveryCode = {
  /** Display form, e.g. `A7K2M-9XQR4`. */
  code: string;
  /** `pbkdf2$<iterations>$<salt>$<hash>`, all base64. Safe to store. */
  hash: string;
};

/**
 * Generates a single random code.
 *
 * `crypto.getRandomValues` is the platform CSPRNG. `Math.random()` is seeded
 * predictably and has been the root cause of real credential-prediction
 * vulnerabilities - never use it for anything an attacker would like to guess.
 *
 * The rejection loop matters: taking `random % alphabet.length` directly would
 * bias the result towards the first few characters, because 256 does not divide
 * evenly by 30. Discarding the values in the uneven tail keeps the distribution
 * flat, which is the difference between 49 bits of entropy and rather fewer.
 */
function generateCode(): string {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  const characters: string[] = [];

  while (characters.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (characters.length >= CODE_LENGTH) break;
      if (byte >= limit) continue; // Biased tail - draw again.
      characters.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]!);
    }
  }

  // Grouped in fives: easier to read off a screen and type without losing your
  // place.
  return `${characters.slice(0, 5).join('')}-${characters.slice(5).join('')}`;
}

/** Normalises a code for comparison: case and dashes are not significant. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/** Hashes a code with PBKDF2-SHA256 and a fresh random salt. */
export async function hashCode(code: string, salt?: Uint8Array): Promise<string> {
  const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normaliseCode(code)) as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    HASH_BITS,
  );

  // Self-describing: the iteration count and salt travel with the hash, so a
  // future change to either can still verify everything written before it.
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(saltBytes)}$${toBase64(new Uint8Array(bits))}`;
}

/**
 * Checks a submitted code against a stored hash.
 *
 * Returns false rather than throwing on a malformed stored value: a corrupt row
 * should fail closed, not crash the recovery screen of someone who is already
 * locked out and having a bad day.
 */
export async function verifyCodeAgainstHash(code: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  try {
    const salt = fromBase64(parts[2]!);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normaliseCode(code)) as unknown as BufferSource,
      'PBKDF2',
      false,
      ['deriveBits'],
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      key,
      HASH_BITS,
    );

    const expected = parts[3]!;
    const actual = toBase64(new Uint8Array(bits));

    // Constant-time: same reasoning as comparing an OTP.
    if (expected.length !== actual.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) {
      difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
    }
    return difference === 0;
  } catch {
    return false;
  }
}

/**
 * Generates a full set of recovery codes with their hashes.
 *
 * The plaintext in the return value is the only time it exists. The caller
 * shows it once and stores only the hashes.
 */
export async function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT,
): Promise<GeneratedRecoveryCode[]> {
  const codes: GeneratedRecoveryCode[] = [];

  for (let i = 0; i < count; i++) {
    const code = generateCode();
    codes.push({ code, hash: await hashCode(code) });
  }

  return codes;
}

/**
 * Finds which stored hash a submitted code matches.
 *
 * Returns the index, or -1. Every hash is checked even after a match is found:
 * returning early would leak, through timing, roughly where in the list the
 * matching code sits.
 */
export async function findMatchingCode(code: string, hashes: string[]): Promise<number> {
  let matchIndex = -1;

  for (let i = 0; i < hashes.length; i++) {
    const isMatch = await verifyCodeAgainstHash(code, hashes[i]!);
    if (isMatch && matchIndex === -1) {
      matchIndex = i;
    }
  }

  return matchIndex;
}

/** Formats a set for download as a text file. */
export function formatCodesForDownload(codes: string[], identity: string): string {
  const generated = new Date().toISOString().slice(0, 10);

  return [
    'NLR IDENTITY - RECOVERY CODES',
    '=============================',
    '',
    `Account:   ${identity}`,
    `Generated: ${generated}`,
    '',
    'Each code works ONCE. Keep them somewhere safe and offline -',
    'they bypass your second factor, so treat them like passwords.',
    '',
    ...codes.map((code, index) => `  ${String(index + 1).padStart(2, '0')}.  ${code}`),
    '',
    'If you use one, generate a new set from your dashboard.',
    '',
  ].join('\n');
}
