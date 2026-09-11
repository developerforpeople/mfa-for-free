/**
 * Firestore access layer.
 *
 * Document shapes, collection paths, and the low-level read/write helpers live
 * here. Business rules do not - those belong in `src/services/`. The split
 * matters: this file knows *how* to talk to Firestore, the services know *what*
 * registering an identity means.
 *
 * The schema mirrors `docs/database-design.md`.
 */

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from './config';

/* --- Collection paths ----------------------------------------------------
 * Written once, here, so a typo in a path is a compile error somewhere rather
 * than a silent read of a collection that does not exist.
 * ------------------------------------------------------------------------ */

export const COLLECTIONS = {
  users: 'users',
  usernames: 'usernames',
} as const;

/* --- Document shapes ----------------------------------------------------- */

/**
 * An enrolled (or pending) authenticator device.
 *
 * SECURITY NOTE, and it is an important one: `secret` is stored in plaintext on
 * the user's own document. In a production system it would be encrypted with a
 * key the client never sees, and enrollment would run inside a Cloud Function -
 * see `docs/database-design.md`. This demo keeps it client-side so the entire
 * flow is readable in one place, which is the point of the project. It is also
 * exactly why SECURITY.md says not to deploy this as real authentication.
 */
export type StoredDevice = {
  deviceId: string;
  name: string;
  /** Base32 shared secret. See the note above before copying this pattern. */
  secret: string;
  /** `pending` until a code from the device confirms it, then `active`. */
  status: 'pending' | 'active' | 'revoked';
  algorithm: 'SHA1';
  digits: number;
  period: number;
  createdAt: string;
  confirmedAt: string | null;
  /**
   * The last time step that successfully verified for this device.
   *
   * Replay protection: any counter at or below this is refused. Without it, a
   * code captured by a proxy or read over a shoulder stays usable for the rest
   * of its 30-second window.
   */
  lastUsedCounter: number | null;
  revokedAt: string | null;
};

/** A user profile. Mirrors `users/{uid}`. */
export type UserProfile = {
  uid: string;
  name: string;
  nlrIdentity: string;
  username: string;
  /** Lowercase username, used for uniqueness and lookup. */
  usernameLower: string;
  createdAt: string;
  mfaEnabled: boolean;
  devices: StoredDevice[];
  /**
   * Recovery codes, stored as PBKDF2 hashes.
   *
   * Never plaintext. This array is readable by the account owner, and a
   * plaintext recovery code sitting here would be a working credential anyone
   * with a moment at their unlocked laptop could copy.
   */
  recoveryCodes: StoredRecoveryCode[];
};

/** One single-use backup credential. */
export type StoredRecoveryCode = {
  /** `pbkdf2$<iterations>$<salt>$<hash>`. Never the code itself. */
  hash: string;
  used: boolean;
  createdAt: string;
  usedAt: string | null;
};

/** The public username index: `usernames/{usernameLower}` -> identity. */
export type UsernameRecord = {
  uid: string;
  nlrIdentity: string;
};

/* --- Serialisation -------------------------------------------------------
 * Firestore returns `Timestamp` objects; the rest of the app works in ISO
 * strings, which are easier to render, compare, and log. Converting at the
 * boundary keeps Firestore types out of the UI entirely.
 * ------------------------------------------------------------------------ */

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  // A document written moments ago can arrive with a null timestamp, because
  // the server value has not resolved yet. "Now" is the honest answer.
  return new Date().toISOString();
}

function toDevice(raw: DocumentData): StoredDevice {
  return {
    deviceId: String(raw.deviceId ?? ''),
    name: String(raw.name ?? 'Unnamed device'),
    secret: String(raw.secret ?? ''),
    status: (raw.status as StoredDevice['status'] | undefined) ?? 'pending',
    algorithm: 'SHA1',
    digits: Number(raw.digits ?? 6),
    period: Number(raw.period ?? 30),
    createdAt: toIsoString(raw.createdAt),
    confirmedAt:
      raw.confirmedAt === null || raw.confirmedAt === undefined
        ? null
        : toIsoString(raw.confirmedAt),
    lastUsedCounter:
      typeof raw.lastUsedCounter === 'number' ? raw.lastUsedCounter : null,
    revokedAt:
      raw.revokedAt === null || raw.revokedAt === undefined
        ? null
        : toIsoString(raw.revokedAt),
  };
}

/** Converts a raw Firestore document into a `UserProfile`. */
function toUserProfile(uid: string, raw: DocumentData): UserProfile {
  const devices = Array.isArray(raw.devices) ? (raw.devices as DocumentData[]) : [];

  return {
    uid,
    name: String(raw.name ?? ''),
    nlrIdentity: String(raw.nlrIdentity ?? ''),
    username: String(raw.username ?? ''),
    usernameLower: String(raw.usernameLower ?? String(raw.username ?? '').toLowerCase()),
    createdAt: toIsoString(raw.createdAt),
    mfaEnabled: Boolean(raw.mfaEnabled),
    devices: devices.map(toDevice),
    recoveryCodes: Array.isArray(raw.recoveryCodes)
      ? (raw.recoveryCodes as DocumentData[]).map(toRecoveryCode)
      : [],
  };
}

