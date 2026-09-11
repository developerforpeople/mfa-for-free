import { useContext } from 'react';
import { AuthContext, type AuthState } from './authContext';

/**
 * Reads the current auth state.
 *
 * Throws when used outside `AuthProvider` rather than returning a null-ish
 * default: a component rendering with silently empty auth state is a bug that
 * is much harder to find than a clear error at startup.
 */
export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }

  return context;
}
