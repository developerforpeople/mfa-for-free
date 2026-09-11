import 'package:flutter_test/flutter_test.dart';
import 'package:nlr_authenticator/services/qr_service.dart';
import 'package:nlr_authenticator/services/totp_service.dart';

void main() {
  group('Parsing a valid enrollment', () {
    test('reads the example from the project brief', () {
      final payload = QrService.parse(
        'otpauth://totp/NLR%20Identity:john@nlr.com?secret=JBSWY3DPEHPK3PXP',
      );

      expect(payload.accountName, 'john@nlr.com');
      expect(payload.secret, 'JBSWY3DPEHPK3PXP');
      expect(payload.issuer, 'NLR Identity');
    });

    test('reads a fully specified URI', () {
      final payload = QrService.parse(
        'otpauth://totp/NLR%20Identity:john@nlr.com'
        '?secret=JBSWY3DPEHPK3PXP&issuer=NLR%20Identity'
        '&algorithm=SHA256&digits=8&period=60',
      );

      expect(payload.secret, 'JBSWY3DPEHPK3PXP');
      expect(payload.accountName, 'john@nlr.com');
      expect(payload.issuer, 'NLR Identity');
      expect(payload.algorithm, TotpAlgorithm.sha256);
      expect(payload.digits, 8);
      expect(payload.period, 60);
    });

    test('falls back to the documented defaults', () {
      final payload = QrService.parse(
        'otpauth://totp/john@nlr.com?secret=JBSWY3DPEHPK3PXP',
      );

      expect(payload.digits, 6);
      expect(payload.period, 30);
      expect(payload.algorithm, TotpAlgorithm.sha1);
      expect(payload.issuer, 'NLR Identity');
    });

    test('handles a label with no issuer prefix', () {
      final payload = QrService.parse(
        'otpauth://totp/john@nlr.com?secret=JBSWY3DPEHPK3PXP',
      );

      expect(payload.accountName, 'john@nlr.com');
    });

    test('prefers the issuer parameter over the label prefix', () {
      // The Key Uri Format says the parameter wins where both are present.
      final payload = QrService.parse(
        'otpauth://totp/OldName:john@nlr.com'
        '?secret=JBSWY3DPEHPK3PXP&issuer=NLR%20Identity',
      );

      expect(payload.issuer, 'NLR Identity');
      expect(payload.accountName, 'john@nlr.com');
    });

    test('keeps a colon that belongs to the account name', () {
      // Only the first colon separates issuer from account. Splitting on all of
      // them mangles accounts that legitimately contain one.
      final payload = QrService.parse(
        'otpauth://totp/Issuer:weird:name@nlr.com?secret=JBSWY3DPEHPK3PXP',
      );

      expect(payload.accountName, 'weird:name@nlr.com');
      expect(payload.issuer, 'Issuer');
    });

    test('tolerates surrounding whitespace', () {
      final payload = QrService.parse(
        '  otpauth://totp/NLR%20Identity:john@nlr.com?secret=JBSWY3DPEHPK3PXP  ',
      );

      expect(payload.secret, 'JBSWY3DPEHPK3PXP');
    });

    test('ignores a malformed digits value rather than failing', () {
      final payload = QrService.parse(
        'otpauth://totp/john@nlr.com?secret=JBSWY3DPEHPK3PXP&digits=abc&period=-5',
      );

      expect(payload.digits, 6);
      expect(payload.period, 30);
    });
  });

  group('Rejecting bad input', () {
    test('rejects an empty string', () {
      expect(() => QrService.parse(''), throwsA(isA<QrParseException>()));
    });

    test('rejects a plain URL', () {
      expect(
        () => QrService.parse('https://example.com'),
        throwsA(isA<QrParseException>()),
      );
    });

    test('rejects HOTP with a specific explanation', () {
      // A real format this app genuinely cannot handle - the message should say
      // which, not just "invalid".
      expect(
        () => QrService.parse(
          'otpauth://hotp/john@nlr.com?secret=JBSWY3DPEHPK3PXP&counter=0',
        ),
        throwsA(
          isA<QrParseException>().having(
            (e) => e.message,
            'message',
            contains('counter-based'),
          ),
        ),
      );
    });

    test('rejects a missing secret', () {
      expect(
        () => QrService.parse('otpauth://totp/john@nlr.com'),
        throwsA(isA<QrParseException>()),
      );
    });

    test('rejects a secret that is not Base32', () {
      // Caught at enrollment rather than at first use. Otherwise the user finds
      // out when the website rejects a code they cannot generate.
      expect(
        () => QrService.parse('otpauth://totp/john@nlr.com?secret=0189!!'),
        throwsA(
          isA<QrParseException>().having(
            (e) => e.message,
            'message',
            contains('Base32'),
          ),
        ),
      );
    });
  });

  group('looksLikeEnrollment', () {
    test('accepts otpauth URIs and rejects everything else', () {
      expect(
        QrService.looksLikeEnrollment('otpauth://totp/a?secret=MZXW6YTBOI'),
        isTrue,
      );
      expect(QrService.looksLikeEnrollment('https://nlr.com'), isFalse);
      expect(QrService.looksLikeEnrollment('WIFI:S:MyNetwork;;'), isFalse);
      expect(QrService.looksLikeEnrollment('just some text'), isFalse);
    });
  });

  group('Building a URI', () {
    test('round-trips through the parser', () {
      final uri = QrService.build(
        secret: 'JBSWY3DPEHPK3PXP',
        accountName: 'john@nlr.com',
      );

      final payload = QrService.parse(uri);
      expect(payload.secret, 'JBSWY3DPEHPK3PXP');
      expect(payload.accountName, 'john@nlr.com');
      expect(payload.issuer, 'NLR Identity');
    });

    test('percent-encodes spaces rather than using plus', () {
      final uri = QrService.build(
        secret: 'JBSWY3DPEHPK3PXP',
        accountName: 'john@nlr.com',
      );

      // `+` means a space only under form encoding. An authenticator using a
      // plain URI parser would display "NLR+Identity".
      expect(uri.contains('+'), isFalse);
      expect(uri.contains('NLR%20Identity'), isTrue);
    });

    test('matches the shape the demo website produces', () {
      final uri = QrService.build(
        secret: 'JBSWY3DPEHPK3PXP',
        accountName: 'john@nlr.com',
      );

      expect(
        uri.startsWith('otpauth://totp/NLR%20Identity:john%40nlr.com?'),
        isTrue,
      );
      expect(uri, contains('algorithm=SHA1'));
      expect(uri, contains('digits=6'));
      expect(uri, contains('period=30'));
    });
  });

  group('End to end', () {
    test('a parsed payload generates a verifiable code', () {
      // The full enrollment path: the website builds a URI, the app parses it,
      // and the secret that comes out produces the RFC's published code.
      const seedSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

      final uri = QrService.build(
        secret: seedSecret,
        accountName: 'john@nlr.com',
      );
      final payload = QrService.parse(uri);

      final code = TotpService.generate(
        secret: payload.secret,
        at: DateTime.fromMillisecondsSinceEpoch(59 * 1000, isUtc: true),
        digits: 8,
        algorithm: payload.algorithm,
        period: payload.period,
      );

      expect(code, '94287082');
    });
  });
}
