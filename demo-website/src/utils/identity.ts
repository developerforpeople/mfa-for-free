/**
 * NLR Identity rules.
 *
 * An NLR Identity is an email address on a single closed domain. A user types
 * `john`; the platform stores `john@nlr.com`. Public mail domains are rejected.
 *
 * Why a closed domain at all? Because it makes the teaching point visible: the
 * identity is issued by the platform, not chosen by the user. Real enterprise
 * identity providers work the same way - your work account is on your employer's
 * domain, and you cannot enrol a personal address into it.
 *
 * Pure functions only. No React, no Firebase - so every rule here is testable
 * on its own.
 */

/** The only domain NLR Identity issues accounts on. */
export const NLR_DOMAIN = 'nlr.com';

/**
 * Domains that are explicitly rejected with a helpful message.
 *
 * The domain check below rejects everything that is not `nlr.com`, so this list
 * is not a security control - it exists purely so a user who types
 * `john@gmail.com` gets "use your NLR Identity" instead of a generic error.
 */
export const REJECTED_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
] as const;

/**
 * Local-part rules: 3-20 characters, lowercase letters, digits, dots,
 * underscores and hyphens, and it must start with a letter.
 *
 * Deliberately narrow. RFC 5321 permits far stranger addresses, but a closed
 * domain has no obligation to accept them, and a narrow charset removes a
 * whole class of display, normalisation, and impersonation problems.
 */
const LOCAL_PART_PATTERN = /^[a-z][a-z0-9._-]{2,19}$/;

/** Username rules: 3-20 characters, letters, digits and underscores. */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * Builds a full NLR Identity from what the user typed.
 *
 * Accepts a bare local part (`john`) or a full identity (`john@nlr.com`), so
 * that a user who types the whole thing out of habit is not punished for it.
 * The result is always lowercase: identities are case-insensitive, and storing
 * both `John@nlr.com` and `john@nlr.com` would create two accounts that look
 * identical to a human.
 */
export function toNlrIdentity(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const localPart = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed;
  return `${localPart ?? ''}@${NLR_DOMAIN}`;
}

/** Extracts the local part of an identity: `john@nlr.com` becomes `john`. */
export function toLocalPart(input: string): string {
  const trimmed = input.trim().toLowerCase();
  return trimmed.includes('@') ? (trimmed.split('@')[0] ?? '') : trimmed;
}

/** Result of checking an identity, with a message the form can display as-is. */
export type IdentityCheck = { valid: true } | { valid: false; message: string };

/**
 * Validates what the user typed into the identity field.
 *
 * Returns a message rather than throwing, because this runs on every keystroke
 * in a form and an exception is the wrong shape for that.
 */
export function checkIdentity(input: string): IdentityCheck {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === '') {
    return { valid: false, message: 'Choose an identity.' };
  }

  if (trimmed.includes('@')) {
    const domain = trimmed.split('@')[1] ?? '';

    if (domain === '') {
      return { valid: false, message: `Type just the name, or the full ${NLR_DOMAIN} address.` };
    }

    if (isRejectedDomain(domain)) {
      return {
        valid: false,
        message: `${domain} addresses are not accepted. NLR Identity issues accounts on ${NLR_DOMAIN} only.`,
      };
    }

    if (domain !== NLR_DOMAIN) {
      return { valid: false, message: `Identities must end in @${NLR_DOMAIN}.` };
    }
  }

  const localPart = toLocalPart(trimmed);

  if (!LOCAL_PART_PATTERN.test(localPart)) {
    return {
      valid: false,
      message:
        'Use 3-20 characters: lowercase letters, digits, dots, underscores or hyphens, starting with a letter.',
    };
  }

  return { valid: true };
}

/** True when the domain is a known public mail provider. */
export function isRejectedDomain(domain: string): boolean {
  return REJECTED_DOMAINS.includes(domain.toLowerCase() as (typeof REJECTED_DOMAINS)[number]);
}

/** True when the string is a well-formed NLR Identity. */
export function isNlrIdentity(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  const [localPart, domain] = trimmed.split('@');
  return domain === NLR_DOMAIN && localPart !== undefined && LOCAL_PART_PATTERN.test(localPart);
}

/** True when the username matches the allowed charset and length. */
export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim());
}

/**
 * Normalises a username for storage and lookup.
 *
 * Usernames are displayed as typed but compared in lowercase, so `John123` and
 * `john123` cannot both be registered. Without this, an attacker can register a
 * visually identical username and impersonate someone.
 */
export function normaliseUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** First name, for the dashboard greeting. Falls back to the whole string. */
export function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first === undefined || first === '' ? fullName.trim() : first;
}
