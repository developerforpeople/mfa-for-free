import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nlr_authenticator/services/totp_service.dart';

/// Conformance tests for the TOTP engine.
///
/// These are not "does my code do what I think" tests - they are the published
/// vectors from the RFCs themselves. Passing them means this implementation
/// agrees with every other authenticator in the world, which is the only
/// definition of correct that matters for an interoperable protocol.
///
/// If you change `totp_service.dart` and these go red, the implementation is
/// wrong. Not the tests.
void main() {
  /// RFC 6238 Appendix B uses the ASCII seed "12345678901234567890", repeated
  /// to fill the key length each hash requires.
  final sha1Secret = Base32.encode(asciiBytes('12345678901234567890'));
  final sha256Secret = Base32.encode(
    asciiBytes('12345678901234567890123456789012'),
  );
  final sha512Secret = Base32.encode(
    asciiBytes(
      '1234567890123456789012345678901234567890123456789012345678901234',
    ),
  );

  DateTime atUnixSeconds(int seconds) =>
      DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true);

  group('Base32 (RFC 4648 section 10 vectors)', () {
    // These pin the alphabet itself. Without them, an encoder and decoder that
    // are wrong in the same way would round-trip happily and still produce
    // codes no other app agrees with.
    test('encodes the reference strings', () {
      expect(Base32.encode(asciiBytes('f')), 'MY');
      expect(Base32.encode(asciiBytes('fo')), 'MZXQ');
      expect(Base32.encode(asciiBytes('foo')), 'MZXW6');
      expect(Base32.encode(asciiBytes('foob')), 'MZXW6YQ');
      expect(Base32.encode(asciiBytes('fooba')), 'MZXW6YTB');
      expect(Base32.encode(asciiBytes('foobar')), 'MZXW6YTBOI');
    });

    test('decodes the reference strings', () {
      expect(ascii.decode(Base32.decode('MY')), 'f');
      expect(ascii.decode(Base32.decode('MZXW6YTBOI')), 'foobar');
      expect(ascii.decode(Base32.decode('MZXW6YTBOI======')), 'foobar');
    });

    test('the RFC 6238 seed encodes to the well-known key', () {
      expect(sha1Secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    });

    test('accepts the messy input real users paste', () {
      final expected = Base32.decode('JBSWY3DPEHPK3PXP');
      expect(Base32.decode('jbswy3dpehpk3pxp'), expected);
      expect(Base32.decode('JBSW Y3DP EHPK 3PXP'), expected);
      expect(Base32.decode('JBSW-Y3DP-EHPK-3PXP'), expected);
      expect(Base32.decode('JBSWY3DPEHPK3PXP===='), expected);
    });

    test('rejects invalid input', () {
      expect(() => Base32.decode(''), throwsA(isA<InvalidSecretException>()));
      // 0, 1 and 8 are deliberately absent from the Base32 alphabet.
      expect(
        () => Base32.decode('JBSW0PXP'),
        throwsA(isA<InvalidSecretException>()),
      );
      expect(Base32.isValid('JBSWY3DPEHPK3PXP'), isTrue);
      expect(Base32.isValid('not base32!'), isFalse);
    });
  });

  group('HOTP (RFC 4226 Appendix D vectors)', () {
    // TOTP is HOTP with the clock as the counter, so the counter-based vectors
    // exercise the same truncation path.
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

    test('produces the reference codes for counters 0-9', () {
      for (var counter = 0; counter < expected.length; counter++) {
        expect(
          TotpService.generateForCounter(secret: sha1Secret, counter: counter),
          expected[counter],
          reason: 'counter $counter',
        );
      }
    });
  });

  group('TOTP (RFC 6238 Appendix B vectors)', () {
    // The RFC tabulates 8-digit codes. Six-digit codes are the same number
    // truncated further, which the next group checks.
    test('SHA-1', () {
      const vectors = {
        59: '94287082',
        1111111109: '07081804',
        1111111111: '14050471',
        1234567890: '89005924',
        2000000000: '69279037',
        20000000000: '65353130',
      };

      vectors.forEach((seconds, code) {
        expect(
          TotpService.generate(
            secret: sha1Secret,
            at: atUnixSeconds(seconds),
            digits: 8,
          ),
          code,
          reason: 'T = $seconds',
        );
      });
    });

    test('SHA-256', () {
      const vectors = {
        59: '46119246',
        1111111109: '68084774',
        1111111111: '67062674',
        1234567890: '91819424',
        2000000000: '90698825',
        20000000000: '77737706',
      };

      vectors.forEach((seconds, code) {
        expect(
          TotpService.generate(
            secret: sha256Secret,
            at: atUnixSeconds(seconds),
            digits: 8,
            algorithm: TotpAlgorithm.sha256,
          ),
          code,
          reason: 'T = $seconds',
        );
      });
    });

    test('SHA-512', () {
      const vectors = {
        59: '90693936',
        1111111109: '25091201',
        1111111111: '99943326',
        1234567890: '93441116',
        2000000000: '38618901',
        20000000000: '47863826',
      };

      vectors.forEach((seconds, code) {
        expect(
          TotpService.generate(
            secret: sha512Secret,
            at: atUnixSeconds(seconds),
            digits: 8,
            algorithm: TotpAlgorithm.sha512,
          ),
          code,
          reason: 'T = $seconds',
        );
      });
    });
  });

  group('Time stepping', () {
    test('the counter advances once per period', () {
      expect(TotpService.counterFor(at: atUnixSeconds(0)), 0);
      expect(TotpService.counterFor(at: atUnixSeconds(29)), 0);
      expect(TotpService.counterFor(at: atUnixSeconds(30)), 1);
      expect(TotpService.counterFor(at: atUnixSeconds(59)), 1);
      expect(TotpService.counterFor(at: atUnixSeconds(60)), 2);
      expect(TotpService.counterFor(at: atUnixSeconds(59), period: 60), 0);
    });

    test('the code is stable within a step and changes across one', () {
      final early = TotpService.generate(
        secret: sha1Secret,
        at: atUnixSeconds(1111111110),
      );
      final late = TotpService.generate(
        secret: sha1Secret,
        at: atUnixSeconds(1111111118),
      );
      final next = TotpService.generate(
        secret: sha1Secret,
        at: atUnixSeconds(1111111140),
      );

      expect(early, late, reason: 'same 30-second window');
      expect(early, isNot(next), reason: 'the window rolled');
    });

    test('timezone cannot change the answer', () {
      // Same instant, different DateTime representations. A code that depends
      // on the device timezone is the most common TOTP bug there is.
      final utc = DateTime.utc(2026, 3, 14, 12, 0, 30);
      final local = utc.toLocal();

      expect(
        TotpService.generate(secret: sha1Secret, at: utc),
        TotpService.generate(secret: sha1Secret, at: local),
      );
    });

    test('secondsRemaining counts down from the period to 1', () {
      expect(TotpService.secondsRemaining(at: atUnixSeconds(0)), 30);
      expect(TotpService.secondsRemaining(at: atUnixSeconds(1)), 29);
      expect(TotpService.secondsRemaining(at: atUnixSeconds(29)), 1);
      expect(TotpService.secondsRemaining(at: atUnixSeconds(30)), 30);
    });

    test('progress runs from 1.0 down towards 0.0', () {
      expect(TotpService.progress(at: atUnixSeconds(0)), 1.0);
      expect(TotpService.progress(at: atUnixSeconds(15)), closeTo(0.5, 0.001));
      expect(
        TotpService.progress(at: atUnixSeconds(29)),
        closeTo(0.0333, 0.001),
      );
    });
  });

  group('Output shape', () {
    test('always returns exactly the requested number of digits', () {
      // Codes with leading zeros are where naive int-to-string conversions
      // break, so sweep a wide range of steps rather than spot-checking.
      for (var counter = 0; counter < 500; counter++) {
        final code = TotpService.generateForCounter(
          secret: sha1Secret,
          counter: counter,
        );
        expect(code.length, 6, reason: 'counter $counter produced "$code"');
        expect(RegExp(r'^\d{6}$').hasMatch(code), isTrue);
      }
    });

    test('produces at least one leading-zero code in that range', () {
      // Guards the guard: if no vector in the sweep starts with 0, the test
      // above proves nothing about padding.
      final hasLeadingZero = List.generate(
        500,
        (counter) => TotpService.generateForCounter(
          secret: sha1Secret,
          counter: counter,
        ),
      ).any((code) => code.startsWith('0'));

      expect(hasLeadingZero, isTrue);
    });

    test('formats for display in two groups of three', () {
      expect(TotpService.formatForDisplay('482931'), '482 931');
      expect(TotpService.formatForDisplay('001234'), '001 234');
      expect(TotpService.formatForDisplay('12345678'), '12345678');
    });

    test('a different secret gives a different code', () {
      final other = Base32.encode(Uint8List.fromList(List.filled(20, 0x2A)));
      expect(
        TotpService.generate(secret: sha1Secret, at: atUnixSeconds(59)),
        isNot(TotpService.generate(secret: other, at: atUnixSeconds(59))),
      );
    });
  });
}
