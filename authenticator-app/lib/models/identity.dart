import 'package:nlr_authenticator/services/totp_service.dart';

/// An enrolled NLR Identity.
///
/// One record per account this device can generate codes for. The shape follows
/// the storage model in the project brief:
///
/// ```
/// { id, name, email, encryptedSecret, createdDate, deviceName }
/// ```
///
/// with the TOTP parameters added. Those are not decoration: an `otpauth://` URI
/// may specify 8 digits, a 60-second period, or SHA-256, and an authenticator
/// that assumes the defaults silently produces wrong codes for those accounts.
/// The parameters belong to the enrolment, so they are stored with it.
///
/// **The field is `encryptedSecret`, and there is deliberately no `secret`.**
/// A type that cannot hold a plaintext secret cannot accidentally persist one.
/// Decryption happens at the moment a code is generated, and the plaintext lives
/// only as a local variable inside that call.
class Identity {
  const Identity({
    required this.id,
    required this.name,
    required this.email,
    required this.encryptedSecret,
    required this.createdDate,
    required this.deviceName,
    this.issuer = 'NLR Identity',
    this.digits = TotpService.defaultDigits,
    this.period = TotpService.defaultPeriod,
    this.algorithm = TotpAlgorithm.sha1,
  });

  /// Locally generated. Not from the server - this record never leaves the phone.
  final String id;

  /// Display name, e.g. `John Doe`.
  final String name;

  /// The NLR Identity, e.g. `john@nlr.com`.
  final String email;

  /// AES-GCM ciphertext: `v1:<iv>:<ciphertext>`. Never the raw secret.
  final String encryptedSecret;

  final DateTime createdDate;

  /// The device this was enrolled on, e.g. `John Phone`. Lets one person tell
  /// two enrolments of the same identity apart.
  final String deviceName;

  final String issuer;
  final int digits;
  final int period;
  final TotpAlgorithm algorithm;

  /// The label shown in lists: `John Doe` if known, otherwise the identity.
  String get displayName => name.trim().isEmpty ? email : name.trim();

  Identity copyWith({String? name, String? deviceName}) {
    return Identity(
      id: id,
      name: name ?? this.name,
      email: email,
      encryptedSecret: encryptedSecret,
      createdDate: createdDate,
      deviceName: deviceName ?? this.deviceName,
      issuer: issuer,
      digits: digits,
      period: period,
      algorithm: algorithm,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'encryptedSecret': encryptedSecret,
    'createdDate': createdDate.toIso8601String(),
    'deviceName': deviceName,
    'issuer': issuer,
    'digits': digits,
    'period': period,
    'algorithm': algorithm.label,
  };

  /// Rebuilds a record from storage.
  ///
  /// Every field is read defensively. Stored JSON is data from a previous
  /// version of this app, and a record written before a field existed must not
  /// crash the list of codes on upgrade.
  factory Identity.fromJson(Map<String, dynamic> json) {
    return Identity(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      encryptedSecret: json['encryptedSecret'] as String? ?? '',
      createdDate:
          DateTime.tryParse(json['createdDate'] as String? ?? '') ??
          DateTime.now(),
      deviceName: json['deviceName'] as String? ?? 'This device',
      issuer: json['issuer'] as String? ?? 'NLR Identity',
      digits: (json['digits'] as num?)?.toInt() ?? TotpService.defaultDigits,
      period: (json['period'] as num?)?.toInt() ?? TotpService.defaultPeriod,
      algorithm: TotpAlgorithm.fromLabel(json['algorithm'] as String?),
    );
  }

  @override
  bool operator ==(Object other) => other is Identity && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'Identity($id, $email)';
  // Note: no secret in toString(). Objects end up in logs and crash reports,
  // and a secret that reaches a log has left the device.
}
