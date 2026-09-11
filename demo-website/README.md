# NLR Identity - Demo Website

The React demo for [NLR Identity](../README.md). It plays the role of the **relying party**: the
application that needs to be sure who you are.

The full flow works: create an NLR Identity, sign in with a username, enrol a device by QR,
confirm it with a code, sign in with the second factor, manage devices, and recover with a
single-use code when the device is gone.

## Stack

| Tool | Why |
|---|---|
| **React 19** | Function components, no class components anywhere |
| **TypeScript 5** | Strict mode, `noUncheckedIndexedAccess`, no `any` |
| **Vite 7** | Fast dev server, native ESM, minimal config |
| **Tailwind CSS 4** | Design tokens live in CSS via `@theme`, not a JS config |
| **ESLint 9** | Flat config, type-aware rules |
| **React Router 7** | Client-side routing and route guards |
| **React Hook Form + Zod** | Forms with schema validation; `z.infer` gives the form its type |
| **Firebase 12** | Authentication and Firestore |
| **qrcode** | Renders the `otpauth://` URI as a scannable image |

## Getting Started

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
cp .env.example .env.local   # then add your Firebase values
npm run dev                  # http://localhost:5173
```

The landing page renders with no configuration. Registration, sign-in, and MFA enrollment need a
Firebase project - the [setup guide](../docs/firebase-setup.md) covers the local emulator (no
account needed) and a real project.

### Routes

| Route | Page | Access |
|---|---|---|
| `/` | Landing page | Public |
| `/register` | Create an NLR Identity | Public, redirects if signed in |
| `/login` | Sign in with a username | Public, redirects if signed in |
| `/verify` | Second factor at sign-in | Signed in |
| `/dashboard` | Profile, MFA status, devices, recovery codes | Signed in + verified |
| `/mfa-setup` | Enrol and confirm a device | Signed in + verified |

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint across the project |
| `npm run lint:fix` | ESLint with autofix |
| `npm run typecheck` | `tsc` with no emit |
| `npm run format` | Prettier over `src/` |
| `npm run totp-doctor -- <key> <code>` | Diagnoses a rejected code by measuring clock skew |

## Folder Structure

```
demo-website/
├── public/                 Served verbatim (favicon, robots.txt)
├── src/
│   ├── components/         Reusable presentational UI
│   │   └── sections/       Landing page sections
│   ├── pages/              Route-level compositions
│   ├── firebase/           SDK boundary: config, auth, firestore
│   ├── services/           Business rules over the firebase layer
│   ├── context/            Auth state shared across the app
│   ├── utils/              Pure helpers, no React, no I/O
│   ├── styles/             Design tokens and global CSS
│   ├── assets/             Imported static files
│   ├── App.tsx             Shell and routing
│   └── main.tsx            Entry point
├── .env.example            Environment template
├── eslint.config.js        Flat ESLint config
└── vite.config.ts          Vite + Tailwind + `@/` alias
```

### The One Architectural Rule

**Components never talk to the outside world. The layers below them do.**

```
pages/components  ->  services/  ->  firebase/  ->  Firebase
      (UI)          (business rules)  (SDK calls)    (network)
```

`firebase/` knows *how* to write a document. `services/` knows *what* registering an identity
means - check the username, create the credential, write the profile and the claim in one
transaction. Splitting them means the rules are readable without SDK noise, and the SDK layer is
replaceable.

A component that imports `firebase/firestore` is a component you cannot render in a test, cannot
reason about in isolation, and cannot reuse. Keeping the boundary is what makes the data layer
swappable when Phase 2 changes how it works.

Imports use the `@/` alias for anything outside the current folder:

```ts
import { Button } from '@/components/Button';   // yes
import { Button } from '../../components/Button'; // no
```

## Design System

Tokens are defined in [`src/styles/index.css`](src/styles/index.css) inside Tailwind's `@theme`
block, which generates the matching utilities.

| Role | Token | Value |
|---|---|---|
| Primary | `navy-900` | `#0F172A` |
| Accent | `accent-600` | `#2563EB` |
| Body text | `slate-600` | `#475569` |
| Background | `slate-50` / `white` | `#F8FAFC` |
| Hairline border | `slate-200` | `#E2E8F0` |
| Card radius | `rounded-card` | `6px` |

Type is Inter with a full system fallback, at 15px body size - documentation density, not marketing
size.

**Use tokens, never raw hex.** And keep to the visual direction: hairline borders, small radii,
restrained colour, no gradients, no glassmorphism, no glow. The reference points are GitHub,
Cloudflare, Linear, and the Stripe docs.

## The Two Honest Limitations

Both are deliberate, both are documented at the point in the code where they matter, and both are
why [SECURITY.md](../SECURITY.md) says not to deploy this.

**1. Codes are verified in the browser.** A client can claim any result it likes, so a browser
saying "valid" proves nothing to a server. The MFA gate on `/dashboard` therefore hides UI rather
than protecting data - a determined user could edit client state and skip it.

The logic lives in [`src/services/totpService.ts`](src/services/totpService.ts) and
[`src/services/recoveryService.ts`](src/services/recoveryService.ts), both free of React and
Firebase, so moving it server-side is a copy-paste.
[The Cloud Functions example](../examples/integration-examples/firebase-cloud-functions.md) does
exactly that, and adds the custom claim that makes the Firestore rules refuse to serve data until
MFA has actually been verified.

It is done this way because Cloud Functions need a billing plan, and a student should not have to
enter card details to see how MFA works.

**2. Device secrets are stored unencrypted** on the user's own profile document, because
enrollment runs in the browser and a browser has nowhere safe to keep an encryption key. A
production build generates and encrypts the secret inside a Cloud Function.

## Verification Details Worth Knowing

The verification in `totpService.ts` is not a toy. It implements the parts that are easy to skip
and expensive to get wrong:

| Behaviour | Why |
|---|---|
| ±1 time step accepted | ~90s tolerance for clock drift. Wider multiplies the brute-force surface. |
| Constant-time comparison | A plain `===` leaks, through timing, how many leading digits matched |
| Replay rejection | A counter that already succeeded is refused, so a captured code is dead |
| Every active device tried | One identity can have a phone and a tablet, each with its own secret |
| Recovery codes PBKDF2-hashed | They are credentials; a fast hash makes an offline search practical |
| Salted per code | Two identical codes must not produce identical hashes |
| No early return on match | Checking all hashes stops timing revealing which code matched |

All of it is verified against the published RFC 6238, RFC 4226 and RFC 4648 vectors - the same
vectors the Flutter app is tested against, which is what proves the two halves interoperate.

## Environment Variables

Only `VITE_`-prefixed variables reach the browser, and everything that reaches the browser is
readable by anyone. Firebase web config is designed to be public - it identifies a project, it does
not authorise access, which is what security rules are for. A service account key or an API secret
must never appear in `.env.local`.

See [`.env.example`](.env.example) for the annotated list.

## Contributing

Read [CONTRIBUTING.md](../CONTRIBUTING.md). Before opening a PR:

```bash
npm run lint && npm run typecheck && npm run build
```
