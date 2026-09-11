import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:nlr_authenticator/models/device.dart';
import 'package:nlr_authenticator/models/identity.dart';
import 'package:nlr_authenticator/services/encryption_service.dart';
import 'package:nlr_authenticator/services/qr_service.dart';
import 'package:nlr_authenticator/services/storage_service.dart';
import 'package:nlr_authenticator/services/totp_service.dart';

/// Application state: the enrolled identities, this device, and the live codes.
///
/// A `ChangeNotifier` behind `provider`. It owns the one-second tick that keeps
/// the countdown honest, and the in-memory cache of decrypted secrets.
///
/// ## About that cache
///
/// Generating a code needs the plaintext secret. Decrypting on every frame would
/// mean an async call inside a synchronous build, so secrets are decrypted once
/// and held in memory while the app is in the foreground.
///
/// That is a real, deliberate trade, and every authenticator makes it - a code
/// cannot be computed from ciphertext. What it costs is that the plaintext is in
/// RAM while the app is open. What limits it is [lock]: when the app goes to the
/// background the cache is dropped, so the secrets are not sitting in the memory
/// of a process someone can later inspect. They are re-derived from the Keystore
/// on resume.
///
/// What is never cached, stored, or transmitted is the **code itself**. It is
/// computed for display and recomputed next time.
class IdentityStore extends ChangeNotifier {
  IdentityStore({
    StorageService? storage,
    EncryptionService? encryption,
    this.tickInterval = const Duration(seconds: 1),
  }) : _storage = storage ?? StorageService(),
       _encryption = encryption ?? EncryptionService();

  final StorageService _storage;
  final EncryptionService _encryption;

  /// How often the countdown refreshes. Injectable so tests need not wait.
  final Duration tickInterval;

  Timer? _ticker;

  List<Identity> _identities = const [];
  Device? _device;
  bool _isLoading = true;
  String? _error;

  /// id -> plaintext Base32 secret. Cleared by [lock].
  final Map<String, String> _secretCache = {};

  /// Identities whose stored secret could not be decrypted, by id.
  final Map<String, String> _decryptionErrors = {};

  List<Identity> get identities => List.unmodifiable(_identities);
  Device? get device => _device;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isEmpty => !_isLoading && _identities.isEmpty;

  /// Loads persisted state and starts the countdown.
  Future<void> initialise() async {
    _isLoading = true;
    notifyListeners();

    try {
      _device = await _storage.loadOrCreateDevice();
      _identities = await _storage.loadIdentities();
      await _refreshSecretCache();
      _error = null;
    } catch (error) {
      _error = 'Could not load your identities: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
      _startTicker();
    }
  }

  void _startTicker() {
    _ticker?.cancel();
    // One timer for the whole app rather than one per card. The codes are
    // derived from the clock, so every row changes on the same boundary anyway.
    _ticker = Timer.periodic(tickInterval, (_) {
      if (hasListeners) notifyListeners();
    });
  }

  /// Decrypts every stored secret into the in-memory cache.
  Future<void> _refreshSecretCache() async {
    _secretCache.clear();
    _decryptionErrors.clear();

    for (final identity in _identities) {
      try {
        _secretCache[identity.id] = await _encryption.decryptSecret(
          identity.encryptedSecret,
        );
      } on DecryptionException catch (error) {
        // Recorded per identity, not thrown: one unreadable enrolment must not
        // take the whole list down with it.
        _decryptionErrors[identity.id] = error.message;
      }
    }
  }

  /// The current code for an identity, or null if its secret is unreadable.
  ///
  /// Synchronous on purpose - it is called from `build`.
  String? codeFor(Identity identity) {
    final secret = _secretCache[identity.id];
    if (secret == null) return null;

    try {
      return TotpService.generate(
        secret: secret,
        digits: identity.digits,
        period: identity.period,
        algorithm: identity.algorithm,
      );
    } on InvalidSecretException {
      return null;
    }
  }

  /// Seconds until [identity]'s code rolls.
  int secondsRemaining(Identity identity) =>
      TotpService.secondsRemaining(period: identity.period);

  /// Countdown progress, 1.0 down to 0.0.
  double progressFor(Identity identity) =>
      TotpService.progress(period: identity.period);

  /// Why this identity cannot produce a code, if it cannot.
  String? decryptionErrorFor(Identity identity) =>
      _decryptionErrors[identity.id];

