/**
 * Firebase initialisation.
 *
 * Configuration comes from environment variables (see `.env.example`), never
 * from values hardcoded in source. That is partly hygiene and partly practical:
 * every contributor points the same code at their own project without editing a
 * tracked file.
 *
 * A note on what these values are, because it confuses people: the Firebase web
 * config is **not a secret**. It identifies your project; it does not authorise
 * access to it. Anyone can read it out of the shipped bundle, and that is fine.
 * Access is controlled by Firestore security rules (`firestore.rules`) and by
 * Firebase Authentication. A *service account key* is a different thing
 * entirely and must never appear in this app.
 *
 * Initialisation is lazy. The app must render without configuration - a fresh
 * clone has none, and a demo that white-screens before a student has made a
 * Firebase account teaches nothing.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured, useEmulator } from '@/utils/env';

/** Thrown when a Firebase call is attempted with no configuration present. */
export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Firebase is not configured. Copy .env.example to .env.local and add your project values.',
    );
    this.name = 'FirebaseNotConfiguredError';
  }
}

type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

let services: FirebaseServices | null = null;

/**
 * Returns the initialised Firebase services, creating them on first use.
 *
 * Throws `FirebaseNotConfiguredError` when configuration is missing. Callers in
 * the UI catch that specific type and render setup instructions rather than a
 * stack trace.
 */
export function getFirebase(): FirebaseServices {
  if (services !== null) return services;

  if (!isFirebaseConfigured()) {
    throw new FirebaseNotConfiguredError();
  }

  // `getApps()` guards against double initialisation, which React's StrictMode
  // double-invocation and Vite's hot reload both make easy to trigger.
  const existing = getApps()[0];
  const app = existing ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (useEmulator) {
    // The emulator connectors must run before any other SDK call, which is why
    // they live here rather than in a separate setup step.
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  services = { app, auth, db };
  return services;
}

/** Convenience accessors, for call sites that only need one service. */
export function getAuthInstance(): Auth {
  return getFirebase().auth;
}

export function getDb(): Firestore {
  return getFirebase().db;
}

/** How the app is currently wired up, for the status banner. */
export type FirebaseStatus = 'not-configured' | 'emulator' | 'live';

export function getFirebaseStatus(): FirebaseStatus {
  if (!isFirebaseConfigured()) return 'not-configured';
  return useEmulator ? 'emulator' : 'live';
}

/** Human-readable description of the current connection state. */
export function describeFirebaseStatus(): string {
  switch (getFirebaseStatus()) {
    case 'not-configured':
      return 'Firebase is not configured. Copy .env.example to .env.local to connect a project.';
    case 'emulator':
      return `Connected to the local Firebase emulator (project: ${firebaseConfig.projectId}).`;
    case 'live':
      return `Connected to Firebase project "${firebaseConfig.projectId}".`;
  }
}

export { isFirebaseConfigured };
