# NLR Authenticator

The Flutter authenticator app for [NLR Identity](../README.md). It plays the role of the
**authenticator**: the trusted device that holds the shared secret and produces one-time codes,
entirely offline.

> **Educational software.** This is a teaching implementation, not an audited product. Use an
> established authenticator for accounts that matter. See [SECURITY.md](../SECURITY.md).

---

## What It Does

| | Capability | Where |
|---|---|---|
| ✓ | Scan an `otpauth://` enrollment QR code | [`scan_qr_screen.dart`](lib/screens/scan_qr_screen.dart) |
| ✓ | Encrypt the secret with AES-256-GCM before storing it | [`encryption_service.dart`](lib/services/encryption_service.dart) |
| ✓ | Generate RFC 6238 TOTP codes offline | [`totp_service.dart`](lib/services/totp_service.dart) |
| ✓ | Hold several identities at once | [`identity_store.dart`](lib/state/identity_store.dart) |
| ✓ | Register and name this device | [`devices_screen.dart`](lib/screens/devices_screen.dart) |
| ✓ | Remove an identity, or wipe everything | [`settings_screen.dart`](lib/screens/settings_screen.dart) |

**No backend. No Firebase. No network calls.** Release builds ship without the `INTERNET`
permission, so that is enforced by Android rather than promised in a settings screen.

---

## Installation

Requires the Flutter SDK (3.41+) and **JDK 17 or 21** for Android builds.

```bash
cd authenticator-app
flutter pub get
flutter run
```

To build an installable APK:

```bash
flutter build apk --release
# build/app/outputs/flutter-apk/app-release.apk
```

### JDK note — read this if the Android build fails

Android Studio now bundles **JDK 25**, which Gradle 8.14 cannot parse. The build fails with a
cryptic `* What went wrong: 25.0.2`. Point Flutter at a JDK 17 or 21 instead:

```bash
flutter config --jdk-dir="C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
flutter doctor -v | grep "Java version"
```

Use the path to your own JDK. This is a machine setting, not a project setting, which is why it is
not committed.

---

## How Enrollment Works

```
NLR Identity website          NLR Authenticator
─────────────────────         ─────────────────
generates a secret
builds otpauth:// URI
renders it as a QR  ───────►  camera reads the QR
                              parse and validate  (qr_service.dart)
                              show the account, ask the user
                              encrypt the secret  (encryption_service.dart)
                              store the record    (storage_service.dart)
```

The QR code contains this, and the parser in [`qr_service.dart`](lib/services/qr_service.dart)
pulls it apart:

```
otpauth://totp/NLR%20Identity:john@nlr.com
    ?secret=JBSWY3DPEHPK3PXP
    &issuer=NLR%20Identity
    &algorithm=SHA1
    &digits=6
    &period=30
```

| Part | Becomes |
|---|---|
| Label after the `:` | `john@nlr.com` — the identity |
| `secret` | The Base32 shared secret, encrypted immediately |
| `issuer` | `NLR Identity` — shown in the list |
| `algorithm` / `digits` / `period` | Stored per identity, because a QR may specify non-defaults |

The secret crosses the boundary **exactly once**, here. After this the phone and the server never
exchange it again — they each derive the same code from their own copy.

There is a confirmation step before anything is saved. Enrolling silently on detection would be
faster and wrong: a QR code can be swapped, printed on a poster, or pointed at by accident.

A manual-entry path exists for devices with no camera, or a QR that will not scan.

---

## How Encryption Works

Two stores, one job each:

```
flutter_secure_storage          shared_preferences
──────────────────────          ──────────────────
one AES-256 key                 identity records
Android Keystore / Keychain     secrets already ciphertext
```

1. On first use, a 256-bit key is generated with the platform CSPRNG and written to
   `flutter_secure_storage` — the Android Keystore or the iOS Keychain.
2. Every secret is encrypted with **AES-256-GCM** and a **fresh 96-bit nonce**, then stored as
   `v1:<base64 iv>:<base64 ciphertext>`.
3. The record goes into `shared_preferences`, which has no protection of its own — and needs none,
   because what it holds is ciphertext.

Details that matter:

- **A fresh IV every time.** Reusing a GCM nonce under one key leaks the keystream *and* the
  authentication key. It is a total break, not a small slip.
- **GCM, not CBC.** GCM is authenticated: tampering makes decryption throw rather than return
  plausible garbage that would generate wrong codes forever.
- **Destroying the key wipes everything.** "Remove all identities" deletes one small value, and
  every secret ever written becomes unrecoverable ciphertext.

**The honest limit:** this protects data *at rest*. An attacker who can run code as this app on an
unlocked, rooted device can ask the Keystore to decrypt, exactly as the app does. No client-side
scheme fixes that — it needs device encryption, a lock screen, and a biometric gate.

---

## How TOTP Works

[`totp_service.dart`](lib/services/totp_service.dart) implements RFC 6238 by hand, in about sixty
lines, because opening the box is the point of this project. In production, use a maintained
library.

```
counter = floor(unix_time / 30)              ← the only thing both sides share
mac     = HMAC-SHA1(secret, counter as 8 bytes big-endian)
offset  = mac[19] & 0x0F                     ← position derived from the hash itself
binary  = 4 bytes at offset, top bit cleared ← the mask is an interop fix, not security
code    = zero_pad(binary mod 1000000, 6)
```

Your phone and the server never communicate to agree on a code. They both compute it from the same
secret and the same half-minute. That is the whole trick.

The long version, with worked examples, is in [docs/totp-working.md](../docs/totp-working.md).