  /// Enrols a scanned payload.
  ///
  /// The order matters: the secret is encrypted **before** an `Identity` is
  /// constructed, so no object that gets persisted ever holds the plaintext.
  /// The plaintext exists as a parameter and a local, and nowhere else.
  ///
  /// Set [replaceExisting] when the account is already enrolled here. Scanning
  /// a fresh QR for an identity you already hold means the website issued a new
  /// secret, and the old one is dead - keeping it would leave the app showing
  /// codes that look perfectly valid and can never work.
  Future<Identity> enrol({
    required EnrollmentPayload payload,
    String? displayName,
    String? deviceName,
    bool replaceExisting = false,
  }) async {
    if (replaceExisting) {
      await removeByEmail(payload.accountName);
    }

    final encrypted = await _encryption.encryptSecret(payload.secret);

    final identity = Identity(
      id: StorageService.generateId(prefix: 'idn'),
      name: (displayName ?? _nameFromAccount(payload.accountName)).trim(),
      email: payload.accountName,
      encryptedSecret: encrypted,
      createdDate: DateTime.now(),
      deviceName: deviceName ?? _device?.name ?? 'This device',
      issuer: payload.issuer,
      digits: payload.digits,
      period: payload.period,
      algorithm: payload.algorithm,
    );

    await _storage.addIdentity(identity);
    _identities = [..._identities, identity];
    _secretCache[identity.id] = payload.secret;

    notifyListeners();
    return identity;
  }

  /// Removes every enrolment for an identity.
  ///
  /// Used when re-enrolling: the new secret supersedes the old one, and leaving
  /// the stale entry behind is how a user ends up reading codes from a dead
  /// enrolment and blaming the website for rejecting them.
  Future<void> removeByEmail(String email) async {
    final needle = email.trim().toLowerCase();
    final doomed = _identities
        .where((i) => i.email.trim().toLowerCase() == needle)
        .toList();

    for (final identity in doomed) {
      await remove(identity.id);
    }
  }

  /// True when this account is already enrolled here.
  bool isAlreadyEnrolled(String email) {
    final needle = email.trim().toLowerCase();
    return _identities.any((i) => i.email.trim().toLowerCase() == needle);
  }

  Identity? byId(String id) {
    for (final identity in _identities) {
      if (identity.id == id) return identity;
    }
    return null;
  }

  /// Removes one enrolment.
  ///
  /// The secret goes with it, and it is not recoverable from this app - which is
  /// the honest behaviour for a second factor. Re-enrolling means scanning a new
  /// QR code from the website.
  Future<void> remove(String id) async {
    await _storage.removeIdentity(id);
    _identities = _identities.where((i) => i.id != id).toList();
    _secretCache.remove(id);
    _decryptionErrors.remove(id);
    notifyListeners();
  }

  /// Removes every enrolment and destroys the AES key.
  ///
  /// Destroying the key matters: it guarantees that any ciphertext left behind
  /// in a file the app did not manage to overwrite is permanently unreadable.
  Future<void> removeAll() async {
    await _storage.clearIdentities();
    await _encryption.destroyKey();
    _identities = const [];
    _secretCache.clear();
    _decryptionErrors.clear();
    notifyListeners();
  }

  Future<void> renameDevice(String name) async {
    final current = _device;
    if (current == null) return;

    final updated = current.copyWith(name: name.trim());
    await _storage.saveDevice(updated);
    _device = updated;
    notifyListeners();
  }

  /// Drops decrypted secrets from memory.
  ///
  /// Called when the app is backgrounded. Pairs with [unlock] on resume.
  void lock() {
    if (_secretCache.isEmpty) return;
    _secretCache.clear();
    notifyListeners();
  }

  /// Re-derives the secret cache after a [lock].
  Future<void> unlock() async {
    if (_secretCache.isNotEmpty || _identities.isEmpty) return;
    await _refreshSecretCache();
    notifyListeners();
  }

  /// `john@nlr.com` -> `John`. A reasonable first guess at a display name that
  /// the user can correct during enrollment.
  static String _nameFromAccount(String account) {
    final localPart = account.split('@').first.trim();
    if (localPart.isEmpty) return account;

    final cleaned = localPart.replaceAll(RegExp(r'[._-]+'), ' ').trim();
    return cleaned
        .split(RegExp(r'\s+'))
        .map(
          (word) => word.isEmpty
              ? word
              : '${word[0].toUpperCase()}${word.substring(1)}',
        )
        .join(' ');
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _secretCache.clear();
    super.dispose();
  }
}
