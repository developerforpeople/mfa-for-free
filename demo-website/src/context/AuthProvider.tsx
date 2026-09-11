import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { watchAuthState, type User } from '@/firebase/auth';
import { subscribeToProfile, logout } from '@/services/userService';
import type { UserProfile } from '@/firebase/firestore';
import { AuthContext, type AuthState } from './authContext';

/**
 * Provides sign-in state to the whole app.
 *
 * Two subscriptions, chained: one to Firebase Auth, and - once there is a user -
 * one to that user's Firestore profile. The profile is live rather than fetched
 * once, so enrolling a device on the MFA page updates the dashboard's status
 * without a refresh.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaVerified, setMfaVerified] = useState(false);

  // Subscribe to sign-in state once, on mount.
  useEffect(() => {
    const unsubscribe = watchAuthState((nextUser) => {
      setUser(nextUser);
      setLoading(false);

      // Clear the previous user's profile immediately on sign-out, rather than
      // waiting for the profile effect to tear down. Showing one account's name
      // after another has signed in is the kind of bug users report as a
      // security incident, and they are right to.
      if (nextUser === null) {
        setProfile(null);
        setError(null);
        // Signing out must clear the second-factor flag, or the next person to
        // sign in on this browser inherits it and skips verification.
        setMfaVerified(false);
      }
    });

    return unsubscribe;
  }, []);

  // Subscribe to the signed-in user's profile.
  useEffect(() => {
    if (user === null) return;

    setError(null);

    const unsubscribe = subscribeToProfile(
      user.uid,
      (nextProfile) => {
        setProfile(nextProfile);
      },
      (subscriptionError) => {
        // Almost always a Firestore rules problem, so say so - it is the first
        // thing to check and the error Firebase returns does not mention it.
        setError(
          `Could not load your profile: ${subscriptionError.message}. Check that firestore.rules is deployed.`,
        );
      },
    );

    return unsubscribe;
  }, [user]);

  const signOut = useCallback(async () => {
    await logout();
    setProfile(null);
    setMfaVerified(false);
  }, []);

  const markMfaVerified = useCallback(() => setMfaVerified(true), []);

  // MFA is owed whenever the account has a confirmed device and this session
  // has not presented one yet. `mfaEnabled` alone is not enough - it can be
  // true while the only device is pending.
  const mfaRequired =
    profile !== null &&
    profile.mfaEnabled &&
    profile.devices.some((device) => device.status === 'active') &&
    !mfaVerified;

  // Memoised so consumers do not re-render on every provider render.
  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      loading,
      error,
      mfaRequired,
      mfaVerified,
      markMfaVerified,
      signOut,
    }),
    [user, profile, loading, error, mfaRequired, mfaVerified, markMfaVerified, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
