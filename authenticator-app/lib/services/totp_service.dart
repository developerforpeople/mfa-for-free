/// The TOTP engine.
///
/// This is the heart of the whole project, and it is written out by hand rather
/// than delegated to a package. In production you should absolutely use a
/// maintained library (`otp`, `dart_otp`) - `SECURITY.md` says so. Here the
/// point is to open the box: every step below maps to a numbered step in
/// `docs/totp-working.md`, and the whole algorithm is about sixty lines.
///
/// The one-sentence version: a one-time code is a keyed hash of the current
/// half-minute, squeezed down to six digits.
///
/// Nothing in this file performs I/O. No network, no storage, no logging. It
/// takes a secret and a time, and returns digits.
library;

import 'dart:convert';
import 'dart:typed_data';

// Prefixed because this file defines an enum value named `sha1`, which would
// otherwise shadow the hash of the same name.
import 'package:crypto/crypto.dart' as crypto;

/// Hash used inside the HMAC. RFC 6238 permits all three.
///
/// SHA-1 is the default because it is what effectively every deployed
/// authenticator assumes, and interoperability decides this in practice. It is
/// not a weakness here: SHA-1's break is in *collision resistance*, and HMAC
/// does not rely on collision resistance.
enum TotpAlgorithm {
  sha1('SHA1'),
  sha256('SHA256'),
  sha512('SHA512');

  const TotpAlgorithm(this.label);

  /// The spelling used in an `otpauth://` URI.
  final String label;

  static TotpAlgorithm fromLabel(String? value) {
    return switch (value?.toUpperCase().replaceAll('-', '')) {
      'SHA256' => TotpAlgorithm.sha256,
      'SHA512' => TotpAlgorithm.sha512,
      _ => TotpAlgorithm.sha1,
    };
  }

  /// Written as a switch statement rather than a switch expression: the three
  /// arms have different concrete types, and expression inference widens their
  /// common supertype to `Object`. Returning from each arm checks against the
  /// declared `crypto.Hash` instead.
  crypto.Hash get hash {
    switch (this) {
      case TotpAlgorithm.sha1:
        return crypto.sha1;
      case TotpAlgorithm.sha256:
        return crypto.sha256;
      case TotpAlgorithm.sha512:
        return crypto.sha512;
    }
  }
}

/// Thrown when a secret is not valid Base32.
class InvalidSecretException implements Exception {
  const InvalidSecretException(this.message);
  final String message;

  @override
  String toString() => 'InvalidSecretException: $message';
}

/// RFC 4648 Base32, without padding on encode.
///
/// Base32 rather than Base64 for a human reason: the alphabet has no `0`/`O` or
/// `1`/`l`/`I` confusion, so a setup key can be read aloud or typed by hand when
/// a camera is not available.
abstract final class Base32 {
  static const _alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  /// Decodes Base32 text into bytes.
  ///
  /// Tolerant on input by design: authenticator users paste keys that arrive
  /// lowercase, in groups of four, or with `=` padding. All of those mean the
  /// same key, and rejecting them would be pedantry that costs a user their
  /// enrollment.
  static Uint8List decode(String input) {
    final cleaned = input
        .toUpperCase()
        .replaceAll(RegExp(r'[\s-]'), '')
        .replaceAll('=', '');

    if (cleaned.isEmpty) {
      throw const InvalidSecretException('The secret is empty.');
    }

    final output = <int>[];
    var buffer = 0;
    var bits = 0;

    for (final char in cleaned.codeUnits) {
      final value = _alphabet.indexOf(String.fromCharCode(char));
      if (value < 0) {
        throw InvalidSecretException(
          'Character "${String.fromCharCode(char)}" is not valid Base32.',
        );
      }

      // Accumulate 5 bits per character, emitting a byte whenever 8 are ready.
      buffer = (buffer << 5) | value;
      bits += 5;

      if (bits >= 8) {
        output.add((buffer >> (bits - 8)) & 0xFF);
        bits -= 8;
      }
    }

    // Any leftover bits are padding, not data, and are discarded.
    if (output.isEmpty) {
      throw const InvalidSecretException(
        'The secret is too short to be a key.',
      );
    }

    return Uint8List.fromList(output);
  }

  /// Encodes bytes as unpadded Base32.
  static String encode(Uint8List bytes) {
    var buffer = 0;
    var bits = 0;
    final output = StringBuffer();

    for (final byte in bytes) {
      buffer = (buffer << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        output.write(_alphabet[(buffer >> (bits - 5)) & 31]);
        bits -= 5;
      }
    }

    if (bits > 0) {
      output.write(_alphabet[(buffer << (5 - bits)) & 31]);
    }

    return output.toString();
  }

  /// True when the text decodes to at least one byte.
  static bool isValid(String input) {
    try {
      decode(input);
      return true;
    } on InvalidSecretException {
      return false;
    }
  }
}

