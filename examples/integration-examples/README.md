# Integration Examples

How to add TOTP-based MFA to an application you already have.

The main project builds the pieces from scratch so you can see inside them. These examples do the
opposite: they show the shortest correct path to shipping MFA in a real codebase, which almost
always means **using a maintained library rather than writing your own crypto**.

Both are worth knowing. Understand the mechanism, then use the library.

## Status

| Example | Stack | Status |
|---|---|---|
| [Enrollment and verification, end to end](enrollment-flow.md) | Language-agnostic | ✅ Available |
| [Server-side verification](firebase-cloud-functions.md) | Cloud Functions v2, Firestore | ✅ Available |
| Node.js + Express | Express, `otplib` | Wanted |
| Python + FastAPI | FastAPI, `pyotp` | Wanted |

The Cloud Functions example is the important one: it is the fix for the single
biggest shortcut the demo website takes, which is verifying codes in the
browser. Read it before deploying anything from this project.

Contributions are welcome - an example for a framework not listed here is a genuinely useful pull
request. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Before You Integrate Anything

A checklist drawn from [SECURITY.md](../../SECURITY.md). Every item has been the root cause of a
real incident somewhere.

- [ ] Verification happens **server-side**. A client can claim anything.
- [ ] Secrets are generated with a **cryptographically secure** random source, not `Math.random()`.
- [ ] Secrets are **encrypted at rest**, with the key outside the database.
- [ ] Codes are compared in **constant time**.
- [ ] A successful `(device, counter)` pair is **recorded and refused** on reuse.
- [ ] The drift window is **one step either side**, not five.
- [ ] Failed attempts are **rate-limited**, and lockout requires the first factor again.
- [ ] Recovery codes exist, are **hashed** with a slow hash, and are **single-use**.
- [ ] Enrollment requires an **already-authenticated** session.
- [ ] No code, secret, or raw IP address reaches your **logs**.

## Recommended Libraries

Do not write your own TOTP implementation for production. These are maintained, audited, and
tested against the RFC vectors:

| Language | Library |
|---|---|
| JavaScript / TypeScript | [`otplib`](https://github.com/yeojz/otplib), [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) |
| Python | [`pyotp`](https://github.com/pyauth/pyotp) |
| Go | [`pquerna/otp`](https://github.com/pquerna/otp) |
| Java / Kotlin | [`java-otp`](https://github.com/jchambers/java-otp) |
| Dart / Flutter | [`otp`](https://pub.dev/packages/otp) |
| Rust | [`totp-rs`](https://github.com/constantoine/totp-rs) |

And before reaching for any of them: if your platform already offers MFA - Firebase
Authentication, Auth0, Okta, Cognito - use it. Rolling your own is a decision that should be
justified, not a default.
