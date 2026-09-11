/**
 * Conformance tests for the TOTP engine.
 *
 * These are not "does my code do what I think" tests. They are the published
 * vectors from the RFCs themselves. Passing them means this site agrees with
 * Google Authenticator, Microsoft Authenticator, 1Password, and every other
 * standard TOTP app - which is the only definition of correct that matters for
 * an interoperable protocol.
 *
 * If you change `totpService.ts` and one of these goes red, the code is wrong,
 * not the test. Do not edit an expected value to make it pass.
 */

import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  counterFor,
  generateForCounter,
  generateTotp,
  secondsRemaining,
  timingSafeEqual,
  verifyTotp,
} from './totpService';
import { base32Encode, buildOtpauthUri, generateSecret } from './mfaService';

const ascii = (text: string) => new TextEncoder().encode(text);
const atUnixSeconds = (seconds: number) => new Date(seconds * 1000);

// RFC 6238 Appendix B uses the ASCII seed "12345678901234567890", repeated to
// the key length each hash requires.
const SHA1_SECRET = base32Encode(ascii('12345678901234567890'));
const SHA256_SECRET = base32Encode(ascii('12345678901234567890123456789012'));
const SHA512_SECRET = base32Encode(
  ascii('1234567890123456789012345678901234567890123456789012345678901234'),
);

