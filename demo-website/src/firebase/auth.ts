/**
 * Firebase Authentication wrapper.
 *
 * Everything the app does with credentials goes through this module. Pages call
 * these functions; they never import `firebase/auth` directly. That boundary is
 * what lets the whole UI be reasoned about without a network, and it gives one
 * place to translate Firebase's error codes into sentences a human can act on.
 *
 * NLR Identity uses Firebase's email/password provider, with the NLR Identity
 * (`john@nlr.com`) as the email. Firebase never sees a username - the username
 * is resolved to an identity first, in `services/userService.ts`.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { FirebaseNotConfiguredError, getAuthInstance } from './config';

/**
 * An error already phrased for a user.
 *
 * Firebase error codes are precise and unreadable (`auth/invalid-credential`).
 * Pages render `AuthError.message` directly, so the translation happens once,
 * here, instead of in every catch block.
 */
export class AuthError extends Error {
  readonly code: string;

  constructor(message: string, code = 'unknown') {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/**
 * Maps a Firebase error code to a message.
 *
 * Note what the credential cases have in common: they all say the same thing.
 * Telling the user "no account with that identity" confirms which identities
 * exist, which is free reconnaissance for anyone guessing at accounts. The
 * vaguer message is deliberate, not laziness.
 */
function describeAuthError(error: unknown): AuthError {
  if (error instanceof FirebaseNotConfiguredError) {
    return new AuthError(error.message, 'not-configured');
  }

  if (!(error instanceof FirebaseError)) {
    return new AuthError('Something went wrong. Please try again.', 'unknown');
  }

  switch (error.code) {
    case 'auth/email-already-in-use':
      return new AuthError('That identity is already taken. Choose another.', error.code);
    case 'auth/invalid-email':
      return new AuthError('That identity is not valid.', error.code);
    case 'auth/weak-password':
      return new AuthError('That password is too weak. Use at least 8 characters.', error.code);
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return new AuthError('Incorrect username or password.', error.code);
    case 'auth/too-many-requests':
      return new AuthError(
        'Too many attempts. Wait a few minutes before trying again.',
        error.code,
      );
    case 'auth/network-request-failed':
      return new AuthError('Could not reach Firebase. Check your connection.', error.code);
    case 'auth/operation-not-allowed':
      return new AuthError(
        'Email/password sign-in is disabled. Enable it in the Firebase console.',
        error.code,
      );
    default:
      return new AuthError('Authentication failed. Please try again.', error.code);
  }
}

/**
 * Creates a Firebase Auth account for an NLR Identity.
 *
 * This creates the credential only. The Firestore profile document is written
 * separately by `userService.registerIdentity`, which owns the whole
 * registration transaction.
 */
export async function createAccount(
  nlrIdentity: string,
  password: string,
  displayName: string,
): Promise<User> {
  try {
    const auth = getAuthInstance();
    const credential = await createUserWithEmailAndPassword(auth, nlrIdentity, password);

    // Set the display name immediately so the UI has something to greet the
    // user with before the Firestore profile has loaded.
    await updateProfile(credential.user, { displayName });

    return credential.user;
  } catch (error) {
    throw describeAuthError(error);
  }
}

/** Signs in with a resolved NLR Identity and password. */
export async function signIn(nlrIdentity: string, password: string): Promise<User> {
  try {
    const auth = getAuthInstance();
    const credential = await signInWithEmailAndPassword(auth, nlrIdentity, password);
    return credential.user;
  } catch (error) {
    throw describeAuthError(error);
  }
}

/** Signs the current user out. */
export async function signOutUser(): Promise<void> {
  try {
    await signOut(getAuthInstance());
  } catch (error) {
    throw describeAuthError(error);
  }
}

/**
 * Subscribes to sign-in state.
 *
 * Returns an unsubscribe function. When Firebase is not configured the callback
 * fires once with `null` and nothing is subscribed - that keeps `AuthProvider`
 * free of configuration checks of its own.
 */
export function watchAuthState(callback: (user: User | null) => void): Unsubscribe {
  try {
    return onAuthStateChanged(getAuthInstance(), callback);
  } catch {
    callback(null);
    return () => undefined;
  }
}

/** The signed-in user, or null. Prefer `useAuth()` inside components. */
export function currentUser(): User | null {
  try {
    return getAuthInstance().currentUser;
  } catch {
    return null;
  }
}

export type { User };
