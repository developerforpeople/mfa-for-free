/**
 * Recovery code tests.
 *
 * Recovery codes are credentials: anyone holding one can bypass the second
 * factor. These tests pin the properties that make storing them safe - hashed,
 * salted, single-use - and the ones that make them usable by someone who has
 * just lost their phone.
 */

import { describe, expect, it } from 'vitest';
import {
  findMatchingCode,
  generateRecoveryCodes,
  hashCode,
  normaliseCode,
  verifyCodeAgainstHash,
} from './recoveryService';

describe('Generation', () => {
  it('issues ten unique codes in XXXXX-XXXXX form', async () => {
    const codes = await generateRecoveryCodes(10);

    expect(codes).toHaveLength(10);
    expect(new Set(codes.map((entry) => entry.code)).size).toBe(10);
    for (const { code } of codes) {
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    }
  });

  it('never uses characters people confuse when copying from paper', async () => {
    const codes = await generateRecoveryCodes(10);
    expect(codes.map((entry) => entry.code).join('')).not.toMatch(/[01OILU]/);
  });
});

describe('Hashing', () => {
  it('stores a self-describing PBKDF2 hash that does not contain the code', async () => {
    const [entry] = await generateRecoveryCodes(1);

    expect(entry!.hash.startsWith('pbkdf2$')).toBe(true);
    expect(entry!.hash).not.toContain(normaliseCode(entry!.code));
  });

  it('salts each hash, so identical codes produce different hashes', async () => {
    const first = await hashCode('ABCDE-FGHJK');
    const second = await hashCode('ABCDE-FGHJK');

    expect(first).not.toBe(second);
    expect(await verifyCodeAgainstHash('ABCDE-FGHJK', first)).toBe(true);
    expect(await verifyCodeAgainstHash('ABCDE-FGHJK', second)).toBe(true);
  });
});

describe('Verification', () => {
  it('accepts the code however the user types it', async () => {
    const [entry] = await generateRecoveryCodes(1);
    const { code, hash } = entry!;

    expect(await verifyCodeAgainstHash(code, hash)).toBe(true);
    expect(await verifyCodeAgainstHash(code.toLowerCase(), hash)).toBe(true);
    expect(await verifyCodeAgainstHash(code.replace('-', ''), hash)).toBe(true);
  });

  it('rejects a different code and fails closed on a corrupt hash', async () => {
    const codes = await generateRecoveryCodes(2);

    expect(await verifyCodeAgainstHash(codes[1]!.code, codes[0]!.hash)).toBe(false);
    expect(await verifyCodeAgainstHash(codes[0]!.code, 'garbage')).toBe(false);
  });

  it('finds which stored code matched, and treats used codes as dead', async () => {
    const codes = await generateRecoveryCodes(5);
    const hashes = codes.map((entry) => entry.hash);

    expect(await findMatchingCode(codes[3]!.code, hashes)).toBe(3);
    expect(await findMatchingCode('ZZZZZ-ZZZZZ', hashes)).toBe(-1);
    // A redeemed code is stored as an empty hash and must never match again.
    expect(await findMatchingCode(codes[0]!.code, ['', ''])).toBe(-1);
  });
});
