# Customising NLR Identity

You are meant to change this project. Rebrand it, redesign the site, build your own dashboard,
bolt it onto something else. That is the point.

But some of it is **load-bearing**: change it carelessly and authentication silently stops being
authentication. Nothing will crash, no test will obviously fail, and codes will simply start being
accepted when they should not be — which is the worst kind of bug, because it looks like it works.

This page draws the line.

---

## The one-minute version

| Colour | Meaning |
|---|---|
| 🟢 **Green** | Change freely. It is design and copy. |
| 🟡 **Amber** | Change carefully. Keep the contract described below. |
| 🔴 **Red** | Do not change unless you understand the cryptography. Tests will catch you. |

After **any** change, run this. If it passes, you have not broken the logic:

```bash
cd demo-website && npm run lint && npm run typecheck && npm run build
cd ../authenticator-app && flutter analyze && flutter test
```

---

## 🟢 Green — change whatever you like

Redesign all of this. None of it affects whether authentication is correct.

```
demo-website/src/
├── pages/Home.tsx                    Landing page
├── components/sections/              All landing sections
├── components/                       Button, Input, Alert, Badge, Card...
├── styles/index.css                  Colours, fonts, spacing, radii
└── assets/                           Images, icons
```

Also green: every piece of user-facing text, the logo, the favicon, `index.html`, the page titles,
and the app's theme in `authenticator-app/lib/app/theme.dart`.

### Adding your own dashboard

This is the common case, and it is fully supported. Add your page and put it **inside both
guards**:

```tsx
// src/App.tsx
<Route element={<ProtectedRoute />}>        {/* signed in */}
  <Route element={<MfaGate />}>             {/* AND past the second factor */}
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/my-dashboard" element={<MyDashboard />} />   {/* ← yours */}
  </Route>
</Route>
```

Read the user from the context, never from props you invented:

```tsx
import { useAuth } from '@/context/useAuth';

export function MyDashboard() {
  const { user, profile } = useAuth();
  // profile.name, profile.nlrIdentity, profile.mfaEnabled, profile.devices
}
```

**Do not** put a signed-in page outside `MfaGate` and then read account data in it. That is exactly
how you build a screen that skips the second factor without noticing.

You can replace the shipped `Dashboard.tsx` wholesale. Just keep it inside the guards.

---

## 🟡 Amber — change carefully, keep the contract

### `src/services/mfaService.ts`

Orchestration: enrol → confirm → verify → revoke → recover. Safe to add to. The contract you must
not break:

- A device is created `pending` and becomes `active` **only** after a code verifies.
  Never write `status: 'active'` anywhere else.
- `mfaEnabled` is derived from "is there an active device", never set by hand.
- `lastUsedCounter` is written on **every** successful verification. Skipping it disables replay
  protection.
- Recovery codes are issued when MFA is first switched on, and stored **hashed**.

### `src/firebase/firestore.ts`

Document shapes and reads/writes. If you add fields, also add them to `firestore.rules` — a field
the rules do not mention is a field a client can write freely.

Never add a field that holds a plaintext secret, a code, or a plaintext recovery code.

### `src/context/AuthProvider.tsx`

Session state. `mfaRequired` is what sends users to `/verify`. If you change that expression, you
are changing who is allowed past the gate. Read it twice.

### `src/utils/validation.ts` and `identity.ts`

Form rules and the `@nlr.com` domain policy. Change the domain freely — it is a product decision,
not a security one. Keep the username normalisation (lowercase), or two users can register
visually identical names.

### `authenticator-app/lib/state/identity_store.dart`

Safe to extend. Keep two things: secrets are encrypted **before** an `Identity` object is built,
and `lock()` still clears the in-memory cache when the app is backgrounded.

---

## 🔴 Red — do not touch without reading the RFCs

### `src/services/totpService.ts` and `authenticator-app/lib/services/totp_service.dart`

The TOTP implementations. These are pinned to the published RFC 6238, RFC 4226 and RFC 4648 test
vectors, and those vectors are the only reason the website and the phone agree with each other —
and with Google Authenticator, and with everything else.

Specific things that look harmless and are not:

