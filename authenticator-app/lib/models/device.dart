import 'package:nlr_authenticator/models/identity.dart';

/// This installation, as a registered authenticator device.
///
/// "Device" in NLR Identity means the phone holding the secret - the *something
/// you have*. There is exactly one of these per install, and it exists to make
/// that idea concrete rather than implicit: enrolments belong to a device, and
/// revoking a device is what makes its codes stop counting.
///
/// A deliberate limitation, stated plainly: the relying party (the website) is
/// not told about this record, because Phase 3 has no backend and the app makes
/// no network calls. Registration here is **local bookkeeping**. In a complete
/// system the device id would be sent during enrollment, and the server's copy -
/// not this one - would be what revocation actually acts on.
class Device {
  const Device({
    required this.id,
    required this.name,
    required this.registeredAt,
    required this.platform,
  });

  /// Random, generated on first run. Not a hardware identifier.
  ///
  /// Deliberately not the Android ID, IMEI, or advertising id: a stable hardware
  /// identifier is a tracking vector, needs a permission, and buys nothing here.
  /// A random value made at install time identifies the install, which is all
  /// that is being identified.
  final String id;

  /// User-editable label, e.g. `John Phone`.
  final String name;

  final DateTime registeredAt;

  /// `android`, `ios`, or whatever the host reports.
  final String platform;

  Device copyWith({String? name}) => Device(
    id: id,
    name: name ?? this.name,
    registeredAt: registeredAt,
    platform: platform,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'registeredAt': registeredAt.toIso8601String(),
    'platform': platform,
  };

  factory Device.fromJson(Map<String, dynamic> json) => Device(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? 'This device',
    registeredAt:
        DateTime.tryParse(json['registeredAt'] as String? ?? '') ??
        DateTime.now(),
    platform: json['platform'] as String? ?? 'unknown',
  );

  /// The short form shown under the device name, e.g. `android · 3 identities`.
  String summary(List<Identity> identities) {
    final count = identities.length;
    final noun = count == 1 ? 'identity' : 'identities';
    return '$platform · $count $noun';
  }

  @override
  String toString() => 'Device($id, $name)';
}
