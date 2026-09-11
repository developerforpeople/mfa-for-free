# Documentation

Written for college students and junior developers. No prior knowledge of cryptography is assumed;
anything that needs a formal definition links to the RFC.

## Read in This Order

| # | Document | What you get |
|---|---|---|
| 1 | [What MFA actually is](mfa-explanation.md) | Why passwords are not enough, the three factors, what each type of second factor is worth |
| 2 | [How TOTP works](totp-working.md) | Where the six digits come from, why two offline devices agree, the mistakes people ship |
| 3 | [Authentication flow](authentication-flow.md) | Enrollment, login, and recovery, step by step, with the reasoning for each step |
| 4 | [Architecture](architecture.md) | Components, trust boundaries, who is allowed to know what |
| 5 | [Database design](database-design.md) | Firestore collections, security rules, and what must never be stored |
| 6 | [Firebase setup](firebase-setup.md) | Getting the demo running against the emulator or a real project |

If you have thirty minutes, read 1 and 2. If you are about to write code, read 3 and 5.

## Elsewhere in the Repository

- [Demo website](../demo-website/README.md) - the React app and its design system
- [Authenticator app](../authenticator-app/README.md) - the Flutter app, planned for Phase 3
- [Integration examples](../examples/integration-examples/README.md) - adding MFA to your own project
- [Security policy](../SECURITY.md) - the invariants, and how to report a vulnerability
- [Contributing](../CONTRIBUTING.md) - how to work on this

## External References

Short, readable, and authoritative - worth having open while you read the code.

- [RFC 6238 - TOTP](https://datatracker.ietf.org/doc/html/rfc6238) (includes test vectors)
- [RFC 4226 - HOTP](https://datatracker.ietf.org/doc/html/rfc4226)
- [RFC 2104 - HMAC](https://datatracker.ietf.org/doc/html/rfc2104)
- [RFC 4648 - Base32 and Base64](https://datatracker.ietf.org/doc/html/rfc4648)
- [Key Uri Format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format) - the
  de-facto spec for `otpauth://`
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) - digital identity guidelines

## A Note on These Documents

Documentation is a first-class part of this project, not an afterthought. If a page confuses you,
that is a bug worth reporting - open an issue saying which paragraph lost you. "I don't understand
why this works" is a legitimate issue here.
