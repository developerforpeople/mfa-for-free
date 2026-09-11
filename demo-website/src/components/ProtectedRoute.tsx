import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';

/**
 * Route guard for authenticated pages.
 *
 * Used as a layout route wrapping `/dashboard` and `/mfa-setup`. Three states,
 * and the middle one is the one people forget:
 *
 *   1. `loading` - Firebase has not restored the session yet. Render a
 *      placeholder. Redirecting here would bounce signed-in users to the login
 *      page every time they refresh, which looks exactly like a broken session.
 *   2. signed out - redirect to /login, remembering where they were headed so
 *      the login page can send them back after signing in.
 *   3. signed in - render the route.
 *
 * This is a convenience, not a security control. It hides UI; it does not
 * protect data. Anyone can edit client-side state, so the thing that actually
 * stops one user reading another's profile is `firestore.rules`. A route guard
 * you trust for security is a route guard that has already failed.
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Checking your session...</p>
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}

/**
 * Requires the second factor before a protected page renders.
 *
 * Sits inside [ProtectedRoute], so by the time it runs the user is signed in.
 * If their account has a confirmed device and this session has not presented a
 * code, they go to /verify.
 *
 * As with [ProtectedRoute], this hides UI rather than protecting data. The
 * Firebase session already exists - the password made it - so a determined user
 * could edit client state and skip it. Closing that properly needs server-side
 * verification plus a custom claim the Firestore rules insist on; see the note
 * in `pages/VerifyMfa.tsx`.
 */
export function MfaGate() {
  const { mfaRequired, profile, loading } = useAuth();

  // Wait for the profile before deciding. Redirecting while it is still null
  // would send every user to /verify on a cold load, including those with no
  // device enrolled at all.
  if (loading || profile === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading your account...</p>
      </div>
    );
  }

  if (mfaRequired) {
    return <Navigate to="/verify" replace />;
  }

  return <Outlet />;
}

/**
 * The inverse guard: keeps signed-in users off /login and /register.
 *
 * Without it, someone who is already authenticated can land on the login form,
 * sign in again, and wonder why nothing happened.
 */
export function PublicOnlyRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Checking your session...</p>
      </div>
    );
  }

  if (user !== null) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
