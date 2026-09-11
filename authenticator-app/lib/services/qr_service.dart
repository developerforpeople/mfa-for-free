import 'package:nlr_authenticator/services/totp_service.dart';

/// What a scanned enrollment QR code contains, once parsed.
class EnrollmentPayload {
  const EnrollmentPayload({
    required this.secret,
    required this.accountName,
    required this.issuer,
    required this.digits,
    required this.period,
    required this.algorithm,
  });

  /// Base32 shared secret. Held in memory only long enough to be encrypted.
  final String secret;

  /// The account half of the label, e.g. `john@nlr.com`.
  final String accountName;

  /// The service, e.g. `NLR Identity`.
  final String issuer;

  final int digits;
  final int period;
  final TotpAlgorithm algorithm;

  @override
  String toString() =>
      'EnrollmentPayload($issuer:$accountName, $digits digits, ${period}s)';
  // Again: no secret in toString().
}

/// Raised when a scanned code is not a usable enrollment.
class QrParseException implements Exception {
  const QrParseException(this.message);

  /// Written for a user standing in front of a QR code, not for a log file.
  final String message;

  @override
  String toString() => message;
}

/// Parses `otpauth://` provisioning URIs.
///
/// The format is the de-facto Key Uri Format that every authenticator
/// implements:
///
/// ```
/// otpauth://totp/NLR%20Identity:john@nlr.com?secret=JBSWY3DPEHPK3PXP
///     &issuer=NLR%20Identity&algorithm=SHA1&digits=6&period=30
/// ```
///
/// Parsing is where an authenticator meets input it did not create, so this is
/// written to be strict about what it accepts and specific about what it
/// rejects. "Invalid QR code" helps nobody standing at an enrollment screen.
abstract final class QrService {
  /// Parses a scanned string into an enrollment.
  ///
  /// Throws [QrParseException] with a message fit to show the user.
  static EnrollmentPayload parse(String raw) {
    final text = raw.trim();

    if (text.isEmpty) {
      throw const QrParseException('That QR code was empty.');
    }

    final uri = Uri.tryParse(text);

    if (uri == null || uri.scheme.toLowerCase() != 'otpauth') {
      throw const QrParseException(
        'That is not an authenticator QR code. Look for the enrollment code on '
        'the NLR Identity website, under Set up MFA.',
      );
    }

    // `otpauth://hotp/...` is the counter-based variant. It is a real format,
    // but its codes advance on use rather than on the clock, so this app cannot
    // handle it - and saying so is more useful than a generic rejection.
    if (uri.host.toLowerCase() == 'hotp') {
      throw const QrParseException(
        'This is a counter-based (HOTP) code. NLR Authenticator supports '
        'time-based (TOTP) codes only.',
      );
    }

    if (uri.host.toLowerCase() != 'totp') {
      throw QrParseException(
        'Unsupported code type "${uri.host}". Expected a TOTP enrollment.',
      );
    }

    final params = uri.queryParameters;

    final secret = (params['secret'] ?? '').trim();
    if (secret.isEmpty) {
      throw const QrParseException('That code has no secret in it.');
    }

    // Validate before enrolling. A secret that is not decodable produces an
    // identity that can never generate a code, and the user would not find out
    // until the website rejected them.
    if (!Base32.isValid(secret)) {
      throw const QrParseException(
        'The secret in that code is not valid Base32 and cannot be used.',
      );
    }

    final label = _decodeLabel(uri);
    final issuerParam = params['issuer']?.trim();

    return EnrollmentPayload(
      secret: secret,
      accountName: label.account,
      // The issuer appears twice in this format - as the label prefix and as a
      // query parameter. The parameter wins where both exist, which is what the
      // Key Uri Format specifies.
      issuer: _firstNonEmpty([issuerParam, label.issuer]) ?? 'NLR Identity',
      digits: _positiveIntOr(params['digits'], TotpService.defaultDigits),
      period: _positiveIntOr(params['period'], TotpService.defaultPeriod),
      algorithm: TotpAlgorithm.fromLabel(params['algorithm']),
    );
  }

  /// True when [raw] looks like something this app can enrol.
  ///
  /// Used by the scanner to ignore the many non-enrollment QR codes a camera
  /// will happen to see, without flashing an error for each one.
  static bool looksLikeEnrollment(String raw) {
    final uri = Uri.tryParse(raw.trim());
    return uri != null && uri.scheme.toLowerCase() == 'otpauth';
  }

  /// Builds a provisioning URI. Used by tests and the manual-entry preview.
  static String build({
    required String secret,
    required String accountName,
    String issuer = 'NLR Identity',
    int digits = TotpService.defaultDigits,
    int period = TotpService.defaultPeriod,
    TotpAlgorithm algorithm = TotpAlgorithm.sha1,
  }) {
    final label =
        '${Uri.encodeComponent(issuer)}:${Uri.encodeComponent(accountName)}';

    final query = <String, String>{
      'secret': secret,
      'issuer': issuer,
      'algorithm': algorithm.label,
      'digits': '$digits',
      'period': '$period',
    };

    // Built by hand rather than with Uri(): Uri's query encoding turns a space
    // into `+`, which is correct for form submission and wrong here. An
    // authenticator reading this with a plain URI parser would show the issuer
    // as "NLR+Identity".
    final encoded = query.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');

    return 'otpauth://totp/$label?$encoded';
  }

  /// Splits the `Issuer:account` label.
  ///
  /// The path arrives as `/NLR%20Identity:john@nlr.com`. Only the **first**
  /// colon separates issuer from account: an account name may legitimately
  /// contain one, and splitting on all of them mangles it.
  static ({String issuer, String account}) _decodeLabel(Uri uri) {
    // `pathSegments` percent-decodes for us.
    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    final label = segments.isEmpty ? '' : segments.join('/');

    if (label.isEmpty) {
      return (issuer: '', account: '');
    }

    final separator = label.indexOf(':');
    if (separator < 0) {
      // No issuer prefix - the whole label is the account.
      return (issuer: '', account: label.trim());
    }

    return (
      issuer: label.substring(0, separator).trim(),
      account: label.substring(separator + 1).trim(),
    );
  }

  static String? _firstNonEmpty(List<String?> values) {
    for (final value in values) {
      if (value != null && value.trim().isNotEmpty) return value.trim();
    }
    return null;
  }

  /// Parses a positive integer, falling back on anything unusable.
  ///
  /// A malformed `digits=abc` should not fail an otherwise valid enrollment -
  /// the sensible reading is that the issuer meant the default.
  static int _positiveIntOr(String? raw, int fallback) {
    final parsed = int.tryParse(raw?.trim() ?? '');
    if (parsed == null || parsed <= 0) return fallback;
    return parsed;
  }
}
