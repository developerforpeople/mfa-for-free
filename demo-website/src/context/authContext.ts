/**
 * The auth context object and its type.
 *
 * Split into its own file so that `AuthProvider.tsx` exports a component and
 * nothing else. React Fast Refresh can only reliably hot-reload a module whose
 * exports are all components, and mixing a context object in breaks that.
 */

import { createContext } from 'react';
import type { User } from '@/firebase/auth';
import type { UserProfile } from '@/firebase/firestore';

export type AuthState = {
  /** The Firebase credential, or null when signed out. */
  user: User | null;
  /** The Firestore profile. Null while loading, or if the document is missing. */
  profile: UserProfile | null;
  /**
   * True until the first auth state resolves.
   *
   * This matters more than it looks: on a page reload Firebase takes a moment
   * to restore the session, and a ProtectedRoute that redirects during that
   * moment throws signed-in users back to the login page on every refresh.
   */
  loading: boolean;
  /** Profile load failure, usually a Firestore rules problem. */
  error: string | null;

  /**
   * True when this account has an active device and the second factor has not
   * been presented yet in this browser session.
   *
   * Drives the redirect to /verify. Deliberately session-scoped rather than
   * persisted: "remember this device for 30 days" is a real feature, but it is
   * a decision with security consequences, and a teaching demo should make the
   * second factor visible every time rather than quietly skip it.
   */
  mfaRequired: boolean;

  /** True once a code or recovery code has been accepted this session. */
  mfaVerified: boolean;

  /** Records a successful second-factor check. */
  markMfaVerified: () => void;

  /** Signs out and clears local state. */
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);
