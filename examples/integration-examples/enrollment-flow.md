# Example: Enrollment and Verification, End to End

A language-agnostic walkthrough of the two server endpoints you need to add TOTP MFA to an existing
application. Translate the pseudocode into your stack; the shape does not change.

**Reference material, not project code.** Nothing here is imported by the demo website.

---

## What You Are Adding

Two endpoints for enrollment, one for verification:

| Endpoint | Purpose |
|---|---|
| `POST /mfa/enroll/begin` | Generate a secret, return the QR payload |
| `POST /mfa/enroll/confirm` | Verify the first code, activate the device |
| `POST /mfa/verify` | Verify a code at login |

All three require an authenticated session. Enrollment that does not is a vulnerability, not a
convenience: it lets anyone with a stolen password attach their own device.

---

## 1. Begin Enrollment

```text
POST /mfa/enroll/begin
requires: an authenticated session

secret    = secure_random_bytes(20)          # NOT Math.random()
device_id = generate_id()

store device {
    id:               device_id,
    user_id:          session.user_id,
    secret_encrypted: aes_gcm_encrypt(base32(secret), key = KMS.current()),
    secret_iv:        the nonce used above,  # unique per secret, never reused
    key_version:      KMS.current_version,
    status:           "pending",             # not active yet
    expires_at:       now() + 10 minutes
}

uri = "otpauth://totp/" + url_encode(issuer + ":" + user.email)
    + "?secret="    + base32(secret)
    + "&issuer="    + url_encode(issuer)
    + "&algorithm=SHA1&digits=6&period=30"

respond { device_id, uri, manual_key: base32(secret), expires_at }
```

Three things people get wrong here:

- **Randomness.** `Math.random()`, `rand()`, and anything seeded from the clock are predictable.
  Use `crypto.randomBytes`, `secrets.token_bytes`, `crypto/rand` - whatever your platform calls its
  CSPRNG.
- **Status.** The device starts `pending`. Marking it active when the QR is drawn leaves accounts
  locked behind devices that never actually received the secret.
- **Nonce reuse.** AES-GCM with a repeated nonce under the same key is a catastrophic break, not a
  small mistake. Generate a fresh one per encryption and store it beside the ciphertext.

---

## 2. Confirm Enrollment

```text
POST /mfa/enroll/confirm   { device_id, code }
requires: an authenticated session

device = load_device(device_id)

reject unless device.user_id == session.user_id      # ownership
reject unless device.status  == "pending"
reject if     device.expires_at < now()              # window closed

secret = aes_gcm_decrypt(device.secret_encrypted, device.secret_iv, KMS.key(device.key_version))

expected = [ totp(secret, T-1), totp(secret, T), totp(secret, T+1) ]
reject unless any(constant_time_equals(code, e) for e in expected)

update device { status: "active", confirmed_at: now(), last_used_counter: T }
mark_mfa_enabled(session.user_id)

recovery = generate_recovery_codes(10)               # shown once, stored hashed
respond { recovery_codes: recovery }
```

This step is the handshake. A code the server can reproduce proves two things at once: the secret
arrived intact, and the two clocks agree closely enough to keep working. Without it you are hoping.

Recovery codes are issued here, at the same moment the user gains a factor they can lose. Deferring
them to a settings page nobody visits is how support tickets are made.

---

## 3. Verify at Login

```text
POST /mfa/verify   { challenge_token, code }

challenge = load_challenge(challenge_token)          # issued after the password check
reject if challenge is missing or expired            # a couple of minutes, no more
reject if failure_count(challenge.user_id) >= 5      # rate limit, then require the password again

for device in active_devices(challenge.user_id):
    secret = decrypt(device)
    for step in [T-1, T, T+1]:
        if constant_time_equals(code, totp(secret, step)):
            reject if step <= device.last_used_counter    # replay
            update device { last_used_counter: step, last_used_at: now() }
            audit("mfa.verified", device.id)              # never log the code
            respond session_for(challenge.user_id)

record_failure(challenge.user_id)
audit("mfa.failed", null)
respond 401
```

Read the loop carefully. Four separate defences are in there, and each one has been the missing
piece in somebody's breach:

1. **The challenge token.** After the password check the user is half-authenticated. That is not a
   state a session cookie should represent, so a short-lived single-purpose token carries it.
2. **Constant-time comparison.** A plain `==` on strings can leak, through timing, how many leading
   characters matched. Use `crypto.timingSafeEqual`, `hmac.compare_digest`, or your platform's
   equivalent.
3. **Replay rejection.** Without `last_used_counter`, a code read over a shoulder or captured by a
   proxy stays usable for the rest of its window.
4. **Rate limiting.** Six digits is one million possibilities. Unlimited attempts turns a strong
   factor into an afternoon of scripted guessing.

---

## 4. Recovery

```text
POST /mfa/recover   { challenge_token, code }

for stored in unused_recovery_codes(user_id):
    if slow_hash_verify(code, stored.hash):
        mark_used(stored)                    # permanently, not rate-limited
        issue_session(user_id)
        require_new_device_enrollment()
        regenerate_all_recovery_codes()
        return

record_failure(user_id)
respond 401
```

Recovery codes are credentials, so they are hashed with a slow hash - Argon2id or bcrypt, not
SHA-256, which is fast enough to brute-force a short code offline.

---

## 5. Using a Library Instead

In a real project, `totp()` above is not yours to write:

```js
// Node.js, using otplib
import { authenticator } from 'otplib';

authenticator.options = { window: 1 };            // one step either side

const secret = authenticator.generateSecret();     // enrollment
const isValid = authenticator.check(code, secret); // verification
```

```python
# Python, using pyotp
import pyotp

secret = pyotp.random_base32()                       # enrollment
is_valid = pyotp.TOTP(secret).verify(code, valid_window=1)
```

The library handles the algorithm. Everything else on this page - ownership checks, pending state,
encryption at rest, replay rejection, rate limiting, recovery - is still yours, and it is where the
actual bugs live.

---

## Related

- [docs/authentication-flow.md](../../docs/authentication-flow.md) - the flows in detail
- [docs/totp-working.md](../../docs/totp-working.md) - what `totp()` does inside
- [docs/database-design.md](../../docs/database-design.md) - the schema behind this pseudocode
- [SECURITY.md](../../SECURITY.md) - the invariants
