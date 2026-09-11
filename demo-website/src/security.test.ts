/**
 * Structural security checks - rules about where code may be used, rather than
 * what it computes.
 *
 * The rule enforced here: the website never produces a one-time code. Codes are
 * shown by the user's authenticator app and nowhere else; the site only checks a
 * code the user typed. A page that calls `generateTotp` to put a code on screen
 * has broken MFA completely, because anyone who knows the password can read the
 * second factor off the page.
 *
 * It is an easy mistake to make - especially for an AI agent asked to "show the
 * MFA code" - so it is checked on every build rather than trusted to review.
 */

import { describe, expect, it } from 'vitest';

// Every source file, as text. Vite's glob import keeps this free of Node APIs.
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Files allowed to call the code generators: the TOTP module and its tests. */
const isAllowed = (path: string) =>
  path === './services/totpService.ts' || path.endsWith('.test.ts');

describe('One-time codes are never generated for display', () => {
  it('scans the whole source tree', () => {
    // Guards the guard: an empty glob would make the next test pass vacuously.
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    expect(Object.keys(sources)).toContain('./pages/VerifyMfa.tsx');
  });

  it('only the TOTP module and tests use generateTotp or generateForCounter', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !isAllowed(path))
      .filter(([, text]) => /\bgenerate(Totp|ForCounter)\b/.test(text))
      .map(([path]) => path);

    // If this fails, a file is producing a code. The website must only receive
    // a code the user typed and pass it to verifyTotp() - see CUSTOMISING.md.
    expect(offenders).toEqual([]);
  });
});
