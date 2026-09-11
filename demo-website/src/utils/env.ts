/**
 * Typed access to environment variables.
 *
 * Vite exposes only variables prefixed with `VITE_`, and everything it exposes
 * is compiled into the browser bundle where anyone can read it. Reading them
 * through this module rather than touching `import.meta.env` directly gives us
 * one place to document that, one place to apply defaults, and one place to
 * change if the source of configuration ever moves.
 *
 * Never add a secret here. See `.env.example` for the full explanation.
 */

/** Reads a `VITE_` variable, falling back when it is unset or blank. */
function read(key: string, fallback = ''): string {
  const value = import.meta.env[key] as string | undefined;
  return value === undefined || value.trim() === '' ? fallback : value;
}

/** Public links used across the site. */
export const siteConfig = {
  githubUrl: read('VITE_GITHUB_REPO_URL', 'https://github.com/your-org/nlr-identity'),
  docsUrl: read('VITE_DOCS_URL', 'https://github.com/your-org/nlr-identity/tree/main/docs'),
} as const;

/**
 * Firebase web configuration.
 *
 * These values are not secrets - they identify the project, they do not grant
 * access to it. Access is controlled by Firestore security rules. See
 * `docs/database-design.md`.
 */
export const firebaseConfig = {
  apiKey: read('VITE_FIREBASE_API_KEY'),
  authDomain: read('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: read('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: read('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: read('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: read('VITE_FIREBASE_APP_ID'),
  // Optional: only consumed if Analytics is ever enabled. Firebase ignores it
  // otherwise, so passing it through costs nothing.
  measurementId: read('VITE_FIREBASE_MEASUREMENT_ID'),
} as const;

/** True when the Firebase Emulator Suite should be used instead of a live project. */
export const useEmulator = read('VITE_FIREBASE_USE_EMULATOR', 'false') === 'true';

/**
 * Whether enough Firebase configuration is present to connect.
 *
 * A fresh clone has no configuration at all, and that is fine: the UI checks
 * this flag and renders a "not configured" state rather than throwing on load.
 * A demo that crashes on a fresh clone teaches nobody anything.
 */
export function isFirebaseConfigured(): boolean {
  return firebaseConfig.apiKey !== '' && firebaseConfig.projectId !== '';
}