| Tempting change | What actually happens |
|---|---|
| Widen the drift window past ±1 | Multiplies the brute-force surface and keeps stolen codes alive longer |
| Replace `timingSafeEqual` with `===` | Timing side channel: turns a 1,000,000-guess search into about 60 |
| Drop the `0x7f` mask | Codes differ between signed and unsigned platforms |
| Drop the zero-padding | One code in ten starts with `0` and starts failing |
| Use local time instead of epoch | Works on your machine, fails for every user elsewhere |
| Skip `lastUsedCounter` | A captured code can be replayed for the rest of its window |

If you change these files, `flutter test` and the RFC checks are what will tell you. **Do not
"fix" a failing RFC vector by changing the expected value.** The vector is right; your code is not.

### `src/services/recoveryService.ts`

PBKDF2 hashing of recovery codes. Do not lower the iteration count, do not swap PBKDF2 for a bare
SHA-256, and do not remove the per-code salt. These are credentials; a fast hash makes an offline
search of the keyspace practical.

### `authenticator-app/lib/services/encryption_service.dart`

AES-256-GCM. Never reuse an IV — a repeated nonce under one key breaks GCM completely, leaking the
keystream *and* the authentication key. Never switch GCM for CBC; you would lose tamper detection.

### `firestore.rules`

The **only** thing actually stopping one user reading another's device secrets. The route guards
in React hide UI; they protect nothing. Every rule has a comment explaining what it defends
against — read them before editing, and test against the emulator.

---

## Things you must never do

1. **Never commit `.env.local`, `.firebaserc`, or `google-services.json`.** They are git-ignored.
   Leave them that way.
2. **Never log, store, or transmit a one-time code.** It is computed, compared, discarded.
3. **Never store a recovery code in plaintext.** Hash it.
4. **Never display a device secret after enrollment.** It is shown once, deliberately.
5. **Never use `Math.random()`** for a secret, a code, an id, or a salt. Use
   `crypto.getRandomValues` / `Random.secure()`.
6. **Never trust the browser's verdict.** In this demo the browser verifies codes, which is the
   one shortcut the project takes and documents everywhere. Before real use, move verification to
   a server — [the Cloud Functions walkthrough](examples/integration-examples/firebase-cloud-functions.md)
   is that change, written out in full.
7. **Never grant the Flutter app the INTERNET permission.** Release builds ship without it on
   purpose, so "this app cannot phone home" is enforced by Android rather than promised in a
   settings screen.

---

## Rebranding checklist

Renaming it to your own project:

| What | Where |
|---|---|
| Site name and copy | `demo-website/src/components/sections/`, `index.html` |
| Colours and type | `demo-website/src/styles/index.css`, `authenticator-app/lib/app/theme.dart` |
| Identity domain (`@nlr.com`) | `demo-website/src/utils/identity.ts` → `NLR_DOMAIN` |
| Issuer shown in authenticators | `demo-website/src/services/mfaService.ts` → `ISSUER` |
| App display name | `authenticator-app/android/app/src/main/AndroidManifest.xml`, `ios/Runner/Info.plist` |
| Android package id | `authenticator-app/android/app/build.gradle.kts` (and the Kotlin folder path) |
| Repo links | `demo-website/.env.example` → `VITE_GITHUB_REPO_URL` |

Change `ISSUER` and `NLR_DOMAIN` **before** anyone enrols. Both are baked into the QR code, so
changing them later leaves existing enrolments labelled with the old name.

---

## Before you deploy anything

This is educational software. [SECURITY.md](SECURITY.md) explains why it should not be your real
authentication layer. If you intend to use it for something that matters:

1. Move verification server-side (Cloud Functions example above)
2. Encrypt device secrets with a key the client never sees
3. Add rate limiting and account lockout
4. Put secrets in a collection the client cannot read at all
5. Have someone who does this professionally read your rules

---

## Where to read more

- [docs/totp-working.md](docs/totp-working.md) — the algorithm, with worked examples
- [docs/authentication-flow.md](docs/authentication-flow.md) — enrolment, login, recovery
- [docs/database-design.md](docs/database-design.md) — the schema and the rules
- [CONTRIBUTING.md](CONTRIBUTING.md) — code style and pull requests
