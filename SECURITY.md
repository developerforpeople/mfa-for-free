# Security Policy

## Read This First

**NLR Identity is educational software.** It exists so that students and developers can read a
working MFA implementation and understand it. It has not been through a professional security
audit, a penetration test, or a formal threat-modelling exercise.

Do not use this project as the authentication layer for a production system, a university portal
handling real student records, or anything holding data you would be sorry to lose. For production
MFA, use an established provider — Firebase Authentication, Auth0, Okta, AWS Cognito, or a
maintained TOTP library in your language of choice.

Learn from this code. Do not deploy this code.

## Supported Versions

| Version | Supported |
|---|---|
| `main` | ✅ Fixes land here |
| Tagged releases | ❌ None published yet |

Until version 1.0, security fixes are applied to `main` only.

## Reporting a Vulnerability

**Do not open a public GitHub issue for a security problem.** A public report tells everyone about
the flaw before there is a fix.

Instead, use one of these:

1. **GitHub Private Vulnerability Reporting** — [report a vulnerability](https://github.com/developerforpeople/mfa-for-free/security/advisories/new)
   privately. This is the preferred route.
2. **If that page is unavailable**, open an issue titled *"Security contact request"* containing
   **no details of the problem**, and a maintainer will arrange a private channel.

Please include:

- A description of the issue and why it matters
- Steps to reproduce, or a minimal proof of concept
- The affected file, function, or endpoint
- The impact you believe it has
- Any suggested fix, if you have one

### What Happens Next

| Stage | Target |
|---|---|
| Acknowledgement of your report | Within 3 business days |
| Initial assessment and severity | Within 7 business days |
| Fix or documented mitigation | Within 30 days for high severity |
| Public disclosure | After the fix ships, with credit to you unless you decline |

We practise coordinated disclosure. Please give us a reasonable window before publishing.

## In Scope

- Secret handling: generation, transport, storage, and destruction
- The TOTP implementation (`demo-website/src/services/totpService.ts`): drift windows, replay,
  truncation
- Recovery code generation, hashing, and single-use enforcement
- Firestore security rules that would let one identity read or modify another's data
- Enrollment flows that allow a device to be linked to an account that did not authorise it
- Dependency vulnerabilities with a plausible path to exploitation here

## Out of Scope

- The deliberate absence of production hardening (rate limiting, WAF, bot defence) in a demo
- Missing security headers on a local dev server
- Findings from an automated scanner with no demonstrated impact
- Social engineering of maintainers or contributors
- Denial of service through resource exhaustion against a demo deployment
- "This should use library X instead" — that is a design discussion, so open an issue

## Security Principles in This Project

These are the invariants. A change that breaks one of them is a bug, whatever else it does.

1. **One-time passwords are never persisted.** Not to Firestore, not to a log line, not to a cache.
   They are computed, compared, and discarded.
2. **One-time passwords are generated on the device.** The authenticator never receives a code from
   the server, so there is no code in transit to intercept.
3. **Device secrets belong encrypted at rest.** On the phone that is the authenticator app's job:
   a good one keeps the seed under a key held by the platform keystore. On the server, **the demo
   stores it unencrypted** so the whole flow stays readable — a documented shortcut, and one a
   production build must replace with encryption under a key the client never sees.
4. **The shared secret crosses the boundary once**, during QR enrollment, over TLS. The demo shows
   it on one screen and discards any earlier pending enrollment; it does **not** enforce an expiry
   on the QR, which a production build should.
5. **Verification is offline-capable.** Only the current time is shared between the two sides.
6. **Recovery codes are stored hashed and burned on use.** They are credentials, treated like
   passwords, not like data.
7. **Nothing sensitive lands in version control.** Configuration comes from environment variables;
   `.env.local` is git-ignored and `.env.example` holds placeholders only.

## For Contributors

If your pull request changes how a secret is created, moved, stored, or deleted, say so in the
description and explain what an attacker gains if the change is wrong. Reviewers will ask, so it
saves a round trip.

Never commit:

- Real Firebase API keys, service account JSON, or admin credentials
- Actual TOTP secrets, even test ones that look throwaway
- Recovery codes, session tokens, or `.env.local`

If you commit a secret by accident, rotate it immediately — rewriting history does not un-leak it.