function toRecoveryCode(raw: DocumentData): StoredRecoveryCode {
  return {
    hash: String(raw.hash ?? ''),
    used: Boolean(raw.used),
    createdAt: toIsoString(raw.createdAt),
    usedAt:
      raw.usedAt === null || raw.usedAt === undefined ? null : toIsoString(raw.usedAt),
  };
}

/* --- Reads --------------------------------------------------------------- */

/** Loads a user profile, or null when the document does not exist. */
export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(getDb(), COLLECTIONS.users, uid));
  if (!snapshot.exists()) return null;
  return toUserProfile(uid, snapshot.data());
}

/**
 * Subscribes to a user profile.
 *
 * The dashboard uses this so that enrolling a device on the MFA page updates
 * the MFA status without a manual refresh.
 */
export function watchUserProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), COLLECTIONS.users, uid),
    (snapshot) => {
      onChange(snapshot.exists() ? toUserProfile(uid, snapshot.data()) : null);
    },
    onError,
  );
}

/**
 * Looks up which identity a username belongs to.
 *
 * This read happens *before* sign-in, so the `usernames` collection has to be
 * publicly readable - see the trade-off documented in `firestore.rules`. It
 * holds no secrets: a username and the identity derived from it.
 */
export async function fetchUsernameRecord(usernameLower: string): Promise<UsernameRecord | null> {
  const snapshot = await getDoc(doc(getDb(), COLLECTIONS.usernames, usernameLower));
  if (!snapshot.exists()) return null;

  const raw = snapshot.data();
  return {
    uid: String(raw.uid ?? ''),
    nlrIdentity: String(raw.nlrIdentity ?? ''),
  };
}

/** True when the username is already claimed. */
export async function isUsernameTaken(usernameLower: string): Promise<boolean> {
  return (await fetchUsernameRecord(usernameLower)) !== null;
}

/* --- Writes -------------------------------------------------------------- */

/**
 * Creates the profile document and claims the username, atomically.
 *
 * A transaction rather than two writes, because a half-finished registration -
 * a profile with no username claim, or a claim pointing at no profile - is a
 * broken account that only a manual database fix can repair. The transaction
 * re-checks the claim inside itself: two people registering the same username
 * at the same moment is exactly the race a check-then-write would lose.
 */
export async function createUserDocuments(profile: {
  uid: string;
  name: string;
  nlrIdentity: string;
  username: string;
  usernameLower: string;
}): Promise<void> {
  const db = getDb();
  const userRef = doc(db, COLLECTIONS.users, profile.uid);
  const usernameRef = doc(db, COLLECTIONS.usernames, profile.usernameLower);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(usernameRef);
    if (existing.exists()) {
      throw new Error('USERNAME_TAKEN');
    }

    transaction.set(userRef, {
      uid: profile.uid,
      name: profile.name,
      nlrIdentity: profile.nlrIdentity,
      username: profile.username,
      usernameLower: profile.usernameLower,
      createdAt: serverTimestamp(),
      mfaEnabled: false,
      devices: [],
      recoveryCodes: [],
    });

    transaction.set(usernameRef, {
      uid: profile.uid,
      nlrIdentity: profile.nlrIdentity,
    });
  });
}

/** Replaces the device list and the derived MFA flag on a profile. */
export async function saveDevices(
  uid: string,
  devices: StoredDevice[],
  mfaEnabled: boolean,
): Promise<void> {
  await updateDoc(doc(getDb(), COLLECTIONS.users, uid), {
    devices,
    mfaEnabled,
  });
}

/** Replaces the stored recovery-code set. */
export async function saveRecoveryCodes(
  uid: string,
  recoveryCodes: StoredRecoveryCode[],
): Promise<void> {
  await updateDoc(doc(getDb(), COLLECTIONS.users, uid), { recoveryCodes });
}

/**
 * Writes devices and recovery codes together.
 *
 * One update rather than two, so enabling MFA cannot leave an account with an
 * active device and no way back into it - the state a user discovers only after
 * losing their phone.
 */
export async function saveDevicesAndRecoveryCodes(
  uid: string,
  devices: StoredDevice[],
  mfaEnabled: boolean,
  recoveryCodes: StoredRecoveryCode[],
): Promise<void> {
  await updateDoc(doc(getDb(), COLLECTIONS.users, uid), {
    devices,
    mfaEnabled,
    recoveryCodes,
  });
}

/**
 * Writes a profile document for a user that has a credential but no profile.
 *
 * This is a repair path, not a normal one. It matters because Firebase Auth and
 * Firestore are separate systems: if the browser dies between creating the
 * credential and writing the profile, the user can sign in but has no data.
 * Rather than showing them a broken dashboard, the app rebuilds the profile.
 */
export async function ensureUserDocument(profile: {
  uid: string;
  name: string;
  nlrIdentity: string;
  username: string;
  usernameLower: string;
}): Promise<void> {
  await setDoc(
    doc(getDb(), COLLECTIONS.users, profile.uid),
    {
      uid: profile.uid,
      name: profile.name,
      nlrIdentity: profile.nlrIdentity,
      username: profile.username,
      usernameLower: profile.usernameLower,
      createdAt: serverTimestamp(),
      mfaEnabled: false,
      devices: [],
      recoveryCodes: [],
    },
    { merge: true },
  );
}

/** Escape hatch for one-off collection references. Prefer the helpers above. */
export function collectionRef(path: string) {
  return collection(getDb(), path);
}