/// Generates time-based one-time passwords.
///
/// All methods are static and pure: the same secret and the same instant always
/// produce the same code, on any device, with no coordination between them.
/// That property is the entire reason this works offline.
abstract final class TotpService {
  /// Seconds a code stays valid. RFC 6238's recommended default.
  static const int defaultPeriod = 30;

  /// Digits shown to the user. Six is universal; eight is permitted.
  static const int defaultDigits = 6;

  /// Computes the code for a point in time.
  ///
  /// [at] defaults to now. Pass it explicitly in tests - never read the clock
  /// inside a test you want to stay green next year.
  static String generate({
    required String secret,
    DateTime? at,
    int digits = defaultDigits,
    int period = defaultPeriod,
    TotpAlgorithm algorithm = TotpAlgorithm.sha1,
  }) {
    final counter = counterFor(at: at, period: period);
    return generateForCounter(
      secret: secret,
      counter: counter,
      digits: digits,
      algorithm: algorithm,
    );
  }

  /// The time step: how many whole [period]s have elapsed since the Unix epoch.
  ///
  /// This is the only value the phone and the server share at verification time.
  /// UTC is not optional - `millisecondsSinceEpoch` is already UTC-based, which
  /// is exactly why local time never enters this calculation. Using local time
  /// here is the classic bug: it works on your laptop and fails for every user
  /// in another timezone.
  static int counterFor({DateTime? at, int period = defaultPeriod}) {
    final instant = at ?? DateTime.now();
    final seconds = instant.millisecondsSinceEpoch ~/ 1000;
    return seconds ~/ period;
  }

  /// HOTP: the counter-based code TOTP is built on (RFC 4226).
  static String generateForCounter({
    required String secret,
    required int counter,
    int digits = defaultDigits,
    TotpAlgorithm algorithm = TotpAlgorithm.sha1,
  }) {
    final key = Base32.decode(secret);

    // Step 1: the counter as an 8-byte big-endian integer.
    final message = Uint8List(8);
    var remaining = counter;
    for (var i = 7; i >= 0; i--) {
      message[i] = remaining & 0xFF;
      remaining >>= 8;
    }

    // Step 2: HMAC. A keyed hash - unforgeable without the key, and it leaks
    // nothing about the key. An attacker who watches a thousand codes still
    // cannot derive the secret.
    final mac = crypto.Hmac(algorithm.hash, key).convert(message).bytes;

    // Step 3: dynamic truncation. Which four bytes to take is derived from the
    // hash itself, so the position is unpredictable. Always taking the first
    // four would be.
    final offset = mac[mac.length - 1] & 0x0F;
    final binary =
        ((mac[offset] & 0x7F) << 24) |
        ((mac[offset + 1] & 0xFF) << 16) |
        ((mac[offset + 2] & 0xFF) << 8) |
        (mac[offset + 3] & 0xFF);
    // The 0x7F mask clears the top bit. That is an interoperability fix, not a
    // security measure: it makes languages with signed 32-bit integers agree
    // with languages that have unsigned ones.

    // Step 4: reduce to N digits, and pad. One code in ten starts with a zero,
    // and dropping it is a bug users experience as "it rejects my code
    // sometimes".
    final modulo = _pow10(digits);
    return (binary % modulo).toString().padLeft(digits, '0');
  }

  /// Whole seconds until the current code expires.
  ///
  /// Counts down from [period] to 1. The user is told "expires in 24 seconds",
  /// so 0 would be a lie - at zero the code has already rolled.
  static int secondsRemaining({DateTime? at, int period = defaultPeriod}) {
    final instant = at ?? DateTime.now();
    final seconds = instant.millisecondsSinceEpoch ~/ 1000;
    return period - (seconds % period);
  }

  /// Progress through the current step, from 1.0 (fresh) down to 0.0 (expiring).
  ///
  /// Uses milliseconds so the ring animates smoothly rather than ticking in
  /// one-second jumps.
  static double progress({DateTime? at, int period = defaultPeriod}) {
    final instant = at ?? DateTime.now();
    final millis = instant.millisecondsSinceEpoch;
    final periodMillis = period * 1000;
    final elapsed = millis % periodMillis;
    return 1.0 - (elapsed / periodMillis);
  }

  /// Formats a code for display: `482931` becomes `482 931`.
  ///
  /// Grouping halves the chance of a transcription slip when someone is copying
  /// six digits by eye.
  static String formatForDisplay(String code) {
    if (code.length != 6) return code;
    return '${code.substring(0, 3)} ${code.substring(3)}';
  }

  static int _pow10(int exponent) {
    var result = 1;
    for (var i = 0; i < exponent; i++) {
      result *= 10;
    }
    return result;
  }
}

/// Helper for tests and for building a secret from raw bytes.
Uint8List asciiBytes(String text) => Uint8List.fromList(ascii.encode(text));
