#!/usr/bin/env node
/**
 * TOTP doctor - diagnoses "I typed the right code and it said wrong".
 *
 * Give it your setup key and the code your phone is showing. It computes the
 * codes this machine expects across a wide range of time steps and tells you
 * which one your phone matched - which turns a vague "it doesn't work" into an
 * exact number of seconds of clock skew.
 *
 *   node scripts/totp-doctor.mjs <BASE32_SECRET> [CODE_FROM_PHONE]
 *
 * Example:
 *   node scripts/totp-doctor.mjs JBSWY3DPEHPK3PXP 482931
 *
 * The secret is read from the command line and never written anywhere. Run it
 * on a machine you trust, and clear your shell history afterwards if you care.
 */

import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;
const DIGITS = 6;

/**
 * How many steps either side to search.
 *
 * 86400 steps is 30 days each way. Deliberately enormous: a wrong *date* is as
 * common as a wrong time (a phone that lost its battery, an emulator restored
 * from a snapshot), and a search that only covers hours reports "not found" for
 * it - which reads as "wrong secret" and sends you debugging the wrong thing.
 *
 * The cost is 86400 HMACs, which is milliseconds.
 */
const SEARCH_STEPS = 86400;

function base32Decode(input) {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (const char of cleaned) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) {
      console.error(`\n  "${char}" is not a Base32 character.`);
      console.error('  Base32 uses A-Z and 2-7 only - no 0, 1, 8 or 9.');
      console.error('  If your key contains those, it is not the setup key.\n');
      process.exit(1);
    }
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function totp(key, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const mac = createHmac('sha1', key).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

const [secretArg, codeArg] = process.argv.slice(2);

if (!secretArg) {
  console.error('\nUsage: node scripts/totp-doctor.mjs <BASE32_SECRET> [CODE_FROM_PHONE]\n');
  process.exit(1);
}

const key = base32Decode(secretArg);
const nowMs = Date.now();
const nowSec = Math.floor(nowMs / 1000);
const counter = Math.floor(nowSec / PERIOD);

console.log('\n=== This machine ===');
console.log(`  Local time     : ${new Date(nowMs).toString()}`);
console.log(`  UTC time       : ${new Date(nowMs).toISOString()}`);
console.log(`  Unix seconds   : ${nowSec}`);
console.log(`  Time step (T)  : ${counter}`);
console.log(`  Seconds left   : ${PERIOD - (nowSec % PERIOD)}`);

console.log('\n=== Codes this machine expects ===');
for (let offset = -1; offset <= 1; offset++) {
  const label = offset === 0 ? '  now     ' : offset < 0 ? '  previous' : '  next    ';
  console.log(`${label} T${offset === 0 ? '  ' : offset > 0 ? '+1' : '-1'}  ${totp(key, counter + offset)}`);
}
console.log('\n  The server accepts the three codes above (a one-step drift window).');

if (!codeArg) {
  console.log('\n  Pass the code your phone is showing to diagnose a mismatch:');
  console.log(`    node scripts/totp-doctor.mjs ${secretArg} 123456\n`);
  process.exit(0);
}

const submitted = codeArg.replace(/\D/g, '');

if (submitted.length !== DIGITS) {
  console.error(`\n  "${codeArg}" is not a ${DIGITS}-digit code.\n`);
  process.exit(1);
}

console.log(`\n=== Searching for "${submitted}" ===`);

let found = null;
for (let offset = -SEARCH_STEPS; offset <= SEARCH_STEPS; offset++) {
  if (totp(key, counter + offset) === submitted) {
    found = offset;
    break;
  }
}

if (found === null) {
  // Derived rather than hardcoded: a message that disagrees with the actual
  // search range sends people to debug the wrong thing.
  const searchDays = Math.round((SEARCH_STEPS * PERIOD) / 86400);
  console.log(`\n  NOT FOUND within ${searchDays} days either side.\n`);
  console.log('  That effectively rules out the clock. The likely causes are:');
  console.log('');
  console.log('    1. The phone holds a DIFFERENT secret to the one you passed.');
  console.log('       Enrolling more than once generates a new secret each time,');
  console.log('       and the old entry stays in the app producing codes that');
  console.log('       look fine and can never work. This is the usual answer.');
  console.log('');
  console.log('    2. You read the code from another account in the app.');
  console.log('       Check the entry shows exactly the identity you expect.');
  console.log('');
  console.log('    3. The code rolled while you were typing it.');
  console.log('');
  console.log('  Fix for (1): delete every NLR Identity entry in the app, then');
  console.log('  run ONE clean enrollment and scan it.\n');
  process.exit(2);
}

if (found === 0) {
  console.log('\n  MATCH at the current step. The code is correct right now.');
  console.log('  If the website still rejected it, the cause is not the clock:');
  console.log('    - the code may already have been used (replay protection), or');
  console.log('    - it expired between your typing it and the check.\n');
  process.exit(0);
}

const skewSeconds = found * PERIOD;
const direction = found > 0 ? 'AHEAD OF' : 'BEHIND';
const absMinutes = Math.abs(skewSeconds / 60).toFixed(1);

console.log(`\n  MATCH at step T${found > 0 ? '+' : ''}${found}.`);
console.log(`\n  Your phone's clock is ${direction} this machine by about`);
console.log(`  ${Math.abs(skewSeconds)} seconds (${absMinutes} minutes).`);

if (Math.abs(skewSeconds) > 1 * 3600 - 60 && Math.abs(skewSeconds) < 1 * 3600 + 60) {
  console.log('\n  That is almost exactly one hour - check for a daylight-saving');
  console.log('  or manual timezone setting on one of the two devices.');
}
if (Math.abs(skewSeconds) > 5.5 * 3600 - 120 && Math.abs(skewSeconds) < 5.5 * 3600 + 120) {
  console.log('\n  That is almost exactly 5 hours 30 minutes - the IST offset.');
  console.log('  One of the devices is treating local time as UTC. Check that');
  console.log('  "Set time automatically" is on, and that the timezone is set');
  console.log('  by the network rather than manually.');
}

console.log('\n  Fix it on the device that is wrong:');
console.log('    Android : Settings > System > Date & time > Set time automatically');
console.log('    Windows : Settings > Time & language > Date & time > Set time automatically');
console.log('              then click "Sync now"');
console.log('    Emulator: emulator clocks drift badly. Run:');
console.log('              adb shell "su 0 date @$(date +%s)"');
console.log('              or cold-boot the emulator.\n');

process.exit(3);
