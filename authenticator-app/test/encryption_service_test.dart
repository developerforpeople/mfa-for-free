import 'package:flutter_test/flutter_test.dart';
import 'package:nlr_authenticator/services/encryption_service.dart';

void main() {
  late InMemoryKeyVault vault;
  late EncryptionService service;

  setUp(() {
    vault = InMemoryKeyVault();
    service = EncryptionService(vault: vault);
  });

  group('Round trip', () {
    test('decrypts back to the original secret', () async {
      const secret = 'JBSWY3DPEHPK3PXP';

      final encrypted = await service.encryptSecret(secret);
      expect(await service.decryptSecret(encrypted), secret);
    });

    test('handles a full-length 32-character secret', () async {
      const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

      final encrypted = await service.encryptSecret(secret);
      expect(await service.decryptSecret(encrypted), secret);
    });
  });

  group('Ciphertext properties', () {
    test('does not contain the plaintext', () async {
      const secret = 'JBSWY3DPEHPK3PXP';
      final encrypted = await service.encryptSecret(secret);

      // The point of the whole exercise. If this ever fails, secrets are
      // sitting readable in shared_preferences.
      expect(encrypted.contains(secret), isFalse);
    });

    test('is versioned and carries its IV', () async {
      final encrypted = await service.encryptSecret('JBSWY3DPEHPK3PXP');
      final parts = encrypted.split(':');

      expect(parts.length, 3);
      expect(parts.first, 'v1');
      expect(parts[1], isNotEmpty, reason: 'IV');
      expect(parts[2], isNotEmpty, reason: 'ciphertext');
    });

    test('uses a fresh IV every time', () async {
      const secret = 'JBSWY3DPEHPK3PXP';

      final first = await service.encryptSecret(secret);
      final second = await service.encryptSecret(secret);

      // Same plaintext, same key, different output. A repeated nonce under one
      // key is a catastrophic break of GCM, so this is not a style preference.
      expect(first, isNot(second));
      expect(first.split(':')[1], isNot(second.split(':')[1]));

      // Both must still decrypt.
      expect(await service.decryptSecret(first), secret);
      expect(await service.decryptSecret(second), secret);
    });
  });

  group('Key management', () {
    test('generates a key on first use and reuses it', () async {
      expect(await service.hasKey(), isFalse);

      await service.encryptSecret('JBSWY3DPEHPK3PXP');
      expect(await service.hasKey(), isTrue);

      final keyAfterFirst = await vault.read('nlr_master_key_v1');
      await service.encryptSecret('MZXW6YTBOI');
      final keyAfterSecond = await vault.read('nlr_master_key_v1');

      expect(keyAfterFirst, keyAfterSecond);
    });

    test('a new service instance reads the same stored key', () async {
      final encrypted = await service.encryptSecret('JBSWY3DPEHPK3PXP');

      // Simulates the app restarting: same vault, fresh in-memory state.
      final restarted = EncryptionService(vault: vault);
      expect(await restarted.decryptSecret(encrypted), 'JBSWY3DPEHPK3PXP');
    });

    test('destroying the key makes existing ciphertext unreadable', () async {
      final encrypted = await service.encryptSecret('JBSWY3DPEHPK3PXP');
      await service.destroyKey();

      // A fresh service generates a *new* key, which cannot decrypt the old
      // ciphertext. That is what makes "remove everything" trustworthy.
      final afterWipe = EncryptionService(vault: vault);
      expect(
        () => afterWipe.decryptSecret(encrypted),
        throwsA(isA<DecryptionException>()),
      );
    });
  });

  group('Tamper detection', () {
    test('rejects a modified ciphertext', () async {
      final encrypted = await service.encryptSecret('JBSWY3DPEHPK3PXP');
      final parts = encrypted.split(':');

      // Flip a character in the ciphertext. GCM authenticates, so this must
      // throw rather than return plausible garbage.
      final body = parts[2];
      final flipped = body[0] == 'A'
          ? 'B${body.substring(1)}'
          : 'A${body.substring(1)}';

      expect(
        () => service.decryptSecret('${parts[0]}:${parts[1]}:$flipped'),
        throwsA(isA<DecryptionException>()),
      );
    });

    test('rejects a swapped IV', () async {
      final first = await service.encryptSecret('JBSWY3DPEHPK3PXP');
      final second = await service.encryptSecret('MZXW6YTBOI');

      final mixed =
          '${first.split(':')[0]}:${second.split(':')[1]}:${first.split(':')[2]}';

      expect(
        () => service.decryptSecret(mixed),
        throwsA(isA<DecryptionException>()),
      );
    });

    test('rejects an unknown format', () async {
      expect(
        () => service.decryptSecret('not-a-ciphertext'),
        throwsA(isA<DecryptionException>()),
      );
      expect(
        () => service.decryptSecret('v9:abc:def'),
        throwsA(isA<DecryptionException>()),
      );
    });
  });

  group('Masking', () {
    test('hides the middle of a secret', () {
      final masked = EncryptionService.mask('JBSWY3DPEHPK3PXP');

      expect(masked.startsWith('JBSW'), isTrue);
      expect(masked.endsWith('PXP'), isTrue);
      expect(masked.contains('Y3DPEHPK3'), isFalse);
      expect(masked.length, 'JBSWY3DPEHPK3PXP'.length);
    });

    test('hides a short secret entirely', () {
      expect(EncryptionService.mask('ABCD'), '••••');
    });
  });
}
