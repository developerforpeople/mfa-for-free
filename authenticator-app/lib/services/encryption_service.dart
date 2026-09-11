import 'package:encrypt/encrypt.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the AES key lives.
///
/// A three-method interface rather than depending on `FlutterSecureStorage`
/// directly. Two reasons: the encryption logic becomes testable without a
/// platform channel, and the plugin's large API surface stops leaking into
/// everything that touches a secret.
abstract interface class KeyVault {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// The real vault: Android Keystore / iOS Keychain, via `flutter_secure_storage`.
class SecureStorageVault implements KeyVault {
  const SecureStorageVault([this._storage = _defaultStorage]);

  final FlutterSecureStorage _storage;

  static const _defaultStorage = FlutterSecureStorage(
    // Backs the entry with EncryptedSharedPreferences, whose key material is
    // held by the hardware-backed Keystore where the device has one.
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      // The key must be readable whenever the app is open, but there is no
      // reason for it to sync to another device through the iCloud Keychain.
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// In-memory vault for unit tests. Never used in the app.
class InMemoryKeyVault implements KeyVault {
  final Map<String, String> _values = {};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async => _values[key] = value;

  @override
  Future<void> delete(String key) async => _values.remove(key);
}

/// Thrown when a stored secret cannot be read back.
class DecryptionException implements Exception {
  const DecryptionException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Encryption of secrets at rest.
///
/// ## The design, and why it is shaped this way
///
/// Two stores, with one job each:
///
/// * The [KeyVault] holds **one value**: a 256-bit AES key. On Android that is
///   EncryptedSharedPreferences with key material in the hardware-backed
///   Keystore; on iOS it is the Keychain. The app can ask the OS to use that
///   key, but cannot extract it in the clear.
/// * `shared_preferences` holds the identity records, in which every secret is
///   **already ciphertext** by the time it arrives. A plaintext secret never
///   reaches that file.
///
/// A fair question: the vault could hold the secrets directly, so why the extra
/// layer? Because secure storage is a key-value store with a platform-channel
/// round trip per entry - fine for one key, clumsy for a growing list of
/// structured records. Encrypting the records and putting them in ordinary
/// preferences keeps the data model simple while leaving exactly one thing that
/// must stay secret, in the one place the OS protects properly. It is also the
/// usual shape of this problem: protect a key, then use the key to protect
/// volume.
///
/// ## The honest limitation
///
/// This protects data **at rest**. If the phone is off, or the preferences file
/// is pulled off the disk, the records are useless without the Keystore.
///
/// It does *not* stop an attacker who can already run code as this app on an
/// unlocked, rooted device - they can ask the Keystore to decrypt, exactly as
/// the app does. No client-side scheme solves that one. Defending it is the
/// operating system's job: device encryption, a lock screen, and a biometric
/// gate on the app.
class EncryptionService {
  EncryptionService({KeyVault? vault})
    : _vault = vault ?? const SecureStorageVault();

  final KeyVault _vault;

  /// Versioned, so a future key rotation can tell old entries from new.
  static const String _keyStorageKey = 'nlr_master_key_v1';

  /// Prefix on every ciphertext, for the same reason.
  static const String _formatVersion = 'v1';

  /// AES-256.
  static const int _keyLengthBytes = 32;

  /// GCM's nonce is 96 bits - the size the mode is designed around.
  static const int _ivLengthBytes = 12;

  /// Cached after first load, so showing a list of codes does not make one
  /// platform-channel call per identity.
  Key? _cachedKey;

  /// Loads the AES key, generating one on first run.
  ///
  /// `Key.fromSecureRandom` draws from the platform CSPRNG. Dart's plain
  /// `Random()` would seed predictably, and every secret in the app would be
  /// recoverable by anyone who could guess that seed.
  Future<Key> _loadKey() async {
    final cached = _cachedKey;
    if (cached != null) return cached;

    final stored = await _vault.read(_keyStorageKey);

    if (stored != null && stored.isNotEmpty) {
      final key = Key.fromBase64(stored);
      _cachedKey = key;
      return key;
    }

    final generated = Key.fromSecureRandom(_keyLengthBytes);
    await _vault.write(_keyStorageKey, generated.base64);
    _cachedKey = generated;
    return generated;
  }

  /// Encrypts a secret for storage.
  ///
  /// Returns `v1:<base64 iv>:<base64 ciphertext>`. Storing the IV beside the
  /// ciphertext is normal and safe: a GCM nonce is not secret, it only has to be
  /// **unique**. A fresh one is drawn for every encryption, because reusing a
  /// nonce under one key is a catastrophic break of GCM - it leaks the keystream
  /// and the authentication key, not merely one message.
  Future<String> encryptSecret(String plainSecret) async {
    final key = await _loadKey();
    final iv = IV.fromSecureRandom(_ivLengthBytes);
    final encrypter = Encrypter(AES(key, mode: AESMode.gcm));

    final encrypted = encrypter.encrypt(plainSecret, iv: iv);
    return '$_formatVersion:${iv.base64}:${encrypted.base64}';
  }

  /// Decrypts a stored secret.
  ///
  /// GCM is authenticated encryption: if the stored value was tampered with,
  /// this throws instead of returning plausible-looking garbage. That is the
  /// property plain CBC lacks, and the reason GCM is the right mode here - a
  /// silently corrupted secret would generate wrong codes forever with no
  /// indication of why.
  Future<String> decryptSecret(String storedValue) async {
    final parts = storedValue.split(':');
    if (parts.length != 3 || parts.first != _formatVersion) {
      throw const DecryptionException(
        'Stored secret is not in a known format.',
      );
    }

    try {
      final key = await _loadKey();
      final iv = IV.fromBase64(parts[1]);
      final encrypter = Encrypter(AES(key, mode: AESMode.gcm));

      return encrypter.decrypt64(parts[2], iv: iv);
    } catch (error) {
      // Either the ciphertext was altered, or the key is gone - which happens
      // legitimately on reinstall, since the Keystore entry does not survive
      // one. Both mean the same thing to the user: this enrolment can no longer
      // produce codes, and the identity has to be enrolled again.
      throw DecryptionException(
        'Could not decrypt this secret. The app may have been reinstalled or '
        'restored from a backup. Enrol this identity again. ($error)',
      );
    }
  }

  /// True once a key exists - i.e. at least one enrollment has happened.
  Future<bool> hasKey() async {
    final stored = await _vault.read(_keyStorageKey);
    return stored != null && stored.isNotEmpty;
  }

  /// Destroys the AES key.
  ///
  /// The nuclear option behind "remove everything". Without the key, every
  /// stored secret is unrecoverable ciphertext - which is the point: deleting
  /// one small value reliably destroys all of them at once, with no chance that
  /// a stray record survives the sweep.
  Future<void> destroyKey() async {
    await _vault.delete(_keyStorageKey);
    _cachedKey = null;
  }

  /// Masks a secret for display, e.g. `JBSW•••••••••PXP`.
  ///
  /// Used only where a user must confirm which enrolment they are looking at.
  /// The full secret is never shown again after enrollment.
  static String mask(String secret) {
    if (secret.length <= 8) return '•' * secret.length;
    final head = secret.substring(0, 4);
    final tail = secret.substring(secret.length - 3);
    return '$head${'•' * (secret.length - 7)}$tail';
  }
}
