# Example: Server-Side Verification with Cloud Functions

The demo website verifies codes **in the browser**, and says so in several
places. This page shows how to move that verification to a server, which is what
a real deployment must do.

**Why it matters:** a browser saying "the code was valid" proves nothing. Anyone
can open devtools, edit the client state, and skip the check. Verification is
only meaningful somewhere the user cannot rewrite.

Requires the Firebase **Blaze** plan (Cloud Functions are not on the free tier).
That is the only reason the demo does not ship this.

---

## The Shape of the Fix

```
Browser                          Cloud Function              Firestore
───────                          ──────────────              ─────────
password sign-in ───────────────────────────────────────────► session
POST verifyMfaCode(code) ──────► read the secret
                                 compute expected code
                                 constant-time compare
                                 check the replay counter
                                 set custom claim mfa=true
                          ◄───── { ok: true }
refresh the ID token
read /users/{uid} ─────────────────────────────────────────► rules check
                                                              request.auth
                                                              .token.mfa
```

Two things change, and both are essential:

1. **The secret never reaches the browser.** Rules deny client reads of the
   device list entirely; only the function, using the Admin SDK, can see it.
2. **The claim is the gate.** Firestore refuses to serve account data until the
   token carries `mfa: true`, so skipping the UI step yields a session the
   database will not talk to.

---

## 1. The Function

```bash
firebase init functions     # TypeScript
cd functions && npm install
```

`functions/src/index.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase-admin/app';
import { createHmac, timingSafeEqual } from 'node:crypto';

initializeApp();

const PERIOD = 30;
const DIGITS = 6;
const WINDOW = 1;

/** Rate limit: failures per account before the challenge is locked. */
const MAX_FAILURES = 5;

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of cleaned) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new HttpsError('invalid-argument', 'Bad secret.');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function totp(secret: string, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const mac = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

export const verifyMfaCode = onCall(async (request) => {
  // The caller is identified by Firebase Auth, not by anything they send.
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

  const code = String(request.data?.code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Enter the 6-digit code.');
  }

  const db = getFirestore();
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No profile.');

  const profile = snap.data()!;

  // Lockout. Six digits is a million options; unlimited guesses breaks it.
  if ((profile.failedMfaAttempts ?? 0) >= MAX_FAILURES) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Sign in again.');
  }

  const devices = (profile.devices ?? []) as Array<Record<string, unknown>>;
  const active = devices.filter((d) => d.status === 'active');
  const now = Math.floor(Date.now() / 1000 / PERIOD);

  for (const device of active) {
    for (let offset = -WINDOW; offset <= WINDOW; offset++) {
      const counter = now + offset;
      const expected = totp(String(device.secret), counter);

      // Constant-time. A plain === leaks, through timing, how many leading
      // characters matched.
      const a = Buffer.from(code);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) continue;

      // Replay: this counter already succeeded once.
      const lastUsed = device.lastUsedCounter as number | null;
      if (lastUsed !== null && lastUsed !== undefined && counter <= lastUsed) {
        throw new HttpsError('already-exists', 'That code has already been used.');
      }

      device.lastUsedCounter = counter;
      await ref.update({ devices, failedMfaAttempts: 0 });

      // The gate. Rules key off this claim, so the client cannot fake it.
      await getAuth().setCustomUserClaims(uid, { mfa: true });

      return { ok: true };
    }
  }

  await ref.update({ failedMfaAttempts: (profile.failedMfaAttempts ?? 0) + 1 });
  throw new HttpsError('permission-denied', 'That code is not correct.');
});
```

Note what is **not** logged anywhere: the submitted code, the expected code, and
the secret. An audit trail that leaks credentials is worse than none.

---

## 2. The Rules

Now that the function owns verification, the client must lose its access to the
secret entirely:

```js
match /users/{uid} {
  // Signed in, past MFA, and it is your own document.
  allow get: if request.auth != null
    && request.auth.uid == uid
    && request.auth.token.mfa == true;

  // Devices and recovery codes are written by the function only.
  allow update: if request.auth != null
    && request.auth.uid == uid
    && request.auth.token.mfa == true
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name']);

  allow create, delete: if false;
}
```

The Admin SDK bypasses rules by design, which is exactly why the function can do
what the browser now cannot.

Storing the secret in the same document the owner can read is still not ideal —
Firestore grants access per document, not per field. A stricter version puts
secrets in a sibling collection with `allow read: if false`, so nothing but the
Admin SDK ever sees them.

---

## 3. The Client

```ts
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

const verify = httpsCallable<{ code: string }, { ok: boolean }>(
  getFunctions(),
  'verifyMfaCode',
);

export async function submitMfaCode(code: string): Promise<void> {
  await verify({ code });

  // The claim was set server-side, but this browser is holding a token minted
  // before that happened. Force a refresh or the very next Firestore read is
  // rejected by the rule you just satisfied.
  await getAuth().currentUser?.getIdToken(true);
}
```

That token refresh is the step people miss, and the resulting bug — "it says my
code is right but the dashboard still won't load" — is confusing enough to lose
an afternoon to.

---

## 4. Deploy

```bash
firebase deploy --only functions,firestore:rules
```

---

## What This Buys You

| Before (demo) | After |
|---|---|
| Browser compares the code | Server compares it |
| Secret readable by the account owner | Secret readable only by the Admin SDK |
| MFA step skippable via client state | Skipping yields a token Firestore refuses |
| No rate limiting | Lockout after 5 failures |
| Replay check trusts the client | Replay counter written server-side |

---

## Related

- [enrollment-flow.md](enrollment-flow.md) — the endpoints in pseudocode
- [../../docs/authentication-flow.md](../../docs/authentication-flow.md)
- [../../docs/database-design.md](../../docs/database-design.md)
