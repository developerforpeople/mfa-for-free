/**
 * Identity lifecycle: registration, sign-in, and profile loading.
 *
 * This is where the business rules live. `firebase/auth.ts` knows how to create
 * a credential and `firebase/firestore.ts` knows how to write a document; this
 * module knows what "registering an NLR Identity" actually means, and in what
 * order the steps have to happen.
 */

import { AuthError, createAccount, signIn, signOutUser } from '@/firebase/auth';
import {
  createUserDocuments,
  ensureUserDocument,
  fetchUserProfile,
  fetchUsernameRecord,
  isUsernameTaken,
  watchUserProfile,
  type UserProfile,
} from '@/firebase/firestore';
import { normaliseUsername, toLocalPart, toNlrIdentity } from '@/utils/identity';

export type RegisterInput = {
  name: string;
  username: string;
  /** Bare local part (`john`) or a full identity - both are accepted. */
  identity: string;
  password: string;
};

/**
 * Registers a new NLR Identity.
 *
 * The order of operations is the interesting part:
 *
 *   1. Check the username claim *first*. It is a cheap read, and failing here
 *      avoids creating an auth credential that would then be orphaned.
 *   2. Create the Firebase Auth credential. This is what enforces identity
 *      uniqueness - two accounts cannot share an email, so `auth/email-already-
 *      in-use` is the real uniqueness check for `john@nlr.com`.
 *   3. Write the profile and claim the username in one transaction.
 *
 * Step 1 is advisory, not authoritative: another registration can slip in
 * between the check and the write. Step 3 re-checks inside the transaction,
 * which is what actually makes the claim safe.
 */
export async function registerIdentity(input: RegisterInput): Promise<UserProfile> {
  const username = input.username.trim();
  const usernameLower = normaliseUsername(username);
  const nlrIdentity = toNlrIdentity(input.identity);
  const name = input.name.trim();

  if (await isUsernameTaken(usernameLower)) {
    throw new AuthError('That username is already taken. Choose another.', 'username-taken');
  }

  // Creating the credential also enforces that the identity is unique: Firebase
  // rejects a second account on the same address.
  const user = await createAccount(nlrIdentity, input.password, name);

  try {
    await createUserDocuments({
      uid: user.uid,
      name,
      nlrIdentity,
      username,
      usernameLower,
    });
  } catch (error) {
    // The credential exists but the profile write failed. Leaving the user
    // signed in with no profile would show them a broken dashboard, so sign
    // out and report it plainly. The orphaned credential is a known limitation
    // of doing this client-side: a server-side implementation would delete it,
    // which the browser is not permitted to do for another account.
    await signOutUser().catch(() => undefined);

    if (error instanceof Error && error.message === 'USERNAME_TAKEN') {
      throw new AuthError(
        'That username was claimed a moment ago. Choose another and try again.',
        'username-taken',
      );
    }

    throw new AuthError(
      'Your account was created but the profile could not be saved. Check your Firestore rules and sign in to retry.',
      'profile-write-failed',
    );
  }

  const profile = await fetchUserProfile(user.uid);
  if (profile === null) {
    throw new AuthError('Profile was created but could not be read back.', 'profile-read-failed');
  }

  return profile;
}

/**
 * Signs in with a username.
 *
 * Firebase authenticates with an email address, so the username is resolved to
 * an NLR Identity first. When no such username exists, the lookup falls back to
 * treating the input as an identity - which means a user who types `john` or
 * `john@nlr.com` instead of their username still gets in, and, more usefully,
 * a missing username produces the same "incorrect username or password" as a
 * wrong password rather than confirming which usernames exist.
 */
export async function loginWithUsername(username: string, password: string): Promise<UserProfile> {
  const usernameLower = normaliseUsername(username);
  const record = await fetchUsernameRecord(usernameLower);
  const nlrIdentity = record?.nlrIdentity ?? toNlrIdentity(toLocalPart(usernameLower));

  const user = await signIn(nlrIdentity, password);

  const profile = await fetchUserProfile(user.uid);
  if (profile === null) {
    // Credential without a profile - the repair path described in
    // `firestore.ts`. Rebuild from what Firebase Auth already knows.
    const localPart = toLocalPart(user.email ?? nlrIdentity);
    await ensureUserDocument({
      uid: user.uid,
      name: user.displayName ?? localPart,
      nlrIdentity: user.email ?? nlrIdentity,
      username: localPart,
      usernameLower: localPart,
    });

    const rebuilt = await fetchUserProfile(user.uid);
    if (rebuilt === null) {
      throw new AuthError('Signed in, but your profile could not be loaded.', 'profile-missing');
    }
    return rebuilt;
  }

  return profile;
}

/** Signs the current user out. */
export async function logout(): Promise<void> {
  await signOutUser();
}

/** Loads a profile by uid. */
export async function getProfile(uid: string): Promise<UserProfile | null> {
  return fetchUserProfile(uid);
}

/** Live profile subscription, re-exported so pages import from one layer. */
export const subscribeToProfile = watchUserProfile;

/** Checks username availability, for inline feedback on the register form. */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  return !(await isUsernameTaken(normaliseUsername(username)));
}

export type { UserProfile };
