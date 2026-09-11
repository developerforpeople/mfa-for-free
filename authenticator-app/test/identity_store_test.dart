import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nlr_authenticator/models/identity.dart';
import 'package:nlr_authenticator/services/encryption_service.dart';
import 'package:nlr_authenticator/services/qr_service.dart';
import 'package:nlr_authenticator/services/storage_service.dart';
import 'package:nlr_authenticator/state/identity_store.dart';

/// Store and persistence behaviour.
///
/// These are the tests that check the security properties actually hold once the
/// pieces are assembled - in particular, that nothing writes a plaintext secret
/// to disk.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  late InMemoryKeyVault vault;
  late IdentityStore store;
  late StorageService storage;

  EnrollmentPayload payloadFor(String account) =>
      QrService.parse(QrService.build(secret: secret, accountName: account));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();

    vault = InMemoryKeyVault();
    storage = StorageService(preferences: prefs);
    store = IdentityStore(
      storage: storage,
      encryption: EncryptionService(vault: vault),
      // Long, so the periodic ticker does not fire during a test.
      tickInterval: const Duration(minutes: 5),
    );

    await store.initialise();
  });

  tearDown(() => store.dispose());

  group('Enrollment', () {
    test('starts empty and registers a device', () {
      expect(store.identities, isEmpty);
      expect(store.isEmpty, isTrue);
      expect(store.device, isNotNull);
      expect(store.device!.id, startsWith('dev_'));
    });

    test('adds an identity and produces a code for it', () async {
      final identity = await store.enrol(payload: payloadFor('john@nlr.com'));

      expect(store.identities, hasLength(1));
      expect(identity.email, 'john@nlr.com');
      expect(store.codeFor(identity), matches(RegExp(r'^\d{6}$')));
    });

    test('derives a display name from the account', () async {
      final identity = await store.enrol(
        payload: payloadFor('john.doe@nlr.com'),
      );
      expect(identity.name, 'John Doe');
    });

    test('honours an explicit display name', () async {
      final identity = await store.enrol(
        payload: payloadFor('john@nlr.com'),
        displayName: 'John Doe',
        deviceName: 'John Phone',
      );

      expect(identity.name, 'John Doe');
      expect(identity.deviceName, 'John Phone');
    });

    test('detects an account that is already enrolled', () async {
      await store.enrol(payload: payloadFor('john@nlr.com'));

      expect(store.isAlreadyEnrolled('john@nlr.com'), isTrue);
      expect(store.isAlreadyEnrolled('JOHN@NLR.COM'), isTrue);
      expect(store.isAlreadyEnrolled('sarah@nlr.com'), isFalse);
    });
  });

  group('The plaintext secret never reaches disk', () {
    test('the stored record holds ciphertext, not the secret', () async {
      await store.enrol(payload: payloadFor('john@nlr.com'));

      final stored = await storage.loadIdentities();
      expect(stored, hasLength(1));
      expect(stored.first.encryptedSecret, isNot(contains(secret)));
      expect(stored.first.encryptedSecret, startsWith('v1:'));
    });

    test('no persisted field anywhere contains the secret', () async {
      await store.enrol(payload: payloadFor('john@nlr.com'));

      // Read the raw preferences the way an attacker with the file would.
      final prefs = await SharedPreferences.getInstance();
      final everything = prefs
          .getKeys()
          .map((key) => prefs.get(key).toString())
          .join('\n');

      expect(
        everything.contains(secret),
        isFalse,
        reason: 'A plaintext secret was found in shared_preferences',
      );
    });

    test('toString does not leak the secret', () async {
      final identity = await store.enrol(payload: payloadFor('john@nlr.com'));

      // Objects end up in logs and crash reports.
      expect(identity.toString(), isNot(contains(secret)));
      expect(identity.toString(), isNot(contains(identity.encryptedSecret)));
    });
  });

  group('Multiple identities', () {
    test('supports several accounts at once', () async {
      await store.enrol(
        payload: payloadFor('john@nlr.com'),
        displayName: 'John Doe',
        deviceName: 'John Phone',
      );
      await store.enrol(
        payload: payloadFor('sarah@nlr.com'),
        displayName: 'Sarah Lee',
        deviceName: 'Sarah Tablet',
      );

      expect(store.identities, hasLength(2));
      expect(
        store.identities.map((i) => i.email),
        containsAll(['john@nlr.com', 'sarah@nlr.com']),
      );
      for (final identity in store.identities) {
        expect(store.codeFor(identity), matches(RegExp(r'^\d{6}$')));
      }
    });

    test('removing one leaves the others working', () async {
      final john = await store.enrol(payload: payloadFor('john@nlr.com'));
      final sarah = await store.enrol(payload: payloadFor('sarah@nlr.com'));

      await store.remove(john.id);

      expect(store.identities, hasLength(1));
      expect(store.byId(john.id), isNull);
      expect(store.codeFor(sarah), isNotNull);
      expect(await storage.loadIdentities(), hasLength(1));
    });

    test('removeAll clears everything and destroys the key', () async {
      await store.enrol(payload: payloadFor('john@nlr.com'));
      await store.enrol(payload: payloadFor('sarah@nlr.com'));

      await store.removeAll();

      expect(store.identities, isEmpty);
      expect(await storage.loadIdentities(), isEmpty);
      expect(await vault.read('nlr_master_key_v1'), isNull);
    });
  });

  group('Persistence across a restart', () {
    test('identities survive and still generate codes', () async {
      await store.enrol(
        payload: payloadFor('john@nlr.com'),
        displayName: 'John Doe',
      );
      final originalCode = store.codeFor(store.identities.first);

      // A new store over the same storage and the same vault - what happens
      // when the app is closed and reopened.
      final restarted = IdentityStore(
        storage: storage,
        encryption: EncryptionService(vault: vault),
        tickInterval: const Duration(minutes: 5),
      );
      await restarted.initialise();

      expect(restarted.identities, hasLength(1));
      expect(restarted.identities.first.email, 'john@nlr.com');
      expect(restarted.identities.first.name, 'John Doe');
      // Same secret, same 30-second window, so the same code.
      expect(restarted.codeFor(restarted.identities.first), originalCode);

      restarted.dispose();
    });

    test('the device registration is stable across restarts', () async {
      final originalId = store.device!.id;

      final restarted = IdentityStore(
        storage: storage,
        encryption: EncryptionService(vault: vault),
        tickInterval: const Duration(minutes: 5),
      );
      await restarted.initialise();

      expect(restarted.device!.id, originalId);
      restarted.dispose();
    });

    test('a lost key leaves a readable list but no codes', () async {
      final identity = await store.enrol(payload: payloadFor('john@nlr.com'));
      await vault.delete('nlr_master_key_v1');

      // Simulates a reinstall: records survive, the Keystore entry does not.
      final restarted = IdentityStore(
        storage: storage,
        encryption: EncryptionService(vault: vault),
        tickInterval: const Duration(minutes: 5),
      );
      await restarted.initialise();

      // The row is still listed, with an explanation, rather than the whole
      // screen failing.
      expect(restarted.identities, hasLength(1));
      expect(restarted.codeFor(restarted.identities.first), isNull);
      expect(
        restarted.decryptionErrorFor(restarted.identities.first),
        isNotNull,
      );
      expect(identity.email, 'john@nlr.com');

      restarted.dispose();
    });
  });

  group('Locking', () {
    test('lock clears codes and unlock restores them', () async {
      final identity = await store.enrol(payload: payloadFor('john@nlr.com'));
      expect(store.codeFor(identity), isNotNull);

      // What happens when the app is backgrounded.
      store.lock();
      expect(store.codeFor(identity), isNull);

      await store.unlock();
      expect(store.codeFor(identity), isNotNull);
    });
  });

  group('Device', () {
    test('can be renamed, and the name persists', () async {
      await store.renameDevice('John Phone');
      expect(store.device!.name, 'John Phone');

      final reloaded = await storage.loadOrCreateDevice();
      expect(reloaded.name, 'John Phone');
    });
  });

  group('Corrupt storage', () {
    test(
      'a record with no ciphertext is skipped rather than crashing',
      () async {
        await storage.saveIdentities([
          Identity(
            id: 'idn_broken',
            name: 'Broken',
            email: 'broken@nlr.com',
            encryptedSecret: '',
            createdDate: DateTime.now(),
            deviceName: 'Test',
          ),
        ]);

        expect(await storage.loadIdentities(), isEmpty);
      },
    );
  });
}