### Verified against the RFCs

The implementation is tested against the **published vectors**, not against itself:

| Suite | Source |
|---|---|
| TOTP SHA-1, SHA-256, SHA-512 | RFC 6238 Appendix B — all six time steps each |
| HOTP counters 0–9 | RFC 4226 Appendix D |
| Base32 encode/decode | RFC 4648 section 10 |

Passing these means this app agrees with every other authenticator in the world — which is the only
useful definition of correct for an interoperable protocol.

```bash
flutter test
```

---

## Offline Authentication

The app needs a network exactly never. To prove it to yourself:

1. Enrol an identity by scanning a QR code.
2. Turn on airplane mode.
3. Force-close the app and reopen it.
4. Codes still appear, still count down, and still verify on the website.

This works because the only shared input is the clock. It also means **the device clock must be
roughly right** — if it drifts more than about 30 seconds, codes will be rejected. Leave automatic
time sync on.

Release builds have no `INTERNET` permission, so this is not a promise you have to take on trust:

```bash
aapt2 dump permissions app-release.apk
# uses-permission: name='android.permission.CAMERA'
```

CAMERA is the only one. The ML Kit barcode library declares `INTERNET` and `ACCESS_NETWORK_STATE`
for telemetry and its downloadable model; this project uses the **bundled** model, which scans
offline, so both are stripped in
[`src/release/AndroidManifest.xml`](android/app/src/release/AndroidManifest.xml). Debug builds keep
`INTERNET` because Flutter's hot reload needs it.

---

## Project Structure

```
lib/
├── main.dart                    Entry point, lifecycle locking
├── app/
│   ├── routes.dart              go_router table
│   └── theme.dart               Design tokens
├── screens/
│   ├── splash_screen.dart       Loads state, then Home
│   ├── home_screen.dart         Identities and live codes
│   ├── scan_qr_screen.dart      Camera, parsing, enrollment
│   ├── otp_screen.dart          One code, full screen
│   ├── devices_screen.dart      This device and its enrolments
│   └── settings_screen.dart     Version and security information
├── models/
│   ├── identity.dart            An enrolled account
│   └── device.dart              This installation
├── services/
│   ├── totp_service.dart        RFC 6238 + Base32
│   ├── encryption_service.dart  AES-GCM + key vault
│   ├── storage_service.dart     Persistence
│   └── qr_service.dart          otpauth:// parsing
├── state/
│   └── identity_store.dart      ChangeNotifier, the one-second tick
└── widgets/
    ├── otp_card.dart            Identity + code row
    ├── timer_progress.dart      Countdown ring
    └── identity_tile.dart       Compact row, no code
```

`state/` is not in the original brief. It exists because `provider` needs something to provide, and
putting a `ChangeNotifier` in `services/` would blur the line between "talks to the platform" and
"holds app state".

---

## Security Features

| Feature | How it is enforced |
|---|---|
| Encrypted local storage | AES-256-GCM, key in Keystore/Keychain |
| OTPs are never stored | Computed in `build`, never written anywhere |
| OTPs are never sent | No `INTERNET` permission in release builds |
| Secret hidden after enrollment | No code path renders it; `toString()` omits it |
| Device removal | Per-identity and wipe-everything, both irreversible by design |
| Memory hygiene | Decrypted secrets are dropped when the app is backgrounded |
| No cloud backup | `allowBackup=false` + data extraction rules exclude everything |

That last one has a consequence worth understanding: **a lost phone means re-enrolling.** That is
the correct trade. "Something you have" stops meaning anything if it restores itself onto anything.

---

## Packages

| Package | Why |
|---|---|
| `mobile_scanner` | QR scanning (ML Kit / AVFoundation) |
| `flutter_secure_storage` | Keystore / Keychain, holds the AES key |
| `shared_preferences` | Identity records (already encrypted) |
| `encrypt` | AES-256-GCM |
| `crypto` | HMAC-SHA1/256/512 for TOTP |
| `provider` | State management |
| `go_router` | Navigation |
| `package_info_plus` | Version string in Settings |

Two deliberate departures from the brief's package list:

- **`qr_code_scanner` is not used.** It was discontinued by its author and its Android embedding
  breaks on current Gradle. `mobile_scanner` is its maintained successor.
- **The `otp` package is not used.** TOTP is implemented by hand instead, because a project whose
  purpose is teaching how TOTP works should not hide it behind a dependency. The RFC vectors above
  are what justify that choice. For production, use `otp`.

---

## Testing

```bash
flutter test          # 66 tests
flutter analyze       # must be clean
```

| File | Covers |
|---|---|
| `test/totp_service_test.dart` | RFC 6238 / 4226 / 4648 vectors, time stepping, output shape |
| `test/encryption_service_test.dart` | Round trip, IV freshness, tamper detection, key lifecycle |
| `test/qr_service_test.dart` | URI parsing, rejection messages, round trip |
| `test/identity_store_test.dart` | Enrollment, persistence, multi-identity, locking |

One test is worth calling out: `identity_store_test.dart` reads the raw `shared_preferences`
contents the way an attacker with the file would, and asserts the plaintext secret appears nowhere.
That is the security property the whole app exists to hold.

---

## Related

- [docs/totp-working.md](../docs/totp-working.md) — the algorithm in detail
- [docs/authentication-flow.md](../docs/authentication-flow.md) — enrollment and login end to end
- [docs/architecture.md](../docs/architecture.md) — trust boundaries
- [demo-website/](../demo-website/) — the relying party that issues the QR codes
