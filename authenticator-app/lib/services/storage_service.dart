import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:nlr_authenticator/models/device.dart';
import 'package:nlr_authenticator/models/identity.dart';

/// Local persistence for identities and the device record.
///
/// Everything stored here is either non-sensitive (names, dates) or already
/// encrypted (`Identity.encryptedSecret`). `shared_preferences` is a plain file
/// on disk with no protection of its own, so this class must never be handed a
/// plaintext secret - encryption happens one layer up, in
/// `EncryptionService`, before a record ever arrives.
///
/// There is no network code in this file, and none anywhere in the app.
class StorageService {
  StorageService({SharedPreferences? preferences}) : _injected = preferences;

  final SharedPreferences? _injected;
  SharedPreferences? _cached;

  static const String _identitiesKey = 'nlr_identities';
  static const String _deviceKey = 'nlr_device';

  Future<SharedPreferences> get _prefs async {
    final injected = _injected;
    if (injected != null) return injected;
    return _cached ??= await SharedPreferences.getInstance();
  }

  /* --- Identities -------------------------------------------------------- */

  /// Loads every enrolled identity, oldest first.
  ///
  /// A record that fails to parse is skipped rather than thrown: one corrupt
  /// entry should cost the user that entry, not every code on their phone.
  Future<List<Identity>> loadIdentities() async {
    final prefs = await _prefs;
    final raw = prefs.getString(_identitiesKey);

    if (raw == null || raw.isEmpty) return [];

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];

      return decoded
          .whereType<Map<String, dynamic>>()
          .map(_tryParse)
          .nonNulls
          .toList();
    } on FormatException {
      return [];
    }
  }

  static Identity? _tryParse(Map<String, dynamic> json) {
    try {
      final identity = Identity.fromJson(json);
      // A record with no id or no ciphertext cannot generate anything, so it is
      // dropped rather than shown as a permanently broken row.
      if (identity.id.isEmpty || identity.encryptedSecret.isEmpty) return null;
      return identity;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveIdentities(List<Identity> identities) async {
    final prefs = await _prefs;
    final encoded = jsonEncode(identities.map((i) => i.toJson()).toList());
    await prefs.setString(_identitiesKey, encoded);
  }

  Future<void> addIdentity(Identity identity) async {
    final current = await loadIdentities();
    await saveIdentities([...current, identity]);
  }

  Future<void> removeIdentity(String id) async {
    final current = await loadIdentities();
    await saveIdentities(current.where((i) => i.id != id).toList());
  }

  Future<void> clearIdentities() async {
    final prefs = await _prefs;
    await prefs.remove(_identitiesKey);
  }

  /// True when this identity is already enrolled on this device.
  ///
  /// Enrolling the same account twice is almost always an accident - a user
  /// scanning a code they already scanned - and leaves two rows producing
  /// identical codes, which looks like a bug.
  Future<bool> hasIdentityFor(String email) async {
    final identities = await loadIdentities();
    final needle = email.trim().toLowerCase();
    return identities.any((i) => i.email.trim().toLowerCase() == needle);
  }

  /* --- Device ------------------------------------------------------------ */

  /// Loads this device's registration, creating it on first run.
  Future<Device> loadOrCreateDevice() async {
    final prefs = await _prefs;
    final raw = prefs.getString(_deviceKey);

    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) return Device.fromJson(decoded);
      } on FormatException {
        // Fall through and re-register.
      }
    }

    final device = Device(
      id: generateId(prefix: 'dev'),
      name: _defaultDeviceName(),
      registeredAt: DateTime.now(),
      platform: _platformName(),
    );

    await saveDevice(device);
    return device;
  }

  Future<void> saveDevice(Device device) async {
    final prefs = await _prefs;
    await prefs.setString(_deviceKey, jsonEncode(device.toJson()));
  }

  /// Wipes all local state. Used by "Remove everything" in Settings.
  Future<void> clearAll() async {
    final prefs = await _prefs;
    await prefs.remove(_identitiesKey);
    await prefs.remove(_deviceKey);
  }

  /* --- Helpers ----------------------------------------------------------- */

  /// A random identifier.
  ///
  /// `Random.secure()` even though these ids are not secrets: it costs nothing,
  /// and it removes any chance that an id becomes predictable if one is later
  /// used somewhere that matters.
  static String generateId({String prefix = 'id'}) {
    final random = Random.secure();
    final bytes = List<int>.generate(8, (_) => random.nextInt(256));
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${prefix}_$hex';
  }

  static String _platformName() {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return Platform.operatingSystem;
  }

  static String _defaultDeviceName() {
    if (Platform.isAndroid) return 'Android device';
    if (Platform.isIOS) return 'iPhone';
    return 'This device';
  }
}
