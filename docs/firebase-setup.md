# Firebase Setup

> **Audience:** you have cloned the repository, run `npm install`, and want registration and login
> to actually work.

You have two options. Start with the emulator - it needs no account, no billing, and no risk of
writing test data somewhere permanent.

---

## Option A: Local Emulator (recommended for development)

The Firebase Emulator Suite runs Authentication and Firestore on your own machine.

### 1. Install the CLI

```bash
npm install -g firebase-tools
```

The Firestore emulator needs **Java 11 or newer**. Check with `java -version`; if it is missing,
install a JDK (Temurin, Microsoft OpenJDK, or your distribution's package).

### 2. Point the CLI at a project id

Any id works for the emulator - nothing is created remotely.

```bash
cp .firebaserc.example .firebaserc      # then edit the id, or leave the placeholder
```

### 3. Start the emulators

From the repository root:

```bash
firebase emulators:start --only auth,firestore
```

| Service | Address |
|---|---|
| Auth emulator | `127.0.0.1:9099` |
| Firestore emulator | `127.0.0.1:8080` |
| Emulator UI | <http://127.0.0.1:4000> |

The Emulator UI is worth keeping open - you can watch documents appear as you register, which
makes the data model concrete in a way reading the schema does not.

### 4. Configure the demo website

```bash
cd demo-website
cp .env.example .env.local
```

Then in `.env.local`:

```ini
VITE_FIREBASE_PROJECT_ID=demo-nlr-identity
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_USE_EMULATOR=true
```

The emulator does not validate the API key, so any non-empty value will do. `npm run dev`, and
register an account.

> Emulator data is wiped when you stop it. Use `firebase emulators:start --import=./seed
> --export-on-exit=./seed` if you want it to persist between runs.

---

## Option B: A Real Firebase Project

### 1. Create the project

<https://console.firebase.google.com> → **Add project**. Google Analytics is not needed.

### 2. Enable Email/Password authentication

**Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**

Leave "Email link (passwordless sign-in)" off. If you skip this step, registration fails with
`auth/operation-not-allowed`, which the app reports in plain language.

### 3. Create the Firestore database

**Build → Firestore Database → Create database.** Choose a region near you, and start in
**production mode** - the rules in this repository replace the defaults in step 5.

### 4. Register a web app and copy the config

**Project settings → General → Your apps → Web (`</>`).** Copy the config values into
`demo-website/.env.local`:

```ini
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_USE_EMULATOR=false
```

These values are **not secrets**. They identify your project; they do not authorise access to it,
and they ship in the JavaScript bundle where anyone can read them. What protects your data is the
rules in the next step. A *service account key* is an entirely different thing and must never go
in this file.

### 5. Deploy the security rules

This step is not optional. Without it, either nothing works (production mode denies everything) or
everything is readable (test mode allows everything for 30 days).

```bash
cp .firebaserc.example .firebaserc     # set your real project id
firebase deploy --only firestore:rules
```

Read [`firestore.rules`](../firestore.rules) before deploying. It is short, commented, and it is
the only thing standing between one user's device secrets and every other user.

---

## Verifying It Works

1. `cd demo-website && npm run dev`
2. Open <http://localhost:5173> - the "Get started" section reports the connection state
3. Register at `/register` with identity `john` → it becomes `john@nlr.com`
4. Check Firestore: `users/{uid}` and `usernames/john123` should both exist
5. Sign out, sign back in at `/login` with the **username**
6. Visit `/mfa-setup`, name a device, generate the QR, and scan it
7. Type the first code to confirm the device, then save the recovery codes
8. Sign out and back in - you should now be asked for a code at `/verify`

The QR code is a real `otpauth://` URI, so any standard authenticator will read it. That is a
useful cross-check: if Google Authenticator and the NLR app show the same digits for the same
account, both implementations agree with the RFC.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Firebase is not configured" banner | `.env.local` missing or blank | Copy `.env.example`, fill it in, restart the dev server |
| Changes to `.env.local` do nothing | Vite reads env at startup | Restart `npm run dev` |
| `auth/operation-not-allowed` | Email/Password provider disabled | Enable it in the console (step 2) |
| `auth/invalid-credential` on a correct password | Account is on a different project | Check `VITE_FIREBASE_PROJECT_ID` |
| "Could not load your profile ... check firestore.rules" | Rules not deployed, or denying reads | `firebase deploy --only firestore:rules` |
| Registration succeeds, profile write fails | Rules reject the document shape | Compare with `hasValidProfileShape` in `firestore.rules` |
| `Could not reach Firebase` | Emulator not running, or wrong host | Start the emulators, or set `VITE_FIREBASE_USE_EMULATOR=false` |
| Emulator will not start | Java missing | Install JDK 11+ |
| **A correct code is rejected** | **The two clocks disagree** | **See below** |

### "I typed the correct code and it said incorrect"

This is almost always clock skew, and it is worth understanding why rather than just fixing it.

A TOTP code is derived from two inputs: the shared secret, and the current 30-second time step.
There is no third input and no negotiation. If your phone and the verifying machine disagree about
what time it is by more than roughly 30 seconds, the phone is generating codes for a different
step, and every single one will be rejected.

**Timezones are not the cause.** Both implementations work from Unix epoch time, which is
timezone-independent - a phone in IST and a server in UTC compute the identical time step. If a
whole-timezone offset does show up, it means one device has its *absolute* clock wrong, usually
because the time was set manually.

**The ten-second check:** put your phone next to the screen and compare the clocks to the second.

**The precise check:** the demo ships a diagnostic that tells you the exact skew.

```bash
cd demo-website
npm run totp-doctor -- <YOUR_SETUP_KEY> <CODE_YOUR_PHONE_SHOWS>
```

It searches 24 hours either side and reports which time step your code matched, so the output is a
number of seconds rather than a guess. You can get the setup key by starting a fresh enrollment
and pressing **Reveal** - the key from an existing enrollment is deliberately unrecoverable.

**Common fixes**

| Device | Fix |
|---|---|
| Android | Settings &rsaquo; System &rsaquo; Date & time &rsaquo; **Set time automatically** |
| Windows | Settings &rsaquo; Time & language &rsaquo; Date & time &rsaquo; **Set time automatically**, then **Sync now** |
| Android emulator | Emulator clocks drift badly. `adb shell "su 0 date @$(date +%s)"`, or cold-boot it. |

If the doctor reports a match at the *current* step and the site still rejects the code, the clock
is fine and the cause is replay protection - that code was already used. Wait for the next one.

---

## Related

- [database-design.md](database-design.md) - the collections these rules protect
- [authentication-flow.md](authentication-flow.md) - what each screen is doing
- [../SECURITY.md](../SECURITY.md) - why this must not be deployed as real authentication