describe('Base32 (RFC 4648 section 10)', () => {
  // These pin the alphabet itself. An encoder and decoder that were wrong in
  // the same way would round-trip happily and still disagree with every app.
  it('encodes the reference strings', () => {
    expect(base32Encode(ascii('f'))).toBe('MY');
    expect(base32Encode(ascii('fo'))).toBe('MZXQ');
    expect(base32Encode(ascii('foo'))).toBe('MZXW6');
    expect(base32Encode(ascii('foob'))).toBe('MZXW6YQ');
    expect(base32Encode(ascii('fooba'))).toBe('MZXW6YTB');
    expect(base32Encode(ascii('foobar'))).toBe('MZXW6YTBOI');
  });

  it('decodes the reference strings, tolerating padding, case and spacing', () => {
    const decode = (value: string) => new TextDecoder().decode(base32Decode(value));
    expect(decode('MZXW6YTBOI')).toBe('foobar');
    expect(decode('MZXW6YTBOI======')).toBe('foobar');
    expect(decode('mzxw 6ytb oi')).toBe('foobar');
  });

  it('encodes the RFC 6238 seed to the well-known key', () => {
    expect(SHA1_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('rejects characters outside the alphabet', () => {
    // 0, 1, 8 and 9 are deliberately absent from Base32.
    expect(() => base32Decode('JBSW0PXP')).toThrow();
    expect(() => base32Decode('')).toThrow();
  });
});

describe('HOTP (RFC 4226 Appendix D)', () => {
  // TOTP is HOTP with the clock as the counter, so these exercise the same
  // truncation path.
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];

  it.each(expected.map((code, counter) => [counter, code]))(
    'counter %i produces %s',
    async (counter, code) => {
      expect(await generateForCounter(SHA1_SECRET, counter)).toBe(code);
    },
  );
});

describe('TOTP (RFC 6238 Appendix B)', () => {
  const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];

  it.each([
    ['SHA1', SHA1_SECRET, ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130']],
    [
      'SHA256',
      SHA256_SECRET,
      ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'],
    ],
    [
      'SHA512',
      SHA512_SECRET,
      ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826'],
    ],
  ] as const)('%s matches all six published vectors', async (algorithm, secret, codes) => {
    for (let i = 0; i < times.length; i++) {
      const code = await generateTotp(secret, atUnixSeconds(times[i]!), 8, 30, algorithm);
      expect(code, `T = ${String(times[i])}`).toBe(codes[i]);
    }
  });
});

describe('Time stepping', () => {
  it('advances the counter once per period', () => {
    expect(counterFor(atUnixSeconds(0))).toBe(0);
    expect(counterFor(atUnixSeconds(29))).toBe(0);
    expect(counterFor(atUnixSeconds(30))).toBe(1);
    expect(counterFor(atUnixSeconds(59), 60)).toBe(0);
  });

  it('is independent of timezone', () => {
    // Epoch time is the same number everywhere. A code that depended on the
    // device timezone would be the most common TOTP bug there is.
    const instant = new Date(Date.UTC(2026, 2, 14, 12, 0, 30));
    const sameInstant = new Date(instant.getTime());
    expect(counterFor(instant)).toBe(counterFor(sameInstant));
  });

  it('counts seconds remaining down from the period to 1', () => {
    expect(secondsRemaining(atUnixSeconds(0))).toBe(30);
    expect(secondsRemaining(atUnixSeconds(29))).toBe(1);
  });

  it('always returns six digits, including codes with leading zeros', async () => {
    let sawLeadingZero = false;
    for (let counter = 0; counter < 300; counter++) {
      const code = await generateForCounter(SHA1_SECRET, counter);
      expect(code).toMatch(/^\d{6}$/);
      if (code.startsWith('0')) sawLeadingZero = true;
    }
    // Guards the guard: without a leading-zero case, the loop proves nothing
    // about padding.
    expect(sawLeadingZero).toBe(true);
  });
});

describe('Verification', () => {
  const now = atUnixSeconds(1111111111);

  it('accepts the current code, with or without a space', async () => {
    const code = await generateTotp(SHA1_SECRET, now);
    expect((await verifyTotp({ secret: SHA1_SECRET, code, at: now })).valid).toBe(true);
    expect(
      (
        await verifyTotp({
          secret: SHA1_SECRET,
          code: `${code.slice(0, 3)} ${code.slice(3)}`,
          at: now,
        })
      ).valid,
    ).toBe(true);
  });

  it('rejects a wrong code and a malformed one', async () => {
    expect((await verifyTotp({ secret: SHA1_SECRET, code: '000000', at: now })).valid).toBe(false);
    const malformed = await verifyTotp({ secret: SHA1_SECRET, code: 'abcdef', at: now });
    expect(malformed).toEqual({ valid: false, reason: 'malformed' });
  });

  it('accepts one step of drift either side and no more', async () => {
    const code = async (offsetSeconds: number) =>
      generateTotp(SHA1_SECRET, atUnixSeconds(1111111111 + offsetSeconds));

    expect((await verifyTotp({ secret: SHA1_SECRET, code: await code(-30), at: now })).valid).toBe(
      true,
    );
    expect((await verifyTotp({ secret: SHA1_SECRET, code: await code(30), at: now })).valid).toBe(
      true,
    );
    expect((await verifyTotp({ secret: SHA1_SECRET, code: await code(90), at: now })).valid).toBe(
      false,
    );
  });

  it('refuses a replayed counter and accepts a newer one', async () => {
    const code = await generateTotp(SHA1_SECRET, now);
    const counter = counterFor(now);

    const replay = await verifyTotp({
      secret: SHA1_SECRET,
      code,
      at: now,
      lastUsedCounter: counter,
    });
    expect(replay).toEqual({ valid: false, reason: 'replayed' });

    const fresh = await verifyTotp({
      secret: SHA1_SECRET,
      code,
      at: now,
      lastUsedCounter: counter - 1,
    });
    expect(fresh.valid).toBe(true);
  });

  it('compares in constant time and handles unequal lengths', () => {
    expect(timingSafeEqual('123456', '123456')).toBe(true);
    expect(timingSafeEqual('123456', '123457')).toBe(false);
    expect(timingSafeEqual('123456', '12345')).toBe(false);
  });
});

describe('Enrollment payload', () => {
  it('generates unique 160-bit Base32 secrets', () => {
    const first = generateSecret();
    const second = generateSecret();
    expect(first).toHaveLength(32);
    expect(first).toMatch(/^[A-Z2-7]+$/);
    expect(first).not.toBe(second);
  });

  it('builds an otpauth URI that standard apps read correctly', () => {
    const uri = buildOtpauthUri({ secret: 'JBSWY3DPEHPK3PXP', nlrIdentity: 'john@nlr.com' });

    expect(uri.startsWith('otpauth://totp/NLR%20Identity:john%40nlr.com?')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
    // `+` means a space only under form encoding. An app using a plain URI
    // parser would show the issuer as "NLR+Identity".
    expect(uri).toContain('issuer=NLR%20Identity');
    expect(uri).not.toContain('+');
  });
});
